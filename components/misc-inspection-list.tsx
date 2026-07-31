"use client"

import React, { useState, useEffect, useMemo } from "react"
import { getFromCache, saveToCache, mergePatchToCache } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { MiscInspectionRecord, InspectionCategory, InspectionPriority, InspectionStatus } from "@/lib/misc-inspection-types"
import { MiscInspectionStats } from "@/components/misc-inspection-stats"
import { MiscInspectionCreateForm } from "@/components/misc-inspection-create-form"
import { MiscInspectionUpdateForm } from "@/components/misc-inspection-update-form"
import { MiscInspectionViewDialog } from "@/components/misc-inspection-view-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  ClipboardList,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Camera,
  ShieldCheck,
  Trash2,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  LayoutGrid,
  List,
  Filter,
  Loader2,
  X,
  Compass,
  Gauge,
  Zap,
  RadioTower,
  FileText,
  FileCheck2,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
} from "lucide-react"

interface MiscInspectionListProps {
  role: string
  agencies?: string[]
  permissions?: Record<string, string[]>
}

const CATEGORY_CHIPS = [
  { id: "all", label: "All Categories" },
  { id: "SHIFTING", label: "Shifting", icon: Compass },
  { id: "METER_CHECK", label: "Meter Check", icon: Gauge },
  { id: "NETWORK_LINE", label: "Network Line", icon: Zap },
  { id: "DTR_LOAD", label: "DTR Load", icon: RadioTower },
  { id: "NSC_DRAWING", label: "NSC Drawing", icon: FileCheck2 },
  { id: "GENERAL", label: "General Office", icon: FileText },
]

export function MiscInspectionList({ role, agencies = [], permissions }: MiscInspectionListProps) {
  const [records, setRecords] = useState<MiscInspectionRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & State
  const [subTab, setSubTab] = useState<"all" | "pending" | "inspected" | "finalized" | "rejected">("pending")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedPriority, setSelectedPriority] = useState<string>("all")
  const [selectedAgency, setSelectedAgency] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"card" | "list">("card")

  // Views & Modals
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<MiscInspectionRecord | null>(null)

  const isAgencyRole = role.toLowerCase() === "agency" || role.toLowerCase().includes("agency")
  const isAdminOrExec =
    role.toLowerCase() === "admin" ||
    role.toLowerCase() === "executive" ||
    role.toLowerCase() === "superuser"

  const canCreate = isAdminOrExec || !!(permissions?.misc_inspection?.includes("create"))
  const canInspect = isAgencyRole || isAdminOrExec || !!(permissions?.misc_inspection?.includes("inspect") || permissions?.misc_inspection?.includes("update"))
  const canFinalize = isAdminOrExec || !!(permissions?.misc_inspection?.includes("finalize"))
  const canDelete = isAdminOrExec || !!(permissions?.misc_inspection?.includes("delete"))

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const cached = await getFromCache<MiscInspectionRecord[]>("misc_inspection_cache")
      let lastTs = 0
      if (cached && cached.length > 0) {
        setRecords(cached)
        setLoading(false)
        lastTs = PlatformSyncEngine.extractMaxTimestamp(cached, ["createdAt", "inspectedAt"])
      }

      if (lastTs > 0) {
        const merged = await PlatformSyncEngine.syncModule<MiscInspectionRecord>({
          moduleKey: "misc-inspection",
          cacheKey: "misc_inspection_cache",
          idKey: "id",
          fetchPatchUrl: "/api/misc-inspection/patch",
        }, lastTs)
        setRecords(merged)
      } else {
        const res = await fetch("/api/misc-inspection")
        if (res.ok) {
          const result = await res.json()
          const patchItems = (Array.isArray(result) ? result : (result.patchData || [])) as MiscInspectionRecord[]
          const merged = await mergePatchToCache<MiscInspectionRecord>("misc_inspection_cache", patchItems, "id")
          setRecords(merged)
        }
      }
    } catch (err: any) {
      if (records.length === 0) toast.error(err.message || "Failed to load inspections")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleCreateSuccess = (newRecord?: MiscInspectionRecord) => {
    if (newRecord) {
      setRecords((prev) => [newRecord, ...prev.filter((r) => r.id !== newRecord.id)])
    }
    setShowCreateForm(false)
    fetchRecords()
  }

  const uniqueAgencies = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => {
      if (r.agency) set.add(r.agency)
    })
    return Array.from(set)
  }, [records])

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Sub-tab pipeline
      if (subTab === "pending" && r.status !== "PENDING_AGENCY" && r.status !== "IN_PROGRESS") return false
      if (subTab === "inspected" && r.status !== "INSPECTED") return false
      if (subTab === "finalized" && r.status !== "FINALIZED") return false
      if (subTab === "rejected" && r.status !== "REJECTED") return false

      // Category chip filter
      if (selectedCategory !== "all" && r.category !== selectedCategory) return false

      // Priority filter
      if (selectedPriority !== "all" && r.priority !== selectedPriority) return false

      // Agency filter
      if (selectedAgency !== "all" && r.agency !== selectedAgency) return false

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim()
        const matchId = r.id.toLowerCase().includes(q)
        const matchTitle = r.title.toLowerCase().includes(q)
        const matchRef = r.referenceNo.toLowerCase().includes(q)
        const matchConsumer = (r.applicantName || "").toLowerCase().includes(q) || (r.consumerId || "").toLowerCase().includes(q)
        const matchAddress = (r.address || "").toLowerCase().includes(q)
        if (!matchId && !matchTitle && !matchRef && !matchConsumer && !matchAddress) return false
      }

      return true
    })
  }, [records, subTab, selectedCategory, selectedPriority, selectedAgency, searchTerm])

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete inspection record ${id}?`)) return
    try {
      const res = await fetch(`/api/misc-inspection/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to delete record")
      }
      toast.success("Inspection record deleted successfully")
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record")
    } finally {
      // Always refresh list to clear phantom/stale cached records
      fetchRecords()
    }
  }

  // Export to Excel
  const exportSafetyExcel = async (scope: "filtered" | "all") => {
    try {
      const XLSX = await import("xlsx")
      const targetList = scope === "filtered" ? filteredRecords : records
      const exportData = targetList.map((r, idx) => ({
        "SL No": idx + 1,
        "Inspection ID": r.id,
        "Ref / File No": r.referenceNo,
        "Category": r.category,
        "Title": r.title,
        "Consumer / Applicant": r.applicantName || "",
        "Consumer ID": r.consumerId || "",
        "Address": r.address || "",
        "Assigned Agency": r.agency,
        "Priority": r.priority,
        "Status": r.status,
        "Created By": r.createdBy,
        "Created At": r.createdAt,
        "Inspected By": r.inspectedBy || "",
        "Inspected At": r.inspectedAt || "",
        "Agency Decision": r.agencyDecision || "",
        "Agency Remarks": r.agencyRemarks || "",
        "Admin Decision": r.adminDecision || "",
        "Memo No": r.memoNo || "",
      }))

      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Misc Inspections")
      XLSX.writeFile(workbook, `misc-inspections-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success("Excel report exported successfully")
    } catch (e: any) {
      toast.error("Failed to export Excel: " + e.message)
    }
  }

  // Export to PDF
  const exportSafetyPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({ orientation: "landscape" })
      const pw = doc.internal.pageSize.width

      doc.setFontSize(16)
      doc.setTextColor(30, 41, 59)
      doc.text("Misc Site Inspections Report", pw / 2, 14, { align: "center" })

      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-IN")} | Total Records: ${filteredRecords.length}`,
        pw / 2, 20, { align: "center" }
      )

      const tableBody = filteredRecords.map((r, idx) => [
        idx + 1,
        r.id,
        r.category,
        r.title,
        r.applicantName || r.referenceNo,
        r.address || "-",
        r.agency,
        r.priority,
        r.status,
        r.agencyDecision || "Pending",
      ])

      autoTable(doc, {
        startY: 26,
        head: [["#", "ID", "Category", "Title", "Applicant / Ref", "Location Address", "Agency", "Priority", "Status", "Decision"]],
        body: tableBody,
        styles: { fontSize: 8, font: "helvetica", cellPadding: 2.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "center" },
        theme: "grid",
      })

      doc.save(`misc-inspections-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success("PDF report downloaded")
    } catch (err: any) {
      toast.error("PDF export failed: " + err.message)
    }
  }

  if (showCreateForm) {
    return (
      <MiscInspectionCreateForm
        onSave={handleCreateSuccess}
        onCancel={() => setShowCreateForm(false)}
        userRole={role}
        userAgencies={agencies}
      />
    )
  }

  return (
    <div className="space-y-3 pb-24">
      {/* Top Metric Stats (Safety Module Style - Hidden on Mobile) */}
      <div className="hidden md:block">
        <MiscInspectionStats records={records} />
      </div>

      {/* Control Header Bar (Safety Module Sticky Style) */}
      <div className="bg-white p-3 rounded-xl shadow-sm border sticky top-[64px] z-30 space-y-2">
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
            <Input
              placeholder="Search Misc Inspections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-8 text-xs rounded-lg"
            />
            {searchTerm && (
              <X
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-red-500 cursor-pointer"
                onClick={() => setSearchTerm("")}
              />
            )}
          </div>

          {/* Export Dropdown (Safety Module Style) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 px-2.5 text-xs font-bold bg-slate-50 border-slate-200 text-slate-700 flex items-center gap-1 shrink-0 rounded-lg">
                <FileDown className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={exportSafetyPDF} className="cursor-pointer text-xs font-semibold">
                <FileDown className="h-4 w-4 mr-2 text-red-600" /> Export PDF Report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSafetyExcel("filtered")} className="cursor-pointer text-xs font-semibold">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Export Filtered (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSafetyExcel("all")} className="cursor-pointer text-xs font-semibold">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-700" /> Export All (Excel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg shrink-0" onClick={fetchRecords} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </Button>

          {/* View Mode Toggle (Card vs List) */}
          <div className="flex items-center border rounded-lg bg-white shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-none rounded-l-lg ${viewMode === "card" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-4 bg-gray-200" />
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-none rounded-r-lg ${viewMode === "list" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Sub-tab Chips Pipeline (Safety Module Style) */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 pt-1.5 border-t no-scrollbar">
          {[
            { value: "pending", label: `Pending Agency (${records.filter(r => r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS").length})` },
            { value: "inspected", label: `Inspected (${records.filter(r => r.status === "INSPECTED").length})` },
            { value: "finalized", label: `Finalized (${records.filter(r => r.status === "FINALIZED").length})` },
            { value: "rejected", label: `Rejected (${records.filter(r => r.status === "REJECTED").length})` },
            { value: "all", label: `All (${records.length})` },
          ].map((sub) => (
            <button
              key={sub.value}
              onClick={() => setSubTab(sub.value as any)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
                subTab === sub.value
                  ? "bg-slate-950 text-white border-slate-950 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary Category Filter Chips Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar bg-white p-2 rounded-lg border">
        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 shrink-0 mr-1">
          <Filter className="h-3 w-3 text-blue-600" /> Category:
        </span>
        {CATEGORY_CHIPS.map((chip) => {
          const isActive = selectedCategory === chip.id
          const count = chip.id === "all"
            ? records.length
            : records.filter(r => r.category === chip.id).length
          return (
            <button
              key={chip.id}
              onClick={() => setSelectedCategory(chip.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all shrink-0 border ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {chip.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Dynamic View: Cards vs List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-3 bg-white rounded-xl border">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold">Loading inspection tickets...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2 bg-white rounded-xl border">
          <ClipboardList className="h-10 w-10 text-slate-300" />
          <p className="text-base font-bold text-slate-700">No inspection records found</p>
          <p className="text-xs text-slate-500">Try selecting a different tab or filter category.</p>
        </div>
      ) : viewMode === "card" ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredRecords.map((r) => (
            <Card key={r.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 border border-slate-200/90 rounded-2xl bg-white flex flex-col justify-between">
              <CardContent className="p-4 space-y-3">
                {/* Header Row: ID & Category on Left, Agency Name Prominently on TOP RIGHT */}
                <div className="flex items-start justify-between border-b pb-2.5 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border-blue-200">
                        {r.id}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] py-0.5 px-2 font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {r.category}
                      </Badge>
                      <Badge
                        variant={r.priority === "CRITICAL" || r.priority === "HIGH" ? "destructive" : "outline"}
                        className="text-[10px] py-0 px-1.5 font-bold"
                      >
                        {r.priority}
                      </Badge>
                    </div>
                  </div>

                  {/* TOP RIGHT: Agency Name Badge */}
                  <div className="shrink-0 text-right">
                    <Badge className="bg-slate-900 text-white font-bold px-2.5 py-1 text-[11px] rounded-lg shadow-sm border border-slate-700 flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-amber-400" />
                      <span>{r.agency || "Unassigned"}</span>
                    </Badge>
                  </div>
                </div>

                {/* Body Details */}
                <div>
                  <h3 className="font-bold text-xs text-slate-900 line-clamp-1">{r.title}</h3>
                  {r.description && <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{r.description}</p>}
                </div>

                <div className="space-y-1 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                  <p className="truncate flex items-center gap-1.5 font-medium text-slate-800">
                    <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span><strong>Applicant:</strong> {r.applicantName || r.referenceNo}</span>
                  </p>
                  <p className="truncate flex items-center gap-1.5 text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span><strong>Address:</strong> {r.address || "No address provided"}</span>
                  </p>
                  {(r.referenceDocUrl || (r.referenceNo && (r.referenceNo.startsWith("http") || r.referenceNo.includes("drive.google.com")))) && (
                    <div className="pt-1">
                      <a
                        href={r.referenceDocUrl || r.referenceNo}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md"
                      >
                        <FileText className="h-3 w-3" />
                        <span>View Reference Doc ↗</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Status & Site Decision Summary */}
                <div className="flex items-center justify-between pt-1">
                  <Badge
                    variant={
                      r.status === "FINALIZED"
                        ? "default"
                        : r.status === "INSPECTED"
                        ? "secondary"
                        : r.status === "REJECTED"
                        ? "destructive"
                        : "outline"
                    }
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
                  >
                    {r.status}
                  </Badge>

                  {r.agencyDecision ? (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ {r.agencyDecision}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-medium italic">
                      ⏳ Pending Inspection
                    </span>
                  )}
                </div>

                {r.agencyRemarks && (
                  <p className="text-[11px] text-slate-600 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 italic line-clamp-2">
                    "{r.agencyRemarks}"
                  </p>
                )}

                {/* Card Action Buttons */}
                <div className="flex items-center justify-between border-t pt-2.5 gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 rounded-lg"
                    onClick={() => {
                      setSelectedRecord(r)
                      setShowViewModal(true)
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" /> Details
                  </Button>

                  <div className="flex gap-1.5">
                    {canInspect && (r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-bold gap-1 border-blue-400 text-blue-700 bg-blue-50/50 hover:bg-blue-600 hover:text-white transition-all rounded-lg shadow-sm"
                        onClick={() => {
                          setSelectedRecord(r)
                          setShowUpdateModal(true)
                        }}
                      >
                        <Camera className="h-3.5 w-3.5" /> Inspect
                      </Button>
                    )}

                    {canFinalize && r.status === "INSPECTED" && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
                        onClick={() => {
                          setSelectedRecord(r)
                          setShowViewModal(true)
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Finalize
                      </Button>
                    )}

                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View (Table Mode) */
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[110px] text-xs font-bold">ID / Ref</TableHead>
                <TableHead className="text-xs font-bold">Category & Title</TableHead>
                <TableHead className="text-xs font-bold">Consumer / Location</TableHead>
                <TableHead className="text-xs font-bold">Agency</TableHead>
                <TableHead className="text-xs font-bold">Priority</TableHead>
                <TableHead className="text-xs font-bold">Status</TableHead>
                <TableHead className="text-xs font-bold">Decision</TableHead>
                <TableHead className="text-right text-xs font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50/80 transition">
                  <TableCell className="font-mono text-xs font-bold">
                    <div className="text-blue-600">{r.id}</div>
                    <div className="text-[10px] text-slate-400">{r.referenceNo}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-xs text-slate-900 line-clamp-1">{r.title}</div>
                    <Badge variant="outline" className="text-[10px] py-0 font-normal mt-0.5">{r.category}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.applicantName || "N/A"}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{r.address || "No address"}</div>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{r.agency}</TableCell>
                  <TableCell>
                    <Badge variant={r.priority === "CRITICAL" ? "destructive" : "outline"} className="text-[10px]">{r.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "FINALIZED" ? "default" : "outline"} className="text-[10px]">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.agencyDecision ? <span className="font-bold text-emerald-600">{r.agencyDecision}</span> : <span className="text-slate-400 italic">Pending</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedRecord(r); setShowViewModal(true) }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canInspect && (r.status === "PENDING_AGENCY" || r.status === "IN_PROGRESS") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600" onClick={() => { setSelectedRecord(r); setShowUpdateModal(true) }}>
                          <Camera className="h-3.5 w-3.5 mr-1" /> Inspect
                        </Button>
                      )}
                      {canFinalize && r.status === "INSPECTED" && (
                        <Button variant="default" size="sm" className="h-7 text-xs bg-emerald-600" onClick={() => { setSelectedRecord(r); setShowViewModal(true) }}>
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Finalize
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Floating Action Button — Safety Module Style (Bottom Right / Floating) */}
      {canCreate && (
        <Button
          onClick={() => setShowCreateForm(true)}
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-xl h-12 px-5 font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 border-2 border-white"
        >
          <Plus className="h-5 w-5" /> Log Misc Inspection
        </Button>
      )}

      {/* Agency Site Update Modal */}
      <MiscInspectionUpdateForm
        record={selectedRecord}
        open={showUpdateModal}
        onOpenChange={setShowUpdateModal}
        onSuccess={fetchRecords}
      />

      {/* Details & PDF View Modal */}
      <MiscInspectionViewDialog
        record={selectedRecord}
        open={showViewModal}
        onOpenChange={setShowViewModal}
        onSuccess={fetchRecords}
        userRole={role}
      />
    </div>
  )
}

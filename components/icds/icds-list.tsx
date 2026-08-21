"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import type { IcdsRecord, IcdsStage, PropertyStatus, JurisdictionStatus } from "@/lib/icds-types"
import { IcdsMiniKpiDrawer } from "@/components/icds/icds-stats"
import { IcdsInspectModal } from "@/components/icds/icds-inspect-modal"
import { IcdsConnectionModal } from "@/components/icds/icds-connection-modal"
import { IcdsExecutionModal } from "@/components/icds/icds-execution-modal"
import { IcdsAddModal } from "@/components/icds/icds-add-modal"
import { IcdsEditModal } from "@/components/icds/icds-edit-modal"
import { IcdsBulkUploadModal } from "@/components/icds/icds-bulk-upload-modal"
import { IcdsViewDialog } from "@/components/icds/icds-view-dialog"
import { IcdsStats } from "@/components/icds/icds-stats"
import { generateIcdsServiceCertificatePDF } from "@/lib/icds-pdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  MoreVertical,
  Building2,
  MapPin,
  Smartphone,
  Eye,
  Camera,
  Layers,
  Award,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  RadioTower,
  Zap,
  Edit3,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  LayoutGrid,
  List,
  BarChart3,
  FileText,
  AlertCircle,
  Trash2,
} from "lucide-react"
import { getFromCache, saveToCache } from "@/lib/indexed-db"

const CACHE_KEY = "icds_data_cache"
const PAGE_SIZE = 24

interface Props {
  role?: string
  userRole?: string
  username?: string
  agencies?: string[]
  assignedAgencies?: string[]
  permissions?: Record<string, string[]>
}

export function IcdsList({
  role,
  userRole = "admin",
  username = "Operator",
  agencies: propAgencies,
  assignedAgencies = [],
  permissions = {},
}: Props) {
  const effectiveRole = role || userRole
  const effectiveAgencies = propAgencies || assignedAgencies
  const icdsPerms = permissions["icds"] || []

  const [records, setRecords] = useState<IcdsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<"card" | "list">("card")

  // Modals state
  const [selectedRecord, setSelectedRecord] = useState<IcdsRecord | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showInspectModal, setShowInspectModal] = useState(false)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showExecutionModal, setShowExecutionModal] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedBlock, setSelectedBlock] = useState("all")
  const [selectedGp, setSelectedGp] = useState("all")
  const [selectedAgency, setSelectedAgency] = useState("all")
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("all")
  const [selectedProperty, setSelectedProperty] = useState("all")
  const [selectedStage, setSelectedStage] = useState("all")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  const isAgency = effectiveRole === "agency"
  const hasIcdsPerm = (act: string) => icdsPerms.includes(act) || icdsPerms.includes("*")
  
  // Default for agency: read, inspect, execute, install, certify (unless explicitly customized with non-empty perms)
  const canCreate = effectiveRole === "admin" || effectiveRole === "executive" || (!isAgency && hasIcdsPerm("create"))
  const canEditMaster = effectiveRole === "admin" || effectiveRole === "executive" || hasIcdsPerm("update")
  const canInspect = effectiveRole === "admin" || effectiveRole === "executive" || (isAgency ? hasIcdsPerm("inspect") || icdsPerms.length === 0 : hasIcdsPerm("inspect"))
  const canProcess = (effectiveRole === "admin" || effectiveRole === "executive") || (!isAgency && hasIcdsPerm("process"))
  const canExecute = effectiveRole === "admin" || effectiveRole === "executive" || (isAgency ? hasIcdsPerm("execute") || hasIcdsPerm("install") || icdsPerms.length === 0 : hasIcdsPerm("execute") || hasIcdsPerm("install"))

  // Subtle mobile touch vibration
  const triggerVibrate = useCallback(() => {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }, [])

  // Load records from IndexedDB cache first, then sync from server
  const loadRecords = useCallback(async (forceReload = false) => {
    try {
      if (!forceReload) {
        const cached = await getFromCache<IcdsRecord[]>(CACHE_KEY)
        if (cached && cached.length > 0) {
          setRecords(cached)
          setLoading(false)
        }
      }

      setRefreshing(true)
      const res = await fetch(`/api/icds?t=${Date.now()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to fetch ICDS records")
      const data: IcdsRecord[] = await res.json()
      setRecords(data)
      await saveToCache(CACHE_KEY, data)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("local-cache-updated", { detail: { key: CACHE_KEY } }))
      }
    } catch (err: any) {
      toast.error(err.message || "Could not load Anganwadi centers")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // Extract dynamic filter option lists
  const blocks = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => r.blockName && set.add(r.blockName))
    return Array.from(set).sort()
  }, [records])

  const gps = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => {
      if (selectedBlock === "all" || r.blockName === selectedBlock) {
        if (r.gpName) set.add(r.gpName)
      }
    })
    return Array.from(set).sort()
  }, [records, selectedBlock])

  const agencies = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => r.assignedAgency && set.add(r.assignedAgency))
    return Array.from(set).sort()
  }, [records])

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Role scope restriction for agency users
      if (isAgency) {
        const userAgencies = [
          ...(effectiveAgencies || []),
          ...(username ? [username] : []),
        ]
          .map((a) => String(a || "").trim().toUpperCase())
          .filter(Boolean)

        if (userAgencies.length > 0) {
          const recAgency = String(r.assignedAgency || "").trim().toUpperCase()
          if (!recAgency) return false
          const matches = userAgencies.some(
            (ua) => recAgency === ua || recAgency.startsWith(ua) || recAgency.includes(ua) || ua.includes(recAgency)
          )
          if (!matches) return false
        }
      }

      // Search match
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const match =
          r.awcCode?.toLowerCase().includes(term) ||
          r.awcName?.toLowerCase().includes(term) ||
          r.blockName?.toLowerCase().includes(term) ||
          r.gpName?.toLowerCase().includes(term) ||
          r.awwName?.toLowerCase().includes(term) ||
          r.awwMobile?.toLowerCase().includes(term) ||
          r.assignedAgency?.toLowerCase().includes(term) ||
          r.smartMeterNo?.toLowerCase().includes(term) ||
          r.officialApplicationNo?.toLowerCase().includes(term)
        if (!match) return false
      }

      // Filter matches
      if (selectedBlock !== "all" && r.blockName !== selectedBlock) return false
      if (selectedGp !== "all" && r.gpName !== selectedGp) return false
      if (selectedAgency !== "all" && r.assignedAgency !== selectedAgency) return false
      if (selectedJurisdiction !== "all" && r.jurisdictionStatus !== selectedJurisdiction) return false
      if (selectedProperty !== "all" && r.propertyStatus !== selectedProperty) return false

      // Stage filter supporting grouped stages
      if (selectedStage !== "all") {
        if (selectedStage === "INSPECTED") {
          if (r.stage !== "INSPECTED" && r.stage !== "APPLICATION_PENDING") return false
        } else if (selectedStage === "WO_ISSUED") {
          if (r.stage !== "WO_ISSUED" && r.stage !== "METER_INSTALLED" && r.stage !== "EQUIPMENT_INSTALLED") return false
        } else if (r.stage !== selectedStage) {
          return false
        }
      }

      return true
    })
  }, [
    records,
    isAgency,
    effectiveAgencies,
    username,
    searchTerm,
    selectedBlock,
    selectedGp,
    selectedAgency,
    selectedJurisdiction,
    selectedProperty,
    selectedStage,
  ])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchTerm,
    selectedBlock,
    selectedGp,
    selectedAgency,
    selectedJurisdiction,
    selectedProperty,
    selectedStage,
  ])

  // Pagination calculation
  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, currentPage])

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (selectedBlock !== "all") count++
    if (selectedGp !== "all") count++
    if (selectedAgency !== "all") count++
    if (selectedJurisdiction !== "all") count++
    if (selectedProperty !== "all") count++
    return count
  }, [selectedBlock, selectedGp, selectedAgency, selectedJurisdiction, selectedProperty])

  const clearFilters = () => {
    setSelectedBlock("all")
    setSelectedGp("all")
    setSelectedAgency("all")
    setSelectedJurisdiction("all")
    setSelectedProperty("all")
  }

  // Handle single record updates from modals
  const handleRecordUpdated = (updated: IcdsRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id)
      const next = idx === -1 ? [updated, ...prev] : [...prev]
      if (idx !== -1) next[idx] = updated
      saveToCache(CACHE_KEY, next)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("local-cache-updated", { detail: { key: CACHE_KEY } }))
      }
      return next
    })
  }

  // Handle new record created
  const handleRecordCreated = (created: IcdsRecord) => {
    setRecords((prev) => {
      const next = [created, ...prev]
      saveToCache(CACHE_KEY, next)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("local-cache-updated", { detail: { key: CACHE_KEY } }))
      }
      return next
    })
  }

  // Stage badge helper
  const getStageBadge = (stage: IcdsStage) => {
    switch (stage) {
      case "PENDING_INSPECTION":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px] font-bold">Pending Inspection</Badge>
      case "INSPECTED":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 text-[10px] font-bold">Inspected</Badge>
      case "APPLICATION_PENDING":
        return <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-[10px] font-bold">App Received</Badge>
      case "WO_ISSUED":
        return <Badge className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-bold">WO Issued</Badge>
      case "METER_INSTALLED":
        return <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100 text-[10px] font-bold">Meter Installed</Badge>
      case "EQUIPMENT_INSTALLED":
        return <Badge className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-bold">Wiring Done</Badge>
      case "COMPLETED":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px] font-bold">Certified</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">{stage}</Badge>
    }
  }

  // Export filtered list to Excel
  const exportFilteredExcel = async () => {
    try {
      const XLSX = await import("xlsx")
      const exportData = filteredRecords.map((r, i) => ({
        "SL No": i + 1,
        "AWC Code": r.awcCode,
        "AWC Name": r.awcName,
        "Block Name": r.blockName,
        "GP Name": r.gpName,
        "Address": r.awcAddress || "",
        "Property Status": r.propertyStatus,
        "AWW Worker": r.awwName || "",
        "AWW Mobile": r.awwMobile || "",
        "Assigned Agency": r.assignedAgency || "",
        "Jurisdiction": r.jurisdictionStatus,
        "Other CCC Name": r.jurisdictionOffice || "",
        "Stage": r.stage,
        "Existing Meter?": r.meterExists ? "YES" : "NO",
        "Existing Meter No": r.existingMeterNo || "",
        "Infra Poles Req": r.infraRequired ? r.polesRequired || 0 : 0,
        "Booklet Received": r.bookletReceived ? "YES" : "NO",
        "Official App No": r.officialApplicationNo || "",
        "Quotation No": r.quotationNo || "",
        "Quotation Date": r.quotationDate || "",
        "Quotation Amount": r.quotationAmount || "",
        "Work Order No": r.workOrderNo || "",
        "Smart Meter Serial": r.smartMeterNo || "",
        "Meter Install Date": r.meterInstallDate || "",
        "CSR Wiring Installed": r.equipmentPackageInstalled ? "YES" : "NO",
        "Certificate Signatory": r.certificateSignatory || "",
        "Certificate Date": r.certificateDate || "",
      }))

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Anganwadi Centers")
      XLSX.writeFile(wb, `ICDS_Electrification_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`Exported ${exportData.length} Anganwadi centers to Excel!`)
    } catch (e: any) {
      toast.error("Failed to export Excel: " + e.message)
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-24">
      {/* 1. Sleek Search, Filter & 3-Dot Action Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200/90 flex items-center justify-between gap-2.5 flex-wrap">
        {/* Left: Quick Search */}
        <div className="relative flex-1 min-w-[200px] sm:min-w-[280px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search center, code, GP, worker, phone..."
            className="pl-9 h-9 text-xs rounded-lg bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Filter Button, View Toggle, and 3-Dot More Menu */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Consolidated Filter Button */}
          <Button
            variant={activeFiltersCount > 0 ? "default" : "outline"}
            size="sm"
            onClick={() => { triggerVibrate(); setIsFilterOpen(true); }}
            className={
              activeFiltersCount > 0
                ? "h-9 px-3 text-xs font-bold rounded-lg transition-all bg-slate-900 text-white hover:bg-slate-800 shadow-xs"
                : "h-9 px-3 text-xs font-bold rounded-lg transition-all border-slate-200 hover:bg-slate-50 text-slate-700"
            }
          >
            <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-blue-500 text-white rounded-full text-[10px] font-extrabold">
                {activeFiltersCount}
              </span>
            )}
          </Button>

          {/* View Mode Toggle (Grid / List) */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-0.5">
            <button
              onClick={() => { triggerVibrate(); setViewMode("card"); }}
              className={"p-1.5 rounded-md transition-all " + (viewMode === "card" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-400 hover:text-slate-700")}
              title="Card Grid View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { triggerVibrate(); setViewMode("list"); }}
              className={"p-1.5 rounded-md transition-all " + (viewMode === "list" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-400 hover:text-slate-700")}
              title="Table List View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 3-Dot (More Actions) Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg border-slate-200 hover:bg-slate-50 text-slate-700 shadow-xs"
                title="More Actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5 shadow-lg border-slate-200">
              <DropdownMenuItem
                onClick={() => { triggerVibrate(); loadRecords(true); }}
                disabled={refreshing}
                className="text-xs font-semibold py-2 rounded-lg cursor-pointer gap-2"
              >
                <RefreshCw className={"h-4 w-4 text-blue-600 " + (refreshing ? "animate-spin" : "")} />
                {refreshing ? "Refreshing Dataset..." : "Refresh Dataset"}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => { triggerVibrate(); setShowReportsModal(true); }}
                className="text-xs font-bold py-2 rounded-lg cursor-pointer gap-2 text-indigo-700 focus:bg-indigo-50 focus:text-indigo-800"
              >
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Performance & Analytics Reports
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => { triggerVibrate(); exportFilteredExcel(); }}
                className="text-xs font-semibold py-2 rounded-lg cursor-pointer gap-2 text-emerald-700 focus:bg-emerald-50 focus:text-emerald-800"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Export to Excel (.xlsx)
              </DropdownMenuItem>

              {canCreate && (
                <>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onClick={() => { triggerVibrate(); setShowAddModal(true); }}
                    className="text-xs font-bold py-2 rounded-lg cursor-pointer gap-2 text-slate-900 focus:bg-slate-100"
                  >
                    <Plus className="h-4 w-4 text-blue-600" />
                    Add Center Manually
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { triggerVibrate(); setShowUploadModal(true); }}
                    className="text-xs font-bold py-2 rounded-lg cursor-pointer gap-2 text-emerald-800 focus:bg-emerald-50"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Bulk Upload (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onClick={async () => {
                      triggerVibrate()
                      if (!confirm("Are you sure you want to delete all 95 test centers? This will clear the ICDS registry.")) return
                      try {
                        const res = await fetch("/api/icds?clearAll=true", { method: "DELETE" })
                        if (res.ok) {
                          toast.success("Successfully deleted all test centers")
                          setRecords([])
                          await saveToCache(CACHE_KEY, [])
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("local-cache-updated", { detail: { key: CACHE_KEY } }))
                          }
                        } else {
                          toast.error("Failed to delete centers")
                        }
                      } catch (err: any) {
                        toast.error(err.message || "Failed to clear registry")
                      }
                    }}
                    className="text-xs font-bold py-2 rounded-lg cursor-pointer gap-2 text-rose-700 focus:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                    Clear All Test Centers
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 2. Mini Collapsible KPI Drawer */}
      <IcdsMiniKpiDrawer records={records} />

      {/* 3. Quick Horizontal Stage Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        {[
          { id: "all", label: "All Centers", count: records.length },
          { id: "PENDING_INSPECTION", label: "Pending", count: records.filter((r) => r.stage === "PENDING_INSPECTION").length },
          { id: "INSPECTED", label: "Inspected", count: records.filter((r) => r.stage === "INSPECTED" || r.stage === "APPLICATION_PENDING").length },
          { id: "WO_ISSUED", label: "WO Issued", count: records.filter((r) => r.stage === "WO_ISSUED" || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED").length },
          { id: "COMPLETED", label: "Certified", count: records.filter((r) => r.stage === "COMPLETED").length },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => { triggerVibrate(); setSelectedStage(s.id); }}
            className={
              "px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all " +
              (selectedStage === s.id
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")
            }
          >
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      {/* 4. Main Records Display (Cards / Table) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-xl shadow-xs border border-slate-200">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
          <p className="text-xs text-slate-500 font-semibold">Hydrating Anganwadi Centers registry...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center p-16 bg-white rounded-xl shadow-xs border border-slate-200 space-y-4">
          <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center mx-auto border border-slate-200">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-base">No Anganwadi Centers Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {records.length === 0
                ? "Your registry is currently empty. Click 'Bulk Upload' or 'Add Center' to get started."
                : "No centers match your currently applied search filters."}
            </p>
          </div>
          {activeFiltersCount > 0 && (
            <Button size="sm" variant="outline" onClick={clearFilters} className="text-xs font-semibold rounded-lg">
              Reset Filters
            </Button>
          )}
        </div>
      ) : viewMode === "card" ? (
        /* Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {paginatedRecords.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl shadow-xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
            >
              <div className="p-4 space-y-3">
                {/* Top Row: Title + Code + Stage Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-slate-900 text-sm leading-tight truncate" title={r.awcName}>
                        {r.awcName}
                      </h3>
                      {canEditMaster && (
                        <button
                          onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowEditModal(true); }}
                          className="text-slate-400 hover:text-blue-600 p-0.5 rounded hover:bg-blue-50 transition-colors shrink-0"
                          title="Edit Details (Pencil)"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 rounded px-1.5 py-0.2">
                        {r.awcCode}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        {r.blockName} • {r.gpName}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {getStageBadge(r.stage)}
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      {r.propertyStatus?.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {/* Address Line if present */}
                {r.awcAddress && (
                  <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-1">
                    📍 {r.awcAddress}
                  </p>
                )}

                {/* Worker Contact Card */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Anganwadi Worker</span>
                    <p className="font-bold text-slate-800 truncate">{r.awwName || "Not Assigned"}</p>
                  </div>
                  <div className="text-right space-y-0.5 shrink-0">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Contact</span>
                    {r.awwMobile ? (
                      <a
                        href={`tel:${r.awwMobile}`}
                        className="text-xs font-mono font-bold text-blue-600 hover:underline flex items-center gap-1 justify-end"
                      >
                        <Smartphone className="h-3 w-3 text-slate-400" />
                        {r.awwMobile}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold">N/A</span>
                    )}
                  </div>
                </div>

                {/* Quick Metric Status Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Smart Meter</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                      <Zap className={"h-3.5 w-3.5 " + (r.meterExists || r.smartMeterNo ? "text-indigo-600" : "text-slate-300")} />
                      {r.smartMeterNo || (r.meterExists ? "Meter Exists" : "Un-electrified")}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Infrastructure</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                      <RadioTower className={"h-3.5 w-3.5 " + (r.infraRequired ? "text-orange-600" : "text-emerald-500")} />
                      {r.infraRequired ? `${r.polesRequired || 0} Poles Req` : "Direct LT"}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">CSR Package</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                      <Layers className={"h-3.5 w-3.5 " + (r.equipmentPackageInstalled ? "text-purple-600" : "text-slate-300")} />
                      {r.equipmentPackageInstalled ? "Installed (₹6,611)" : "Pending Wiring"}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Agency</span>
                    <span className="font-semibold text-slate-800 truncate block" title={r.assignedAgency}>
                      {r.assignedAgency || "Unassigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sequential Action Footer: Shows primary button for current flow stage */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowViewDialog(true); }}
                  className="h-8 px-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> Details
                </Button>

                {/* Primary Action Button Based on Current Flow Stage */}
                {r.jurisdictionStatus === "OTHER_OFFICE" ? (
                  <Badge className="bg-amber-100 text-amber-900 text-[10px] font-mono border-amber-200">
                    Other CCC: {r.jurisdictionOffice || "Adjacent"}
                  </Badge>
                ) : r.stage === "PENDING_INSPECTION" ? (
                  canInspect ? (
                    <Button
                      size="sm"
                      onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowInspectModal(true); }}
                      className="h-8 px-3 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                    >
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      Inspect Premises
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-bold py-1 text-amber-700 bg-amber-50 border-amber-200">
                      Pending Inspection
                    </Badge>
                  )
                ) : r.stage === "INSPECTED" || r.stage === "APPLICATION_PENDING" ? (
                  canProcess ? (
                    <Button
                      size="sm"
                      onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowConnectionModal(true); }}
                      className="h-8 px-3 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      Admin CRM / WO
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-bold py-1 px-2.5 text-indigo-700 bg-indigo-50 border-indigo-200">
                      <Clock className="h-3 w-3 mr-1 animate-pulse" /> Awaiting Admin WO
                    </Badge>
                  )
                ) : r.stage === "WO_ISSUED" || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" ? (
                  canExecute ? (
                    <Button
                      size="sm"
                      onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowExecutionModal(true); }}
                      className="h-8 px-3 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                    >
                      <Zap className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                      Execute & Certify
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-bold py-1 text-purple-700 bg-purple-50 border-purple-200">
                      WO Issued
                    </Badge>
                  )
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowViewDialog(true); }}
                    className="h-8 px-3 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    Certified
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-bold">AWC Center</TableHead>
                  <TableHead className="font-bold">Location</TableHead>
                  <TableHead className="font-bold">Worker Contact</TableHead>
                  <TableHead className="font-bold">Agency</TableHead>
                  <TableHead className="font-bold">Smart Meter</TableHead>
                  <TableHead className="font-bold">Stage</TableHead>
                  <TableHead className="font-bold text-right">Primary Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900">{r.awcName}</span>
                        {canEditMaster && (
                          <button
                            onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowEditModal(true); }}
                            className="text-slate-400 hover:text-blue-600 p-0.5 rounded hover:bg-blue-50"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-blue-700">{r.awcCode}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-700">{r.blockName}</span>
                      <span className="text-slate-400 block text-[11px]">{r.gpName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-slate-800">{r.awwName || "—"}</span>
                      {r.awwMobile && (
                        <a href={`tel:${r.awwMobile}`} className="text-[11px] font-mono text-blue-600 block hover:underline">
                          {r.awwMobile}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">{r.assignedAgency || "—"}</TableCell>
                    <TableCell className="font-mono">{r.smartMeterNo || (r.meterExists ? "Meter Exists" : "—")}</TableCell>
                    <TableCell>{getStageBadge(r.stage)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowViewDialog(true); }}
                          className="h-7 px-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>

                        {r.stage === "PENDING_INSPECTION" ? (
                          canInspect ? (
                            <Button
                              size="sm"
                              onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowInspectModal(true); }}
                              className="h-7 px-2.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                            >
                              Inspect
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Pending</Badge>
                          )
                        ) : r.stage === "INSPECTED" || r.stage === "APPLICATION_PENDING" ? (
                          canProcess ? (
                            <Button
                              size="sm"
                              onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowConnectionModal(true); }}
                              className="h-7 px-2.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                            >
                              Admin CRM
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-indigo-700 bg-indigo-50 border-indigo-200">Awaiting WO</Badge>
                          )
                        ) : r.stage === "WO_ISSUED" || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" ? (
                          canExecute ? (
                            <Button
                              size="sm"
                              onClick={() => { triggerVibrate(); setSelectedRecord(r); setShowExecutionModal(true); }}
                              className="h-7 px-2.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                            >
                              Execute
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">WO Issued</Badge>
                          )
                        ) : (
                          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">Certified</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 5. Pagination Bar (Parted by Page Numbers) */}
      {filteredRecords.length > 0 && (
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{(currentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
            <span className="font-bold text-slate-800">{Math.min(currentPage * PAGE_SIZE, filteredRecords.length)}</span> of{" "}
            <span className="font-bold text-slate-800">{filteredRecords.length}</span> centers
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { triggerVibrate(); setCurrentPage((p) => Math.max(1, p - 1)); }}
              disabled={currentPage === 1}
              className="h-8 px-2.5 rounded-lg border-slate-200 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
            </Button>

            {/* Dynamic Page Number Buttons */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1
              if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 3 + i
                if (pageNum > totalPages) pageNum = totalPages - 4 + i
              }
              return (
                <Button
                  key={pageNum}
                  size="sm"
                  variant={currentPage === pageNum ? "default" : "outline"}
                  onClick={() => { triggerVibrate(); setCurrentPage(pageNum); }}
                  className={
                    "h-8 w-8 p-0 rounded-lg text-xs font-bold " +
                    (currentPage === pageNum
                      ? "bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700")
                  }
                >
                  {pageNum}
                </Button>
              )
            })}

            <Button
              size="sm"
              variant="outline"
              onClick={() => { triggerVibrate(); setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
              disabled={currentPage === totalPages}
              className="h-8 px-2.5 rounded-lg border-slate-200 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Filter Modal Dialog */}
      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              Filter Anganwadi Centers
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Refine your dataset by block, gram panchayat, agency contractor, or property status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            {/* Block Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Block</label>
              <Select value={selectedBlock} onValueChange={(v) => { setSelectedBlock(v); setSelectedGp("all"); }}>
                <SelectTrigger className="h-9 text-xs rounded-lg">
                  <SelectValue placeholder="All Blocks" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Blocks ({blocks.length})</SelectItem>
                  {blocks.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* GP Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Gram Panchayat (GP)</label>
              <Select value={selectedGp} onValueChange={setSelectedGp}>
                <SelectTrigger className="h-9 text-xs rounded-lg">
                  <SelectValue placeholder="All Gram Panchayats" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-56">
                  <SelectItem value="all">All Gram Panchayats ({gps.length})</SelectItem>
                  {gps.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agency Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Assigned Agency (Contractor)</label>
              <Select value={selectedAgency} onValueChange={setSelectedAgency}>
                <SelectTrigger className="h-9 text-xs rounded-lg">
                  <SelectValue placeholder="All Agencies" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-56">
                  <SelectItem value="all">All Agencies ({agencies.length})</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jurisdiction Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Office Jurisdiction</label>
              <Select value={selectedJurisdiction} onValueChange={setSelectedJurisdiction}>
                <SelectTrigger className="h-9 text-xs rounded-lg">
                  <SelectValue placeholder="All Jurisdictions" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Jurisdictions</SelectItem>
                  <SelectItem value="UNDER_OFFICE">Under This Office (Our CCC)</SelectItem>
                  <SelectItem value="OTHER_OFFICE">Falls Under Other CCC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Property Status Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Property / Building Status</label>
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="h-9 text-xs rounded-lg">
                  <SelectValue placeholder="All Property Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Property Types</SelectItem>
                  <SelectItem value="OWN_BUILDING">Own Building</SelectItem>
                  <SelectItem value="SCHOOL">School Premises</SelectItem>
                  <SelectItem value="RENTED">Rented House</SelectItem>
                  <SelectItem value="PRIVATE">Private House</SelectItem>
                  <SelectItem value="COMMUNITY_HALL">Community Hall</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-3 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearFilters}
              disabled={activeFiltersCount === 0}
              className="text-xs font-semibold rounded-lg"
            >
              Reset All
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsFilterOpen(false)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs"
            >
              Apply ({filteredRecords.length} Results)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reports & Analytics Modal */}
      <Dialog open={showReportsModal} onOpenChange={setShowReportsModal}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              ICDS Electrification Performance & Agency Analytics
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Agency allocation, stage progression, block-wise distribution, and CSR internal wiring execution.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <IcdsStats records={records} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Modals */}
      <IcdsInspectModal
        record={selectedRecord}
        open={showInspectModal}
        onClose={() => setShowInspectModal(false)}
        onSuccess={handleRecordUpdated}
        username={username}
      />

      <IcdsConnectionModal
        record={selectedRecord}
        open={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        onSuccess={handleRecordUpdated}
        username={username}
      />

      <IcdsExecutionModal
        record={selectedRecord}
        open={showExecutionModal}
        onClose={() => setShowExecutionModal(false)}
        onSuccess={handleRecordUpdated}
        username={username}
      />

      <IcdsViewDialog
        record={selectedRecord}
        open={showViewDialog}
        onClose={() => setShowViewDialog(false)}
      />

      <IcdsAddModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleRecordCreated}
        agencies={agencies}
      />

      <IcdsEditModal
        record={selectedRecord}
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleRecordUpdated}
        agencies={agencies}
      />

      <IcdsBulkUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => loadRecords(true)}
      />
    </div>
  )
}

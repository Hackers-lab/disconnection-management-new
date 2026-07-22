"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search, X, Plus, RotateCcw, MapPin, Phone, Clock,
  CheckCircle2, Lock, XCircle, ChevronLeft, ChevronRight,
  Loader2, Download, Image as ImageIcon, RefreshCw, Check,
  DownloadCloud, Monitor, Building2, User, Edit, FileDown, FileSpreadsheet
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { ReconnectionRequest } from "@/lib/reconnection-service"
import { ReconnectionCreateForm } from "@/components/reconnection-create-form"
import { ReconnectionUpdateForm } from "@/components/reconnection-update-form"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// xlsx is loaded dynamically in downloadReport() to avoid bundling ~1MB upfront

const CACHE_KEY = "reconnection_data_cache"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
}

type Tab = "pending" | "reconnected" | "door_locked" | "overdue" | "all" | "reports"
type SyncState = "idle" | "loading" | "updated"

function formatTs(ts: string) {
  if (!ts) return "—"
  return ts.replace(/-/g, "/")
}

function hoursAgo(ts: string): number {
  if (!ts) return 0
  try {
    const [datePart, timePart] = ts.split(" ")
    const [d, m, y] = datePart.split("-").map(Number)
    const [h, min] = (timePart || "00:00").split(":").map(Number)
    return (Date.now() - new Date(y, m - 1, d, h, min).getTime()) / 3_600_000
  } catch { return 0 }
}

function StatusBadge({ status, effectiveStatus }: { status: ReconnectionRequest["status"], effectiveStatus: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    reconnected: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    door_locked: "bg-orange-50 text-orange-700 border border-orange-200",
    cancelled: "bg-gray-50 text-gray-500 border border-gray-200",
    pending_reattempt: "bg-pink-50 text-pink-700 border border-pink-200 animate-pulse",
  }
  const labels: Record<string, string> = {
    pending: "⏳ Pending",
    reconnected: "✅ Reconnected",
    door_locked: "🔒 Door Locked",
    cancelled: "✕ Cancelled",
    pending_reattempt: "🔄 Pending Re-attempt",
  }
  const key = (status === "door_locked" && effectiveStatus === "pending") ? "pending_reattempt" : status
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${styles[key] || ""}`}>
      {labels[key] || status}
    </span>
  )
}

export function ReconnectionList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<ReconnectionRequest[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>("pending")
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useHashState<"list" | "create" | "update">("reconnection", "list")
  const [selected, setSelected] = useState<ReconnectionRequest | null>(null)

  const isAdmin = userRole === "admin" || userRole === "executive"
  const canCreate = isAdmin || userRole === "agency" || !!(permissions && (permissions.reconnection?.includes("create") || permissions.reconnection?.includes("update")))
  const PAGE_SIZE = 15

  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      // 1. Show cached data instantly
      const cached = await getFromCache<ReconnectionRequest[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setRecords(cached)
        if (!silent) setSyncState("idle")
      }
      // 2. Fetch fresh from server
      const res = await fetch("/api/reconnection")
      if (!res.ok) throw new Error()
      const data: ReconnectionRequest[] = await res.json()
      const sorted = [...data].reverse() // newest first
      setRecords(sorted)
      await saveToCache(CACHE_KEY, sorted)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load reconnection data", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  // ── Processed Records with Virtual Pending and Overdue ────────────────────
  const processedRecords = useMemo(() => {
    return records.map(r => {
      let effectiveStatus = r.status
      let isOverdue = false
      let overdueHours = 0

      if (r.status === "door_locked") {
        const hrsLocked = hoursAgo(r.updatedAt || r.createdAt)
        if (hrsLocked >= 72) {
          effectiveStatus = "pending"
          isOverdue = hrsLocked > 144 // Overdue time is 72 hours for this entry, meaning 72h locked + 72h pending = 144h since update
          overdueHours = hrsLocked - 72
        } else {
          effectiveStatus = "door_locked"
          isOverdue = false
          overdueHours = 0
        }
      } else if (r.status === "pending") {
        effectiveStatus = "pending"
        const hrs = hoursAgo(r.createdAt)
        isOverdue = hrs > 30 // standard overdue is 30 hours
        overdueHours = hrs
      }

      return {
        ...r,
        effectiveStatus,
        isOverdue,
        overdueHours,
      }
    })
  }, [records])

  const agencyStats = useMemo(() => {
    const map: Record<string, { pending: number; overdue: number; total: number }> = {}
    
    processedRecords.forEach(r => {
      const ag = r.agency ? r.agency.trim() : "Unassigned"
      if (!map[ag]) {
        map[ag] = { pending: 0, overdue: 0, total: 0 }
      }
      if (r.effectiveStatus === "pending") {
        map[ag].pending++
        map[ag].total++
        if (r.isOverdue) {
          map[ag].overdue++
        }
      }
    })
    
    return Object.entries(map).map(([agency, stats]) => ({
      agency,
      ...stats
    })).sort((a, b) => b.total - a.total)
  }, [processedRecords])

  const exportAgencyPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const pendingRequests = processedRecords.filter(r => r.effectiveStatus === "pending")
    const sorted = [...pendingRequests].sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.createdAt || "").localeCompare(b.createdAt || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    doc.setFontSize(16)
    doc.setTextColor(30, 41, 59)
    doc.text("Agency-wise Pending Reconnection Report", pw / 2, 14, { align: "center" })
    
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending: ${pendingRequests.length}`,
      pw / 2, 20, { align: "center" }
    )

    const summaryRows = agencyStats.map((row, idx) => [
      idx + 1,
      row.agency,
      row.pending,
      row.overdue,
      row.total
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Agency", "Pending", "Overdue", "Total Pending"]],
      body: summaryRows,
      styles: { fontSize: 8.5, font: "helvetica", halign: "center", cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      theme: "grid"
    })

    const nextY = (doc as any).lastAutoTable.finalY + 10
    let startY = nextY
    if (startY > doc.internal.pageSize.height - 40) {
      doc.addPage()
      startY = 15
    }

    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text("Detailed Pending List (Grouped by Agency)", 14, startY)

    const cols = ["#", "Request ID", "Created At", "Consumer ID", "Consumer Name", "Mobile", "Address", "Agency", "Overdue"]
    const body = sorted.map((r, idx) => [
      idx + 1,
      r.requestId || "-",
      r.createdAt || "-",
      r.consumerId || "-",
      r.name || "-",
      r.mobile || "-",
      r.address || "-",
      r.agency || "Unassigned",
      r.isOverdue ? "Yes" : "No"
    ])

    autoTable(doc, {
      startY: startY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 8, font: "helvetica", cellPadding: 2.5 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 25 },
        4: { cellWidth: 40 },
        5: { cellWidth: 25 },
        6: { cellWidth: 80 },
        7: { cellWidth: 30 },
        8: { cellWidth: 15 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      },
      theme: "grid"
    })

    doc.save(`agency-wise-pending-reconnection-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "PDF Report downloaded" })
  }

  const exportAgencyPendingExcel = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    const summaryRows = [
      ["Agency-wise Pending Reconnections Progress Summary"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["Agency", "Pending", "Overdue", "Total Pending"]
    ]

    agencyStats.forEach(row => {
      summaryRows.push([
        row.agency,
        row.pending.toString(),
        row.overdue.toString(),
        row.total.toString()
      ])
    })

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, "Pending Summary")

    const pendingRequests = processedRecords.filter(r => r.effectiveStatus === "pending")
    const sorted = [...pendingRequests].sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.createdAt || "").localeCompare(b.createdAt || "")
    })

    const detailRows = sorted.map(r => ({
      "Request ID": r.requestId,
      "Created At": r.createdAt,
      "Consumer ID": r.consumerId,
      "Consumer Name": r.name,
      "Mobile": r.mobile,
      "Address": r.address,
      "Device": r.device || "",
      "Source": r.source || "",
      "Agency": r.agency || "Unassigned",
      "Is Overdue": r.isOverdue ? "Yes" : "No"
    }))

    const wsDetails = XLSX.utils.json_to_sheet(detailRows)
    XLSX.utils.book_append_sheet(wb, wsDetails, "Pending Details")

    XLSX.writeFile(wb, `agency-wise-pending-reconnection-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Excel Report downloaded" })
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = processedRecords
    if (tab !== "all") {
      if (tab === "overdue") {
        data = data.filter(r => r.isOverdue)
      } else {
        data = data.filter(r => r.effectiveStatus === tab)
      }
    }
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.consumerId.includes(q) || r.name.toLowerCase().includes(q) ||
        r.mobile.includes(q) || r.agency.toLowerCase().includes(q) ||
        (r.device && r.device.toLowerCase().includes(q))
      )
    }
    return data
  }, [processedRecords, tab, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search])

  // ── Agency permission check ───────────────────────────────────────────────
  const canUpdate = (r: ReconnectionRequest & { effectiveStatus?: string }) => {
    const statusToCheck = r.effectiveStatus || r.status
    if (statusToCheck !== "pending") return false
    if (isAdmin || (permissions && permissions.reconnection?.includes("update"))) return true
    return userAgencies.map(a => a.toUpperCase()).includes(r.agency.toUpperCase())
  }

  // ── Excel download ────────────────────────────────────────────────────────
  const downloadReport = async () => {
    if (!isAdmin) return
    const XLSX = (await import("xlsx")).default ?? await import("xlsx")
    const rows = filtered.map((r, i) => ({
      "#": i + 1,
      "Request ID": r.requestId,
      "Created": r.createdAt,
      "Consumer ID": r.consumerId,
      "Name": r.name,
      "Address": r.address,
      "Mobile": r.mobile,
      "Agency": r.agency,
      "Device": r.device,
      "Source": r.source,
      "Status": r.status,
      "Effective Status": r.effectiveStatus,
      "Is Overdue": r.isOverdue ? "Yes" : "No",
      "Updated": r.updatedAt,
      "Reading": r.reading,
      "Remarks": r.remarks,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Reconnection")
    XLSX.writeFile(wb, `Reconnection_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <ReconnectionCreateForm
        agencies={agencies}
        onSave={(id) => {
          toast({ title: "Request created", description: `ID: ${id}` })
          setView("list")
          load()
        }}
        onCancel={() => setView("list")}
      />
    )
  }

  if (view === "update" && selected) {
    return (
      <ReconnectionUpdateForm
        request={selected}
        userRole={userRole}
        username={username}
        onSave={() => {
          toast({ title: "Updated successfully" })
          setSelected(null)
          setView("list")
          load()
        }}
        onCancel={() => { setSelected(null); setView("list") }}
      />
    )
  }

  // ── Stats calculation ─────────────────────────────────────────────────────
  const pendingCount = processedRecords.filter(r => r.effectiveStatus === "pending").length
  const reconnectedCount = processedRecords.filter(r => r.effectiveStatus === "reconnected").length
  const doorLockedCount = processedRecords.filter(r => r.effectiveStatus === "door_locked").length
  const overdueCount = processedRecords.filter(r => r.isOverdue).length
  const allCount = records.length

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Controls & Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, meter..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>

          <Select value={tab} onValueChange={(val) => setTab(val as Tab)}>
            <SelectTrigger className="w-[155px] h-9 rounded-xl shrink-0 text-xs font-semibold bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors">
              <SelectValue placeholder="Status: Pending" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending" className="text-xs font-medium">⏳ Pending ({pendingCount})</SelectItem>
              <SelectItem value="reconnected" className="text-xs font-medium">✅ Reconnected ({reconnectedCount})</SelectItem>
              <SelectItem value="door_locked" className="text-xs font-medium">🔒 Door Locked ({doorLockedCount})</SelectItem>
              <SelectItem value="overdue" className="text-xs font-medium">⚠️ Overdue ({overdueCount})</SelectItem>
              {isAdmin && <SelectItem value="reports" className="text-xs font-medium">📊 Reports</SelectItem>}
              <SelectItem value="all" className="text-xs font-medium">📁 All ({allCount})</SelectItem>
            </SelectContent>
          </Select>

          {canCreate && (
            <Button
              size="sm"
              onClick={() => setView("create")}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 rounded-xl px-3 flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline font-bold">New Request</span>
            </Button>
          )}

          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl h-9 w-9 p-0">
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>{filtered.length} records</span>
            <button
              onClick={() => load()}
              disabled={syncState === "loading"}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors disabled:cursor-not-allowed ${syncState === "loading"
                  ? "border-blue-400 bg-blue-50 text-blue-500"
                  : syncState === "updated"
                    ? "border-green-500 bg-green-50 text-green-600"
                    : "border-blue-300 bg-blue-50 text-blue-500 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700 active:scale-95 cursor-pointer"
                }`}
              title={syncState === "loading" ? "Loading data..." : "Tap to refresh"}
            >
              {syncState === "loading" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-[10px] font-medium">Loading...</span>
                </>
              ) : syncState === "updated" ? (
                <>
                  <Check className="h-3 w-3" />
                  <span className="text-[10px] font-medium">Updated</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span className="text-[10px] font-medium">Refresh</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Reports tab */}
      {tab === "reports" && isAdmin && (
        <ReconnectionReports 
          records={processedRecords} 
          agencyStats={agencyStats} 
          exportAgencyPendingPDF={exportAgencyPendingPDF} 
          exportAgencyPendingExcel={exportAgencyPendingExcel} 
        />
      )}

      {/* List */}
      {tab !== "reports" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-gray-400 col-span-full">
            <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No reconnection requests found</p>
          </div>
        ) : paginated.map(r => {
          const overdueFlag = r.isOverdue
          const hrs = r.overdueHours
          return (
            <Card key={r.requestId} className={`shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden max-w-full ${overdueFlag ? "ring-2 ring-red-500 border-red-300" : "hover:border-blue-200"
              }`}>
              <CardHeader className="pb-3 break-words whitespace-normal">
                <div className="flex items-start justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CardTitle className="text-lg break-words whitespace-normal line-clamp-2 leading-tight font-semibold text-gray-900">{r.name}</CardTitle>
                      {overdueFlag && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse">OVERDUE</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 font-mono mt-1">ID: {r.consumerId}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.requestId}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.source === "dc_list"
                          ? "bg-blue-50 text-blue-600 border border-blue-100"
                          : "bg-purple-50 text-purple-600 border border-purple-100"
                        }`}>
                        {r.source === "dc_list" ? "DC List" : "Manual"}
                      </span>
                      {overdueFlag && (
                        <span className="text-[10px] text-red-600 font-bold">
                          ⚠ {Math.floor(hrs)}h overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1.5 shrink-0">
                    <StatusBadge status={r.status} effectiveStatus={r.effectiveStatus} />
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border-indigo-200">
                      {r.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 break-words whitespace-normal">
                {r.address && (
                  <div className="flex items-start space-x-2 min-w-0">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600 line-clamp-2" title={r.address}>{r.address}</p>
                  </div>
                )}
                {r.mobile && (
                  <a href={`tel:${r.mobile}`} className="flex items-center space-x-2 hover:underline">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-blue-600">{r.mobile}</p>
                  </a>
                )}
                {r.device && (
                  <div className="flex items-center space-x-2">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-indigo-600 font-mono">{r.device}</p>
                      <p className="text-[10px] text-gray-500">Meter / Device</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 pt-2 border-t border-dashed">
                  <div>
                    <span className="font-semibold text-gray-500">Created:</span> {formatTs(r.createdAt)}
                  </div>
                  {r.status !== "pending" && r.updatedAt ? (
                    <div>
                      <span className="font-semibold text-emerald-600">Updated:</span> {formatTs(r.updatedAt)}
                    </div>
                  ) : null}
                </div>

                {r.imageUrl && (
                  <div className="pt-2 pb-1 relative z-10">
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer">
                      <ImageIcon className="h-3.5 w-3.5" /> <span>View Evidence Image</span>
                    </a>
                  </div>
                )}

                {/* Actions / Buttons */}
                <div className="flex items-center gap-2 mt-4">
                  {canUpdate(r) && (
                    <Button
                      onClick={() => { setSelected(r); setView("update") }}
                      className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      size="sm"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Update Status
                    </Button>
                  )}
                  {isAdmin && r.effectiveStatus === "pending" && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-9 w-9 p-0 shrink-0 rounded-lg transition-colors"
                      title="Cancel Request"
                      onClick={async () => {
                        if (!confirm("Cancel this request?")) return
                        setRecords(prev => {
                          const updated = prev.map(x => x.requestId === r.requestId ? { ...x, status: "cancelled" as const } : x)
                          saveToCache(CACHE_KEY, updated)
                          return updated
                        })
                        fetch("/api/reconnection/update", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ requestId: r.requestId, status: "cancelled" }),
                        }).then(() => load(true)).catch(() => load(true))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && tab !== "reports" && (
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg">
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-lg">
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
      {/* Sticky bottom — Add Consumer */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full h-13 bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Add Consumer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReconnectionReports({ 
  records, 
  agencyStats,
  exportAgencyPendingPDF,
  exportAgencyPendingExcel
}: { 
  records: any[], 
  agencyStats: any[],
  exportAgencyPendingPDF: () => void,
  exportAgencyPendingExcel: () => void
}) {
  const total = records.length
  const pending = records.filter(r => r.effectiveStatus === "pending").length
  const overdue = records.filter(r => r.isOverdue).length
  const reconnected = records.filter(r => r.status === "reconnected").length
  const doorLocked = records.filter(r => r.status === "door_locked").length

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-xl p-4 border bg-white ${color}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1 text-slate-900">{value}</p>
    </div>
  )

  const TableCustom = ({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden text-slate-900">
      <div className="px-4 py-3 border-b bg-slate-50"><p className="font-semibold text-gray-800 text-sm">{title}</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-gray-650 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 ${j > 0 ? "font-mono font-semibold" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="text-center py-6 text-gray-400">
                  No records available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Requests" value={total} color="border-gray-200" />
        <StatCard label="Pending Reconnection" value={pending} color="border-yellow-250 bg-yellow-50/10" />
        <StatCard label="Overdue Requests" value={overdue} color="border-red-200 bg-red-50/10" />
        <StatCard label="Reconnected" value={reconnected} color="border-green-200 bg-green-50/10" />
        <StatCard label="Door Locked" value={doorLocked} color="border-orange-200 bg-orange-50/10" />
      </div>

      {/* Custom Reports Panel */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="px-5 py-4 border-b bg-slate-50/50">
          <h3 className="font-bold text-gray-950 text-sm">Download Custom Reports</h3>
          <p className="text-xs text-gray-500 mt-0.5">Generate customized PDF reports and Excel spreadsheets with summary pages</p>
        </div>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Agency Pending Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-blue-200 hover:bg-blue-50/5 transition">
              <div className="space-y-1.5 text-slate-900">
                <span className="text-[9px] font-bold tracking-wider text-blue-700 uppercase bg-blue-100/60 px-2 py-0.5 rounded-full">Report 1</span>
                <h4 className="font-bold text-gray-900 text-sm">Agency Pending Reconnection Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  List of reconnection requests pending with agencies, showing summary and detailed pending records.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 hover:text-red-800 transition" onClick={exportAgencyPendingPDF}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100 hover:text-green-800 transition" onClick={exportAgencyPendingExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Table */}
      {agencyStats.length > 0 && (
        <TableCustom 
          title="Agency Reconnection Performance" 
          headers={["Agency Name", "Pending Reconns", "Overdue Reconns", "Total Pending"]} 
          rows={agencyStats.map(a => [a.agency, a.pending, a.overdue, a.total])} 
        />
      )}
    </div>
  )
}

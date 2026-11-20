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
  DownloadCloud, Monitor, Building2, User, Edit, FileDown, FileSpreadsheet,
  Gauge, MessageSquare, ExternalLink
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { ReconnectionRequest } from "@/lib/reconnection-service"
import { ReconnectionCreateForm } from "@/components/reconnection-create-form"
import { ReconnectionUpdateForm } from "@/components/reconnection-update-form"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache, mergePatchToCache } from "@/lib/indexed-db"
import { getGoogleDriveDirectLink, handleImageError } from "@/lib/image-utils"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { useModuleVersionSync } from "@/hooks/use-module-version-sync"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { parseTs } from "@/lib/date-utils"
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
  const parsed = parseTs(ts)
  if (!parsed) return 0
  return (Date.now() - parsed) / 3_600_000
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
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("module_search_term")
      if (saved) {
        sessionStorage.removeItem("module_search_term")
        return saved
      }
    }
    return ""
  })

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.searchTerm) setSearch(e.detail.searchTerm)
    }
    window.addEventListener("set_module_search" as any, handler)
    return () => window.removeEventListener("set_module_search" as any, handler)
  }, [])
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useHashState<"list" | "create" | "update">("reconnection", "list")
  const [selected, setSelected] = useState<ReconnectionRequest | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)

  const isAdmin = userRole === "admin" || userRole === "executive"
  const canCreate = userRole === "admin" || userRole === "executive" || !!(permissions && permissions.reconnection?.includes("create"))
  const PAGE_SIZE = 15

  const { checkVersion } = useModuleVersionSync<ReconnectionRequest>("reconnection", CACHE_KEY, "requestId", (updated) => {
    setRecords([...updated].reverse())
    setSyncState("idle")
  })

  // Fast initial cache hydration directly on mount (<10ms first paint)
  useEffect(() => {
    getFromCache<ReconnectionRequest[]>(CACHE_KEY).then(cached => {
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setRecords([...cached].reverse())
        setSyncState("idle")
      }
    }).catch(() => {})
  }, [])

  const load = async (silent = false, force = false) => {
    if (!silent && records.length === 0) setSyncState("loading")
    try {
      if (force) {
        await fetch("/api/system/reset-base?moduleKey=reconnection", { method: "POST" }).catch(() => {})
      }
      await checkVersion(force)
      if (force) toast({ title: "Reconnection data resynced & base reset" })
      setSyncState("idle")
    } catch {
      setSyncState("idle")
      if (!silent && records.length === 0) toast({ title: "Failed to load reconnection data", variant: "destructive" })
    }
  }

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
        (r.device && r.device.toLowerCase().includes(q)) ||
        (r.reading && r.reading.toLowerCase().includes(q)) ||
        (r.remarks && r.remarks.toLowerCase().includes(q))
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
    const hasUpdatePerm = userRole === "admin" || (permissions && permissions.reconnection?.includes("update"))
    if (!hasUpdatePerm) return false
    if (userRole === "admin") return true
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
      <div className="animate-form-expand">
        <ReconnectionCreateForm
          agencies={agencies}
          onSave={(id) => {
            toast({ title: "Request created", description: `ID: ${id}` })
            setView("list")
            load()
          }}
          onCancel={() => setView("list")}
        />
      </div>
    )
  }

  if (view === "update" && selected) {
    return (
      <div className="animate-form-expand">
        <ReconnectionUpdateForm
          request={selected}
          userRole={userRole}
          username={username}
          onSave={() => {
            toast({ title: "Updated successfully" })
            setSelected(null)
            setView("list")
            load(true, true)
          }}
          onCancel={() => { setSelected(null); setView("list") }}
        />
      </div>
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
            <SelectTrigger className="notranslate w-[155px] h-9 rounded-xl shrink-0 text-xs font-semibold bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors">
              <SelectValue placeholder="Status: Pending" />
            </SelectTrigger>
            <SelectContent className="notranslate">
              <SelectItem value="pending" className="text-xs font-medium">⏳ Pending ({pendingCount})</SelectItem>
              <SelectItem value="reconnected" className="text-xs font-medium">✅ Reconnected ({reconnectedCount})</SelectItem>
              <SelectItem value="door_locked" className="text-xs font-medium">🔒 Door Locked ({doorLockedCount})</SelectItem>
              <SelectItem value="overdue" className="text-xs font-medium">⚠️ Overdue ({overdueCount})</SelectItem>
              {isAdmin && <SelectItem value="reports" className="text-xs font-medium">📊 Reports</SelectItem>}
              <SelectItem value="all" className="text-xs font-medium">📁 All ({allCount})</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl h-9 w-9 p-0">
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span><span className="notranslate font-bold text-gray-700">{filtered.length}</span> records</span>
            <button
              onClick={() => load(false, true)}
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
        <div className="animate-tab-enter">
          <ReconnectionReports 
            records={processedRecords} 
            agencyStats={agencyStats} 
            exportAgencyPendingPDF={exportAgencyPendingPDF} 
            exportAgencyPendingExcel={exportAgencyPendingExcel} 
          />
        </div>
      )}

      {/* List */}
      {tab !== "reports" && (
        <div key={tab} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 animate-tab-enter">
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-gray-400 col-span-full animate-fade-slide-up">
            <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No reconnection requests found</p>
          </div>
        ) : paginated.map((r, idx) => {
          const overdueFlag = r.isOverdue
          const hrs = r.overdueHours
          const leftBar = overdueFlag
            ? "border-l-red-600"
            : r.status === "reconnected"
            ? "border-l-emerald-500"
            : r.status === "door_locked"
            ? "border-l-amber-500"
            : r.status === "cancelled"
            ? "border-l-slate-400"
            : "border-l-blue-500"
          const headerBg = overdueFlag
            ? "bg-gradient-to-r from-red-50/85 via-rose-50/40 to-white"
            : r.status === "reconnected"
            ? "bg-gradient-to-r from-emerald-50/70 via-emerald-50/20 to-white"
            : "bg-gradient-to-r from-blue-50/70 via-blue-50/20 to-white"
          return (
            <Card key={r.requestId} className={`h-full flex flex-col justify-between bg-white rounded-xl border border-slate-300/85 border-l-4 ${leftBar} shadow-[0_2px_8px_-2px_rgba(15,23,42,0.09)] hover:shadow-[0_10px_20px_-6px_rgba(15,23,42,0.14)] card-interactive animate-card-enter stagger-${(idx % 6) + 1} overflow-hidden max-w-full ${overdueFlag ? "ring-2 ring-red-500/85 border-red-300" : ""}`}>
              {/* Compact Tinted Header */}
              <CardHeader className={`px-2.5 py-2 space-y-1 border-b border-slate-200/75 ${headerBg}`}>
                <div className="flex items-center justify-between gap-1 w-full">
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    <span className="font-mono text-[9px] font-bold text-slate-600 bg-white/90 border border-slate-200 px-1 py-0.5 rounded leading-none">
                      {r.requestId}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${r.source === "dc_list"
                        ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                        : "bg-purple-50 text-purple-700 border border-purple-200/80"
                      }`}>
                      {r.source === "dc_list" ? "DC" : "Manual"}
                    </span>
                    {overdueFlag && (
                      <span className="shrink-0 text-[8px] font-extrabold uppercase bg-red-600 text-white px-1 py-0.5 rounded leading-none animate-badge-pop">
                        ⚠ {Math.floor(hrs)}h
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={r.status} effectiveStatus={r.effectiveStatus} />
                  </div>
                </div>

                <CardTitle className="text-[13px] font-extrabold text-slate-900 line-clamp-1 leading-tight tracking-tight" title={r.name}>
                  {r.name}
                </CardTitle>

                <div className="flex items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-slate-700 bg-white/90 border border-slate-200/80 px-1.5 py-0.5 rounded leading-none">
                      {r.consumerId}
                    </span>
                    {r.mobile && (
                      <a href={`tel:${r.mobile}`} className="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 px-1.5 py-0.5 rounded font-semibold leading-none truncate">
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        <span>{r.mobile}</span>
                      </a>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase px-1.5 py-0 h-4 bg-indigo-50 text-indigo-700 border-indigo-200 max-w-[85px] truncate">
                    {r.agency}
                  </Badge>
                </div>
              </CardHeader>

              {/* Compact Body */}
              <CardContent className="px-2.5 py-2 space-y-1.5 flex-1 bg-white text-[11px] break-words whitespace-normal">
                {r.address && (
                  <div className="flex items-start gap-1 min-w-0">
                    <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug" title={r.address}>{r.address}</p>
                  </div>
                )}

                {(r.device || r.reading) && (
                  <div className="bg-slate-50/90 border border-slate-200/80 rounded-lg px-2 py-1 flex items-center justify-between gap-2 text-[10px]">
                    {r.device ? (
                      <span className="inline-flex items-center gap-1 truncate font-mono font-bold text-indigo-700">
                        <Monitor className="h-3 w-3 text-slate-400 shrink-0" />
                        {r.device}
                      </span>
                    ) : <span />}
                    {r.reading && (
                      <span className="inline-flex items-center gap-1 shrink-0 font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                        <Gauge className="h-3 w-3 text-emerald-600" />
                        {r.reading}
                      </span>
                    )}
                  </div>
                )}

                {r.remarks && (
                  <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] text-slate-700 leading-snug">
                    <span className="font-semibold text-slate-900">Note: </span>
                    <span className="line-clamp-2">{r.remarks}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 pt-1 border-t border-dashed border-slate-200">
                  <div className="truncate">
                    <span className="font-semibold">Cr:</span> {formatTs(r.createdAt)}
                  </div>
                  {r.status !== "pending" && r.updatedAt ? (
                    <div className="truncate text-right" title={r.updatedBy || ""}>
                      <span className="font-semibold text-emerald-600">Up:</span> {formatTs(r.updatedAt)}
                      {r.updatedBy && (
                        <span className="block text-[9px] text-slate-400 truncate">
                          By {r.updatedBy.replace(/^(agency|admin|executive|operator):/, "")}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              </CardContent>

              {/* Single-Row Compact Footer */}
              <div className="px-2.5 py-1.5 bg-slate-50/90 border-t border-slate-200/75 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  {r.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: r.imageUrl, title: `Evidence Photo — ${r.name} (${r.consumerId})` })}
                      className="h-7 px-1.5 inline-flex items-center gap-1 text-[10px] font-semibold rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer shrink-0"
                      title={r.status === "door_locked" ? "View Door Lock Photo" : "View Evidence Photo"}
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span>{r.status === "door_locked" ? "Lock" : "Proof"}</span>
                    </button>
                  )}
                  {r.requestImageUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: r.requestImageUrl, title: `Request Photo — ${r.name} (${r.consumerId})` })}
                      className="h-7 px-1.5 inline-flex items-center gap-1 text-[10px] font-semibold rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 cursor-pointer shrink-0"
                      title="View Request Photo"
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span>Req</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canUpdate(r) && (
                    <Button
                      onClick={() => { setSelected(r); setView("update") }}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold h-7 px-2.5 rounded-md shadow-2xs transition-colors"
                      size="sm"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Update
                    </Button>
                  )}
                  {isAdmin && r.effectiveStatus === "pending" && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-7 w-7 p-0 shrink-0 rounded-md transition-colors"
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
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
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
      {/* Sticky bottom — Add Reconnection */}
      {canCreate && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full h-13 bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Add Reconnection
            </Button>
          </div>
        </div>
      )}
      {/* Evidence Image Preview Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/95 text-white border-slate-800 rounded-2xl">
            <DialogHeader className="p-4 bg-slate-900 border-b border-slate-800 flex flex-row items-center justify-between space-y-0">
              <DialogTitle className="text-sm font-semibold text-slate-100 truncate pr-4">
                {previewImage.title}
              </DialogTitle>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Full Size
              </a>
            </DialogHeader>
            <div className="p-2 flex items-center justify-center min-h-[250px] max-h-[75vh] bg-slate-950">
              <img
                src={getGoogleDriveDirectLink(previewImage.url, 1600)}
                onError={(e) => handleImageError(e, previewImage.url)}
                alt="Evidence preview"
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
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
            <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-gray-600 font-semibold">{h}</th>)}</tr>
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
        <StatCard label="Pending Reconnection" value={pending} color="border-yellow-200 bg-yellow-50/10" />
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

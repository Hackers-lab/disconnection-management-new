"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { PermanentDisconnection, PDTab } from "@/lib/permanent-disconnection-types"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  PowerOff,
  Search,
  RefreshCw,
  Plus,
  Send,
  Camera,
  PackageCheck,
  FileText,
  Printer,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  MapPin,
  IndianRupee,
  Building2,
  XCircle,
  X,
  LayoutGrid,
  List,
  SlidersHorizontal,
  RotateCcw
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { PDProposeDialog } from "./pd-propose-dialog"
import { PDIssueDialog } from "./pd-issue-dialog"
import { PDDisconnectDialog } from "./pd-disconnect-dialog"
import { PDReturnDialog } from "./pd-return-dialog"
import { PDNoteSheetDialog } from "./pd-note-sheet-dialog"
import { PDCertificateModal } from "./pd-certificate-modal"
import { useModuleVersionSync } from "@/hooks/use-module-version-sync"

interface Props {
  userRole: string
  userAgencies?: string[]
  username?: string
  agencies?: string[]
  permissions?: Record<string, string[]>
}

const CACHE_KEY = "pd_data_cache"

export function PermanentDisconnectionList({
  userRole,
  userAgencies = [],
  username = "",
  agencies = [],
  permissions = {}
}: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<PermanentDisconnection[]>([])
  const [loading, setLoading] = useState(true)
  const [showKpis, setShowKpis] = useState(true)
  const [showAgencySummary, setShowAgencySummary] = useState(false)
  const [activeTab, setActiveTab] = useState<PDTab>("all")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)

  // Advanced Filters State
  const [filters, setFilters] = useState({
    agency: "all",
    meterCondition: "all",
    returnStatus: "all",
    noteSheetStatus: "all",
    minOsd: 0,
    fromDate: "",
    toDate: "",
  })

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog states
  const [proposeOpen, setProposeOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [noteSheetOpen, setNoteSheetOpen] = useState(false)
  const [certificateOpen, setCertificateOpen] = useState(false)

  // Selected item for modals
  const [activeRecord, setActiveRecord] = useState<PermanentDisconnection | null>(null)

  // Granular permissions evaluation
  const isAdmin = userRole === "admin" || userRole === "superuser"
  const isExec = userRole === "executive"
  const isAgency = userRole === "agency"

  const pdPerms = useMemo(() => {
    const list = [
      ...(permissions.permanent_disconnection || []),
      ...(permissions["permanent-disconnection"] || []),
      ...(permissions.pd || [])
    ]
    return new Set(list)
  }, [permissions])

  const canPropose = isAdmin || isExec || pdPerms.has("create")
  const canIssue = isAdmin || isExec || pdPerms.has("issue") || pdPerms.has("create")
  const canDisconnect = isAdmin || isAgency || pdPerms.has("install") || pdPerms.has("disconnect") || pdPerms.has("update")
  const canReturn = isAdmin || isExec || userRole === "store_keeper" || pdPerms.has("return")
  const canFinalize = isAdmin || isExec || pdPerms.has("finalize")

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (filters.agency !== "all") count++
    if (filters.meterCondition !== "all") count++
    if (filters.returnStatus !== "all") count++
    if (filters.noteSheetStatus !== "all") count++
    if (filters.minOsd > 0) count++
    if (filters.fromDate) count++
    if (filters.toDate) count++
    return count
  }, [filters])

  const handleResetFilters = () => {
    setFilters({
      agency: "all",
      meterCondition: "all",
      returnStatus: "all",
      noteSheetStatus: "all",
      minOsd: 0,
      fromDate: "",
      toDate: "",
    })
    setSearchInput("")
    setSearchQuery("")
  }

  const handleExecuteSearch = () => {
    setSearchQuery(searchInput.trim())
  }

  const { syncState, checkVersion } = useModuleVersionSync<PermanentDisconnection>(
    "permanent-disconnection",
    CACHE_KEY,
    "pdId",
    useCallback((freshData: PermanentDisconnection[]) => {
      setRecords(freshData)
      setLoading(false)
    }, [])
  )

  const loadData = useCallback(async (bypassCache = false) => {
    setLoading(true)
    try {
      if (bypassCache) {
        const res = await fetch(`/api/permanent-disconnection?bypassCache=true`)
        if (res.ok) {
          const fresh: PermanentDisconnection[] = await res.json()
          if (Array.isArray(fresh)) {
            setRecords(fresh)
            await saveToCache(CACHE_KEY, fresh)
          }
        }
        await checkVersion(true)
      } else {
        const cached = await getFromCache<PermanentDisconnection[]>(CACHE_KEY)
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setRecords(cached)
          setLoading(false)
        }
        await checkVersion(false)
      }
    } catch (e: any) {
      console.error("Error loading PD data:", e)
      toast({ title: "Failed to load records", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [checkVersion, toast])

  const handleProposeSuccess = (newRec?: PermanentDisconnection) => {
    if (newRec && typeof newRec === "object" && newRec.pdId) {
      setRecords(prev => {
        const next = [newRec, ...prev.filter(r => r.pdId !== newRec.pdId)]
        saveToCache(CACHE_KEY, next)
        return next
      })
    }
    loadData(true)
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Category counts
  const counts = useMemo(() => {
    const res = {
      all: records.length,
      proposed: 0,
      issued: 0,
      executed: 0,
      return_pending: 0,
      note_sheet_pending: 0,
      completed: 0,
      closed: 0
    }

    records.forEach(r => {
      const isClosed = r.status === "closed"
      const isDisconnected = r.status === "disconnected"
      const isReturned = r.meterReturnStatus === "returned"
      const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())

      if (isClosed) {
        res.closed += 1
      } else if (r.status === "proposed") {
        res.proposed += 1
      } else if (r.status === "issued") {
        res.issued += 1
      }

      if (isDisconnected && !isClosed) {
        res.executed += 1
        if (!isReturned) {
          res.return_pending += 1
        }
        if (!hasNoteSheet) {
          res.note_sheet_pending += 1
        }
        if (isReturned && hasNoteSheet) {
          res.completed += 1
        }
      }
    })

    return res
  }, [records])

  // Filtered dataset
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Tab filter
      const isClosed = r.status === "closed"
      const isDisconnected = r.status === "disconnected"
      const isReturned = r.meterReturnStatus === "returned"
      const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())

      if (activeTab === "proposed" && r.status !== "proposed") return false
      if (activeTab === "issued" && r.status !== "issued") return false
      if (activeTab === "executed" && (!isDisconnected || isClosed)) return false
      if (activeTab === "return_pending" && (!isDisconnected || isReturned || isClosed)) return false
      if (activeTab === "note_sheet_pending" && (!isDisconnected || hasNoteSheet || isClosed)) return false
      if (activeTab === "completed" && (!isDisconnected || !isReturned || !hasNoteSheet || isClosed)) return false
      if (activeTab === "closed" && !isClosed) return false

      // 2. Agency Filter
      if (filters.agency !== "all") {
        if ((r.agency || "").trim().toLowerCase() !== filters.agency.trim().toLowerCase()) {
          return false
        }
      }

      // 3. Meter Condition Filter
      if (filters.meterCondition !== "all") {
        if ((r.meterCondition || "").toLowerCase() !== filters.meterCondition.toLowerCase()) {
          return false
        }
      }

      // 4. Return Status Filter
      if (filters.returnStatus !== "all") {
        if (filters.returnStatus === "returned" && r.meterReturnStatus !== "returned") return false
        if (filters.returnStatus === "pending" && r.meterReturnStatus === "returned") return false
      }

      // 5. Note Sheet Status Filter
      if (filters.noteSheetStatus !== "all") {
        if (filters.noteSheetStatus === "done" && !hasNoteSheet) return false
        if (filters.noteSheetStatus === "pending" && hasNoteSheet) return false
      }

      // 6. Min OSD Filter
      if (filters.minOsd > 0 && (r.liveOsdAmount || 0) < filters.minOsd) {
        return false
      }

      // 7. Date Range Filter (Proposed Date or Disconnection Date)
      if (filters.fromDate || filters.toDate) {
        const rawDate = r.disconnectionDateTime || r.proposedDate || ""
        const recordDate = rawDate ? new Date(rawDate).toISOString().split("T")[0] : ""
        if (filters.fromDate && recordDate && recordDate < filters.fromDate) return false
        if (filters.toDate && recordDate && recordDate > filters.toDate) return false
      }

      // 8. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          (r.consumerId || "").toLowerCase().includes(q) ||
          (r.consumerName || "").toLowerCase().includes(q) ||
          (r.address || "").toLowerCase().includes(q) ||
          (r.mobile || "").toLowerCase().includes(q) ||
          (r.pdId || "").toLowerCase().includes(q) ||
          (r.removedMeterNo || "").toLowerCase().includes(q) ||
          (r.agency || "").toLowerCase().includes(q) ||
          (r.noteSheetNo || "").toLowerCase().includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [records, activeTab, filters, searchQuery])

  // Select all handler
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredRecords.map(r => r.pdId))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (pdId: string) => {
    setSelectedIds(prev => (prev.includes(pdId) ? prev.filter(id => id !== pdId) : [...prev, pdId]))
  }

  // Export CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      toast({ title: "No records to export", variant: "destructive" })
      return
    }

    const headers = [
      "PD ID",
      "Consumer ID",
      "Consumer Name",
      "Address",
      "Mobile",
      "Live OSD Amount (Rs)",
      "Status",
      "Agency",
      "Proposed Date",
      "Proposed By",
      "Issued Date",
      "Final Reading",
      "Removed Meter No",
      "Meter Condition",
      "Disconnection Date Time",
      "GPS Coordinates",
      "Meter Return Status",
      "Meter Return Date",
      "Meter Return Remarks",
      "Note Sheet No",
      "Note Sheet Date",
      "Stage"
    ]

    const rows = filteredRecords.map(r => {
      let stage = "Proposed"
      if (r.status === "closed") stage = "Closed / Cancelled"
      else if (r.status === "issued") stage = "Issued to Agency"
      else if (r.status === "disconnected") {
        if (r.meterReturnStatus === "returned" && r.noteSheetNo) stage = "Completed"
        else if (!r.noteSheetNo) stage = "Note Sheet Pending"
        else if (r.meterReturnStatus !== "returned") stage = "Meter Return Pending"
        else stage = "Executed"
      }

      return [
        r.pdId,
        `="${r.consumerId}"`,
        `"${(r.consumerName || "").replace(/"/g, '""')}"`,
        `"${(r.address || "").replace(/"/g, '""')}"`,
        `="${r.mobile || ""}"`,
        r.liveOsdAmount || 0,
        r.status,
        `"${r.agency || ""}"`,
        r.proposedDate,
        `"${r.proposedBy || ""}"`,
        r.issuedDate || "",
        r.finalReading || "",
        `="${r.removedMeterNo || ""}"`,
        r.meterCondition || "",
        r.disconnectionDateTime || "",
        r.latitude && r.longitude ? `${r.latitude}, ${r.longitude}` : "",
        r.meterReturnStatus || "pending",
        r.meterReturnDate || "",
        `"${(r.meterReturnRemarks || "").replace(/"/g, '""')}"`,
        `"${r.noteSheetNo || ""}"`,
        r.noteSheetDate || "",
        stage
      ]
    })

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Permanent_Disconnections_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Agency Performance Report
  const agencySummary = useMemo(() => {
    const map: Record<string, { total: number; proposed: number; issued: number; executed: number; returnDone: number; completed: number }> = {}

    records.forEach(r => {
      const ag = (r.agency || "Unassigned").trim() || "Unassigned"
      if (!map[ag]) {
        map[ag] = { total: 0, proposed: 0, issued: 0, executed: 0, returnDone: 0, completed: 0 }
      }
      map[ag].total += 1
      if (r.status === "proposed") map[ag].proposed += 1
      if (r.status === "issued") map[ag].issued += 1
      if (r.status === "disconnected") {
        map[ag].executed += 1
        if (r.meterReturnStatus === "returned") map[ag].returnDone += 1
        if (r.meterReturnStatus === "returned" && r.noteSheetNo) map[ag].completed += 1
      }
    })

    return Object.entries(map).map(([agency, stats]) => ({ agency, ...stats }))
  }, [records])

  return (
    <div className="space-y-4 p-2 sm:p-4 pb-24">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <PowerOff className="h-6 w-6 text-rose-600" />
            <span>Permanent Disconnection (PD)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track permanent meter dismantling, Live OSD dues, GIS photo evidence, CCC store returns, and Note Sheets.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading}
            className="text-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs shrink-0 text-slate-700 hover:text-emerald-700"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV
          </Button>

          {canPropose && (
            <Button
              size="sm"
              onClick={() => setProposeOpen(true)}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white shrink-0"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Propose PD
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible KPI Counters Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setShowKpis(v => !v)}
            className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer select-none transition-colors"
          >
            <PowerOff className="h-3.5 w-3.5 text-rose-600" />
            <span>KPI Stage Overview</span>
            {showKpis ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
          {!showKpis && (
            <span className="text-[11px] font-mono text-slate-500 font-semibold">
              Total: <strong className="text-slate-900">{counts.all}</strong> | Pending: <strong className="text-rose-700">{counts.proposed + counts.issued + counts.return_pending + counts.note_sheet_pending}</strong>
            </span>
          )}
        </div>

        {showKpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { key: "all", label: "All", count: counts.all, color: "text-slate-900", bg: "bg-slate-50 border-slate-200" },
              { key: "proposed", label: "Proposed", count: counts.proposed, color: "text-amber-700", bg: "bg-amber-50/70 border-amber-200" },
              { key: "issued", label: "Issued", count: counts.issued, color: "text-blue-700", bg: "bg-blue-50/70 border-blue-200" },
              { key: "executed", label: "Executed", count: counts.executed, color: "text-rose-700", bg: "bg-rose-50/70 border-rose-200" },
              { key: "return_pending", label: "Ret. Pending", count: counts.return_pending, color: "text-orange-700", bg: "bg-orange-50/70 border-orange-200" },
              { key: "note_sheet_pending", label: "NS Pending", count: counts.note_sheet_pending, color: "text-purple-700", bg: "bg-purple-50/70 border-purple-200" },
              { key: "completed", label: "Completed", count: counts.completed, color: "text-emerald-700", bg: "bg-emerald-50/70 border-emerald-200" }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key as PDTab)}
                className={`p-2.5 rounded-lg border text-left transition-all ${item.bg} ${
                  activeTab === item.key ? "ring-2 ring-slate-800 font-bold shadow-sm" : "hover:opacity-90"
                }`}
              >
                <div className="text-[11px] text-slate-500 font-medium truncate">{item.label}</div>
                <div className={`text-lg font-black font-mono ${item.color}`}>{item.count}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile-Optimized Compact Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b text-xs scrollbar-thin">
        {[
          { id: "all", label: "All" },
          { id: "proposed", label: `Proposed (${counts.proposed})` },
          { id: "issued", label: `Issued (${counts.issued})` },
          { id: "executed", label: `Executed (${counts.executed})` },
          { id: "return_pending", label: `Ret. Pending (${counts.return_pending})` },
          { id: "note_sheet_pending", label: `NS Pending (${counts.note_sheet_pending})` },
          { id: "completed", label: `Completed (${counts.completed})` },
          { id: "closed", label: `Closed (${counts.closed})` }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as PDTab)}
            className={`px-3 py-1.5 rounded-md font-semibold text-xs whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search and Filters Bar */}
      <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Search Input Row with Filter Icon right beside */}
          <div className="flex items-center gap-1.5 flex-1 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search Consumer ID, Name, Mobile, Meter No, Note Sheet No..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleExecuteSearch()
                  }
                }}
                className="pl-8 pr-8 text-xs h-9"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("")
                    setSearchQuery("")
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Icon Button placed directly alongside the Search Input */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsFilterDialogOpen(true)}
              className={`h-9 w-9 shrink-0 relative ${
                activeFiltersCount > 0
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              title="Open Advanced Filters"
            >
              <Filter className="h-4 w-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-600 border-2 border-white text-[9px] text-white flex items-center justify-center font-bold" />
              )}
            </Button>
          </div>

          {/* Dedicated Search Button */}
          <Button
            size="sm"
            onClick={handleExecuteSearch}
            className="h-9 px-3.5 text-xs bg-slate-900 hover:bg-slate-800 text-white shrink-0 w-full sm:w-auto"
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            Search
          </Button>

          {/* View Mode Toggle (Card vs List Table) */}
          <div className="flex items-center border rounded-md overflow-hidden shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-none ${viewMode === "card" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-500"}`}
              onClick={() => setViewMode("card")}
              title="Card Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-slate-200" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-none ${viewMode === "list" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-500"}`}
              onClick={() => setViewMode("list")}
              title="Table List View"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Bulk Action Button (if items selected) */}
          {selectedIds.length > 0 && canIssue && (
            <Button
              size="sm"
              onClick={() => setIssueOpen(true)}
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 w-full sm:w-auto"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Issue {selectedIds.length} Selected
            </Button>
          )}
        </div>

        {/* Active Filter Pills Bar */}
        {(activeFiltersCount > 0 || searchQuery) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Active filters:</span>

            {searchQuery && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-slate-100 text-slate-800 font-medium">
                Query: "{searchQuery}"
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => {
                    setSearchInput("")
                    setSearchQuery("")
                  }}
                />
              </Badge>
            )}

            {filters.agency !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-blue-50 text-blue-800 border border-blue-200">
                Agency: {filters.agency}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, agency: "all" }))}
                />
              </Badge>
            )}

            {filters.meterCondition !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-amber-50 text-amber-800 border border-amber-200 capitalize">
                Condition: {filters.meterCondition}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, meterCondition: "all" }))}
                />
              </Badge>
            )}

            {filters.returnStatus !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                Store Return: {filters.returnStatus === "returned" ? "Returned" : "Pending Return"}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, returnStatus: "all" }))}
                />
              </Badge>
            )}

            {filters.noteSheetStatus !== "all" && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-purple-50 text-purple-800 border border-purple-200">
                Note Sheet: {filters.noteSheetStatus === "done" ? "Done" : "Pending"}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, noteSheetStatus: "all" }))}
                />
              </Badge>
            )}

            {filters.minOsd > 0 && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-rose-50 text-rose-800 border border-rose-200">
                Min OSD: ₹{filters.minOsd}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, minOsd: 0 }))}
                />
              </Badge>
            )}

            {(filters.fromDate || filters.toDate) && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-slate-100 text-slate-800">
                Date: {filters.fromDate || "Start"} &rarr; {filters.toDate || "End"}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, fromDate: "", toDate: "" }))}
                />
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-6 text-[11px] px-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 ml-auto"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset All
            </Button>
          </div>
        )}
      </div>

      {/* Main Records List / Table */}
      {filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center space-y-3">
          <PowerOff className="h-10 w-10 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">No Permanent Disconnection Records Found</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {searchQuery || activeFiltersCount > 0
              ? `No records matching your search or filters under ${activeTab} tab.`
              : `No consumers currently in ${activeTab} stage.`}
          </p>
          <div className="flex gap-2">
            {(activeFiltersCount > 0 || searchQuery) && (
              <Button size="sm" variant="outline" onClick={handleResetFilters} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Filters
              </Button>
            )}
            {canPropose && (
              <Button size="sm" onClick={() => setProposeOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Propose Consumer for PD
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {viewMode === "card" ? (
            /* Card View for Mobile & Desktop */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRecords.map(r => {
                const isClosed = r.status === "closed"
                const isDisconnected = r.status === "disconnected"
                const isReturned = r.meterReturnStatus === "returned"
                const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())
                const isFullyCompleted = isDisconnected && isReturned && hasNoteSheet && !isClosed

                return (
                  <div
                    key={r.pdId}
                    className={`bg-white rounded-xl border p-3.5 space-y-3 shadow-sm hover:shadow transition-shadow relative ${
                      isFullyCompleted
                        ? "border-emerald-200 bg-emerald-50/10"
                        : isClosed
                        ? "border-slate-200 opacity-70"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Top Header: ID & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {canIssue && r.status === "proposed" && (
                          <Checkbox
                            checked={selectedIds.includes(r.pdId)}
                            onCheckedChange={() => handleToggleSelect(r.pdId)}
                            className="h-4 w-4"
                          />
                        )}
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 font-bold">{r.pdId}</span>
                          <h3 className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1.5">
                            <span>{r.consumerName}</span>
                            <span className="font-mono text-rose-700 font-black text-xs">#{r.consumerId}</span>
                          </h3>
                        </div>
                      </div>

                      {/* Stage Badges */}
                      <div className="flex flex-col items-end gap-1">
                        {isFullyCompleted ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                            ✓ Completed
                          </Badge>
                        ) : isClosed ? (
                          <Badge className="bg-slate-100 text-slate-700 border border-slate-300 text-[10px]">
                            Closed
                          </Badge>
                        ) : r.status === "proposed" ? (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
                            Proposed
                          </Badge>
                        ) : r.status === "issued" ? (
                          <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px]">
                            Issued to Agency
                          </Badge>
                        ) : isDisconnected ? (
                          <Badge className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px]">
                            Meter Dismantled
                          </Badge>
                        ) : null}

                        {/* Live OSD Badge */}
                        {r.liveOsdAmount > 0 && (
                          <span className="inline-flex items-center text-[10px] font-mono font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                            OSD: ₹{r.liveOsdAmount.toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Address & Mobile */}
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p className="line-clamp-1">{r.address}</p>
                      <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                        <span>Agency: <strong className="text-slate-800">{r.agency || "Unassigned"}</strong></span>
                        <span>Proposed: {r.proposedDate}</span>
                      </div>
                    </div>

                    {/* Disconnection & Store Return Details */}
                    {isDisconnected && (
                      <div className="bg-slate-50 p-2 rounded-lg text-[11px] space-y-1 border border-slate-100">
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <span className="text-slate-400">Removed Meter:</span>{" "}
                            <strong className="font-mono text-blue-700">{r.removedMeterNo || "—"}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Final Reading:</span>{" "}
                            <strong className="font-mono text-emerald-700">{r.finalReading || "—"}</strong>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 text-[10px]">
                          <span>
                            Store Return:{" "}
                            <strong className={isReturned ? "text-emerald-700 font-bold" : "text-amber-700"}>
                              {isReturned ? `✓ Returned (${r.meterReturnDate || ""})` : "Pending Return"}
                            </strong>
                          </span>
                          <span>
                            Note Sheet:{" "}
                            <strong className={hasNoteSheet ? "text-purple-700 font-bold font-mono" : "text-slate-400"}>
                              {r.noteSheetNo || "Pending"}
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Toolbar */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                      {/* 1. Issue Button */}
                      {canIssue && r.status === "proposed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setIssueOpen(true)
                          }}
                          className="h-7 text-[11px] px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                        >
                          <Send className="h-3 w-3 mr-1" /> Issue to Agency
                        </Button>
                      )}

                      {/* 2. Execute Disconnection Button */}
                      {canDisconnect && (r.status === "issued" || r.status === "proposed") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setDisconnectOpen(true)
                          }}
                          className="h-7 text-[11px] px-2 text-rose-700 border-rose-200 hover:bg-rose-50 font-bold"
                        >
                          <Camera className="h-3 w-3 mr-1" /> Mark Disconnected
                        </Button>
                      )}

                      {/* 3. Return Meter Button */}
                      {canReturn && isDisconnected && !isReturned && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setReturnOpen(true)
                          }}
                          className="h-7 text-[11px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium"
                        >
                          <PackageCheck className="h-3 w-3 mr-1" /> Return Meter
                        </Button>
                      )}

                      {/* 4. Note Sheet Button */}
                      {canFinalize && isDisconnected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setNoteSheetOpen(true)
                          }}
                          className="h-7 text-[11px] px-2 text-purple-700 border-purple-200 hover:bg-purple-50 font-medium"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {hasNoteSheet ? "Edit Note Sheet" : "+ Note Sheet"}
                        </Button>
                      )}

                      {/* 5. Printable Memo */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveRecord(r)
                          setCertificateOpen(true)
                        }}
                        className="h-7 text-[11px] px-2 text-slate-600 hover:text-slate-900 ml-auto"
                        title="Print Disconnection Memo"
                      >
                        <Printer className="h-3 w-3 mr-1" /> Memo
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Table List View for Desktop */
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] bg-slate-50">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>PD ID / Con ID</TableHead>
                    <TableHead>Consumer Name & Address</TableHead>
                    <TableHead className="text-center">Live OSD</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Removed Meter / Reading</TableHead>
                    <TableHead className="text-center">Store Return</TableHead>
                    <TableHead className="text-center">Note Sheet</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map(r => {
                    const isClosed = r.status === "closed"
                    const isDisconnected = r.status === "disconnected"
                    const isReturned = r.meterReturnStatus === "returned"
                    const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())
                    const isFullyCompleted = isDisconnected && isReturned && hasNoteSheet && !isClosed

                    return (
                      <TableRow key={r.pdId} className="text-xs hover:bg-slate-50/80">
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.includes(r.pdId)}
                            onCheckedChange={() => handleToggleSelect(r.pdId)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-[10px] text-slate-400">{r.pdId}</div>
                          <div className="font-mono font-bold text-rose-700">#{r.consumerId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-900">{r.consumerName}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">{r.address}</div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-rose-700">
                          {r.liveOsdAmount > 0 ? `₹${r.liveOsdAmount.toLocaleString("en-IN")}` : "₹0"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">
                          {r.agency || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {isFullyCompleted ? (
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Completed</Badge>
                          ) : isClosed ? (
                            <Badge className="bg-slate-100 text-slate-700 text-[10px]">Closed</Badge>
                          ) : r.status === "proposed" ? (
                            <Badge className="bg-amber-100 text-amber-800 text-[10px]">Proposed</Badge>
                          ) : r.status === "issued" ? (
                            <Badge className="bg-blue-100 text-blue-800 text-[10px]">Issued</Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-800 text-[10px]">Dismantled</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDisconnected ? (
                            <div className="font-mono text-[11px]">
                              <span className="text-blue-700 font-bold">{r.removedMeterNo || "—"}</span>
                              <span className="text-slate-400"> / </span>
                              <span className="text-emerald-700 font-bold">{r.finalReading || "—"} kWh</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isReturned ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-slate-400"
                            }`}
                          >
                            {isReturned ? `✓ ${r.meterReturnDate || "Returned"}` : "Pending"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {hasNoteSheet ? (
                            <span className="font-bold text-purple-700">{r.noteSheetNo}</span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canIssue && r.status === "proposed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setIssueOpen(true)
                                }}
                                className="h-6 text-[10px] px-2 text-blue-700"
                              >
                                Issue
                              </Button>
                            )}
                            {canDisconnect && (r.status === "issued" || r.status === "proposed") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setDisconnectOpen(true)
                                }}
                                className="h-6 text-[10px] px-2 text-rose-700 font-bold"
                              >
                                Disconnect
                              </Button>
                            )}
                            {canReturn && isDisconnected && !isReturned && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setReturnOpen(true)
                                }}
                                className="h-6 text-[10px] px-2 text-emerald-700"
                              >
                                Return
                              </Button>
                            )}
                            {canFinalize && isDisconnected && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setNoteSheetOpen(true)
                                }}
                                className="h-6 text-[10px] px-2 text-purple-700"
                              >
                                Note Sheet
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setActiveRecord(r)
                                setCertificateOpen(true)
                              }}
                              className="h-6 text-[10px] px-1.5 text-slate-600"
                              title="Print Memo"
                            >
                              <Printer className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Agency Performance Breakdown Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAgencySummary(v => !v)}
            className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-950 transition-colors"
          >
            <Building2 className="h-4 w-4 text-slate-600" />
            <span>Agency Tracking & Progress Summary</span>
            {showAgencySummary ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
        </div>

        {showAgencySummary && (
          <div className="overflow-x-auto pt-1">
            <Table>
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="font-bold">Agency Name</TableHead>
                  <TableHead className="text-center">Total Assigned</TableHead>
                  <TableHead className="text-center">Pending Field Execution</TableHead>
                  <TableHead className="text-center">Dismantled (Executed)</TableHead>
                  <TableHead className="text-center">Meter Returned</TableHead>
                  <TableHead className="text-center">Completed (Full)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencySummary.map(row => (
                  <TableRow key={row.agency} className="text-xs">
                    <TableCell className="font-semibold text-slate-800">{row.agency}</TableCell>
                    <TableCell className="text-center font-mono font-bold">{row.total}</TableCell>
                    <TableCell className="text-center font-mono text-blue-700 font-bold">{row.issued}</TableCell>
                    <TableCell className="text-center font-mono text-rose-700 font-bold">{row.executed}</TableCell>
                    <TableCell className="text-center font-mono text-emerald-700 font-bold">{row.returnDone}</TableCell>
                    <TableCell className="text-center font-mono text-purple-700 font-black">{row.completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Advanced Filters Dialog Modal */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
              <SlidersHorizontal className="h-5 w-5 text-rose-600" />
              <span>Advanced Filter Options</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 my-2 text-xs">
            {/* Agency Selector */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Filter by Agency</Label>
              <Select
                value={filters.agency}
                onValueChange={v => setFilters(prev => ({ ...prev, agency: v }))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All Agencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  {agencies.map(ag => (
                    <SelectItem key={ag} value={ag} className="text-xs">
                      {ag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Meter Condition */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Removed Meter Condition</Label>
              <Select
                value={filters.meterCondition}
                onValueChange={v => setFilters(prev => ({ ...prev, meterCondition: v }))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All Conditions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="working">Working / Normal</SelectItem>
                  <SelectItem value="faulty">Faulty / Defective</SelectItem>
                  <SelectItem value="burnt">Burnt / Melted</SelectItem>
                  <SelectItem value="damaged">Damaged / Tampered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Store Return Status */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Store Return Status</Label>
              <Select
                value={filters.returnStatus}
                onValueChange={v => setFilters(prev => ({ ...prev, returnStatus: v }))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Return Statuses</SelectItem>
                  <SelectItem value="returned">✓ Meter Returned to Store</SelectItem>
                  <SelectItem value="pending">Pending Return to Store</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note Sheet Status */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Note Sheet Status</Label>
              <Select
                value={filters.noteSheetStatus}
                onValueChange={v => setFilters(prev => ({ ...prev, noteSheetStatus: v }))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Note Sheet Statuses</SelectItem>
                  <SelectItem value="done">Note Sheet Entered (Done)</SelectItem>
                  <SelectItem value="pending">Note Sheet Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Live OSD */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Minimum Live OSD Dues (₹)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={filters.minOsd || ""}
                onChange={e => setFilters(prev => ({ ...prev, minOsd: parseFloat(e.target.value) || 0 }))}
                className="text-xs font-mono"
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">From Date</Label>
                <Input
                  type="date"
                  value={filters.fromDate}
                  onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">To Date</Label>
                <Input
                  type="date"
                  value={filters.toDate}
                  onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-800"
            >
              Reset All
            </Button>
            <Button
              size="sm"
              onClick={() => setIsFilterDialogOpen(false)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs"
            >
              Apply Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <PDProposeDialog
        isOpen={proposeOpen}
        onClose={() => setProposeOpen(false)}
        onSuccess={handleProposeSuccess}
        agencies={agencies}
      />

      <PDIssueDialog
        isOpen={issueOpen}
        onClose={() => {
          setIssueOpen(false)
          setActiveRecord(null)
          setSelectedIds([])
        }}
        onSuccess={() => loadData(true)}
        pdIds={activeRecord ? [activeRecord.pdId] : selectedIds}
        agencies={agencies}
        currentAgency={activeRecord?.agency || ""}
      />

      <PDDisconnectDialog
        isOpen={disconnectOpen}
        onClose={() => {
          setDisconnectOpen(false)
          setActiveRecord(null)
        }}
        onSuccess={() => loadData(true)}
        record={activeRecord}
      />

      <PDReturnDialog
        isOpen={returnOpen}
        onClose={() => {
          setReturnOpen(false)
          setActiveRecord(null)
        }}
        onSuccess={() => loadData(true)}
        record={activeRecord}
      />

      <PDNoteSheetDialog
        isOpen={noteSheetOpen}
        onClose={() => {
          setNoteSheetOpen(false)
          setActiveRecord(null)
        }}
        onSuccess={() => loadData(true)}
        pdId={activeRecord?.pdId}
        currentNoteSheetNo={activeRecord?.noteSheetNo}
        currentNoteSheetDate={activeRecord?.noteSheetDate}
      />

      <PDCertificateModal
        isOpen={certificateOpen}
        onClose={() => {
          setCertificateOpen(false)
          setActiveRecord(null)
        }}
        record={activeRecord}
      />
    </div>
  )
}

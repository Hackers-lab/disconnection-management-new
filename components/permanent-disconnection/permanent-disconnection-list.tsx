"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { PermanentDisconnection, PDTab } from "@/lib/permanent-disconnection-types"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  ChevronDown,
  ChevronUp,
  MapPin,
  IndianRupee,
  Building2,
  X,
  LayoutGrid,
  List,
  SlidersHorizontal,
  RotateCcw,
  MoreVertical,
  Phone,
  Zap,
  Gauge,
  TrendingUp,
  BarChart3,
  FileSpreadsheet,
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
  const [showDashboard, setShowDashboard] = useState(false)
  const [activeTab, setActiveTab] = useState<PDTab>("all")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [consumerMasterMap, setConsumerMasterMap] = useState<Record<string, any>>({})
  const [dynamicAgencies, setDynamicAgencies] = useState<string[]>(agencies)

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

  // Load consumer master details and agencies cache
  useEffect(() => {
    async function loadAuxData() {
      try {
        const [cachedMaster, cachedConsumers, cachedAgencies, cachedZoneMap] = await Promise.all([
          getFromCache<any[]>("consumer_master_cache"),
          getFromCache<any[]>("consumers_data_cache"),
          getFromCache<string[]>("agencies_data_cache"),
          getFromCache<{ zone: string; agency: string }[]>("zone_map_cache")
        ])

        const map: Record<string, any> = {}
        if (cachedMaster && Array.isArray(cachedMaster)) {
          cachedMaster.forEach(c => {
            const cid = String(c.consumerId || "").trim()
            if (cid) map[cid] = c
          })
        }
        if (cachedConsumers && Array.isArray(cachedConsumers)) {
          cachedConsumers.forEach(c => {
            const cid = String(c.consumerId || "").trim()
            if (cid && !map[cid]) {
              map[cid] = c
            }
          })
        }
        setConsumerMasterMap(map)

        const allAg = new Set<string>(agencies.filter(Boolean))
        if (cachedAgencies && Array.isArray(cachedAgencies)) {
          cachedAgencies.forEach(a => { if (a) allAg.add(a.trim()) })
        }
        if (cachedZoneMap && Array.isArray(cachedZoneMap)) {
          cachedZoneMap.forEach(z => { if (z.agency) allAg.add(z.agency.trim()) })
        }
        if (cachedConsumers && Array.isArray(cachedConsumers)) {
          cachedConsumers.forEach(c => { if (c.agency) allAg.add(c.agency.trim()) })
        }
        const sorted = Array.from(allAg).filter(Boolean).sort()
        if (sorted.length > 0) {
          setDynamicAgencies(sorted)
        }
      } catch { /* ignore */ }
    }
    loadAuxData()
  }, [agencies])

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

  // Live search as user types
  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    setSearchQuery(val.trim())
  }

  // Fast initial cache hydration directly on mount (<10ms first paint)
  useEffect(() => {
    let isMounted = true
    getFromCache<PermanentDisconnection[]>(CACHE_KEY).then(cached => {
      if (isMounted && cached && Array.isArray(cached) && cached.length > 0) {
        setRecords(cached)
        setLoading(false)
      }
    }).catch(() => {})
    return () => { isMounted = false }
  }, [])

  const { syncState, checkVersion } = useModuleVersionSync<PermanentDisconnection>(
    "permanent-disconnection",
    CACHE_KEY,
    "pdId",
    "/api/permanent-disconnection?bypassCache=true",
    useCallback((freshData: PermanentDisconnection[]) => {
      setRecords(freshData)
      setLoading(false)
    }, [])
  )

  const loadData = useCallback(async (bypassCache = false) => {
    try {
      if (bypassCache) {
        setLoading(true)
        const res = await fetch(`/api/permanent-disconnection?bypassCache=true`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        })
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
        const aux = consumerMasterMap[r.consumerId] || {}
        const matches =
          (r.consumerId || "").toLowerCase().includes(q) ||
          (r.consumerName || "").toLowerCase().includes(q) ||
          (r.address || "").toLowerCase().includes(q) ||
          (r.meterNumber || "").toLowerCase().includes(q) ||
          (r.mobile || "").toLowerCase().includes(q) ||
          (aux.mobile || "").toLowerCase().includes(q) ||
          (r.pdId || "").toLowerCase().includes(q) ||
          (r.removedMeterNo || "").toLowerCase().includes(q) ||
          (aux.meterNumber || aux.meterNo || "").toLowerCase().includes(q) ||
          (r.agency || "").toLowerCase().includes(q) ||
          (r.noteSheetNo || "").toLowerCase().includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [records, activeTab, filters, searchQuery, consumerMasterMap])

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
      "Meter Number",
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
        `="${r.meterNumber || ""}"`,
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
    <div className="space-y-4 p-2 sm:p-4 pb-28">
      {/* 1. Full-Width Collapsible Dashboard Bar (Collapsed by default) */}
      <div className="space-y-3">
        <div
          className="flex justify-between items-center p-3.5 sm:p-4 rounded-2xl cursor-pointer bg-white/80 hover:bg-white backdrop-blur-md border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300"
          onClick={() => setShowDashboard(v => !v)}
        >
          <div className="flex items-center gap-3">
            <span className={`p-2 rounded-xl transition-colors duration-300 ${showDashboard ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
              <TrendingUp className="h-5 w-5" />
            </span>
            <span className="font-bold text-slate-800 text-sm tracking-tight">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              {showDashboard ? "Hide Panel" : "Show Panel"}
            </span>
            <div className={`p-1.5 rounded-lg ${showDashboard ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"} transition-colors duration-200`}>
              {showDashboard ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>

        {showDashboard && (
          <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { key: "all", label: "All", count: counts.all, color: "text-slate-900", bg: "bg-slate-50/80 border-slate-200" },
                { key: "proposed", label: "Proposed", count: counts.proposed, color: "text-amber-700", bg: "bg-amber-50/70 border-amber-200" },
                { key: "issued", label: "Issued", count: counts.issued, color: "text-blue-700", bg: "bg-blue-50/70 border-blue-200" },
                { key: "executed", label: "Dismantled", count: counts.executed, color: "text-rose-700", bg: "bg-rose-50/70 border-rose-200" },
                { key: "return_pending", label: "Ret. Pending", count: counts.return_pending, color: "text-orange-700", bg: "bg-orange-50/70 border-orange-200" },
                { key: "note_sheet_pending", label: "NS Pending", count: counts.note_sheet_pending, color: "text-purple-700", bg: "bg-purple-50/70 border-purple-200" },
                { key: "completed", label: "Completed", count: counts.completed, color: "text-emerald-700", bg: "bg-emerald-50/70 border-emerald-200" },
                { key: "closed", label: "Closed", count: counts.closed, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key as PDTab)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${item.bg} ${
                    activeTab === item.key ? "ring-2 ring-slate-900 font-bold shadow-sm" : "hover:opacity-90"
                  }`}
                >
                  <div className="text-[11px] text-slate-500 font-medium truncate">{item.label}</div>
                  <div className={`text-lg font-black font-mono ${item.color}`}>{item.count}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Compact Stage Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-thin">
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
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 3. Search and Options Bar (No extra Search button, with 3-dot dropdown) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-sm">
          {/* Search Input with looking glass only */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Consumer ID, Name, Mobile, Meter No, Zone..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-8 pr-8 text-xs h-9 border-slate-200 bg-slate-50/50 focus:bg-white"
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

          {/* Filter Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFilterDialogOpen(true)}
            className={`h-9 w-9 shrink-0 relative ${
              activeFiltersCount > 0
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            title="Filter Options"
          >
            <Filter className="h-4 w-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-600 border-2 border-white text-[9px] text-white flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
          </Button>

          {/* 3-Dot Options Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 text-slate-600 hover:bg-slate-50"
                title="More Options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleExportCSV} className="text-xs cursor-pointer gap-2">
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                <span>Export Filtered CSV</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)} className="text-xs cursor-pointer gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5 text-purple-600" />
                <span>Tracking Summary Report</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setViewMode(viewMode === "card" ? "list" : "card")}
                className="text-xs cursor-pointer gap-2"
              >
                {viewMode === "card" ? (
                  <>
                    <List className="h-3.5 w-3.5 text-slate-600" />
                    <span>Switch to Table View</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="h-3.5 w-3.5 text-slate-600" />
                    <span>Switch to Card View</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => loadData(true)} className="text-xs cursor-pointer gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                <span>Force Server Refresh</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk Action Button (if items selected) */}
          {selectedIds.length > 0 && canIssue && (
            <Button
              size="sm"
              onClick={() => setIssueOpen(true)}
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Issue ({selectedIds.length})
            </Button>
          )}
        </div>

        {/* 4. Tab Counts Summary + Refresh Icon Below Search Bar */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadData(true)}
              disabled={loading}
              className="h-7 w-7 p-0 rounded-full hover:bg-slate-100 text-slate-600"
              title="Refresh PD Records"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-rose-600" : ""}`} />
            </Button>
            <span className="font-semibold text-slate-700">
              Showing <span className="font-mono font-bold text-slate-900">{filteredRecords.length}</span> record{filteredRecords.length !== 1 ? "s" : ""}
              {activeTab !== "all" && (
                <span className="text-slate-400 font-normal"> &bull; {activeTab.replace(/_/g, " ")}</span>
              )}
            </span>
          </div>

          {(activeFiltersCount > 0 || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-6 text-[11px] px-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset Filters
            </Button>
          )}
        </div>

        {/* Active Filter Badges */}
        {(activeFiltersCount > 0 || searchQuery) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
            {searchQuery && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-slate-100 text-slate-800">
                "{searchQuery}"
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
            {filters.minOsd > 0 && (
              <Badge variant="secondary" className="gap-1 text-[11px] bg-rose-50 text-rose-800 border border-rose-200">
                Min OSD: ₹{filters.minOsd}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-600"
                  onClick={() => setFilters(prev => ({ ...prev, minOsd: 0 }))}
                />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* 5. Main Content: Redesigned Cards or List Table */}
      {filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
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
              <Button size="sm" onClick={() => setProposeOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Propose Consumer for PD
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div>
          {viewMode === "card" ? (
            /* Redesigned SVG-Enriched Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredRecords.map(r => {
                const isClosed = r.status === "closed"
                const isDisconnected = r.status === "disconnected"
                const isReturned = r.meterReturnStatus === "returned"
                const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())
                const isFullyCompleted = isDisconnected && isReturned && hasNoteSheet && !isClosed

                // Aux data from consumer master or consumers dataset
                const aux = consumerMasterMap[r.consumerId] || {}
                const phoneNum = r.mobile || aux.mobile || aux.mobileNumber || ""
                const meterNum = r.removedMeterNo || aux.meterNumber || aux.meterNo || aux.meter || ""
                const zoneName = aux.zone || aux.mru || ""
                const phaseVal = aux.phase || (aux.tariff && aux.tariff.includes("3") ? "3-Phase" : "1-Phase")

                return (
                  <div
                    key={r.pdId}
                    className={`bg-white rounded-2xl border p-4 space-y-3.5 shadow-sm hover:shadow-md transition-all relative ${
                      isFullyCompleted
                        ? "border-emerald-200 bg-emerald-50/10"
                        : isClosed
                        ? "border-slate-200 opacity-70"
                        : "border-slate-200/90"
                    }`}
                  >
                    {/* Header: Consumer Name, ID, Checkbox & Stage Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        {canIssue && r.status === "proposed" && (
                          <Checkbox
                            checked={selectedIds.includes(r.pdId)}
                            onCheckedChange={() => handleToggleSelect(r.pdId)}
                            className="h-4 w-4 mt-1"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {r.pdId}
                            </span>
                            <span className="font-mono font-black text-xs text-rose-700">
                              #{r.consumerId}
                            </span>
                          </div>
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 leading-snug">
                            {r.consumerName}
                          </h3>
                        </div>
                      </div>

                      {/* Stage Pill */}
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
                            Issued
                          </Badge>
                        ) : isDisconnected ? (
                          <Badge className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px]">
                            Dismantled
                          </Badge>
                        ) : null}

                        {/* Live OSD Badge */}
                        {r.liveOsdAmount > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full border border-rose-200">
                            <IndianRupee className="h-2.5 w-2.5" />
                            {r.liveOsdAmount.toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] font-mono font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full border border-slate-200">
                            OSD: Unverified
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Address with Location SVG */}
                    <div className="flex items-start gap-1.5 text-xs text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="line-clamp-2 text-[11px] leading-tight text-slate-600">{r.address}</p>
                    </div>

                    {/* Technical & Contact Details Grid (SVG icons) */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                      {/* Mobile with Direct Call Option */}
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        {phoneNum ? (
                          <a
                            href={`tel:${phoneNum}`}
                            className="font-mono text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline truncate"
                            title="Click to Call"
                          >
                            {phoneNum}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">No Mobile</span>
                        )}
                      </div>

                      {/* Meter Number */}
                      <div className="flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-800 font-semibold truncate" title={`Meter: ${meterNum || "N/A"}`}>
                          {meterNum || "—"}
                        </span>
                      </div>

                      {/* Zone / MRU */}
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="text-[11px] text-slate-700 truncate" title={`Zone / Agency: ${r.agency || zoneName || "N/A"}`}>
                          {r.agency || zoneName || "Unassigned"}
                        </span>
                      </div>

                      {/* Phase */}
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="text-[11px] text-slate-700 font-medium">
                          {phaseVal}
                        </span>
                      </div>
                    </div>

                    {/* Post-Disconnection Status Strip */}
                    {isDisconnected && (
                      <div className="bg-slate-50 p-2.5 rounded-xl text-[11px] space-y-1.5 border border-slate-200/70">
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <span className="text-slate-400">Removed:</span>{" "}
                            <strong className="font-mono text-blue-700">{r.removedMeterNo || "—"}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Final Reading:</span>{" "}
                            <strong className="font-mono text-emerald-700">{r.finalReading || "—"} kWh</strong>
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

                    {/* Black Centered Primary Action Button + Side Printer Icon */}
                    <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
                      {/* 1. Proposed stage -> Issue Button */}
                      {canIssue && r.status === "proposed" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setIssueOpen(true)
                          }}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 rounded-lg shadow-sm justify-center"
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          Issue to Agency
                        </Button>
                      )}

                      {/* 2. Issued / Proposed stage -> Mark Disconnected */}
                      {canDisconnect && (r.status === "issued" || (r.status === "proposed" && isAgency)) && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setDisconnectOpen(true)
                          }}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 rounded-lg shadow-sm justify-center"
                        >
                          <Camera className="h-3.5 w-3.5 mr-1.5" />
                          Mark Disconnected
                        </Button>
                      )}

                      {/* 3. Disconnected stage -> Store Return Button (if pending) */}
                      {canReturn && isDisconnected && !isReturned && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setReturnOpen(true)
                          }}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 rounded-lg shadow-sm justify-center"
                        >
                          <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                          Return Meter
                        </Button>
                      )}

                      {/* 4. Note Sheet Button (if disconnected & store returned or pending note sheet) */}
                      {canFinalize && isDisconnected && (isReturned || !hasNoteSheet) && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveRecord(r)
                            setNoteSheetOpen(true)
                          }}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 rounded-lg shadow-sm justify-center"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          {hasNoteSheet ? "Edit Note Sheet" : "Create Note Sheet"}
                        </Button>
                      )}

                      {/* Side Printer Memo Icon Button */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setActiveRecord(r)
                          setCertificateOpen(true)
                        }}
                        className="h-8 w-8 shrink-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200"
                        title="Print Disconnection Memo"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Table List View */
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
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
                    <TableHead>Mobile</TableHead>
                    <TableHead className="text-center">Live OSD</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Removed Meter / Reading</TableHead>
                    <TableHead className="text-center">Store Return</TableHead>
                    <TableHead className="text-center">Note Sheet</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map(r => {
                    const isClosed = r.status === "closed"
                    const isDisconnected = r.status === "disconnected"
                    const isReturned = r.meterReturnStatus === "returned"
                    const hasNoteSheet = !!(r.noteSheetNo && r.noteSheetNo.trim())
                    const isFullyCompleted = isDisconnected && isReturned && hasNoteSheet && !isClosed
                    const aux = consumerMasterMap[r.consumerId] || {}
                    const phoneNum = r.mobile || aux.mobile || aux.mobileNumber || ""

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
                        <TableCell>
                          {phoneNum ? (
                            <a href={`tel:${phoneNum}`} className="text-emerald-700 font-mono font-bold hover:underline">
                              {phoneNum}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {canIssue && r.status === "proposed" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setIssueOpen(true)
                                }}
                                className="h-7 text-[10px] px-2.5 bg-slate-900 hover:bg-slate-800 text-white"
                              >
                                Issue
                              </Button>
                            )}
                            {canDisconnect && (r.status === "issued" || r.status === "proposed") && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setDisconnectOpen(true)
                                }}
                                className="h-7 text-[10px] px-2.5 bg-slate-900 hover:bg-slate-800 text-white"
                              >
                                Disconnect
                              </Button>
                            )}
                            {canReturn && isDisconnected && !isReturned && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setReturnOpen(true)
                                }}
                                className="h-7 text-[10px] px-2.5 bg-slate-900 hover:bg-slate-800 text-white"
                              >
                                Return
                              </Button>
                            )}
                            {canFinalize && isDisconnected && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveRecord(r)
                                  setNoteSheetOpen(true)
                                }}
                                className="h-7 text-[10px] px-2.5 bg-slate-900 hover:bg-slate-800 text-white"
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
                              className="h-7 w-7 p-0 text-slate-600"
                              title="Print Memo"
                            >
                              <Printer className="h-3.5 w-3.5" />
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

      {/* 6. Propose PD Button at the Bottom of Module */}
      {canPropose && (
        <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-30">
          <Button
            onClick={() => setProposeOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white shadow-xl hover:shadow-2xl rounded-full px-5 py-2.5 h-auto text-xs sm:text-sm font-bold flex items-center gap-2 transition-all transform hover:-translate-y-0.5 border border-slate-700"
          >
            <Plus className="h-4 w-4" />
            <span>Propose PD</span>
          </Button>
        </div>
      )}

      {/* Tracking Summary Report Modal */}
      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <span>Agency Tracking & Summary Report</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <p className="text-slate-500">
              Overview of permanent disconnection execution and stage progression by assigned agency.
            </p>

            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px] bg-slate-50">
                    <TableHead className="font-bold">Agency Name</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Proposed</TableHead>
                    <TableHead className="text-center">Issued</TableHead>
                    <TableHead className="text-center">Dismantled</TableHead>
                    <TableHead className="text-center">Returned</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencySummary.map(row => (
                    <TableRow key={row.agency} className="text-xs">
                      <TableCell className="font-semibold text-slate-800">{row.agency}</TableCell>
                      <TableCell className="text-center font-mono font-bold">{row.total}</TableCell>
                      <TableCell className="text-center font-mono text-amber-700">{row.proposed}</TableCell>
                      <TableCell className="text-center font-mono text-blue-700">{row.issued}</TableCell>
                      <TableCell className="text-center font-mono text-rose-700">{row.executed}</TableCell>
                      <TableCell className="text-center font-mono text-emerald-700">{row.returnDone}</TableCell>
                      <TableCell className="text-center font-mono text-purple-700 font-black">{row.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setIsReportDialogOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {dynamicAgencies.map(ag => (
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
        agencies={dynamicAgencies}
        existingRecords={records}
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
        agencies={dynamicAgencies}
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

"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Search, X, Plus, RefreshCw, Check, ChevronLeft, ChevronRight,
  FileDown, Phone, MapPin, ClipboardList, Clock, FolderOpen,
  FileInput, Pencil, Loader2, SlidersHorizontal, Eye, FileSpreadsheet,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { NSC_STATUS_COLORS, NSC_STATUS_LABELS, NSC_CLASSES } from "@/lib/nsc-types"
import type { NSCApplication } from "@/lib/nsc-types"
import { NscApplicationForm } from "@/components/nsc-application-form"
import { NscInspectForm } from "@/components/nsc-inspect-form"
import { NscProcessForm } from "@/components/nsc-process-form"
import { NscViewDialog } from "@/components/nsc-view-dialog"
// xlsx loaded dynamically to reduce bundle size
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  CreateProjectForm, ProjectPOForm,
  AgencyCompleteProjectForm, AdminApproveProjectForm,
  LegacyImportPanel, ProjectCard,
} from "@/components/nsc-project-form"
import type { NSCProject } from "@/lib/nsc-types"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"

const CACHE_KEY = "nsc_data_cache"
const PAGE = 20

type Tab      = "all" | "pending" | "inspected" | "completed" | "projects" | "reports"
type View     = "list" | "create" | "inspect" | "process"
type SyncState = "idle" | "loading" | "updated"

const CLASS_LABELS: Record<string, string> = {
  domestic:   "LT Domestic",
  commercial: "LT Commercial",
  stw:        "STW",
  industrial: "LT Industrial",
}

// Agency pill color by hash
const AGENCY_COLORS = [
  "bg-violet-100 text-violet-800",
  "bg-cyan-100 text-cyan-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800",
  "bg-indigo-100 text-indigo-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
]
function agencyColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AGENCY_COLORS[h % AGENCY_COLORS.length]
}

// Completed = non-pole resolved OR pole fully done
const COMPLETED_STATUSES = ["quotation_issued", "dispute_issued", "project_done", "connection_effected", "meter_issued", "meter_returned"]

interface ActiveFilters {
  phase:    string   // "" | "1P" | "3P"
  klass:    string   // "" | appliedClass value
  pole:     string   // "" | "yes" | "no"
  dispute:  boolean  // dispute flag
  agency:   string[] // agency list filter
}

const DEFAULT_FILTERS: ActiveFilters = { phase: "", klass: "", pole: "", dispute: false, agency: [] }

interface Props {
  userRole:     string
  userAgencies: string[]
  username:     string
  agencies:     string[]
  permissions?: Record<string, string[]>
}

export function NscList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const isAdmin  = userRole === "admin" || userRole === "executive"
  const isAgency = userRole === "agency" || (userRole !== "admin" && userRole !== "executive" && !!(userAgencies && userAgencies.length > 0))
  const canCreate = userRole === "admin" || userRole === "executive" || !!(permissions && permissions.nsc?.includes("create"))
  const canInspect = userRole === "admin" || userRole === "executive" || userRole === "agency" || !!(permissions && permissions.nsc?.includes("inspect"))
  const canProcess = userRole === "admin" || userRole === "executive" || !!(permissions && permissions.nsc?.includes("process"))

  const [apps, setApps]         = useState<NSCApplication[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab]           = useState<Tab>("pending")
  const [view, setView]         = useHashState<View>("nsc", "list")
  const [search, setSearch]     = useState("")
  const [selected, setSelected] = useState<NSCApplication | null>(null)
  const [historyApp, setHistoryApp] = useState<NSCApplication | null>(null)
  const [viewApp, setViewApp]   = useState<NSCApplication | null>(null)
  const [page, setPage]         = useState(1)

  // Filters
  const [filters, setFilters]   = useState<ActiveFilters>(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)

  // Project state
  const [projects, setProjects]                 = useState<NSCProject[]>([])
  const [projectDialogApp, setProjectDialogApp] = useState<NSCApplication | null>(null)
  const [showLegacyImport, setShowLegacyImport] = useState(false)
  const [selectedProject, setSelectedProject]   = useState<NSCProject | null>(null)
  const [projectAction, setProjectAction]       = useState<"po" | "complete" | "approve" | null>(null)
  const [editingRefApp, setEditingRefApp]       = useState<NSCApplication | null>(null)
  const [refNoInput, setRefNoInput]             = useState("")
  const [savingRefNo, setSavingRefNo]           = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      const cached = await getFromCache<NSCApplication[]>(CACHE_KEY)
      if (cached) { setApps(cached); if (!silent) setSyncState("idle") }
      const res = await fetch("/api/nsc")
      if (!res.ok) throw new Error()
      const data: NSCApplication[] = await res.json()
      const sorted = [...data].reverse()
      setApps(sorted)
      await saveToCache(CACHE_KEY, sorted)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
      window.dispatchEvent(new Event("notif-refresh"))
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load NSC data", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  // Load projects
  useEffect(() => {
    fetch("/api/nsc/project").then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {})
  }, [])

  const projectMap = useMemo(() => {
    const map: Record<string, NSCProject> = {}
    projects.forEach(p => {
      p.linkedApps.split(",").forEach(rn => { const t = rn.trim(); if (t) map[t] = p })
    })
    return map
  }, [projects])

  const reloadProjects = () =>
    fetch("/api/nsc/project").then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {})

  const saveRefNo = async () => {
    if (!editingRefApp) return
    setSavingRefNo(true)
    try {
      const res = await fetch("/api/nsc/office-ref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveNo: editingRefApp.receiveNo, officeRefNo: refNoInput }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setApps(prev => prev.map(a => a.receiveNo === editingRefApp.receiveNo ? { ...a, officeRefNo: refNoInput } : a))
      setEditingRefApp(null)
      toast({ title: "Office reference number saved" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSavingRefNo(false)
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const scopedApps = useMemo(() =>
    isAgency
      ? apps.filter(a => userAgencies.map(x => x.toUpperCase()).includes(a.agency.toUpperCase()))
      : apps,
  [apps, isAgency, userAgencies])

  const agencyOptions = useMemo(() => {
    const set = new Set<string>()
    if (agencies && agencies.length > 0) {
      agencies.forEach(a => set.add(a))
    }
    scopedApps.forEach(a => {
      if (a.agency) set.add(a.agency)
    })
    return Array.from(set).sort()
  }, [agencies, scopedApps])

  const activeFilterCount = [
    filters.phase !== "",
    filters.klass !== "",
    filters.pole  !== "",
    filters.dispute,
    filters.agency.length > 0,
  ].filter(Boolean).length

  const filtered = useMemo(() => {
    let data = scopedApps
    if (tab === "pending")   data = data.filter(a => a.status === "pending")
    if (tab === "inspected") data = data.filter(a => a.status === "inspected")
    if (tab === "completed") data = data.filter(a => COMPLETED_STATUSES.includes(a.status))
    if (tab === "projects")  data = data.filter(a => ["project_required", "project_ongoing", "project_done"].includes(a.status))

    // Additional filters
    if (filters.agency.length > 0) {
      data = data.filter(a => a.agency && filters.agency.map(x => x.toUpperCase()).includes(a.agency.toUpperCase()))
    }
    if (filters.phase)   data = data.filter(a => a.phase === filters.phase)
    if (filters.klass)   data = data.filter(a => a.appliedClass === filters.klass)
    if (filters.pole === "yes") data = data.filter(a => a.poleRequired === "yes")
    if (filters.pole === "no")  data = data.filter(a => a.poleRequired !== "yes")
    if (filters.dispute) data = data.filter(a => !!a.dispute)

    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(a =>
        a.receiveNo.toLowerCase().includes(q)               ||
        (a.officeRefNo || "").toLowerCase().includes(q)     ||
        a.applicantName.toLowerCase().includes(q)           ||
        a.careOf.toLowerCase().includes(q)                  ||
        a.address.toLowerCase().includes(q)                 ||
        a.mobile.includes(q)                                ||
        a.agency.toLowerCase().includes(q)                  ||
        (a.existingConsumerId || "").includes(q)
      )
    }
    return data
  }, [scopedApps, tab, search, filters])

  const totalPages = Math.ceil(filtered.length / PAGE)
  const paginated  = filtered.slice((page - 1) * PAGE, page * PAGE)
  useEffect(() => setPage(1), [tab, search, filters])

  // ── Tab counts ────────────────────────────────────────────────────────────
  const pendingCount    = scopedApps.filter(a => a.status === "pending").length
  const inspectedCount  = scopedApps.filter(a => a.status === "inspected").length
  const completedCount  = scopedApps.filter(a => COMPLETED_STATUSES.includes(a.status)).length
  const projectCount    = scopedApps.filter(a => ["project_required", "project_ongoing", "project_done"].includes(a.status)).length

  // Phase sub-counts for pending — shows how many 1P vs 3P are waiting
  const pending1P = scopedApps.filter(a => a.status === "pending" && a.phase === "1P").length
  const pending3P = scopedApps.filter(a => a.status === "pending" && a.phase === "3P").length

  // ── Export ────────────────────────────────────────────────────────────────
  const exportData = useCallback(async () => {
    if (filtered.length === 0) { toast({ title: "No data to export" }); return }
    const rows = filtered.map(a => ({
      "Receive No":          a.receiveNo,
      "Received Date":       a.receivedDate,
      "Applicant Name":      a.applicantName,
      "C/O":                 a.careOf,
      "Address":             a.address,
      "Mobile":              a.mobile,
      "Applied Class":       CLASS_LABELS[a.appliedClass] || a.appliedClass,
      "Phase":               a.phase,
      "Agency":              a.agency,
      "Status":              NSC_STATUS_LABELS[a.status] || a.status,
      "Agency Decision":     a.agencyDecision,
      "Admin Decision":      a.adminDecision,
      "Final Action":        a.finalAction,
      "Application No":      a.applicationNo,
      "Memo No":             a.memoNo,
      "Existing Consumer ID": a.existingConsumerId,
      "Load (kW)":           a.load,
      "DTR Capacity":        a.dtrCapacity,
      "Pole Required":       a.poleRequired,
      "Inspected At":        a.inspectedAt,
      "Finalized At":        a.finalizedAt,
    }))
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "NSC Applications")
    XLSX.writeFile(wb, `nsc-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [filtered, tab, toast])

  // Listen to global header actions
  useEffect(() => {
    const handleAction = (e: Event) => {
      const ce = e as CustomEvent
      if (ce.detail?.action === "export")         exportData()
      else if (ce.detail?.action === "import-legacy") setShowLegacyImport(true)
      else if (ce.detail?.action === "refresh")   load()
    }
    window.addEventListener("nsc-action", handleAction)
    return () => window.removeEventListener("nsc-action", handleAction)
  }, [exportData])

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "create") return (
    <NscApplicationForm
      agencies={agencies}
      onSave={rcvNo => { toast({ title: "Application created", description: `Receive No: ${rcvNo}` }); setView("list"); load(true) }}
      onCancel={() => setView("list")}
    />
  )

  if (view === "inspect" && selected) return (
    <NscInspectForm
      app={selected}
      onSave={() => { toast({ title: "Inspection submitted" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  if (view === "process" && selected) return (
    <NscProcessForm
      app={selected}
      agencies={agencies}
      onSave={() => { toast({ title: "Application processed" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  // ── Filter Popover content ─────────────────────────────────────────────────
  const FilterPanel = () => (
    <div className="space-y-4 p-1 max-h-[75vh] overflow-y-auto pr-1">
      {/* Status / Stage Tab Dropdown */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Stage / Status</p>
        <Select value={tab} onValueChange={(val) => setTab(val as Tab)}>
          <SelectTrigger className="w-full h-9 rounded-xl text-xs font-semibold bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending"   className="text-xs font-medium">⏳ Pending ({pendingCount})</SelectItem>
            <SelectItem value="inspected" className="text-xs font-medium">🕐 Inspection Completed ({inspectedCount})</SelectItem>
            <SelectItem value="completed" className="text-xs font-medium">✅ Completed ({completedCount})</SelectItem>
            <SelectItem value="projects"  className="text-xs font-medium">📁 Projects ({projectCount})</SelectItem>
            {isAdmin && <SelectItem value="reports" className="text-xs font-medium">📊 Reports</SelectItem>}
            <SelectItem value="all"       className="text-xs font-medium">🗂️ All ({scopedApps.length})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Agency Dropdown */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Agency</p>
        <MultiSelectDropdown
          placeholder="Filter by Agency"
          options={agencyOptions}
          selected={filters.agency}
          onChange={selectedAgencies => setFilters(f => ({ ...f, agency: selectedAgencies }))}
          className="w-full text-xs"
        />
      </div>

      {/* Phase */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phase</p>
        <div className="flex gap-1.5">
          {["", "1P", "3P"].map(v => (
            <button key={v} onClick={() => setFilters(f => ({ ...f, phase: f.phase === v ? "" : v }))}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${filters.phase === v && v !== "" ? "bg-slate-900 text-white border-slate-900" : "border-gray-200 text-gray-600 hover:border-slate-400"}`}>
              {v || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Class */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Applied Class</p>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "", label: "All" }, ...NSC_CLASSES].map(c => (
            <button key={c.value} onClick={() => setFilters(f => ({ ...f, klass: f.klass === c.value ? "" : c.value }))}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${filters.klass === c.value && c.value !== "" ? "bg-slate-900 text-white border-slate-900" : "border-gray-200 text-gray-600 hover:border-slate-400"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pole case */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Case Type</p>
        <div className="flex gap-1.5">
          {[{ v: "", l: "All" }, { v: "yes", l: "Pole Case" }, { v: "no", l: "Non-Pole" }].map(({ v, l }) => (
            <button key={v} onClick={() => setFilters(f => ({ ...f, pole: f.pole === v ? "" : v }))}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${filters.pole === v && v !== "" ? "bg-slate-900 text-white border-slate-900" : "border-gray-200 text-gray-600 hover:border-slate-400"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Dispute flag */}
      <div>
        <button onClick={() => setFilters(f => ({ ...f, dispute: !f.dispute }))}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full border transition w-full ${filters.dispute ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:border-amber-400"}`}>
          ⚠ Dispute Flagged {filters.dispute && "(Active)"}
        </button>
      </div>

      {/* Clear */}
      {(activeFilterCount > 0 || tab !== "pending") && (
        <button onClick={() => { setFilters(DEFAULT_FILTERS); setTab("pending") }}
          className="text-xs font-semibold text-red-500 hover:text-red-700 w-full text-center py-1">
          ✕ Reset all filters
        </button>
      )}
    </div>
  )

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          {/* Search bar taking full flexible width */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search receive no, name, address, mobile, agency, consumer ID..."
              className="pl-10 pr-8 rounded-xl h-9 text-xs sm:text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>

          {/* Unified Filter Button (All filters inside popover) */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button
                className={`relative h-9 px-3 flex items-center gap-1.5 rounded-xl border transition shrink-0 font-medium text-xs
                  ${(activeFilterCount > 0 || tab !== "pending")
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"}`}
                title="Filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline font-semibold">Filter</span>
                {(activeFilterCount > 0 || tab !== "pending") && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount + (tab !== "pending" ? 1 : 0)}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] sm:w-[320px] p-3 sm:p-4 rounded-2xl shadow-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">Filter NSC Applications</p>
                <button onClick={() => setFilterOpen(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <FilterPanel />
            </PopoverContent>
          </Popover>
        </div>

        {/* Status bar */}
        <div className="flex justify-between items-center text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="font-medium text-gray-600">{filtered.length} records</span>
            {tab !== "pending" && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                Stage: {tab === "inspected" ? "Inspected" : tab === "completed" ? "Completed" : tab === "projects" ? "Projects" : tab === "reports" ? "Reports" : "All"}
                <X className="h-3 w-3 cursor-pointer hover:text-red-600 ml-0.5" onClick={() => setTab("pending")} />
              </span>
            )}
            {/* Pending breakdown */}
            {tab === "pending" && (
              <span className="flex items-center gap-1">
                <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">1P: {pending1P}</span>
                <span className="bg-purple-100 text-purple-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">3P: {pending3P}</span>
              </span>
            )}
            {/* Active filter pills */}
            {filters.agency.length > 0 && (
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                Agency: {filters.agency.length === 1 ? filters.agency[0] : `${filters.agency.length} selected`}
                <X className="h-3 w-3 cursor-pointer hover:text-red-600 ml-0.5" onClick={() => setFilters(f => ({ ...f, agency: [] }))} />
              </span>
            )}
            {filters.phase   && <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{filters.phase}</span>}
            {filters.klass   && <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{CLASS_LABELS[filters.klass]}</span>}
            {filters.pole === "yes" && <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">Pole</span>}
            {filters.pole === "no"  && <span className="bg-teal-100 text-teal-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">Non-Pole</span>}
            {filters.dispute && <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">⚠ Dispute</span>}

            <button
              onClick={() => load()}
              disabled={syncState === "loading"}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors disabled:cursor-not-allowed ${
                syncState === "loading"
                  ? "border-blue-400 bg-blue-50 text-blue-500"
                  : syncState === "updated"
                  ? "border-green-500 bg-green-50 text-green-600"
                  : "border-blue-300 bg-blue-50 text-blue-500 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700 active:scale-95 cursor-pointer"
              }`}
            >
              {syncState === "loading" ? (
                <><Loader2 className="h-3 w-3 animate-spin" /><span className="text-[10px] font-medium">Loading...</span></>
              ) : syncState === "updated" ? (
                <><Check className="h-3 w-3" /><span className="text-[10px] font-medium">Updated</span></>
              ) : (
                <><RefreshCw className="h-3 w-3" /><span className="text-[10px] font-medium">Refresh</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Reports tab */}
      {tab === "reports" && isAdmin && <NscReports apps={apps} />}

      {/* Projects tab */}
      {tab === "projects" && (
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No projects yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map(p => (
                <ProjectCard
                  key={p.projectId}
                  project={p}
                  userRole={userRole}
                  userAgencies={userAgencies}
                  onAction={(proj, action) => { setSelectedProject(proj); setProjectAction(action) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Application cards */}
      {tab !== "reports" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginated.length === 0 ? (
            <div className="text-center py-16 text-gray-400 col-span-full">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No NSC applications found</p>
            </div>
          ) : paginated.map(app => (
            <Card key={app.receiveNo} className="hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 hover:border-blue-200">
              <CardContent className="p-4">

                {/* Top row: receive no + phase chip + status badge + agency pill */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-mono text-xs text-gray-400">{app.receiveNo}</span>
                    {app.officeRefNo && (
                      <>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="font-mono text-xs text-blue-600 font-medium">Ref: {app.officeRefNo}</span>
                      </>
                    )}
                    {app.isLegacy === "true" && <Badge variant="outline" className="text-xs py-0 px-1 text-amber-700 border-amber-300">Legacy</Badge>}
                    {/* Phase pill */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${app.phase === "3P" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {app.phase}
                    </span>
                    {app.poleRequired === "yes" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Pole</span>
                    )}
                    {app.dispute && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ Dispute</span>
                    )}
                  </div>
                  {/* Agency pill — right side */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${agencyColor(app.agency)}`}>
                    {app.agency}
                  </span>
                </div>

                {/* Project link */}
                {app.projectId && (
                  <p className="text-xs text-orange-600 font-mono mt-0.5">
                    <FolderOpen className="inline h-3 w-3 mr-1" />{app.projectId}
                  </p>
                )}

                {/* Applicant info */}
                <div className="mt-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-bold text-gray-900">{app.applicantName}</p>
                    <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${NSC_STATUS_COLORS[app.status] || "bg-gray-100 text-gray-700"}`}>
                      {NSC_STATUS_LABELS[app.status] || app.status}
                    </Badge>
                  </div>
                  {app.careOf && (
                    <>
                      <p className="text-xs text-gray-500">C/O {app.careOf}</p>
                      <hr className="my-1.5 border-gray-100" />
                    </>
                  )}

                  <div className="flex items-start gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">{app.address}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <a href={`tel:${app.mobile}`} className="flex items-center gap-1 text-xs text-blue-600 font-mono">
                      <Phone className="h-3 w-3" />{app.mobile}
                    </a>
                    {app.existingConsumerId && (
                      <span className="text-xs font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                        ConsID: {app.existingConsumerId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Processing summary */}
                {app.status !== "pending" && (
                  <div className="mt-1 text-xs text-gray-400">
                    {app.agencyDecision && (
                      <span className={`mr-2 ${app.agencyDecision === "accepted" ? "text-green-600" : "text-red-600"}`}>
                        Agency: {app.agencyDecision}
                      </span>
                    )}
                    {app.adminDecision && (
                      <span className={app.adminDecision === "accepted" ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                        Admin: {app.adminDecision}
                      </span>
                    )}
                    {app.applicationNo && <span className="ml-2 font-mono text-green-700">App# {app.applicationNo}</span>}
                    {app.memoNo        && <span className="ml-2 font-mono text-orange-700">Memo: {app.memoNo}</span>}
                  </div>
                )}

                {app.meterSerialNo && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-purple-700">{app.meterSerialNo}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-600">{app.agency}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                  <span>{app.receivedDate}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    app.appliedClass === "LT" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                    app.appliedClass === "HT" ? "bg-purple-50 text-purple-700 border-purple-200" :
                    "bg-slate-50 text-slate-700 border-slate-200"
                  }`}>
                    {CLASS_LABELS[app.appliedClass] || app.appliedClass}
                  </span>
                </div>

                {/* ─ Action buttons ─────────────────────────────────────────── */}
                <div className="flex gap-2 mt-3 pt-3 border-t flex-wrap">

                  {/* View button — always visible */}
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-slate-900 bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 border border-gray-200 transition"
                    onClick={() => setViewApp(app)}
                    title="View full details"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>

                  {/* Agency / Inspector / Custom Role: inspect pending */}
                  {canInspect && app.status === "pending" && (
                    <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("inspect") }}>
                      Start Inspection
                    </Button>
                  )}
                  {/* Agency / Inspector: inspection submitted */}
                  {!canInspect && app.status !== "pending" && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" /> Inspection submitted
                    </p>
                  )}

                  {/* Admin / Staff / Custom Role: process inspected */}
                  {canProcess && app.status === "inspected" && (
                    <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      Process
                    </Button>
                  )}

                  {/* Admin: view/reprocess quotation or dispute */}
                  {isAdmin && (app.status === "quotation_issued" || app.status === "dispute_issued") && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-xs font-semibold rounded-lg shadow-sm bg-slate-950 hover:bg-slate-900 text-white border-slate-900 transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      View / Override
                    </Button>
                  )}

                  {/* Admin: create project from quotation */}
                  {isAdmin && app.status === "quotation_issued" && !app.projectId && (
                    <Button size="sm" variant="outline" className="h-9 text-orange-700 border-orange-200 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => setProjectDialogApp(app)}>
                      <FolderOpen className="h-3 w-3 mr-1" /> Create Project
                    </Button>
                  )}

                  {/* Admin: project statuses */}
                  {isAdmin && ["project_required", "project_ongoing", "project_done"].includes(app.status) && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-orange-700 border-orange-200 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setTab("projects") }}>
                      <FolderOpen className="h-3 w-3 mr-1" /> View Projects
                    </Button>
                  )}

                  {/* Admin: approve project if done */}
                  {isAdmin && app.status === "project_ongoing" && projectMap[app.receiveNo]?.status === "done" && (
                    <Button size="sm" className="h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelectedProject(projectMap[app.receiveNo]); setProjectAction("approve") }}>
                      Approve Project
                    </Button>
                  )}

                  {/* Agency: mark project complete */}
                  {isAgency && ["project_required", "project_ongoing"].includes(app.status) && app.projectId &&
                    projectMap[app.receiveNo]?.status === "ongoing" && projectMap[app.receiveNo]?.poNumber && (
                    <Button size="sm" className="h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelectedProject(projectMap[app.receiveNo]); setProjectAction("complete") }}>
                      Mark Work Done
                    </Button>
                  )}

                  {/* Admin: pending — reassign */}
                  {isAdmin && app.status === "pending" && (
                    <Button size="sm" className="flex-1 h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      Reassign
                    </Button>
                  )}

                  {/* Admin: meter issued / connection effected — view only */}
                  {isAdmin && (app.status === "meter_issued" || app.status === "connection_effected") && (
                    <p className="text-xs text-teal-700 flex items-center gap-1 font-medium">
                      <Check className="h-3 w-3" />
                      {app.status === "connection_effected" ? "Connection effected" : "Meter issued — awaiting installation"}
                    </p>
                  )}

                  {/* Admin: edit office ref no */}
                  {isAdmin && (
                    <button
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 ml-auto"
                      onClick={() => { setEditingRefApp(app); setRefNoInput(app.officeRefNo || "") }}
                      title="Edit office reference number">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Admin: history button */}
                  {isAdmin && (
                    <button
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => setHistoryApp(app)}
                      title="View history logs">
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View dialog */}
      <NscViewDialog app={viewApp} open={!!viewApp} onClose={() => setViewApp(null)} />

      {/* Sticky bottom — Add NSC */}
      {canCreate && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Add NSC
            </Button>
          </div>
        </div>
      )}

      {/* Legacy history popup (mini stepper — kept for backward compat) */}
      {historyApp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setHistoryApp(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold">Flow History</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{historyApp.receiveNo}</p>
                <p className="text-sm text-gray-700 font-medium">{historyApp.applicantName}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setHistoryApp(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Application Received",  date: historyApp.receivedDate,           done: !!historyApp.receivedDate },
                { label: "Inspection Completed",  date: historyApp.inspectedAt,            done: !!historyApp.inspectedAt },
                { label: "Quotation Issued",       date: historyApp.finalizedAt,            done: !!historyApp.finalizedAt && historyApp.finalAction === "quotation" },
                { label: "Dispute Issued",         date: historyApp.finalizedAt,            done: !!historyApp.finalizedAt && historyApp.finalAction === "dispute_letter" },
                { label: "Meter Issued",           date: historyApp.meterIssuedAt ? `${historyApp.meterIssuedAt}${historyApp.meterSerialNo ? ` · ${historyApp.meterSerialNo}` : ""}` : "", done: !!historyApp.meterIssuedAt },
                { label: "Connection Effected",    date: historyApp.connectionEffectedAt,   done: !!historyApp.connectionEffectedAt },
              ].map((step, i, arr) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-green-500" : "bg-gray-100 border border-gray-200"}`}>
                      {step.done && <Check className="h-3 w-3 text-white" />}
                    </div>
                    {i < arr.length - 1 && <div className={`w-0.5 flex-1 mt-1 ${step.done ? "bg-green-200" : "bg-gray-100"}`} style={{ minHeight: 16 }} />}
                  </div>
                  <div className="pb-3 flex-1">
                    <p className={`text-sm font-medium ${step.done ? "text-gray-800" : "text-gray-300"}`}>{step.label}</p>
                    {step.done && <p className="text-xs text-gray-400 font-mono">{step.date}</p>}
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full bg-slate-950 hover:bg-slate-900 text-white text-sm" onClick={() => { setViewApp(historyApp); setHistoryApp(null) }}>
              View Full Details
            </Button>
          </div>
        </div>
      )}

      {/* Project: Create dialog */}
      <Dialog open={!!projectDialogApp} onOpenChange={open => { if (!open) setProjectDialogApp(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Infrastructure Project</DialogTitle></DialogHeader>
          {projectDialogApp && (
            <CreateProjectForm
              application={projectDialogApp}
              allApps={apps}
              agencies={agencies}
              onSuccess={() => { setProjectDialogApp(null); reloadProjects(); load(true) }}
              onCancel={() => setProjectDialogApp(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Project: action dialog */}
      <Dialog open={!!selectedProject && !!projectAction} onOpenChange={open => { if (!open) { setSelectedProject(null); setProjectAction(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {projectAction === "po"       ? "Enter PO Number"    :
               projectAction === "complete" ? "Mark Work Complete" :
               "Approve Project"}
            </DialogTitle>
          </DialogHeader>
          {selectedProject && projectAction === "po" && (
            <ProjectPOForm project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects() }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }} />
          )}
          {selectedProject && projectAction === "complete" && (
            <AgencyCompleteProjectForm project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects(); load(true) }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }} />
          )}
          {selectedProject && projectAction === "approve" && (
            <AdminApproveProjectForm project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects(); load(true) }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }} />
          )}
        </DialogContent>
      </Dialog>

      {/* Legacy import dialog */}
      <Dialog open={showLegacyImport} onOpenChange={setShowLegacyImport}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Legacy Applications</DialogTitle></DialogHeader>
          <LegacyImportPanel
            onSuccess={count => { setShowLegacyImport(false); load(true); toast({ title: `${count} legacy records imported` }) }}
            onCancel={() => setShowLegacyImport(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit office ref no dialog */}
      <Dialog open={!!editingRefApp} onOpenChange={open => { if (!open) setEditingRefApp(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Office Reference Number</DialogTitle></DialogHeader>
          {editingRefApp && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {editingRefApp.receiveNo} — {editingRefApp.applicantName}
              </p>
              <Input
                placeholder="Office reference / serial number"
                value={refNoInput}
                onChange={e => setRefNoInput(e.target.value)}
              />
              <div className="flex gap-2">
                <Button className="bg-slate-950 hover:bg-slate-900 text-white" onClick={saveRefNo} disabled={savingRefNo}>{savingRefNo ? "Saving…" : "Save"}</Button>
                <Button variant="outline" onClick={() => setEditingRefApp(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalPages > 1 && tab !== "reports" && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Reports panel ──────────────────────────────────────────────────────────────
function NscReports({ apps }: { apps: NSCApplication[] }) {
  const { toast } = useToast()

  const total     = apps.length
  const pending   = apps.filter(a => a.status === "pending").length
  const inspected = apps.filter(a => a.status === "inspected").length
  const quotation = apps.filter(a => a.status === "quotation_issued").length
  const dispute   = apps.filter(a => a.status === "dispute_issued").length

  const byClass = NSC_CLASSES.map(c => ({
    label:     c.label,
    total:     apps.filter(a => a.appliedClass === c.value).length,
    pending:   apps.filter(a => a.appliedClass === c.value && a.status === "pending").length,
    inspected: apps.filter(a => a.appliedClass === c.value && a.status === "inspected").length,
    done:      apps.filter(a => a.appliedClass === c.value && COMPLETED_STATUSES.includes(a.status)).length,
  }))

  const byPhase = ["1P", "3P"].map(p => ({
    phase:     p,
    total:     apps.filter(a => a.phase === p).length,
    pending:   apps.filter(a => a.phase === p && a.status === "pending").length,
    inspected: apps.filter(a => a.phase === p && a.status === "inspected").length,
    done:      apps.filter(a => a.phase === p && COMPLETED_STATUSES.includes(a.status)).length,
  }))

  const agencyNames = Array.from(new Set(apps.map(a => a.agency).filter(Boolean)))
  const byAgency = agencyNames.map(ag => ({
    agency:    ag,
    total:     apps.filter(a => a.agency === ag).length,
    pending:   apps.filter(a => a.agency === ag && a.status === "pending").length,
    inspected: apps.filter(a => a.agency === ag && a.status === "inspected").length,
    accepted:  apps.filter(a => a.agency === ag && a.agencyDecision === "accepted").length,
    rejected:  apps.filter(a => a.agency === ag && a.agencyDecision === "rejected").length,
  })).sort((a, b) => b.total - a.total)

  // ── Custom Reports ────────────────────────────────────────────────────────
  
  // 1. Agency Pending Report
  const downloadAgencyPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    
    const pendingApps = apps.filter(a =>
      ["pending", "project_required", "project_ongoing", "meter_issued"].includes(a.status)
    )

    if (pendingApps.length === 0) {
      toast({ title: "No pending applications found", variant: "destructive" })
      return
    }

    pendingApps.sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.receivedDate || "").localeCompare(b.receivedDate || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Header
    doc.setFontSize(16)
    doc.setTextColor(40, 53, 147)
    doc.text("NSC Agency Pending Report", pw / 2, 14, { align: "center" })
    
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending Applications: ${pendingApps.length}`,
      pw / 2, 20, { align: "center" }
    )

    // Summary Section
    const agencies = Array.from(new Set(pendingApps.map(a => a.agency).filter(Boolean))).sort()
    const summaryRows = agencies.map((ag, idx) => {
      const agApps = pendingApps.filter(a => a.agency === ag)
      const pIns = agApps.filter(a => a.status === "pending").length
      const pErect = agApps.filter(a => a.status === "project_required").length
      const oErect = agApps.filter(a => a.status === "project_ongoing").length
      const mIss = agApps.filter(a => a.status === "meter_issued").length
      return [
        idx + 1,
        ag,
        pIns,
        pErect,
        oErect,
        mIss,
        agApps.length
      ]
    })

    const totalIns = pendingApps.filter(a => a.status === "pending").length
    const totalPErect = pendingApps.filter(a => a.status === "project_required").length
    const totalOErect = pendingApps.filter(a => a.status === "project_ongoing").length
    const totalMIss = pendingApps.filter(a => a.status === "meter_issued").length
    const grandTotalPending = pendingApps.length

    summaryRows.push([
      "",
      "GRAND TOTAL",
      totalIns,
      totalPErect,
      totalOErect,
      totalMIss,
      grandTotalPending
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Agency", "Pending Inspection", "Erection Pending", "Erection Ongoing", "Meter Issued", "Total Pending"]],
      body: summaryRows,
      styles: { fontSize: 8, font: "helvetica", halign: "center", cellPadding: 2.5 },
      headStyles: { fillColor: [40, 53, 147], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = "bold"
          data.cell.styles.fillColor = [230, 235, 255]
          data.cell.styles.textColor = [40, 53, 147]
        }
      },
      theme: "grid"
    })

    const nextY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setTextColor(40, 53, 147)
    doc.text("Detailed Pending List", 14, nextY)

    const cols = ["#", "Receive No", "Office Ref", "Applicant Name", "Agency", "Mobile", "Class & Phase", "Pending Stage", "Received Date", "Address"]
    const body = pendingApps.map((a, i) => [
      i + 1,
      a.receiveNo || "-",
      a.officeRefNo || "-",
      a.applicantName || "-",
      a.agency || "-",
      a.mobile || "-",
      `${CLASS_LABELS[a.appliedClass] || a.appliedClass} (${a.phase || "-"})`,
      NSC_STATUS_LABELS[a.status] || a.status,
      a.receivedDate || "-",
      a.address ? a.address.substring(0, 30) + (a.address.length > 30 ? "..." : "") : "-"
    ])

    autoTable(doc, {
      startY: nextY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 35 },
        4: { cellWidth: 25 },
        5: { cellWidth: 18 },
        6: { cellWidth: 30 },
        7: { cellWidth: 30 },
        8: { cellWidth: 18 },
        9: { cellWidth: 50 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      }
    })

    doc.save(`NSC_Agency_Pending_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "Agency Pending PDF exported successfully" })
  }

  const downloadAgencyPendingExcel = async () => {
    const XLSX = await import("xlsx")
    
    const pendingApps = apps.filter(a =>
      ["pending", "project_required", "project_ongoing", "meter_issued"].includes(a.status)
    )

    if (pendingApps.length === 0) {
      toast({ title: "No pending applications found", variant: "destructive" })
      return
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const agencies = Array.from(new Set(pendingApps.map(a => a.agency).filter(Boolean))).sort()
    const summaryRows = [
      ["Agency Pending Summary Report"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["#", "Agency", "Pending Inspection", "Erection Pending", "Erection Ongoing", "Meter Issued", "Total Pending"]
    ]

    agencies.forEach((ag, idx) => {
      const agApps = pendingApps.filter(a => a.agency === ag)
      const pIns = agApps.filter(a => a.status === "pending").length
      const pErect = agApps.filter(a => a.status === "project_required").length
      const oErect = agApps.filter(a => a.status === "project_ongoing").length
      const mIss = agApps.filter(a => a.status === "meter_issued").length
      summaryRows.push([
        String(idx + 1),
        ag,
        String(pIns),
        String(pErect),
        String(oErect),
        String(mIss),
        String(agApps.length)
      ])
    })

    const totalIns = pendingApps.filter(a => a.status === "pending").length
    const totalPErect = pendingApps.filter(a => a.status === "project_required").length
    const totalOErect = pendingApps.filter(a => a.status === "project_ongoing").length
    const totalMIss = pendingApps.filter(a => a.status === "meter_issued").length
    summaryRows.push([
      "",
      "GRAND TOTAL",
      String(totalIns),
      String(totalPErect),
      String(totalOErect),
      String(totalMIss),
      String(pendingApps.length)
    ])

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary["!cols"] = [
      { wch: 5 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary")

    // Sheet 2: Detailed Records
    const detailRows = pendingApps.map((a, i) => ({
      "#": i + 1,
      "Receive No": a.receiveNo || "",
      "Office Ref No": a.officeRefNo || "",
      "Applicant Name": a.applicantName || "",
      "C/O": a.careOf || "",
      "Address": a.address || "",
      "Mobile": a.mobile || "",
      "Class": CLASS_LABELS[a.appliedClass] || a.appliedClass || "",
      "Phase": a.phase || "",
      "Agency": a.agency || "",
      "Pending Level": NSC_STATUS_LABELS[a.status] || a.status || "",
      "Received Date": a.receivedDate || "",
      "Load (kW)": a.load || "",
      "Pole Required": a.poleRequired || "",
      "Project ID": a.projectId || ""
    }))

    const wsDetail = XLSX.utils.json_to_sheet(detailRows)
    wsDetail["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 25 }
    ]
    XLSX.utils.book_append_sheet(wb, wsDetail, "Pending Records")

    XLSX.writeFile(wb, `NSC_Agency_Pending_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Agency Pending Excel exported successfully" })
  }

  // 2. All Status Report
  const downloadAllStatusPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    if (apps.length === 0) {
      toast({ title: "No applications found", variant: "destructive" })
      return
    }

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Header
    doc.setFontSize(16)
    doc.setTextColor(40, 53, 147)
    doc.text("NSC Comprehensive Status Report", pw / 2, 14, { align: "center" })

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Applications: ${apps.length}`,
      pw / 2, 20, { align: "center" }
    )

    const statuses = Object.keys(NSC_STATUS_LABELS)
    const statusCounts = statuses.map(st => ({
      label: NSC_STATUS_LABELS[st],
      count: apps.filter(a => a.status === st).length
    }))

    const summaryRows = statusCounts.map((sc, idx) => [
      idx + 1,
      sc.label,
      sc.count
    ])
    
    summaryRows.push([
      "",
      "TOTAL",
      apps.length
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Status Level", "Count"]],
      body: summaryRows,
      styles: { fontSize: 8, font: "helvetica", halign: "center", cellPadding: 2 },
      headStyles: { fillColor: [40, 53, 147], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = "bold"
          data.cell.styles.fillColor = [230, 235, 255]
          data.cell.styles.textColor = [40, 53, 147]
        }
      },
      theme: "grid",
      margin: { left: 40, right: 40 }
    })

    const nextY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setTextColor(40, 53, 147)
    doc.text("Detailed Applications List", 14, nextY)

    const sortedApps = [...apps].sort((a, b) => {
      const stComp = (a.status || "").localeCompare(b.status || "")
      if (stComp !== 0) return stComp
      return (a.agency || "").localeCompare(b.agency || "")
    })

    const cols = ["#", "Receive No", "Office Ref", "Applicant Name", "Agency", "Mobile", "Class & Phase", "Current Status", "Received Date", "Address"]
    const body = sortedApps.map((a, i) => [
      i + 1,
      a.receiveNo || "-",
      a.officeRefNo || "-",
      a.applicantName || "-",
      a.agency || "-",
      a.mobile || "-",
      `${CLASS_LABELS[a.appliedClass] || a.appliedClass} (${a.phase || "-"})`,
      NSC_STATUS_LABELS[a.status] || a.status,
      a.receivedDate || "-",
      a.address ? a.address.substring(0, 30) + (a.address.length > 30 ? "..." : "") : "-"
    ])

    autoTable(doc, {
      startY: nextY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 35 },
        4: { cellWidth: 25 },
        5: { cellWidth: 18 },
        6: { cellWidth: 30 },
        7: { cellWidth: 30 },
        8: { cellWidth: 18 },
        9: { cellWidth: 50 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      }
    })

    doc.save(`NSC_All_Status_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "All Status PDF exported successfully" })
  }

  const downloadAllStatusExcel = async () => {
    const XLSX = await import("xlsx")

    if (apps.length === 0) {
      toast({ title: "No applications found", variant: "destructive" })
      return
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary matrix
    const agencies = Array.from(new Set(apps.map(a => a.agency).filter(Boolean))).sort()
    const statuses = Object.keys(NSC_STATUS_LABELS)
    
    const matrixHeader = ["Agency", ...statuses.map(st => NSC_STATUS_LABELS[st]), "Total"]
    const matrixRows = [
      ["NSC Status Distribution Per Agency"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      matrixHeader
    ]

    agencies.forEach(ag => {
      const agApps = apps.filter(a => a.agency === ag)
      const counts = statuses.map(st => String(agApps.filter(a => a.status === st).length))
      matrixRows.push([
        ag,
        ...counts,
        String(agApps.length)
      ])
    })

    const grandTotals = statuses.map(st => String(apps.filter(a => a.status === st).length))
    matrixRows.push([
      "GRAND TOTAL",
      ...grandTotals,
      String(apps.length)
    ])

    const wsSummary = XLSX.utils.aoa_to_sheet(matrixRows)
    wsSummary["!cols"] = [
      { wch: 25 },
      ...statuses.map(() => ({ wch: 18 })),
      { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, wsSummary, "Status Summary")

    // Sheet 2: Detailed Records
    const detailRows = apps.map((a, i) => ({
      "#": i + 1,
      "Receive No": a.receiveNo || "",
      "Office Ref No": a.officeRefNo || "",
      "Applicant Name": a.applicantName || "",
      "C/O": a.careOf || "",
      "Address": a.address || "",
      "Mobile": a.mobile || "",
      "Class": CLASS_LABELS[a.appliedClass] || a.appliedClass || "",
      "Phase": a.phase || "",
      "Agency": a.agency || "",
      "Status": NSC_STATUS_LABELS[a.status] || a.status || "",
      "Received Date": a.receivedDate || "",
      "Load (kW)": a.load || "",
      "Pole Required": a.poleRequired || "",
      "Project ID": a.projectId || "",
      "Agency Decision": a.agencyDecision || "",
      "Admin Decision": a.adminDecision || "",
      "Application No": a.applicationNo || "",
      "Memo No": a.memoNo || ""
    }))

    const wsDetail = XLSX.utils.json_to_sheet(detailRows)
    wsDetail["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(wb, wsDetail, "All Records")

    XLSX.writeFile(wb, `NSC_All_Status_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "All Status Excel exported successfully" })
  }

  // 3. Inspection Pending Report
  const downloadInspectionPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const pendingInsApps = apps.filter(a => a.status === "pending")

    if (pendingInsApps.length === 0) {
      toast({ title: "No inspection pending applications found", variant: "destructive" })
      return
    }

    pendingInsApps.sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.receivedDate || "").localeCompare(b.receivedDate || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Header
    doc.setFontSize(16)
    doc.setTextColor(40, 53, 147)
    doc.text("NSC Inspection Pending Report", pw / 2, 14, { align: "center" })

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending Inspections: ${pendingInsApps.length}`,
      pw / 2, 20, { align: "center" }
    )

    const agencies = Array.from(new Set(pendingInsApps.map(a => a.agency).filter(Boolean))).sort()
    const summaryRows = agencies.map((ag, idx) => [
      idx + 1,
      ag,
      pendingInsApps.filter(a => a.agency === ag).length
    ])

    summaryRows.push([
      "",
      "TOTAL PENDING INSPECTIONS",
      pendingInsApps.length
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Agency", "Pending Inspections"]],
      body: summaryRows,
      styles: { fontSize: 8, font: "helvetica", halign: "center", cellPadding: 2 },
      headStyles: { fillColor: [40, 53, 147], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = "bold"
          data.cell.styles.fillColor = [230, 235, 255]
          data.cell.styles.textColor = [40, 53, 147]
        }
      },
      theme: "grid",
      margin: { left: 50, right: 50 }
    })

    const nextY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setTextColor(40, 53, 147)
    doc.text("Detailed Inspection Pending List", 14, nextY)

    const cols = ["#", "Receive No", "Applicant Name", "Agency", "Mobile", "Class & Phase", "Received Date", "Address"]
    const body = pendingInsApps.map((a, i) => [
      i + 1,
      a.receiveNo || "-",
      a.applicantName || "-",
      a.agency || "-",
      a.mobile || "-",
      `${CLASS_LABELS[a.appliedClass] || a.appliedClass} (${a.phase || "-"})`,
      a.receivedDate || "-",
      a.address ? a.address.substring(0, 40) + (a.address.length > 40 ? "..." : "") : "-"
    ])

    autoTable(doc, {
      startY: nextY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
        2: { cellWidth: 40 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { cellWidth: 35 },
        6: { cellWidth: 25 },
        7: { cellWidth: 80 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      }
    })

    doc.save(`NSC_Inspection_Pending_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "Inspection Pending PDF exported successfully" })
  }

  const downloadInspectionPendingExcel = async () => {
    const XLSX = await import("xlsx")

    const pendingInsApps = apps.filter(a => a.status === "pending")

    if (pendingInsApps.length === 0) {
      toast({ title: "No inspection pending applications found", variant: "destructive" })
      return
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const agencies = Array.from(new Set(pendingInsApps.map(a => a.agency).filter(Boolean))).sort()
    const summaryRows = [
      ["NSC Inspection Pending Summary Report"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["#", "Agency", "Pending Inspections"]
    ]

    agencies.forEach((ag, idx) => {
      summaryRows.push([
        String(idx + 1),
        ag,
        String(pendingInsApps.filter(a => a.agency === ag).length)
      ])
    })

    summaryRows.push([
      "",
      "GRAND TOTAL",
      String(pendingInsApps.length)
    ])

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary["!cols"] = [
      { wch: 5 },
      { wch: 25 },
      { wch: 20 }
    ]
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary")

    // Sheet 2: Detailed Records
    const detailRows = pendingInsApps.map((a, i) => ({
      "#": i + 1,
      "Receive No": a.receiveNo || "",
      "Applicant Name": a.applicantName || "",
      "C/O": a.careOf || "",
      "Address": a.address || "",
      "Mobile": a.mobile || "",
      "Class": CLASS_LABELS[a.appliedClass] || a.appliedClass || "",
      "Phase": a.phase || "",
      "Agency": a.agency || "",
      "Received Date": a.receivedDate || "",
      "Load (kW)": a.load || ""
    }))

    const wsDetail = XLSX.utils.json_to_sheet(detailRows)
    wsDetail["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 15 },
      { wch: 10 }
    ]
    XLSX.utils.book_append_sheet(wb, wsDetail, "Inspection Pending")

    XLSX.writeFile(wb, `NSC_Inspection_Pending_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Inspection Pending Excel exported successfully" })
  }

  const exportReport = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Metric", "Count"],
      ["Total Applications", total],
      ["Pending Inspection", pending],
      ["Inspection Completed", inspected],
      ["Quotation Issued", quotation],
      ["Dispute Letter Issued", dispute],
    ]), "Summary")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Class", "Total", "Pending", "Inspected", "Completed"],
      ...byClass.map(c => [c.label, c.total, c.pending, c.inspected, c.done]),
    ]), "By Class")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Phase", "Total", "Pending", "Inspected", "Completed"],
      ...byPhase.map(p => [p.phase, p.total, p.pending, p.inspected, p.done]),
    ]), "By Phase")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Agency", "Total", "Pending", "Inspected", "Accepted", "Rejected"],
      ...byAgency.map(a => [a.agency, a.total, a.pending, a.inspected, a.accepted, a.rejected]),
    ]), "By Agency")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(apps.map(a => ({
      "Receive No": a.receiveNo, "Date": a.receivedDate, "Name": a.applicantName,
      "C/O": a.careOf, "Address": a.address, "Mobile": a.mobile,
      "Class": CLASS_LABELS[a.appliedClass] || a.appliedClass, "Phase": a.phase,
      "Agency": a.agency, "Status": NSC_STATUS_LABELS[a.status] || a.status,
      "Agency Decision": a.agencyDecision, "Admin Decision": a.adminDecision,
      "Application No": a.applicationNo, "Memo No": a.memoNo,
      "Existing Consumer ID": a.existingConsumerId,
      "Load (kW)": a.load, "DTR Capacity": a.dtrCapacity,
    }))), "All Applications")
    XLSX.writeFile(wb, `nsc-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Report exported" })
  }

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )

  const Table = ({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b"><p className="font-semibold text-gray-800 text-sm">{title}</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-gray-600 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Applications"        value={total}     color="bg-gray-50 border-gray-200" />
        <StatCard label="Pending Inspection"        value={pending}   color="bg-yellow-50 border-yellow-200" />
        <StatCard label="Inspection Completed"      value={inspected} color="bg-blue-50 border-blue-200" />
        <StatCard label="Quotation Issued"          value={quotation} color="bg-green-50 border-green-200" />
        <StatCard label="Dispute Issued"            value={dispute}   color="bg-red-50 border-red-200" />
        <StatCard label="Accepted by Agency"        value={apps.filter(a => a.agencyDecision === "accepted").length} color="bg-teal-50 border-teal-200" />
      </div>

      {/* Custom Reports Panel */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="px-5 py-4 border-b bg-slate-50/50">
          <h3 className="font-bold text-gray-950 text-sm">Download Custom Reports</h3>
          <p className="text-xs text-gray-500 mt-0.5">Generate customized PDF reports and Excel spreadsheets with summary pages</p>
        </div>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Agency Pending Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-blue-200 hover:bg-blue-50/5 transition">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold tracking-wider text-blue-700 uppercase bg-blue-100/60 px-2 py-0.5 rounded-full">Report 1</span>
                <h4 className="font-bold text-gray-900 text-sm">Agency Pending Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  List of NSC applications pending with agencies at any stage (Inspection, Erection, or Meter Installation).
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 hover:text-red-800 transition" onClick={downloadAgencyPendingPDF}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100 hover:text-green-800 transition" onClick={downloadAgencyPendingExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>

            {/* Card 2: All Status Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-blue-200 hover:bg-blue-50/5 transition">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold tracking-wider text-indigo-700 uppercase bg-indigo-100/60 px-2 py-0.5 rounded-full">Report 2</span>
                <h4 className="font-bold text-gray-900 text-sm">All Status Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Comprehensive listing and matrix breakdown of all applications across all statuses and assigned agencies.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 hover:text-red-800 transition" onClick={downloadAllStatusPDF}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100 hover:text-green-800 transition" onClick={downloadAllStatusExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>

            {/* Card 3: Inspection Pending Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-blue-200 hover:bg-blue-50/5 transition">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold tracking-wider text-amber-700 uppercase bg-amber-100/60 px-2 py-0.5 rounded-full">Report 3</span>
                <h4 className="font-bold text-gray-900 text-sm">Inspection Pending Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Focused list and summary of applications currently awaiting their initial site inspections by agencies.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 hover:text-red-800 transition" onClick={downloadInspectionPendingPDF}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100 hover:text-green-800 transition" onClick={downloadInspectionPendingExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Analytics Tables */}
      <Table title="By Applied Class"   headers={["Class", "Total", "Pending", "Inspected", "Completed"]} rows={byClass.map(c => [c.label, c.total, c.pending, c.inspected, c.done])} />
      <Table title="By Phase"           headers={["Phase", "Total", "Pending", "Inspected", "Completed"]} rows={byPhase.map(p => [p.phase, p.total, p.pending, p.inspected, p.done])} />
      {byAgency.length > 0 && (
        <Table title="Agency Performance" headers={["Agency", "Total", "Pending", "Inspected", "Accepted", "Rejected"]}
          rows={byAgency.map(a => [a.agency, a.total, a.pending, a.inspected, a.accepted, a.rejected])} />
      )}

      <Button className="w-full bg-slate-950 hover:bg-slate-900 text-white h-11" onClick={exportReport}>
        <FileDown className="h-4 w-4 mr-2" /> Export Full System Raw Data (Excel)
      </Button>
    </div>
  )
}

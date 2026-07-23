"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Search, X, Plus, RefreshCw, Loader2, Check, AlertCircle,
  Printer, ChevronLeft, ChevronRight, RotateCcw, Package,
  ArrowLeft, Upload, ChevronDown, ChevronUp, FileDown, ClipboardCheck,
  MapPin, Phone, Building2, FileSpreadsheet, Monitor,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { MeterStock, MeterIssue, StockSummary, MeterTypeLabel } from "@/lib/meter-types"
import { METER_TYPES } from "@/lib/meter-types"
import { MeterIssueForm } from "@/components/meter-issue-form"
import { MeterCompleteForm } from "@/components/meter-complete-form"
import { printMeterSlip } from "@/components/meter-slip"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import type { ConsumerMasterRow } from "@/components/consumer-master"
// xlsx loaded dynamically to reduce initial bundle size
const loadXLSX = () => import("xlsx")

const ADMIN_CACHE_KEY  = "meter_stock_cache"
const AGENCY_CACHE_KEY = "meter_issues_cache"

type Tab = "stock" | "active" | "history" | "reports" | "proposed"
type View = "list" | "issue" | "complete" | "addstock"
type SyncState = "idle" | "loading" | "updated"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "Faulty Replacement",
  burnt_replacement:  "Burnt Replacement",
  slow_fast:          "Slow/Fast",
  nsc:                "NSC",
}

const PURPOSE_COLORS: Record<string, string> = {
  nsc:                "text-green-700",
  faulty_replacement: "text-orange-600",
  burnt_replacement:  "text-red-600",
  slow_fast:          "text-amber-600",
}

const STATUS_COLORS: Record<string, string> = {
  issued:            "bg-yellow-100 text-yellow-800",
  installation_done: "bg-teal-100 text-teal-800",
  installed:         "bg-green-100 text-green-800",
  returned:          "bg-gray-100 text-gray-700",
}

const STATUS_LABELS: Record<string, string> = {
  issued:            "Issued",
  installation_done: "Installation Done",
  installed:         "Installed",
  returned:          "Returned",
}

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
}

interface MeterReplacement {
  replacementId: string
  consumerId: string
  consumerName: string
  address: string
  mobile: string
  agency: string
  purpose: string
  proposedDate: string
  status: "proposed" | "issued" | "updated" | "replaced"
  serialNo: string
  issueId: string
  remarks: string
  oldMeterNo?: string
  workOrderNo?: string
}

export function MeterList({ userRole, userAgencies, username, agencies }: Props) {
  const { toast } = useToast()
  const isAdmin = userRole === "admin" || userRole === "executive"

  const [summary, setSummary]   = useState<StockSummary[]>([])
  const [stock, setStock]       = useState<MeterStock[]>([])
  const [issues, setIssues]     = useState<MeterIssue[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab]           = useState<Tab>("active")
  const [view, setView]         = useHashState<View>("meter", "list")
  const [search, setSearch]         = useState("")
  const [purposeFilter, setPurposeFilter] = useState<string>("all")
  const [selected, setSelected] = useState<MeterIssue | null>(null)
  const [page, setPage]         = useState(1)
  const [selectedForSlip, setSelectedForSlip]         = useState<Set<string>>(new Set())
  const [stockOpen, setStockOpen]                     = useState(false)
  const [showFinalizeModal, setShowFinalizeModal]     = useState(false)
  const [selectedForFinalize, setSelectedForFinalize] = useState<Set<string>>(new Set())
  const [finalizeRef, setFinalizeRef]                 = useState("")
  const [finalizeInstNo, setFinalizeInstNo]           = useState("")
  const [finalizing, setFinalizing]                   = useState(false)
  const [prefill, setPrefill]                         = useState<any>(null)
  const [replacements, setReplacements]               = useState<MeterReplacement[]>([])
  const [loadingReplacements, setLoadingReplacements] = useState(false)
  const [repSubTab, setRepSubTab]                     = useState<"pending" | "progress" | "replaced" | "all">("pending")
  // NSC quotation lookup — keyed by receiveNo → status
  const [nscStatusMap, setNscStatusMap]               = useState<Record<string, string>>({})
  const [oldMeterMap, setOldMeterMap]                 = useState<Record<string, string>>({})

  useEffect(() => {
    async function loadMasterMap() {
      try {
        const cached = await getFromCache<ConsumerMasterRow[]>("consumer_master_cache")
        if (cached && Array.isArray(cached)) {
          const map: Record<string, string> = {}
          cached.forEach(c => {
            if (c.consumerId && c.meterNo) {
              map[c.consumerId] = c.meterNo
            }
          })
          setOldMeterMap(map)
        } else {
          const res = await fetch("/api/consumer-master")
          if (res.ok) {
            const data: ConsumerMasterRow[] = await res.json()
            await saveToCache("consumer_master_cache", data)
            const map: Record<string, string> = {}
            data.forEach(c => {
              if (c.consumerId && c.meterNo) {
                map[c.consumerId] = c.meterNo
              }
            })
            setOldMeterMap(map)
          }
        }
      } catch (e) {
        console.error("Failed to load master map for old meter lookup", e)
      }
    }
    loadMasterMap()
  }, [])

  const PAGE = 20

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      if (isAdmin) {
        // 1. Instant cache hit
        const cached = await getFromCache<{ summary: StockSummary[]; stock: MeterStock[]; issues: MeterIssue[] }>(ADMIN_CACHE_KEY)
        if (cached) {
          setSummary(cached.summary || [])
          setStock(cached.stock || [])
          setIssues(cached.issues || [])
          if (!silent) setSyncState("idle")
        }
        // 2. Fetch fresh
        const res = await fetch("/api/meters/stock")
        if (!res.ok) throw new Error()
        const data = await res.json()
        const sorted = [...(data.issues || [])].reverse()
        setSummary(data.summary || [])
        setStock(data.stock || [])
        setIssues(sorted)
        await saveToCache(ADMIN_CACHE_KEY, { summary: data.summary || [], stock: data.stock || [], issues: sorted })
      } else {
        // 1. Instant cache hit
        const cached = await getFromCache<MeterIssue[]>(AGENCY_CACHE_KEY)
        if (cached) {
          setIssues(cached)
          if (!silent) setSyncState("idle")
        }
        // 2. Fetch fresh
        const res = await fetch("/api/meters/issue")
        if (!res.ok) throw new Error()
        const data: MeterIssue[] = await res.json()
        const sorted = [...data].reverse()
        setIssues(sorted)
        await saveToCache(AGENCY_CACHE_KEY, sorted)
      }
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
      loadReplacements()
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load meter data", variant: "destructive" })
    }
  }

  // Load NSC data once to build receiveNo → status map for quotation badges
  useEffect(() => {
    fetch("/api/nsc")
      .then(r => r.ok ? r.json() : [])
      .then((data: { receiveNo: string; status: string }[]) => {
        const map: Record<string, string> = {}
        data.forEach(a => { if (a.receiveNo) map[a.receiveNo] = a.status })
        setNscStatusMap(map)
      })
      .catch(() => {})
  }, [])

  const loadReplacements = async () => {
    setLoadingReplacements(true)
    try {
      const cached = await getFromCache<MeterReplacement[]>("meter_replacement_data_cache")
      if (cached && cached.length > 0) {
        setReplacements(cached)
      }
      const res = await fetch("/api/meters/replacement")
      if (res.ok) {
        const data = await res.json()
        setReplacements(data)
        await saveToCache("meter_replacement_data_cache", data)
      }
    } catch {
      toast({ title: "Failed to load proposed replacements", variant: "destructive" })
    } finally {
      setLoadingReplacements(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab === "proposed" || view === "issue") {
      loadReplacements()
    }
  }, [tab, view])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredIssues = useMemo(() => {
    let data = issues
    if (tab === "active")  data = data.filter(i => i.status === "issued" || i.status === "installation_done")
    if (tab === "history") data = data.filter(i => i.status === "installed" || i.status === "returned")
    if (!isAdmin) {
      const upper = userAgencies.map(a => a.toUpperCase())
      data = data.filter(i => upper.includes(i.agency.toUpperCase()))
    }
    if (purposeFilter !== "all") data = data.filter(i => i.purpose === purposeFilter)
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(i =>
        i.issueId.toLowerCase().includes(q) ||
        i.serialNo.toLowerCase().includes(q) ||
        i.consumerId.includes(q) ||
        i.consumerName.toLowerCase().includes(q) ||
        i.agency.toLowerCase().includes(q) ||
        i.nscReceiveNo.toLowerCase().includes(q)
      )
    }
    return data
  }, [issues, tab, search, purposeFilter, isAdmin, userAgencies])

  const filteredReplacements = useMemo(() => {
    let data = replacements
    if (!isAdmin) {
      const upper = userAgencies.map(a => a.toUpperCase())
      data = data.filter(r => upper.includes((r.agency || "").toUpperCase()))
    }
    if (repSubTab === "pending") {
      data = data.filter(r => (r.status || "").toLowerCase() === "proposed")
    } else if (repSubTab === "progress") {
      data = data.filter(r => (r.status || "").toLowerCase() === "issued" || (r.status || "").toLowerCase() === "updated")
    } else if (repSubTab === "replaced") {
      data = data.filter(r => (r.status || "").toLowerCase() === "replaced")
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.replacementId.toLowerCase().includes(q) ||
        r.consumerId.includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        (r.serialNo || "").toLowerCase().includes(q) ||
        (r.issueId || "").toLowerCase().includes(q) ||
        (r.agency || "").toLowerCase().includes(q)
      )
    }
    return data
  }, [replacements, repSubTab, search, isAdmin, userAgencies])

  const totalPages = Math.ceil(filteredIssues.length / PAGE)
  const paginated  = useMemo(() => filteredIssues.slice((page - 1) * PAGE, page * PAGE), [filteredIssues, page])
  useEffect(() => { setPage(1); setSelectedForFinalize(new Set()) }, [tab, search, purposeFilter])

  // ── Slip selection ────────────────────────────────────────────────────────
  const toggleSlip = (id: string) =>
    setSelectedForSlip(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Finalize selection ────────────────────────────────────────────────────
  const toggleFinalize = (id: string) =>
    setSelectedForFinalize(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const printSelected = () => {
    const toPrint = filteredIssues.filter(i => selectedForSlip.has(i.issueId))
    if (toPrint.length === 0) { toast({ title: "Select at least one issue to print" }); return }
    printMeterSlip(toPrint)
  }

  // ── Return handler ────────────────────────────────────────────────────────
  const handleReturn = async (issue: MeterIssue) => {
    const remarks = prompt("Return remarks (required):")
    if (!remarks) return
    const faulty = confirm("Mark meter as Faulty? OK = Faulty, Cancel = Back to Available")
    try {
      const res = await fetch("/api/meters/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue.issueId, remarks, faulty }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "Meter returned to stock" })
      window.dispatchEvent(new Event("notif-refresh"))
      load(true)
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
  }

  // ── Bulk finalize handler — single API call ───────────────────────────────
  const handleFinalize = async () => {
    if (selectedForFinalize.size === 0) return
    const targetIds  = Array.from(selectedForFinalize)
    const targets    = issues.filter(i => targetIds.includes(i.issueId))
    const isNSCOnly  = targets.length > 0 && targets.every(i => i.purpose === "nsc")
    if (!isNSCOnly && !finalizeRef.trim()) return
    setFinalizing(true)
    try {
      const res = await fetch("/api/meters/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueIds:       targetIds,
          completionRef:  finalizeRef.trim(),
          installationNo: finalizeInstNo.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      const { succeeded, failed } = data as { succeeded: number; failed: string[] }
      toast({
        title: `${succeeded} installation(s) finalized`,
        description: failed.length ? `${failed.length} failed` : finalizeRef.trim() ? `Note: ${finalizeRef.trim()}` : "Finalized",
        variant: failed.length ? "destructive" : "default",
      })
    } catch (e: any) {
      toast({ title: e.message || "Finalize failed", variant: "destructive" })
    } finally {
      setShowFinalizeModal(false)
      setSelectedForFinalize(new Set())
      setFinalizeRef(""); setFinalizeInstNo("")
      setFinalizing(false)
      window.dispatchEvent(new Event("notif-refresh"))
      load(true)
    }
  }

  // ── Export handler ────────────────────────────────────────────────────────
  const exportIssues = async () => {
    if (filteredIssues.length === 0) { toast({ title: "No data to export" }); return }
    const rows = filteredIssues.map(i => ({
      "Issue ID":       i.issueId,
      "Issue Date":     i.issueDate,
      "Purpose":        PURPOSE_LABELS[i.purpose] || i.purpose,
      "Consumer ID":    i.consumerId,
      "NSC Receive No": i.nscReceiveNo,
      "Consumer Name":  i.consumerName,
      "Agency":         i.agency,
      "Serial No":      i.serialNo,
      "Meter Type":     i.meterType,
      "Status":         STATUS_LABELS[i.status] || i.status,
      "Last Reading":   i.lastReading,
      "New Reading":    i.newReading,
      "Completion Ref": i.completionRef,
      "Completed At":   i.completedAt,
      "Completed By":   i.completedBy,
      "Remarks":        i.remarks,
    }))
    const XLSX = await loadXLSX()
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Meter Issues")
    XLSX.writeFile(wb, `meter-issues-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "issue") return (
    <MeterIssueForm
      availableStock={stock}
      agencies={agencies}
      prefill={prefill}
      onSave={apiCall => {
        setView("list")
        setPrefill(null)
        toast({ title: "Issuing meter...", description: "Processing in background" })
        apiCall()
          .then(id => { toast({ title: "Meter issued", description: `Issue ID: ${id}` }); load(true) })
          .catch(err => { toast({ title: "Issue failed — please retry", description: err.message, variant: "destructive" }); load(true) })
      }}
      onCancel={() => { setView("list"); setPrefill(null) }}
    />
  )

  if (view === "complete" && selected) return (
    <MeterCompleteForm
      issue={selected}
      onSave={() => { toast({ title: "Installation completed" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  if (view === "addstock") return <AddStockForm onSave={() => { setView("list"); load(true) }} onCancel={() => setView("list")} />

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${isAdmin ? (selectedForFinalize.size > 0 ? "pb-44" : "pb-28") : "pb-4"}`}>

      {/* Stock summary — admin/executive only */}
      {isAdmin && summary.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <button className="font-semibold text-gray-800 flex items-center gap-2" onClick={() => setStockOpen(o => !o)}>
              <Package className="h-4 w-4 text-blue-600" /> Stock Dashboard
              {stockOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            <Button size="sm" variant="outline" onClick={() => setView("addstock")}>
              <Plus className="h-4 w-4 mr-1" /> Add Stock
            </Button>
          </div>
          {stockOpen && <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Meter Type</th>
                  <th className="px-3 py-2 text-center text-green-700">Available</th>
                  <th className="px-3 py-2 text-center text-yellow-700">Issued</th>
                  <th className="px-3 py-2 text-center text-blue-700">Installed</th>
                  <th className="px-3 py-2 text-center text-red-700">Faulty</th>
                  <th className="px-3 py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.map(s => (
                  <tr key={s.label} className={s.available === 0 ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 font-medium">{s.label}{s.available === 0 && <span className="ml-2 text-red-600 font-bold">⚠ OUT</span>}</td>
                    <td className="px-3 py-2 text-center font-bold text-green-700">{s.available}</td>
                    <td className="px-3 py-2 text-center text-yellow-700">{s.issued}</td>
                    <td className="px-3 py-2 text-center text-blue-700">{s.installed}</td>
                    <td className="px-3 py-2 text-center text-red-700">{s.faulty}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search issue ID, serial, consumer, agency..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && selectedForSlip.size > 0 && (
            <Button size="sm" variant="outline" onClick={printSelected} className="shrink-0">
              <Printer className="h-4 w-4 mr-1" /> Print ({selectedForSlip.size})
            </Button>
          )}
          {tab !== "stock" && tab !== "proposed" && (
            <Button size="sm" variant="ghost" onClick={exportIssues} className="shrink-0" title="Export to Excel">
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {(isAdmin ? ["stock", "active", "history", "proposed", "reports"] as Tab[] : ["active", "history", "proposed"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "stock" ? "All Stock"
               : t === "active" ? `Active (${issues.filter(i => (i.status === "issued" || i.status === "installation_done") && (isAdmin || userAgencies.map((a: string) => a.toUpperCase()).includes((i.agency || "").toUpperCase()))).length})`
               : t === "history" ? "History"
               : t === "proposed" ? `Replacements (${replacements.filter((r: MeterReplacement) => (r.status || "").toLowerCase() === "proposed" && (isAdmin || userAgencies.map((a: string) => a.toUpperCase()).includes((r.agency || "").toUpperCase()))).length} pending)`
               : "Reports"}
            </button>
          ))}
        </div>

        {/* Purpose filter chips */}
        {tab !== "stock" && tab !== "reports" && tab !== "proposed" && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {[
              { value: "all",                label: "All Types",   active: "bg-blue-600 text-white border-blue-600",     inactive: "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700" },
              { value: "nsc",                label: "NSC",         active: "bg-green-600 text-white border-green-600",   inactive: "bg-white text-green-700 border-green-200 hover:border-green-400 hover:bg-green-50" },
              { value: "faulty_replacement", label: "Faulty",      active: "bg-orange-500 text-white border-orange-500", inactive: "bg-white text-orange-600 border-orange-200 hover:border-orange-400 hover:bg-orange-50" },
              { value: "burnt_replacement",  label: "Burnt",       active: "bg-red-600 text-white border-red-600",       inactive: "bg-white text-red-600 border-red-200 hover:border-red-400 hover:bg-red-50" },
              { value: "slow_fast",          label: "Slow/Fast",   active: "bg-amber-500 text-white border-amber-500",   inactive: "bg-white text-amber-600 border-amber-200 hover:border-amber-400 hover:bg-amber-50" },
            ].map(p => (
              <button key={p.value} onClick={() => setPurposeFilter(p.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                  purposeFilter === p.value ? p.active : p.inactive
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{tab === "proposed" ? filteredReplacements.length : filteredIssues.length} records</span>
          {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Updated</span>}
        </div>

        {/* Select All / None — shown when ≥1 installation_done card is selected */}
        {isAdmin && selectedForFinalize.size > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-teal-700 font-medium">{selectedForFinalize.size} selected</span>
            <button
              className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
              onClick={() => {
                const allDone = filteredIssues.filter(i => i.status === "installation_done" && i.purpose !== "nsc")
                setSelectedForFinalize(new Set(allDone.map(i => i.issueId)))
              }}>
              Select All ({filteredIssues.filter(i => i.status === "installation_done" && i.purpose !== "nsc").length})
            </button>
            <button
              className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
              onClick={() => setSelectedForFinalize(new Set())}>
              Select None
            </button>
          </div>
        )}
      </div>

      {/* Issue cards */}
      {tab !== "stock" && tab !== "reports" && tab !== "proposed" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginated.length === 0 ? (
            <div className="col-span-full text-center py-16 text-gray-400 bg-white rounded-2xl border">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No meter issues found</p>
            </div>
          ) : paginated.map(issue => (
            <Card key={issue.issueId} className={`shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full ${issue.status === "issued" && isAdmin ? "cursor-pointer" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{issue.consumerName || "No Name"}</CardTitle>
                    <p className="text-sm text-gray-600 font-mono">{issue.consumerId || "No ID"}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {isAdmin && issue.status === "issued" && (
                        <input type="checkbox" checked={selectedForSlip.has(issue.issueId)}
                          onChange={(e) => { e.stopPropagation(); toggleSlip(issue.issueId) }} className="shrink-0 accent-blue-600" />
                      )}
                      <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        ID: {issue.issueId}
                      </span>
                      {issue.nscReceiveNo && (
                        <Badge variant="outline" className="text-[10px] text-green-700 border-green-200">
                          NSC: {issue.nscReceiveNo}
                        </Badge>
                      )}
                      {issue.nscReceiveNo && nscStatusMap[issue.nscReceiveNo] === "quotation_issued" && (
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">
                          ✓ Quotation
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={STATUS_COLORS[issue.status] || ""}>{STATUS_LABELS[issue.status] || issue.status}</Badge>
                    <Badge variant="outline" className="text-xs max-w-[120px] truncate block">{issue.agency}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {issue.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-gray-600 line-clamp-2">{issue.address}</p>
                  </div>
                )}

                {issue.mobile && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${issue.mobile}`} className="text-sm text-blue-600 hover:underline">
                      {issue.mobile}
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-700 font-mono">
                        {oldMeterMap[issue.consumerId] || "—"}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">Old Meter No</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800 font-mono">
                        {issue.serialNo || "—"}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">New Meter Serial</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  <div><span className="font-medium">Purpose:</span> <span className={`font-semibold ${PURPOSE_COLORS[issue.purpose] ?? "text-blue-700"}`}>{PURPOSE_LABELS[issue.purpose] || issue.purpose}</span></div>
                  <div><span className="font-medium">Type:</span> {issue.meterType || "—"}</div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                  <div>Issued: {issue.issueDate || "—"}</div>
                  {issue.status !== "issued" && issue.completedAt && (
                    <div className="text-right">
                      <p className="text-green-600 font-medium">{issue.completedAt}</p>
                      <p className="text-[10px] text-gray-400">Completed</p>
                    </div>
                  )}
                </div>

                {issue.status !== "issued" && (issue.completionRef || issue.installationNo) && (
                  <div className="pt-2 border-t mt-2 flex flex-col gap-1 text-xs text-gray-500">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {issue.completionRef && (
                        <p>WO No: <strong className="text-slate-700 font-mono">{issue.completionRef}</strong></p>
                      )}
                      {issue.installationNo && (
                        <p>Inst No: <strong className="text-slate-700 font-mono">{issue.installationNo}</strong></p>
                      )}
                    </div>
                  </div>
                )}

                {issue.status === "issued" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    {/* Agency: complete installation */}
                    {!isAdmin && (
                      <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                        onClick={() => { setSelected(issue); setView("complete") }}>
                        Mark Installed
                      </Button>
                    )}
                    {/* Admin: return to stock + print */}
                    {isAdmin && (
                      <>
                        <Button size="sm" className="flex-1 h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleReturn(issue) }}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 px-2 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                          onClick={(e) => { e.stopPropagation(); setSelectedForSlip(new Set([issue.issueId])); printMeterSlip([issue]) }}>
                          <Printer className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* Admin: finalize installation_done */}
                {issue.status === "installation_done" && isAdmin && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex items-center gap-3">
                      {issue.purpose !== "nsc" && (
                        <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-teal-600"
                            checked={selectedForFinalize.has(issue.issueId)}
                            onChange={() => toggleFinalize(issue.issueId)}
                          />
                          <span className="text-xs text-gray-500 font-medium">Select for bulk finalize</span>
                        </label>
                      )}
                      {issue.purpose === "nsc" && <span className="flex-1 text-xs text-gray-400 font-medium">NSC — finalize individually</span>}
                      {issue.afterImage && <a href={issue.afterImage} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline font-medium">After ↗</a>}
                      {issue.beforeImage && <a href={issue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline font-medium">Before ↗</a>}
                    </div>
                    {issue.newReading && <p className="text-xs text-gray-500">New reading: <strong>{issue.newReading}</strong></p>}
                    <Button size="sm" className="w-full h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => {
                        setSelectedForFinalize(new Set([issue.issueId]))
                        setFinalizeRef(""); setFinalizeInstNo("")
                        setShowFinalizeModal(true)
                      }}>
                      <ClipboardCheck className="h-3 w-3 mr-1" /> Finalize Installation
                    </Button>
                  </div>
                )}

                {/* Agency: installation_done is read-only */}
                {issue.status === "installation_done" && !isAdmin && (
                  <div className="mt-3 pt-3 border-t text-xs text-teal-700 font-semibold flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Submitted — awaiting admin finalization
                  </div>
                )}

                {(issue.status === "installed") && (
                  <div className="flex gap-3 mt-2 pt-2 border-t text-xs text-gray-500">
                    {issue.afterImage && <a href={issue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">After ↗</a>}
                    {issue.beforeImage && <a href={issue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Before ↗</a>}
                    {issue.newReading && <span>New reading: <strong>{issue.newReading}</strong></span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Proposed replacements list */}
      {tab === "proposed" && (
        <div className="space-y-4">
          {/* Sub-tab Selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { value: "pending",  label: `Pending Issue (${replacements.filter(r => (r.status || "").toLowerCase() === "proposed" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").toUpperCase()))).length})` },
              { value: "progress", label: `Issued / In Progress (${replacements.filter(r => ((r.status || "").toLowerCase() === "issued" || (r.status || "").toLowerCase() === "updated") && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").toUpperCase()))).length})` },
              { value: "replaced", label: `Replaced / Completed (${replacements.filter(r => (r.status || "").toLowerCase() === "replaced" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").toUpperCase()))).length})` },
              { value: "all",      label: `All (${replacements.filter(r => (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").toUpperCase()))).length})` },
            ].map(sub => (
              <button key={sub.value} onClick={() => setRepSubTab(sub.value as any)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                  repSubTab === sub.value ? "bg-slate-950 text-white border-slate-950" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}>
                {sub.label}
              </button>
            ))}
          </div>

          {loadingReplacements ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
          ) : filteredReplacements.length === 0 ? (
            <div className="bg-white text-center py-16 text-gray-400 border rounded-2xl">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No replacements found matching this criteria</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReplacements.map(rep => (
                <Card key={rep.replacementId} className="shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{rep.consumerName || "No Name"}</CardTitle>
                        <p className="text-sm text-gray-600 font-mono">{rep.consumerId || "No ID"}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            ID: {rep.replacementId}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            PURPOSE_COLORS[rep.purpose] || "text-blue-700 border-blue-200"
                          }`}>
                            {PURPOSE_LABELS[rep.purpose] || rep.purpose}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          rep.status === "proposed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          rep.status === "issued" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          rep.status === "updated" ? "bg-teal-50 text-teal-700 border-teal-200" :
                          "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}>
                          {rep.status === "proposed" ? "Proposed" :
                           rep.status === "issued" ? "Issued" :
                           rep.status === "updated" ? "Installed" :
                           "Completed"}
                        </span>
                        <Badge variant="outline" className="text-xs max-w-[120px] truncate block">{rep.agency}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {rep.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-gray-600 line-clamp-2">{rep.address}</p>
                      </div>
                    )}

                    {rep.mobile && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <a href={`tel:${rep.mobile}`} className="text-sm text-blue-600 hover:underline">
                          {rep.mobile}
                        </a>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-700 font-mono">
                            {rep.oldMeterNo || oldMeterMap[rep.consumerId] || "—"}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Old Meter No</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-blue-800 font-mono">
                            {rep.serialNo || "—"}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">New Meter Serial</p>
                        </div>
                      </div>
                    </div>

                    {rep.remarks && (
                      <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
                        Remarks: "{rep.remarks}"
                      </p>
                    )}

                    {rep.attachmentUrl && (
                      <div className="pt-1">
                        <a href={rep.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline font-medium hover:text-blue-800">
                          View Attachment ↗
                        </a>
                      </div>
                    )}

                    {rep.status !== "proposed" && (
                      <div className="pt-2 border-t flex flex-col gap-1.5">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {rep.issueId && <p>Issue ID: <strong className="font-mono">{rep.issueId}</strong></p>}
                          {rep.workOrderNo && <p>WO No: <strong className="text-slate-700 font-mono">{rep.workOrderNo}</strong></p>}
                        </div>
                        {rep.status === "issued" && (
                          <p className="text-xs text-yellow-700 font-medium bg-yellow-50/50 border border-yellow-100 rounded px-2 py-0.5 w-fit">
                            Pending installation by agency
                          </p>
                        )}
                        {rep.status === "updated" && (
                          <p className="text-xs text-teal-700 font-medium bg-teal-50/50 border border-teal-100 rounded px-2 py-0.5 w-fit">
                            Installation done — awaiting admin finalization
                          </p>
                        )}
                        {rep.status === "replaced" && (
                          <p className="text-xs text-emerald-700 font-medium bg-emerald-50/50 border border-emerald-100 rounded px-2 py-0.5 w-fit">
                            Replacement completed & finalized
                          </p>
                        )}
                      </div>
                    )}

                    {rep.status === "proposed" && (
                      <Button size="sm" className="w-full bg-slate-950 hover:bg-slate-900 text-white mt-2"
                        onClick={() => {
                          setPrefill({
                            replacementId: rep.replacementId,
                            consumerId: rep.consumerId,
                            consumerName: rep.consumerName,
                            address: rep.address,
                            mobile: rep.mobile,
                            purpose: rep.purpose,
                            agency: rep.agency,
                          })
                          setView("issue")
                        }}>
                        Issue Meter
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {tab !== "proposed" && totalPages > 1 && (
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

      {/* ─── Reports tab ──────────────────────────────────────────────────────── */}
      {tab === "reports" && isAdmin && (
        <ReportsPanel issues={issues} summary={summary} onExport={exportIssues} replacements={replacements} oldMeterMap={oldMeterMap} />
      )}

      {/* Sticky bottom — bulk finalize + Issue Meter */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto space-y-2">
            {selectedForFinalize.size > 0 && (
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
                onClick={() => setShowFinalizeModal(true)}>
                <ClipboardCheck className="h-5 w-5" /> Finalize {selectedForFinalize.size} Selected
              </Button>
            )}
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("issue")}>
              <Plus className="h-5 w-5" /> Issue Meter
            </Button>
          </div>
        </div>
      )}

      {/* Bulk finalize modal */}
      {showFinalizeModal && (() => {
        const targets    = issues.filter(i => selectedForFinalize.has(i.issueId))
        const anyNSC     = targets.some(i => i.purpose === "nsc")
        const isNSCOnly  = targets.length > 0 && targets.every(i => i.purpose === "nsc")
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold">Finalize Installation</h2>
                <p className="text-sm text-gray-500 mt-0.5">{targets.length} meter{targets.length > 1 ? "s" : ""} selected</p>
              </div>

              {/* Selected items list */}
              <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-50 rounded-lg p-3">
                {targets.map(t => (
                  <div key={t.issueId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <button type="button" onClick={() => toggleFinalize(t.issueId)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                      <span className="font-mono text-gray-500 shrink-0">{t.issueId}</span>
                      <span className="text-gray-700 truncate">{t.consumerName || t.consumerId || t.nscReceiveNo}</span>
                    </div>
                    <span className="font-mono text-blue-700 shrink-0 ml-2">{t.serialNo}</span>
                  </div>
                ))}
                {targets.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No items selected</p>}
              </div>

              {!isNSCOnly && (
                <div className="space-y-2">
                  <Label>Note Number * <span className="text-xs text-gray-400 font-normal">(applies to all selected)</span></Label>
                  <Input
                    value={finalizeRef}
                    onChange={e => setFinalizeRef(e.target.value)}
                    placeholder="e.g. JE Note No. / WO-1234"
                    autoFocus
                  />
                </div>
              )}
              {anyNSC && (
                <div className="space-y-2">
                  <Label>Installation Number <span className="text-gray-400 font-normal">(NSC)</span></Label>
                  <Input
                    value={finalizeInstNo}
                    onChange={e => setFinalizeInstNo(e.target.value)}
                    placeholder="e.g. INST/26-27/0001"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowFinalizeModal(false); setFinalizeRef(""); setFinalizeInstNo("") }} disabled={finalizing}>
                  Cancel
                </Button>
                <Button className="flex-[2] bg-slate-950 hover:bg-slate-900 text-white" onClick={handleFinalize} disabled={finalizing || (!isNSCOnly && !finalizeRef.trim()) || targets.length === 0}>
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
                  {finalizing ? "Finalizing..." : isNSCOnly ? "Confirm & Finalize" : `Confirm & Finalize ${targets.length}`}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Reports Panel ─────────────────────────────────────────────────────────────
function ReportsPanel({ 
  issues, 
  summary, 
  onExport,
  replacements,
  oldMeterMap
}: { 
  issues: MeterIssue[]; 
  summary: StockSummary[]; 
  onExport: () => void;
  replacements: MeterReplacement[];
  oldMeterMap: Record<string, string>;
}) {
  const { toast } = useToast()

  const [rptStartDate, setRptStartDate] = useState("")
  const [rptEndDate, setRptEndDate]     = useState("")
  const [rptAgency, setRptAgency]       = useState("all")
  const [rptPurpose, setRptPurpose]     = useState("all")
  const [rptStatus, setRptStatus]       = useState("all")

  const reportAgencies = useMemo(() => {
    return Array.from(new Set(issues.filter(i => i.purpose !== "nsc").map(i => i.agency).filter(Boolean))).sort()
  }, [issues])

  const reportPurposes = [
    { value: "faulty_replacement", label: "Faulty / Defective" },
    { value: "burnt_replacement",  label: "Burnt Meter" },
    { value: "slow_fast",          label: "Slow / Fast" },
  ]

  const parseDateInput = (val: string) => {
    if (!val) return null
    const [y, m, d] = val.split("-").map(Number)
    return new Date(y, m - 1, d)
  }

  const parseSheetDate = (val: string) => {
    if (!val) return null
    const datePart = val.split(" ")[0]
    const [d, m, y] = datePart.split("-").map(Number)
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null
    return new Date(y, m - 1, d)
  }

  const filteredReportIssues = useMemo(() => {
    return issues.filter(i => {
      if (i.purpose === "nsc") return false
      if (i.status !== "installed" && i.status !== "installation_done") return false
      if (rptStatus === "installed" && i.status !== "installed") return false
      if (rptStatus === "installation_done" && i.status !== "installation_done") return false
      if (rptAgency !== "all" && i.agency?.toUpperCase() !== rptAgency.toUpperCase()) return false
      if (rptPurpose !== "all" && i.purpose !== rptPurpose) return false
      if (i.completedAt) {
        const replacementDate = parseSheetDate(i.completedAt)
        if (replacementDate) {
          if (rptStartDate) {
            const start = parseDateInput(rptStartDate)
            if (start && replacementDate < start) return false
          }
          if (rptEndDate) {
            const end = parseDateInput(rptEndDate)
            if (end) {
              end.setHours(23, 59, 59, 999)
              if (replacementDate > end) return false
            }
          }
        } else if (rptStartDate || rptEndDate) {
          return false
        }
      } else if (rptStartDate || rptEndDate) {
        return false
      }
      return true
    })
  }, [issues, rptStartDate, rptEndDate, rptAgency, rptPurpose, rptStatus])

  const exportNonNscReplacementReport = async () => {
    if (filteredReportIssues.length === 0) {
      toast({ title: "No matching records to export", variant: "destructive" })
      return
    }

    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()

    const rows = filteredReportIssues.map((i, idx) => {
      const rep = replacements.find(r => r.issueId === i.issueId || (r.consumerId === i.consumerId && r.status !== "proposed"))
      const oldMeter = rep?.oldMeterNo || oldMeterMap[i.consumerId] || ""
      const typeMatch = METER_TYPES.find(t => t.label === i.meterType)
      const phase = typeMatch ? typeMatch.phase : "—"

      return {
        "S.No.": idx + 1,
        "Work Order No": i.completionRef || "",
        "Consumer ID": i.consumerId,
        "Consumer Name": i.consumerName,
        "Old Meter No": oldMeter,
        "New Meter Serial": i.serialNo,
        "Phase": phase,
        "Date of Replacement": i.completedAt ? i.completedAt.split(" ")[0] : "",
        "Agency Name": i.agency,
        "Status": STATUS_LABELS[i.status] || i.status
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Replacement Report")
    XLSX.writeFile(wb, `non-nsc-replacement-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Replacement Report exported successfully" })
  }

  const totalIssued          = issues.filter(i => i.status === "issued").length
  const totalPendingFinal    = issues.filter(i => i.status === "installation_done").length
  const totalInstalled       = issues.filter(i => i.status === "installed").length
  const totalReturned        = issues.filter(i => i.status === "returned").length

  const exportAgencyPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const pendingIssues = issues.filter(i => i.status === "issued" || i.status === "installation_done")
    
    // Sort pending issues by agency then issueDate
    const sortedIssues = [...pendingIssues].sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.issueDate || "").localeCompare(b.issueDate || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Header
    doc.setFontSize(16)
    doc.setTextColor(180, 83, 9)
    doc.text("Agency-wise Pending Meter Issues Report", pw / 2, 14, { align: "center" })
    
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending: ${pendingIssues.length} (Issued: ${totalIssued}, Pending Finalization: ${totalPendingFinal})`,
      pw / 2, 20, { align: "center" }
    )

    // Summary table per agency
    const agencies = Array.from(new Set(pendingIssues.map(i => i.agency).filter(Boolean))).sort()
    const summaryRows = agencies.map((ag, idx) => {
      const agIssues = pendingIssues.filter(i => i.agency === ag)
      const pInstall = agIssues.filter(i => i.status === "issued").length
      const pFinal = agIssues.filter(i => i.status === "installation_done").length
      return [
        idx + 1,
        ag,
        pInstall,
        pFinal,
        agIssues.length
      ]
    })

    // Grand total row
    summaryRows.push([
      "",
      "GRAND TOTAL",
      totalIssued,
      totalPendingFinal,
      totalIssued + totalPendingFinal
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Agency", "Pending Installation (Issued)", "Pending Finalization (Inst. Done)", "Total Pending"]],
      body: summaryRows,
      styles: { fontSize: 8.5, font: "helvetica", halign: "center", cellPadding: 3 },
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = "bold"
          data.cell.styles.fillColor = [254, 243, 199]
          data.cell.styles.textColor = [180, 83, 9]
        }
      },
      theme: "grid"
    })

    const nextY = (doc as any).lastAutoTable.finalY + 10
    
    let startY = nextY
    if (startY > doc.internal.pageSize.height - 40) {
      doc.addPage()
      startY = 15
    }

    doc.setFontSize(11)
    doc.setTextColor(180, 83, 9)
    doc.text("Detailed Pending List (Grouped by Agency)", 14, startY)

    const cols = ["#", "Issue ID", "Issue Date", "Consumer ID", "Consumer Name", "Serial No", "Meter Type", "Purpose", "Agency", "Current Status"]
    const body = sortedIssues.map((i, idx) => [
      idx + 1,
      i.issueId || "-",
      i.issueDate || "-",
      i.consumerId || "-",
      i.consumerName || "-",
      i.serialNo || "-",
      i.meterType || "-",
      PURPOSE_LABELS[i.purpose] || i.purpose || "-",
      i.agency || "-",
      STATUS_LABELS[i.status] || i.status || "-"
    ])

    autoTable(doc, {
      startY: startY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 7.5, font: "helvetica", cellPadding: 2 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 20 },
        2: { cellWidth: 20 },
        3: { cellWidth: 22 },
        4: { cellWidth: 45 },
        5: { cellWidth: 25 },
        6: { cellWidth: 25 },
        7: { cellWidth: 35 },
        8: { cellWidth: 35 },
        9: { cellWidth: 35 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      },
      theme: "grid"
    })

    doc.save(`agency-wise-pending-meter-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "PDF Report downloaded" })
  }

  const exportAgencyPendingExcel = async () => {
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()

    const pendingIssues = issues.filter(i => i.status === "issued" || i.status === "installation_done")

    const agencies = Array.from(new Set(pendingIssues.map(i => i.agency).filter(Boolean))).sort()
    const summaryRows = [
      ["Agency-wise Pending Meter Issues Summary"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["Agency", "Pending Installation (Issued)", "Pending Finalization (Inst. Done)", "Total Pending"]
    ]

    agencies.forEach(ag => {
      const agIssues = pendingIssues.filter(i => i.agency === ag)
      const pInstall = agIssues.filter(i => i.status === "issued").length
      const pFinal = agIssues.filter(i => i.status === "installation_done").length
      summaryRows.push([
        ag,
        pInstall.toString(),
        pFinal.toString(),
        agIssues.length.toString()
      ])
    })

    summaryRows.push([
      "GRAND TOTAL",
      totalIssued.toString(),
      totalPendingFinal.toString(),
      (totalIssued + totalPendingFinal).toString()
    ])

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, "Pending Summary")

    const sortedIssues = [...pendingIssues].sort((a, b) => {
      const agComp = (a.agency || "").localeCompare(b.agency || "")
      if (agComp !== 0) return agComp
      return (a.issueDate || "").localeCompare(b.issueDate || "")
    })

    const rawRows = sortedIssues.map(i => ({
      "Issue ID": i.issueId,
      "Issue Date": i.issueDate,
      "Consumer ID": i.consumerId,
      "Consumer Name": i.consumerName,
      "Old Meter No": oldMeterMap[i.consumerId] || "",
      "Serial No": i.serialNo,
      "Meter Type": i.meterType,
      "Purpose": PURPOSE_LABELS[i.purpose] || i.purpose,
      "Agency": i.agency,
      "Status": STATUS_LABELS[i.status] || i.status,
      "NSC No": i.nscReceiveNo || "",
      "Remarks": i.remarks || ""
    }))

    const wsDetails = XLSX.utils.json_to_sheet(rawRows)
    XLSX.utils.book_append_sheet(wb, wsDetails, "Pending Details")

    XLSX.writeFile(wb, `agency-wise-pending-meter-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Excel Report downloaded" })
  }

  const purposeBreakdown = [
    { label: "Faulty Replacement",  key: "faulty_replacement" },
    { label: "Burnt Replacement",   key: "burnt_replacement" },
    { label: "Slow/Fast",           key: "slow_fast" },
    { label: "NSC",                 key: "nsc" },
  ].map(p => ({
    ...p,
    issued:    issues.filter(i => i.purpose === p.key && i.status === "issued").length,
    pending:   issues.filter(i => i.purpose === p.key && i.status === "installation_done").length,
    installed: issues.filter(i => i.purpose === p.key && i.status === "installed").length,
    returned:  issues.filter(i => i.purpose === p.key && i.status === "returned").length,
    total:     issues.filter(i => i.purpose === p.key).length,
  }))

  const meterTypeBreakdown = Array.from(new Set(issues.map(i => i.meterType).filter(Boolean))).map(type => ({
    type,
    issued:    issues.filter(i => i.meterType === type && i.status === "issued").length,
    pending:   issues.filter(i => i.meterType === type && i.status === "installation_done").length,
    installed: issues.filter(i => i.meterType === type && i.status === "installed").length,
    returned:  issues.filter(i => i.meterType === type && i.status === "returned").length,
    total:     issues.filter(i => i.meterType === type).length,
  })).sort((a, b) => b.total - a.total)

  const agencyBreakdown = Array.from(new Set(issues.map(i => i.agency).filter(Boolean))).map(agency => ({
    agency,
    issued:    issues.filter(i => i.agency === agency && i.status === "issued").length,
    pending:   issues.filter(i => i.agency === agency && i.status === "installation_done").length,
    installed: issues.filter(i => i.agency === agency && i.status === "installed").length,
    returned:  issues.filter(i => i.agency === agency && i.status === "returned").length,
    total:     issues.filter(i => i.agency === agency).length,
  })).sort((a, b) => b.total - a.total)

  const exportReport = async () => {
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()
    // Summary sheet
    const summaryRows = [
      ["Metric", "Count"],
      ["Currently Issued (Pending Installation)", totalIssued],
      ["Installation Done (Pending Finalization)", totalPendingFinal],
      ["Fully Installed (Finalized)", totalInstalled],
      ["Returned to Stock", totalReturned],
      ["Total Issues Ever", issues.length],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary")
    // Issue type sheet
    const ptRows = [["Issue Type", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...purposeBreakdown.map(p => [p.label, p.issued, p.pending, p.installed, p.returned, p.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ptRows), "By Issue Type")
    // Meter type sheet
    const mtRows = [["Meter Type", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...meterTypeBreakdown.map(m => [m.type, m.issued, m.pending, m.installed, m.returned, m.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mtRows), "By Meter Type")
    // Agency sheet
    const agRows = [["Agency", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...agencyBreakdown.map(a => [a.agency, a.issued, a.pending, a.installed, a.returned, a.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agRows), "By Agency")
    // Stock utilization sheet
    const stRows = [["Meter Type", "Available", "Issued", "Installed", "Faulty", "Total"],
      ...summary.map(s => [s.label, s.available, s.issued, s.installed, s.faulty, s.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stRows), "Stock Utilization")
    // Raw issues sheet
    const rawRows = issues.map(i => ({
      "Issue ID": i.issueId, "Date": i.issueDate, "Purpose": i.purpose,
      "Consumer ID": i.consumerId, "Old Meter No": oldMeterMap[i.consumerId] || "", "NSC No": i.nscReceiveNo, "Consumer Name": i.consumerName,
      "Agency": i.agency, "Serial No": i.serialNo, "Meter Type": i.meterType,
      "Status": i.status, "Note No": i.completionRef, "Installation No": i.installationNo,
      "Completed At": i.completedAt, "Completed By": i.completedBy, "Remarks": i.remarks,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), "All Issues")
    XLSX.writeFile(wb, `meter-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Report exported" })
  }

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )

  const BreakdownTable = ({ title, rows, cols }: { title: string; rows: Record<string, any>[]; cols: { key: string; label: string; className?: string }[] }) => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600 border-b">
            <tr>{cols.map(c => <th key={c.key} className={`px-3 py-2 text-left ${c.className || ""}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {cols.map(c => <td key={c.key} className={`px-3 py-2 ${c.className || ""}`}>{row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Issued / Pending" value={totalIssued} color="bg-yellow-50 border-yellow-200" />
        <StatCard label="Awaiting Finalization" value={totalPendingFinal} color="bg-teal-50 border-teal-200" />
        <StatCard label="Fully Installed" value={totalInstalled} color="bg-green-50 border-green-200" />
        <StatCard label="Returned" value={totalReturned} color="bg-gray-50 border-gray-200" />
      </div>

      {/* Stock utilization */}
      {summary.length > 0 && (
        <BreakdownTable
          title="Stock Utilization"
          cols={[
            { key: "label",     label: "Meter Type" },
            { key: "available", label: "Available",  className: "text-green-700 font-semibold" },
            { key: "issued",    label: "Issued",     className: "text-yellow-700" },
            { key: "installed", label: "Installed",  className: "text-blue-700" },
            { key: "faulty",    label: "Faulty",     className: "text-red-700" },
            { key: "total",     label: "Total",      className: "text-gray-500" },
          ]}
          rows={summary}
        />
      )}

      {/* Issue type breakdown */}
      <BreakdownTable
        title="By Issue Type"
        cols={[
          { key: "label",     label: "Type" },
          { key: "issued",    label: "Issued",   className: "text-yellow-700" },
          { key: "pending",   label: "Pending",  className: "text-teal-700" },
          { key: "installed", label: "Done",     className: "text-green-700" },
          { key: "returned",  label: "Returned", className: "text-gray-500" },
          { key: "total",     label: "Total",    className: "font-semibold" },
        ]}
        rows={purposeBreakdown}
      />

      {/* Meter type breakdown */}
      {meterTypeBreakdown.length > 0 && (
        <BreakdownTable
          title="By Meter Type"
          cols={[
            { key: "type",      label: "Meter Type" },
            { key: "issued",    label: "Issued",   className: "text-yellow-700" },
            { key: "pending",   label: "Pending",  className: "text-teal-700" },
            { key: "installed", label: "Done",     className: "text-green-700" },
            { key: "returned",  label: "Returned", className: "text-gray-500" },
            { key: "total",     label: "Total",    className: "font-semibold" },
          ]}
          rows={meterTypeBreakdown}
        />
      )}

      {/* Agency breakdown */}
      {agencyBreakdown.length > 0 && (
        <BreakdownTable
          title="By Agency"
          cols={[
            { key: "agency",    label: "Agency" },
            { key: "issued",    label: "Issued",   className: "text-yellow-700" },
            { key: "pending",   label: "Pending",  className: "text-teal-700" },
            { key: "installed", label: "Done",     className: "text-green-700" },
            { key: "returned",  label: "Returned", className: "text-gray-500" },
            { key: "total",     label: "Total",    className: "font-semibold" },
          ]}
          rows={agencyBreakdown}
        />
      )}

      {/* Agency Wise Pending Report Card */}
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Agency-wise Pending Report</h3>
            <p className="text-xs text-gray-500 mt-0.5">Generate PDF or Excel containing details of all pending meter installations & finalizations grouped by agency.</p>
          </div>
        </div>

        {/* Mini stats preview */}
        <div className="grid grid-cols-3 gap-2 text-center bg-amber-50/50 rounded-lg p-2.5 border border-amber-100 text-xs">
          <div>
            <p className="text-gray-500 font-medium">Pending Install</p>
            <p className="font-bold text-amber-700 text-lg mt-0.5">{totalIssued}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Pending Finalization</p>
            <p className="font-bold text-teal-700 text-lg mt-0.5">{totalPendingFinal}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Total Pending</p>
            <p className="font-bold text-slate-900 text-lg mt-0.5">{totalIssued + totalPendingFinal}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="border-amber-200 hover:bg-amber-50 text-amber-800 w-full" onClick={exportAgencyPendingPDF}>
            <FileDown className="h-4 w-4 mr-1 text-red-600" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" className="border-amber-200 hover:bg-amber-50 text-amber-800 w-full" onClick={exportAgencyPendingExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Non-NSC Meter Replacement Report Card */}
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Meter Replacement Sheet Report</h3>
            <p className="text-xs text-gray-500 mt-0.5">Excel export for non-NSC meter replacements with date and criteria filters.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">Start Date</Label>
            <Input type="date" value={rptStartDate} onChange={e => setRptStartDate(e.target.value)} className="h-8 rounded" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">End Date</Label>
            <Input type="date" value={rptEndDate} onChange={e => setRptEndDate(e.target.value)} className="h-8 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">Agency</Label>
            <Select value={rptAgency} onValueChange={setRptAgency}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agencies</SelectItem>
                {reportAgencies.map(ag => (
                  <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">Purpose</Label>
            <Select value={rptPurpose} onValueChange={setRptPurpose}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Purposes</SelectItem>
                {reportPurposes.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500 font-semibold uppercase">Status</Label>
            <Select value={rptStatus} onValueChange={setRptStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Completed</SelectItem>
                <SelectItem value="installed">Finalized (Installed)</SelectItem>
                <SelectItem value="installation_done">Pending Finalization</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3 mt-1 text-xs">
          <span className="text-gray-500">Matching Records: <strong className="text-slate-900">{filteredReportIssues.length}</strong></span>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={exportNonNscReplacementReport} disabled={filteredReportIssues.length === 0}>
            <FileDown className="h-4 w-4 mr-1" /> Download Excel
          </Button>
        </div>
      </div>

      {/* Export */}
      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11" onClick={exportReport}>
        <FileDown className="h-4 w-4 mr-2" /> Export Full Report (Excel)
      </Button>
    </div>
  )
}

// ── Add Stock sub-form ────────────────────────────────────────────────────────
function AddStockForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  type EntryMode = "individual" | "range" | "excel"
  const [mode, setMode]         = useState<EntryMode>("individual")
  const [typeLabel, setTypeLabel] = useState<MeterTypeLabel | "">("")
  const [serial, setSerial]     = useState("")
  const [prefix, setPrefix]     = useState("")
  const [rangeStart, setRangeStart] = useState("")
  const [rangeEnd, setRangeEnd]   = useState("")
  const [batchRemarks, setBatchRemarks] = useState("")
  const [preview, setPreview]   = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const previewRange = () => {
    const s = parseInt(rangeStart, 10), e = parseInt(rangeEnd, 10)
    if (isNaN(s) || isNaN(e) || e < s) { setPreview([]); return }
    const pad = Math.max(rangeStart.length, rangeEnd.length)
    const arr: string[] = []
    for (let i = s; i <= e && arr.length < 10; i++) arr.push(prefix + String(i).padStart(pad, "0"))
    if (e - s + 1 > 10) arr.push(`... +${e - s + 1 - 10} more`)
    setPreview(arr)
  }

  const handleExcel = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const XLSX = await loadXLSX()
      const wb = XLSX.read(ev.target?.result, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      const meters = rows.map(r => ({
        serialNo:    String(r["Serial No"] || r["serial_no"] || r["SerialNo"] || "").trim(),
        typeLabel:   String(r["Type Label"] || r["type_label"] || r["TypeLabel"] || "").trim() as MeterTypeLabel,
        batchRemarks: String(r["Remarks"] || "").trim(),
      })).filter(m => m.serialNo && m.typeLabel)
      if (meters.length === 0) { toast({ title: "No valid rows found in Excel", variant: "destructive" }); return }
      setSubmitting(true)
      try {
        const res = await fetch("/api/meters/stock", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meters }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        toast({ title: `${data.added} meters added from Excel` })
        onSave()
      } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
      finally { setSubmitting(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSubmit = async () => {
    if (!typeLabel) { alert("Select meter type."); return }
    let meters: { serialNo: string; typeLabel: MeterTypeLabel; batchRemarks?: string }[] = []
    if (mode === "individual") {
      if (!serial.trim()) { alert("Enter serial number."); return }
      meters = [{ serialNo: serial.trim(), typeLabel, batchRemarks }]
    } else {
      const s = parseInt(rangeStart, 10), e = parseInt(rangeEnd, 10)
      if (isNaN(s) || isNaN(e) || e < s) { alert("Invalid range."); return }
      if (!prefix.trim()) { alert("Enter prefix."); return }
      const pad = Math.max(rangeStart.length, rangeEnd.length)
      for (let i = s; i <= e; i++) meters.push({ serialNo: prefix + String(i).padStart(pad, "0"), typeLabel, batchRemarks })
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meters }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: `${data.added} meter${data.added > 1 ? "s" : ""} added to stock` })
      onSave()
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
    finally { setSubmitting(false) }
  }

  const downloadStockTemplate = async () => {
    const XLSX = await loadXLSX()
    const sampleRows = [
      { "Serial No": "SGB10001", "Type Label": "1P 5-30A Smart", "Remarks": "Initial Batch 2026" },
      { "Serial No": "SGB10002", "Type Label": "3P 10-60A Smart", "Remarks": "Initial Batch 2026" },
      { "Serial No": "SGB10003", "Type Label": "3P CT Operated 100/5A", "Remarks": "High Value Meter" },
    ]
    const ws = XLSX.utils.json_to_sheet(sampleRows)
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ["Valid Type Labels:"],
      ...METER_TYPES.map(t => [t.label])
    ], { origin: -1 })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Stock Template")
    XLSX.writeFile(wb, "Meter_Stock_Upload_Template.xlsx")
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Add Meters to Stock</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Entry mode */}
          <div className="grid grid-cols-3 gap-2">
            {(["individual", "range", "excel"] as EntryMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`py-2 rounded-lg text-xs font-semibold border transition ${mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                {m === "individual" ? "One by One" : m === "range" ? "Range" : "Excel Upload"}
              </button>
            ))}
          </div>

          {/* Meter type */}
          {mode !== "excel" && (
            <div className="space-y-2">
              <Label>Meter Type *</Label>
              <Select value={typeLabel} onValueChange={v => setTypeLabel(v as MeterTypeLabel)}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {METER_TYPES.map(t => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "individual" && (
            <div className="space-y-2">
              <Label>Serial Number *</Label>
              <Input value={serial} onChange={e => setSerial(e.target.value.toUpperCase())} placeholder="e.g. MFG00123" className="font-mono" />
            </div>
          )}

          {mode === "range" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Manufacturer Prefix</Label>
                <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. SGB" className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start Number</Label>
                  <Input value={rangeStart} onChange={e => setRangeStart(e.target.value.replace(/\D/g, ""))} placeholder="001" className="font-mono" onBlur={previewRange} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Number</Label>
                  <Input value={rangeEnd} onChange={e => setRangeEnd(e.target.value.replace(/\D/g, ""))} placeholder="050" className="font-mono" onBlur={previewRange} />
                </div>
              </div>
              {preview.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-0.5">
                  <p className="font-semibold text-gray-700 mb-1">Preview:</p>
                  {preview.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              )}
            </div>
          )}

          {mode === "excel" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  Excel columns required: <span className="font-mono font-semibold">Serial No, Type Label</span> (optional: Remarks)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadStockTemplate}
                  className="shrink-0 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                  title="Download sample Excel template for meter stock"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Template
                </Button>
              </div>
              <p className="text-xs text-gray-400">Type Label must match exactly, e.g. "3P 10-60A Smart"</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
              <Button variant="outline" className="w-full h-12" onClick={() => fileRef.current?.click()} disabled={submitting}>
                <Upload className="h-4 w-4 mr-2" /> Select Excel / CSV File
              </Button>
            </div>
          )}

          {mode !== "excel" && (
            <div className="space-y-2">
              <Label>Batch Remarks (optional)</Label>
              <Input value={batchRemarks} onChange={e => setBatchRemarks(e.target.value)} placeholder="e.g. Batch 2026-Jun, Supplier X" />
            </div>
          )}
        </CardContent>
      </Card>

      {mode !== "excel" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
          <Button className="flex-[2] h-12 bg-slate-950 hover:bg-slate-900 text-white" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Adding..." : "Add to Stock"}
          </Button>
        </div>
      )}
    </div>
  )
}


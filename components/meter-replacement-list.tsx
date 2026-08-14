"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search, X, Plus, Clock, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, Download, RefreshCw, Check, ArrowLeft, RotateCcw, Package,
  MapPin, Phone, Building2, User, Upload, FileText, Monitor, FileSpreadsheet
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache, getCacheAgeMs, mergePatchToCache } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import { useModuleVersionSync } from "@/hooks/use-module-version-sync"
import type { ConsumerData } from "@/lib/google-sheets"
import type { ConsumerMasterRow } from "@/components/consumer-master"
import type { MeterReplacement } from "@/lib/meter-replacement-service"
import { compressAndWatermarkImage } from "@/lib/image-processor"

const CACHE_KEY = "meter_replacement_data_cache"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
}

type Tab = "all" | "proposed" | "issued" | "updated" | "replaced" | "completed" | "closed"
type SyncState = "idle" | "loading" | "updated"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "DEF",
  burnt_replacement:  "BURNT",
  slow_fast:          "CHECK",
}

const PURPOSE_COLORS: Record<string, string> = {
  faulty_replacement: "text-orange-600",
  burnt_replacement:  "text-red-600",
  slow_fast:          "text-amber-600",
}

function getReplacementStatusBadge(r: MeterReplacement) {
  if (r.status === "replaced") {
    if (r.noteSheetNo && r.noteSheetNo.trim()) {
      return { label: "Completed", className: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" }
    }
    return { label: "WO Done", className: "bg-teal-50 text-teal-700 border border-teal-200 font-semibold" }
  }
  if (r.status === "updated") return { label: "Installed", className: "bg-blue-50 text-blue-700 border border-blue-200 font-semibold" }
  if (r.status === "proposed") return { label: "Proposed", className: "bg-amber-50 text-amber-700 border border-amber-200" }
  if (r.status === "issued") return { label: "Issued", className: "bg-yellow-50 text-yellow-700 border border-yellow-200" }
  if (r.status === "closed") return { label: "Closed / Cancelled", className: "bg-gray-100 text-gray-700 border border-gray-300" }
  return { label: r.status, className: "bg-gray-100 text-gray-700 border border-gray-200" }
}

const STATUS_LABELS: Record<string, string> = {
  all:       "All",
  proposed:  "Proposed",
  issued:    "Issued",
  updated:   "Installed",
  replaced:  "WO Done",
  completed: "Completed",
  closed:    "Closed / Cancelled",
}

import { NoteSheetDialog } from "@/components/note-sheet-dialog"

export function MeterReplacementList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<MeterReplacement[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useHashState<"list" | "create">("meter-replacement", "list")

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [selectedForClose, setSelectedForClose] = useState<MeterReplacement | null>(null)
  const [closeRemarks, setCloseRemarks] = useState("")
  const [closing, setClosing] = useState(false)

  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [selectedForReturn, setSelectedForReturn] = useState<MeterReplacement | null>(null)
  const [returnRemarks, setReturnRemarks] = useState("")
  const [returning, setReturning] = useState(false)

  const handleReturnIssuedMeter = async () => {
    if (!selectedForReturn) return
    const targetId = selectedForReturn.issueId || selectedForReturn.replacementId
    
    // 1. Optimistic UI update
    setRecords(prev => {
      const updated = prev.map(r => (r.replacementId === selectedForReturn.replacementId || r.issueId === targetId) ? { ...r, status: "proposed", serialNo: "", issueId: "" } : r)
      saveToCache(CACHE_KEY, updated)
      return updated
    })
    setReturnDialogOpen(false)
    setSelectedForReturn(null)
    setReturnRemarks("")

    setReturning(true)
    try {
      const res = await fetch("/api/meters/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: targetId,
          remarks: returnRemarks.trim() || "Returned without installation"
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to return meter")
      toast({ title: `Meter ${selectedForReturn.serialNo || ""} returned to stock`, description: "Proposal reset to proposed status." })
    } catch (e: any) {
      toast({ title: e.message || "Failed to return meter", variant: "destructive" })
      load(true, true)
    } finally {
      setReturning(false)
    }
  }

  const [noteSheetDialogOpen, setNoteSheetDialogOpen] = useState(false)
  const [selectedForNoteSheet, setSelectedForNoteSheet] = useState<MeterReplacement | null>(null)

  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
  const [selectedForReassign, setSelectedForReassign] = useState<MeterReplacement | null>(null)
  const [newAgency, setNewAgency] = useState("")
  const [reassigning, setReassigning] = useState(false)
  
  const isAdmin = userRole === "admin" || userRole === "executive"
  const [oldMeterMap, setOldMeterMap] = useState<Record<string, string>>({})

  const handleReassignAgency = async () => {
    if (!selectedForReassign) return
    const targetId = selectedForReassign.replacementId

    // Optimistic UI update
    setRecords(prev => {
      const updated = prev.map(r => r.replacementId === targetId ? { ...r, agency: newAgency } : r)
      saveToCache(CACHE_KEY, updated)
      return updated
    })
    setReassignDialogOpen(false)
    setSelectedForReassign(null)

    setReassigning(true)
    try {
      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reassign_agency",
          replacementId: targetId,
          agency: newAgency
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to reassign agency")
      toast({ title: `Agency updated to "${newAgency || "Unassigned"}"` })
    } catch (e: any) {
      toast({ title: e.message || "Failed to reassign agency", variant: "destructive" })
      load(true, true)
    } finally {
      setReassigning(false)
    }
  }

  const handleCloseProposal = async () => {
    if (!selectedForClose || !closeRemarks.trim()) {
      toast({ title: "Please enter remarks for closing", variant: "destructive" })
      return
    }
    const targetId = selectedForClose.replacementId
    const remarks = closeRemarks.trim()

    // Optimistic UI update: instantly reflect closed status on screen
    setRecords(prev => {
      const updated = prev.map(r => r.replacementId === targetId ? { ...r, status: "closed", remarks } : r)
      saveToCache(CACHE_KEY, updated)
      return updated
    })
    setCloseDialogOpen(false)
    setSelectedForClose(null)
    setCloseRemarks("")

    setClosing(true)
    try {
      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          replacementId: targetId,
          remarks
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      toast({ title: "Proposal closed successfully" })
    } catch (e: any) {
      toast({ title: e.message || "Failed to close proposal", variant: "destructive" })
      load(true, true)
    } finally {
      setClosing(false)
    }
  }

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

  const PAGE_SIZE = 15

  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set())

  const toggleBulkSelect = (r: MeterReplacement) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (next.has(r.replacementId)) {
        next.delete(r.replacementId)
      } else {
        // Enforce same agency rule for bulk selection
        const selectedItems = Array.from(prev).map(id => records.find(item => item.replacementId === id)).filter(Boolean) as MeterReplacement[]
        if (selectedItems.length > 0) {
          const firstAgency = (selectedItems[0].agency || "").trim().toUpperCase()
          const currentAgency = (r.agency || "").trim().toUpperCase()
          if (firstAgency && currentAgency && firstAgency !== currentAgency) {
            toast({
              title: "Same Agency Required",
              description: `All selected meters must belong to the same agency (${selectedItems[0].agency}).`,
              variant: "destructive"
            })
            return prev
          }
        }
        next.add(r.replacementId)
      }
      return next
    })
  }

  useModuleVersionSync<MeterReplacement>(
    "meter-replacement",
    CACHE_KEY,
    "replacementId",
    "/api/meters/replacement?bypassCache=true",
    (updated) => {
      setRecords([...updated].reverse())
    }
  )

  const load = async (silent = false, force = false) => {
    if (!silent) setSyncState("loading")
    try {
      if (force) {
        await fetch("/api/system/reset-base?moduleKey=meter-replacement", { method: "POST" }).catch(() => {})
      }
      // 1. Instant render from local IndexedDB cache for 0ms initial display
      const cached = await getFromCache<MeterReplacement[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        const sorted = [...cached].reverse()
        setRecords(sorted)
        if (!silent) setSyncState("idle")
      }

      // 2. Automatically fetch fresh server records to reconcile additions, updates, and deleted items
      const url = force ? "/api/meters/replacement?bypassCache=true" : "/api/meters/replacement"
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const result = await res.json()
      const patchItems = (Array.isArray(result) ? result : (result.patchData || [])) as MeterReplacement[]
      const sorted = [...patchItems].reverse()
      setRecords(sorted)
      await saveToCache(CACHE_KEY, patchItems)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load replacement list", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = [...records]
    if (tab === "proposed")       data = data.filter(r => r.status === "proposed")
    else if (tab === "issued")   data = data.filter(r => r.status === "issued")
    else if (tab === "updated")  data = data.filter(r => r.status === "updated")
    else if (tab === "replaced") data = data.filter(r => r.status === "replaced" && (!r.noteSheetNo || !r.noteSheetNo.trim()))
    else if (tab === "completed") data = data.filter(r => r.status === "replaced" && r.noteSheetNo && r.noteSheetNo.trim())
    else if (tab === "closed")   data = data.filter(r => r.status === "closed")

    if (!isAdmin) {
      const upperAgencies = userAgencies.map(a => a.trim().toUpperCase())
      data = data.filter(r => tab === "proposed" ? true : upperAgencies.includes((r.agency || "").trim().toUpperCase()))
    }

    if (search) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.replacementId.toLowerCase().includes(q) ||
        r.consumerId.includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        r.mobile.includes(q) ||
        (r.agency || "").toLowerCase().includes(q) ||
        r.serialNo.toLowerCase().includes(q) ||
        r.issueId.toLowerCase().includes(q) ||
        (r.workOrderNo || "").toLowerCase().includes(q) ||
        (r.noteSheetNo || "").toLowerCase().includes(q)
      )
    }
    return data
  }, [records, tab, search, isAdmin, userAgencies])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search])

  const downloadReport = async () => {
    const XLSX = await import("xlsx")
    const rows = filtered.map((r, i) => ({
      "#": i + 1,
      "Replacement ID": r.replacementId,
      "Consumer ID": r.consumerId,
      "Old Meter No": oldMeterMap[r.consumerId] || "",
      "Name": r.consumerName,
      "Address": r.address,
      "Mobile": r.mobile,
      "Agency": r.agency,
      "Purpose": PURPOSE_LABELS[r.purpose] || r.purpose,
      "Proposed Date": r.proposedDate,
      "Status": STATUS_LABELS[r.status] || r.status,
      "Serial No": r.serialNo,
      "Issue ID": r.issueId,
      "Remarks": r.remarks,
      "Attachment URL": r.attachmentUrl,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Replacement List")
    XLSX.writeFile(wb, `Meter_Replacement_List_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const downloadProposalTemplate = async () => {
    const XLSX = await import("xlsx")
    const sampleRows = [
      {
        "Consumer ID": "661200001",
        "Consumer Name": "Consumer Name 1",
        "Address": "Main Road, Ward 5",
        "Mobile": "9876543210",
        "Agency": "AGENCY NAME",
        "Purpose": "faulty_replacement",
        "Old Meter No": "MTR10001",
        "Remarks": "Meter display blank"
      },
      {
        "Consumer ID": "661200002",
        "Consumer Name": "Consumer Name 2",
        "Address": "Station Area",
        "Mobile": "9876543211",
        "Agency": "AGENCY NAME",
        "Purpose": "burnt_replacement",
        "Old Meter No": "MTR10002",
        "Remarks": "Terminal box burnt"
      },
      {
        "Consumer ID": "661200003",
        "Consumer Name": "Consumer Name 3",
        "Address": "Market Yard",
        "Mobile": "9876543212",
        "Agency": "AGENCY NAME",
        "Purpose": "slow_fast",
        "Old Meter No": "MTR10003",
        "Remarks": "Running slow"
      }
    ]
    const ws = XLSX.utils.json_to_sheet(sampleRows)
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ["Valid Purpose Values:"],
      ["faulty_replacement (or Faulty / Defective)"],
      ["burnt_replacement (or Burnt Meter)"],
      ["slow_fast (or Slow / Fast Meter)"]
    ], { origin: -1 })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Proposal Template")
    XLSX.writeFile(wb, "Meter_Replacement_Proposal_Template.xlsx")
  }

  if (view === "create") {
    return (
      <MeterReplacementCreateForm
        agencies={agencies}
        oldMeterMap={oldMeterMap}
        downloadProposalTemplate={downloadProposalTemplate}
        onSave={(id) => {
          toast({ title: "Proposed replacement created", description: `ID: ${id}` })
          setView("list")
          load(true, true)
        }}
        onCancel={() => setView("list")}
      />
    )
  }

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Proposed", value: records.filter(r => r.status === "proposed").length, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
          { label: "Issued", value: records.filter(r => r.status === "issued").length, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-100" },
          { label: "Installation Done", value: records.filter(r => r.status === "updated").length, color: "text-teal-700", bg: "bg-teal-50 border-teal-100" },
          { label: "Replaced", value: records.filter(r => r.status === "replaced").length, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4 flex flex-col items-center shadow-sm`}>
            <span className={`text-3xl font-extrabold ${s.color} tabular-nums`}>{s.value}</span>
            <span className="text-xs text-gray-500 mt-1 font-medium text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, agency, serial..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl" title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load(false, true)} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Tab Filters */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(["all", "proposed", "issued", "updated", "replaced", "completed", "closed"] as Tab[]).map(t => {
            const valid = records
            const count = t === "all" ? valid.length
              : t === "replaced" ? valid.filter(r => r.status === "replaced" && (!r.noteSheetNo || !r.noteSheetNo.trim())).length
              : t === "completed" ? valid.filter(r => r.status === "replaced" && r.noteSheetNo && r.noteSheetNo.trim()).length
              : valid.filter(r => r.status === t).length
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {`${STATUS_LABELS[t]} (${count})`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Replacement cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {paginated.length === 0 ? (
          <div className="col-span-full bg-white text-center py-16 text-gray-400 border rounded-2xl">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No replacement proposals found</p>
          </div>
        ) : paginated.map(r => (
          <Card key={r.replacementId} className="shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-2">
                  {tab !== "all" && (tab === "updated" || tab === "completed") && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-1 accent-blue-600 cursor-pointer shrink-0"
                      checked={selectedForBulk.has(r.replacementId)}
                      onChange={() => toggleBulkSelect(r)}
                    />
                  )}
                  <div>
                    <CardTitle className="text-lg">{r.consumerName || "No Name"}</CardTitle>
                    <p className="text-sm text-gray-600 font-mono">{r.consumerId || "No ID"}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        ID: {r.replacementId}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                        PURPOSE_COLORS[r.purpose] || "text-blue-700 border-blue-200"
                      }`}>
                        {PURPOSE_LABELS[r.purpose] || r.purpose}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {(() => {
                    const st = getReplacementStatusBadge(r)
                    return <Badge className={st.className}>{st.label}</Badge>
                  })()}
                  <Badge variant="outline" className="text-xs max-w-[120px] truncate block">{r.agency || "Unassigned"}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-600 line-clamp-2">{r.address}</p>
                </div>
              )}

              {r.mobile && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a href={`tel:${r.mobile}`} className="text-sm text-blue-600 hover:underline">
                    {r.mobile}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700 font-mono">
                      {r.oldMeterNo || oldMeterMap[r.consumerId] || "—"}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Old Meter No</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800 font-mono">
                      {r.serialNo || "—"}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">New Meter Serial</p>
                  </div>
                </div>
              </div>

              {r.remarks && (
                <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
                  Remarks: "{r.remarks}"
                </p>
              )}

              {r.attachmentUrl && (
                <div className="pt-1">
                  <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline font-medium hover:text-blue-800">
                    View Attachment ↗
                  </a>
                </div>
              )}

              {(r.serialNo || r.issueId || r.workOrderNo || r.noteSheetNo) && (
                <div className="pt-2 border-t mt-2 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[11px]">
                    <span>WO: <strong className="text-slate-800">{r.workOrderNo || "—"}</strong></span>
                    <span>Note Sheet: <strong className={r.noteSheetNo ? "text-blue-700 font-bold" : "text-amber-600 font-normal"}>{r.noteSheetNo || "Pending"}</strong></span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-200">
                    <span>Issue ID: <strong className="font-mono text-gray-700">{r.issueId || "—"}</strong></span>
                    <span>New Serial: <strong className="font-mono text-blue-800">{r.serialNo || "—"}</strong></span>
                  </div>
                </div>
              )}

              {r.status === "closed" && r.closedRemarks && (
                <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 mt-2">
                  Closed Remarks: "{r.closedRemarks}"
                </p>
              )}

              {r.status === "issued" && (isAdmin || (permissions && (permissions.meter_replacement?.includes("return") || permissions.meter_stock?.includes("return")))) && (
                <div className="flex gap-2 mt-3 pt-2 border-t">
                  <Button size="sm" variant="outline" className="w-full text-xs font-semibold text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => { setSelectedForReturn(r); setReturnRemarks(""); setReturnDialogOpen(true) }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return Meter (Not Installed)
                  </Button>
                </div>
              )}

              {r.status === "proposed" && (
                <div className="flex gap-2 mt-3 pt-2 border-t">
                  {isAdmin && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                      onClick={() => { setSelectedForReassign(r); setNewAgency(r.agency || ""); setReassignDialogOpen(true) }}>
                      Change Agency
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => { setSelectedForClose(r); setCloseRemarks(""); setCloseDialogOpen(true) }}>
                    Close Proposal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Floating Bulk Action Bar */}
      {tab !== "all" && selectedForBulk.size > 0 && (() => {
        const selectedReps = Array.from(selectedForBulk).map(id => records.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
        const agencyName = selectedReps[0]?.agency || "Selected"
        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 flex-wrap justify-center">
            <span className="text-xs font-bold text-blue-400 pl-2">
              {selectedForBulk.size} selected ({agencyName})
            </span>
            {tab === "updated" && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold h-8"
                onClick={async () => {
                  const wo = prompt(`Enter Work Order Number for ${selectedForBulk.size} selected records of ${agencyName}:`)
                  if (!wo || !wo.trim()) return
                  try {
                    const res = await fetch("/api/meters/finalize", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        issueIds: Array.from(selectedForBulk).map(id => {
                          const r = records.find(item => item.replacementId === id)
                          return r?.issueId || id
                        }),
                        completionRef: wo.trim(),
                      })
                    })
                    if (!res.ok) throw new Error("Failed to add work order number")
                    toast({ title: `Added Work Order "${wo.trim()}" to ${selectedForBulk.size} records` })
                    setSelectedForBulk(new Set())
                    load(true, true)
                  } catch (err: any) {
                    toast({ title: err.message || "Failed to update work order", variant: "destructive" })
                  }
                }}>
                Add Work Order Number to Selected ({selectedForBulk.size})
              </Button>
            )}
            {tab === "completed" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8"
                onClick={async () => {
                  const remarks = prompt(`Enter Bulk Return remarks for ${selectedForBulk.size} selected completed meters:`)
                  if (!remarks || !remarks.trim()) return
                  try {
                    let successCount = 0
                    for (const id of Array.from(selectedForBulk)) {
                      const rep = records.find(r => r.replacementId === id)
                      const targetId = rep?.issueId || id
                      const res = await fetch("/api/meters/return", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ issueId: targetId, remarks: remarks.trim() })
                      })
                      if (res.ok) successCount++
                    }
                    toast({ title: `Returned ${successCount} meter(s) to office/stock` })
                    setSelectedForBulk(new Set())
                    load(true, true)
                  } catch (err: any) {
                    toast({ title: err.message || "Failed to process bulk return", variant: "destructive" })
                  }
                }}>
                Bulk Meter Return ({selectedForBulk.size})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedForBulk(new Set())} className="text-xs text-gray-300 hover:text-white h-8">
              Clear Selection
            </Button>
          </div>
        )
      })()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Proposed Float */}
      {(userRole === "admin" || userRole === "executive" || !!(permissions && permissions.meter_replacement?.includes("create"))) && (
        <div className="fixed bottom-4 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Propose Meter Replacement
            </Button>
          </div>
        </div>
      )}
      {/* Close Proposal Modal */}
      <Dialog open={closeDialogOpen} onOpenChange={open => !open && setCloseDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 font-bold">Close / Cancel Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2">
            {selectedForClose && (
              <div className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1 border">
                <p className="font-semibold text-gray-800">{selectedForClose.consumerName} ({selectedForClose.consumerId})</p>
                <p className="text-gray-500 font-mono">Proposal ID: {selectedForClose.replacementId}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold">Cancellation Reason / Remarks *</Label>
              <Textarea
                value={closeRemarks}
                onChange={e => setCloseRemarks(e.target.value)}
                placeholder="Reason for closing proposal (e.g., Meter tested OK, Consumer refused, Duplicate)..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(false)} disabled={closing}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleCloseProposal} disabled={closing || !closeRemarks.trim()}>
              {closing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Close Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Agency Modal */}
      <Dialog open={reassignDialogOpen} onOpenChange={open => !open && setReassignDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-blue-700 font-bold">Change Assigned Agency</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2">
            {selectedForReassign && (
              <div className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1 border">
                <p className="font-semibold text-gray-800">{selectedForReassign.consumerName} ({selectedForReassign.consumerId})</p>
                <p className="text-gray-500 font-mono">Proposal ID: {selectedForReassign.replacementId}</p>
                <p className="text-slate-600">Current Agency: <strong className="text-slate-900">{selectedForReassign.agency || "Unassigned"}</strong></p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold">Select New Agency</Label>
              <Select value={newAgency} onValueChange={setNewAgency}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {agencies.map(ag => (
                    <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setReassignDialogOpen(false)} disabled={reassigning}>
              Cancel
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleReassignAgency} disabled={reassigning}>
              {reassigning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Agency Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Issued Meter Modal */}
      <Dialog open={returnDialogOpen} onOpenChange={open => !open && setReturnDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 font-bold flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4" /> Return Issued Meter to Stock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2">
            {selectedForReturn && (
              <div className="bg-amber-50/60 p-2.5 rounded-lg text-xs space-y-1 border border-amber-200">
                <p className="font-semibold text-slate-800">{selectedForReturn.consumerName} ({selectedForReturn.consumerId})</p>
                <p className="text-slate-600 font-mono">Issued Meter Serial: <strong className="text-blue-800 font-bold">{selectedForReturn.serialNo || "—"}</strong></p>
                <p className="text-slate-500 font-mono">Issue ID: {selectedForReturn.issueId || selectedForReturn.replacementId}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold">Return Reason / Remarks</Label>
              <Textarea
                value={returnRemarks}
                onChange={e => setReturnRemarks(e.target.value)}
                placeholder="Reason meter could not be installed (e.g. Premises locked, Consumer refused, Wrong meter type)..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setReturnDialogOpen(false)} disabled={returning}>
              Cancel
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={handleReturnIssuedMeter} disabled={returning}>
              {returning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Return Meter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Note Sheet Modal */}
      {selectedForNoteSheet && (
        <NoteSheetDialog
          replacementId={selectedForNoteSheet.replacementId}
          currentNoteSheetNo={selectedForNoteSheet.noteSheetNo}
          workOrderNo={selectedForNoteSheet.workOrderNo}
          isOpen={noteSheetDialogOpen}
          onClose={() => { setNoteSheetDialogOpen(false); setSelectedForNoteSheet(null) }}
          onSuccess={() => { toast({ title: "Note Sheet updated" }); load(true, true) }}
        />
      )}
    </div>
  )
}

interface FormProps {
  agencies: string[]
  oldMeterMap?: Record<string, string>
  downloadProposalTemplate: () => void
  onSave: (requestId: string) => void
  onCancel: () => void
}

function MeterReplacementCreateForm({ agencies, oldMeterMap = {}, downloadProposalTemplate, onSave, onCancel }: FormProps) {
  const [entryMode, setEntryMode] = useState<"single" | "excel">("single")
  const [consumerId, setConsumerId] = useState("")
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [agencyList, setAgencyList] = useState<string[]>(agencies)
  const [lookupStatus, setLookupStatus] = useState("")

  // Form states
  const [manualName, setManualName] = useState("")
  const [manualAddress, setManualAddress] = useState("")
  const [manualMobile, setManualMobile] = useState("")
  const [oldMeterNo, setOldMeterNo] = useState("")
  const [agency, setAgency] = useState("")
  const [purpose, setPurpose] = useState("faulty_replacement")
  const [remarks, setRemarks] = useState("")
  
  // Upload states
  const [attachmentUrl, setAttachmentUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState("")

  // Excel Bulk states
  const [parsedExcelItems, setParsedExcelItems] = useState<any[]>([])
  const excelFileRef = useRef<HTMLInputElement>(null)

  // Load agencies
  useEffect(() => {
    async function loadAgencies() {
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* ignored */ }
    }
    loadAgencies()
  }, [])

  const normalizePurpose = (str: string): string => {
    const s = String(str || "").toLowerCase()
    if (s.includes("burnt")) return "burnt_replacement"
    if (s.includes("slow") || s.includes("fast")) return "slow_fast"
    return "faulty_replacement"
  }

  const handleExcelProposalUpload = async (file: File) => {
    try {
      setLooking(true)
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) {
        alert("No rows found in the uploaded Excel file.")
        setLooking(false)
        return
      }

      // Load cache for lookup
      const consumersCache = (await getFromCache<ConsumerData[]>("consumers_data_cache")) || []
      const masterCache = (await getFromCache<ConsumerMasterRow[]>("consumer_master_cache")) || []

      const parsed = rows.map((r: any) => {
        const cid = String(r["Consumer ID"] || r["ConsumerId"] || r["consumer_id"] || r["ID"] || r["Consumer ID*"] || "").trim()
        
        let cName = String(r["Consumer Name"] || r["Name"] || r["consumer_name"] || r["Consumer Name*"] || "").trim()
        let cAddr = String(r["Address"] || r["address"] || r["Address*"] || "").trim()
        let cMob = String(r["Mobile"] || r["Phone"] || r["mobile"] || "").trim()
        let cAgency = String(r["Agency"] || r["agency"] || "").trim()
        let cOldMeter = String(r["Old Meter No"] || r["Old Meter"] || r["Meter No"] || r["old_meter_no"] || "").trim()

        // Lookup from cache if consumer ID exists and missing info
        if (cid && cid.length === 9) {
          const matchConsumer = consumersCache.find(c => c.consumerId === cid)
          const matchMaster = masterCache.find(c => c.consumerId === cid)

          if (!cName) cName = matchConsumer?.name || matchMaster?.name || ""
          if (!cAddr) cAddr = matchConsumer?.address || matchMaster?.address || ""
          if (!cMob) cMob = matchConsumer?.mobileNumber || matchMaster?.mobile || ""
          if (!cAgency) cAgency = matchConsumer?.agency || ""
          if (!cOldMeter) cOldMeter = matchConsumer?.device || matchMaster?.meterNo || ""
        }

        const rawPurpose = String(r["Purpose"] || r["purpose"] || "").trim()
        const purposeVal = normalizePurpose(rawPurpose)
        const remarksVal = String(r["Remarks"] || r["remarks"] || "").trim()

        return {
          consumerId: cid || "000000000",
          consumerName: cName,
          address: cAddr,
          mobile: cMob,
          agency: cAgency,
          purpose: purposeVal,
          oldMeterNo: cOldMeter,
          remarks: remarksVal,
          isValid: !!(cName && cAddr)
        }
      })

      setParsedExcelItems(parsed)
    } catch (err: any) {
      alert("Failed to parse Excel file: " + (err.message || "Unknown error"))
    } finally {
      setLooking(false)
    }
  }

  const handleBulkSubmit = async () => {
    const validItems = parsedExcelItems.filter(i => i.isValid)
    if (validItems.length === 0) {
      alert("No valid proposal items to submit. Ensure Consumer Name and Address are present.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/replacement/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validItems })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit bulk proposals")
      
      window.dispatchEvent(new Event("notif-refresh"))
      onSave(`Bulk ${data.added} Proposals`)
    } catch (err: any) {
      alert(err.message || "Bulk submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleLookup = async () => {
    const id = consumerId.trim()
    if (id.length !== 9) { alert("Consumer ID must be 9 digits."); return }
    setLooking(true)
    setFound(null)
    setNotFound(false)
    setLookupStatus("Searching disconnection list...")
    try {
      // 1. Try active disconnection cache
      const cache = await getFromCache<ConsumerData[]>("consumers_data_cache")
      const match = cache?.find(c => c.consumerId === id) || null
      if (match) {
        setFound(match)
        setManualName(match.name)
        setManualAddress(match.address || "")
        setManualMobile(match.mobileNumber || "")
        setAgency(match.agency || "")
        setOldMeterNo(match.device || oldMeterMap[id] || "")
        setLooking(false)
        return
      }

      // 2. Try consumer master cache
      setLookupStatus("Searching master database cache...")
      let masterCache = await getFromCache<ConsumerMasterRow[]>("consumer_master_cache")
      let masterMatch = masterCache?.find(c => c.consumerId === id) || null

      // 3. Fallback to API
      if (!masterMatch) {
        setLookupStatus("Fetching consumer master from server...")
        try {
          const res = await fetch("/api/consumer-master?refresh=true")
          if (res.ok) {
            const fresh: ConsumerMasterRow[] = await res.json()
            await saveToCache("consumer_master_cache", fresh)
            masterCache = fresh
            masterMatch = fresh.find(c => c.consumerId === id) || null
          }
        } catch (e) {
          console.error("Master lookup failed:", e)
        }
      }

      if (masterMatch) {
        setLookupStatus("Mapping agency from zone...")
        let mappedAgency = ""
        try {
          let zoneMap = await getFromCache<{ zone: string; agency: string }[]>("zone_map_cache")
          if (!zoneMap || zoneMap.length === 0) {
            const res = await fetch("/api/zone-map")
            if (res.ok) {
              const fresh = await res.json()
              await saveToCache("zone_map_cache", fresh)
              zoneMap = fresh
            }
          }
          if (zoneMap && masterMatch.zone) {
            const normalizedZone = masterMatch.zone.trim().toUpperCase()
            const zoneMatch = zoneMap.find(z => z.zone.trim().toUpperCase() === normalizedZone)
            if (zoneMatch) mappedAgency = zoneMatch.agency
          }
        } catch (err) {
          console.error("Zone mapping error:", err)
        }

        setFound({
          consumerId: masterMatch.consumerId,
          name: masterMatch.name,
          address: masterMatch.address,
          mobileNumber: masterMatch.mobile,
          agency: mappedAgency || "",
        })
        setManualName(masterMatch.name)
        setManualAddress(masterMatch.address)
        setManualMobile(masterMatch.mobile || "")
        setAgency(mappedAgency || "")
        setOldMeterNo(masterMatch.meterNo || "")
      } else {
        setNotFound(true)
        setManualName("")
        setManualAddress("")
        setManualMobile("")
        setAgency("")
        setOldMeterNo("")
      }
    } catch {
      setNotFound(true)
    } finally {
      setLooking(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const dateStr = new Date().toLocaleString("en-IN", { 
        day: "2-digit", 
        month: "2-digit", 
        year: "numeric", 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: true 
      })
      const processed = await compressAndWatermarkImage(file, {
        maxDim: 800,
        watermarkLines: [`Meter Replacement — ${consumerId || "replacement"}`, `Date: ${dateStr}`],
        targetKb: 95
      })
      const fd = new FormData()
      fd.append("file", processed)
      fd.append("consumerId", consumerId || "replacement")
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setAttachmentUrl(data.url)
        setUploadedFileName(processed.name)
      } else {
        alert("Upload failed: " + (data.error || "unknown error"))
      }
    } catch (e) {
      alert("File upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim() || !manualAddress.trim()) {
      alert("Consumer Name and Address are required.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId: consumerId.trim() || "000000000",
          consumerName: manualName.trim(),
          address: manualAddress.trim(),
          mobile: manualMobile.trim() || "",
          agency: agency === "none" ? "" : agency,
          purpose,
          remarks,
          attachmentUrl,
          oldMeterNo: oldMeterNo.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      window.dispatchEvent(new Event("notif-refresh"))
      onSave(data.replacementId)
    } catch (err: any) {
      alert(err.message || "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-xl mx-auto pb-28">
      <CardHeader className="flex flex-row items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CardTitle>Propose Meter Replacement</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Entry mode switcher */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setEntryMode("single")}
            className={`py-2 rounded-xl text-xs font-semibold border transition ${
              entryMode === "single"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Single Proposal Entry
          </button>
          <button
            type="button"
            onClick={() => setEntryMode("excel")}
            className={`py-2 rounded-xl text-xs font-semibold border transition ${
              entryMode === "excel"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Excel Bulk Upload
          </button>
        </div>

        {entryMode === "excel" ? (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 border rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Bulk Upload Proposals</h3>
                  <p className="text-xs text-gray-500">
                    Upload an Excel (.xlsx / .csv) file containing replacement proposal rows.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadProposalTemplate}
                  className="shrink-0 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                  title="Download sample template"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Template
                </Button>
              </div>

              <input
                ref={excelFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleExcelProposalUpload(e.target.files[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-dashed border-2 hover:bg-slate-100"
                onClick={() => excelFileRef.current?.click()}
                disabled={looking || submitting}
              >
                {looking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Select Proposal Excel / CSV File
              </Button>
            </div>

            {parsedExcelItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">
                    Parsed Proposals ({parsedExcelItems.filter(i => i.isValid).length} Valid / {parsedExcelItems.length} Total)
                  </span>
                  <span className="text-gray-400">Preview:</span>
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-xl divide-y bg-white text-xs">
                  {parsedExcelItems.map((item, idx) => (
                    <div key={idx} className={`p-2.5 flex items-start justify-between gap-2 ${!item.isValid ? "bg-red-50" : ""}`}>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          <span className="font-mono text-gray-500">{item.consumerId}</span>
                          <span className="truncate">{item.consumerName || "(No Name)"}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{item.address || "(No Address)"}</p>
                        <div className="flex gap-2 text-[10px] text-gray-400 font-mono">
                          {item.mobile && <span>Mob: {item.mobile}</span>}
                          {item.agency && <span>Agency: {item.agency}</span>}
                          {item.oldMeterNo && <span>Old Meter: {item.oldMeterNo}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {PURPOSE_LABELS[item.purpose] || item.purpose}
                        </Badge>
                        {!item.isValid && <span className="text-[10px] font-bold text-red-600">Missing Name/Address</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-[2] bg-slate-950 hover:bg-slate-900 text-white"
                    onClick={handleBulkSubmit}
                    disabled={submitting || parsedExcelItems.filter(i => i.isValid).length === 0}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    {submitting ? "Submitting..." : `Submit ${parsedExcelItems.filter(i => i.isValid).length} Proposals`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Lookup section */}
            <div className="space-y-2 p-3 bg-slate-50 border rounded-xl mb-4">
              <Label htmlFor="search-cid">Lookup Consumer ID</Label>
              <div className="flex gap-2">
                <Input
                  id="search-cid"
                  value={consumerId}
                  onChange={e => setConsumerId(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="e.g. 661200001"
                  maxLength={9}
                  disabled={looking || submitting}
                />
                <Button type="button" onClick={handleLookup} disabled={looking || consumerId.length !== 9 || submitting}>
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {looking && <p className="text-xs text-blue-600 font-medium">{lookupStatus}</p>}
              {notFound && <p className="text-xs text-amber-600 font-semibold">Consumer not found in active list or master database. Please fill details manually.</p>}
              {found && <p className="text-xs text-green-700 font-bold flex items-center gap-1">✓ Match Found: {found.name}</p>}
            </div>

            {/* Form details */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="c-name">Consumer Name *</Label>
                <Input id="c-name" value={manualName} onChange={e => setManualName(e.target.value)} disabled={submitting} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-addr">Address *</Label>
                <Textarea id="c-addr" value={manualAddress} onChange={e => setManualAddress(e.target.value)} disabled={submitting} required />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="c-oldmeter">Old Meter Number (optional)</Label>
                  <Input id="c-oldmeter" value={oldMeterNo} onChange={e => setOldMeterNo(e.target.value.toUpperCase())} placeholder="e.g. OLD1234" disabled={submitting} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="c-mobile">Mobile Number (optional)</Label>
                  <Input id="c-mobile" value={manualMobile} onChange={e => setManualMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} disabled={submitting} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="c-agency">Assign Agency (optional)</Label>
                  <Select value={agency || "none"} onValueChange={val => setAgency(val === "none" ? "" : val)} disabled={submitting}>
                    <SelectTrigger id="c-agency">
                      <SelectValue placeholder="Select Agency (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None / Unassigned</SelectItem>
                      {agencyList.map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-purpose">Replacement Purpose *</Label>
                <Select value={purpose} onValueChange={setPurpose} disabled={submitting}>
                  <SelectTrigger id="c-purpose">
                    <SelectValue placeholder="Select Purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PURPOSE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-attachment">Attachment / Document (optional)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="c-attachment"
                    type="file"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFileUpload(f)
                    }}
                    disabled={uploading || submitting}
                    className="cursor-pointer"
                  />
                  {uploading && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
                </div>
                {attachmentUrl && (
                  <p className="text-xs text-green-700 font-bold flex items-center gap-1 mt-1">
                    ✓ Uploaded: <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline">{uploadedFileName || "File"}</a>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-remarks">Remarks (optional)</Label>
                <Textarea id="c-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. Broken display / burnt terminals" disabled={submitting} />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-[2] bg-slate-950 hover:bg-slate-900 text-white" disabled={submitting || uploading}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  {submitting ? "Submitting..." : "Save Proposal"}
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}

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
  MapPin, Phone, Building2, User, Upload, FileText, Monitor, FileSpreadsheet, AlertCircle,
  IndianRupee, AlertTriangle, ShieldCheck, Filter, ChevronDown
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  const canRead = userRole === "admin" || userRole === "executive" || userRole === "superuser" || (permissions && (permissions.meter_replacement?.includes("read") || permissions["meter-replacement"]?.includes("read")))

  const [records, setRecords] = useState<MeterReplacement[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")
  const [agencyFilter, setAgencyFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useHashState<"list" | "create">("meter-replacement", "list")

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md">
          You do not have permission to view or manage the Meter Replacement List. Please contact your administrator if you need access.
        </p>
      </div>
    )
  }

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
      const updated = prev.map(r => (r.replacementId === selectedForReturn.replacementId || r.issueId === targetId) ? { ...r, status: "proposed" as const, serialNo: "", issueId: "" } : r)
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
      const updated = prev.map(r => r.replacementId === targetId ? { ...r, status: "closed" as const, remarks } : r)
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

  // Bulk operation dialogs
  const [bulkCloseDialogOpen, setBulkCloseDialogOpen] = useState(false)
  const [bulkCloseRemarks, setBulkCloseRemarks] = useState("")
  const [bulkClosing, setBulkClosing] = useState(false)

  const [bulkPurposeDialogOpen, setBulkPurposeDialogOpen] = useState(false)
  const [bulkNewPurpose, setBulkNewPurpose] = useState<string>("faulty_replacement")
  const [bulkUpdatingPurpose, setBulkUpdatingPurpose] = useState(false)

  const [bulkCompleteDialogOpen, setBulkCompleteDialogOpen] = useState(false)
  const [bulkCompleting, setBulkCompleting] = useState(false)
  const bulkExcelFileInputRef = useRef<HTMLInputElement>(null)

  const toggleBulkSelect = (r: MeterReplacement) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (next.has(r.replacementId)) {
        next.delete(r.replacementId)
      } else {
        // Enforce same agency rule only for Work Order / WO Finalize actions on 'updated' tab
        if (tab === "updated") {
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
        }
        next.add(r.replacementId)
      }
      return next
    })
  }

  const handleSelectAllVisible = () => {
    const selectable = paginated.filter(r => r.status !== "closed")
    const allSelected = selectable.length > 0 && selectable.every(r => selectedForBulk.has(r.replacementId))
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (allSelected) {
        selectable.forEach(r => next.delete(r.replacementId))
      } else {
        selectable.forEach(r => next.add(r.replacementId))
      }
      return next
    })
  }

  const handleBulkClose = async () => {
    if (selectedForBulk.size === 0 || !bulkCloseRemarks.trim()) {
      toast({ title: "Please enter remarks for closing", variant: "destructive" })
      return
    }
    const ids = Array.from(selectedForBulk)
    const remarks = bulkCloseRemarks.trim()
    setBulkClosing(true)

    // Optimistic UI update
    setRecords(prev => {
      const idSet = new Set(ids)
      const updated = prev.map(r => idSet.has(r.replacementId) ? { ...r, status: "closed" as const, remarks } : r)
      saveToCache(CACHE_KEY, updated)
      return updated
    })
    setBulkCloseDialogOpen(false)
    setBulkCloseRemarks("")

    try {
      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_close",
          replacementIds: ids,
          remarks
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to close proposals in bulk")
      toast({ title: `Successfully closed ${data.closedCount || ids.length} proposals` })
      setSelectedForBulk(new Set())
      load(true, true)
    } catch (e: any) {
      toast({ title: e.message || "Failed to close proposals", variant: "destructive" })
      load(true, true)
    } finally {
      setBulkClosing(false)
    }
  }

  const handleBulkPurposeChange = async () => {
    if (selectedForBulk.size === 0) return
    const ids = Array.from(selectedForBulk)
    setBulkUpdatingPurpose(true)

    // Optimistic UI update
    setRecords(prev => {
      const idSet = new Set(ids)
      const updated = prev.map(r => idSet.has(r.replacementId) ? { ...r, purpose: bulkNewPurpose as any } : r)
      saveToCache(CACHE_KEY, updated)
      return updated
    })
    setBulkPurposeDialogOpen(false)

    try {
      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_purpose",
          replacementIds: ids,
          purpose: bulkNewPurpose
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update purpose")
      toast({ title: `Updated purpose for ${data.updatedCount || ids.length} proposals` })
      setSelectedForBulk(new Set())
      load(true, true)
    } catch (e: any) {
      toast({ title: e.message || "Failed to update purpose", variant: "destructive" })
      load(true, true)
    } finally {
      setBulkUpdatingPurpose(false)
    }
  }

  const downloadCompletionExcelTemplate = async () => {
    const XLSX = await import("xlsx")
    // Use selected cards if any, else currently filtered items that are proposed or issued
    const targetItems = selectedForBulk.size > 0
      ? Array.from(selectedForBulk).map(id => records.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
      : filtered.filter(r => r.status === "proposed" || r.status === "issued" || r.status === "updated")

    if (targetItems.length === 0) {
      toast({ title: "No proposals to export", description: "Select records or filter proposed/issued/installed cards.", variant: "destructive" })
      return
    }

    const rows = targetItems.map(r => ({
      "Replacement ID": r.replacementId,
      "Consumer ID": r.consumerId,
      "Consumer Name": r.consumerName,
      "Address": r.address,
      "Agency": r.agency,
      "Purpose": r.purpose,
      "New Meter Serial*": r.serialNo || "",
      "Installation Date (DD.MM.YYYY)": new Date().toLocaleDateString("en-GB").replace(/\//g, "."),
      "Last Reading": "",
      "New Reading": "0",
      "Work Order No": r.workOrderNo || "",
      "Note Sheet No": r.noteSheetNo || "",
      "Remarks": r.remarks || "Installed"
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Bulk Completion")
    XLSX.writeFile(wb, `Meter_Completion_Template_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleBulkExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkCompleting(true)
    try {
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)

      if (!rows || rows.length === 0) {
        toast({ title: "Excel file is empty", variant: "destructive" })
        return
      }

      const payloadRows = rows.map((r: any) => ({
        replacementId: String(r["Replacement ID"] || r["replacement_id"] || r["ReplacementId"] || "").trim(),
        consumerId: String(r["Consumer ID"] || r["consumer_id"] || r["ConsumerId"] || "").trim(),
        serialNo: String(r["New Meter Serial*"] || r["New Meter Serial"] || r["Serial No"] || r["serial_no"] || "").trim(),
        installationDate: String(r["Installation Date (DD.MM.YYYY)"] || r["Installation Date"] || r["installation_date"] || "").trim(),
        lastReading: String(r["Last Reading"] ?? "").trim(),
        newReading: String(r["New Reading"] ?? "").trim(),
        workOrderNo: String(r["Work Order No"] || r["work_order_no"] || "").trim(),
        noteSheetNo: String(r["Note Sheet No"] || r["note_sheet_no"] || "").trim(),
        remarks: String(r["Remarks"] || r["remarks"] || "").trim(),
      })).filter(r => r.replacementId || r.consumerId)

      if (payloadRows.length === 0) {
        toast({ title: "No valid rows found", description: "Each row must have Replacement ID or Consumer ID.", variant: "destructive" })
        return
      }

      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_complete",
          rows: payloadRows
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to process bulk completion")

      const failCount = data.failed?.length || 0
      if (failCount > 0) {
        toast({
          title: `Completed ${data.succeeded} meter(s)`,
          description: `${failCount} failed: ${data.failed.slice(0, 2).map((f: any) => `${f.identifier}: ${f.reason}`).join(", ")}`,
          variant: "destructive"
        })
      } else {
        toast({
          title: "Bulk Completion Successful",
          description: `Successfully completed all ${data.succeeded} meter installation(s)!`
        })
      }
      setBulkCompleteDialogOpen(false)
      setSelectedForBulk(new Set())
      load(true, true)
    } catch (err: any) {
      toast({ title: err.message || "Failed to process file", variant: "destructive" })
    } finally {
      setBulkCompleting(false)
      if (bulkExcelFileInputRef.current) bulkExcelFileInputRef.current.value = ""
    }
  }

  const { checkVersion } = useModuleVersionSync<MeterReplacement>(
    "meter-replacement",
    CACHE_KEY,
    "replacementId",
    "/api/meters/replacement?bypassCache=true",
    (updated) => {
      setRecords([...updated].reverse())
      setSyncState("idle")
    }
  )

  const load = async (silent = false, force = false) => {
    if (!silent && records.length === 0) setSyncState("loading")
    try {
      if (force) {
        const res = await fetch("/api/system/reset-base?moduleKey=meter-replacement", { method: "POST" }).catch(() => null)
        if (res && res.status === 429) {
          const json = await res.json().catch(() => ({}))
          toast({
            title: "CDN Refresh Locked",
            description: json.error || "Manual cache refresh is locked for 1 hour. Admin can refresh only once per hour.",
            variant: "destructive"
          })
        }
      }
      // 1. Instant render from local IndexedDB cache for 0ms initial display
      const cached = await getFromCache<MeterReplacement[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        const sorted = [...cached].reverse()
        setRecords(sorted)
        if (!silent) setSyncState("idle")
      }

      await checkVersion(force)
    } catch {
      setSyncState("idle")
      if (!silent && records.length === 0) toast({ title: "Failed to load replacement list", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  const availableAgencies = useMemo(() => {
    const set = new Set<string>()
    if (Array.isArray(agencies)) {
      agencies.forEach(a => { if (a && a.trim()) set.add(a.trim()) })
    }
    records.forEach(r => {
      if (r.agency && r.agency.trim()) set.add(r.agency.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [agencies, records])

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

    if (agencyFilter && agencyFilter !== "all") {
      const targetAgency = agencyFilter.trim().toUpperCase()
      data = data.filter(r => (r.agency || "").trim().toUpperCase() === targetAgency)
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
  }, [records, tab, search, agencyFilter, isAdmin, userAgencies])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search, agencyFilter])

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
        existingRecords={records}
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

          {/* Agency Filter Button (Icon only) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant={agencyFilter !== "all" ? "default" : "outline"}
                className={`shrink-0 rounded-xl h-9 w-9 p-0 relative transition-all ${
                  agencyFilter !== "all"
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                    : "text-gray-600 hover:bg-gray-100 border-gray-200"
                }`}
                title={agencyFilter !== "all" ? `Filtered by Agency: ${agencyFilter}` : "Filter by Agency"}
              >
                <Filter className="h-4 w-4" />
                {agencyFilter !== "all" && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 border border-white"></span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 shadow-lg border-slate-200 bg-white z-50">
              <DropdownMenuLabel className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">
                Filter by Agency
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setAgencyFilter("all")}
                className={`text-xs cursor-pointer rounded-lg flex items-center justify-between px-2.5 py-1.5 font-medium ${
                  agencyFilter === "all" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>All Agencies</span>
                {agencyFilter === "all" && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              {availableAgencies.length === 0 ? (
                <div className="text-[11px] text-gray-400 px-2 py-1.5 text-center">No agencies found</div>
              ) : (
                availableAgencies.map((ag) => (
                  <DropdownMenuItem
                    key={ag}
                    onClick={() => setAgencyFilter(ag)}
                    className={`text-xs cursor-pointer rounded-lg flex items-center justify-between px-2.5 py-1.5 font-medium ${
                      agencyFilter.toUpperCase() === ag.toUpperCase()
                        ? "bg-blue-50 text-blue-700 font-bold"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">{ag}</span>
                    {agencyFilter.toUpperCase() === ag.toUpperCase() && (
                      <Check className="h-3.5 w-3.5 text-blue-600 shrink-0 ml-2" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
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

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectAllVisible}
              className="text-xs h-7 px-2 border-dashed border-slate-300 text-slate-700 hover:bg-slate-50"
              title="Select / Unselect all visible cards"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {paginated.filter(r => r.status !== "closed").length > 0 && paginated.filter(r => r.status !== "closed").every(r => selectedForBulk.has(r.replacementId)) ? "Deselect Page" : "Select Page"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkCompleteDialogOpen(true)}
              className="text-xs h-7 px-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              title="Bulk Complete via Excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              Bulk Excel
            </Button>
          </div>
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
                  {r.status !== "closed" && (
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
      {selectedForBulk.size > 0 && (() => {
        const selectedReps = Array.from(selectedForBulk).map(id => records.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
        const firstAgency = selectedReps[0]?.agency || "Selected"
        const hasMultipleAgencies = selectedReps.some(r => (r.agency || "").trim().toUpperCase() !== (firstAgency || "").trim().toUpperCase())
        const agencyLabel = hasMultipleAgencies ? "Multiple Agencies" : firstAgency

        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-slate-700 flex-wrap justify-center max-w-[95vw]">
            <span className="text-xs font-bold text-blue-400 pl-1 shrink-0">
              {selectedForBulk.size} selected ({agencyLabel})
            </span>

            {/* Bulk Close / Cancel (Available for all tabs if admin or permitted) */}
            {(isAdmin || !!(permissions && (permissions.meter_replacement?.includes("delete") || permissions.meter_replacement?.includes("write")))) && (
              <Button size="sm" variant="destructive" className="h-8 text-xs font-semibold px-2.5 bg-red-600 hover:bg-red-700"
                onClick={() => { setBulkCloseRemarks(""); setBulkCloseDialogOpen(true) }}>
                <X className="h-3.5 w-3.5 mr-1" /> Bulk Close ({selectedForBulk.size})
              </Button>
            )}

            {/* Bulk Purpose Update (Change between faulty, burnt, slow_fast) */}
            {(isAdmin || !!(permissions && (permissions.meter_replacement?.includes("write") || permissions.meter_replacement?.includes("update")))) && (
              <Button size="sm" className="h-8 text-xs font-semibold px-2.5 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => { setBulkNewPurpose("faulty_replacement"); setBulkPurposeDialogOpen(true) }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Change Purpose ({selectedForBulk.size})
              </Button>
            )}

            {/* Bulk Complete via Excel */}
            <Button size="sm" className="h-8 text-xs font-semibold px-2.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setBulkCompleteDialogOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Complete via Excel ({selectedForBulk.size})
            </Button>

            {tab === "updated" && !hasMultipleAgencies && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold h-8 px-2.5"
                onClick={async () => {
                  const wo = prompt(`Enter Work Order Number for ${selectedForBulk.size} selected records of ${firstAgency}:`)
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
                Add WO ({selectedForBulk.size})
              </Button>
            )}

            {tab === "completed" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8 px-2.5"
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
                Bulk Return ({selectedForBulk.size})
              </Button>
            )}

            <Button size="sm" variant="ghost" onClick={() => setSelectedForBulk(new Set())} className="text-xs text-gray-300 hover:text-white h-8 px-2">
              Clear
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

      {/* Bulk Close Proposal Modal */}
      <Dialog open={bulkCloseDialogOpen} onOpenChange={open => !open && setBulkCloseDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 font-bold flex items-center gap-1.5">
              <X className="h-5 w-5" /> Bulk Close / Cancel Proposals
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2">
            <div className="bg-red-50 p-3 rounded-lg text-xs space-y-1 border border-red-200">
              <p className="font-bold text-red-800">
                You are about to close {selectedForBulk.size} selected replacement proposals.
              </p>
              <p className="text-red-700">
                Any meters currently issued for these proposals will automatically be released back to <span className="font-bold">Available Stock</span>.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">Cancellation Reason / Remarks *</Label>
              <Textarea
                value={bulkCloseRemarks}
                onChange={e => setBulkCloseRemarks(e.target.value)}
                placeholder="Reason for closing these proposals in bulk (e.g., Bulk cancelled by office, Tested OK)..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setBulkCloseDialogOpen(false)} disabled={bulkClosing}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleBulkClose} disabled={bulkClosing || !bulkCloseRemarks.trim()}>
              {bulkClosing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Bulk Close ({selectedForBulk.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Change Purpose Modal */}
      <Dialog open={bulkPurposeDialogOpen} onOpenChange={open => !open && setBulkPurposeDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 font-bold flex items-center gap-1.5">
              <RefreshCw className="h-5 w-5" /> Change Purpose in Bulk
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2">
            <div className="bg-amber-50 p-3 rounded-lg text-xs space-y-1 border border-amber-200">
              <p className="font-semibold text-amber-900">
                Updating purpose for {selectedForBulk.size} selected proposals.
              </p>
              <p className="text-amber-700">
                If meters are already issued, their linked issue purpose will also be synced automatically.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">Select New Replacement Purpose</Label>
              <Select value={bulkNewPurpose} onValueChange={setBulkNewPurpose}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faulty_replacement">Faulty Replacement (DEF)</SelectItem>
                  <SelectItem value="burnt_replacement">Burnt Replacement (BURNT)</SelectItem>
                  <SelectItem value="slow_fast">Check Meter / Slow-Fast (CHECK)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setBulkPurposeDialogOpen(false)} disabled={bulkUpdatingPurpose}>
              Cancel
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={handleBulkPurposeChange} disabled={bulkUpdatingPurpose}>
              {bulkUpdatingPurpose ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Purpose Change ({selectedForBulk.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Complete via Excel Modal */}
      <Dialog open={bulkCompleteDialogOpen} onOpenChange={open => !open && setBulkCompleteDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-700 font-bold flex items-center gap-1.5">
              <FileSpreadsheet className="h-5 w-5" /> Bulk Installation Completion via Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2 text-xs">
            <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 space-y-2">
              <p className="font-bold text-blue-900 text-sm">Step 1: Download Pre-filled Template</p>
              <p className="text-blue-800">
                Download an Excel sheet containing your {selectedForBulk.size > 0 ? `${selectedForBulk.size} selected` : "filtered"} proposals.
                Consumer ID, Name, Address, and Agency are non-editable reference columns.
              </p>
              <Button size="sm" variant="outline" className="bg-white hover:bg-blue-100 text-blue-700 font-semibold border-blue-300"
                onClick={downloadCompletionExcelTemplate}>
                <Download className="h-4 w-4 mr-1.5" /> Download Completion Template (.xlsx)
              </Button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900 text-sm">Step 2: Upload Filled File</p>
              <p className="text-slate-600">
                Fill in <span className="font-semibold text-slate-800">New Meter Serial</span>, <span className="font-semibold text-slate-800">Installation Date</span>, <span className="font-semibold text-slate-800">Last/New Readings</span>, and optional <span className="font-semibold text-slate-800">Work Order No</span>.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <input
                  ref={bulkExcelFileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleBulkExcelUpload}
                  disabled={bulkCompleting}
                  className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                />
              </div>
              {bulkCompleting && (
                <div className="flex items-center gap-2 text-blue-700 font-semibold pt-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing installations in Google Sheets...</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulkCompleteDialogOpen(false)} disabled={bulkCompleting}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface FormProps {
  agencies: string[]
  oldMeterMap?: Record<string, string>
  existingRecords?: MeterReplacement[]
  downloadProposalTemplate: () => void
  onSave: (requestId: string) => void
  onCancel: () => void
}

function isReplacementIncomplete(r: MeterReplacement) {
  if (r.status === "closed") return false
  if (r.status === "replaced" && r.noteSheetNo && r.noteSheetNo.trim()) return false
  return true
}

function MeterReplacementCreateForm({ agencies, oldMeterMap = {}, existingRecords = [], downloadProposalTemplate, onSave, onCancel }: FormProps) {
  const { toast } = useToast()
  const [entryMode, setEntryMode] = useState<"single" | "excel">("single")
  const [consumerId, setConsumerId] = useState("")
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [agencyList, setAgencyList] = useState<string[]>(agencies)
  const [lookupStatus, setLookupStatus] = useState("")

  // Duplicate proposal detection for active/incomplete records
  const activeExisting = useMemo(() => {
    const cid = consumerId.trim()
    if (!cid || cid === "000000000" || cid.length !== 9) return null
    return existingRecords.find(r => r.consumerId === cid && isReplacementIncomplete(r)) || null
  }, [consumerId, existingRecords])

  // Live OSD & Connection Status verification
  const [checkingLiveStatus, setCheckingLiveStatus] = useState(false)
  const [liveOsdResult, setLiveOsdResult] = useState<{
    connectionStatus: string
    isLive: boolean
    isDeemed: boolean
    isDisconnected: boolean
    totalDues: number
    osd: number
    lpsc: number
    docType: string
    office?: string
    connDate?: string
    name?: string
    address?: string
  } | null>(null)
  const [liveOsdError, setLiveOsdError] = useState<string | null>(null)

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

  const checkLiveStatus = async (id: string): Promise<{
    connectionStatus: string
    isLive: boolean
    isDeemed: boolean
    isDisconnected: boolean
    totalDues: number
    osd: number
    lpsc: number
    docType: string
    office?: string
    connDate?: string
    name?: string
    address?: string
  } | null> => {
    const clean = id.trim()
    if (!clean || clean.length !== 9) return null
    setCheckingLiveStatus(true)
    setLiveOsdError(null)

    try {
      const res = await fetch(`/api/osd-details?consumerId=${encodeURIComponent(clean)}`)
      const json = await res.json()

      if (json.success && json.data) {
        const d = json.data
        const statusUpper = String(d.connectionStatus || "").toUpperCase()
        const isDeemed = d.isDeemed ?? statusUpper.includes("DEEMED")
        const isDisconnected = d.isDisconnected ?? (!isDeemed && statusUpper.includes("DISCONNECT"))
        const isLive = d.isLive ?? (!isDeemed && !isDisconnected && (statusUpper.includes("LIVE") || /\bCONNECTED\b/.test(statusUpper)))

        const parsedResult = {
          connectionStatus: d.connectionStatus || "UNKNOWN",
          isLive,
          isDeemed,
          isDisconnected,
          totalDues: d.totalDues ?? d.osd ?? 0,
          osd: d.osd ?? 0,
          lpsc: d.lpsc ?? 0,
          docType: d.docType || "OUTSTANDING REPORT",
          office: d.office,
          connDate: d.connDate,
          name: d.name,
          address: d.address,
        }

        setLiveOsdResult(parsedResult)

        // Autofill official portal details if manual fields are empty
        if (d.name && d.name !== "N/A" && !manualName) {
          setManualName(d.name)
        }
        if (d.address && d.address !== "N/A" && !manualAddress) {
          setManualAddress(d.address)
        }

        return parsedResult
      } else {
        const errMsg = json.error || "Unable to fetch live status from WBSEDCL portal"
        setLiveOsdError(errMsg)
        return null
      }
    } catch (e: any) {
      const errMsg = e.message || "Failed to contact WBSEDCL live portal"
      setLiveOsdError(errMsg)
      return null
    } finally {
      setCheckingLiveStatus(false)
    }
  }

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

        let isDeemedCached = false
        // Lookup from cache if consumer ID exists and missing info
        if (cid && cid.length === 9) {
          const matchConsumer = consumersCache.find(c => c.consumerId === cid)
          const matchMaster = masterCache.find(c => c.consumerId === cid)

          if (!cName) cName = matchConsumer?.name || matchMaster?.name || ""
          if (!cAddr) cAddr = matchConsumer?.address || matchMaster?.address || ""
          if (!cMob) cMob = matchConsumer?.mobileNumber || matchMaster?.mobile || ""
          if (!cAgency) cAgency = matchConsumer?.agency || ""
          if (!cOldMeter) cOldMeter = matchConsumer?.device || matchMaster?.meterNo || ""

          isDeemedCached = ((matchConsumer as any)?.status || "").toLowerCase().includes("deemed") ||
                           String((matchMaster as any)?.status || "").toLowerCase().includes("deemed")
        }

        const rawPurpose = String(r["Purpose"] || r["purpose"] || "").trim()
        const purposeVal = normalizePurpose(rawPurpose)
        const remarksVal = String(r["Remarks"] || r["remarks"] || "").trim()

        const activeDuplicate = (cid && cid !== "000000000")
          ? existingRecords.find(r => r.consumerId === cid && isReplacementIncomplete(r))
          : null
        const isDuplicate = !!activeDuplicate
        const isValid = !!(cName && cAddr) && !isDeemedCached && !isDuplicate
        const invalidReason = isDeemedCached
          ? "Deemed Disconnected"
          : isDuplicate
          ? `Active proposal exists (${activeDuplicate?.replacementId} - ${activeDuplicate?.status})`
          : !(cName && cAddr)
          ? "Missing Name/Address"
          : undefined

        return {
          consumerId: cid || "000000000",
          consumerName: cName,
          address: cAddr,
          mobile: cMob,
          agency: cAgency,
          purpose: purposeVal,
          oldMeterNo: cOldMeter,
          remarks: remarksVal,
          isDeemed: isDeemedCached,
          isDuplicate,
          isValid,
          invalidReason
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
    const validItems = parsedExcelItems.filter(i => i.isValid && !i.isDeemed && !i.isDuplicate)
    if (validItems.length === 0) {
      alert("No valid proposal items to submit. Ensure required details are present, connection is not deemed, and there are no active duplicate proposals.")
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

    const activeProposal = existingRecords.find(r => r.consumerId === id && isReplacementIncomplete(r))
    if (activeProposal) {
      toast({
        title: "Active Proposal Exists",
        description: `Consumer ${id} already has an active meter replacement in progress (${activeProposal.replacementId}, Status: ${activeProposal.status.toUpperCase()}). Duplicate entries are not allowed.`,
        variant: "destructive"
      })
    }

    setLooking(true)
    setFound(null)
    setNotFound(false)
    setLookupStatus("Searching disconnection list & checking live portal...")

    // Concurrently trigger Live OSD check
    const livePromise = checkLiveStatus(id)

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
        await livePromise
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
        const liveRes = await livePromise
        if (liveRes && liveRes.name && liveRes.name !== "N/A") {
          setFound({
            consumerId: id,
            name: liveRes.name,
            address: liveRes.address,
            mobileNumber: "",
            agency: "",
          })
          setManualName(liveRes.name)
          setManualAddress(liveRes.address || "")
          setNotFound(false)
        } else {
          setNotFound(true)
          setManualName("")
          setManualAddress("")
          setManualMobile("")
          setAgency("")
          setOldMeterNo("")
        }
      }
      await livePromise
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

    const cid = consumerId.trim()
    // Strict block if active duplicate exists
    if (activeExisting) {
      alert(`Cannot propose replacement: Consumer ${cid} already has an active meter replacement in progress (${activeExisting.replacementId}, Status: ${activeExisting.status.toUpperCase()}). Duplicate entries are not allowed until completed or closed.`)
      return
    }

    // Strict block if deemed
    if (liveOsdResult?.isDeemed) {
      alert(`Cannot propose replacement: Consumer connection is Deemed Disconnected (${liveOsdResult.connectionStatus}) on WBSEDCL portal.`)
      return
    }

    setSubmitting(true)
    try {
      if (cid.length === 9 && !liveOsdResult && !liveOsdError) {
        const check = await checkLiveStatus(cid)
        if (check?.isDeemed) {
          alert(`Cannot propose replacement: Consumer connection is Deemed Disconnected (${check.connectionStatus}) on WBSEDCL portal.`)
          setSubmitting(false)
          return
        }
      }

      const res = await fetch("/api/meters/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId: cid || "000000000",
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
                        {!item.isValid && <span className="text-[10px] font-bold text-red-600">{item.invalidReason || "Missing Name/Address"}</span>}
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
                  onChange={e => {
                    const clean = e.target.value.replace(/\D/g, "").slice(0, 9)
                    setConsumerId(clean)
                    if (clean !== consumerId) {
                      setLiveOsdResult(null)
                      setLiveOsdError(null)
                    }
                  }}
                  placeholder="e.g. 661200001"
                  maxLength={9}
                  disabled={looking || checkingLiveStatus || submitting}
                />
                <Button
                  type="button"
                  onClick={handleLookup}
                  disabled={looking || checkingLiveStatus || consumerId.length !== 9 || submitting}
                  title="Lookup from database and verify live OSD"
                >
                  {looking || checkingLiveStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {looking && <p className="text-xs text-blue-600 font-medium">{lookupStatus}</p>}
              {notFound && <p className="text-xs text-amber-600 font-semibold">Consumer not found in active list or master database. Please fill details manually.</p>}
              {found && <p className="text-xs text-green-700 font-bold flex items-center gap-1">✓ Match Found: {found.name}</p>}
            </div>

            {/* Active Duplicate Proposal Alert */}
            {activeExisting && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl mb-4 flex items-start gap-2.5 text-xs animate-in fade-in duration-200">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-rose-900 block">Duplicate Proposal Blocked</span>
                  <span>
                    Consumer <span className="font-mono font-bold">{consumerId}</span> already has an active replacement in progress (ID: <span className="font-mono font-bold">{activeExisting.replacementId}</span>, Status: <Badge className="bg-rose-100 text-rose-800 border-rose-200 uppercase text-[10px] py-0 px-1 font-bold">{activeExisting.status}</Badge>).
                  </span>
                  <p className="text-[11px] text-rose-700">
                    You cannot propose this consumer again until their previous replacement proposal is completed with a Note Sheet or closed.
                  </p>
                </div>
              </div>
            )}

            {/* Live Status and OSD Panel */}
            {checkingLiveStatus && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl mb-4 flex items-center gap-2 text-xs text-blue-800">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                <span className="font-medium">Connecting to WBSEDCL portal & parsing live OSD report...</span>
              </div>
            )}

            {liveOsdResult && (
              <div className={`p-3.5 rounded-xl border mb-4 space-y-2.5 transition-all ${
                liveOsdResult.isDeemed
                  ? "bg-red-50 border-red-200 text-red-950"
                  : liveOsdResult.isLive
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                  : "bg-amber-50/80 border-amber-200 text-amber-950"
              }`}>
                <div className="flex items-center justify-between gap-2 border-b pb-2 border-current/10">
                  <div className="flex items-center gap-2">
                    {liveOsdResult.isDeemed ? (
                      <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                    ) : liveOsdResult.isLive ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                        Live Connection Status
                      </span>
                      <span className="text-sm font-extrabold flex items-center gap-1.5">
                        {liveOsdResult.connectionStatus}
                        {liveOsdResult.isLive && <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">LIVE</Badge>}
                        {liveOsdResult.isDeemed && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">DEEMED BLOCKED</Badge>}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => checkLiveStatus(consumerId)}
                    disabled={checkingLiveStatus}
                    className="h-7 px-2 text-[11px] bg-white hover:bg-slate-50 border-current/20 shrink-0"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${checkingLiveStatus ? "animate-spin" : ""}`} /> Re-check
                  </Button>
                </div>

                {/* Deemed block banner */}
                {liveOsdResult.isDeemed && (
                  <div className="p-2.5 bg-red-100/80 border border-red-300 rounded-lg text-xs font-semibold text-red-800 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                    <div>
                      <p className="font-bold">Proposal Blocked: Deemed Disconnected</p>
                      <p className="text-[11px] font-normal text-red-700 mt-0.5">
                        This consumer connection is marked as Deemed Disconnected on the WBSEDCL portal. Under operating regulations, deemed disconnected consumers cannot be proposed for meter replacement.
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Financial / Portal Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-0.5">
                  <div className="bg-white/80 p-2 rounded-lg border border-current/10">
                    <span className="text-[10px] opacity-75 uppercase block font-semibold">Live OSD (Dues)</span>
                    <span className="font-bold text-sm flex items-center gap-0.5">
                      <IndianRupee className="h-3 w-3" />
                      {liveOsdResult.totalDues.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-white/80 p-2 rounded-lg border border-current/10">
                    <span className="text-[10px] opacity-75 uppercase block font-semibold">Doc Type</span>
                    <span className="font-semibold text-xs truncate block" title={liveOsdResult.docType}>
                      {liveOsdResult.docType}
                    </span>
                  </div>

                  {liveOsdResult.office && (
                    <div className="col-span-2 sm:col-span-1 bg-white/80 p-2 rounded-lg border border-current/10">
                      <span className="text-[10px] opacity-75 uppercase block font-semibold">Office / CCC</span>
                      <span className="font-semibold text-xs truncate block" title={liveOsdResult.office}>
                        {liveOsdResult.office}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {liveOsdError && !checkingLiveStatus && !liveOsdResult && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-xs text-amber-900 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Live portal check advisory: {liveOsdError}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => checkLiveStatus(consumerId)}
                  className="h-6 px-2 text-[10px] shrink-0 bg-white"
                >
                  Retry
                </Button>
              </div>
            )}

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
                <Button
                  type="submit"
                  className={`flex-[2] text-white transition ${
                    liveOsdResult?.isDeemed || activeExisting
                      ? "bg-red-600 hover:bg-red-700 cursor-not-allowed"
                      : "bg-slate-950 hover:bg-slate-900"
                  }`}
                  disabled={submitting || uploading || checkingLiveStatus || liveOsdResult?.isDeemed === true || !!activeExisting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : liveOsdResult?.isDeemed ? (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  ) : activeExisting ? (
                    <AlertTriangle className="h-4 w-4 mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {submitting
                    ? "Submitting..."
                    : liveOsdResult?.isDeemed
                    ? "Blocked (Deemed Disconnected)"
                    : activeExisting
                    ? "Blocked (Duplicate Proposal)"
                    : "Save Proposal"}
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}

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
  MapPin, Phone, Building2, FileSpreadsheet, Monitor, FileText, PackageCheck, Gauge, List
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { MeterStock, MeterIssue, StockSummary, MeterTypeLabel } from "@/lib/meter-types"
import { METER_TYPES } from "@/lib/meter-types"
import { MeterIssueForm } from "@/components/meter-issue-form"
import { MeterCompleteForm } from "@/components/meter-complete-form"
import { CheckMeterDialog } from "@/components/check-meter-dialog"
import { NoteSheetDialog } from "@/components/note-sheet-dialog"
import { ReturnOfficeDialog } from "@/components/return-office-dialog"
import { BulkNscUploadModal } from "@/components/bulk-nsc-upload-modal"
import { printMeterSlip } from "@/components/meter-slip"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache, getCacheAgeMs } from "@/lib/indexed-db"
import type { ConsumerMasterRow } from "@/components/consumer-master"
import type { NSCApplication } from "@/lib/nsc-types"
// xlsx loaded dynamically to reduce initial bundle size
const loadXLSX = () => import("xlsx")

const ADMIN_CACHE_KEY  = "meter_stock_cache"
const AGENCY_CACHE_KEY = "meter_issues_cache"

type Tab = "nsc" | "replacement" | "check" | "stock" | "history" | "active" | "reports" | "proposed"
type View = "menu" | "stock" | "nsc" | "replacement" | "check" | "history" | "issue" | "complete" | "addstock"
type SyncState = "idle" | "loading" | "updated"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "DEF",
  burnt_replacement:  "BURNT",
  slow_fast:          "CHECK",
  nsc:                "NSC",
}

const PURPOSE_COLORS: Record<string, string> = {
  nsc:                "text-green-700",
  faulty_replacement: "text-orange-600",
  burnt_replacement:  "text-red-600",
  slow_fast:          "text-amber-600",
}

function getIssueStatusBadge(issue: MeterIssue) {
  if (issue.status === "installed") {
    if (issue.noteSheetNo && issue.noteSheetNo.trim()) {
      return { label: "Completed", className: "bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold" }
    }
    return { label: "WO Done", className: "bg-teal-100 text-teal-800 border border-teal-300 font-semibold" }
  }
  if (issue.status === "issued") return { label: "Issued", className: "bg-yellow-100 text-yellow-800 font-semibold" }
  if (issue.status === "installation_done") return { label: "Installed", className: "bg-blue-100 text-blue-800 border border-blue-300 font-semibold" }
  if (issue.status === "returned") return { label: "Returned", className: "bg-gray-100 text-gray-700 font-semibold" }
  return { label: issue.status, className: "bg-slate-100 text-slate-700 font-semibold" }
}

const STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  installation_done: "Installed",
  installed: "Completed",
  returned: "Returned",
  proposed: "Proposed",
  updated: "Installed",
  replaced: "WO Done",
  completed: "Completed",
  closed: "Closed / Cancelled",
  withheld: "Withheld",
}

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
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
  status: "proposed" | "issued" | "updated" | "replaced" | "closed"
  serialNo: string
  issueId: string
  remarks: string
  attachmentUrl?: string
  oldMeterNo?: string
  workOrderNo?: string
  noteSheetNo?: string
  closedRemarks?: string
  meterType?: string
}

export function MeterList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const isAdmin = userRole === "admin" || userRole === "executive"

  const [summary, setSummary]   = useState<StockSummary[]>([])
  const [stock, setStock]       = useState<MeterStock[]>([])
  const [issues, setIssues]     = useState<MeterIssue[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab]           = useState<Tab>("active")
  const [view, setViewRaw]      = useHashState<View>("meter", "menu")
  const [prevView, setPrevView] = useState<View>("menu")
  const [showReportPanel, setShowReportPanel] = useState(false)
  const setView = (v: View) => {
    if (v === "issue" || v === "complete" || v === "addstock") {
      setPrevView(view as View)
    }
    setShowReportPanel(false)
    setSelectedForSlip(new Set())
    setSelectedForBulkNoteSheet(new Set())
    setSelectedForBulkRep(new Set())
    setViewRaw(v)
  }
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
  const isAgencyRole = userRole === "agency"
  const [repSubTab, setRepSubTab]                     = useState<"pending" | "issued" | "installed" | "wo_done" | "completed" | "closed" | "all">(isAgencyRole ? "issued" : "pending")
  const [nscSubTab, setNscSubTab]                     = useState<"proposed" | "issued" | "installed" | "completed" | "withheld" | "all">(isAgencyRole ? "issued" : "proposed")
  const [nscApplications, setNscApplications]         = useState<NSCApplication[]>([])
  const [bulkNscModalOpen, setBulkNscModalOpen]         = useState(false)
  const [checkSubTab, setCheckSubTab]                 = useState<"proposed" | "issued" | "installed" | "check1_done" | "check2_done" | "finalized" | "all">("installed")
  // NSC quotation lookup — keyed by receiveNo → status
  const [nscStatusMap, setNscStatusMap]               = useState<Record<string, string>>({})
  const [oldMeterMap, setOldMeterMap]                 = useState<Record<string, string>>({})

  // Dialog & selection state variables
  const [checkMeterDialogOpen, setCheckMeterDialogOpen] = useState(false)
  const [selectedForCheckMeter, setSelectedForCheckMeter] = useState<MeterIssue | null>(null)

  const [noteSheetDialogOpen, setNoteSheetDialogOpen] = useState(false)
  const [selectedForNoteSheet, setSelectedForNoteSheet] = useState<MeterIssue | null>(null)

  const [returnOfficeDialogOpen, setReturnOfficeDialogOpen] = useState(false)
  const [selectedForReturnOffice, setSelectedForReturnOffice] = useState<MeterIssue | null>(null)

  const [selectedForBulkNoteSheet, setSelectedForBulkNoteSheet] = useState<Set<string>>(new Set())
  const [bulkNoteSheetDialogOpen, setBulkNoteSheetDialogOpen]   = useState(false)

  // Timeline dropdown & multi-select for replacement cards
  const [expandedTimeline, setExpandedTimeline]   = useState<Set<string>>(new Set())
  const [selectedForBulkRep, setSelectedForBulkRep] = useState<Set<string>>(new Set())

  // Stock utilization drill-down & lookup state
  const [stockDrillFilter, setStockDrillFilter]   = useState<"available" | "nsc" | "replacement" | "check" | null>(null)
  const [meterLookupQuery, setMeterLookupQuery]   = useState("")

  const toggleTimeline = (id: string) => {
    setExpandedTimeline(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleBulkRep = (rep: MeterReplacement) => {
    setSelectedForBulkRep(prev => {
      const next = new Set(prev)
      if (next.has(rep.replacementId)) {
        next.delete(rep.replacementId)
      } else {
        // Validation for Installed stage: ensure all selected items belong to the same agency
        if (repSubTab === "installed" || rep.status === "updated") {
          const selectedItems = Array.from(prev).map(id => replacements.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
          if (selectedItems.length > 0) {
            const firstAgency = (selectedItems[0].agency || "").trim().toUpperCase()
            const currentAgency = (rep.agency || "").trim().toUpperCase()
            if (firstAgency && currentAgency && firstAgency !== currentAgency) {
              toast({
                title: "Same Agency Required for Bulk Work Order",
                description: `Bulk Work Order finalization requires all selected meters to belong to the same agency (${selectedItems[0].agency}).`,
                variant: "destructive"
              })
              return prev
            }
          }
        }
        next.add(rep.replacementId)
      }
      return next
    })
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

  useEffect(() => {
    async function loadNscApps() {
      try {
        const cached = await getFromCache<NSCApplication[]>("nsc_data_cache")
        if (cached && Array.isArray(cached)) setNscApplications(cached)
        const res = await fetch("/api/nsc")
        if (res.ok) {
          const data: NSCApplication[] = await res.json()
          await saveToCache("nsc_data_cache", data)
          setNscApplications(data)
        }
      } catch (e) {
        console.error("Failed to load NSC applications", e)
      }
    }
    if (view === "nsc") loadNscApps()
  }, [view])

  const PAGE = 20

  // ── Load data ──────────────────────────────────────────────────────────────
  // ── Load data ──────────────────────────────────────────────────────────────
  const load = async (silent = false, force = false) => {
    if (!silent) setSyncState("loading")
    try {
      if (isAdmin) {
        // 1. Cache hit & freshness check
        const cached = await getFromCache<{ summary: StockSummary[]; stock: MeterStock[]; issues: MeterIssue[] }>(ADMIN_CACHE_KEY)
        const age = await getCacheAgeMs(ADMIN_CACHE_KEY)
        const isFresh = age !== null && age < 2 * 60 * 1000

        if (cached) {
          setSummary(cached.summary || [])
          setStock(cached.stock || [])
          setIssues(cached.issues || [])
          if (!silent) setSyncState("idle")
          if (isFresh && !force) {
            loadReplacements(force)
            return
          }
        }
        // 2. Fetch fresh
        const res = await fetch(`/api/meters/stock?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const sorted = [...(data.issues || [])].reverse()
        setSummary(data.summary || [])
        setStock(data.stock || [])
        setIssues(sorted)
        await saveToCache(ADMIN_CACHE_KEY, { summary: data.summary || [], stock: data.stock || [], issues: sorted })
      } else {
        // 1. Cache hit & freshness check
        const cached = await getFromCache<MeterIssue[]>(AGENCY_CACHE_KEY)
        const age = await getCacheAgeMs(AGENCY_CACHE_KEY)
        const isFresh = age !== null && age < 2 * 60 * 1000

        if (cached) {
          setIssues(cached)
          if (!silent) setSyncState("idle")
          if (isFresh && !force) {
            loadReplacements(force)
            return
          }
        }
        // 2. Fetch fresh
        const res = await fetch(`/api/meters/issue?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) throw new Error()
        const data: MeterIssue[] = await res.json()
        const sorted = [...data].reverse()
        setIssues(sorted)
        await saveToCache(AGENCY_CACHE_KEY, sorted)
      }
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
      loadReplacements(force)
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

  const loadReplacements = async (force = false) => {
    setLoadingReplacements(true)
    try {
      const cached = await getFromCache<MeterReplacement[]>("meter_replacement_data_cache")
      const age = await getCacheAgeMs("meter_replacement_data_cache")
      const isFresh = age !== null && age < 2 * 60 * 1000

      if (cached && cached.length > 0) {
        setReplacements(cached)
        if (isFresh && !force) {
          setLoadingReplacements(false)
          return
        }
      }
      const res = await fetch(`/api/meters/replacement?t=${Date.now()}`, { cache: "no-store" })
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
    if (view === "replacement" || view === "issue") {
      loadReplacements()
    }
  }, [view])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredIssues = useMemo(() => {
    let data = issues

    if (view === "nsc") {
      if (nscSubTab === "proposed") {
        const eligibleNsc = nscApplications.filter(a => a.status === "quotation_issued" || a.status === "project_done")
        const proposedList = eligibleNsc.map(app => ({
          issueId: app.receiveNo || app.applicationNo,
          issueDate: app.quotationDate || app.appliedDate || "",
          purpose: "nsc" as const,
          consumerId: app.applicationNo || app.receiveNo,
          nscReceiveNo: app.receiveNo,
          consumerName: app.applicantName,
          agency: app.agency || "Unassigned",
          serialNo: app.meterSerialNo || "Pending Meter Issue",
          meterType: app.phase || "Standard",
          status: "proposed" as any,
          address: app.verifyAddress || app.address,
          mobile: app.mobile,
          remarks: app.remarks || "Quotation Issued — Awaiting Meter Issue",
        } as MeterIssue))
        data = proposedList
      } else {
        data = data.filter(i => i.purpose === "nsc")
        if (nscSubTab === "issued")         data = data.filter(i => i.status === "issued")
        else if (nscSubTab === "installed") data = data.filter(i => i.status === "installation_done")
        else if (nscSubTab === "completed") data = data.filter(i => i.status === "installed")
        else if (nscSubTab === "withheld")  data = data.filter(i => i.status === "returned" || i.status === "withheld")
      }
    } else if (view === "check") {
      if (checkSubTab === "proposed") {
        data = replacements
          .filter(r => r.purpose === "slow_fast" && (r.status || "").toLowerCase() === "proposed")
          .map(r => ({
            issueId: r.issueId || r.replacementId,
            issueDate: r.proposedDate || "",
            purpose: "slow_fast",
            consumerId: r.consumerId,
            consumerName: r.consumerName,
            serialNo: r.serialNo || "",
            meterType: "Standard",
            agency: r.agency || "",
            status: "proposed",
            address: r.address,
            mobile: r.mobile,
            oldMeterNo: r.oldMeterNo
          } as MeterIssue))
      } else if (checkSubTab === "issued") {
        const checkFromRep = replacements
          .filter(r => r.purpose === "slow_fast" && (r.status || "").toLowerCase() === "issued")
          .map(r => ({
            issueId: r.issueId || r.replacementId,
            issueDate: r.proposedDate || "",
            purpose: "slow_fast",
            consumerId: r.consumerId,
            consumerName: r.consumerName,
            serialNo: r.serialNo || "",
            meterType: "Standard",
            agency: r.agency || "",
            status: "issued",
            address: r.address,
            mobile: r.mobile,
            oldMeterNo: r.oldMeterNo
          } as MeterIssue))
        const checkFromIssues = issues.filter(i => i.purpose === "slow_fast" && i.status === "issued")
        data = [...checkFromRep, ...checkFromIssues]
      } else {
        data = data.filter(i => i.purpose === "slow_fast")
        if (checkSubTab === "installed")        data = data.filter(i => (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized" && !i.crossCheckDate1)
        else if (checkSubTab === "check1_done") data = data.filter(i => i.crossCheckDate1 && !i.crossCheckDate2 && i.checkMeterStatus !== "finalized")
        else if (checkSubTab === "check2_done") data = data.filter(i => i.crossCheckDate2 && i.checkMeterStatus !== "finalized")
        else if (checkSubTab === "finalized")  data = data.filter(i => i.checkMeterStatus === "finalized")
      }
    } else if (view === "history") {
      data = data.filter(i => i.status === "installed" || i.status === "returned")
      if (purposeFilter !== "all") data = data.filter(i => i.purpose === purposeFilter)
    }

    if (!isAdmin) {
      const upper = (userAgencies || []).map(a => String(a || "").trim().toUpperCase())
      data = data.filter(i => upper.includes((i.agency || "").trim().toUpperCase()))
    }
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
  }, [issues, replacements, view, nscSubTab, checkSubTab, search, purposeFilter, isAdmin, userAgencies])

  const combinedReplacements = useMemo(() => {
    const reps = replacements.filter(r => r.purpose !== "slow_fast")
    const repIssueIds = new Set(reps.map(r => r.issueId).filter(Boolean))

    const directReplacementIssues: MeterReplacement[] = issues
      .filter(i => (i.purpose === "faulty_replacement" || i.purpose === "burnt_replacement") && !repIssueIds.has(i.issueId))
      .map(i => {
        let status: "proposed" | "issued" | "updated" | "replaced" | "closed" = "issued"
        const hasWO = Boolean((i.completionRef || "").trim())
        if (i.status === "installation_done") {
          status = hasWO ? "replaced" : "updated"
        }
        else if (i.status === "installed") status = "replaced"
        else if (i.status === "returned") status = "closed"

        return {
          replacementId: i.issueId,
          consumerId: i.consumerId,
          consumerName: i.consumerName,
          address: i.address || "",
          mobile: i.mobile || "",
          agency: i.agency || "",
          purpose: i.purpose,
          proposedDate: i.issueDate || "",
          status: status,
          serialNo: i.serialNo || "",
          issueId: i.issueId,
          remarks: i.remarks || "",
          attachmentUrl: "",
          oldMeterNo: i.existingMeterNo || "",
          workOrderNo: i.completionRef || "",
          noteSheetNo: i.noteSheetNo || "",
        }
      })

    return [...reps, ...directReplacementIssues]
  }, [replacements, issues])

  const filteredReplacements = useMemo(() => {
    let data = combinedReplacements
    if (!isAdmin) {
      const upper = (userAgencies || []).map(a => String(a || "").trim().toUpperCase())
      data = data.filter(r => (r.status || "").toLowerCase() !== "proposed" && upper.includes((r.agency || "").trim().toUpperCase()))
    }
    if (repSubTab === "pending" && isAdmin) {
      data = data.filter(r => (r.status || "").toLowerCase() === "proposed")
    } else if (repSubTab === "issued") {
      data = data.filter(r => (r.status || "").toLowerCase() === "issued")
    } else if (repSubTab === "installed") {
      data = data.filter(r => (r.status || "").toLowerCase() === "updated")
    } else if (repSubTab === "wo_done") {
      data = data.filter(r => (r.status || "").toLowerCase() === "replaced" && (!r.noteSheetNo || !r.noteSheetNo.trim()))
    } else if (repSubTab === "completed") {
      data = data.filter(r => (r.status || "").toLowerCase() === "replaced" && r.noteSheetNo && r.noteSheetNo.trim())
    } else if (repSubTab === "closed") {
      data = data.filter(r => (r.status || "").toLowerCase() === "closed")
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.replacementId.toLowerCase().includes(q) ||
        r.consumerId.includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        (r.serialNo || "").toLowerCase().includes(q) ||
        (r.issueId || "").toLowerCase().includes(q) ||
        (r.agency || "").toLowerCase().includes(q) ||
        (r.workOrderNo || "").toLowerCase().includes(q) ||
        (r.noteSheetNo || "").toLowerCase().includes(q)
      )
    }
    return data
  }, [combinedReplacements, repSubTab, search, isAdmin, userAgencies])

  const totalPages = Math.ceil(filteredIssues.length / PAGE)
  const paginated  = useMemo(() => filteredIssues.slice((page - 1) * PAGE, page * PAGE), [filteredIssues, page])
  useEffect(() => { setPage(1); setSelectedForFinalize(new Set()) }, [tab, search, purposeFilter])

  // ── Slip selection ────────────────────────────────────────────────────────
  const toggleSlip = (targetIssue: MeterIssue) =>
    setSelectedForSlip(prev => {
      const n = new Set(prev)
      const id = targetIssue.issueId
      if (n.has(id)) {
        n.delete(id)
      } else {
        // Enforce same-agency selection in Issued stage
        const selectedItems = Array.from(prev).map(selId => {
          return issues.find(i => i.issueId === selId) ||
                 replacements.find(r => (r.issueId || r.replacementId) === selId)
        }).filter(Boolean)

        if (selectedItems.length > 0) {
          const firstAgency = (selectedItems[0]?.agency || "").trim().toUpperCase()
          const currentAgency = (targetIssue.agency || "").trim().toUpperCase()
          if (firstAgency && currentAgency && firstAgency !== currentAgency) {
            toast({
              title: "Same Agency Required",
              description: `Multi-selection in Issued tab requires all selected meters to belong to the same agency (${selectedItems[0]?.agency}).`,
              variant: "destructive"
            })
            return prev
          }
        }

        const issueDate = targetIssue.issueDate
        if (targetIssue.status === "issued" && issueDate) {
          const targetAgencyUpper = (targetIssue.agency || "").trim().toUpperCase()
          const sameDateIssues = issues.filter(i =>
            i.status === "issued" &&
            i.issueDate === issueDate &&
            (targetIssue.purpose ? i.purpose === targetIssue.purpose : true) &&
            ((i.agency || "").trim().toUpperCase() === targetAgencyUpper)
          )
          sameDateIssues.forEach(i => n.add(i.issueId))
          toast({ title: `Auto-selected ${sameDateIssues.length} meters for ${targetIssue.agency || "agency"} issued on ${issueDate}` })
        } else {
          n.add(id)
        }
      }
      return n
    })

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

  // ── Stock Export ─────────────────────────────────────────────────────────
  const exportStockExcel = async () => {
    if (stock.length === 0) {
      toast({ title: "No meter stock available to export", variant: "destructive" })
      return
    }
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()

    const rows = stock.map((s, idx) => ({
      "S.No.": idx + 1,
      "Serial No": s.serialNo,
      "Meter Type": s.typeLabel,
      "Phase": s.phase,
      "Ampere": s.ampere,
      "Smart Meter": s.smart ? "Yes" : "No",
      "Condition": (s.condition || "").toUpperCase(),
      "Received Date": s.receivedDate || "",
      "Batch Remarks": s.batchRemarks || "",
      "Last Updated": s.lastUpdated || ""
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Meter Stock")
    XLSX.writeFile(wb, `meter-stock-list-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Meter Stock List exported successfully" })
  }

  // ── Cancel Proposal / Issue ────────────────────────────────────────────────
  const handleCancelIssue = async (issue: MeterIssue) => {
    const remarks = prompt(`Cancel proposal/issue for ${issue.consumerName || issue.consumerId}? Enter cancel remarks (required):`)
    if (!remarks || !remarks.trim()) return

    try {
      // 1. Cancel in replacement sheet if proposal exists
      const rep = replacements.find(r => r.issueId === issue.issueId || (r.consumerId === issue.consumerId && r.status !== "closed"))
      if (rep) {
        await fetch("/api/meters/replacement", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "close", replacementId: rep.replacementId, status: "closed", remarks: remarks.trim() })
        })
      }

      // 2. Return issued meter back to stock if issued
      if (issue.status === "issued") {
        await fetch("/api/meters/return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId: issue.issueId, remarks: `Cancelled: ${remarks.trim()}`, faulty: false })
        })
      }

      toast({ title: "Proposal / Issue cancelled successfully" })
      load(true)
    } catch (e: any) {
      toast({ title: e.message || "Failed to cancel proposal", variant: "destructive" })
    }
  }

  const handleCancelProposal = async (rep: MeterReplacement) => {
    const remarks = prompt(`Cancel proposal for ${rep.consumerName || rep.consumerId}? Enter cancel remarks (required):`)
    if (!remarks || !remarks.trim()) return

    try {
      const res = await fetch("/api/meters/replacement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", replacementId: rep.replacementId, status: "closed", remarks: remarks.trim() })
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to cancel proposal")

      toast({ title: "Proposal cancelled successfully" })
      loadReplacements()
      load(true)
    } catch (e: any) {
      toast({ title: e.message || "Failed to cancel proposal", variant: "destructive" })
    }
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "issue") return (
    <MeterIssueForm
      availableStock={stock}
      agencies={agencies}
      prefill={prefill}
      onSave={apiCall => {
        setViewRaw(prevView)
        setPrefill(null)
        toast({ title: "Issuing meter...", description: "Processing in background" })
        apiCall()
          .then(id => { toast({ title: "Meter issued", description: `Issue ID: ${id}` }); load(true) })
          .catch(err => { toast({ title: "Issue failed — please retry", description: err.message, variant: "destructive" }); load(true) })
      }}
      onCancel={() => { setViewRaw(prevView); setPrefill(null) }}
    />
  )

  if (view === "complete" && selected) return (
    <MeterCompleteForm
      issue={selected}
      onSave={() => { toast({ title: "Installation completed" }); setSelected(null); setViewRaw(prevView); load(true) }}
      onCancel={() => { setSelected(null); setViewRaw(prevView) }}
    />
  )

  if (view === "addstock") return <AddStockForm onSave={() => { setViewRaw(prevView || "stock"); load(true) }} onCancel={() => setViewRaw(prevView || "stock")} />

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${isAdmin ? (selectedForFinalize.size > 0 ? "pb-44" : "pb-28") : "pb-4"}`}>

      {/* ── 1. SUBMODULES DASHBOARD MENU ── */}
      {view === "menu" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
          {/* Replacements Card */}
          <Card
            className="group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl hover:border-amber-300 overflow-hidden"
            onClick={() => { setView("replacement"); setTab("replacement"); loadReplacements() }}>
            <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-amber-500/10 transition-all duration-300 group-hover:scale-105 ${
              (isAdmin
                ? (combinedReplacements.filter(r => (r.status || "").toLowerCase() === "proposed").length + combinedReplacements.filter(r => (r.status || "").toLowerCase() === "updated").length)
                : (combinedReplacements.filter(r => (r.status || "").toLowerCase() === "issued" && userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase())).length + combinedReplacements.filter(r => (r.status || "").toLowerCase() === "updated" && userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase())).length)
              ) > 0 ? "bg-amber-600 shadow-amber-500/20" : "bg-gray-400 shadow-gray-400/20"
            }`}>
              {isAdmin
                ? `${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "proposed").length}/${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "updated").length}`
                : `${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "issued" && userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase())).length}/${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "updated" && userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase())).length}`
              }
            </div>
            <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
              <RotateCcw className="h-16 w-16 md:h-24 md:w-24 text-amber-600 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <CardHeader className="relative pb-2 p-3 md:p-6">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-amber-100 flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                <RotateCcw className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
              </div>
              <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-amber-600 transition-colors">
                Meter Replacements
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                Defective & burnt meter proposals, issuance, WOs & Note Sheets
              </p>
            </CardContent>
          </Card>

          {/* NSC Meters Card */}
          <Card
            className="group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl hover:border-emerald-300 overflow-hidden"
            onClick={() => { setView("nsc"); setTab("nsc") }}>
            <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-emerald-500/10 transition-all duration-300 group-hover:scale-105 ${
              (isAdmin
                ? nscApplications.filter(a => a.status === "quotation_issued" || a.status === "project_done").length + issues.filter(i => i.purpose === "nsc" && (i.status === "issued" || i.status === "installation_done")).length
                : issues.filter(i => i.purpose === "nsc" && i.status === "issued" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length
              ) > 0 ? "bg-emerald-600 shadow-emerald-500/20" : "bg-gray-400 shadow-gray-400/20"
            }`}>
              {isAdmin
                ? nscApplications.filter(a => a.status === "quotation_issued" || a.status === "project_done").length + issues.filter(i => i.purpose === "nsc" && (i.status === "issued" || i.status === "installation_done")).length
                : issues.filter(i => i.purpose === "nsc" && i.status === "issued" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length
              }
            </div>
            <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
              <ClipboardCheck className="h-16 w-16 md:h-24 md:w-24 text-emerald-600 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <CardHeader className="relative pb-2 p-3 md:p-6">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-emerald-100 flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                <ClipboardCheck className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
              </div>
              <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">
                NSC Meters
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                New connection meter issuance & legacy entries
              </p>
            </CardContent>
          </Card>

          {/* Check Meters Card */}
          <Card
            className="group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl hover:border-purple-300 overflow-hidden"
            onClick={() => { setView("check"); setTab("check") }}>
            <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-purple-500/10 transition-all duration-300 group-hover:scale-105 ${
              (isAdmin
                ? (replacements.filter(r => r.purpose === "slow_fast" && (r.status || "").toLowerCase() === "proposed").length + issues.filter(i => i.purpose === "slow_fast" && (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized").length)
                : (issues.filter(i => i.purpose === "slow_fast" && i.status === "issued" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length + issues.filter(i => i.purpose === "slow_fast" && (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length)
              ) > 0 ? "bg-purple-600 shadow-purple-500/20" : "bg-gray-400 shadow-gray-400/20"
            }`}>
              {isAdmin
                ? `${replacements.filter(r => r.purpose === "slow_fast" && (r.status || "").toLowerCase() === "proposed").length}/${issues.filter(i => i.purpose === "slow_fast" && (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized").length}`
                : `${issues.filter(i => i.purpose === "slow_fast" && i.status === "issued" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length}/${issues.filter(i => i.purpose === "slow_fast" && (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized" && userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase())).length}`
              }
            </div>
            <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
              <Gauge className="h-16 w-16 md:h-24 md:w-24 text-purple-600 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <CardHeader className="relative pb-2 p-3 md:p-6">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-purple-100 flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                <Gauge className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
              </div>
              <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                Check Meters
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                Slow/Fast testing & accuracy verification
              </p>
            </CardContent>
          </Card>

          {/* Stock Register Card */}
          {(isAdmin || (permissions && (permissions.meter_stock || permissions.meter?.includes("read")))) && (
            <Card
              className="group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl hover:border-blue-300 overflow-hidden"
              onClick={() => { setView("stock"); setTab("stock") }}>
              <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-blue-500/10 transition-all duration-300 group-hover:scale-105 ${summary.reduce((acc, s) => acc + s.available, 0) > 0 ? "bg-blue-600 shadow-blue-500/20" : "bg-gray-400 shadow-gray-400/20"}`}>
                {summary.reduce((acc, s) => acc + s.available, 0)}
              </div>
              <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                <Package className="h-16 w-16 md:h-24 md:w-24 text-blue-600 transition-transform duration-500 group-hover:scale-110" />
              </div>
              <CardHeader className="relative pb-2 p-3 md:p-6">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-blue-100 flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                  <Package className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
                </div>
                <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  Store Stock
                </CardTitle>
              </CardHeader>
              <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
                <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                  1P/3P/Smart meter balance & store ledgers
                </p>
              </CardContent>
            </Card>
          )}

          {/* History & Archives Card */}
          <Card
            className="group relative cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 border border-gray-200/80 bg-white/70 backdrop-blur-md rounded-2xl hover:border-gray-300 overflow-hidden"
            onClick={() => { setView("history"); setTab("history") }}>
            <div className={`absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center text-white text-[10px] md:text-xs font-bold min-w-[1.5rem] h-6 px-1.5 md:min-w-[2rem] md:h-8 md:px-2 rounded-full shadow-lg border-2 border-white ring-2 ring-gray-500/10 transition-all duration-300 group-hover:scale-105 bg-gray-500 shadow-gray-500/20`}>
              {issues.filter(i => (i.status === "installed" || i.status === "returned") && (isAdmin || userAgencies.map((a: string) => a.toUpperCase()).includes((i.agency || "").toUpperCase()))).length}
            </div>
            <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
              <FileText className="h-16 w-16 md:h-24 md:w-24 text-gray-600 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <CardHeader className="relative pb-2 p-3 md:p-6">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gray-100 flex items-center justify-center mb-2 md:mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                <FileText className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
              </div>
              <CardTitle className="text-sm md:text-xl font-bold text-gray-900 group-hover:text-gray-700 transition-colors">
                History & Archives
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">
                All completed installations & returned meters
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submodule Header with Back Button */}
      {view !== "menu" && (
        <div className="flex items-center justify-between border-b pb-3 mb-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-gray-200"
              onClick={() => {
                if (showReportPanel) {
                  setShowReportPanel(false)
                } else {
                  setView("menu")
                }
              }}>
              <ArrowLeft className="h-4 w-4 text-gray-700" />
            </Button>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 leading-none">
                {view === "replacement" && "🔄 Meter Replacements"}
                {view === "nsc" && "⚡ NSC Meters"}
                {view === "check" && "🧪 Check Meters"}
                {view === "stock" && "📦 Store Meter Stock"}
                {view === "history" && "📜 History & Archives"}
              </h2>
              <p className="text-[11px] text-gray-500 mt-1">
                {view === "replacement" && "Defective and burnt meter replacements, Work Orders, and Note Sheets."}
                {view === "nsc" && "New Service Connection meter issuance, legacy entries, and connection effected status."}
                {view === "check" && "Slow/Fast meter testing, cross-checks 1 & 2, accuracy calculation, and outcomes."}
                {view === "stock" && "Store inventory balance, batch receipts, and stock availability."}
                {view === "history" && "Completed installations and returned store records across all categories."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Header stays clean without Reports button */}
          </div>
        </div>
      )}

      {/* Contextual Submodule Report Panel */}
      {showReportPanel && view !== "menu" && (
        <div className="mb-4">
          <ReportsPanel
            activeSubmodule={view}
            issues={issues}
            summary={summary}
            onExport={exportIssues}
            replacements={replacements}
            oldMeterMap={oldMeterMap}
            nscApplications={nscApplications}
          />
        </div>
      )}

      {/* ── Per-Submodule Search & Controls ── */}
      {!showReportPanel && (view === "nsc" || view === "check" || view === "history") && (
        <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search issue ID, serial, consumer, agency..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
              {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
            </div>
            {isAdmin && (() => {
              const countInView = filteredIssues.filter(i => selectedForSlip.has(i.issueId)).length
              return countInView > 0 ? (
                <Button size="sm" variant="outline" onClick={printSelected} className="shrink-0 bg-blue-50 border-blue-200 text-blue-800 font-semibold hover:bg-blue-100">
                  <Printer className="h-4 w-4 mr-1 text-blue-600" /> Print Store Requisition ({countInView})
                </Button>
              ) : null
            })()}
            <Button size="sm" variant="ghost" onClick={exportIssues} className="shrink-0" title="Export to Excel">
              <FileDown className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
              <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* NSC Submodule Status Chips */}
          {view === "nsc" && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {[
                ...(isAdmin ? [{ value: "proposed",  label: `📋 Proposed (${nscApplications.filter(a => a.status === "quotation_issued" || a.status === "project_done").length})` }] : []),
                { value: "issued",    label: `⚡ Issued (${issues.filter(i => i.purpose === "nsc" && i.status === "issued" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "installed", label: `🔧 Installed (${issues.filter(i => i.purpose === "nsc" && i.status === "installation_done" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "completed", label: `✅ Connection Done (${issues.filter(i => i.purpose === "nsc" && i.status === "installed" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "withheld",  label: `⚠️ Withheld (${issues.filter(i => i.purpose === "nsc" && (i.status === "returned" || i.status === "withheld") && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "all",       label: `All (${issues.filter(i => i.purpose === "nsc" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
              ].map(sub => (
                <button key={sub.value} onClick={() => setNscSubTab(sub.value as any)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                    nscSubTab === sub.value ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {/* Check Meter Submodule Status Chips */}
          {view === "check" && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {[
                ...(isAdmin ? [{ value: "proposed",    label: `📋 Proposed (${replacements.filter(r => r.purpose === "slow_fast" && (r.status || "").toLowerCase() === "proposed").length})` }] : []),
                { value: "issued",      label: `⚡ Issued (${issues.filter(i => i.purpose === "slow_fast" && i.status === "issued" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "installed",   label: `🔧 Installed (${issues.filter(i => i.purpose === "slow_fast" && (i.status === "installation_done" || i.status === "installed") && i.checkMeterStatus !== "finalized" && !i.crossCheckDate1 && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "check1_done", label: `1st Check Done (${issues.filter(i => i.purpose === "slow_fast" && i.crossCheckDate1 && !i.crossCheckDate2 && i.checkMeterStatus !== "finalized" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "check2_done", label: `2nd Check Done (${issues.filter(i => i.purpose === "slow_fast" && i.crossCheckDate2 && i.checkMeterStatus !== "finalized" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "finalized",   label: `🏁 Finalized (${issues.filter(i => i.purpose === "slow_fast" && i.checkMeterStatus === "finalized" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
                { value: "all",         label: `All Check Meters (${issues.filter(i => i.purpose === "slow_fast" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((i.agency || "").trim().toUpperCase()))).length})` },
              ].map(sub => (
                <button key={sub.value} onClick={() => setCheckSubTab(sub.value as any)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                    checkSubTab === sub.value ? "bg-purple-600 text-white border-purple-600 shadow-sm" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {/* Mobile View Dedicated Report Row */}
          <div className="md:hidden pt-2 border-t">
            <Button
              size="sm"
              variant={showReportPanel ? "default" : "outline"}
              className={`w-full h-9 rounded-xl text-xs font-semibold transition ${
                showReportPanel ? "bg-slate-950 text-white shadow-sm" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => setShowReportPanel(p => !p)}>
              {showReportPanel ? (
                <>
                  <List className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                  📋 Back to Records List
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  📊 Submodule Report
                </>
              )}
            </Button>
          </div>

          {/* History-only purpose filter chips */}
          {view === "history" && (
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

          {/* Controls Footer with Dedicated Submodule Report Button (Desktop) */}
          <div className="hidden md:flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{filteredIssues.length} records</span>
              {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Updated</span>}
            </div>

            <Button
              size="sm"
              variant={showReportPanel ? "default" : "outline"}
              className={`rounded-xl text-xs font-semibold transition ${
                showReportPanel ? "bg-slate-950 text-white shadow-sm" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => setShowReportPanel(p => !p)}>
              {showReportPanel ? (
                <>
                  <List className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                  📋 Back to Records List
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  📊 Submodule Report
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Replacement submodule: search bar & controls */}
      {view === "replacement" && !showReportPanel && (
        <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search replacement ID, consumer, agency..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
              {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
            </div>
            {isAdmin && (() => {
              const selectedIssuedReps = filteredReplacements.filter(r => r.status === "issued" && (selectedForSlip.has(r.issueId) || selectedForSlip.has(r.replacementId)))
              return selectedIssuedReps.length > 0 ? (
                <Button size="sm" variant="outline" onClick={() => {
                  const itemsToPrint = selectedIssuedReps.map(r => issues.find(i => i.issueId === r.issueId) || {
                    issueId: r.issueId || r.replacementId,
                    issueDate: r.proposedDate || "",
                    purpose: r.purpose,
                    consumerId: r.consumerId,
                    consumerName: r.consumerName,
                    serialNo: r.serialNo || "",
                    meterType: "Standard",
                    agency: r.agency,
                    status: "issued"
                  })
                  printMeterSlip(itemsToPrint as any)
                }} className="shrink-0 bg-blue-50 border-blue-200 text-blue-800 font-semibold hover:bg-blue-100">
                  <Printer className="h-4 w-4 mr-1 text-blue-600" /> Print Store Requisition ({selectedIssuedReps.length})
                </Button>
              ) : null
            })()}
            <Button size="sm" variant="ghost" onClick={() => { load(); loadReplacements() }} className="shrink-0">
              <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {/* Mobile View Dedicated Report Row */}
          <div className="md:hidden pt-2 border-t">
            <Button
              size="sm"
              variant={showReportPanel ? "default" : "outline"}
              className={`w-full h-9 rounded-xl text-xs font-semibold transition ${
                showReportPanel ? "bg-slate-950 text-white shadow-sm" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => setShowReportPanel(p => !p)}>
              {showReportPanel ? (
                <>
                  <List className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                  📋 Back to Records List
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  📊 Submodule Report
                </>
              )}
            </Button>
          </div>
          <div className="hidden md:flex items-center justify-between pt-2 border-t text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span>{filteredReplacements.length} records</span>
              {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Updated</span>}
            </div>

            <Button
              size="sm"
              variant={showReportPanel ? "default" : "outline"}
              className={`rounded-xl text-xs font-semibold transition ${
                showReportPanel ? "bg-slate-950 text-white shadow-sm" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => setShowReportPanel(p => !p)}>
              {showReportPanel ? (
                <>
                  <List className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                  📋 Back to Records List
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  📊 Submodule Report
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Stock submodule: search, Add Stock, Export & Reports button below search bar */}
      {view === "stock" && !showReportPanel && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search meter type or serial number..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
                {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setView("addstock")}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
                  <Plus className="h-4 w-4" /> Add Stock
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={exportStockExcel} className="shrink-0 text-emerald-700 border-emerald-200 hover:bg-emerald-50 rounded-xl" title="Export Meter Stock List to Excel">
                <FileSpreadsheet className="h-4 w-4 mr-1 text-emerald-600" /> <span className="hidden sm:inline">Export Stock</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
                <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Row below search bar for Reports Button (Requirement 2) */}
            <div className="pt-2 border-t flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5 text-blue-600" /> Meter Inventory & Submodule Analytics
              </p>
              <Button
                size="sm"
                variant={showReportPanel ? "default" : "outline"}
                className={`rounded-xl text-xs font-semibold transition ${
                  showReportPanel ? "bg-slate-900 text-white shadow-sm" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setShowReportPanel(p => !p)}>
                <FileSpreadsheet className="h-4 w-4 mr-1 text-emerald-600" />
                <span>{showReportPanel ? "Close Reports Panel" : "View Reports Panel"}</span>
              </Button>
            </div>
          </div>

          {/* On-screen Live Meter Lookup & Traceability Tool (Requirement 4) */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 rounded-xl shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2 text-emerald-400">
                <Search className="h-4 w-4 text-emerald-400" /> On-Screen Meter Lookup & Status Traceability
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">Instant Search</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                value={meterLookupQuery}
                onChange={e => setMeterLookupQuery(e.target.value)}
                placeholder="Enter Serial Number or Application/Consumer ID to check status..."
                className="pl-10 pr-8 bg-slate-950/80 border-slate-700 text-white placeholder:text-slate-400 rounded-xl text-xs h-9 font-mono"
              />
              {meterLookupQuery && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 hover:text-white cursor-pointer" onClick={() => setMeterLookupQuery("")} />
              )}
            </div>

            {/* Instant Search Results Box */}
            {meterLookupQuery.trim() && (() => {
              const query = meterLookupQuery.trim().toLowerCase()
              const foundStock = stock.filter(s => s.serialNo.toLowerCase().includes(query))
              const foundIssues = issues.filter(i => (i.serialNo || "").toLowerCase().includes(query) || (i.consumerId || "").toLowerCase().includes(query) || (i.nscReceiveNo || "").toLowerCase().includes(query))

              if (foundStock.length === 0 && foundIssues.length === 0) {
                return (
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-700 text-center text-xs text-slate-400">
                    No meter or issuance record matching &quot;{meterLookupQuery}&quot; found in database.
                  </div>
                )
              }

              return (
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-700 space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-[11px] font-semibold text-slate-300">Matching Results ({foundStock.length + foundIssues.length}):</p>
                  <div className="grid gap-2">
                    {/* Issued / Utilised matches */}
                    {foundIssues.map(issue => (
                      <div key={issue.issueId} className="bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-400 font-mono text-sm">{issue.serialNo}</span>
                            <Badge className={
                              issue.purpose === "nsc" ? "bg-green-600 text-white" :
                              issue.purpose === "slow_fast" ? "bg-purple-600 text-white" : "bg-orange-600 text-white"
                            }>
                              UTILISED ({issue.purpose === "nsc" ? "NSC" : issue.purpose === "slow_fast" ? "Check Meter" : "Replacement"})
                            </Badge>
                            <Badge variant="outline" className="text-slate-300 border-slate-600 text-[10px]">
                              {issue.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-slate-300 text-[11px] mt-1">
                            Issued to: <strong className="text-white">{issue.consumerName || "—"}</strong> ({issue.agency || "Agency"})
                          </p>
                          <p className="text-slate-400 text-[10px] font-mono">
                            App/Consumer ID: {issue.consumerId || "—"} | Date: {issue.issueDate || "—"} | WO/Ref: {issue.completionRef || "Pending"}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* Available Stock matches */}
                    {foundStock.filter(s => !foundIssues.some(i => i.serialNo === s.serialNo)).map(st => (
                      <div key={st.serialNo} className="bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-xs flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-400 font-mono text-sm">{st.serialNo}</span>
                            <Badge className="bg-emerald-600 text-white">STORE STOCK (AVAILABLE)</Badge>
                          </div>
                          <p className="text-slate-300 text-[11px] mt-0.5">
                            Type: <strong>{st.typeLabel}</strong> | Phase: {st.phase} | Batch: {st.batchRemarks || "Initial"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Utilization Summary Cards & Drill-Down Filters (Requirement 4) */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Card 1: Available */}
              <div
                onClick={() => setStockDrillFilter(prev => prev === "available" ? null : "available")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  stockDrillFilter === "available" ? "bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.02]" : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Available in Store</p>
                <p className="text-2xl font-black mt-1">{summary.reduce((acc, s) => acc + s.available, 0)}</p>
                <p className="text-[10px] mt-1 opacity-90 font-medium">Click to view list ↗</p>
              </div>

              {/* Card 2: Utilised for NSC */}
              <div
                onClick={() => setStockDrillFilter(prev => prev === "nsc" ? null : "nsc")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  stockDrillFilter === "nsc" ? "bg-green-700 text-white border-green-800 shadow-md scale-[1.02]" : "bg-green-50 text-green-900 border-green-200 hover:bg-green-100"
                }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Utilised (NSC)</p>
                <p className="text-2xl font-black mt-1">{issues.filter(i => i.purpose === "nsc").length}</p>
                <p className="text-[10px] mt-1 opacity-90 font-medium">Click to view list ↗</p>
              </div>

              {/* Card 3: Utilised for Replacement */}
              <div
                onClick={() => setStockDrillFilter(prev => prev === "replacement" ? null : "replacement")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  stockDrillFilter === "replacement" ? "bg-orange-600 text-white border-orange-700 shadow-md scale-[1.02]" : "bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100"
                }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Utilised (Replacement)</p>
                <p className="text-2xl font-black mt-1">{issues.filter(i => i.purpose === "faulty_replacement" || i.purpose === "burnt_replacement").length}</p>
                <p className="text-[10px] mt-1 opacity-90 font-medium">Click to view list ↗</p>
              </div>

              {/* Card 4: Utilised for Check Meter */}
              <div
                onClick={() => setStockDrillFilter(prev => prev === "check" ? null : "check")}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  stockDrillFilter === "check" ? "bg-purple-700 text-white border-purple-800 shadow-md scale-[1.02]" : "bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100"
                }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Utilised (Check Meter)</p>
                <p className="text-2xl font-black mt-1">{issues.filter(i => i.purpose === "slow_fast").length}</p>
                <p className="text-[10px] mt-1 opacity-90 font-medium">Click to view list ↗</p>
              </div>
            </div>

            {/* Interactive Drill-down On-screen Table */}
            {stockDrillFilter && (
              <div className="bg-white rounded-xl border shadow-md p-4 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <List className="h-4 w-4 text-blue-600" />
                    On-Screen Details: {
                      stockDrillFilter === "available" ? "Available Store Meters" :
                      stockDrillFilter === "nsc" ? "Meters Utilised for NSC" :
                      stockDrillFilter === "replacement" ? "Meters Utilised for Replacement" : "Meters Utilised for Check Meter"
                    }
                  </h4>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" onClick={() => setStockDrillFilter(null)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Close List
                  </Button>
                </div>

                {stockDrillFilter === "available" ? (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Serial No</th>
                          <th className="px-3 py-2 text-left">Meter Type</th>
                          <th className="px-3 py-2 text-left">Phase</th>
                          <th className="px-3 py-2 text-left">Batch / Remarks</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stock.filter(s => s.condition === "available").slice(0, 100).map((st, idx) => (
                          <tr key={st.serialNo} className="hover:bg-slate-50 font-mono">
                            <td className="px-3 py-1.5 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-bold text-blue-700">{st.serialNo}</td>
                            <td className="px-3 py-1.5 font-sans font-medium text-gray-800">{st.typeLabel}</td>
                            <td className="px-3 py-1.5">{st.phase}</td>
                            <td className="px-3 py-1.5 font-sans text-gray-500">{st.batchRemarks || "—"}</td>
                            <td className="px-3 py-1.5 text-center">
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">AVAILABLE</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Serial No</th>
                          <th className="px-3 py-2 text-left">Consumer / Applicant Name</th>
                          <th className="px-3 py-2 text-left">App/Consumer ID</th>
                          <th className="px-3 py-2 text-left">Agency</th>
                          <th className="px-3 py-2 text-left">Issue Date</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {issues.filter(i => {
                          if (stockDrillFilter === "nsc") return i.purpose === "nsc"
                          if (stockDrillFilter === "replacement") return i.purpose === "faulty_replacement" || i.purpose === "burnt_replacement"
                          if (stockDrillFilter === "check") return i.purpose === "slow_fast"
                          return false
                        }).slice(0, 100).map((issue, idx) => (
                          <tr key={issue.issueId} className="hover:bg-slate-50 font-mono">
                            <td className="px-3 py-1.5 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-900">{issue.serialNo}</td>
                            <td className="px-3 py-1.5 font-sans font-medium text-gray-800">{issue.consumerName || "—"}</td>
                            <td className="px-3 py-1.5 text-blue-700">{issue.consumerId || "—"}</td>
                            <td className="px-3 py-1.5 font-sans text-gray-700">{issue.agency || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-500">{issue.issueDate || "—"}</td>
                            <td className="px-3 py-1.5 text-center">
                              <Badge variant="outline" className="text-slate-700 border-slate-300 font-sans uppercase">
                                {issue.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock submodule: full summary table */}
      {view === "stock" && !showReportPanel && summary.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
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
          </div>
        </div>
      )}

      {/* Bulk Note Sheet Action Bar */}
      {selectedForBulkNoteSheet.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between shadow-sm mb-3">
          <div className="text-xs font-semibold text-blue-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <span>{selectedForBulkNoteSheet.size} installed meter(s) selected for Note Sheet entry</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedForBulkNoteSheet(new Set())} className="text-xs h-8">
              Clear Selection
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8" onClick={() => setBulkNoteSheetDialogOpen(true)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Set Note Sheet No ({selectedForBulkNoteSheet.size})
            </Button>
          </div>
        </div>
      )}

      {/* Issue cards — only in NSC, Check, History submodules */}
      {(view === "nsc" || view === "check" || view === "history") && !showReportPanel && (
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
                    <div className="flex items-center gap-2 mt-0.5">
                      {isAdmin && (issue.status === "issued" || issue.status === "installed") && (
                        <input
                          type="checkbox"
                          checked={issue.status === "issued" ? selectedForSlip.has(issue.issueId) : selectedForBulkNoteSheet.has(issue.issueId)}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (issue.status === "issued") toggleSlip(issue)
                            else {
                              const next = new Set(selectedForBulkNoteSheet)
                              if (next.has(issue.issueId)) next.delete(issue.issueId)
                              else next.add(issue.issueId)
                              setSelectedForBulkNoteSheet(next)
                            }
                          }}
                          className="shrink-0 accent-blue-600 h-4 w-4 rounded cursor-pointer"
                        />
                      )}
                      <p className="text-sm text-gray-600 font-mono">{issue.consumerId || "No ID"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 overflow-hidden whitespace-nowrap">
                      <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border shrink-0">
                        {issue.issueId}
                      </span>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${PURPOSE_COLORS[issue.purpose] ?? "text-blue-700 border-blue-200"}`}>
                        {PURPOSE_LABELS[issue.purpose] || issue.purpose}
                      </span>
                      <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate">
                        {issue.meterType || "Standard"}
                      </span>
                      {issue.nscReceiveNo && (
                        <Badge variant="outline" className="text-[10px] text-green-700 border-green-200 shrink-0">
                          NSC: {issue.nscReceiveNo}
                        </Badge>
                      )}
                      {issue.nscReceiveNo && nscStatusMap[issue.nscReceiveNo] === "quotation_issued" && (
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 shrink-0">
                          ✓ Quotation
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {(() => {
                      const st = getIssueStatusBadge(issue)
                      return <Badge className={st.className}>{st.label}</Badge>
                    })()}
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

                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                  <div>Issued: {issue.issueDate || "—"}</div>
                  {issue.status !== "issued" && issue.completedAt && (
                    <div className="text-right">
                      <p className="text-green-600 font-medium">{issue.completedAt}</p>
                      <p className="text-[10px] text-gray-400">Completed</p>
                    </div>
                  )}
                </div>

                {issue.status !== "issued" && (issue.completionRef || issue.installationNo || issue.noteSheetNo) && (
                  <div className="pt-2 border-t mt-2 flex flex-col gap-1 text-xs text-gray-500">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {issue.completionRef && (
                        <p>WO No: <strong className="text-slate-700 font-mono">{issue.completionRef}</strong></p>
                      )}
                      {issue.installationNo && (
                        <p>Inst No: <strong className="text-slate-700 font-mono">{issue.installationNo}</strong></p>
                      )}
                      {issue.noteSheetNo && (
                        <p>Note Sheet: <strong className="text-blue-700 font-mono">{issue.noteSheetNo}</strong></p>
                      )}
                    </div>
                  </div>
                )}

                {/* Slow/Fast Check Meter Full Readings History & Status */}
                {issue.purpose === "slow_fast" && issue.status !== "issued" && issue.status !== "proposed" && (
                  <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3 space-y-2 mt-2 text-xs">
                    <div className="flex justify-between items-center font-bold text-purple-900 border-b border-purple-200 pb-1.5">
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5 text-purple-700" /> Check Meter Readings History
                      </span>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 bg-white border-purple-300 text-purple-900 hover:bg-purple-100 shrink-0 font-semibold shadow-xs"
                        onClick={() => { setSelectedForCheckMeter(issue); setCheckMeterDialogOpen(true) }}>
                        Record / Verify Test
                      </Button>
                    </div>

                    {/* Readings History Breakdown */}
                    <div className="bg-white rounded-lg border border-purple-100 p-2 space-y-1.5 text-[11px] font-mono">
                      {/* Initial Readings at Installation */}
                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded">
                        <div>
                          <p className="font-bold text-slate-800 text-[10px] uppercase font-sans">1. Initial Installation Reading</p>
                          <p className="text-slate-600 text-[10px] font-sans">Date: {issue.issueDate || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-700">Existing ({issue.existingMeterNo || "Old"}): <strong>{issue.existingMeterStartReading || issue.lastReading || "0"}</strong></p>
                          <p className="text-purple-700">Check ({issue.serialNo}): <strong>{issue.newReading || "0"}</strong></p>
                        </div>
                      </div>

                      {/* 1st Check Reading */}
                      {issue.crossCheckDate1 && (
                        <div className="flex justify-between items-center bg-purple-50/60 p-1.5 rounded border border-purple-100">
                          <div>
                            <p className="font-bold text-purple-900 text-[10px] uppercase font-sans">2. 1st Check Reading</p>
                            <p className="text-purple-700 text-[10px] font-sans">Date: {issue.crossCheckDate1}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-700">Existing: <strong>{issue.existingMeterReading1 || "—"}</strong></p>
                            <p className="text-purple-800 font-bold">Check: <strong>{issue.checkMeterReading1 || "—"}</strong></p>
                          </div>
                        </div>
                      )}

                      {/* 2nd Check Reading */}
                      {issue.crossCheckDate2 && (
                        <div className="flex justify-between items-center bg-purple-100/60 p-1.5 rounded border border-purple-200">
                          <div>
                            <p className="font-bold text-purple-900 text-[10px] uppercase font-sans">3. 2nd Check Reading</p>
                            <p className="text-purple-700 text-[10px] font-sans">Date: {issue.crossCheckDate2}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-700">Existing: <strong>{issue.existingMeterReading2 || "—"}</strong></p>
                            <p className="text-purple-900 font-bold">Check: <strong>{issue.checkMeterReading2 || "—"}</strong></p>
                          </div>
                        </div>
                      )}

                      {/* Accuracy & Difference Summary */}
                      {issue.accuracyPercentage && (
                        <div className="pt-1.5 border-t border-purple-100 flex items-center justify-between font-sans">
                          <p className="text-purple-900 font-bold text-xs">
                            Accuracy: <span className="font-mono text-purple-700">{issue.accuracyPercentage}</span>
                          </p>
                          <p className="text-slate-700 text-[11px] font-medium">
                            Diff: <span className="font-mono text-slate-900">{issue.calculatedDiffUnits}</span> units
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Old Meter Return Tracking System */}
                {issue.purpose !== "nsc" && (issue.status === "installation_done" || issue.status === "installed") && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-600 shrink-0 font-medium">Office Return:</span>
                      {issue.oldMeterReturnStatus === "returned" ? (
                        <span className="text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] truncate">
                          ✓ Returned ({issue.oldMeterReturnDate})
                        </span>
                      ) : (() => {
                        let isOverdue = false
                        if (issue.completedAt) {
                          try {
                            const [d, m, yTime] = issue.completedAt.split("/")
                            const [y] = (yTime || "").split(" ")
                            const inst = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
                            if (!isNaN(inst.getTime())) {
                              const diffDays = Math.floor((Date.now() - inst.getTime()) / (1000 * 60 * 60 * 24))
                              if (diffDays > 3) isOverdue = true
                            }
                          } catch { /* ignored */ }
                        }
                        return isOverdue ? (
                          <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                            ⚠ Overdue (&gt; 3 Days)
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                            Pending (Due: 3 Days)
                          </span>
                        )
                      })()}
                    </div>
                    {issue.oldMeterReturnStatus !== "returned" && isAdmin && (
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 bg-white border-slate-300 text-slate-800 hover:bg-slate-100 shrink-0 flex items-center"
                        onClick={() => { setSelectedForReturnOffice(issue); setReturnOfficeDialogOpen(true) }}>
                        <PackageCheck className="h-3 w-3 mr-1 text-emerald-600" /> Meter Return
                      </Button>
                    )}
                  </div>
                )}

                {issue.status === "proposed" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button
                      size="sm"
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold h-9 rounded-lg shadow-sm transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPrefill({
                          replacementId: "",
                          consumerId: issue.consumerId,
                          consumerName: issue.consumerName,
                          address: issue.address || "",
                          mobile: issue.mobile || "",
                          purpose: "nsc",
                          agency: issue.agency !== "Unassigned" ? issue.agency : ""
                        })
                        setView("issue")
                      }}>
                      <Package className="h-3.5 w-3.5 mr-1.5" />
                      Issue Meter to Agency
                    </Button>
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
                    {issue.newReading && <p className="text-xs text-gray-500 font-mono">Reading: <strong>{issue.newReading}</strong></p>}
                    <Button size="sm" className="w-full h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => {
                        setSelectedForFinalize(new Set([issue.issueId]))
                        setFinalizeRef(issue.completionRef || "")
                        setFinalizeInstNo("")
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
                  <div className="space-y-1.5 mt-2 pt-2 border-t text-xs text-gray-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[11px]">
                      <span>WO: <strong className="text-slate-800">{issue.completionRef || "—"}</strong></span>
                      <span>Note Sheet: <strong className={issue.noteSheetNo ? "text-blue-700 font-bold" : "text-amber-600 font-normal"}>{issue.noteSheetNo || "Pending"}</strong></span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-200 mt-1">
                      <span>Old Meter: <strong className="font-mono text-amber-700">{oldMeterMap[issue.consumerId] || "—"}</strong></span>
                      <span>Return: <strong className={issue.oldMeterReturnStatus === "returned" ? "text-emerald-700" : "text-amber-700"}>{issue.oldMeterReturnStatus === "returned" ? "Returned" : "Pending Return"}</strong></span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-slate-200">
                      <div className="flex gap-2 items-center text-xs">
                        {issue.afterImage && <a href={issue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">After ↗</a>}
                        {issue.beforeImage && <a href={issue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Before ↗</a>}
                        {issue.newReading && <span className="font-mono text-[11px]">Reading: <strong>{issue.newReading}</strong></span>}
                      </div>
                      {isAdmin && (
                        <Button size="sm" variant="outline" className="h-6 text-[11px] text-blue-700 border-blue-200 hover:bg-blue-50 px-2 shrink-0 flex items-center"
                          onClick={() => { setSelectedForNoteSheet(issue); setNoteSheetDialogOpen(true) }}>
                          <FileText className="h-3 w-3 mr-1" /> {issue.noteSheetNo ? "Note Sheet" : "+ Note Sheet"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Replacement submodule pipeline */}
      {view === "replacement" && !showReportPanel && (
        <div className="space-y-4">
          {/* Sub-tab Selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              ...(isAdmin ? [{ value: "pending",   label: `Pending Issue (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "proposed").length})` }] : []),
              { value: "issued",    label: `Issued (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "issued" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
              { value: "installed", label: `Installed (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "updated" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
              { value: "wo_done",   label: `WO Done (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "replaced" && (!r.noteSheetNo || !r.noteSheetNo.trim()) && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
              { value: "completed", label: `Completed (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "replaced" && r.noteSheetNo && r.noteSheetNo.trim() && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
              { value: "closed",    label: `Closed (${combinedReplacements.filter(r => (r.status || "").toLowerCase() === "closed" && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
              { value: "all",       label: `All (${combinedReplacements.filter(r => ((r.status || "").toLowerCase() !== "proposed" || isAdmin) && (isAdmin || userAgencies.map(a => a.toUpperCase()).includes((r.agency || "").trim().toUpperCase()))).length})` },
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
              {filteredReplacements.map(rep => {
                const linkedIssue = issues.find(i => i.issueId === rep.issueId || i.consumerId === rep.consumerId)
                const isCompleted = rep.status === "replaced" && rep.noteSheetNo && rep.noteSheetNo.trim()
                const isWODone = rep.status === "replaced" && (!rep.noteSheetNo || !rep.noteSheetNo.trim())
                const isExpanded = expandedTimeline.has(rep.replacementId)
                const isSelected = selectedForBulkRep.has(rep.replacementId)

                return (
                  <Card key={rep.replacementId} className={`shadow-md hover:shadow-lg transition-shadow overflow-hidden max-w-full ${isSelected ? "ring-2 ring-blue-500 bg-blue-50/20" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-2 min-w-0">
                          {/* Multi-select Checkbox by Stage */}
                          {/* Multi-select Checkbox by Stage (Disabled in ALL tab) */}
                          {repSubTab !== "all" && isAdmin && rep.status === "issued" && (
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0 accent-blue-600 h-4 w-4 rounded cursor-pointer"
                              checked={selectedForSlip.has(rep.issueId || rep.replacementId)}
                              onChange={(e) => {
                                e.stopPropagation()
                                const item = linkedIssue || {
                                  issueId: rep.issueId || rep.replacementId,
                                  issueDate: rep.proposedDate || "",
                                  purpose: rep.purpose,
                                  consumerId: rep.consumerId,
                                  consumerName: rep.consumerName,
                                  serialNo: rep.serialNo || "",
                                  meterType: "Standard",
                                  agency: rep.agency,
                                  status: "issued"
                                }
                                toggleSlip(item as any)
                              }}
                            />
                          )}

                          {/* Stage B: Installed -> Bulk Work Order Checkbox */}
                          {repSubTab !== "all" && isAdmin && rep.status === "updated" && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 mt-1 accent-blue-600 cursor-pointer shrink-0"
                              checked={isSelected}
                              onChange={() => toggleBulkRep(rep)}
                            />
                          )}

                          {/* Stage C: WO Done / Completed -> Bulk Note Sheet Checkbox */}
                          {repSubTab !== "all" && isAdmin && rep.status === "replaced" && (
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0 accent-blue-600 h-4 w-4 rounded cursor-pointer"
                              checked={selectedForBulkNoteSheet.has(rep.replacementId) || (rep.issueId ? selectedForBulkNoteSheet.has(rep.issueId) : false)}
                              onChange={(e) => {
                                e.stopPropagation()
                                const idToToggle = rep.issueId || rep.replacementId
                                const next = new Set(selectedForBulkNoteSheet)
                                if (next.has(idToToggle)) next.delete(idToToggle)
                                else next.add(idToToggle)
                                setSelectedForBulkNoteSheet(next)
                              }}
                            />
                          )}
                          <div>
                            <CardTitle className="text-lg leading-tight">{rep.consumerName || "No Name"}</CardTitle>
                            <p className="text-sm text-gray-600 font-mono">{rep.consumerId || "No ID"}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                              <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                ID: {rep.replacementId}
                              </span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                PURPOSE_COLORS[rep.purpose] || "text-blue-700 border-blue-200"
                              }`}>
                                {PURPOSE_LABELS[rep.purpose] || rep.purpose}
                              </span>
                              {(linkedIssue?.meterType || rep.meterType) && (
                                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  {linkedIssue?.meterType || rep.meterType}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              rep.status === "proposed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                              rep.status === "issued" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              rep.status === "updated" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              rep.status === "closed" ? "bg-gray-100 text-gray-700 border-gray-300" :
                              isCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              "bg-teal-50 text-teal-700 border-teal-200"
                            }`}>
                              {rep.status === "proposed" ? "Proposed" :
                               rep.status === "issued" ? "Issued" :
                               rep.status === "updated" ? "Installed" :
                               rep.status === "closed" ? "Closed / Cancelled" :
                               isCompleted ? "Completed" : "WO Done"}
                            </span>
                            {repSubTab !== "all" && isAdmin && (rep.status || "").toLowerCase() === "proposed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Cancel / Close Proposal"
                                className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancelProposal(rep)
                                }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs max-w-[120px] truncate block">{rep.agency || linkedIssue?.agency || "Unassigned"}</Badge>
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
                              {rep.serialNo || linkedIssue?.serialNo || "—"}
                            </p>
                            <p className="text-[10px] text-gray-500 uppercase font-bold">New Meter Serial</p>
                          </div>
                        </div>
                      </div>

                      {/* Stage-specific primary timestamps & info */}
                      <div className="pt-2 border-t text-xs space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {rep.status === "proposed" && (
                          <div className="flex justify-between items-center text-gray-600">
                            <span>Proposed Date:</span>
                            <strong className="font-mono text-amber-800">{rep.proposedDate || "—"}</strong>
                          </div>
                        )}
                        {rep.status === "issued" && (
                          <div className="flex justify-between items-center text-gray-600">
                            <span>Issued Date:</span>
                            <strong className="font-mono text-yellow-800">{linkedIssue?.issueDate || "—"}</strong>
                          </div>
                        )}
                        {rep.status === "updated" && (
                          <>
                            <div className="flex justify-between items-center text-gray-600">
                              <span>Installed Date:</span>
                              <strong className="font-mono text-blue-800">{linkedIssue?.completedAt || "—"}</strong>
                            </div>
                            <div className="flex justify-between items-center text-gray-600 pt-1 border-t border-slate-200">
                              <span>Readings:</span>
                              <span className="font-mono">Old Meter Last: <strong>{linkedIssue?.lastReading || "0"}</strong> | New Meter Initial: <strong className="text-blue-700">{linkedIssue?.newReading || "—"}</strong></span>
                            </div>
                            {(linkedIssue?.beforeImage || linkedIssue?.afterImage) && (
                              <div className="flex gap-3 text-xs pt-1 border-t border-slate-200">
                                {linkedIssue?.beforeImage && <a href={linkedIssue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Before Photo ↗</a>}
                                {linkedIssue?.afterImage && <a href={linkedIssue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">After Photo ↗</a>}
                              </div>
                            )}
                          </>
                        )}
                        {(isWODone || isCompleted) && (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[11px]">
                              <span>WO: <strong className="text-slate-800">{rep.workOrderNo || linkedIssue?.completionRef || "—"}</strong></span>
                              <span>Note Sheet: <strong className={rep.noteSheetNo ? "text-blue-700 font-bold" : "text-amber-600 font-normal"}>{rep.noteSheetNo || "Pending"}</strong></span>
                            </div>
                            {linkedIssue && (
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-200">
                                <span>Issue ID: <strong className="font-mono text-gray-700">{linkedIssue.issueId}</strong></span>
                                <span>Return: <strong className={linkedIssue.oldMeterReturnStatus === "returned" ? "text-emerald-700" : "text-amber-700"}>{linkedIssue.oldMeterReturnStatus === "returned" ? "Returned" : "Pending Return"}</strong></span>
                              </div>
                            )}
                            {(linkedIssue?.beforeImage || linkedIssue?.afterImage) && (
                              <div className="flex gap-3 text-xs pt-1 border-t border-slate-200">
                                {linkedIssue?.beforeImage && <a href={linkedIssue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Before Photo ↗</a>}
                                {linkedIssue?.afterImage && <a href={linkedIssue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">After Photo ↗</a>}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Collapsible Timeline Dropdown Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleTimeline(rep.replacementId)}
                        className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-800 py-1 bg-blue-50/50 hover:bg-blue-50 rounded border border-blue-100 flex items-center justify-center gap-1">
                        <span>{isExpanded ? "Hide Full Tracking Details" : "View Full Tracking Details"}</span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {/* Expanded Collapsible Tracking Details */}
                      {isExpanded && (
                        <div className="bg-slate-100/80 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5 text-slate-700 animate-in fade-in duration-200">
                          <p className="font-bold text-slate-900 border-b pb-1 text-[11px] uppercase tracking-wider">Full Tracking Details & History</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] pt-1">
                            <p><span className="text-gray-500">Proposed Date:</span> {rep.proposedDate || "—"}</p>
                            <p><span className="text-gray-500">Issued Date:</span> {linkedIssue?.issueDate || "—"}</p>
                            <p><span className="text-gray-500">Installed Date:</span> {linkedIssue?.completedAt || "—"}</p>
                            <p><span className="text-gray-500">WO Finalized:</span> {linkedIssue?.completedAt || "—"}</p>
                            <p><span className="text-gray-500">WO Number:</span> {rep.workOrderNo || "—"}</p>
                            <p><span className="text-gray-500">Note Sheet No:</span> {rep.noteSheetNo || "—"}</p>
                            <p><span className="text-gray-500">Old Meter Last Reading:</span> {linkedIssue?.lastReading || "0"}</p>
                            <p><span className="text-gray-500">New Meter Initial Reading:</span> {linkedIssue?.newReading || "—"}</p>
                            <p><span className="text-gray-500">Old Meter Return:</span> {linkedIssue?.oldMeterReturnStatus === "returned" ? "Returned" : "Pending"}</p>
                            <p><span className="text-gray-500">Agency:</span> {rep.agency || "—"}</p>
                          </div>
                          {rep.remarks && <p className="text-[11px] italic text-gray-600 pt-1 border-t">Remarks: "{rep.remarks}"</p>}
                        </div>
                      )}

                      {/* Action buttons designated by stage */}
                      {rep.status === "proposed" && (isAdmin || (permissions && permissions.meter_stock?.includes("issue"))) && (
                        <Button size="sm" className="w-full bg-slate-950 hover:bg-slate-900 text-white mt-2 font-semibold text-xs h-9"
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

                      {rep.status === "issued" && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center gap-2">
                            {!isAdmin ? (
                              <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                                onClick={() => {
                                  const targetIssue = linkedIssue || issues.find(i => i.issueId === rep.issueId || i.consumerId === rep.consumerId)
                                  if (targetIssue) {
                                    setSelected(targetIssue)
                                    setView("complete")
                                  } else {
                                    toast({ title: "Issue record not found for completion", variant: "destructive" })
                                  }
                                }}>
                                Mark Installed
                              </Button>
                            ) : (
                              <p className="flex-1 text-xs text-yellow-700 font-medium bg-yellow-50 border border-yellow-100 rounded px-2.5 py-1 text-center">
                                Pending installation by agency
                              </p>
                            )}
                            {isAdmin && (
                              <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2 border-yellow-300 text-yellow-800 hover:bg-yellow-100 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const item = linkedIssue || {
                                    issueId: rep.issueId || rep.replacementId,
                                    issueDate: rep.proposedDate || "",
                                    purpose: rep.purpose,
                                    consumerId: rep.consumerId,
                                    consumerName: rep.consumerName,
                                    serialNo: rep.serialNo || "",
                                    meterType: "Standard",
                                    agency: rep.agency,
                                    status: "issued"
                                  }
                                  printMeterSlip([item as any])
                                }}>
                                <Printer className="h-3.5 w-3.5 mr-1" /> Requisition
                              </Button>
                            )}
                          </div>
                          {isAdmin && (
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs font-semibold border-amber-300 text-amber-800 hover:bg-amber-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                const targetIssue = linkedIssue || issues.find(i => i.issueId === rep.issueId || i.consumerId === rep.consumerId)
                                if (targetIssue) {
                                  handleReturn(targetIssue)
                                } else {
                                  toast({ title: "Issue record not found to return meter", variant: "destructive" })
                                }
                              }}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Return Meter (Not Installed)
                            </Button>
                          )}
                        </div>
                      )}

                      {rep.status === "updated" && (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs text-blue-700 font-medium bg-blue-50 border border-blue-100 rounded px-2.5 py-1 text-center">
                            Installation done — awaiting WO finalization
                          </p>
                          {isAdmin && (
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs h-8"
                                onClick={() => {
                                  if (rep.issueId) {
                                    setSelectedForFinalize(new Set([rep.issueId]))
                                    setFinalizeRef(rep.workOrderNo || linkedIssue?.completionRef || "")
                                    setShowFinalizeModal(true)
                                  } else {
                                    toast({ title: "Issue record not linked for finalization" })
                                  }
                                }}>
                                <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Finalize & Add WO
                              </Button>
                              {linkedIssue && linkedIssue.oldMeterReturnStatus !== "returned" && (
                                <Button size="sm" variant="outline" className="text-xs h-8 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => {
                                    setSelectedForReturnOffice(linkedIssue)
                                    setReturnOfficeDialogOpen(true)
                                  }}>
                                  <PackageCheck className="h-3.5 w-3.5 mr-1" /> Meter Return
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {(isWODone || isCompleted) && (
                        <div className="flex gap-2 pt-1">
                          {isAdmin && (
                            <Button size="sm" variant="outline" className="flex-1 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 h-8"
                              onClick={() => {
                                if (linkedIssue) {
                                  setSelectedForNoteSheet(linkedIssue)
                                  setNoteSheetDialogOpen(true)
                                } else {
                                  toast({ title: "Issue record not found to attach Note Sheet" })
                                }
                              }}>
                              <FileText className="h-3.5 w-3.5 mr-1" /> {rep.noteSheetNo ? "Edit Note Sheet" : "+ Note Sheet"}
                            </Button>
                          )}
                          {linkedIssue && linkedIssue.oldMeterReturnStatus !== "returned" && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              onClick={() => {
                                setSelectedForReturnOffice(linkedIssue)
                                setReturnOfficeDialogOpen(true)
                              }}>
                              <PackageCheck className="h-3.5 w-3.5 mr-1" /> Meter Return
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Bulk Actions Bar for Replacements */}
      {(view === "replacement" || tab === "proposed") && repSubTab !== "all" && selectedForBulkRep.size > 0 && (() => {
        const selectedReps = Array.from(selectedForBulkRep).map(id => replacements.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
        const hasInstalled = selectedReps.some(r => r.status === "updated")
        const hasWODone = selectedReps.some(r => r.status === "replaced")
        const currentAgency = selectedReps[0]?.agency || ""

        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 flex-wrap justify-center">
            <span className="text-xs font-bold text-blue-400 pl-2">
              {selectedForBulkRep.size} selected {currentAgency ? `(${currentAgency})` : ""}
            </span>

            {/* In Installed tab or when installed items selected: show Bulk WO Finalize */}
            {(repSubTab === "installed" || (repSubTab !== "wo_done" && repSubTab !== "completed" && hasInstalled)) && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold h-8"
                onClick={() => {
                  const targetIssueIds = new Set<string>()
                  selectedForBulkRep.forEach(id => {
                    const rep = replacements.find(r => r.replacementId === id)
                    if (rep?.issueId) targetIssueIds.add(rep.issueId)
                  })
                  if (targetIssueIds.size > 0) {
                    setSelectedForFinalize(targetIssueIds)
                    setShowFinalizeModal(true)
                  } else {
                    toast({ title: "No linked issue records found for bulk WO finalization", variant: "destructive" })
                  }
                }}>
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Bulk Finalize & Add WO
              </Button>
            )}

            {/* In WO Done tab: show Bulk Note Sheet */}
            {(repSubTab === "wo_done" || (repSubTab !== "installed" && repSubTab !== "completed" && hasWODone)) && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8"
                onClick={() => {
                  const targetIssueIds = new Set<string>()
                  selectedForBulkRep.forEach(id => {
                    const rep = replacements.find(r => r.replacementId === id)
                    if (rep?.issueId) targetIssueIds.add(rep.issueId)
                  })
                  if (targetIssueIds.size > 0) {
                    setSelectedForBulkNoteSheet(targetIssueIds)
                    setBulkNoteSheetDialogOpen(true)
                  } else {
                    toast({ title: "No linked issue records found for bulk Note Sheet", variant: "destructive" })
                  }
                }}>
                <FileText className="h-3.5 w-3.5 mr-1" /> Bulk Note Sheet No
              </Button>
            )}

            {/* In Completed tab: show Bulk Meter Return */}
            {repSubTab === "completed" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8"
                onClick={() => {
                  const selectedReps = Array.from(selectedForBulkRep).map(id => replacements.find(r => r.replacementId === id)).filter(Boolean) as MeterReplacement[]
                  const firstIssue = issues.find(i => selectedReps.some(r => r.issueId === i.issueId || r.replacementId === i.issueId)) || null
                  if (firstIssue) {
                    setSelectedForReturnOffice(firstIssue)
                    setReturnOfficeDialogOpen(true)
                  } else {
                    toast({ title: "Select completed items to return to office", variant: "destructive" })
                  }
                }}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Bulk Meter Return
              </Button>
            )}

            <Button size="sm" variant="ghost" onClick={() => setSelectedForBulkRep(new Set())} className="text-xs text-gray-300 hover:text-white h-8">
              Clear Selection
            </Button>
          </div>
        )
      })()}

      {/* Pagination — only for paginated sub-modules */}
      {(view === "nsc" || view === "check" || view === "history") && !showReportPanel && totalPages > 1 && (
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

      {/* Sticky bottom — bulk finalize + Black-themed Issue Meter buttons */}
      {view !== "menu" && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto space-y-2">
            {isAdmin && selectedForFinalize.size > 0 && (
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white shadow-xl rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 py-3"
                onClick={() => setShowFinalizeModal(true)}>
                <ClipboardCheck className="h-5 w-5" /> Finalize {selectedForFinalize.size} Selected
              </Button>
            )}
            {view === "nsc" && (isAdmin || (permissions && (permissions.meter?.includes("create") || permissions.meter?.includes("issue") || permissions.meter_stock?.includes("issue")))) && (
              <div className="space-y-2">
                <Button
                  className="w-full bg-slate-950 hover:bg-slate-900 text-white shadow-2xl rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 py-3.5 border border-slate-800 transition-all hover:scale-[1.01]"
                  onClick={() => {
                    setPrefill({ purpose: "nsc", consumerId: "", consumerName: "", address: "", mobile: "", agency: "", replacementId: "" })
                    setView("issue")
                  }}>
                  <Plus className="h-5 w-5 text-emerald-400" /> Issue NSC Meter
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkNscModalOpen(true)}
                    className="w-full bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold hover:bg-emerald-100 shadow-md rounded-xl py-2.5 text-xs flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Bulk Upload NSC Issue
                  </Button>
                )}
              </div>
            )}
            {view === "check" && (isAdmin || (permissions && (permissions.meter?.includes("create") || permissions.meter?.includes("issue") || permissions.meter_stock?.includes("issue")))) && (
              <Button
                className="w-full bg-slate-950 hover:bg-slate-900 text-white shadow-2xl rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 py-3.5 border border-slate-800 transition-all hover:scale-[1.01]"
                onClick={() => {
                  setPrefill(null)
                  setView("issue")
                }}>
                <Plus className="h-5 w-5 text-purple-400" /> Issue Check Meter
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Note Sheet Bar */}
      {selectedForBulkNoteSheet.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto bg-slate-950 text-white p-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <FileText className="h-4 w-4 text-blue-400" />
              <span>{selectedForBulkNoteSheet.size} meter(s) selected for Note Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedForBulkNoteSheet(new Set())} className="text-xs text-slate-400 hover:text-white px-2 py-1">
                Clear
              </button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-8 rounded-xl" onClick={() => setBulkNoteSheetDialogOpen(true)}>
                <FileText className="h-3.5 w-3.5 mr-1" /> Set Note Sheet No
              </Button>
            </div>
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

      {/* Check Meter Dialog */}
      {selectedForCheckMeter && (
        <CheckMeterDialog
          issue={selectedForCheckMeter}
          isOpen={checkMeterDialogOpen}
          onClose={() => { setCheckMeterDialogOpen(false); setSelectedForCheckMeter(null) }}
          onSuccess={() => { toast({ title: "Check meter updated" }); load(true) }}
        />
      )}

      {/* Note Sheet Dialog */}
      {selectedForNoteSheet && (
        <NoteSheetDialog
          issueId={selectedForNoteSheet.issueId}
          replacementId={(selectedForNoteSheet as any).replacementId}
          currentNoteSheetNo={selectedForNoteSheet.noteSheetNo}
          workOrderNo={selectedForNoteSheet.completionRef || (selectedForNoteSheet as any).workOrderNo}
          isOpen={noteSheetDialogOpen}
          onClose={() => { setNoteSheetDialogOpen(false); setSelectedForNoteSheet(null) }}
          onSuccess={() => {
            toast({ title: "Note Sheet updated" })
            load(true)
            loadReplacements()
          }}
        />
      )}

      {/* Return to Office Dialog */}
      {selectedForReturnOffice && (
        <ReturnOfficeDialog
          issueId={selectedForReturnOffice.issueId}
          consumerName={selectedForReturnOffice.consumerName}
          consumerId={selectedForReturnOffice.consumerId}
          oldMeterNo={oldMeterMap[selectedForReturnOffice.consumerId] || ""}
          completedAt={selectedForReturnOffice.completedAt}
          isOpen={returnOfficeDialogOpen}
          onClose={() => { setReturnOfficeDialogOpen(false); setSelectedForReturnOffice(null) }}
          onSuccess={() => { toast({ title: "Returned meter logged at office" }); load(true) }}
        />
      )}

      {/* Bulk Note Sheet Dialog */}
      {bulkNoteSheetDialogOpen && (
        <NoteSheetDialog
          issueIds={Array.from(selectedForBulkNoteSheet)}
          replacementIds={Array.from(selectedForBulkNoteSheet)}
          isOpen={bulkNoteSheetDialogOpen}
          onClose={() => setBulkNoteSheetDialogOpen(false)}
          onSuccess={() => {
            toast({ title: `Note Sheet updated for ${selectedForBulkNoteSheet.size} meters` })
            setSelectedForBulkNoteSheet(new Set())
            load(true)
            loadReplacements()
          }}
        />
      )}
      {/* Bulk NSC Upload Modal */}
      <BulkNscUploadModal
        open={bulkNscModalOpen}
        onClose={() => setBulkNscModalOpen(false)}
        onSuccess={() => {
          load(true)
          fetch("/api/nsc")
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setNscApplications(data) })
            .catch(() => {})
        }}
      />
    </div>
  )
}

// ── Reports Panel ─────────────────────────────────────────────────────────────
function ReportsPanel({ 
  activeSubmodule,
  issues, 
  summary, 
  onExport,
  replacements,
  oldMeterMap,
  nscApplications = []
}: { 
  activeSubmodule?: View;
  issues: MeterIssue[]; 
  summary: StockSummary[]; 
  onExport: () => void;
  replacements: MeterReplacement[];
  oldMeterMap: Record<string, string>;
  nscApplications?: NSCApplication[];
}) {
  const { toast } = useToast()

  const [rptStartDate, setRptStartDate] = useState("")
  const [rptEndDate, setRptEndDate]     = useState("")
  const [rptAgency, setRptAgency]       = useState("all")
  const [rptPurpose, setRptPurpose]     = useState("all")
  const [rptStatus, setRptStatus]       = useState("all")

  // Filter issues strictly by active submodule context when present
  const targetIssuesForSubmodule = useMemo(() => {
    if (activeSubmodule === "replacement") {
      return issues.filter(i => i.purpose === "faulty_replacement" || i.purpose === "burnt_replacement")
    }
    if (activeSubmodule === "nsc") {
      return issues.filter(i => i.purpose === "nsc")
    }
    if (activeSubmodule === "check") {
      return issues.filter(i => i.purpose === "slow_fast")
    }
    return issues
  }, [issues, activeSubmodule])

  const reportAgencies = useMemo(() => {
    return Array.from(new Set(targetIssuesForSubmodule.map(i => i.agency).filter(Boolean))).sort()
  }, [targetIssuesForSubmodule])

  const reportPurposes = useMemo(() => {
    if (activeSubmodule === "replacement") {
      return [
        { value: "faulty_replacement", label: "Faulty / Defective" },
        { value: "burnt_replacement",  label: "Burnt Meter" },
      ]
    }
    return [
      { value: "faulty_replacement", label: "Faulty / Defective" },
      { value: "burnt_replacement",  label: "Burnt Meter" },
      { value: "slow_fast",          label: "Slow / Fast" },
      { value: "nsc",                label: "NSC" },
    ]
  }, [activeSubmodule])

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
    return targetIssuesForSubmodule.filter(i => {
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
        }
      }
      return true
    })
  }, [targetIssuesForSubmodule, rptStartDate, rptEndDate, rptAgency, rptPurpose, rptStatus])

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

  const totalIssued          = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "issued").length, [targetIssuesForSubmodule])
  const totalPendingFinal    = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installation_done").length, [targetIssuesForSubmodule])
  const totalInstalled       = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed").length, [targetIssuesForSubmodule])
  const totalReturned        = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "returned").length, [targetIssuesForSubmodule])

  const exportAgencyPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const pendingIssues = targetIssuesForSubmodule.filter(i => i.status === "issued" || i.status === "installation_done")
    
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

    const pendingIssues = targetIssuesForSubmodule.filter(i => i.status === "issued" || i.status === "installation_done")

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

  const installPendingCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "issued").length, [targetIssuesForSubmodule])
  const woPendingCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installation_done").length, [targetIssuesForSubmodule])
  const woCompletedCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed").length, [targetIssuesForSubmodule])
  const meterReturnPendingCount = useMemo(() => targetIssuesForSubmodule.filter(i => (i.status === "installed" || i.status === "installation_done") && i.oldMeterReturnStatus !== "returned").length, [targetIssuesForSubmodule])
  const noteSheetPendingCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed" && (!i.noteSheetNo || !i.noteSheetNo.trim())).length, [targetIssuesForSubmodule])
  const noteSheetCompletedCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed" && i.noteSheetNo && i.noteSheetNo.trim()).length, [targetIssuesForSubmodule])
  const completedCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed" && i.noteSheetNo && i.noteSheetNo.trim() && i.oldMeterReturnStatus === "returned").length, [targetIssuesForSubmodule])

  const nscProposedCount = useMemo(() => nscApplications.filter(a => a.status === "quotation_issued" || a.status === "project_done").length, [nscApplications])
  const nscIssuedCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "issued").length, [targetIssuesForSubmodule])
  const nscInstalledCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installation_done").length, [targetIssuesForSubmodule])
  const nscCompletedCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "installed").length, [targetIssuesForSubmodule])
  const nscWithheldCount = useMemo(() => targetIssuesForSubmodule.filter(i => i.status === "returned" || i.status === "withheld").length, [targetIssuesForSubmodule])

  const getCategoryFilteredIssues = (category: string) => {
    if (activeSubmodule === "nsc") {
      if (category === "nsc_proposed") {
        return nscApplications
          .filter(a => a.status === "quotation_issued" || a.status === "project_done")
          .map(app => ({
            issueId: app.receiveNo || app.applicationNo,
            issueDate: app.quotationDate || app.appliedDate || "",
            purpose: "nsc" as const,
            consumerId: app.applicationNo || app.receiveNo,
            nscReceiveNo: app.receiveNo,
            consumerName: app.applicantName,
            agency: app.agency || "Unassigned",
            serialNo: app.meterSerialNo || "Pending Meter Issue",
            meterType: app.phase || "Standard",
            status: "proposed" as any,
            address: app.verifyAddress || app.address,
            mobile: app.mobile,
            remarks: app.remarks || "Quotation Issued",
          } as MeterIssue))
      }
      if (category === "nsc_issued") return targetIssuesForSubmodule.filter(i => i.status === "issued")
      if (category === "nsc_installed") return targetIssuesForSubmodule.filter(i => i.status === "installation_done")
      if (category === "nsc_completed") return targetIssuesForSubmodule.filter(i => i.status === "installed")
      if (category === "nsc_withheld") return targetIssuesForSubmodule.filter(i => i.status === "returned" || i.status === "withheld")
      if (category === "nsc_all") return targetIssuesForSubmodule
    }
    let target = targetIssuesForSubmodule
    if (category === "install_pending") return target.filter(i => i.status === "issued")
    if (category === "wo_pending") return target.filter(i => i.status === "installation_done")
    if (category === "wo_completed") return target.filter(i => i.status === "installed")
    if (category === "meter_return_pending") return target.filter(i => (i.status === "installed" || i.status === "installation_done") && i.oldMeterReturnStatus !== "returned")
    if (category === "note_sheet_pending") return target.filter(i => i.status === "installed" && (!i.noteSheetNo || !i.noteSheetNo.trim()))
    if (category === "note_sheet_completed") return target.filter(i => i.status === "installed" && i.noteSheetNo && i.noteSheetNo.trim())
    if (category === "completed") return target.filter(i => i.status === "installed" && i.noteSheetNo && i.noteSheetNo.trim() && i.oldMeterReturnStatus === "returned")
    return target
  }

  const exportCategoryExcel = async (category: string, title: string) => {
    const XLSX = await loadXLSX()
    const wb = XLSX.utils.book_new()
    const targetIssues = getCategoryFilteredIssues(category)

    if (targetIssues.length === 0) {
      toast({ title: "No records found for this report", variant: "destructive" })
      return
    }

    const rows = targetIssues.map((i, idx) => {
      const rep = replacements.find(r => r.issueId === i.issueId || (r.consumerId === i.consumerId && r.status !== "proposed"))
      const oldMeter = rep?.oldMeterNo || oldMeterMap[i.consumerId] || ""

      let currentStage = "Installation Pending"
      if (i.status === "installation_done") currentStage = "WO Pending"
      else if (i.status === "installed") {
        if (i.noteSheetNo && i.noteSheetNo.trim() && i.oldMeterReturnStatus === "returned") currentStage = "Completed"
        else if (!i.noteSheetNo || !i.noteSheetNo.trim()) currentStage = "Note Sheet Pending"
        else if (i.oldMeterReturnStatus !== "returned") currentStage = "Meter Return Pending"
      }

      return {
        "S.No.": idx + 1,
        "Issue ID": i.issueId,
        "Consumer ID": i.consumerId,
        "Consumer Name": i.consumerName,
        "Mobile": i.mobile || "",
        "Address": i.address || "",
        "Agency Name": i.agency || "",
        "Purpose": PURPOSE_LABELS[i.purpose] || i.purpose,
        "Meter Type": i.meterType || "",
        "New Meter Serial": i.serialNo || "",
        "Old Meter No": oldMeter,
        "Work Order No": i.completionRef || "Pending",
        "Note Sheet No": i.noteSheetNo || "Pending",
        "Meter Return Status": i.oldMeterReturnStatus === "returned" ? "Returned" : "Pending Return",
        "Current Stage": currentStage,
        "Issue Date": i.issueDate || "",
        "Completion Date": i.completedAt || "",
        "Remarks": i.remarks || ""
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Report")
    XLSX.writeFile(wb, `${category}-full-details-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: `${title} Excel exported successfully` })
  }

  const exportCategoryPDF = async (category: string, title: string) => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    const targetIssues = getCategoryFilteredIssues(category)

    if (targetIssues.length === 0) {
      toast({ title: "No records found for this report", variant: "destructive" })
      return
    }

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    doc.setFontSize(14)
    doc.setTextColor(15, 23, 42)
    doc.text(`${title} (${targetIssues.length})`, pw / 2, 12, { align: "center" })

    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Records: ${targetIssues.length}`, pw / 2, 17, { align: "center" })

    const cols = ["#", "Issue ID", "Consumer ID", "Consumer Name", "Mobile", "Agency", "Purpose", "Meter Type", "New Serial", "Old Meter", "WO No", "Note Sheet", "Return Status"]

    const body = targetIssues.map((i, idx) => {
      const rep = replacements.find(r => r.issueId === i.issueId || (r.consumerId === i.consumerId && r.status !== "proposed"))
      const oldMeter = rep?.oldMeterNo || oldMeterMap[i.consumerId] || "—"
      return [
        idx + 1,
        i.issueId || "—",
        i.consumerId || "—",
        i.consumerName || "—",
        i.mobile || "—",
        i.agency || "—",
        PURPOSE_LABELS[i.purpose] || i.purpose,
        i.meterType || "—",
        i.serialNo || "—",
        oldMeter,
        i.completionRef || "Pending",
        i.noteSheetNo || "Pending",
        i.oldMeterReturnStatus === "returned" ? "Returned" : "Pending Return"
      ]
    })

    autoTable(doc, {
      startY: 22,
      head: [cols],
      body: body,
      styles: { fontSize: 7, font: "helvetica", cellPadding: 2, halign: "center" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        3: { halign: "left" },
        5: { halign: "left" },
      },
      theme: "grid"
    })

    doc.save(`${category}-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: `${title} PDF exported successfully` })
  }

  const purposeBreakdown = reportPurposes.map(p => ({
    ...p,
    issued:    targetIssuesForSubmodule.filter(i => i.purpose === p.value && i.status === "issued").length,
    pending:   targetIssuesForSubmodule.filter(i => i.purpose === p.value && i.status === "installation_done").length,
    installed: targetIssuesForSubmodule.filter(i => i.purpose === p.value && i.status === "installed").length,
    returned:  targetIssuesForSubmodule.filter(i => i.purpose === p.value && i.status === "returned").length,
    total:     targetIssuesForSubmodule.filter(i => i.purpose === p.value).length,
  }))

  const meterTypeBreakdown = Array.from(new Set(targetIssuesForSubmodule.map(i => i.meterType).filter(Boolean))).map(type => ({
    type,
    issued:    targetIssuesForSubmodule.filter(i => i.meterType === type && i.status === "issued").length,
    pending:   targetIssuesForSubmodule.filter(i => i.meterType === type && i.status === "installation_done").length,
    installed: targetIssuesForSubmodule.filter(i => i.meterType === type && i.status === "installed").length,
    returned:  targetIssuesForSubmodule.filter(i => i.meterType === type && i.status === "returned").length,
    total:     targetIssuesForSubmodule.filter(i => i.meterType === type).length,
  })).sort((a, b) => b.total - a.total)

  const agencyBreakdown = Array.from(new Set(targetIssuesForSubmodule.map(i => i.agency).filter(Boolean))).map(agency => {
    const agIssues = targetIssuesForSubmodule.filter(i => i.agency === agency)
    return {
      agency,
      totalIssued: agIssues.length,
      issued: agIssues.filter(i => i.status === "issued" || i.status === "installation_done" || i.status === "installed").length,
      pendingInstall: agIssues.filter(i => i.status === "issued").length,
      installed: agIssues.filter(i => i.status === "installation_done" || i.status === "installed").length,
      woDone: agIssues.filter(i => i.status === "installed" || Boolean(i.completionRef)).length,
      noteSheetDone: agIssues.filter(i => i.status === "installed" && i.noteSheetNo && i.noteSheetNo.trim()).length,
    }
  }).sort((a, b) => b.totalIssued - a.totalIssued)

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
      ["Total Issues Ever", targetIssuesForSubmodule.length],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary")
    // Meter type sheet
    const mtRows = [["Meter Type", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...meterTypeBreakdown.map(m => [m.type, m.issued, m.pending, m.installed, m.returned, m.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mtRows), "By Meter Type")
    // Agency sheet
    const agRows = [["Agency", "Total Assigned", "Pending Installation", "Installed", "Work Order Done", "Note Sheet Done"],
      ...agencyBreakdown.map(a => [a.agency, a.totalIssued, a.pendingInstall, a.installed, a.woDone, a.noteSheetDone])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agRows), "By Agency")
    // Raw issues sheet
    const rawRows = targetIssuesForSubmodule.map(i => ({
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

      {/* Agency Wise Pending Report Card (Primary Report) */}
      <div className="bg-white rounded-xl border-2 border-amber-300 shadow-md overflow-hidden p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Agency Pending Report</h3>
            <p className="text-xs text-gray-600 mt-0.5">Generate PDF or Excel containing full details of all pending meter installations & finalizations grouped by agency.</p>
          </div>
        </div>

        {/* Mini stats preview */}
        <div className="grid grid-cols-3 gap-2 text-center bg-amber-50 rounded-lg p-3 border border-amber-200 text-xs">
          <div>
            <p className="text-gray-600 font-medium">Pending Install</p>
            <p className="font-bold text-amber-700 text-xl mt-0.5">{totalIssued}</p>
          </div>
          <div>
            <p className="text-gray-600 font-medium">Pending Finalization</p>
            <p className="font-bold text-teal-700 text-xl mt-0.5">{totalPendingFinal}</p>
          </div>
          <div>
            <p className="text-gray-600 font-medium">Total Pending</p>
            <p className="font-bold text-slate-900 text-xl mt-0.5">{totalIssued + totalPendingFinal}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold w-full py-2.5" onClick={exportAgencyPendingPDF}>
            <FileDown className="h-4 w-4 mr-1.5 text-red-600" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold w-full py-2.5" onClick={exportAgencyPendingExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Meter type breakdown */}
      {activeSubmodule !== "replacement" && meterTypeBreakdown.length > 0 && (
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
          title="By Agency Breakdown"
          cols={[
            { key: "agency",         label: "Agency Name" },
            { key: "totalIssued",    label: "Total Assigned", className: "font-bold text-slate-900" },
            { key: "pendingInstall", label: "Pending Inst.", className: "text-amber-700 font-medium" },
            { key: "installed",      label: "Installed",     className: "text-blue-700 font-medium" },
            { key: "woDone",         label: "WO Done",       className: "text-teal-700 font-medium" },
            { key: "noteSheetDone",  label: "Note Sheet Done", className: "text-green-700 font-medium" },
          ]}
          rows={agencyBreakdown}
        />
      )}

      {/* ── Status Stage Detailed Reports Section ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="border-b pb-2">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Stage-wise Detailed Status Reports ({activeSubmodule === "nsc" ? "NSC Submodule" : "Full Details-wise"})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeSubmodule === "nsc"
              ? "Quick shareable PDF reports and full details Excel exports for every NSC stage."
              : "Quick shareable PDF reports and full details Excel exports for every stage of meter replacement."}
          </p>
        </div>

        {activeSubmodule === "nsc" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* 1. Proposed NSC Applications */}
            <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-purple-900">1. Proposed NSC Applications ({nscProposedCount})</p>
                <p className="text-[11px] text-purple-700 mt-0.5">Quotation issued, awaiting meter issue</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-purple-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("nsc_proposed", "Proposed NSC Applications Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-purple-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("nsc_proposed", "Proposed NSC Applications Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 2. Issued NSC Meters */}
            <div className="bg-yellow-50/70 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-yellow-900">2. Issued NSC Meters ({nscIssuedCount})</p>
                <p className="text-[11px] text-yellow-700 mt-0.5">Issued to agency, pending installation</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-yellow-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("nsc_issued", "Issued NSC Meters Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-yellow-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("nsc_issued", "Issued NSC Meters Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 3. Installed NSC Meters */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-900">3. Installed NSC Meters ({nscInstalledCount})</p>
                <p className="text-[11px] text-blue-700 mt-0.5">Installed by agency, pending connection effect</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-blue-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("nsc_installed", "Installed NSC Meters Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-blue-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("nsc_installed", "Installed NSC Meters Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 4. Connection Effected */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-900">4. Connection Effected ({nscCompletedCount})</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">Fully completed NSC connection</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("nsc_completed", "Connection Effected Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("nsc_completed", "Connection Effected Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 5. Withheld / Returned NSC Meters */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 flex items-center justify-between md:col-span-2">
              <div>
                <p className="text-xs font-bold text-amber-900">5. Withheld / Returned NSC Meters ({nscWithheldCount})</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Meters returned to stock or withheld</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-amber-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("nsc_withheld", "Withheld NSC Meters Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-amber-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("nsc_withheld", "Withheld NSC Meters Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* 1. Installation Pending Card */}
            <div className="bg-yellow-50/70 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-yellow-900">1. Installation Pending ({installPendingCount})</p>
                <p className="text-[11px] text-yellow-700 mt-0.5">Issued to agency, awaiting installation</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-yellow-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("install_pending", "Installation Pending Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-yellow-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("install_pending", "Installation Pending Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 2. WO Pending Card */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-900">2. Work Order (WO) Pending ({woPendingCount})</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Installation done, awaiting WO finalization</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-amber-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("wo_pending", "Work Order Pending Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-amber-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("wo_pending", "Work Order Pending Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 3. Work Order (WO) Completed Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-900">3. Work Order (WO) Completed ({woCompletedCount})</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">WO finalized & added</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("wo_completed", "Work Order Completed Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("wo_completed", "Work Order Completed Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 4. Meter Return Pending Card */}
            <div className="bg-orange-50/70 border border-orange-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-orange-900">4. Meter Return Pending ({meterReturnPendingCount})</p>
                <p className="text-[11px] text-orange-700 mt-0.5">Installed, old meter not returned to office</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-orange-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("meter_return_pending", "Meter Return Pending Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-orange-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("meter_return_pending", "Meter Return Pending Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 5. Note Sheet Pending Card */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-900">5. Note Sheet Pending ({noteSheetPendingCount})</p>
                <p className="text-[11px] text-blue-700 mt-0.5">WO finalized, awaiting Note Sheet No entry</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-blue-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("note_sheet_pending", "Note Sheet Pending Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-blue-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("note_sheet_pending", "Note Sheet Pending Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 6. Note Sheet Completed Card */}
            <div className="bg-cyan-50/70 border border-cyan-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-cyan-900">6. Note Sheet Completed ({noteSheetCompletedCount})</p>
                <p className="text-[11px] text-cyan-700 mt-0.5">Note Sheet attached & completed</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-cyan-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("note_sheet_completed", "Note Sheet Completed Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-cyan-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("note_sheet_completed", "Note Sheet Completed Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>

            {/* 7. Fully Completed Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between md:col-span-2">
              <div>
                <p className="text-xs font-bold text-emerald-900">7. Fully Completed ({completedCount})</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">Both WO & Note Sheet done, old meter returned</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Shareable PDF"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-red-50 hover:border-red-300"
                  onClick={() => exportCategoryPDF("completed", "Completed Meters Report")}>
                  <FileDown className="h-4 w-4 text-red-600" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Download Excel Sheet"
                  className="h-8 w-8 p-0 bg-white border-emerald-300 hover:bg-green-50 hover:border-green-300"
                  onClick={() => exportCategoryExcel("completed", "Completed Meters Report")}>
                  <FileSpreadsheet className="h-4 w-4 text-green-700" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export All Master */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-full">
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-10 font-semibold text-xs truncate" onClick={() => exportCategoryPDF(activeSubmodule === "nsc" ? "nsc_all" : "all_full", activeSubmodule === "nsc" ? "NSC Master Report" : "All Meters Master Report")}>
          <FileDown className="h-4 w-4 mr-1.5 shrink-0" /> Master Report (PDF)
        </Button>
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 font-semibold text-xs truncate" onClick={() => exportCategoryExcel(activeSubmodule === "nsc" ? "nsc_all" : "all_full", activeSubmodule === "nsc" ? "NSC Master Report" : "All Meters Master Report")}>
          <FileSpreadsheet className="h-4 w-4 mr-1.5 shrink-0" /> Master Report (Excel)
        </Button>
      </div>
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


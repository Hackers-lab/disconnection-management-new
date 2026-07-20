"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { DTRPaintingForm } from "@/components/dtr-painting-form"
import { NearbyDtrMap } from "@/components/nearby-dtr-map"
import type { DTRRecord } from "@/lib/dtr-service"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  Filter,
  RadioTower,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Brush,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Eye,
  History,
  Building2,
  X,
  Camera,
  SlidersHorizontal,
  FileDown,
  FileSpreadsheet,
  MoreVertical,
  BarChart3
} from "lucide-react"

function getGoogleDriveDirectLink(url: string): string {
  if (!url) return ""
  if (url.includes("drive.google.com")) {
    let fileId = ""
    if (url.includes("/file/d/")) {
      const parts = url.split("/file/d/")
      if (parts[1]) fileId = parts[1].split("/")[0]
    } else if (url.includes("id=")) {
      const match = url.match(/[?&]id=([^&]+)/)
      if (match && match[1]) fileId = match[1]
    }
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return url
}

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
}

type TabType = "all" | "pending" | "completed" | "reports"
type SyncState = "idle" | "loading" | "updated"
const CACHE_KEY = "dtr_data_cache"

interface DTRHistoryEntry {
  timestamp: string
  dtrCode: string
  feederName: string
  painting: string
  kiosk: string
  la: string
  ne: string
  loadCurrents: string
  verifiedBy: string
  remarks: string
  imageUrl: string
  locationName: string
}

export function DTRPaintingList({ userRole, userAgencies = [], username, agencies = [], permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<TabType>("pending")
  const [search, setSearch] = useState("")
  const [selectedFeeder, setSelectedFeeder] = useState<string>("all")
  const [selectedPainting, setSelectedPainting] = useState<string>("all")
  const [selectedAgency, setSelectedAgency] = useState<string>("all")
  
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedDtr, setSelectedDtr] = useState<DTRRecord | null>(null)
  const [viewingDtr, setViewingDtr] = useState<DTRRecord | null>(null)
  const [dtrHistory, setDtrHistory] = useState<DTRHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showAgencyReport, setShowAgencyReport] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  
  const PAGE_SIZE = 15
  const isPainter = userRole === "painter"
  const isAgency = userRole === "agency"
  const isAdmin = userRole === "admin"
  const isExecutive = userRole === "executive"
  const isViewer = userRole === "viewer"
  const isRestricted = !isAdmin && !isExecutive && !isViewer

  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      // Try cache
      const cached = await getFromCache<DTRRecord[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setRecords(cached)
        if (!silent) setSyncState("idle")
      }
      
      // Fetch fresh
      const res = await fetch("/api/dtr")
      if (!res.ok) throw new Error()
      const data: DTRRecord[] = await res.json()
      setRecords(data)
      await saveToCache(CACHE_KEY, data)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 2500)
    } catch (e) {
      setSyncState("idle")
      if (!silent) {
        toast({
          title: "Failed to load DTR list",
          description: "Could not fetch data from Google Sheets.",
          variant: "destructive"
        })
      }
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Listen to actions dispatched from global header
  useEffect(() => {
    const handleAction = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.action === "refresh") {
        load()
      } else if (customEvent.detail?.action === "report") {
        setShowAgencyReport(true)
      }
    }
    window.addEventListener("dtr-painting-action", handleAction)
    return () => window.removeEventListener("dtr-painting-action", handleAction)
  }, [])

  // Load history logs whenever a DTR is selected for viewing
  useEffect(() => {
    async function getHistory() {
      if (!viewingDtr) return
      setLoadingHistory(true)
      setDtrHistory([])
      try {
        const resp = await fetch(`/api/dtr/history?dtrCode=${encodeURIComponent(viewingDtr.dtrCode)}`)
        if (resp.ok) {
          const list = await resp.json()
          setDtrHistory(list)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingHistory(false)
      }
    }
    getHistory()
  }, [viewingDtr])

  // Unique list of feeders for selecting/filtering
  const feeders = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => {
      if (r.feederName) set.add(r.feederName.trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [records])

  // Unique list of painting agencies for admins to filter
  const paintingAgencies = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => {
      if (r.paintingAgency) set.add(r.paintingAgency.trim())
    })
    return Array.from(set).sort()
  }, [records])

  // Stats computation
  const stats = useMemo(() => {
    let list = records
    
    // If restricted user (agency, painter), only calculate stats of their assigned DTRs
    if (isRestricted && userAgencies.length > 0) {
      list = list.filter(r => 
        userAgencies.some(ag => (r.paintingAgency || "").toLowerCase().trim() === ag.toLowerCase().trim())
      )
    }

    const total = list.length
    const completed = list.filter(r => (r.painting || "").toLowerCase() === "done").length
    const pending = total - completed
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pending, progress }
  }, [records, isRestricted, userAgencies])

  // Filtering
  const filtered = useMemo(() => {
    let result = records

    // If user is from agency/restricted, filter list so they only see DTRs assigned to their agency
    if (isRestricted && userAgencies.length > 0) {
      result = result.filter(r => 
        userAgencies.some(ag => (r.paintingAgency || "").toLowerCase().trim() === ag.toLowerCase().trim())
      )
    }
    
    // Status Tab Filter
    if (tab === "pending") {
      result = result.filter(r => (r.painting || "").toLowerCase() !== "done")
    } else if (tab === "completed") {
      result = result.filter(r => (r.painting || "").toLowerCase() === "done")
    }

    // Feeder Filter
    if (selectedFeeder !== "all") {
      result = result.filter(r => (r.feederName || "").trim().toUpperCase() === selectedFeeder)
    }

    // Painting Agency Filter (Admin only)
    if (isAdmin && selectedAgency !== "all") {
      result = result.filter(r => (r.paintingAgency || "").trim().toLowerCase() === selectedAgency.toLowerCase())
    }

    // Search Query
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.dtrCode.toLowerCase().includes(q) ||
        r.feederName.toLowerCase().includes(q) ||
        r.locationName.toLowerCase().includes(q) ||
        (r.paintingAgency || "").toLowerCase().includes(q)
      )
    }

    return result
  }, [records, tab, selectedFeeder, selectedAgency, search, isRestricted, userAgencies, isAdmin])

  // Agency report counts
  const agencyStats = useMemo(() => {
    const map: Record<string, { total: number; done: number; pending: number }> = {}
    
    records.forEach(r => {
      const ag = r.paintingAgency ? r.paintingAgency.trim() : "Unassigned"
      if (!map[ag]) {
        map[ag] = { total: 0, done: 0, pending: 0 }
      }
      map[ag].total++
      if ((r.painting || "").toLowerCase() === "done") {
        map[ag].done++
      } else {
        map[ag].pending++
      }
    })

    return Object.entries(map).map(([agencyName, count]) => ({
      agency: agencyName,
      ...count,
      pct: count.total > 0 ? Math.round((count.done / count.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct)
  }, [records])

  const exportAgencyPendingPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const pendingDTRs = records.filter(r => (r.painting || "").toLowerCase() !== "done")
    
    // Sort by agency then dtrCode
    const sortedDTRs = [...pendingDTRs].sort((a, b) => {
      const agComp = (a.paintingAgency || "").localeCompare(b.paintingAgency || "")
      if (agComp !== 0) return agComp
      return (a.dtrCode || "").localeCompare(b.dtrCode || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Title / Header
    doc.setFontSize(16)
    doc.setTextColor(30, 41, 59)
    doc.text("Agency-wise Pending DTR Painting Report", pw / 2, 14, { align: "center" })
    
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending DTRs: ${pendingDTRs.length}`,
      pw / 2, 20, { align: "center" }
    )

    // Summary table
    const summaryRows = agencyStats.map((row, idx) => [
      idx + 1,
      row.agency,
      row.total,
      row.done,
      row.pending,
      `${row.pct}%`
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Painting Agency", "Assigned DTRs", "Painting Completed", "Painting Pending", "Progress Rate"]],
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

    const cols = ["#", "DTR Code", "Feeder Name", "Capacity (kVA)", "Landmark / Location", "Painting Agency", "GPS Status"]
    const body = sortedDTRs.map((r, idx) => [
      idx + 1,
      r.dtrCode || "-",
      r.feederName || "-",
      r.kvCapacity || "-",
      r.locationName || "-",
      r.paintingAgency || "Unassigned",
      r.latlong ? "Available" : "Missing GPS"
    ])

    autoTable(doc, {
      startY: startY + 3,
      head: [cols],
      body: body,
      styles: { fontSize: 8, font: "helvetica", cellPadding: 2.5 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 30 },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { cellWidth: 90 },
        5: { cellWidth: 45 },
        6: { cellWidth: 30 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      },
      theme: "grid"
    })

    doc.save(`agency-wise-pending-dtr-painting-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "PDF Report downloaded" })
  }

  const exportAgencyPendingExcel = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary Sheet
    const summaryRows = [
      ["Agency-wise DTR Painting Progress Summary"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["Painting Agency", "Assigned DTRs", "Painting Completed", "Painting Pending", "Progress Rate"]
    ]

    agencyStats.forEach(row => {
      summaryRows.push([
        row.agency,
        row.total.toString(),
        row.done.toString(),
        row.pending.toString(),
        `${row.pct}%`
      ])
    })

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, "Painting Summary")

    // Sheet 2: Detailed Pending Sheet
    const pendingDTRs = records.filter(r => (r.painting || "").toLowerCase() !== "done")
    const sortedDTRs = [...pendingDTRs].sort((a, b) => {
      const agComp = (a.paintingAgency || "").localeCompare(b.paintingAgency || "")
      if (agComp !== 0) return agComp
      return (a.dtrCode || "").localeCompare(b.dtrCode || "")
    })

    const detailRows = sortedDTRs.map(r => ({
      "DTR Code": r.dtrCode,
      "Feeder Name": r.feederName,
      "Capacity (kVA)": r.kvCapacity || "",
      "Landmark / Location": r.locationName,
      "Supply Office": r.supplyOffice || "",
      "Painting Agency": r.paintingAgency || "Unassigned",
      "GPS Coordinates": r.latlong || "Missing GPS"
    }))

    const wsDetails = XLSX.utils.json_to_sheet(detailRows)
    XLSX.utils.book_append_sheet(wb, wsDetails, "Pending Details")

    XLSX.writeFile(wb, `agency-wise-pending-dtr-painting-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Excel Report downloaded" })
  }

  const exportAgencyCompletedPDF = async () => {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const completedDTRs = records.filter(r => (r.painting || "").toLowerCase() === "done")
    
    // Sort by agency then dtrCode
    const sortedDTRs = [...completedDTRs].sort((a, b) => {
      const agComp = (a.paintingAgency || "").localeCompare(b.paintingAgency || "")
      if (agComp !== 0) return agComp
      return (a.dtrCode || "").localeCompare(b.dtrCode || "")
    })

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    // Title / Header
    doc.setFontSize(16)
    doc.setTextColor(30, 41, 59)
    doc.text("Agency-wise Completed DTR Painting Report", pw / 2, 14, { align: "center" })
    
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Completed DTRs: ${completedDTRs.length}`,
      pw / 2, 20, { align: "center" }
    )

    // Summary table
    const summaryRows = agencyStats.map((row, idx) => [
      idx + 1,
      row.agency,
      row.total,
      row.done,
      row.pending,
      `${row.pct}%`
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "Painting Agency", "Assigned DTRs", "Painting Completed", "Painting Pending", "Progress Rate"]],
      body: summaryRows,
      styles: { fontSize: 8.5, font: "helvetica", halign: "center", cellPadding: 3 },
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
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
    doc.setTextColor(30, 41, 59)
    doc.text("Detailed Completed List (Grouped by Agency)", 14, startY)

    const cols = ["#", "DTR Code", "Feeder Name", "Capacity (kVA)", "Landmark / Location", "Painting Agency", "Verified By", "Verified At", "Remarks"]
    const body = sortedDTRs.map((r, idx) => [
      idx + 1,
      r.dtrCode || "-",
      r.feederName || "-",
      r.kvCapacity || "-",
      r.locationName || "-",
      r.paintingAgency || "Unassigned",
      r.verifiedBy || "-",
      r.verifiedAt || "-",
      r.remarks || "-"
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
        2: { cellWidth: 35 },
        3: { cellWidth: 20 },
        4: { cellWidth: 70 },
        5: { cellWidth: 35 },
        6: { cellWidth: 25 },
        7: { cellWidth: 25 },
        8: { cellWidth: 30 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10)
      },
      theme: "grid"
    })

    doc.save(`agency-wise-completed-dtr-painting-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "Completed PDF Report downloaded" })
  }

  const exportAgencyCompletedExcel = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary Sheet
    const summaryRows = [
      ["Agency-wise DTR Painting Progress Summary"],
      [`Generated on: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["Painting Agency", "Assigned DTRs", "Painting Completed", "Painting Pending", "Progress Rate"]
    ]

    agencyStats.forEach(row => {
      summaryRows.push([
        row.agency,
        row.total.toString(),
        row.done.toString(),
        row.pending.toString(),
        `${row.pct}%`
      ])
    })

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, "Painting Summary")

    // Sheet 2: Detailed Completed Sheet
    const completedDTRs = records.filter(r => (r.painting || "").toLowerCase() === "done")
    const sortedDTRs = [...completedDTRs].sort((a, b) => {
      const agComp = (a.paintingAgency || "").localeCompare(b.paintingAgency || "")
      if (agComp !== 0) return agComp
      return (a.dtrCode || "").localeCompare(b.dtrCode || "")
    })

    const detailRows = sortedDTRs.map(r => ({
      "DTR Code": r.dtrCode,
      "Feeder Name": r.feederName,
      "Capacity (kVA)": r.kvCapacity || "",
      "Landmark / Location": r.locationName,
      "Supply Office": r.supplyOffice || "",
      "Painting Agency": r.paintingAgency || "Unassigned",
      "Verified By": r.verifiedBy || "",
      "Verified At": r.verifiedAt || "",
      "Remarks": r.remarks || "",
      "Painting Image Link": r.paintingImage || ""
    }))

    const wsDetails = XLSX.utils.json_to_sheet(detailRows)
    XLSX.utils.book_append_sheet(wb, wsDetails, "Completed Details")

    XLSX.writeFile(wb, `agency-wise-completed-dtr-painting-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Completed Excel Report downloaded" })
  }

  // Pagination
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, tab, selectedFeeder, selectedAgency])

  if (selectedDtr) {
    return (
      <DTRPaintingForm
        dtr={selectedDtr}
        username={username}
        userRole={userRole}
        onSave={() => {
          setSelectedDtr(null)
          load(true)
          toast({
            title: "Painting Updated",
            description: `DTR ${selectedDtr.dtrCode} painting status updated successfully.`
          })
        }}
        onCancel={() => setSelectedDtr(null)}
      />
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-8 pb-20">
      
      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">DTR Painting</h1>
          <Badge variant="outline" className="bg-white border-gray-200 py-1 px-2.5">
            {syncState === "loading" && <Loader2 className="h-3 w-3 animate-spin mr-1.5 text-blue-600" />}
            {syncState === "updated" && <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-600" />}
            {syncState === "idle" && <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mr-2" />}
            {syncState === "loading" ? "Syncing..." : syncState === "updated" ? "Updated" : "Idle"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {tab === "reports" ? (
            <Button
              variant="outline"
              onClick={() => setTab("pending")}
              className="h-10 rounded-xl text-slate-700 border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="h-4 w-4 text-blue-600" /> Back to List
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl p-1 bg-white border border-slate-200 shadow-lg z-50">
                <DropdownMenuItem
                  onClick={() => setTab("reports")}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                >
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span>Painting Reports</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {tab === "reports" ? (
        <DTRPaintingReports
          records={records}
          agencyStats={agencyStats}
          exportAgencyPendingPDF={exportAgencyPendingPDF}
          exportAgencyPendingExcel={exportAgencyPendingExcel}
          exportAgencyCompletedPDF={exportAgencyCompletedPDF}
          exportAgencyCompletedExcel={exportAgencyCompletedExcel}
          userRole={userRole}
          userAgencies={userAgencies}
        />
      ) : (
        <>
          {/* Filter and Control Bar */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        {/* Row 1: Search and Filters toggle button */}
        <div className="flex gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by Code, Feeder, Landmark..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-white border-slate-200"
            />
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
            className={`h-11 w-11 p-0 rounded-xl flex items-center justify-center ${
              showFilters 
                ? "bg-slate-900 text-white hover:bg-slate-800" 
                : "text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Row 2: Collapsible Filters */}
        {showFilters && (
          <div className="flex gap-3 pt-3 border-t border-slate-100 flex-wrap animate-in slide-in-from-top-2 duration-200">
            {/* Status Select */}
            <div className="flex flex-col gap-1 w-full sm:w-48">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Painting Status</span>
              <Select value={tab} onValueChange={(val: any) => { setTab(val); setShowMap(false); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transformers</SelectItem>
                  <SelectItem value="pending">Pending Painting</SelectItem>
                  <SelectItem value="completed">Painting Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Feeder Select */}
            <div className="flex flex-col gap-1 w-full sm:w-48">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feeder Name</span>
              <Select value={selectedFeeder} onValueChange={setSelectedFeeder}>
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="All Feeders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Feeders</SelectItem>
                  {feeders.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Row 3: Locate Nearby DTR Button */}
        <Button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={`w-full h-12 rounded-xl font-extrabold flex items-center justify-center gap-2 text-sm shadow-md transition-all duration-300 transform hover:scale-[1.01] bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-750 text-white`}
        >
          <MapPin className="h-4.5 w-4.5 animate-bounce" />
          {showMap ? "Hide Navigation Radar" : "Locate Nearby DTR"}
        </Button>

        {/* Row 4: Compact Progress Bar */}
        <div className="pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="font-semibold text-slate-700">Painting Progress:</span>
            <span className="font-bold text-slate-900">{stats.completed}</span>
            <span>of</span>
            <span className="font-bold text-slate-900">{stats.total}</span>
            <span>completed ({stats.progress}%)</span>
          </div>
          <div className="w-full sm:w-64 bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-green-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${stats.progress}%` }} 
            />
          </div>
        </div>

      </div>

      {/* Main List */}
      {paginated.length === 0 ? (
        <div className="bg-white border rounded-2xl py-20 text-center text-gray-400">
          <Brush className="h-12 w-12 mx-auto text-gray-300 mb-3 animate-bounce" />
          <p className="text-base font-medium">No painting rows assigned or matched</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map(r => {
            const isPainted = (r.painting || "").toLowerCase() === "done"
            
            return (
              <Card 
                key={r.dtrCode} 
                className={`overflow-hidden shadow-md hover:shadow-lg transition-all relative border flex flex-col justify-between ${
                  isPainted ? "border-green-150" : "border-gray-200"
                }`}
              >
                <div>
                  {/* Visual Status Indicator */}
                  <div className={`h-1 w-full absolute top-0 left-0 ${isPainted ? "bg-green-500" : "bg-orange-400"}`} />

                  <CardHeader className="pb-2 p-5 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono font-semibold">DTR CODE</span>
                      <h3 className="font-bold font-mono text-gray-900 text-lg leading-tight truncate">{r.dtrCode}</h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">{r.feederName}</p>
                    </div>
                    
                    {isPainted ? (
                      <Badge className="bg-green-50 text-green-700 hover:bg-green-50 border border-green-200 font-medium rounded-lg">
                        Completed
                      </Badge>
                    ) : (
                      <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50 border border-orange-200 font-medium rounded-lg">
                        Painting Pending
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="px-5 pb-5 pt-0 space-y-3 text-xs">
                    {/* Landmark */}
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Landmark / Location</span>
                      <p className="text-xs text-gray-700 line-clamp-1" title={r.locationName}>
                        {r.locationName || "—"}
                      </p>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t pt-2.5">
                      <div>
                        <span className="text-gray-400 block text-[9px]">Rating Capacity</span>
                        <strong className="text-gray-800 font-semibold">{r.kvCapacity ? `${r.kvCapacity} kVA` : "—"}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px]">Painting Agency</span>
                        <strong className="text-indigo-700 font-bold truncate block" title={r.paintingAgency}>{r.paintingAgency || "—"}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px]">GPS Coordinates</span>
                        {r.latlong ? (
                          <span className="text-gray-750 font-mono text-[10px] truncate block" title={r.latlong}>
                            {r.latlong}
                          </span>
                        ) : (
                          <span className="text-red-500 font-medium">Missing GPS</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="px-5 pb-5 pt-0 mt-auto flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => setViewingDtr(r)} 
                    className="flex-1 h-9 rounded-xl text-slate-700 border-slate-200 text-xs flex items-center justify-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </Button>
                  
                  {isAdmin || !isPainted ? (
                    <Button 
                      onClick={() => setSelectedDtr(r)} 
                      className="flex-[1.2] h-9 rounded-xl transition text-xs font-semibold bg-slate-950 hover:bg-slate-900 text-white shadow-sm"
                    >
                      Update Painting
                    </Button>
                  ) : (
                    <Button 
                      disabled
                      className="flex-[1.2] h-9 rounded-xl text-xs font-semibold bg-slate-100 text-slate-400 border cursor-not-allowed"
                    >
                      Locked / Completed
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4 border-t flex-wrap gap-4">
          <p className="text-sm text-gray-500">
            Showing <strong className="font-semibold">{((currentPage - 1) * PAGE_SIZE) + 1}</strong> to{" "}
            <strong className="font-semibold">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of{" "}
            <strong className="font-semibold">{filtered.length}</strong> items
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="h-10 w-10 p-0 rounded-xl"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1
              if (p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1) {
                return (
                  <Button
                    key={p}
                    variant={currentPage === p ? "default" : "outline"}
                    onClick={() => setCurrentPage(p)}
                    className={`h-10 w-10 rounded-xl ${
                      currentPage === p 
                        ? "bg-blue-600 hover:bg-blue-700 text-white" 
                        : "text-gray-650"
                    }`}
                  >
                    {p}
                  </Button>
                )
              } else if (p === 2 || p === totalPages - 1) {
                return <span key={p} className="self-center px-1 text-gray-400 font-bold">...</span>
              }
              return null
            })}
            <Button
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="h-10 w-10 p-0 rounded-xl"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

        </>
      )}

      {/* POPUP MODAL 1: VIEW DETAILS DIALOG (Radix compliance fixes) */}
      <Dialog open={viewingDtr !== null} onOpenChange={(open) => !open && setViewingDtr(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
          {viewingDtr && (
            <div>
              <DialogHeader className="bg-slate-900 text-white p-5 sticky top-0 z-40 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-slate-800 rounded-xl">
                    <RadioTower className="h-5 w-5 text-indigo-400" />
                  </span>
                  <div>
                    <DialogTitle className="text-base font-bold text-white tracking-tight">DTR Painting & Asset details</DialogTitle>
                    <DialogDescription className="text-[11px] text-slate-400 font-mono mt-0.5">Transformer Asset ID: {viewingDtr.dtrCode}</DialogDescription>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingDtr(null)} 
                  className="text-slate-400 hover:text-white transition p-1.5 hover:bg-slate-800 rounded-lg mr-6"
                >
                  <X className="h-5 w-5" />
                </button>
              </DialogHeader>

              {/* Modal Content */}
              <div className="p-6 space-y-6 text-slate-900">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Left: General Spec */}
                  <div className="md:col-span-2 space-y-5">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Asset Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block">Reference Feeder</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.feederName || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Reference Capacity</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.kvCapacity ? `${viewingDtr.kvCapacity} kVA` : "—"}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400 block">Location Landmark</span>
                          <strong className="text-slate-800 text-sm block">{viewingDtr.locationName || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Supply Office Section</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.supplyOffice || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Painting Agency</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.paintingAgency || "None / Unassigned"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Audit Agency</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.auditAgency || "None / Unassigned"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Painting Status</span>
                          <span className={`inline-flex items-center gap-1.5 font-bold mt-1 ${viewingDtr.painting === "Done" ? "text-green-600" : "text-orange-600"}`}>
                            <Brush className="h-3.5 w-3.5" />
                            {viewingDtr.painting === "Done" ? "Painted" : "Pending"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Audit Logs & Remarks</h3>
                      <div className="grid grid-cols-2 gap-4 pb-2 border-b">
                        <div>
                          <span className="text-slate-400 block">Audited / Updated By</span>
                          <strong className="text-slate-700">{viewingDtr.verifiedBy || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Audit Date & Time</span>
                          <strong className="text-slate-700">{viewingDtr.verifiedAt || "—"}</strong>
                        </div>
                      </div>
                      <div className="pt-2">
                        <span className="text-slate-400 block">Remarks</span>
                        <p className="text-slate-600 mt-1 italic leading-relaxed">{viewingDtr.remarks || "No comments entered."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Map and Image */}
                  <div className="space-y-5">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Painting Photographic Evidence</h3>
                      {viewingDtr.paintingImage ? (
                        <div className="rounded-xl overflow-hidden border max-h-48 flex items-center justify-center bg-white shadow-sm">
                          <img 
                            src={getGoogleDriveDirectLink(viewingDtr.paintingImage)} 
                            alt="DTR evidence" 
                            className="max-h-48 object-contain cursor-pointer" 
                            onClick={() => window.open(viewingDtr.paintingImage, "_blank")}
                          />
                        </div>
                      ) : (
                        <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                          <Camera className="h-8 w-8 mx-auto opacity-35 mb-1.5" /> No image proof uploaded
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">GPS Location Mapping</h3>
                      {viewingDtr.latlong ? (
                        <div className="space-y-2">
                          <iframe
                            title="Modal DTR Map"
                            width="100%"
                            height="160"
                            className="rounded-xl border shadow-sm"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(viewingDtr.latlong)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                            loading="lazy"
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full text-xs flex items-center justify-center gap-1.5"
                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(viewingDtr.latlong)}`, "_blank")}
                          >
                            <MapPin className="h-3.5 w-3.5 text-red-500" /> Open in Google Maps
                          </Button>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                          <MapPin className="h-8 w-8 mx-auto opacity-35 mb-1.5" /> GPS Coordinates Unavailable
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* DTR History logs */}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <History className="h-4.5 w-4.5 text-slate-500" /> DTR Audit Log History
                  </h3>
                  
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      Loading logs from Sheets...
                    </div>
                  ) : dtrHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4">No historical updates logged for this asset.</p>
                  ) : (
                    <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-4 max-h-48 overflow-y-auto">
                      {dtrHistory.map((h, idx) => (
                        <div key={idx} className="relative text-xs">
                          <span className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border border-white bg-blue-500" />
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                            <span>{h.timestamp}</span>
                            <span className="font-semibold">By: {h.verifiedBy}</span>
                          </div>
                          <p className="font-bold text-slate-800 mt-0.5">
                            Feeder: {h.feederName} | Status: {h.painting}
                          </p>
                          {h.remarks && <p className="text-[10px] text-slate-400 italic mt-0.5">Remarks: {h.remarks}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>



      {/* POPUP MODAL 3: NEARBY DTR MAP RADAR */}
      <Dialog open={showMap} onOpenChange={setShowMap}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 rounded-2xl overflow-hidden border bg-white text-slate-900">
          <DialogHeader className="sr-only">
            <DialogTitle>Nearby DTR Radar</DialogTitle>
            <DialogDescription>Interactive map showing distribution transformers nearby using GPS coordinates.</DialogDescription>
          </DialogHeader>
          <NearbyDtrMap records={filtered} onClose={() => setShowMap(false)} />
        </DialogContent>
      </Dialog>

    </div>
  )
}

interface ReportsProps {
  records: DTRRecord[]
  agencyStats: any[]
  exportAgencyPendingPDF: () => void
  exportAgencyPendingExcel: () => void
  exportAgencyCompletedPDF: () => void
  exportAgencyCompletedExcel: () => void
  userRole: string
  userAgencies: string[]
}

function DTRPaintingReports({
  records,
  agencyStats,
  exportAgencyPendingPDF,
  exportAgencyPendingExcel,
  exportAgencyCompletedPDF,
  exportAgencyCompletedExcel,
  userRole,
  userAgencies
}: ReportsProps) {
  const isRestricted = !["admin", "executive", "viewer"].includes(userRole)
  
  // Filter records based on role if restricted
  const scopedRecords = useMemo(() => {
    if (isRestricted && userAgencies.length > 0) {
      return records.filter(r => 
        userAgencies.some(ag => (r.paintingAgency || "").toLowerCase().trim() === ag.toLowerCase().trim())
      )
    }
    return records
  }, [records, isRestricted, userAgencies])

  const total = scopedRecords.length
  const completed = scopedRecords.filter(r => (r.painting || "").toLowerCase() === "done").length
  const pending = total - completed
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  const StatCard = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
    <div className={`rounded-2xl p-5 border bg-white shadow-sm hover:shadow-md transition-shadow ${color}`}>
      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-extrabold mt-2 text-slate-900">{value}</p>
    </div>
  )

  const Table = ({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) => (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-slate-50/50">
        <p className="font-bold text-gray-800 text-sm">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/55 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-slate-700 font-medium">
                    {cell}
                  </td>
                ))}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total DTRs" value={total} color="border-slate-200" />
        <StatCard label="Completed Painting" value={completed} color="border-green-200" />
        <StatCard label="Pending Painting" value={pending} color="border-orange-200" />
        <StatCard label="Progress Rate" value={`${progress}%`} color="border-blue-200" />
      </div>

      {/* Custom Reports Panel */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white rounded-2xl">
        <div className="px-5 py-4 border-b bg-slate-50/50">
          <h3 className="font-bold text-slate-900 text-sm">Download DTR Painting Reports</h3>
          <p className="text-xs text-slate-500 mt-0.5">Generate customized PDF reports and Excel spreadsheets with summary pages</p>
        </div>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Agency Pending Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-orange-200 hover:bg-orange-50/5 transition">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold tracking-wider text-orange-700 uppercase bg-orange-100/60 px-2 py-0.5 rounded-full">Pending Tasks</span>
                <h4 className="font-bold text-gray-900 text-sm">Agency Pending Painting Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  List and matrix of DTRs assigned to painting agencies where structural painting is pending.
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

            {/* Card 2: Agency Completed Report */}
            <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-green-200 hover:bg-green-50/5 transition">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold tracking-wider text-green-700 uppercase bg-green-100/60 px-2 py-0.5 rounded-full">Completed Tasks</span>
                <h4 className="font-bold text-gray-900 text-sm">Agency Completed Painting Report</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  List and matrix of DTRs where structural painting has been successfully completed and verified.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 hover:text-red-800 transition" onClick={exportAgencyCompletedPDF}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100 hover:text-green-800 transition" onClick={exportAgencyCompletedExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Agency Performance Table */}
      {agencyStats.length > 0 && (
        <Table 
          title="Agency Painting Performance Breakdown" 
          headers={["Agency Name", "Assigned DTRs", "Completed DTRs", "Pending DTRs", "Completion Progress"]} 
          rows={agencyStats.map(a => [
            a.agency, 
            a.total, 
            a.done, 
            a.pending, 
            `${a.pct}%`
          ])} 
        />
      )}
    </div>
  )
}

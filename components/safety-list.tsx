"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Search, MapPin, RefreshCw, AlertCircle, X, Filter,
  CheckCircle2, Edit, LayoutGrid, List, ChevronLeft, ChevronRight,
  Loader2, DownloadCloud, Check, ShieldAlert, Wrench, FileText, Camera, Upload, Eye, Plus,
  Image as ImageIcon, Calendar, User, UserCheck, Settings, FileSpreadsheet, FileDown, ChevronDown
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getFromCache, saveToCache, clearAllCache, mergePatchToCache, notifyCacheUpdate } from "@/lib/indexed-db"
import { PlatformSyncEngine } from "@/lib/sync-engine"
import type { SafetyTicket } from "@/lib/safety-service"
import { SafetyStats } from "./safety-stats"
import { SafetyAgencyDrawer } from "./safety-agency-drawer"
import { SafetyForm } from "./safety-form"
import { useToast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"
import { compressAndWatermarkImage } from "@/lib/image-processor"

const NearbySafetyMap = dynamic(
  () => import("./nearby-safety-map").then((mod) => mod.NearbySafetyMap),
  { ssr: false }
)

export function getGoogleDriveDirectLink(url: string | undefined): string {
  if (!url) return ""
  const clean = url.trim()
  if (clean.includes("drive.google.com")) {
    let fileId = ""
    if (clean.includes("/file/d/")) {
      const parts = clean.split("/file/d/")
      if (parts[1]) fileId = parts[1].split("/")[0]
    } else if (clean.includes("id=")) {
      const match = clean.match(/[?&]id=([^&]+)/)
      if (match && match[1]) fileId = match[1]
    }
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
  }
  return clean.startsWith("http://") || clean.startsWith("https://") ? clean : `https://${clean}`
}

interface SafetyListProps {
  userRole: string
  userAgencies: string[]
  permissions?: Record<string, string[]>
  availableAgencies?: string[]
}

interface PreviewImage {
  url: string
  title: string
  ticketId: string
  type: "Before" | "Rectified" | "Drawing"
}

export function SafetyList({ userRole, userAgencies, permissions, availableAgencies = [] }: SafetyListProps) {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<SafetyTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'found' | 'syncing' | 'updated'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showNearbyMap, setShowNearbyMap] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // In-App Image Preview Modal State
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  // Role Normalization (Case-insensitive)
  const roleLower = (userRole || "").toLowerCase().trim()
  const isAdmin = roleLower === "admin" || roleLower === "superuser" || roleLower === "executive"
  const canCreateSafety = isAdmin || roleLower === "agency" || !!(permissions?.safety?.includes("create") || permissions?.safety?.includes("update"))

  // Dynamic Agency list
  const [fetchedAgencies, setFetchedAgencies] = useState<string[]>([])

  useEffect(() => {
    async function loadAgencies() {
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            const names = data.map((a: any) => typeof a === "string" ? a : a.name).filter(Boolean)
            if (names.length > 0) setFetchedAgencies(prev => Array.from(new Set([...prev, ...names])))
          }
        }
      } catch (e) {
        console.warn("Failed to fetch agencies", e)
      }
    }
    loadAgencies()
  }, [])

  // Deduplicated agencies list
  const agenciesList = useMemo(() => {
    const fromTickets = tickets.map(t => t.agency).filter(Boolean)
    const combined = [...availableAgencies, ...userAgencies, ...fetchedAgencies, ...fromTickets]
    const cleaned = combined
      .map(a => String(a || "").trim())
      .filter(a => a && a.toLowerCase() !== "agency" && a.toLowerCase() !== "admin")
    return Array.from(new Set(cleaned))
  }, [availableAgencies, userAgencies, fetchedAgencies, tickets])

  // Sub-tab filter: "pending_site" | "rectified" | "notesheet" | "closed" | "all"
  const [subTab, setSubTab] = useState<"pending_site" | "rectified" | "notesheet" | "closed" | "all">("pending_site")

  // Modal states
  const [selectedForView, setSelectedForView] = useState<SafetyTicket | null>(null)
  const [selectedForEdit, setSelectedForEdit] = useState<SafetyTicket | null>(null)
  const [confirmNoPOItem, setConfirmNoPOItem] = useState<SafetyTicket | null>(null)

  // Edit Modal Internal Form States
  const [editAgency, setEditAgency] = useState("")
  const [afterImageUrl, setAfterImageUrl] = useState("")
  const [completionRemarks, setCompletionRemarks] = useState("")
  const [rectifyDrawingUrl, setRectifyDrawingUrl] = useState("")
  const [uploadingAfterImage, setUploadingAfterImage] = useState(false)
  const [uploadingDrawing, setUploadingDrawing] = useState(false)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const drawingInputRef = useRef<HTMLInputElement>(null)

  const [nsNo, setNsNo] = useState("")
  const [nsDate, setNsDate] = useState("")
  const [nsAmount, setNsAmount] = useState("")

  const [poNo, setPoNo] = useState("")
  const [poDate, setPoDate] = useState("")
  const [poAmount, setPoAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Data Loading
  useEffect(() => {
    async function loadData() {
      setError(null)
      try {
        const cached = await getFromCache<SafetyTicket[]>("safety_data_cache")
        let lastTs = 0
        if (cached && cached.length > 0) {
          setTickets(cached)
          setLoading(false)
          lastTs = PlatformSyncEngine.extractMaxTimestamp(cached, ["reportedDate", "physicalRectifiedDate" as any])
        }
        setSyncStatus('checking')
        if (lastTs > 0) {
          const merged = await PlatformSyncEngine.syncModule<SafetyTicket>({
            moduleKey: "safety",
            cacheKey: "safety_data_cache",
            idKey: "safetyId",
            fetchPatchUrl: "/api/safety/patch",
          }, lastTs)
          setTickets(merged)
        } else {
          const res = await fetch("/api/safety/base")
          if (!res.ok) throw new Error("Failed to fetch safety tickets")
          const result = await res.json()
          const patchItems = (Array.isArray(result) ? result : (result.patchData || [])) as SafetyTicket[]
          const merged = await mergePatchToCache<SafetyTicket>("safety_data_cache", patchItems, "safetyId")
          setTickets(merged)
        }
        setSyncStatus('updated')
      } catch (err: any) {
        console.error(err)
        if (tickets.length === 0) setError(err.message || "Failed to load Safety data")
      } finally {
        setLoading(false)
        setTimeout(() => setSyncStatus('idle'), 3000)
      }
    }
    loadData()
  }, [refreshKey])

  // Filtering and Sorting (Last to first order - newest first)
  const filteredTickets = useMemo(() => {
    const list = tickets.filter(t => {
      // Role filtering
      if (!isAdmin) {
        const myAgencies = userAgencies.map(a => a.toUpperCase())
        if (t.agency && !myAgencies.includes(t.agency.toUpperCase())) return false
      }

      // Search matching
      const q = searchTerm.toLowerCase().trim()
      const matchesSearch = !q ||
        t.safetyId.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        (t.dtrCode || "").toLowerCase().includes(q) ||
        (t.agency || "").toLowerCase().includes(q) ||
        (t.hazardCategories || []).some(h => h.toLowerCase().includes(q)) ||
        (t.noteSheetNo || "").toLowerCase().includes(q) ||
        (t.poNumber || "").toLowerCase().includes(q)

      // Sub-tab pipeline filtering
      let matchesTab = true
      if (subTab === "pending_site") {
        matchesTab = t.physicalStatus === "pending"
      } else if (subTab === "rectified") {
        matchesTab = t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required"
      } else if (subTab === "notesheet") {
        matchesTab = t.adminStatus === "notesheet_done"
      } else if (subTab === "closed") {
        matchesTab = t.physicalStatus === "rectified" && (t.adminStatus === "po_done" || t.adminStatus === "not_required")
      }

      return matchesSearch && matchesTab
    })

    // Show last to first (newest tickets first)
    return [...list].reverse()
  }, [tickets, searchTerm, subTab, isAdmin, userAgencies])

  const itemsPerPage = viewMode === "list" ? 50 : 12
  const totalPages = Math.ceil(filteredTickets.length / itemsPerPage)
  const paginatedTickets = filteredTickets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleCreateTicket = async (data: Partial<SafetyTicket>) => {
    try {
      const res = await fetch("/api/safety/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to create safety ticket")

      toast({ title: "Success", description: `Safety ticket ${result.safetyId} created.` })
      setShowCreateForm(false)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "Failed to create safety ticket")
    }
  }

  // Handle Drawing Upload in Rectification Modal
  const handleDrawingUpload = async (file: File) => {
    setUploadingDrawing(true)
    try {
      const dateStr = new Date().toLocaleString("en-IN")
      const processed = await compressAndWatermarkImage(file, {
        maxDim: 800,
        watermarkLines: [`Drawing Date: ${dateStr}`, `Safety Ticket: ${selectedForEdit?.safetyId || ""}`],
        targetKb: 95
      })
      const uploadData = new FormData()
      uploadData.append("file", processed)
      uploadData.append("consumerId", selectedForEdit?.safetyId || "SAFETY_DRAWING")
      uploadData.append("module", "safety")
      const res = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await res.json()
      if (res.ok && result.success) {
        setRectifyDrawingUrl(result.url)
      } else {
        alert(result.error || "Drawing upload failed")
      }
    } catch (err: any) {
      alert(err?.message || "Drawing upload failed")
    } finally {
      setUploadingDrawing(false)
    }
  }

  // Handle Download Image with Fixed Structured Filename
  const handleDownloadPreviewImage = async (img: PreviewImage) => {
    try {
      const directUrl = getGoogleDriveDirectLink(img.url)
      const res = await fetch(directUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `${img.ticketId}_${img.type}_Photo.jpg`.replace(/\s+/g, "_")
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      window.open(img.url, "_blank")
    }
  }

  // ── EXPORT TO EXCEL ──
  const exportSafetyExcel = async (scope: "filtered" | "all") => {
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      const targetList = scope === "filtered" ? filteredTickets : tickets

      const rows = targetList.map((t, idx) => ({
        "SL No": idx + 1,
        "Safety Ticket ID": t.safetyId,
        "Reported Date": t.reportedDate,
        "Reported By": t.reportedBy,
        "Severity": t.severity,
        "Priority": t.priority,
        "Hazard Categories": (t.hazardCategories || []).join(", "),
        "Address / Landmark": t.address,
        "DTR Code": t.dtrCode || "-",
        "Latitude": t.latitude,
        "Longitude": t.longitude,
        "Assigned Agency": t.agency || "Unassigned",
        "Site Physical Status": t.physicalStatus === "rectified" ? "Rectified" : "Pending",
        "Site Completion Date": t.completionDate || "-",
        "Completion Remarks": t.completionRemarks || "-",
        "Note Sheet No": t.noteSheetNo || "-",
        "Note Sheet Date": t.noteSheetDate || "-",
        "Note Sheet Est. Amount": t.noteSheetAmount || "-",
        "PO Number": t.poNumber || "-",
        "PO Date": t.poDate || "-",
        "PO Amount": t.poAmount || "-",
        "Admin Status": t.adminStatus || "pending",
        "Before Photo URL": t.beforeImageUrl || "-",
        "After Photo URL": t.afterImageUrl || "-",
        "Drawing URL": t.drawingUrl || "-",
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "Safety Tickets Report")

      XLSX.writeFile(wb, `safety-hazard-report-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast({ title: "Excel Report Exported", description: `Exported ${targetList.length} safety records.` })
    } catch (err: any) {
      console.error(err)
      alert("Excel export failed: " + err.message)
    }
  }

  // ── EXPORT AGENCY-WISE PENDING PDF REPORT ──
  const exportAgencyPendingPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const pendingTickets = tickets.filter(t => t.physicalStatus === "pending")

      // Aggregate counts agency-wise
      const agencyMap: Record<string, { pending: number; noteSheetDone: number; total: number }> = {}
      pendingTickets.forEach(t => {
        const ag = t.agency ? t.agency.trim() : "Unassigned"
        if (!agencyMap[ag]) {
          agencyMap[ag] = { pending: 0, noteSheetDone: 0, total: 0 }
        }
        agencyMap[ag].pending++
        agencyMap[ag].total++
        if (t.adminStatus === "notesheet_done") {
          agencyMap[ag].noteSheetDone++
        }
      })

      const summaryRows = Object.entries(agencyMap)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([ag, stats], idx) => [
          idx + 1,
          ag,
          stats.pending,
          stats.noteSheetDone,
          stats.total
        ])

      const doc = new jsPDF({ orientation: "landscape" })
      const pw = doc.internal.pageSize.width

      doc.setFontSize(16)
      doc.setTextColor(30, 41, 59)
      doc.text("Agency-wise Pending Safety Hazards Summary Report", pw / 2, 14, { align: "center" })

      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(
        `Generated on: ${new Date().toLocaleDateString("en-IN")} | Total Pending Hazards: ${pendingTickets.length}`,
        pw / 2, 20, { align: "center" }
      )

      autoTable(doc, {
        startY: 25,
        head: [["#", "Agency Name", "Pending Site Work", "Note Sheet Done", "Total Pending"]],
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
      doc.text("Detailed Pending Safety Hazards List (Grouped by Agency)", 14, startY)

      const sortedPending = [...pendingTickets].sort((a, b) => (a.agency || "").localeCompare(b.agency || ""))
      const detailBody = sortedPending.map((t, idx) => [
        idx + 1,
        t.safetyId,
        t.reportedDate,
        (t.hazardCategories || []).join(", "),
        t.address,
        t.dtrCode || "-",
        t.agency || "Unassigned",
        t.adminStatus === "notesheet_done" ? "Note Sheet Done" : "Pending Site"
      ])

      autoTable(doc, {
        startY: startY + 3,
        head: [["#", "Safety ID", "Reported Date", "Hazard Types", "Location Address", "DTR", "Agency", "Admin Status"]],
        body: detailBody,
        styles: { fontSize: 8, font: "helvetica", cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { halign: "center", cellWidth: 10 },
          1: { fontStyle: "bold", cellWidth: 30 },
          2: { cellWidth: 24 },
          3: { cellWidth: 50 },
          4: { cellWidth: 70 },
          5: { cellWidth: 25 },
          6: { cellWidth: 35 },
          7: { halign: "center", cellWidth: 30 },
        },
        theme: "grid"
      })

      doc.save(`agency-wise-pending-safety-report-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast({ title: "Agency Pending Report Downloaded", description: `Exported ${pendingTickets.length} pending safety hazards.` })
    } catch (err: any) {
      console.error(err)
      alert("Agency pending report export failed: " + err.message)
    }
  }

  const exportSafetyPDF = exportAgencyPendingPDF

  // Handle Edit Modal Actions
  const handleAssignAgencyAction = async () => {
    if (!selectedForEdit) return
    if (selectedForEdit.physicalStatus === "rectified") {
      alert("Agency cannot be modified after site work is marked rectified.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/safety/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_agency",
          safetyId: selectedForEdit.safetyId,
          agency: editAgency,
        }),
      })
      if (!res.ok) throw new Error("Failed to assign agency")

      // Instant optimistic cache and modal update
      const updated = tickets.map(t => t.safetyId === selectedForEdit.safetyId ? { ...t, agency: editAgency } : t)
      setTickets(updated)
      setSelectedForEdit(prev => prev ? { ...prev, agency: editAgency } : null)
      await saveToCache("safety_data_cache", updated)
      notifyCacheUpdate("safety_data_cache")

      toast({ title: "Agency Assigned", description: `Ticket assigned to ${editAgency || "Unassigned"}.` })
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "Failed to assign agency")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRectifySubmit = async () => {
    if (!selectedForEdit) return
    if (selectedForEdit.physicalStatus === "rectified") {
      alert("Site work proof is sealed and locked from further changes.")
      return
    }
    if (!afterImageUrl) {
      alert("Rectified GPS photo (After photo) is mandatory.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/safety/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rectify",
          safetyId: selectedForEdit.safetyId,
          afterImageUrl,
          completionRemarks,
          drawingUrl: rectifyDrawingUrl,
        }),
      })
      if (!res.ok) throw new Error("Failed to submit rectification")

      // Instant optimistic local, cache & modal update
      const updated = tickets.map(t =>
        t.safetyId === selectedForEdit.safetyId
          ? {
              ...t,
              physicalStatus: "rectified" as const,
              afterImageUrl,
              completionRemarks,
              drawingUrl: rectifyDrawingUrl || t.drawingUrl,
              completionDate: t.completionDate || new Date().toLocaleDateString("en-IN"),
            }
          : t
      )
      setTickets(updated)
      setSelectedForEdit(prev => prev ? {
        ...prev,
        physicalStatus: "rectified" as const,
        afterImageUrl,
        completionRemarks,
        drawingUrl: rectifyDrawingUrl || prev.drawingUrl,
        completionDate: prev.completionDate || new Date().toLocaleDateString("en-IN"),
      } : null)
      await saveToCache("safety_data_cache", updated)

      toast({ title: "Site Work Marked Rectified", description: `Ticket ${selectedForEdit.safetyId} completed.` })
      setSelectedForEdit(null)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "Rectification submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleNoteSheetSubmit = async () => {
    if (!selectedForEdit || !nsNo.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/safety/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "notesheet",
          safetyId: selectedForEdit.safetyId,
          noteSheetNo: nsNo.trim(),
          noteSheetDate: nsDate,
          noteSheetAmount: nsAmount,
        }),
      })
      if (!res.ok) throw new Error("Failed to record Note Sheet")

      // Instant cache & modal update
      const updated = tickets.map(t => t.safetyId === selectedForEdit.safetyId ? {
        ...t,
        adminStatus: "notesheet_done" as const,
        noteSheetNo: nsNo.trim(),
        noteSheetDate: nsDate || new Date().toLocaleDateString("en-IN"),
        noteSheetAmount: nsAmount,
      } : t)
      setTickets(updated)
      setSelectedForEdit(prev => prev ? {
        ...prev,
        adminStatus: "notesheet_done" as const,
        noteSheetNo: nsNo.trim(),
        noteSheetDate: nsDate || new Date().toLocaleDateString("en-IN"),
        noteSheetAmount: nsAmount,
      } : null)
      await saveToCache("safety_data_cache", updated)

      toast({ title: "Note Sheet Approved", description: `Note Sheet saved for ${selectedForEdit.safetyId}.` })
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "Note sheet update failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePOSubmit = async () => {
    if (!selectedForEdit || !poNo.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/safety/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "po",
          safetyId: selectedForEdit.safetyId,
          poNumber: poNo.trim(),
          poDate: poDate,
          poAmount: poAmount,
        }),
      })
      if (!res.ok) throw new Error("Failed to record PO details")

      // Instant cache update & close
      const updated = tickets.map(t => t.safetyId === selectedForEdit.safetyId ? {
        ...t,
        adminStatus: "po_done" as const,
        poNumber: poNo.trim(),
        poDate: poDate || new Date().toLocaleDateString("en-IN"),
        poAmount: poAmount,
      } : t)
      setTickets(updated)
      await saveToCache("safety_data_cache", updated)

      toast({ title: "PO Issued & Closed", description: `PO ${poNo} saved for ${selectedForEdit.safetyId}.` })
      setSelectedForEdit(null)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "PO update failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkNoPO = async () => {
    if (!confirmNoPOItem) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/safety/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "no_po",
          safetyId: confirmNoPOItem.safetyId,
        }),
      })
      if (!res.ok) throw new Error("Failed to update status")

      // Instant cache update
      const updated = tickets.map(t => t.safetyId === confirmNoPOItem.safetyId ? { ...t, adminStatus: "not_required" as const } : t)
      setTickets(updated)
      await saveToCache("safety_data_cache", updated)

      toast({ title: "Ticket Fully Closed", description: `Ticket ${confirmNoPOItem.safetyId} closed without PO.` })
      setConfirmNoPOItem(null)
      setSelectedForEdit(null)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      alert(e.message || "Action failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (showCreateForm) {
    return (
      <SafetyForm
        onSave={handleCreateTicket}
        onCancel={() => setShowCreateForm(false)}
        userRole={userRole}
        userAgencies={userAgencies}
        availableAgencies={agenciesList}
      />
    )
  }

  return (
    <div className="space-y-3 pb-24">
      <SafetyStats tickets={tickets} loading={loading} />
      <SafetyAgencyDrawer tickets={tickets} />

      {/* Control Header */}
      <div className="bg-white p-3 rounded-xl shadow-sm border space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
            <Input
              placeholder="Search Safety Tickets..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-8 text-xs rounded-lg"
            />
            {searchTerm && (
              <X
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-red-500 cursor-pointer"
                onClick={() => setSearchTerm("")}
              />
            )}
          </div>

          {/* Export Reports Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 px-2.5 text-xs font-bold bg-slate-50 border-slate-200 text-slate-700 flex items-center gap-1 shrink-0 rounded-lg">
                <FileDown className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => exportAgencyPendingPDF()} className="cursor-pointer text-xs font-semibold">
                <FileDown className="h-4 w-4 mr-2 text-amber-600" /> Agency Pending Report (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSafetyPDF()} className="cursor-pointer text-xs font-semibold">
                <FileDown className="h-4 w-4 mr-2 text-red-600" /> Export PDF Report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSafetyExcel("filtered")} className="cursor-pointer text-xs font-semibold">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Export Filtered (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSafetyExcel("all")} className="cursor-pointer text-xs font-semibold">
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-700" /> Export All (Excel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View mode toggle */}
          <div className="flex items-center border rounded-lg bg-white shrink-0">
            <Button
              variant="ghost" size="icon"
              className={`h-8 w-8 rounded-none rounded-l-lg ${viewMode === "card" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-4 bg-gray-200" />
            <Button
              variant="ghost" size="icon"
              className={`h-8 w-8 rounded-none rounded-r-lg ${viewMode === "list" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Full-width Radar Map Button */}
        <div>
          <Button
            type="button"
            onClick={() => setShowNearbyMap(v => !v)}
            className="w-full h-8 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs shadow-sm bg-gradient-to-r from-amber-600 to-orange-650 text-white"
          >
            <MapPin className="h-3.5 w-3.5 animate-bounce" />
            {showNearbyMap ? "Hide Safety Radar Map" : "Locate Safety Hazards on Radar Map"}
          </Button>
        </div>

        {/* Sub-tab chips pipeline */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 pt-1.5 border-t">
          {[
            { value: "pending_site", label: `Pending Site (${tickets.filter(t => t.physicalStatus === "pending").length})` },
            { value: "rectified",    label: `Site Rectified (${tickets.filter(t => t.physicalStatus === "rectified" && t.adminStatus !== "po_done" && t.adminStatus !== "not_required").length})` },
            { value: "notesheet",    label: `Note Approved (${tickets.filter(t => t.adminStatus === "notesheet_done").length})` },
            { value: "closed",       label: `Closed (${tickets.filter(t => t.physicalStatus === "rectified" && (t.adminStatus === "po_done" || t.adminStatus === "not_required")).length})` },
            { value: "all",          label: `All (${tickets.length})` },
          ].map(sub => (
            <button
              key={sub.value}
              onClick={() => setSubTab(sub.value as any)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
                subTab === sub.value ? "bg-slate-950 text-white border-slate-950" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards View */}
      {viewMode === "card" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {paginatedTickets.map(ticket => {
            const isFullyClosed = ticket.physicalStatus === "rectified" && (ticket.adminStatus === "po_done" || ticket.adminStatus === "not_required")
            const isSiteRectified = ticket.physicalStatus === "rectified"
            const rawImage = ticket.afterImageUrl || ticket.beforeImageUrl || ticket.drawingUrl
            const directImage = getGoogleDriveDirectLink(rawImage)
            const canEdit = isAdmin || ticket.physicalStatus === "pending"

            return (
              <Card key={ticket.safetyId} className="shadow-sm hover:shadow-md transition-shadow overflow-hidden border-slate-200 flex flex-col justify-between rounded-xl">
                <div>
                  {/* Card Header */}
                  <CardHeader className="pb-2 p-3 bg-slate-50 border-b">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900">{ticket.safetyId}</span>
                          {ticket.priority === "urgent" && (
                            <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">URGENT</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">{ticket.reportedDate} • By {ticket.reportedBy}</p>
                      </div>

                      {/* Top Right: Status Pill & Agency Name directly below */}
                      <div className="flex flex-col items-end">
                        <Badge className={
                          isFullyClosed ? "bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]" :
                          isSiteRectified ? "bg-blue-100 text-blue-800 border-blue-300 text-[10px]" :
                          "bg-amber-100 text-amber-800 border-amber-300 text-[10px]"
                        }>
                          {isFullyClosed ? "Closed" : isSiteRectified ? "Rectified" : "Pending Work"}
                        </Badge>
                        <span className="text-[10px] font-bold text-slate-700 text-right mt-1">
                          {ticket.agency ? ticket.agency : <span className="text-red-500 font-bold">Unassigned</span>}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-3 space-y-2.5 text-xs">
                    {/* Hazard Chips */}
                    <div className="flex flex-wrap gap-1">
                      {(ticket.hazardCategories || []).map(h => (
                        <span key={h} className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          {h}
                        </span>
                      ))}
                    </div>

                    {/* Address with Google Maps Icon right beside text */}
                    <div className="flex items-start justify-between gap-1 text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-150">
                      <div className="flex items-start gap-1 min-w-0">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <p className="line-clamp-2 leading-snug">{ticket.address}</p>
                      </div>
                      {ticket.latitude && ticket.longitude ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${ticket.latitude},${ticket.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded border border-blue-200 shrink-0 transition-colors bg-white shadow-xs"
                          title="Open Location in Google Maps"
                        >
                          <MapPin className="h-3.5 w-3.5 text-blue-600" />
                        </a>
                      ) : null}
                    </div>

                    {/* DTR Code info */}
                    {ticket.dtrCode && (
                      <div className="text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-500">DTR Code:</span> <strong className="font-mono text-slate-900">{ticket.dtrCode}</strong>
                      </div>
                    )}

                    {/* DIRECT IMAGE DISPLAY WITH EQUAL BLACK BORDER ON ALL SIDES */}
                    {directImage ? (
                      <div className="relative rounded-lg overflow-hidden border border-black shadow-sm bg-slate-100 max-h-40 flex items-center justify-center group">
                        <img
                          src={directImage}
                          alt="Safety Hazard Photo"
                          className="w-full max-h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImage({
                            url: rawImage || "",
                            title: `${ticket.safetyId} — ${ticket.afterImageUrl ? "Rectified Photo" : "Before Hazard Photo"}`,
                            ticketId: ticket.safetyId,
                            type: ticket.afterImageUrl ? "Rectified" : "Before"
                          })}
                        />
                        <div
                          onClick={() => setPreviewImage({
                            url: rawImage || "",
                            title: `${ticket.safetyId} — ${ticket.afterImageUrl ? "Rectified Photo" : "Before Hazard Photo"}`,
                            ticketId: ticket.safetyId,
                            type: ticket.afterImageUrl ? "Rectified" : "Before"
                          })}
                          className="absolute bottom-1.5 right-1.5 bg-black/80 hover:bg-black text-white text-[9px] font-bold px-2 py-0.5 rounded backdrop-blur-sm cursor-pointer flex items-center gap-1 transition-all border border-slate-700"
                        >
                          <ImageIcon className="h-3 w-3 text-amber-400" />
                          <span>Tap to Preview & Download ↗</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-20 rounded-lg border border-black bg-slate-50 flex items-center justify-center text-[11px] text-slate-400 font-medium">
                        No Image Uploaded
                      </div>
                    )}

                    {/* Administrative PO / Note Sheet Badges */}
                    {(ticket.noteSheetNo || ticket.poNumber || ticket.adminStatus === "not_required") && (
                      <div className="text-[11px] bg-slate-100 p-1.5 rounded-md space-y-0.5">
                        {ticket.noteSheetNo && <p>Note Sheet: <strong className="font-mono text-purple-700">{ticket.noteSheetNo}</strong></p>}
                        {ticket.poNumber && <p>PO No: <strong className="font-mono text-emerald-700">{ticket.poNumber}</strong></p>}
                        {ticket.adminStatus === "not_required" && <p className="text-slate-600 font-medium">✓ PO Not Required</p>}
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Streamlined Card Action Footer */}
                <CardContent className="p-3 pt-0 border-t mt-1">
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs font-bold h-8 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1"
                      onClick={() => setSelectedForView(ticket)}
                    >
                      <Eye className="h-3.5 w-3.5 text-blue-600" />
                      <span>View Details</span>
                    </Button>

                    {canEdit ? (
                      <Button
                        size="sm"
                        className="w-full text-xs font-bold h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1"
                        onClick={() => {
                          setSelectedForEdit(ticket)
                          setEditAgency(ticket.agency || "")
                          setAfterImageUrl(ticket.afterImageUrl || "")
                          setCompletionRemarks(ticket.completionRemarks || "")
                          setRectifyDrawingUrl(ticket.drawingUrl || "")
                          setNsNo(ticket.noteSheetNo || "")
                          setNsDate(ticket.noteSheetDate || "")
                          setNsAmount(ticket.noteSheetAmount || "")
                          setPoNo(ticket.poNumber || "")
                          setPoDate(ticket.poDate || "")
                          setPoAmount(ticket.poAmount || "")
                        }}
                      >
                        <Edit className="h-3.5 w-3.5 text-amber-400" />
                        <span>Edit / Action</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled
                        className="w-full text-xs font-semibold h-8 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-not-allowed opacity-90"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                        <span>Rectified</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2">ID / Date</th>
                  <th className="px-3 py-2">Hazards</th>
                  <th className="px-3 py-2">Address / DTR</th>
                  <th className="px-3 py-2">Agency</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedTickets.map(t => {
                  const canEditList = isAdmin || t.physicalStatus === "pending"
                  return (
                    <tr key={t.safetyId} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold text-slate-900">{t.safetyId}</div>
                        <div className="text-[10px] text-slate-500">{t.reportedDate}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-amber-900 max-w-[150px] truncate">
                        {(t.hazardCategories || []).join(", ")}
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate text-slate-600">
                        <div>{t.address}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700">{t.agency || "Unassigned"}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={t.physicalStatus === "rectified" ? "bg-emerald-100 text-emerald-800 text-[10px]" : "bg-amber-100 text-amber-800 text-[10px]"}>
                          {t.physicalStatus === "rectified" ? "Rectified" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => setSelectedForView(t)} className="h-6 px-2 text-[11px]">
                          View
                        </Button>
                        {canEditList ? (
                          <Button size="sm" onClick={() => {
                            setSelectedForEdit(t)
                            setEditAgency(t.agency || "")
                            setAfterImageUrl(t.afterImageUrl || "")
                            setCompletionRemarks(t.completionRemarks || "")
                            setRectifyDrawingUrl(t.drawingUrl || "")
                            setNsNo(t.noteSheetNo || "")
                            setNsDate(t.noteSheetDate || "")
                            setNsAmount(t.noteSheetAmount || "")
                            setPoNo(t.poNumber || "")
                            setPoDate(t.poDate || "")
                            setPoAmount(t.poAmount || "")
                          }} className="h-6 px-2 text-[11px] bg-slate-900 text-white">
                            Edit
                          </Button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Rectified
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 text-xs">
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
          </Button>
          <span className="text-xs text-slate-600 font-semibold">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 text-xs">
            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* ── CENTERED BLACK FLOATING ACTION BUTTON (FAB) FOR REPORTING HAZARD ── */}
      {canCreateSafety && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-1.5 border border-slate-700 active:scale-95 transition-all shrink-0"
        >
          <Plus className="h-4 w-4 text-amber-400" />
          <span>Report Safety Hazard</span>
        </button>
      )}

      {/* ── MODAL 1: VIEW DETAILS & DATE-WISE TIMELINE ── */}
      {selectedForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm overflow-x-hidden">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col mx-auto border">
            <div className="p-3.5 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold">Safety Ticket Details & History</h2>
                <p className="text-[10px] text-slate-400 font-mono">ID: {selectedForView.safetyId}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedForView(null)} className="text-white hover:bg-slate-800 h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto overflow-x-hidden flex-1 text-xs">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Hazard Categories</span>
                  <p className="font-bold text-amber-900 text-xs mt-0.5">{(selectedForView.hazardCategories || []).join(", ")}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Assigned Agency</span>
                  <p className="font-bold text-slate-900 text-xs mt-0.5">{selectedForView.agency || "Unassigned"}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Location Address</span>
                  <p className="font-medium text-slate-800 text-xs mt-0.5">{selectedForView.address}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px]">GPS Coordinates</span>
                  <p className="font-mono font-bold text-slate-800 text-xs mt-0.5">{selectedForView.latitude}, {selectedForView.longitude}</p>
                </div>
              </div>

              {/* Photos Section */}
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Inspection Photos & Drawings</h3>
                <div className="grid grid-cols-3 gap-2">
                  {selectedForView.beforeImageUrl ? (
                    <div
                      onClick={() => setPreviewImage({ url: selectedForView.beforeImageUrl!, title: "Before Inspection Photo", ticketId: selectedForView.safetyId, type: "Before" })}
                      className="cursor-pointer border border-black rounded-lg overflow-hidden bg-slate-50 hover:opacity-90 transition-opacity"
                    >
                      <img src={getGoogleDriveDirectLink(selectedForView.beforeImageUrl)} alt="Before" className="w-full h-20 object-cover" />
                      <p className="p-1 text-[9px] font-bold text-center bg-slate-900 text-white">Before Photo 🔍</p>
                    </div>
                  ) : <div className="border border-black rounded-lg h-20 flex items-center justify-center text-[9px] text-slate-400 text-center p-1">No Before Photo</div>}

                  {selectedForView.drawingUrl ? (
                    <div
                      onClick={() => setPreviewImage({ url: selectedForView.drawingUrl!, title: "Work Drawing / SLD", ticketId: selectedForView.safetyId, type: "Drawing" })}
                      className="cursor-pointer border border-black rounded-lg overflow-hidden bg-purple-50 hover:opacity-90 transition-opacity"
                    >
                      <img src={getGoogleDriveDirectLink(selectedForView.drawingUrl)} alt="Drawing" className="w-full h-20 object-cover" />
                      <p className="p-1 text-[9px] font-bold text-center bg-purple-950 text-white">Drawing / SLD 🔍</p>
                    </div>
                  ) : <div className="border border-black rounded-lg h-20 flex items-center justify-center text-[9px] text-slate-400 text-center p-1">No Drawing</div>}

                  {selectedForView.afterImageUrl ? (
                    <div
                      onClick={() => setPreviewImage({ url: selectedForView.afterImageUrl!, title: "Rectified Site Photo", ticketId: selectedForView.safetyId, type: "Rectified" })}
                      className="cursor-pointer border border-black rounded-xl overflow-hidden bg-emerald-50 hover:opacity-90 transition-opacity"
                    >
                      <img src={getGoogleDriveDirectLink(selectedForView.afterImageUrl)} alt="After" className="w-full h-20 object-cover" />
                      <p className="p-1 text-[9px] font-bold text-center bg-emerald-950 text-white">After Photo 🔍</p>
                    </div>
                  ) : <div className="border border-black rounded-lg h-20 flex items-center justify-center text-[9px] text-slate-400 text-center p-1">No After Photo</div>}
                </div>
              </div>

              {/* Date-wise Timeline History */}
              <div className="space-y-2 pt-2 border-t">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Date-Wise History Timeline
                </h3>

                <div className="space-y-2 relative before:absolute before:inset-0 before:left-2.5 before:w-0.5 before:bg-slate-200 pl-6 text-xs">
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                    <p className="font-bold text-slate-900">{selectedForView.reportedDate} — Hazard Identified</p>
                    <p className="text-slate-600">Reported by <strong>{selectedForView.reportedBy}</strong>.</p>
                  </div>

                  {selectedForView.physicalStatus === "rectified" && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                      <p className="font-bold text-slate-900">{selectedForView.completionDate || "Completed"} — Site Rectified</p>
                      <p className="text-slate-600">Rectified on site. Remarks: <em>{selectedForView.completionRemarks || "None"}</em></p>
                    </div>
                  )}

                  {selectedForView.noteSheetNo && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-white" />
                      <p className="font-bold text-slate-900">{selectedForView.noteSheetDate || "Approved"} — Note Sheet Approved</p>
                      <p className="text-slate-600">Note Sheet No: <strong className="font-mono text-purple-700">{selectedForView.noteSheetNo}</strong></p>
                    </div>
                  )}

                  {selectedForView.poNumber && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      <p className="font-bold text-slate-900">{selectedForView.poDate || "Issued"} — PO Issued</p>
                      <p className="text-slate-600">PO Number: <strong className="font-mono text-emerald-700">{selectedForView.poNumber}</strong></p>
                    </div>
                  )}

                  {selectedForView.adminStatus === "not_required" && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      <p className="font-bold text-slate-900">Admin Closure</p>
                      <p className="text-slate-600">PO Not Required for routine repair. Ticket fully closed.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t flex justify-end">
              <Button size="sm" onClick={() => setSelectedForView(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: EDIT / PROCESS MODAL ── */}
      {selectedForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-x-hidden">
          <div className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col mx-auto border">
            <div className="p-3.5 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold">Edit & Process Safety Ticket</h2>
                <p className="text-[10px] text-slate-400 font-mono">ID: {selectedForEdit.safetyId}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedForEdit(null)} className="text-white hover:bg-slate-800 h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-4 overflow-y-auto overflow-x-hidden flex-1 text-xs">
              {/* SECTION A: ASSIGN AGENCY (Admin Only - Locked once site work is rectified) */}
              {isAdmin && (
                <div className="space-y-2 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                  <h3 className="text-[11px] font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-amber-600" /> 1. Assigned Agency
                  </h3>
                  {selectedForEdit.physicalStatus === "rectified" ? (
                    <div className="text-xs font-semibold text-slate-700 bg-white p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                      <span>Agency: <strong>{selectedForEdit.agency || "Unassigned"}</strong></span>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">Locked (Work Completed)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={editAgency}
                        onChange={e => setEditAgency(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white font-semibold"
                      >
                        <option value="">Unassigned (Select Agency)</option>
                        {agenciesList.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-3 rounded-lg shrink-0 w-full sm:w-auto"
                        onClick={handleAssignAgencyAction}
                        disabled={submitting}
                      >
                        Save Agency
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION B: UPLOAD SITE RECTIFICATION (Locked for ALL users once work is rectified) */}
              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5 text-blue-600" /> 2. Site Work & Rectification Proof
                </h3>

                {selectedForEdit.physicalStatus === "rectified" ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 text-xs font-medium space-y-2">
                    <div className="flex items-center justify-between font-bold text-emerald-800 border-b border-emerald-200 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Site Work Marked Rectified
                      </span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-bold">Locked / Sealed</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Site work is completed. Rectification proof photo and uploaded drawings are sealed and locked from further changes.
                    </p>
                    {selectedForEdit.completionRemarks && (
                      <p className="text-[11px] text-slate-700 pt-1">
                        <strong>Completion Remarks:</strong> <em>{selectedForEdit.completionRemarks}</em>
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Rectified GPS Photo Upload */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-slate-700">Rectified GPS Photo *</Label>
                      
                      {/* Live Camera Capture */}
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingAfterImage(true)
                        try {
                          const dateStr = new Date().toLocaleString("en-IN")
                          const processed = await compressAndWatermarkImage(file, {
                            maxDim: 800,
                            watermarkLines: [`Rectified Date: ${dateStr}`, `Safety Ticket: ${selectedForEdit.safetyId}`],
                            targetKb: 85
                          })
                          const uploadData = new FormData()
                          uploadData.append("file", processed)
                          uploadData.append("consumerId", selectedForEdit.safetyId || "SAFETY_AFTER")
                          uploadData.append("module", "safety")
                          const res = await fetch("/api/upload-image", { method: "POST", body: uploadData })
                          const result = await res.json()
                          if (res.ok && result.success) {
                            setAfterImageUrl(result.url)
                          } else {
                            alert(result.error || "Upload failed")
                          }
                        } catch (err: any) {
                          alert(err?.message || "Upload failed")
                        } finally {
                          setUploadingAfterImage(false)
                        }
                      }} />

                      {/* Gallery Pick */}
                      <input ref={afterInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingAfterImage(true)
                        try {
                          const dateStr = new Date().toLocaleString("en-IN")
                          const processed = await compressAndWatermarkImage(file, {
                            maxDim: 800,
                            watermarkLines: [`Rectified Date: ${dateStr}`, `Safety Ticket: ${selectedForEdit.safetyId}`],
                            targetKb: 85
                          })
                          const uploadData = new FormData()
                          uploadData.append("file", processed)
                          uploadData.append("consumerId", selectedForEdit.safetyId || "SAFETY_AFTER")
                          uploadData.append("module", "safety")
                          const res = await fetch("/api/upload-image", { method: "POST", body: uploadData })
                          const result = await res.json()
                          if (res.ok && result.success) {
                            setAfterImageUrl(result.url)
                          } else {
                            alert(result.error || "Upload failed")
                          }
                        } catch (err: any) {
                          alert(err?.message || "Upload failed")
                        } finally {
                          setUploadingAfterImage(false)
                        }
                      }} />

                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" className="h-9 text-xs rounded-lg border-blue-300 bg-blue-50/60 hover:bg-blue-100/80 text-blue-700 font-bold" onClick={() => cameraInputRef.current?.click()} disabled={uploadingAfterImage}>
                          {uploadingAfterImage ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Camera className="h-3.5 w-3.5 mr-1 text-blue-600" />}
                          <span>Take Photo (Camera)</span>
                        </Button>

                        <Button type="button" variant="outline" className="h-9 text-xs rounded-lg border-slate-300 bg-slate-50/60 hover:bg-slate-100/80 text-slate-700 font-bold" onClick={() => afterInputRef.current?.click()} disabled={uploadingAfterImage}>
                          {uploadingAfterImage ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-slate-600" />}
                          <span>Gallery Upload</span>
                        </Button>
                      </div>

                      {afterImageUrl && (
                        <div className="flex items-center justify-between text-xs text-emerald-800 font-bold bg-emerald-50 border border-emerald-300 px-2.5 py-1.5 rounded-lg mt-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate text-[11px]">Rectified Photo Attached & Watermarked ✓</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-emerald-700 hover:text-emerald-900" onClick={() => setAfterImageUrl("")}>Change</Button>
                        </div>
                      )}
                    </div>

                    {/* Work Drawing Image (Attached / Optional Upload) */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-200">
                      <Label className="text-[11px] font-bold text-slate-700">Work Drawing Image (Attached / Optional Update)</Label>
                      <input ref={drawingInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleDrawingUpload(e.target.files[0])} />

                      {rectifyDrawingUrl ? (
                        <div className="relative rounded-lg overflow-hidden border border-black bg-purple-50/50 p-2 flex items-center justify-between">
                          <div
                            onClick={() => setPreviewImage({ url: rectifyDrawingUrl, title: "Work Drawing / SLD", ticketId: selectedForEdit.safetyId, type: "Drawing" })}
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                          >
                            <img src={getGoogleDriveDirectLink(rectifyDrawingUrl)} alt="Drawing" className="w-10 h-10 object-cover rounded border border-black" />
                            <div>
                              <span className="text-[10px] font-bold text-purple-900 block">Drawing Attached ✓</span>
                              <span className="text-[9px] text-blue-600 hover:underline">Tap to Preview 🔍</span>
                            </div>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] rounded-md px-2 border-black" onClick={() => drawingInputRef.current?.click()} disabled={uploadingDrawing}>
                            {uploadingDrawing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Change"}
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-8 text-[11px] rounded-lg border-dashed border-slate-400" onClick={() => drawingInputRef.current?.click()} disabled={uploadingDrawing}>
                            <Camera className="h-3.5 w-3.5 mr-1 text-purple-600" /> Upload Drawing
                          </Button>
                          <Button type="button" variant="outline" className="h-8 text-[11px] rounded-lg border-dashed border-slate-400" onClick={() => drawingInputRef.current?.click()} disabled={uploadingDrawing}>
                            <Upload className="h-3.5 w-3.5 mr-1 text-purple-600" /> Gallery
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-700">Completion Remarks</Label>
                      <Textarea
                        value={completionRemarks}
                        onChange={e => setCompletionRemarks(e.target.value)}
                        placeholder="Details of site work executed..."
                        className="min-h-14 text-xs rounded-lg p-2"
                      />
                    </div>

                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 rounded-lg" onClick={handleRectifySubmit} disabled={submitting || !afterImageUrl}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Mark Site Work Rectified"}
                    </Button>
                  </>
                )}
              </div>

              {/* SECTION C: ADMIN NOTE SHEET DETAILS */}
              {isAdmin && (
                <div className="space-y-2 bg-purple-50/60 p-3 rounded-xl border border-purple-200">
                  <h3 className="text-[11px] font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-purple-600" /> 3. Enter Note Sheet Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-slate-600">Note Sheet No *</Label>
                      <Input value={nsNo} onChange={e => setNsNo(e.target.value)} placeholder="NS/2026/101" className="h-8 text-xs rounded-lg font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-slate-600">Est. Amount (₹)</Label>
                      <Input type="number" value={nsAmount} onChange={e => setNsAmount(e.target.value)} placeholder="15000" className="h-8 text-xs rounded-lg" />
                    </div>
                  </div>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 rounded-lg" onClick={handleNoteSheetSubmit} disabled={submitting || !nsNo.trim()}>
                    Save Note Sheet Details
                  </Button>
                </div>
              )}

              {/* SECTION D: ADMIN PO DETAILS */}
              {isAdmin && (
                <div className="space-y-2 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                  <h3 className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 4. Enter PO Details & Finalize
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold text-slate-600">PO Number *</Label>
                      <Input value={poNo} onChange={e => setPoNo(e.target.value)} placeholder="PO/2026/889" className="h-8 text-xs rounded-lg font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-slate-600">PO Amount (₹)</Label>
                      <Input type="number" value={poAmount} onChange={e => setPoAmount(e.target.value)} placeholder="25000" className="h-8 text-xs rounded-lg" />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 rounded-lg" onClick={handlePOSubmit} disabled={submitting || !poNo.trim()}>
                      Save PO & Close Ticket
                    </Button>

                    <Button variant="outline" className="w-full sm:w-auto text-xs font-semibold border-slate-300 text-slate-700 h-8 rounded-lg shrink-0" onClick={() => setConfirmNoPOItem(selectedForEdit)}>
                      PO Not Req.
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t flex justify-end">
              <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-8 px-4 rounded-lg" onClick={() => setSelectedForEdit(null)}>
                Save & Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CONFIRM PO NOT REQUIRED ── */}
      {confirmNoPOItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-white rounded-2xl shadow-2xl p-5 space-y-3 text-center border">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">PO Not Required?</h2>
            <p className="text-xs text-slate-600">
              Are you sure PO is NOT required for ticket <strong className="font-mono text-slate-900">{confirmNoPOItem.safetyId}</strong>? This will mark the ticket as <strong>Fully Closed</strong>.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmNoPOItem(null)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-emerald-600 text-white font-bold" onClick={handleMarkNoPO} disabled={submitting}>
                Confirm & Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: IN-APP IMAGE PREVIEW & DOWNLOAD POPUP ── */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-700">
            {/* Header */}
            <div className="p-3.5 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div>
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-amber-400" />
                  <span>{previewImage.title}</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">Ticket: {previewImage.ticketId}</p>
              </div>
              <Button
                variant="ghost" size="icon"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 h-7 w-7 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Container with black border */}
            <div className="p-3 bg-black flex items-center justify-center max-h-[65vh] overflow-hidden">
              <img
                src={getGoogleDriveDirectLink(previewImage.url)}
                alt={previewImage.title}
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md border border-slate-700"
              />
            </div>

            {/* Footer Controls with Download Button */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {previewImage.ticketId}_{previewImage.type}_Photo.jpg
              </span>

              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleDownloadPreviewImage(previewImage)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 px-3 rounded-lg flex items-center gap-1.5 shadow-md"
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  <span>Download</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewImage(null)}
                  className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEDICATED SAFETY HAZARDS RADAR MAP OVERLAY ── */}
      {showNearbyMap && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-4xl h-full max-h-[85vh]">
            <NearbySafetyMap
              tickets={tickets}
              onClose={() => setShowNearbyMap(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

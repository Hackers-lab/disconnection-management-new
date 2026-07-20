"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Building2,
  Calendar,
  Download,
  Loader2,
  FileText,
  Clock,
  PowerOff,
  Wallet,
  Footprints,
  Trash2,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
  X,
  ArrowLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getFromCache, saveToCache } from "@/lib/indexed-db"

interface HistoryEntry {
  timestamp: string
  consumerId: string
  name: string
  action: string
  oldStatus: string
  newStatus: string
  oldOsd: string
  oldNotes: string
  oldImageUrl: string
  changedBy: string
  amount?: string
  eventDate?: string
}

interface HistoryReportsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: string
  userAgencies: string[]
}

// Robust helper to parse history dates (handles DD-MM-YYYY and YYYY-MM-DD formats)
function parseHistoryDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const clean = dateStr.trim()
  const datePart = clean.split(" ")[0] // remove HH:mm if present
  
  // Try DD-MM-YYYY or DD/MM/YYYY splitting
  const separator = datePart.includes("-") ? "-" : datePart.includes("/") ? "/" : null
  if (separator) {
    const parts = datePart.split(separator)
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD-MM-YYYY
        const day = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10) - 1
        const year = parseInt(parts[2], 10)
        return new Date(year, month, day)
      } else if (parts[0].length === 4) {
        // YYYY-MM-DD
        const year = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10) - 1
        const day = parseInt(parts[2], 10)
        return new Date(year, month, day)
      }
    }
  }
  
  const parsed = new Date(clean)
  return isNaN(parsed.getTime()) ? null : parsed
}

// Convert history entry changedBy into a simple agency name if applicable
function resolveAgencyFromChangedBy(changedBy: string): string {
  if (!changedBy) return "Admin/System"
  const cb = changedBy.trim().toLowerCase()
  if (cb === "upload" || cb === "admin" || cb === "system") {
    return "Admin/System"
  }
  if (cb.startsWith("agency:")) {
    const parts = changedBy.split(":")
    return parts.slice(1).join(":").trim() || "Field Agency"
  }
  return changedBy // fallback
}

export function HistoryReportsDialog({ open, onOpenChange, userRole, userAgencies }: HistoryReportsDialogProps) {
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Date filters
  const [fromDateStr, setFromDateStr] = useState("")
  const [toDateStr, setToDateStr] = useState("")
  const [selectedAgency, setSelectedAgency] = useState("All Agencies")
  const [selectedAction, setSelectedAction] = useState("All Actions")
  const [groupingType, setGroupingType] = useState<"date" | "month">("date")
  const [activeTab, setActiveTab] = useState("summary")

  // Available agencies for filtering
  const [availableAgencies, setAvailableAgencies] = useState<string[]>([])

  // Set default dates to current month range on mount/open
  useEffect(() => {
    if (open) {
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      
      const formatDate = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        return `${y}-${m}-${day}`
      }
      
      setFromDateStr(formatDate(firstDay))
      setToDateStr(formatDate(today))
    }
  }, [open])

  // Fetch full history with IndexedDB Caching
  useEffect(() => {
    let active = true
    async function loadData() {
      if (!open) return
      
      const cacheKey = "all_history_data_cache"
      
      try {
        // 1. Instantly pull from IndexedDB cache
        const cached = await getFromCache<HistoryEntry[]>(cacheKey)
        if (cached && active) {
          setHistoryData(cached)
          setLoading(false)
          
          // Pre-extract agencies from cache to keep select options populated
          const extracted = Array.from(
            new Set(
              cached
                .map(h => resolveAgencyFromChangedBy(h.changedBy))
                .filter(a => a !== "Admin/System" && a !== "Field Agency")
            )
          )
          setAvailableAgencies(extracted)
        } else {
          setLoading(true)
        }

        // 2. Fetch fresh update from API in the background
        const [histResp, agResp] = await Promise.all([
          fetch("/api/consumers/history/all"),
          fetch("/api/admin/agencies").catch(() => null)
        ])

        if (!histResp.ok) {
          throw new Error("Failed to load history spreadsheet records")
        }

        const history: HistoryEntry[] = await histResp.json()
        if (active) {
          setHistoryData(history)
          await saveToCache(cacheKey, history)
        }

        if (agResp && agResp.ok && active) {
          const rawAgencies = await agResp.json()
          const names = rawAgencies.map((a: any) => typeof a === "string" ? a : a.name).filter(Boolean)
          setAvailableAgencies(names)
        } else if (active) {
          const extracted = Array.from(
            new Set(
              history
                .map(h => resolveAgencyFromChangedBy(h.changedBy))
                .filter(a => a !== "Admin/System" && a !== "Field Agency")
            )
          )
          setAvailableAgencies(extracted)
        }
      } catch (err: any) {
        console.error(err)
        if (active) setError(err?.message || "An error occurred while loading reports.")
      } finally {
        if (active) setLoading(false)
      }
    }
    loadData()
    return () => {
      active = false
    }
  }, [open])

  // Force locked agency for agency users
  const activeAgencyFilter = useMemo(() => {
    if (userRole === "agency" && userAgencies && userAgencies.length > 0) {
      return userAgencies[0]
    }
    return selectedAgency
  }, [userRole, userAgencies, selectedAgency])

  // Filtered dataset
  const filteredHistory = useMemo(() => {
    const fromDate = fromDateStr ? new Date(fromDateStr) : null
    if (fromDate) fromDate.setHours(0, 0, 0, 0)
    
    const toDate = toDateStr ? new Date(toDateStr) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)

    return historyData.filter(h => {
      const evDate = parseHistoryDate(h.eventDate || h.timestamp)
      if (!evDate) return false

      if (fromDate && evDate < fromDate) return false
      if (toDate && evDate > toDate) return false

      const entryAgency = resolveAgencyFromChangedBy(h.changedBy)
      if (activeAgencyFilter !== "All Agencies") {
        if (entryAgency.toLowerCase() !== activeAgencyFilter.toLowerCase()) {
          return false
        }
      }

      if (selectedAction !== "All Actions") {
        const actionLower = (h.action || "").toLowerCase()
        const nsLower = (h.newStatus || "").toLowerCase()
        
        if (selectedAction === "Disconnected" && !(nsLower === "disconnected" || nsLower.includes("disconnect"))) return false
        if (selectedAction === "Paid" && !(actionLower === "paid" || nsLower === "paid")) return false
        if (selectedAction === "Visited" && !(nsLower === "visited" || nsLower === "not found")) return false
        if (selectedAction === "Removed from list" && actionLower !== "removed_from_upload") return false
        if (selectedAction === "Listed in cycle" && !actionLower.startsWith("in_new_list")) return false
      }

      return true
    })
  }, [historyData, fromDateStr, toDateStr, activeAgencyFilter, selectedAction])

  // Aggregate stats counts
  const stats = useMemo(() => {
    let disconnections = 0
    let payments = 0
    let visits = 0
    let totalAmt = 0

    filteredHistory.forEach(h => {
      const actionLower = (h.action || "").toLowerCase()
      const nsLower = (h.newStatus || "").toLowerCase()

      if (nsLower === "disconnected" || nsLower.includes("disconnect")) {
        disconnections++
      } else if (actionLower === "paid" || nsLower === "paid") {
        payments++
        const amt = parseFloat(h.amount || "0")
        if (!isNaN(amt)) totalAmt += amt
      } else if (nsLower === "visited" || nsLower === "not found") {
        visits++
      }
    })

    return {
      total: filteredHistory.length,
      disconnections,
      payments,
      visits,
      totalAmt
    }
  }, [filteredHistory])

  // Consolidated Matrix pivot data
  const matrixData = useMemo(() => {
    const counts: Record<string, Record<string, { disconnected: number; paid: number; visited: number; total: number }>> = {}
    const activeAgenciesSet = new Set<string>()

    filteredHistory.forEach(h => {
      const evDate = parseHistoryDate(h.eventDate || h.timestamp)
      if (!evDate) return

      let key = ""
      if (groupingType === "month") {
        const y = evDate.getFullYear()
        const m = String(evDate.getMonth() + 1).padStart(2, "0")
        key = `${y}-${m}`
      } else {
        const y = evDate.getFullYear()
        const m = String(evDate.getMonth() + 1).padStart(2, "0")
        const d = String(evDate.getDate()).padStart(2, "0")
        key = `${y}-${m}-${d}`
      }

      const agency = resolveAgencyFromChangedBy(h.changedBy)
      if (agency === "Admin/System") return

      activeAgenciesSet.add(agency)

      if (!counts[key]) {
        counts[key] = {}
      }
      if (!counts[key][agency]) {
        counts[key][agency] = { disconnected: 0, paid: 0, visited: 0, total: 0 }
      }

      const actionLower = (h.action || "").toLowerCase()
      const nsLower = (h.newStatus || "").toLowerCase()

      counts[key][agency].total++
      if (nsLower === "disconnected" || nsLower.includes("disconnect")) {
        counts[key][agency].disconnected++
      } else if (actionLower === "paid" || nsLower === "paid") {
        counts[key][agency].paid++
      } else if (nsLower === "visited" || nsLower === "not found") {
        counts[key][agency].visited++
      }
    })

    const sortedKeys = Object.keys(counts).sort((a, b) => b.localeCompare(a))
    const sortedAgencies = Array.from(activeAgenciesSet).sort((a, b) => a.localeCompare(b))

    return {
      keys: sortedKeys,
      agencies: sortedAgencies,
      counts
    }
  }, [filteredHistory, groupingType])

  // PDF Exporter action
  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()

      // Header Banner
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, pageWidth, 28, "F")

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont("helvetica", "bold")
      doc.text("Disconnection Activity History Report", 14, 18)

      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.text(`Generated: Date range: ${fromDateStr || "Any"} to ${toDateStr || "Any"}`, 14, 24)

      // Summary Metadata Cards
      doc.setFillColor(248, 250, 252)
      doc.rect(14, 34, pageWidth - 28, 20, "F")
      doc.setDrawColor(226, 232, 240)
      doc.rect(14, 34, pageWidth - 28, 20, "S")

      doc.setTextColor(71, 85, 105)
      doc.setFontSize(10)
      doc.text("SUMMARY METRICS:", 18, 40)

      doc.setTextColor(15, 23, 42)
      doc.text(`Total Field Actions: ${stats.total}`, 18, 48)
      doc.text(`Disconnections: ${stats.disconnections}`, 80, 48)
      doc.text(`Payments Logged: ${stats.payments}`, 142, 48)
      doc.text(`Collection Amount: INR ${stats.totalAmt.toLocaleString("en-IN")}`, 204, 48)

      let lastY = 62

      if (activeTab === "consolidated" && matrixData.keys.length > 0) {
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.text("Agency Breakdown Matrix (Date/Month-wise)", 14, lastY)

        const matrixHeaders = ["Date / Period", ...matrixData.agencies.flatMap(a => [`${a} (DC)`, `${a} (Paid)`]), "Consolidated Total"]
        const matrixRows = matrixData.keys.map(key => {
          const rowData = [key]
          let rowTotal = 0
          matrixData.agencies.forEach(agency => {
            const counts = matrixData.counts[key][agency] || { disconnected: 0, paid: 0 }
            rowData.push(String(counts.disconnected))
            rowData.push(String(counts.paid))
            rowTotal += counts.disconnected + counts.paid
          })
          rowData.push(String(rowTotal))
          return rowData
        })

        autoTable(doc, {
          startY: lastY + 4,
          head: [matrixHeaders],
          body: matrixRows,
          theme: "grid",
          styles: { fontSize: 8, halign: "center" },
          headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: { 0: { halign: "left", fontStyle: "bold" } }
        })

        doc.addPage()
        
        doc.setFillColor(15, 23, 42)
        doc.rect(0, 0, pageWidth, 18, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(12)
        doc.text("Detailed Activity Logs", 14, 12)
        lastY = 24
      }

      doc.setTextColor(15, 23, 42)
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("Detailed Historical Records List", 14, lastY)

      const tableColumn = ["Date & Time", "Consumer ID", "Consumer Name", "Action Type", "Status Change", "Amount", "Done By", "Remarks"]
      const tableRows = filteredHistory.map(h => [
        h.timestamp || "-",
        h.consumerId || "-",
        h.name || "-",
        h.action.replace(/_/g, " "),
        `${h.oldStatus || "Pending"} -> ${h.newStatus || "Pending"}`,
        h.amount ? `INR ${h.amount}` : "-",
        h.changedBy.replace("agency:", ""),
        h.oldNotes || "-"
      ])

      autoTable(doc, {
        startY: lastY + 4,
        head: [tableColumn],
        body: tableRows,
        theme: "striped",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        columnStyles: { 7: { cellWidth: 50 } }
      })

      const totalPages = doc.internal.pages.length - 1
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setTextColor(148, 163, 184)
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 24, pageHeight - 8)
        doc.text("Disconnection Management Suite - Confidential Internal Report", 14, pageHeight - 8)
      }

      doc.save(`Activity_Report_${fromDateStr}_to_${toDateStr}.pdf`)
    } catch (err) {
      console.error("PDF generation failed:", err)
      alert("Failed to generate PDF.")
    }
  }

  // CSV Exporter action
  const handleDownloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,"
    csvContent += "Date & Time,Consumer ID,Consumer Name,Action,Old Status,New Status,Amount,Done By,Remarks\n"
    
    filteredHistory.forEach(h => {
      const row = [
        h.timestamp,
        h.consumerId,
        h.name.replace(/,/g, " "),
        h.action,
        h.oldStatus,
        h.newStatus,
        h.amount || "0",
        h.changedBy,
        (h.oldNotes || "").replace(/,/g, " ").replace(/\n/g, " ")
      ]
      csvContent += row.join(",") + "\n"
    })
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Activity_Report_${fromDateStr}_to_${toDateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto flex flex-col text-slate-900 animate-in fade-in duration-200">
      {/* Top Banner Navigation */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Disconnection Activity History Reports</h1>
              <p className="text-xs text-slate-400">Generate and print spreadsheets and audit reports of field activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleDownloadCSV} variant="outline" className="text-slate-900 border-slate-700 bg-white hover:bg-slate-100 flex items-center gap-1.5 text-xs h-8">
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button onClick={handleDownloadPDF} className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs h-8 shadow-sm">
              <Download className="h-3.5 w-3.5" /> PDF Report
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 ml-2"
              title="Close Reports"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          {/* Dynamic error box */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Loading layout */}
          {loading && historyData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Fetching history logs from Google Sheets...</p>
            </div>
          ) : (
            <>
              {/* Filters selector card */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-3 border-b bg-slate-50/50 py-3">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    Filter Criteria & Range Selector
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
                  {/* Date From */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> From Date
                    </label>
                    <input
                      type="date"
                      value={fromDateStr}
                      onChange={(e) => setFromDateStr(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> To Date
                    </label>
                    <input
                      type="date"
                      value={toDateStr}
                      onChange={(e) => setToDateStr(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Agency Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Agency
                    </label>
                    {userRole === "agency" ? (
                      <input
                        type="text"
                        disabled
                        value={activeAgencyFilter}
                        className="w-full bg-slate-100 border border-slate-200 rounded-md p-1.5 text-xs text-slate-600 cursor-not-allowed font-medium"
                      />
                    ) : (
                      <Select value={selectedAgency} onValueChange={setSelectedAgency}>
                        <SelectTrigger className="w-full bg-white border-slate-200 text-xs h-8">
                          <SelectValue placeholder="Select Agency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All Agencies">All Agencies</SelectItem>
                          {availableAgencies.map((agency) => (
                            <SelectItem key={agency} value={agency}>
                              {agency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Action Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Action Category
                    </label>
                    <Select value={selectedAction} onValueChange={setSelectedAction}>
                      <SelectTrigger className="w-full bg-white border-slate-200 text-xs h-8">
                        <SelectValue placeholder="Select Action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Actions">All Actions</SelectItem>
                        <SelectItem value="Disconnected">Disconnected</SelectItem>
                        <SelectItem value="Paid">Paid Only</SelectItem>
                        <SelectItem value="Visited">Visited / Not Found</SelectItem>
                        <SelectItem value="Removed from list">Removed from list</SelectItem>
                        <SelectItem value="Listed in cycle">Listed in cycle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pivot Matrix Grouping */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Matrix Grouping
                    </label>
                    <Select value={groupingType} onValueChange={(v) => setGroupingType(v as "date" | "month")}>
                      <SelectTrigger className="w-full bg-white border-slate-200 text-xs h-8">
                        <SelectValue placeholder="Grouping" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date-wise</SelectItem>
                        <SelectItem value="month">Month-wise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Metrics grid cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm border-slate-200">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Field Operations</p>
                      <p className="text-xl font-bold text-slate-900">{stats.total}</p>
                    </div>
                    <span className="p-2.5 bg-blue-50 text-blue-600 rounded-full">
                      <Clock className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Disconnections</p>
                      <p className="text-xl font-bold text-red-600">{stats.disconnections}</p>
                    </div>
                    <span className="p-2.5 bg-red-50 text-red-600 rounded-full">
                      <PowerOff className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Payments Logged</p>
                      <p className="text-xl font-bold text-green-600">{stats.payments}</p>
                    </div>
                    <span className="p-2.5 bg-green-50 text-green-600 rounded-full">
                      <Wallet className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Collected Amount</p>
                      <p className="text-lg font-bold text-emerald-700">₹{stats.totalAmt.toLocaleString("en-IN")}</p>
                    </div>
                    <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-full font-bold text-md">₹</span>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs list frame */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-slate-100 p-1 border rounded-lg max-w-sm flex">
                  <TabsTrigger value="summary" className="flex-1 text-xs">Activity Summary</TabsTrigger>
                  {userRole !== "agency" && (
                    <TabsTrigger value="consolidated" className="flex-1 text-xs">Agency Matrix</TabsTrigger>
                  )}
                  <TabsTrigger value="details" className="flex-1 text-xs">Detailed Logs</TabsTrigger>
                </TabsList>

                {/* TAB 1: SUMMARY TIMELINE */}
                <TabsContent value="summary" className="space-y-4 outline-none">
                  <div className="grid gap-6 md:grid-cols-3">
                    {/* Summary Breakdown Metrics */}
                    <Card className="md:col-span-1 shadow-sm border-slate-200">
                      <CardHeader className="pb-3 border-b bg-slate-50/50 py-3">
                        <CardTitle className="text-xs font-bold text-slate-700">Outcome Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-slate-700">
                            <span>Disconnected</span>
                            <span>{stats.disconnections} ({stats.total > 0 ? Math.round((stats.disconnections / stats.total) * 100) : 0}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500 h-full rounded-full"
                              style={{ width: `${stats.total > 0 ? (stats.disconnections / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-slate-700">
                            <span>Paid</span>
                            <span>{stats.payments} ({stats.total > 0 ? Math.round((stats.payments / stats.total) * 100) : 0}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="bg-green-500 h-full rounded-full"
                              style={{ width: `${stats.total > 0 ? (stats.payments / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-slate-700">
                            <span>Visited</span>
                            <span>{stats.visits} ({stats.total > 0 ? Math.round((stats.visits / stats.total) * 100) : 0}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="bg-amber-500 h-full rounded-full"
                              style={{ width: `${stats.total > 0 ? (stats.visits / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Daily Trend List */}
                    <Card className="md:col-span-2 shadow-sm border-slate-200">
                      <CardHeader className="pb-3 border-b bg-slate-50/50 py-3">
                        <CardTitle className="text-xs font-bold text-slate-700">Recent Field Updates Timeline</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 max-h-[300px] overflow-y-auto">
                        {filteredHistory.length === 0 ? (
                          <div className="text-center py-16 text-slate-400 text-xs">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" /> No activity history fits these filters.
                          </div>
                        ) : (
                          <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-4">
                            {filteredHistory.slice(0, 15).map((h, i) => {
                              const isPaid = (h.action || "").toLowerCase() === "paid" || (h.newStatus || "").toLowerCase() === "paid"
                              const isDisc = (h.newStatus || "").toLowerCase() === "disconnected" || (h.newStatus || "").toLowerCase().includes("disconnect")
                              
                              return (
                                <div key={i} className="relative">
                                  <span className={`absolute -left-[22px] top-1.5 h-3.5 w-3.5 rounded-full border border-white flex items-center justify-center ${isPaid ? "bg-green-500" : isDisc ? "bg-red-500" : "bg-slate-400"}`} />
                                  <div className="text-xs">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                      <span>{h.timestamp}</span>
                                      <span className="font-semibold">{resolveAgencyFromChangedBy(h.changedBy)}</span>
                                    </div>
                                    <p className="font-semibold text-slate-900 mt-0.5">
                                      Consumer {h.consumerId} ({h.name}) — <span className="capitalize">{h.action.replace(/_/g, " ")}</span>
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Status: <span className="font-medium text-slate-700">{h.oldStatus || "Pending"} → {h.newStatus || "Pending"}</span>
                                      {h.amount && Number(h.amount) > 0 && ` | Paid: ₹${h.amount}`}
                                    </p>
                                    {h.oldNotes && <p className="text-[10px] text-slate-400 italic mt-0.5">Remarks: {h.oldNotes}</p>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* TAB 2: PIVOT MATRIX */}
                {userRole !== "agency" && (
                  <TabsContent value="consolidated" className="space-y-4 outline-none">
                    <Card className="shadow-sm border-slate-200">
                      <CardHeader className="pb-3 border-b bg-slate-50/50 py-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-bold text-slate-700">Consolidated Activity Count Matrix</CardTitle>
                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">DC: Disconnected | Paid: Payments</span>
                      </CardHeader>
                      <CardContent className="pt-4 overflow-x-auto">
                        {matrixData.keys.length === 0 ? (
                          <div className="text-center py-16 text-slate-400 text-xs">No active agency counts recorded in this date range.</div>
                        ) : (
                          <Table className="border text-xs">
                            <TableHeader className="bg-slate-100 font-bold">
                              <TableRow>
                                <TableHead className="font-bold text-slate-800">Date / Period</TableHead>
                                {matrixData.agencies.map(agency => (
                                  <TableHead key={agency} colSpan={2} className="text-center border-l font-bold text-slate-800">
                                    {agency}
                                  </TableHead>
                                ))}
                                <TableHead className="text-center border-l font-bold text-slate-800">Row Total</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="border-b" />
                                {matrixData.agencies.map(agency => (
                                  <span key={`${agency}-sub`} className="contents">
                                    <TableHead className="text-center text-[9px] border-l text-red-600 font-bold border-b">DC</TableHead>
                                    <TableHead className="text-center text-[9px] text-green-600 font-bold border-b">Paid</TableHead>
                                  </span>
                                ))}
                                <TableHead className="text-center border-l border-b" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {matrixData.keys.map(key => {
                                let rowTotal = 0
                                return (
                                  <TableRow key={key}>
                                    <TableCell className="font-medium font-mono">{key}</TableCell>
                                    {matrixData.agencies.map(agency => {
                                      const c = matrixData.counts[key][agency] || { disconnected: 0, paid: 0 }
                                      rowTotal += c.disconnected + c.paid
                                      return (
                                        <span key={`${key}-${agency}`} className="contents">
                                          <TableCell className={`text-center border-l font-mono ${c.disconnected > 0 ? "font-bold text-red-600 bg-red-50/20" : "text-slate-400"}`}>
                                            {c.disconnected}
                                          </TableCell>
                                          <TableCell className={`text-center font-mono ${c.paid > 0 ? "font-bold text-green-600 bg-green-50/20" : "text-slate-400"}`}>
                                            {c.paid}
                                          </TableCell>
                                        </span>
                                      )
                                    })}
                                    <TableCell className="text-center font-bold border-l font-mono bg-slate-50">{rowTotal}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* TAB 3: LEDGER DETAIL TIMELINES */}
                <TabsContent value="details" className="space-y-4 outline-none">
                  <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-3 border-b bg-slate-50/50 py-3">
                      <CardTitle className="text-xs font-bold text-slate-700">Detailed Action Ledger Log</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 overflow-x-auto p-0 sm:p-6">
                      {filteredHistory.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 text-xs">No entries match your search/filters.</div>
                      ) : (
                        <div className="overflow-hidden rounded-md border border-slate-200">
                          <Table className="text-xs">
                            <TableHeader className="bg-slate-50">
                              <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Consumer ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Status Change</TableHead>
                                <TableHead className="text-right">Amt Paid</TableHead>
                                <TableHead>Operator</TableHead>
                                <TableHead className="max-w-[150px] truncate">Remarks</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredHistory.map((h, i) => (
                                <TableRow key={i} className="hover:bg-slate-50 transition-colors">
                                  <TableCell className="font-mono whitespace-nowrap">{h.timestamp}</TableCell>
                                  <TableCell className="font-medium font-mono text-slate-900">{h.consumerId}</TableCell>
                                  <TableCell className="font-medium">{h.name}</TableCell>
                                  <TableCell>
                                    <span className="capitalize font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                      {h.action.replace(/_/g, " ")}
                                    </span>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded">{h.oldStatus || "Pending"}</span>
                                    <span className="text-slate-400 mx-1">→</span>
                                    <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{h.newStatus || "Pending"}</span>
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-emerald-700 font-mono">
                                    {h.amount && Number(h.amount) > 0 ? `₹${Number(h.amount).toLocaleString("en-IN")}` : "-"}
                                  </TableCell>
                                  <TableCell className="font-medium">{resolveAgencyFromChangedBy(h.changedBy)}</TableCell>
                                  <TableCell className="max-w-[150px] truncate italic text-slate-500" title={h.oldNotes}>
                                    {h.oldNotes || "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
      </div>
    </div>
  )
}

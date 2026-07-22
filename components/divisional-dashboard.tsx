"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Search, RefreshCw, MapPin, FileSpreadsheet, FileDown, Loader2,
  Building2, CheckCircle2, AlertCircle, Phone, X, Eye, TrendingUp, Users,
  BarChart3, ClipboardCheck, ArrowUpRight
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { CCCStatRow, AgencyBreakdown, DDAgencyBreakdown } from "@/app/api/division/stats/route"
import type { DivisionSearchResult } from "@/app/api/division/search/route"

interface DivisionalDashboardProps {
  userRole: string
  username: string
  cccCode: string
}

type DashboardTab = "disconnection" | "deemed"

export function DivisionalDashboard({ userRole, username, cccCode }: DivisionalDashboardProps) {
  const { toast } = useToast()
  
  // Extract division prefix (e.g. 6612 from 6612000 or 6634 from 6634000)
  const divPrefix = useMemo(() => {
    if (/^\d{4}000$/.test(username)) return username.slice(0, 4)
    if (cccCode && cccCode.length >= 4) return cccCode.slice(0, 4)
    return "6612"
  }, [username, cccCode])

  const [activeTab, setActiveTab] = useState<DashboardTab>("disconnection")
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CCCStatRow[]>([])
  const [totals, setTotals] = useState<Omit<CCCStatRow, "cccCode" | "cccName" | "agencyBreakdown" | "ddAgencyBreakdown">>({
    targetCount: 0, targetAmount: 0,
    disconCount: 0, disconAmount: 0,
    paidCount: 0, paidAmount: 0,
    pendingCount: 0, pendingAmount: 0,
    recoveryPercent: 0,
    ddTargetCount: 0, ddTargetAmount: 0,
    ddCompletedCount: 0, ddCompletedAmount: 0,
    ddLockedCount: 0, ddLockedAmount: 0,
    ddPendingCount: 0, ddPendingAmount: 0,
    ddCompletionPercent: 0,
  })

  // Selected CCC for Agency Performance Popup Modal
  const [selectedCCC, setSelectedCCC] = useState<CCCStatRow | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<DivisionSearchResult[]>([])

  // Map dialog state
  const [mapOpen, setMapOpen] = useState(false)
  const [mapConsumers, setMapConsumers] = useState<DivisionSearchResult[]>([])
  const [loadingMap, setLoadingMap] = useState(false)

  // Load division stats
  const loadStats = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/division/stats?division=${divPrefix}`)
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load stats")
      const data = await res.json()
      setRows(data.rows || [])
      setTotals(data.totals || {})
    } catch (err: any) {
      toast({ title: "Failed to load division statistics", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStats() }, [divPrefix])

  // Handle global consumer search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/division/search?q=${encodeURIComponent(searchQuery)}&division=${divPrefix}`)
      if (!res.ok) throw new Error("Search failed")
      const data = await res.json()
      setSearchResults(data.results || [])
      if ((data.results || []).length === 0) {
        toast({ title: "No consumers found", description: `No records matching "${searchQuery}" in Division ${divPrefix}` })
      }
    } catch (err: any) {
      toast({ title: "Search Error", description: err.message, variant: "destructive" })
    } finally {
      setSearching(false)
    }
  }

  // Load map consumers across division
  const openMapModal = async () => {
    setMapOpen(true)
    if (mapConsumers.length > 0) return
    setLoadingMap(true)
    try {
      const res = await fetch(`/api/division/search?q=a&division=${divPrefix}`)
      if (res.ok) {
        const data = await res.json()
        const withCoords = (data.results || []).filter((c: any) => c.latitude && c.longitude)
        setMapConsumers(withCoords)
      }
    } catch {
      // Ignore map load fallback
    } finally {
      setLoadingMap(false)
    }
  }

  // Export Summary Excel
  const exportExcel = async () => {
    if (rows.length === 0) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    if (activeTab === "disconnection") {
      const exportRows = rows.map((r, i) => ({
        "#": i + 1,
        "CCC Code": r.cccCode,
        "CCC Name": r.cccName,
        "Target List Count": r.targetCount,
        "Target Dues (₹)": r.targetAmount,
        "Disconnected Count": r.disconCount,
        "Disconnected Dues (₹)": r.disconAmount,
        "Paid / Recovered Count": r.paidCount,
        "Paid Amount Collected (₹)": r.paidAmount,
        "Pending Count": r.pendingCount,
        "Pending Dues (₹)": r.pendingAmount,
        "Recovery Rate %": `${r.recoveryPercent}%`,
      }))

      exportRows.push({
        "#": 0,
        "CCC Code": "TOTAL",
        "CCC Name": `DIVISION ${divPrefix} TOTAL`,
        "Target List Count": totals.targetCount,
        "Target Dues (₹)": totals.targetAmount,
        "Disconnected Count": totals.disconCount,
        "Disconnected Dues (₹)": totals.disconAmount,
        "Paid / Recovered Count": totals.paidCount,
        "Paid Amount Collected (₹)": totals.paidAmount,
        "Pending Count": totals.pendingCount,
        "Pending Dues (₹)": totals.pendingAmount,
        "Recovery Rate %": `${totals.recoveryPercent}%`,
      })

      const ws = XLSX.utils.json_to_sheet(exportRows)
      ws["!cols"] = [
        { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
        { wch: 18 }, { wch: 16 }
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Disconnection Stats")
    } else {
      const exportRows = rows.map((r, i) => ({
        "#": i + 1,
        "CCC Code": r.cccCode,
        "CCC Name": r.cccName,
        "Total Assigned": r.ddTargetCount,
        "Total Arrears (₹)": r.ddTargetAmount,
        "Deemed Completed": r.ddCompletedCount,
        "Completed Arrears (₹)": r.ddCompletedAmount,
        "Premise Locked / Untraceable": r.ddLockedCount,
        "Locked Arrears (₹)": r.ddLockedAmount,
        "Pending Visits": r.ddPendingCount,
        "Pending Arrears (₹)": r.ddPendingAmount,
        "Completion Rate %": `${r.ddCompletionPercent}%`,
      }))

      exportRows.push({
        "#": 0,
        "CCC Code": "TOTAL",
        "CCC Name": `DIVISION ${divPrefix} TOTAL`,
        "Total Assigned": totals.ddTargetCount,
        "Total Arrears (₹)": totals.ddTargetAmount,
        "Deemed Completed": totals.ddCompletedCount,
        "Completed Arrears (₹)": totals.ddCompletedAmount,
        "Premise Locked / Untraceable": totals.ddLockedCount,
        "Locked Arrears (₹)": totals.ddLockedAmount,
        "Pending Visits": totals.ddPendingCount,
        "Pending Arrears (₹)": totals.ddPendingAmount,
        "Completion Rate %": `${totals.ddCompletionPercent}%`,
      })

      const ws = XLSX.utils.json_to_sheet(exportRows)
      ws["!cols"] = [
        { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 16 }
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Deemed Visit Stats")
    }

    XLSX.writeFile(wb, `Division_${divPrefix}_${activeTab.toUpperCase()}_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Excel report exported successfully" })
  }

  // Export PDF Report
  const exportPDF = async () => {
    if (rows.length === 0) return
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    const titleText = activeTab === "disconnection"
      ? `Division ${divPrefix} Disconnection & Recovery Report`
      : `Division ${divPrefix} Deemed Visit Audit Report`

    doc.setFontSize(16)
    doc.setTextColor(15, 23, 42)
    doc.text(titleText, pw / 2, 14, { align: "center" })

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")} | Division Code: ${divPrefix}`, pw / 2, 20, { align: "center" })

    if (activeTab === "disconnection") {
      const tableData = rows.map((r, i) => [
        i + 1, r.cccCode, r.cccName,
        r.targetCount, `₹${r.targetAmount.toLocaleString("en-IN")}`,
        r.disconCount, `₹${r.disconAmount.toLocaleString("en-IN")}`,
        r.paidCount, `₹${r.paidAmount.toLocaleString("en-IN")}`,
        r.pendingCount, `₹${r.pendingAmount.toLocaleString("en-IN")}`,
        `${r.recoveryPercent}%`
      ])

      tableData.push([
        "", "TOTAL", "DIVISION TOTAL",
        totals.targetCount, `₹${totals.targetAmount.toLocaleString("en-IN")}`,
        totals.disconCount, `₹${totals.disconAmount.toLocaleString("en-IN")}`,
        totals.paidCount, `₹${totals.paidAmount.toLocaleString("en-IN")}`,
        totals.pendingCount, `₹${totals.pendingAmount.toLocaleString("en-IN")}`,
        `${totals.recoveryPercent}%`
      ])

      autoTable(doc, {
        startY: 25,
        head: [
          [{ content: "Sub-Division Info", colSpan: 3, styles: { halign: "center", fillColor: [15, 23, 42] } },
           { content: "Target List", colSpan: 2, styles: { halign: "center", fillColor: [30, 41, 59] } },
           { content: "Executed Disconnections", colSpan: 2, styles: { halign: "center", fillColor: [185, 28, 28] } },
           { content: "Payment Recovered", colSpan: 2, styles: { halign: "center", fillColor: [21, 128, 61] } },
           { content: "Pending Dues", colSpan: 2, styles: { halign: "center", fillColor: [180, 83, 9] } },
           { content: "Recovery Rate", colSpan: 1, styles: { halign: "center", fillColor: [29, 78, 216] } }],
          ["#", "CCC Code", "CCC Name", "Count", "Dues (₹)", "Count", "Dues (₹)", "Count", "Amount (₹)", "Count", "Dues (₹)", "Rate %"]
        ],
        body: tableData,
        styles: { fontSize: 7, font: "helvetica", halign: "center" },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold" },
        columnStyles: { 2: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = "bold"
            data.cell.styles.fillColor = [240, 243, 246]
            data.cell.styles.textColor = [15, 23, 42]
          }
        },
        theme: "grid"
      })
    } else {
      const tableData = rows.map((r, i) => [
        i + 1, r.cccCode, r.cccName,
        r.ddTargetCount, `₹${r.ddTargetAmount.toLocaleString("en-IN")}`,
        r.ddCompletedCount, `₹${r.ddCompletedAmount.toLocaleString("en-IN")}`,
        r.ddLockedCount, `₹${r.ddLockedAmount.toLocaleString("en-IN")}`,
        r.ddPendingCount, `₹${r.ddPendingAmount.toLocaleString("en-IN")}`,
        `${r.ddCompletionPercent}%`
      ])

      tableData.push([
        "", "TOTAL", "DIVISION TOTAL",
        totals.ddTargetCount, `₹${totals.ddTargetAmount.toLocaleString("en-IN")}`,
        totals.ddCompletedCount, `₹${totals.ddCompletedAmount.toLocaleString("en-IN")}`,
        totals.ddLockedCount, `₹${totals.ddLockedAmount.toLocaleString("en-IN")}`,
        totals.ddPendingCount, `₹${totals.ddPendingAmount.toLocaleString("en-IN")}`,
        `${totals.ddCompletionPercent}%`
      ])

      autoTable(doc, {
        startY: 25,
        head: [
          [{ content: "Sub-Division Info", colSpan: 3, styles: { halign: "center", fillColor: [15, 23, 42] } },
           { content: "Assigned List", colSpan: 2, styles: { halign: "center", fillColor: [30, 41, 59] } },
           { content: "Deemed Completed", colSpan: 2, styles: { halign: "center", fillColor: [21, 128, 61] } },
           { content: "Locked / Untraceable", colSpan: 2, styles: { halign: "center", fillColor: [180, 83, 9] } },
           { content: "Pending Visits", colSpan: 2, styles: { halign: "center", fillColor: [185, 28, 28] } },
           { content: "Completion Rate", colSpan: 1, styles: { halign: "center", fillColor: [29, 78, 216] } }],
          ["#", "CCC Code", "CCC Name", "Count", "Arrears (₹)", "Count", "Arrears (₹)", "Count", "Arrears (₹)", "Count", "Arrears (₹)", "Rate %"]
        ],
        body: tableData,
        styles: { fontSize: 7, font: "helvetica", halign: "center" },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold" },
        columnStyles: { 2: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = "bold"
            data.cell.styles.fillColor = [240, 243, 246]
            data.cell.styles.textColor = [15, 23, 42]
          }
        },
        theme: "grid"
      })
    }

    doc.save(`Division_${divPrefix}_${activeTab.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast({ title: "PDF report exported successfully" })
  }

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="bg-slate-950 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-950 px-2.5 py-0.5 rounded-full border border-blue-800/50">
                Division Control Panel
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-2 tracking-tight">
              Division <span className="font-mono text-blue-400">{divPrefix}</span> Performance Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Sub-divisional analytics for Disconnections, Recoveries & Deemed Visit Audits across all child CCCs matching {divPrefix}xxx
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-9"
              onClick={openMapModal}
            >
              <MapPin className="h-4 w-4 mr-1.5 text-blue-400" /> Locate Consumers Map
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-9"
              onClick={loadStats}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin text-blue-400" : ""}`} /> Refresh Stats
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveTab("disconnection")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "disconnection"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="h-4 w-4" /> Disconnection & Recovery Performance
          </button>

          <button
            onClick={() => setActiveTab("deemed")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "deemed"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <ClipboardCheck className="h-4 w-4" /> Deemed Visit Audit Performance
          </button>
        </div>
      </div>

      {/* Global Search Bar */}
      <Card className="border border-slate-200 shadow-sm bg-white">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Search consumer by Consumer ID, Name, Mobile, or Address across Division ${divPrefix}...`}
                className="pl-10 h-10 text-sm rounded-xl"
              />
              {searchQuery && (
                <X className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => { setSearchQuery(""); setSearchResults([]) }} />
              )}
            </div>
            <Button type="submit" disabled={searching} className="bg-slate-950 hover:bg-slate-900 text-white rounded-xl h-10 px-5 text-xs font-semibold">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search Division"}
            </Button>
          </form>

          {/* Search Results Display */}
          {searchResults.length > 0 && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Found {searchResults.length} matching consumers across division:</p>
                <button onClick={() => setSearchResults([])} className="text-xs text-gray-400 hover:text-gray-600">Clear results</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                {searchResults.map((c) => (
                  <div key={`${c.cccCode}-${c.consumerId}`} className="border rounded-xl p-3 bg-slate-50/50 hover:bg-white hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs font-bold text-blue-700">{c.consumerId}</span>
                      <Badge variant="outline" className="text-[10px] bg-slate-100 font-semibold">{c.cccName} ({c.cccCode})</Badge>
                    </div>
                    <p className="font-bold text-gray-900 text-sm mt-1">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1"><MapPin className="inline h-3 w-3 mr-1 text-gray-400" />{c.address}</p>
                    <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t text-gray-600">
                      <span>Dues: <strong className="text-slate-900 font-mono">₹{parseFloat(c.d2NetOS || "0").toLocaleString("en-IN")}</strong></span>
                      <Badge className={`text-[10px] capitalize ${c.disconStatus === "disconnected" ? "bg-red-100 text-red-700" : c.disconStatus === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
                        {c.disconStatus || "Connected"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DISCONNECTION TAB VIEW */}
      {activeTab === "disconnection" && (
        <>
          {/* Disconnection KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Discon Target List</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totals.targetCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-gray-500 mt-0.5">₹{totals.targetAmount.toLocaleString("en-IN")} total dues</p>
            </div>

            <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">Disconnected</p>
              <p className="text-2xl font-black text-red-700 mt-1">{totals.disconCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-red-800 mt-0.5">₹{totals.disconAmount.toLocaleString("en-IN")} discon O/S</p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Payments Recovered</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{totals.paidCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-emerald-800 mt-0.5">₹{totals.paidAmount.toLocaleString("en-IN")} collected</p>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Defaulters</p>
              <p className="text-2xl font-black text-amber-700 mt-1">{totals.pendingCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-amber-800 mt-0.5">₹{totals.pendingAmount.toLocaleString("en-IN")} pending O/S</p>
            </div>

            <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Recovery Rate %</p>
              <p className="text-2xl font-black text-blue-700 mt-1">{totals.recoveryPercent}%</p>
              <p className="text-xs text-blue-800 mt-0.5">Paid Amount / Target Dues</p>
            </div>
          </div>

          {/* 2-Tier Grouped Header Disconnection Matrix */}
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="px-5 py-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Disconnection & Recovery Matrix (Sub-Division Level)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Click on any <span className="font-bold text-blue-600">CCC Code</span> to view field agency performance breakdown</p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50 hover:bg-green-100" onClick={exportExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50 hover:bg-red-100" onClick={exportPDF}>
                  <FileDown className="h-3.5 w-3.5" /> Export PDF
                </Button>
              </div>
            </div>

            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="py-16 text-center text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                  <p className="text-xs font-medium">Fetching Division {divPrefix} stats from sub-divisional spreadsheets...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold">No registered CCCs found matching prefix {divPrefix}</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {/* Top Header Group */}
                    <tr className="bg-slate-900 text-white font-bold border-b text-[11px] uppercase tracking-wider">
                      <th colSpan={3} className="px-3 py-2 text-left border-r border-slate-700">Sub-Division Info</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-slate-800">Target List</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-red-950/80 text-red-300">Executed Discon</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-emerald-950/80 text-emerald-300">Payment Recovered</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-amber-950/80 text-amber-300">Pending Defaulters</th>
                      <th colSpan={1} className="px-3 py-2 text-center bg-blue-950 text-blue-300">Recovery Rate</th>
                    </tr>
                    {/* Sub Header */}
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b text-xs">
                      <th className="px-3 py-2.5 text-center w-8">#</th>
                      <th className="px-3 py-2.5 text-left border-r">CCC Code</th>
                      <th className="px-3 py-2.5 text-left border-r">CCC Name</th>
                      <th className="px-3 py-2.5 text-right">Count</th>
                      <th className="px-3 py-2.5 text-right border-r">Target Dues (₹)</th>
                      <th className="px-3 py-2.5 text-right text-red-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-red-700 border-r">Discon Dues (₹)</th>
                      <th className="px-3 py-2.5 text-right text-green-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-green-700 border-r">Paid Amount (₹)</th>
                      <th className="px-3 py-2.5 text-right text-amber-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-amber-700 border-r">Pending Dues (₹)</th>
                      <th className="px-3 py-2.5 text-center bg-blue-50/80 text-blue-900 font-black">Recovery %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-800 font-medium">
                    {rows.map((r, i) => (
                      <tr key={r.cccCode} className="hover:bg-slate-50 transition">
                        <td className="px-3 py-3 text-center text-gray-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-3 font-mono font-bold border-r">
                          <button
                            onClick={() => setSelectedCCC(r)}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-mono font-bold"
                            title="Click to view field agency performance for this CCC"
                          >
                            {r.cccCode} <ArrowUpRight className="h-3 w-3 text-blue-400" />
                          </button>
                        </td>
                        <td className="px-3 py-3 font-bold text-gray-900 border-r">{r.cccName}</td>
                        <td className="px-3 py-3 text-right font-mono">{r.targetCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-gray-600 border-r">₹{r.targetAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-red-600">{r.disconCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-red-600 border-r">₹{r.disconAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-green-600">{r.paidCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-green-600 border-r">₹{r.paidAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-amber-700">{r.pendingCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-amber-700 border-r">₹{r.pendingAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-center bg-blue-50/30">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${r.recoveryPercent >= 50 ? "bg-green-100 text-green-800" : r.recoveryPercent >= 25 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                            {r.recoveryPercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-bold text-xs border-t">
                    <tr>
                      <td colSpan={3} className="px-4 py-3.5 text-left border-r border-slate-800">
                        DIVISION {divPrefix} GRAND TOTAL
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono">{totals.targetCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono border-r border-slate-800">₹{totals.targetAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-red-400">{totals.disconCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-red-400 border-r border-slate-800">₹{totals.disconAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-green-400">{totals.paidCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-green-400 border-r border-slate-800">₹{totals.paidAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-amber-400">{totals.pendingCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-amber-400 border-r border-slate-800">₹{totals.pendingAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-center bg-slate-800">
                        <span className="bg-blue-600 text-white px-2.5 py-1 rounded-full text-xs font-black">
                          {totals.recoveryPercent}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* DEEMED VISIT TAB VIEW */}
      {activeTab === "deemed" && (
        <>
          {/* Deemed KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Assigned Deemed</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totals.ddTargetCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-gray-500 mt-0.5">₹{totals.ddTargetAmount.toLocaleString("en-IN")} total arrears</p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Deemed Visited</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{totals.ddCompletedCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-emerald-800 mt-0.5">₹{totals.ddCompletedAmount.toLocaleString("en-IN")} visited</p>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Locked / Untraceable</p>
              <p className="text-2xl font-black text-amber-700 mt-1">{totals.ddLockedCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-amber-800 mt-0.5">₹{totals.ddLockedAmount.toLocaleString("en-IN")} locked</p>
            </div>

            <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">Pending Visits</p>
              <p className="text-2xl font-black text-red-700 mt-1">{totals.ddPendingCount.toLocaleString("en-IN")}</p>
              <p className="text-xs font-mono text-red-800 mt-0.5">₹{totals.ddPendingAmount.toLocaleString("en-IN")} pending</p>
            </div>

            <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Completion Rate %</p>
              <p className="text-2xl font-black text-blue-700 mt-1">{totals.ddCompletionPercent}%</p>
              <p className="text-xs text-blue-800 mt-0.5">(Visited + Locked) / Assigned</p>
            </div>
          </div>

          {/* 2-Tier Grouped Header Deemed Matrix */}
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="px-5 py-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Deemed Visit Audit Matrix (Sub-Division Level)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Click on any <span className="font-bold text-blue-600">CCC Code</span> to view field agency deemed performance</p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-green-200 text-green-700 bg-green-50 hover:bg-green-100" onClick={exportExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-700 bg-red-50 hover:bg-red-100" onClick={exportPDF}>
                  <FileDown className="h-3.5 w-3.5" /> Export PDF
                </Button>
              </div>
            </div>

            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="py-16 text-center text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                  <p className="text-xs font-medium">Fetching Division {divPrefix} deemed stats...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold">No registered CCCs found matching prefix {divPrefix}</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {/* Top Header Group */}
                    <tr className="bg-slate-900 text-white font-bold border-b text-[11px] uppercase tracking-wider">
                      <th colSpan={3} className="px-3 py-2 text-left border-r border-slate-700">Sub-Division Info</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-slate-800">Assigned List</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-emerald-950/80 text-emerald-300">Deemed Completed</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-amber-950/80 text-amber-300">Locked / Untraceable</th>
                      <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-700 bg-red-950/80 text-red-300">Pending Visits</th>
                      <th colSpan={1} className="px-3 py-2 text-center bg-blue-950 text-blue-300">Completion Rate</th>
                    </tr>
                    {/* Sub Header */}
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b text-xs">
                      <th className="px-3 py-2.5 text-center w-8">#</th>
                      <th className="px-3 py-2.5 text-left border-r">CCC Code</th>
                      <th className="px-3 py-2.5 text-left border-r">CCC Name</th>
                      <th className="px-3 py-2.5 text-right">Count</th>
                      <th className="px-3 py-2.5 text-right border-r">Arrears (₹)</th>
                      <th className="px-3 py-2.5 text-right text-green-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-green-700 border-r">Completed (₹)</th>
                      <th className="px-3 py-2.5 text-right text-amber-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-amber-700 border-r">Locked (₹)</th>
                      <th className="px-3 py-2.5 text-right text-red-700">Count</th>
                      <th className="px-3 py-2.5 text-right text-red-700 border-r">Pending (₹)</th>
                      <th className="px-3 py-2.5 text-center bg-blue-50/80 text-blue-900 font-black">Completion %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-800 font-medium">
                    {rows.map((r, i) => (
                      <tr key={r.cccCode} className="hover:bg-slate-50 transition">
                        <td className="px-3 py-3 text-center text-gray-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-3 font-mono font-bold border-r">
                          <button
                            onClick={() => setSelectedCCC(r)}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-mono font-bold"
                            title="Click to view field agency deemed performance for this CCC"
                          >
                            {r.cccCode} <ArrowUpRight className="h-3 w-3 text-blue-400" />
                          </button>
                        </td>
                        <td className="px-3 py-3 font-bold text-gray-900 border-r">{r.cccName}</td>
                        <td className="px-3 py-3 text-right font-mono">{r.ddTargetCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-gray-600 border-r">₹{r.ddTargetAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-green-600">{r.ddCompletedCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-green-600 border-r">₹{r.ddCompletedAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-amber-700">{r.ddLockedCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-amber-700 border-r">₹{r.ddLockedAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-red-600">{r.ddPendingCount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-mono text-red-600 border-r">₹{r.ddPendingAmount.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-center bg-blue-50/30">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${r.ddCompletionPercent >= 75 ? "bg-green-100 text-green-800" : r.ddCompletionPercent >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                            {r.ddCompletionPercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-bold text-xs border-t">
                    <tr>
                      <td colSpan={3} className="px-4 py-3.5 text-left border-r border-slate-800">
                        DIVISION {divPrefix} GRAND TOTAL
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono">{totals.ddTargetCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono border-r border-slate-800">₹{totals.ddTargetAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-green-400">{totals.ddCompletedCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-green-400 border-r border-slate-800">₹{totals.ddCompletedAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-amber-400">{totals.ddLockedCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-amber-400 border-r border-slate-800">₹{totals.ddLockedAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-red-400">{totals.ddPendingCount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-red-400 border-r border-slate-800">₹{totals.ddPendingAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3.5 text-center bg-slate-800">
                        <span className="bg-blue-600 text-white px-2.5 py-1 rounded-full text-xs font-black">
                          {totals.ddCompletionPercent}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Agency Performance Breakdown Modal (Triggered by clicking on CCC Code) */}
      <Dialog open={!!selectedCCC} onOpenChange={open => { if (!open) setSelectedCCC(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Agency Performance — {selectedCCC?.cccName} ({selectedCCC?.cccCode})
            </DialogTitle>
          </DialogHeader>

          {selectedCCC && (
            <div className="space-y-5 py-2">
              {/* CCC Summary Line */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border">
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Discon Target</p>
                  <p className="text-sm font-extrabold text-slate-900">{selectedCCC.targetCount} consumers</p>
                  <p className="text-[11px] font-mono text-gray-500">₹{selectedCCC.targetAmount.toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-700 font-bold uppercase">Recovered</p>
                  <p className="text-sm font-extrabold text-emerald-700">₹{selectedCCC.paidAmount.toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-emerald-800">{selectedCCC.paidCount} paid consumers</p>
                </div>
                <div>
                  <p className="text-[10px] text-red-700 font-bold uppercase">Disconnected</p>
                  <p className="text-sm font-extrabold text-red-700">{selectedCCC.disconCount} consumers</p>
                  <p className="text-[11px] font-mono text-red-700">₹{selectedCCC.disconAmount.toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-blue-700 font-bold uppercase">Recovery Rate</p>
                  <p className="text-sm font-black text-blue-700">{selectedCCC.recoveryPercent}%</p>
                  <p className="text-[11px] text-blue-800">Paid / Target Dues</p>
                </div>
              </div>

              {/* Agency Table for Disconnections */}
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Field Agency Disconnection & Recovery Breakdown</span>
                  <Badge variant="outline" className="text-[10px]">{selectedCCC.agencyBreakdown.length} Agencies</Badge>
                </h3>

                {selectedCCC.agencyBreakdown.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-4 text-center">No agency assignments recorded for this sub-division.</p>
                ) : (
                  <table className="w-full text-xs border rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Agency Name</th>
                        <th className="px-3 py-2 text-right">Target List</th>
                        <th className="px-3 py-2 text-right text-red-700">Disconnected</th>
                        <th className="px-3 py-2 text-right text-green-700">Paid Consumers</th>
                        <th className="px-3 py-2 text-right text-green-700">Amount Collected (₹)</th>
                        <th className="px-3 py-2 text-center bg-blue-50 text-blue-900">Recovery %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-800 font-medium">
                      {selectedCCC.agencyBreakdown.map((ag) => (
                        <tr key={ag.agencyName} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                            {ag.agencyName}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{ag.targetCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{ag.disconCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-green-600">{ag.paidCount}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-600">₹{ag.paidAmount.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2 text-center bg-blue-50/50">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${ag.recoveryPercent >= 50 ? "bg-green-100 text-green-800" : ag.recoveryPercent >= 25 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                              {ag.recoveryPercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Agency Table for Deemed Visits */}
              {selectedCCC.ddAgencyBreakdown && selectedCCC.ddAgencyBreakdown.length > 0 && (
                <div className="pt-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Field Agency Deemed Visit Breakdown</span>
                    <Badge variant="outline" className="text-[10px]">{selectedCCC.ddAgencyBreakdown.length} Agencies</Badge>
                  </h3>

                  <table className="w-full text-xs border rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Agency Name</th>
                        <th className="px-3 py-2 text-right">Assigned List</th>
                        <th className="px-3 py-2 text-right text-green-700">Deemed Completed</th>
                        <th className="px-3 py-2 text-right text-amber-700">Locked / Untraceable</th>
                        <th className="px-3 py-2 text-right text-red-700">Pending Visits</th>
                        <th className="px-3 py-2 text-center bg-blue-50 text-blue-900">Completion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-800 font-medium">
                      {selectedCCC.ddAgencyBreakdown.map((ag) => (
                        <tr key={ag.agencyName} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-900">{ag.agencyName}</td>
                          <td className="px-3 py-2 text-right font-mono">{ag.targetCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-green-600">{ag.completedCount}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">{ag.lockedCount}</td>
                          <td className="px-3 py-2 text-right font-mono text-red-600">{ag.pendingCount}</td>
                          <td className="px-3 py-2 text-center bg-blue-50/50">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${ag.completionPercent >= 75 ? "bg-green-100 text-green-800" : ag.completionPercent >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                              {ag.completionPercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedCCC(null)}>Close Breakdown</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Map Dialog */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              Division {divPrefix} Consumer Location Map
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loadingMap ? (
              <div className="py-16 text-center text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-xs font-medium">Loading geolocated consumers across Division {divPrefix}...</p>
              </div>
            ) : mapConsumers.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl text-gray-500 text-sm">
                No GPS-tagged consumers recorded yet across sub-divisional CCCs in Division {divPrefix}.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Displaying {mapConsumers.length} GPS geolocated points under Division {divPrefix}:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {mapConsumers.map((c) => (
                    <div key={`${c.cccCode}-${c.consumerId}`} className="border rounded-xl p-3 bg-white hover:border-blue-300 transition">
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-xs font-bold text-blue-700">{c.consumerId}</span>
                        <span className="text-[10px] font-bold text-gray-500 bg-slate-100 px-2 py-0.5 rounded-full">{c.cccName}</span>
                      </div>
                      <p className="font-bold text-sm text-slate-900 mt-1">{c.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{c.address}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
                        <span className="font-mono text-blue-600 font-medium">📍 {c.latitude}, {c.longitude}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          Open in Google Maps ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

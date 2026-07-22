"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Search, RefreshCw, MapPin, FileSpreadsheet, FileDown, Loader2,
  Building2, CheckCircle2, AlertCircle, Phone, X, Eye, TrendingUp, Users
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { CCCStatRow } from "@/app/api/division/stats/route"
import type { DivisionSearchResult } from "@/app/api/division/search/route"

interface DivisionalDashboardProps {
  userRole: string
  username: string
  cccCode: string
}

export function DivisionalDashboard({ userRole, username, cccCode }: DivisionalDashboardProps) {
  const { toast } = useToast()
  
  // Extract division prefix (e.g. 6612 from 6612000 or 6634 from 6634000)
  const divPrefix = useMemo(() => {
    if (/^\d{4}000$/.test(username)) return username.slice(0, 4)
    if (cccCode && cccCode.length >= 4) return cccCode.slice(0, 4)
    return "6612"
  }, [username, cccCode])

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CCCStatRow[]>([])
  const [totals, setTotals] = useState<Omit<CCCStatRow, "cccCode" | "cccName">>({
    targetCount: 0, targetAmount: 0,
    disconCount: 0, disconAmount: 0,
    paidCount: 0, paidAmount: 0,
    visitedCount: 0,
    pendingCount: 0, pendingAmount: 0,
    attendedPercent: 0,
  })

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
      // Search with empty or wildcard to fetch geolocated consumers
      const res = await fetch(`/api/division/search?q=a&division=${divPrefix}`)
      if (res.ok) {
        const data = await res.json()
        const withCoords = (data.results || []).filter((c: any) => c.latitude && c.longitude)
        setMapConsumers(withCoords)
      }
    } catch {
      // Ignore map load error fallback
    } finally {
      setLoadingMap(false)
    }
  }

  // Export Summary Excel
  const exportExcel = async () => {
    if (rows.length === 0) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    const exportRows = rows.map((r, i) => ({
      "#": i + 1,
      "CCC Code": r.cccCode,
      "CCC Name": r.cccName,
      "Target List Count": r.targetCount,
      "Target Dues (₹)": r.targetAmount,
      "Disconnected Count": r.disconCount,
      "Disconnected Dues (₹)": r.disconAmount,
      "Paid / Recovered Count": r.paidCount,
      "Paid / Recovered Dues (₹)": r.paidAmount,
      "Deemed / Visited Count": r.visitedCount,
      "Pending Count": r.pendingCount,
      "Pending Dues (₹)": r.pendingAmount,
      "Attended %": `${r.attendedPercent}%`,
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
      "Paid / Recovered Dues (₹)": totals.paidAmount,
      "Deemed / Visited Count": totals.visitedCount,
      "Pending Count": totals.pendingCount,
      "Pending Dues (₹)": totals.pendingAmount,
      "Attended %": `${totals.attendedPercent}%`,
    })

    const ws = XLSX.utils.json_to_sheet(exportRows)
    ws["!cols"] = [
      { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, "Division Stats")
    XLSX.writeFile(wb, `Division_${divPrefix}_Performance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Excel report exported successfully" })
  }

  // Export PDF Report
  const exportPDF = async () => {
    if (rows.length === 0) return
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")

    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    doc.setFontSize(16)
    doc.setTextColor(15, 23, 42)
    doc.text(`Division ${divPrefix} Performance Dashboard Report`, pw / 2, 14, { align: "center" })

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")} | Division Code: ${divPrefix}`, pw / 2, 20, { align: "center" })

    const tableData = rows.map((r, i) => [
      i + 1,
      r.cccCode,
      r.cccName,
      r.targetCount,
      `₹${r.targetAmount.toLocaleString("en-IN")}`,
      r.disconCount,
      `₹${r.disconAmount.toLocaleString("en-IN")}`,
      r.paidCount,
      `₹${r.paidAmount.toLocaleString("en-IN")}`,
      r.pendingCount,
      `₹${r.pendingAmount.toLocaleString("en-IN")}`,
      `${r.attendedPercent}%`
    ])

    tableData.push([
      "",
      "TOTAL",
      "DIVISION TOTAL",
      totals.targetCount,
      `₹${totals.targetAmount.toLocaleString("en-IN")}`,
      totals.disconCount,
      `₹${totals.disconAmount.toLocaleString("en-IN")}`,
      totals.paidCount,
      `₹${totals.paidAmount.toLocaleString("en-IN")}`,
      totals.pendingCount,
      `₹${totals.pendingAmount.toLocaleString("en-IN")}`,
      `${totals.attendedPercent}%`
    ])

    autoTable(doc, {
      startY: 25,
      head: [["#", "CCC Code", "CCC Name", "Target", "Target Dues", "Discon", "Discon Dues", "Paid", "Paid Dues", "Pending", "Pending Dues", "Attended %"]],
      body: tableData,
      styles: { fontSize: 7, font: "helvetica", halign: "center" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
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

    doc.save(`Division_${divPrefix}_Performance_${new Date().toISOString().slice(0, 10)}.pdf`)
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
                Division Level Control
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-2 tracking-tight">
              Division <span className="font-mono text-blue-400">{divPrefix}</span> Performance Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Sub-divisional tracking for disconnections, recoveries & deemed visits across all child CCCs matching {divPrefix}xxx
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
      </div>

      {/* Search Bar across Sub-CCCs */}
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

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Target List</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totals.targetCount.toLocaleString("en-IN")}</p>
          <p className="text-xs font-mono text-gray-500 mt-1">₹{totals.targetAmount.toLocaleString("en-IN")} total dues</p>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Paid / Recovered</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{totals.paidCount.toLocaleString("en-IN")}</p>
          <p className="text-xs font-mono text-emerald-800 mt-1">₹{totals.paidAmount.toLocaleString("en-IN")} collected</p>
        </div>

        <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">Disconnected</p>
          <p className="text-2xl font-black text-red-700 mt-1">{totals.disconCount.toLocaleString("en-IN")}</p>
          <p className="text-xs font-mono text-red-800 mt-1">₹{totals.disconAmount.toLocaleString("en-IN")} disconnected O/S</p>
        </div>

        <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Total Attended %</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{totals.attendedPercent}%</p>
          <p className="text-xs text-blue-800 mt-1">{totals.visitedCount} deemed visits completed</p>
        </div>
      </div>

      {/* CCC Performance Table */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="px-5 py-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">Sub-Divisional CCC Performance Matrix</h2>
            <p className="text-xs text-gray-500 mt-0.5">Live performance metrics grouped by sub-divisional CCC code under Division {divPrefix}</p>
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
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="px-3 py-3 text-center w-10">#</th>
                  <th className="px-3 py-3 text-left">CCC Code</th>
                  <th className="px-3 py-3 text-left">CCC Name</th>
                  <th className="px-3 py-3 text-right">Target List</th>
                  <th className="px-3 py-3 text-right">Target Dues (₹)</th>
                  <th className="px-3 py-3 text-right text-red-700">Discon Count</th>
                  <th className="px-3 py-3 text-right text-red-700">Discon Dues (₹)</th>
                  <th className="px-3 py-3 text-right text-green-700">Paid Count</th>
                  <th className="px-3 py-3 text-right text-green-700">Paid Dues (₹)</th>
                  <th className="px-3 py-3 text-right text-amber-700">Pending</th>
                  <th className="px-3 py-3 text-right text-amber-700">Pending Dues (₹)</th>
                  <th className="px-3 py-3 text-center bg-blue-100/50 text-blue-900">Attended %</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800 font-medium">
                {rows.map((r, i) => (
                  <tr key={r.cccCode} className="hover:bg-slate-50 transition">
                    <td className="px-3 py-3 text-center text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-3 font-mono font-bold text-blue-700">{r.cccCode}</td>
                    <td className="px-3 py-3 font-bold text-gray-900">{r.cccName}</td>
                    <td className="px-3 py-3 text-right font-mono">{r.targetCount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-600">₹{r.targetAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-red-600">{r.disconCount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-600">₹{r.disconAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-green-600">{r.paidCount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono text-green-600">₹{r.paidAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono text-amber-700">{r.pendingCount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right font-mono text-amber-700">₹{r.pendingAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-center bg-blue-50/50">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${r.attendedPercent >= 75 ? "bg-green-100 text-green-800" : r.attendedPercent >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                        {r.attendedPercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold text-xs border-t">
                <tr>
                  <td colSpan={3} className="px-4 py-3.5 text-left">
                    DIVISION {divPrefix} GRAND TOTAL
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono">{totals.targetCount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono">₹{totals.targetAmount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-red-400">{totals.disconCount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-red-400">₹{totals.disconAmount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-green-400">{totals.paidCount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-green-400">₹{totals.paidAmount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-amber-400">{totals.pendingCount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-amber-400">₹{totals.pendingAmount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3.5 text-center bg-slate-800">
                    <span className="bg-blue-500 text-white px-2.5 py-1 rounded-full text-xs font-black">
                      {totals.attendedPercent}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

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

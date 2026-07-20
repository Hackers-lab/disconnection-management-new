"use client"

import { useState, useEffect, useMemo } from "react"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
// jsPDF, autoTable, and XLSX are loaded dynamically in the export functions to optimize initial bundle size
import {
  Download,
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  Users,
  Activity,
  RefreshCw,
  AlertCircle,
} from "lucide-react"

interface AgencyUpdatesReportProps {
  userRole: string
}

type DateRange = 7 | 14 | 30

function formatDateDisplay(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatDateKey(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`
}


function cellColorClass(count: number, max: number): string {
  if (count === 0) return "bg-gray-50 text-gray-300"
  const r = count / max
  if (r < 0.15) return "bg-blue-50 text-blue-500"
  if (r < 0.35) return "bg-blue-100 text-blue-600"
  if (r < 0.55) return "bg-blue-200 text-blue-700"
  if (r < 0.75) return "bg-blue-300 text-blue-900"
  return "bg-blue-500 text-white"
}

function cellFillRGB(count: number, max: number): [number, number, number] {
  if (count === 0) return [248, 250, 252]
  const r = count / max
  // interpolate white -> blue-200 -> blue-600
  const R = Math.round(255 - r * (255 - 37))
  const G = Math.round(255 - r * (255 - 99))
  const B = Math.round(255 - r * (255 - 235))
  return [R, G, B]
}

export function AgencyUpdatesReport({ userRole }: AgencyUpdatesReportProps) {
  const [consumers, setConsumers] = useState<ConsumerData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(7)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [useCustom, setUseCustom] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<string>("")

  async function loadData(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      let data = await getFromCache<ConsumerData[]>("consumers_data_cache")
      if (forceRefresh || !data || data.length === 0) {
        const res = await fetch("/api/consumers/base")
        if (res.ok) {
          data = await res.json()
        }
      }
      setConsumers(data || [])
      if (data && data.length > 0) {
        setCacheInfo(`${data.length.toLocaleString("en-IN")} records from local cache`)
      }
    } catch {
      setConsumers([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Build date array for the chosen range
  const dates = useMemo<Date[]>(() => {
    if (useCustom && customFrom && customTo) {
      const from = new Date(customFrom)
      const to = new Date(customTo)
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return []
      const arr: Date[] = []
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) arr.push(new Date(d))
      return arr
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: dateRange }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (dateRange - 1 - i))
      return d
    })
  }, [dateRange, useCustom, customFrom, customTo])

  // Build the matrix
  const { agencies, matrix, agencyTotals, dateTotals, grandTotal, maxCount } = useMemo(() => {
    const dateKeys = dates.map(formatDateKey)
    const agencyMap = new Map<string, Map<string, number>>()

    consumers.forEach((c) => {
      if (!c.agency) return
      const agency = c.agency.trim()
      if (!agencyMap.has(agency)) agencyMap.set(agency, new Map())
      const dk = (c.disconDate || "").trim()
      if (dateKeys.includes(dk)) {
        const m = agencyMap.get(agency)!
        m.set(dk, (m.get(dk) || 0) + 1)
      }
    })

    const allAgencies = Array.from(agencyMap.keys())
      .filter((a) => dateKeys.some((dk) => (agencyMap.get(a)?.get(dk) || 0) > 0))
      .sort()

    const matrix = allAgencies.map((a) =>
      dateKeys.map((dk) => agencyMap.get(a)?.get(dk) || 0)
    )
    const agencyTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0))
    const dateTotals = dateKeys.map((_, di) => matrix.reduce((s, row) => s + row[di], 0))
    const grandTotal = agencyTotals.reduce((s, v) => s + v, 0)
    const maxCount = Math.max(...matrix.flat(), 1)

    return { agencies: allAgencies, matrix, agencyTotals, dateTotals, grandTotal, maxCount }
  }, [consumers, dates])

  // Summary
  const stats = useMemo(() => {
    if (!agencies.length) return null
    const topAgencyIdx = agencyTotals.indexOf(Math.max(...agencyTotals))
    const topDateIdx = dateTotals.indexOf(Math.max(...dateTotals))
    return {
      grandTotal,
      activeAgencies: agencies.length,
      topAgency: agencies[topAgencyIdx] ?? "-",
      topAgencyCount: agencyTotals[topAgencyIdx] ?? 0,
      topDate: dates[topDateIdx] ? formatDateKey(dates[topDateIdx]) : "-",
      topDateCount: dateTotals[topDateIdx] ?? 0,
      avgPerDay: dates.length ? Math.round(grandTotal / dates.length) : 0,
    }
  }, [agencies, agencyTotals, dateTotals, grandTotal, dates])

  // PDF Export
  async function exportPDF() {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    const doc = new jsPDF({ orientation: "landscape" })
    const pw = doc.internal.pageSize.width

    doc.setFontSize(16)
    doc.setTextColor(37, 99, 235)
    doc.text("Agency Updates Report", pw / 2, 13, { align: "center" })

    const rangeLabel = useCustom ? `${customFrom} → ${customTo}` : `Past ${dateRange} Days`
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Period: ${rangeLabel}   |   Generated: ${new Date().toLocaleDateString("en-IN")}   |   Total Updates: ${grandTotal}`,
      pw / 2, 19, { align: "center" }
    )

    const head = [["Agency", ...dates.map(formatDateDisplay), "TOTAL"]]
    const body = agencies.map((a, ai) => [
      a,
      ...matrix[ai].map((c) => (c === 0 ? "—" : String(c))),
      String(agencyTotals[ai]),
    ])
    const foot = [["TOTAL", ...dateTotals.map(String), String(grandTotal)]]

    autoTable(doc, {
      startY: 24,
      head,
      body,
      foot,
      styles: { fontSize: 6.5, font: "helvetica", halign: "center", cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7 },
      footStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold", fontSize: 7 },
      columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 38 } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0 || data.column.index > dates.length) return
        const raw = data.cell.text[0]
        const count = raw === "—" ? 0 : parseInt(raw) || 0
        const fill = cellFillRGB(count, maxCount)
        data.cell.styles.fillColor = fill
        if (count > 0) {
          const r = count / maxCount
          data.cell.styles.textColor = r > 0.55 ? [255, 255, 255] : [30, 64, 175]
          data.cell.styles.fontStyle = r > 0.7 ? "bold" : "normal"
        }
      },
      alternateRowStyles: {},
      margin: { left: 8, right: 8 },
      theme: "grid",
      didDrawPage: (data) => {
        doc.setFontSize(7)
        doc.setTextColor(150)
        doc.text(
          `Page ${doc.getNumberOfPages()}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 6
        )
      },
    })

    // Add a summary box after the table
    const finalY = (doc as any).lastAutoTable?.finalY ?? 30
    if (stats && finalY + 40 < doc.internal.pageSize.height) {
      doc.setFontSize(8)
      doc.setTextColor(37, 99, 235)
      doc.text("Summary", 8, finalY + 8)
      const summaryLines = [
        `Total Updates: ${stats.grandTotal}`,
        `Active Agencies: ${stats.activeAgencies}`,
        `Top Agency: ${stats.topAgency} (${stats.topAgencyCount} updates)`,
        `Most Active Date: ${stats.topDate} (${stats.topDateCount} updates)`,
        `Avg Updates/Day: ${stats.avgPerDay}`,
      ]
      doc.setFontSize(7)
      doc.setTextColor(60)
      summaryLines.forEach((line, i) => doc.text(line, 8, finalY + 14 + i * 5))
    }

    doc.save(`Agency_Updates_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  // Excel Export
  async function exportExcel() {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    // Sheet 1 — Matrix
    const headers = ["Agency", ...dates.map(formatDateKey), "TOTAL"]
    const rows = [
      headers,
      ...agencies.map((a, ai) => [a, ...matrix[ai], agencyTotals[ai]]),
      ["TOTAL", ...dateTotals, grandTotal],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = [{ wch: 28 }, ...dates.map(() => ({ wch: 13 })), { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, "Agency Updates")

    // Sheet 2 — Summary
    if (stats) {
      const s2 = XLSX.utils.aoa_to_sheet([
        ["Metric", "Value"],
        ["Total Updates", stats.grandTotal],
        ["Active Agencies", stats.activeAgencies],
        ["Top Agency", `${stats.topAgency} (${stats.topAgencyCount} updates)`],
        ["Most Active Date", `${stats.topDate} (${stats.topDateCount} updates)`],
        ["Avg Updates / Day", stats.avgPerDay],
        ["Period", useCustom ? `${customFrom} to ${customTo}` : `Past ${dateRange} days`],
        ["Generated On", new Date().toLocaleDateString("en-IN")],
      ])
      s2["!cols"] = [{ wch: 25 }, { wch: 35 }]
      XLSX.utils.book_append_sheet(wb, s2, "Summary")
    }

    XLSX.writeFile(wb, `Agency_Updates_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <RefreshCw className="h-7 w-7 animate-spin text-blue-500" />
        <p className="text-gray-500 text-sm">Loading from local cache…</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-full">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Agency Updates Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Date-wise consumer update count per agency · {cacheInfo}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost" size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="gap-1.5 text-gray-500"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel
          </Button>
          <Button size="sm" onClick={exportPDF} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* ── Date range selector ── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm font-medium text-gray-600 flex items-center gap-1.5">
          <Calendar className="h-4 w-4" /> Period:
        </span>
        {([7, 14, 30] as DateRange[]).map((d) => (
          <button
            key={d}
            onClick={() => { setDateRange(d); setUseCustom(false) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              !useCustom && dateRange === d
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {d} Days
          </button>
        ))}
        <button
          onClick={() => setUseCustom(true)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            useCustom ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Custom
        </button>
        {useCustom && (
          <div className="flex items-center gap-2">
            <input
              type="date" value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date" value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* ── Summary stats ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="h-1 bg-blue-500" />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Total Updates</span>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{stats.grandTotal.toLocaleString("en-IN")}</p>
              <p className="text-xs text-gray-400 mt-0.5">in {dates.length} day{dates.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="h-1 bg-emerald-500" />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Active Agencies</span>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{stats.activeAgencies}</p>
              <p className="text-xs text-gray-400 mt-0.5">recorded updates</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="h-1 bg-violet-500" />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Top Agency</span>
              </div>
              <p className="text-sm font-extrabold text-gray-900 truncate leading-tight">{stats.topAgency}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.topAgencyCount} updates total</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="h-1 bg-amber-500" />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Avg / Day</span>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{stats.avgPerDay}</p>
              <p className="text-xs text-gray-400 mt-0.5">peak: {stats.topDateCount} on {stats.topDate}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Matrix ── */}
      {agencies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <AlertCircle className="h-10 w-10 opacity-40" />
          <p className="text-base font-medium">No updates found for the selected period</p>
          <p className="text-sm">Try a wider date range or refresh data</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">

              {/* Header row */}
              <thead>
                <tr>
                  <th className="text-left text-white font-bold px-4 py-3 bg-blue-700 sticky left-0 z-20 min-w-[170px] border-r border-blue-600">
                    Agency
                  </th>
                  {dates.map((date, i) => (
                    <th key={i} className="text-center text-white px-2 py-2 bg-blue-600 min-w-[56px] border-r border-blue-500 last:border-r-0">
                      <div className="text-[10px] font-normal opacity-70 mb-0.5">
                        {date.toLocaleDateString("en-IN", { weekday: "short" })}
                      </div>
                      <div className="text-xs font-semibold">{formatDateDisplay(date)}</div>
                    </th>
                  ))}
                  <th className="text-center text-white font-bold px-3 py-3 bg-blue-800 min-w-[66px] border-l border-blue-700">
                    TOTAL
                  </th>
                </tr>
              </thead>

              {/* Body rows */}
              <tbody>
                {agencies.map((agency, ai) => (
                  <tr key={agency} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors group">
                    <td className="px-4 py-2.5 font-semibold text-gray-800 sticky left-0 z-10 bg-white border-r border-gray-100 group-hover:bg-blue-50/50 transition-colors">
                      {agency}
                    </td>
                    {matrix[ai].map((count, di) => (
                      <td
                        key={di}
                        className={`text-center py-2.5 px-1 font-medium transition-colors text-xs border-r border-gray-50 last:border-r-0 ${cellColorClass(count, maxCount)}`}
                        title={count > 0 ? `${agency} · ${formatDateKey(dates[di])} · ${count} update${count !== 1 ? "s" : ""}` : undefined}
                      >
                        {count === 0 ? "" : count}
                      </td>
                    ))}
                    <td className="text-center py-2.5 px-3 font-bold text-blue-700 bg-blue-50 border-l border-blue-100 text-sm">
                      {agencyTotals[ai]}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Footer — date totals */}
              <tfoot>
                <tr>
                  <td className="px-4 py-3 font-bold text-white bg-blue-900 sticky left-0 z-10 border-r border-blue-700 text-sm">
                    TOTAL
                  </td>
                  {dateTotals.map((total, i) => (
                    <td key={i} className="text-center py-3 px-1 font-bold text-white bg-blue-800 text-xs border-r border-blue-700 last:border-r-0">
                      {total > 0 ? total : "—"}
                    </td>
                  ))}
                  <td className="text-center py-3 px-3 font-extrabold text-yellow-300 bg-blue-950 text-base border-l border-blue-700">
                    {grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center justify-end gap-2 mt-4">
        <span className="text-xs text-gray-400 mr-1">Intensity:</span>
        {[
          { label: "0", cls: "bg-gray-50 text-gray-300 border border-gray-200" },
          { label: "low", cls: "bg-blue-50 text-blue-500" },
          { label: "", cls: "bg-blue-100 text-blue-600" },
          { label: "", cls: "bg-blue-200 text-blue-700" },
          { label: "", cls: "bg-blue-300 text-blue-900" },
          { label: "high", cls: "bg-blue-500 text-white" },
        ].map(({ label, cls }, i) => (
          <div key={i} className={`w-8 h-5 rounded text-[9px] flex items-center justify-center font-medium ${cls}`}>
            {label}
          </div>
        ))}
      </div>

      {/* ── Footer note ── */}
      <p className="text-xs text-gray-400 mt-2 text-right">
        Based on disconnection date field · Data read from local cache
      </p>
    </div>
  )
}

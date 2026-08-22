"use client"

import { useMemo, useState } from "react"
import type { IcdsRecord, IcdsAgencyMetrics } from "@/lib/icds-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  Building2,
  Zap,
  ZapOff,
  CheckCircle2,
  Clock,
  RadioTower,
  FileCheck2,
  Layers,
  Download,
  Users,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { generateAgencyReportPDF } from "@/lib/icds-pdf"
import { toast } from "sonner"

const loadXLSX = () => import("xlsx")

interface IcdsStatsProps {
  records: IcdsRecord[]
}

/**
 * Compact collapsible KPI bar for the List view
 */
export function IcdsMiniKpiDrawer({ records }: { records: IcdsRecord[] }) {
  const [isOpen, setIsOpen] = useState(false)

  const total = records.length
  const pending = records.filter(r => r.stage === "PENDING_INSPECTION").length
  const metered = records.filter(r => r.stage === "METER_INSTALLED" || r.meterExists || !!r.smartMeterNo).length
  const wiring = records.filter(r => r.stage === "EQUIPMENT_INSTALLED" || r.equipmentPackageInstalled).length
  const completed = records.filter(r => r.stage === "COMPLETED" || !!r.certificatePhotoUrl).length
  const infra = records.filter(r => r.infraRequired).length

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-md hover:shadow-lg overflow-hidden transition-all">
      {/* Mini Quick Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none text-xs"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Quick KPI
          </span>
          <span className="text-slate-200">|</span>
          <span className="text-slate-600 font-semibold">Total: <strong className="text-slate-900">{total}</strong></span>
          <span className="text-amber-700 font-bold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/70">
            Pending: {pending}
          </span>
          <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/70">
            Metered: {metered}
          </span>
          <span className="text-purple-700 font-bold bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200/70">
            Wiring: {wiring}
          </span>
          <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
            Certified: {completed}
          </span>
        </div>

        <button className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-[11px] font-bold">
          {isOpen ? "Hide Cards" : "Expand Cards"}
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded Grid */}
      {isOpen && (
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Total Centers</span>
            <p className="text-xl font-extrabold text-slate-900 mt-0.5">{total}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-amber-600 tracking-wider">Pending Inspect</span>
            <p className="text-xl font-extrabold text-amber-700 mt-0.5">{pending}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-indigo-200/80 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-indigo-600 tracking-wider">Meters Installed</span>
            <p className="text-xl font-extrabold text-indigo-700 mt-0.5">{metered}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-purple-200/80 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-purple-600 tracking-wider">Wiring (CSR 6611)</span>
            <p className="text-xl font-extrabold text-purple-700 mt-0.5">{wiring}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-orange-200/80 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-orange-600 tracking-wider">Infra Needed</span>
            <p className="text-xl font-extrabold text-orange-700 mt-0.5">{infra}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Certified (Handover)</span>
            <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{completed}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function IcdsStats({ records }: IcdsStatsProps) {
  const [activeReportTab, setActiveReportTab] = useState<"agency" | "charts" | "gp">("agency")

  const total = records.length
  const pendingInspection = records.filter(r => r.stage === "PENDING_INSPECTION").length
  const inspected = records.filter(r => r.stage !== "PENDING_INSPECTION").length
  const meterInstalled = records.filter(r => r.stage === "METER_INSTALLED" || r.meterExists || !!r.smartMeterNo).length
  const equipmentInstalled = records.filter(r => r.stage === "EQUIPMENT_INSTALLED" || r.equipmentPackageInstalled).length
  const completed = records.filter(r => r.stage === "COMPLETED" || !!r.certificatePhotoUrl).length
  const infraRequired = records.filter(r => r.infraRequired).length

  // Block-wise aggregation
  const blockData = useMemo(() => {
    const map = new Map<string, { block: string; total: number; electrified: number; completed: number; infra: number }>()
    for (const r of records) {
      const b = r.blockName || "Unspecified"
      const entry = map.get(b) || { block: b, total: 0, electrified: 0, completed: 0, infra: 0 }
      entry.total++
      if (r.meterExists || r.smartMeterNo || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED") {
        entry.electrified++
      }
      if (r.stage === "COMPLETED" || r.certificatePhotoUrl) {
        entry.completed++
      }
      if (r.infraRequired) {
        entry.infra++
      }
      map.set(b, entry)
    }
    return Array.from(map.values())
  }, [records])

  // GP-wise aggregation
  const gpData = useMemo(() => {
    const map = new Map<string, { gp: string; block: string; total: number; inspected: number; metered: number; completed: number }>()
    for (const r of records) {
      const key = `${r.blockName || ""} - ${r.gpName || "Unspecified"}`
      const entry = map.get(key) || { gp: r.gpName || "Unspecified", block: r.blockName || "—", total: 0, inspected: 0, metered: 0, completed: 0 }
      entry.total++
      if (r.stage !== "PENDING_INSPECTION") entry.inspected++
      if (r.meterExists || r.smartMeterNo || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED") entry.metered++
      if (r.stage === "COMPLETED" || r.certificatePhotoUrl) entry.completed++
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.block.localeCompare(b.block) || a.gp.localeCompare(b.gp))
  }, [records])

  // Agency Performance Metrics
  const agencyMetrics: IcdsAgencyMetrics[] = useMemo(() => {
    const map = new Map<string, IcdsAgencyMetrics>()
    for (const r of records) {
      const agency = r.assignedAgency || "Unassigned"
      const entry = map.get(agency) || {
        agency,
        totalAllocated: 0,
        inspected: 0,
        bookletsReceived: 0,
        workOrdersIssued: 0,
        metersInstalled: 0,
        equipmentInstalled: 0,
        completed: 0,
        completionRate: 0,
      }

      entry.totalAllocated++
      if (r.stage !== "PENDING_INSPECTION") entry.inspected++
      if (r.bookletReceived) entry.bookletsReceived++
      if (r.workOrderNo || r.stage === "WO_ISSUED" || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED") entry.workOrdersIssued++
      if (r.meterExists || r.smartMeterNo || r.stage === "METER_INSTALLED" || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED") entry.metersInstalled++
      if (r.equipmentPackageInstalled || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED") entry.equipmentInstalled++
      if (r.stage === "COMPLETED" || !!r.certificatePhotoUrl) entry.completed++

      entry.completionRate = entry.totalAllocated > 0 ? (entry.completed / entry.totalAllocated) * 100 : 0
      map.set(agency, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.totalAllocated - a.totalAllocated)
  }, [records])

  // Infrastructure breakdown pie
  const infraPieData = useMemo(() => {
    return [
      { name: "Direct Connection", value: total - infraRequired },
      { name: "Poles / Cable Required", value: infraRequired },
    ]
  }, [total, infraRequired])

  const exportAgencyExcel = async () => {
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()

      const rows = agencyMetrics.map((m, idx) => ({
        "Sl No": idx + 1,
        "Agency Name": m.agency,
        "Total Assigned": m.totalAllocated,
        "Inspected": m.inspected,
        "Booklets Recv": m.bookletsReceived,
        "Work Orders Issued": m.workOrdersIssued,
        "Meters Installed": m.metersInstalled,
        "CSR Wiring Installed": m.equipmentInstalled,
        "Completed & Certified": m.completed,
        "Completion %": `${m.completionRate.toFixed(1)}%`,
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "Agency Performance")
      XLSX.writeFile(wb, `ICDS_Agency_Performance_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success("Agency report exported to Excel")
    } catch (e: any) {
      toast.error("Failed to export: " + e.message)
    }
  }

  const exportAgencyPDF = () => {
    try {
      const doc = generateAgencyReportPDF(agencyMetrics, total)
      doc.save(`ICDS_Agency_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success("Agency report exported to PDF")
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Report Switcher Tabs */}
      <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={activeReportTab === "agency" ? "default" : "outline"}
            onClick={() => setActiveReportTab("agency")}
            className="text-xs h-8 font-semibold"
          >
            <Users className="h-3.5 w-3.5 mr-1" /> Agency Performance ({agencyMetrics.length})
          </Button>
          <Button
            size="sm"
            variant={activeReportTab === "charts" ? "default" : "outline"}
            onClick={() => setActiveReportTab("charts")}
            className="text-xs h-8 font-semibold"
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Block & Infra Charts
          </Button>
          <Button
            size="sm"
            variant={activeReportTab === "gp" ? "default" : "outline"}
            onClick={() => setActiveReportTab("gp")}
            className="text-xs h-8 font-semibold"
          >
            <Building2 className="h-3.5 w-3.5 mr-1" /> GP-Wise Breakdown ({gpData.length})
          </Button>
        </div>

        {activeReportTab === "agency" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportAgencyExcel} className="text-xs h-8 text-emerald-700 font-semibold">
              <Download className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportAgencyPDF} className="text-xs h-8 text-blue-700 font-semibold">
              <Download className="h-3.5 w-3.5 mr-1" /> PDF Report
            </Button>
          </div>
        )}
      </div>

      {/* TAB 1: Charts View */}
      {activeReportTab === "charts" && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Block-wise Stacked Bar Chart */}
          <Card className="md:col-span-2 shadow-md hover:shadow-lg transition-shadow border border-slate-200/80">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                Block-wise Electrification Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 h-64">
              {blockData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={blockData} margin={{ top: 15, right: 15, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="block" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="total" name="Total Centers" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="electrified" name="Metered / Done" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Fully Certified" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Infrastructure Distribution Pie */}
          <Card className="shadow-md hover:shadow-lg transition-shadow border border-slate-200/80">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <RadioTower className="h-4 w-4 text-orange-600" />
                Infrastructure Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 h-64 flex flex-col items-center justify-center">
              {total === 0 ? (
                <div className="text-xs text-muted-foreground">No data available</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={infraPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f97316" />
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 text-[11px] font-semibold mt-2">
                    <div className="flex items-center gap-1 text-emerald-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Direct: {total - infraRequired}
                    </div>
                    <div className="flex items-center gap-1 text-orange-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Poles/Line Needed: {infraRequired}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: Agency Performance Report Table */}
      {activeReportTab === "agency" && (
        <Card className="shadow-md hover:shadow-lg transition-shadow border border-slate-200/80">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              Agency Contractor Performance Matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">Agency Name</TableHead>
                  <TableHead className="text-xs text-center">Allocated</TableHead>
                  <TableHead className="text-xs text-center">Inspected</TableHead>
                  <TableHead className="text-xs text-center">Booklets</TableHead>
                  <TableHead className="text-xs text-center">Work Orders</TableHead>
                  <TableHead className="text-xs text-center">Meters Done</TableHead>
                  <TableHead className="text-xs text-center">CSR Wiring</TableHead>
                  <TableHead className="text-xs text-center">Certified</TableHead>
                  <TableHead className="text-xs text-right pr-4">Completion %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencyMetrics.map((m) => (
                  <TableRow key={m.agency} className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs py-2.5 text-slate-800">{m.agency}</TableCell>
                    <TableCell className="text-center text-xs font-bold">{m.totalAllocated}</TableCell>
                    <TableCell className="text-center text-xs text-amber-700">{m.inspected}</TableCell>
                    <TableCell className="text-center text-xs text-blue-700">{m.bookletsReceived}</TableCell>
                    <TableCell className="text-center text-xs text-purple-700">{m.workOrdersIssued}</TableCell>
                    <TableCell className="text-center text-xs text-indigo-700 font-semibold">{m.metersInstalled}</TableCell>
                    <TableCell className="text-center text-xs text-teal-700 font-semibold">{m.equipmentInstalled}</TableCell>
                    <TableCell className="text-center text-xs text-emerald-700 font-bold">{m.completed}</TableCell>
                    <TableCell className="text-right pr-4 text-xs font-bold text-emerald-700">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(m.completionRate, 100)}%` }} />
                        </div>
                        <span>{m.completionRate.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: GP-wise Table */}
      {activeReportTab === "gp" && (
        <Card className="shadow-md hover:shadow-lg transition-shadow border border-slate-200/80">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              Gram Panchayat (GP) Progress Table
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-80 overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-xs">Block</TableHead>
                  <TableHead className="text-xs">Gram Panchayat (GP)</TableHead>
                  <TableHead className="text-xs text-center">Total AWCs</TableHead>
                  <TableHead className="text-xs text-center">Inspected</TableHead>
                  <TableHead className="text-xs text-center">Metered</TableHead>
                  <TableHead className="text-xs text-center">Completed</TableHead>
                  <TableHead className="text-xs text-right pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gpData.map((g, idx) => (
                  <TableRow key={idx} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs font-medium text-slate-500 py-2">{g.block}</TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">{g.gp}</TableCell>
                    <TableCell className="text-center text-xs font-bold">{g.total}</TableCell>
                    <TableCell className="text-center text-xs text-amber-700">{g.inspected}</TableCell>
                    <TableCell className="text-center text-xs text-indigo-700 font-semibold">{g.metered}</TableCell>
                    <TableCell className="text-center text-xs text-emerald-700 font-bold">{g.completed}</TableCell>
                    <TableCell className="text-right pr-4 text-xs">
                      {g.completed === g.total && g.total > 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">100% Done</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-slate-600">
                          {((g.completed / g.total) * 100).toFixed(0)}% Done
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

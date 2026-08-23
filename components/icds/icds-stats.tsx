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
 * Collapsible Dashboard drawer for the List view with detailed clickable KPI cards
 * and a compact agency breakdown table.
 */
export function IcdsMiniKpiDrawer({ records }: { records: IcdsRecord[] }) {
  const [isOpen, setIsOpen] = useState(false)

  const total = records.length
  const inspected = records.filter(r => r.stage !== "PENDING_INSPECTION")
  const pending = records.filter(r => r.stage === "PENDING_INSPECTION")
  
  // Metering & Wiring combinations
  const hasMeter = (r: IcdsRecord) => r.meterExists || !!r.smartMeterNo || r.stage === "METER_INSTALLED" || r.stage === "COMPLETED"
  const hasWiring = (r: IcdsRecord) => r.equipmentPackageInstalled || r.existingWiringStatus === "EXISTS_WORKING" || r.stage === "EQUIPMENT_INSTALLED" || r.stage === "COMPLETED"

  const meteredRecords = records.filter(hasMeter)
  const meterAndWiringRecords = records.filter(r => hasMeter(r) && hasWiring(r))
  const meterNoWiringRecords = records.filter(r => hasMeter(r) && !hasWiring(r))
  const unmeteredRecords = records.filter(r => !hasMeter(r))
  const infraRecords = records.filter(r => r.infraRequired)
  const completedRecords = records.filter(r => r.stage === "COMPLETED" || !!r.certificatePhotoUrl)

  // Agency Performance Compact Matrix
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
      if (hasMeter(r)) entry.metersInstalled++
      if (hasWiring(r)) entry.equipmentInstalled++
      if (r.stage === "COMPLETED" || !!r.certificatePhotoUrl) entry.completed++

      entry.completionRate = entry.totalAllocated > 0 ? (entry.completed / entry.totalAllocated) * 100 : 0
      map.set(agency, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.totalAllocated - a.totalAllocated)
  }, [records])

  // Download filtered dataset by category
  const downloadCategoryExcel = async (categoryName: string, subset: IcdsRecord[]) => {
    if (subset.length === 0) {
      toast.info(`No records available for ${categoryName}`)
      return
    }
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()

      const rows = subset.map((r, i) => ({
        "SL No": i + 1,
        "AWC Code": r.awcCode,
        "AWC Name": r.awcName,
        "Block Name": r.blockName,
        "GP Name": r.gpName,
        "Address": r.awcAddress || "",
        "Property Status": r.propertyStatus,
        "AWW Worker": r.awwName || "",
        "AWW Mobile": r.awwMobile || "",
        "Assigned Agency": r.assignedAgency || "",
        "Jurisdiction": r.jurisdictionStatus,
        "Other CCC": r.jurisdictionOffice || "",
        "Stage": r.stage,
        "Meter Exists": r.meterExists ? "YES" : "NO",
        "Smart Meter No": r.smartMeterNo || "",
        "Existing Meter No": r.existingMeterNo || "",
        "Internal Wiring Status": r.existingWiringStatus || "",
        "CSR Wiring Installed": r.equipmentPackageInstalled ? "YES" : "NO",
        "Infra Required": r.infraRequired ? "YES" : "NO",
        "Poles Required": r.polesRequired || 0,
        "LT Cable Length (M)": r.cableLengthM || 0,
        "Service Line (M)": r.serviceLineLengthM || 0,
        "GPS Coordinates": r.inspectGeoCoordinates || "",
        "Work Order No": r.workOrderNo || "",
        "Official Application No": r.officialApplicationNo || "",
        "Remarks": r.inspectionRemarks || "",
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const sanitizedName = categoryName.replace(/[^a-zA-Z0-9_-]/g, "_")
      XLSX.utils.book_append_sheet(wb, ws, sanitizedName.slice(0, 30))
      XLSX.writeFile(wb, `ICDS_${sanitizedName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`Downloaded ${subset.length} records for ${categoryName}`)
    } catch (e: any) {
      toast.error("Failed to export: " + e.message)
    }
  }

  const kpiCards = [
    {
      title: "Total Centers",
      count: total,
      records: records,
      color: "border-slate-300 text-slate-900 bg-slate-50/50 hover:bg-slate-100/70",
      badgeColor: "bg-slate-200 text-slate-800",
    },
    {
      title: "Inspected",
      count: inspected.length,
      records: inspected,
      color: "border-blue-200 text-blue-800 bg-blue-50/40 hover:bg-blue-50/80",
      badgeColor: "bg-blue-100 text-blue-800",
    },
    {
      title: "Pending",
      count: pending.length,
      records: pending,
      color: "border-amber-200 text-amber-800 bg-amber-50/40 hover:bg-amber-50/80",
      badgeColor: "bg-amber-100 text-amber-800",
    },
    {
      title: "Meter Exists",
      count: meteredRecords.length,
      records: meteredRecords,
      color: "border-indigo-200 text-indigo-800 bg-indigo-50/40 hover:bg-indigo-50/80",
      badgeColor: "bg-indigo-100 text-indigo-800",
    },
    {
      title: "Meter + Wiring Exists",
      count: meterAndWiringRecords.length,
      records: meterAndWiringRecords,
      color: "border-teal-200 text-teal-800 bg-teal-50/40 hover:bg-teal-50/80",
      badgeColor: "bg-teal-100 text-teal-800",
    },
    {
      title: "Meter Exists (Wiring Pending)",
      count: meterNoWiringRecords.length,
      records: meterNoWiringRecords,
      color: "border-orange-200 text-orange-800 bg-orange-50/40 hover:bg-orange-50/80",
      badgeColor: "bg-orange-100 text-orange-800",
    },
    {
      title: "Unmetered Centers",
      count: unmeteredRecords.length,
      records: unmeteredRecords,
      color: "border-rose-200 text-rose-800 bg-rose-50/40 hover:bg-rose-50/80",
      badgeColor: "bg-rose-100 text-rose-800",
    },
    {
      title: "Poles / Infra Needed",
      count: infraRecords.length,
      records: infraRecords,
      color: "border-amber-300 text-amber-900 bg-amber-50/60 hover:bg-amber-100/60",
      badgeColor: "bg-amber-200 text-amber-900",
    },
    {
      title: "Certified / Completed",
      count: completedRecords.length,
      records: completedRecords,
      color: "border-emerald-200 text-emerald-800 bg-emerald-50/40 hover:bg-emerald-50/80",
      badgeColor: "bg-emerald-100 text-emerald-800",
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md overflow-hidden transition-all">
      {/* Dashboard Trigger Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
            Dashboard
          </span>
        </div>

        <div className="text-slate-400 hover:text-slate-700 flex items-center">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded Detailed Dashboard Grid */}
      {isOpen && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/40 space-y-4">
          {/* Clickable Category Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500">
                Click any card to export matching records to Excel (.xlsx)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
              {kpiCards.map((card) => (
                <div
                  key={card.title}
                  onClick={() => downloadCategoryExcel(card.title, card.records)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between group ${card.color}`}
                  title={`Click to export ${card.title} records to Excel`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-semibold leading-tight">{card.title}</span>
                    <Download className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold">{card.count}</span>
                    <span className="text-[10px] font-medium opacity-70 group-hover:underline">Export ↗</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compact Agency-wise Performance Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-600" />
                Agency Performance Summary ({agencyMetrics.length} Contractors)
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Real-time</span>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 sticky top-0 z-10 text-xs">
                  <TableRow>
                    <TableHead className="py-2 font-semibold">Agency Name</TableHead>
                    <TableHead className="py-2 text-center font-semibold">Assigned</TableHead>
                    <TableHead className="py-2 text-center font-semibold">Inspected</TableHead>
                    <TableHead className="py-2 text-center font-semibold">Meter Exists</TableHead>
                    <TableHead className="py-2 text-center font-semibold">Wiring Done</TableHead>
                    <TableHead className="py-2 text-center font-semibold">Certified</TableHead>
                    <TableHead className="py-2 text-right pr-4 font-semibold">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {agencyMetrics.map((m) => (
                    <TableRow key={m.agency} className="hover:bg-slate-50/60">
                      <TableCell className="font-semibold py-2 text-slate-800">{m.agency}</TableCell>
                      <TableCell className="text-center font-medium text-slate-800">{m.totalAllocated}</TableCell>
                      <TableCell className="text-center text-amber-700 font-medium">{m.inspected}</TableCell>
                      <TableCell className="text-center text-indigo-700 font-medium">{m.metersInstalled}</TableCell>
                      <TableCell className="text-center text-teal-700 font-medium">{m.equipmentInstalled}</TableCell>
                      <TableCell className="text-center text-emerald-700 font-bold">{m.completed}</TableCell>
                      <TableCell className="text-right pr-4 font-bold text-emerald-700">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(m.completionRate, 100)}%` }} />
                          </div>
                          <span>{m.completionRate.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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

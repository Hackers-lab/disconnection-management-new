"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Activity,
  Layers,
  Building2,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingUp,
  LayoutGrid,
  Table as TableIcon,
  BarChart3,
  ExternalLink,
  RotateCcw,
  Zap,
  ShieldCheck,
  Flame,
  ArrowUpDown,
  Filter,
} from "lucide-react"
import type {
  SupplyVersionReportItem,
  GlobalVersionSummary,
  SystemModuleMeta,
  SupplyModuleVersionDetail,
  PatchPayload,
} from "@/lib/version-engine"

interface SupplyModuleVersionsReportProps {
  onBackToDashboard?: () => void
}

type ViewMode = "matrix" | "cards" | "modules"
type FilterStatus = "all" | "active" | "base_only" | "unused"
type SortField = "updates" | "code" | "name" | "recent"

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "Never updated"
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 60) return "Just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(ts).toLocaleDateString("en-IN")
}

function formatExactDateTime(ts: number | null): string {
  if (!ts) return "N/A"
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getVersionCellBgClass(patchCount: number, maxPatch: number): string {
  if (patchCount === 0) return "bg-slate-900/60 text-slate-400 border-slate-800/80 hover:bg-slate-800/80"
  const ratio = patchCount / Math.max(maxPatch, 1)
  if (ratio < 0.1) return "bg-blue-950/70 text-blue-300 border-blue-800/50 hover:bg-blue-900/60"
  if (ratio < 0.25) return "bg-indigo-950/80 text-indigo-200 border-indigo-700/60 hover:bg-indigo-900/70"
  if (ratio < 0.5) return "bg-violet-950/90 text-violet-200 border-violet-600/70 hover:bg-violet-900/80"
  if (ratio < 0.75) return "bg-emerald-950/90 text-emerald-200 border-emerald-600/70 hover:bg-emerald-900/80"
  return "bg-amber-950 text-amber-200 border-amber-500/80 font-bold shadow-sm shadow-amber-900/40 hover:bg-amber-900"
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "operations":
      return "text-blue-400 bg-blue-500/10 border-blue-500/20"
    case "metering":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20"
    case "infrastructure":
      return "text-purple-400 bg-purple-500/10 border-purple-500/20"
    case "safety":
      return "text-rose-400 bg-rose-500/10 border-rose-500/20"
    default:
      return "text-slate-400 bg-slate-800 border-slate-700"
  }
}

export function SupplyModuleVersionsReport({ onBackToDashboard }: SupplyModuleVersionsReportProps) {
  const [supplies, setSupplies] = useState<SupplyVersionReportItem[]>([])
  const [globalSummary, setGlobalSummary] = useState<GlobalVersionSummary | null>(null)
  const [modulesList, setModulesList] = useState<SystemModuleMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())

  // Filters & View State
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("updates")
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("matrix")

  // Inspector Modal State
  const [inspectModalOpen, setInspectModalOpen] = useState(false)
  const [selectedSupply, setSelectedSupply] = useState<SupplyVersionReportItem | null>(null)
  const [selectedModuleDetail, setSelectedModuleDetail] = useState<SupplyModuleVersionDetail | null>(null)
  const [resettingBase, setResettingBase] = useState(false)
  const [resetFeedbackMsg, setResetFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch("/api/superuser/module-versions")
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSupplies(data.supplies || [])
          setGlobalSummary(data.globalSummary || null)
          setModulesList(data.modulesList || [])
          setLastRefreshedAt(new Date())
        }
      }
    } catch (e) {
      console.error("Failed to fetch supply module versions:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filtered Modules List based on category or specific module selection
  const filteredModulesList = useMemo(() => {
    return modulesList.filter(mod => {
      if (categoryFilter !== "all" && mod.category !== categoryFilter) return false
      if (selectedModuleKey !== "all" && mod.key !== selectedModuleKey) return false
      return true
    })
  }, [modulesList, categoryFilter, selectedModuleKey])

  // Filtered & Sorted Supplies
  const filteredSupplies = useMemo(() => {
    let result = supplies.filter(s => {
      // Search match
      const query = searchTerm.toLowerCase().trim()
      if (query) {
        const matchesCode = s.cccCode.toLowerCase().includes(query)
        const matchesName = s.cccName.toLowerCase().includes(query)
        if (!matchesCode && !matchesName) return false
      }

      // Status filter
      if (statusFilter === "active" && s.totalUpdates === 0) return false
      if (statusFilter === "base_only" && (s.totalUpdates > 0 || s.activeModulesCount === 0)) return false
      if (statusFilter === "unused" && s.activeModulesCount > 0) return false

      // Module specific filter
      if (selectedModuleKey !== "all") {
        const modDetail = s.modules[selectedModuleKey]
        if (!modDetail || modDetail.totalUpdates === 0) {
          if (statusFilter === "active") return false
        }
      }

      return true
    })

    // Sorting
    result.sort((a, b) => {
      let cmp = 0
      if (sortField === "updates") {
        cmp = b.totalUpdates - a.totalUpdates
      } else if (sortField === "code") {
        cmp = a.cccCode.localeCompare(b.cccCode)
      } else if (sortField === "name") {
        cmp = a.cccName.localeCompare(b.cccName)
      } else if (sortField === "recent") {
        cmp = (b.lastActiveTimestamp || 0) - (a.lastActiveTimestamp || 0)
      }
      return sortAsc ? -cmp : cmp
    })

    return result
  }, [supplies, searchTerm, statusFilter, selectedModuleKey, sortField, sortAsc])

  // Calculate highest patch version across all cells for color intensity scaling
  const maxPatchCount = useMemo(() => {
    let max = 1
    supplies.forEach(s => {
      Object.values(s.modules).forEach(m => {
        if (m.totalUpdates > max) max = m.totalUpdates
      })
    })
    return max
  }, [supplies])

  const openInspector = (supply: SupplyVersionReportItem, moduleDetail: SupplyModuleVersionDetail) => {
    setSelectedSupply(supply)
    setSelectedModuleDetail(moduleDetail)
    setResetFeedbackMsg(null)
    setInspectModalOpen(true)
  }

  const handleResetBaseVersion = async () => {
    if (!selectedSupply || !selectedModuleDetail) return
    const confirmed = confirm(
      `Are you sure you want to reset the base version for "${selectedModuleDetail.moduleLabel}" on Supply ${selectedSupply.cccCode}? This will increment base version to v${selectedModuleDetail.baseVersion + 1}.0 and clear patch logs.`
    )
    if (!confirmed) return

    setResettingBase(true)
    setResetFeedbackMsg(null)
    try {
      const res = await fetch("/api/superuser/module-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-base",
          cccCode: selectedSupply.cccCode,
          moduleKey: selectedModuleDetail.moduleKey,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResetFeedbackMsg({ type: "success", text: data.message || "Base version reset successfully." })
        await fetchData(true)
        // Update local modal view
        setSelectedModuleDetail(prev =>
          prev
            ? {
                ...prev,
                baseVersion: data.baseVersion,
                patchVersion: data.patchVersion,
                versionString: `v${data.baseVersion}.${data.patchVersion}`,
                totalUpdates: 0,
                recentPatches: [],
                lastUpdated: Date.now(),
              }
            : null
        )
      } else {
        throw new Error(data.error || "Failed to reset base version")
      }
    } catch (err: any) {
      setResetFeedbackMsg({ type: "error", text: err?.message || "Reset base version failed" })
    } finally {
      setResettingBase(false)
    }
  }

  // --- EXPORT TO EXCEL ---
  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      // 1. Matrix Sheet
      const matrixHeaders = [
        "CCC Code",
        "Subdivision / Care Center",
        "Total Updates",
        "Active Modules",
        "Last Activity Time",
        ...modulesList.map(m => `${m.label} (Version)`),
        ...modulesList.map(m => `${m.label} (Updates)`),
      ]

      const matrixRows = supplies.map(s => [
        s.cccCode,
        s.cccName,
        s.totalUpdates,
        `${s.activeModulesCount} / ${s.totalModulesCount}`,
        s.lastActiveTimestamp ? new Date(s.lastActiveTimestamp).toISOString() : "Never",
        ...modulesList.map(m => s.modules[m.key]?.versionString || "v1.0"),
        ...modulesList.map(m => s.modules[m.key]?.totalUpdates || 0),
      ])

      const wsMatrix = XLSX.utils.aoa_to_sheet([matrixHeaders, ...matrixRows])
      wsMatrix["!cols"] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 14 },
        { wch: 16 },
        { wch: 22 },
        ...modulesList.map(() => ({ wch: 16 })),
        ...modulesList.map(() => ({ wch: 16 })),
      ]
      XLSX.utils.book_append_sheet(wb, wsMatrix, "Supply Module Versions")

      // 2. Module Aggregates Sheet
      if (globalSummary?.moduleTotals) {
        const modHeaders = ["Module Key", "Module Name", "Total Updates", "Active Supplies Count", "Adoption %"]
        const modRows = modulesList.map(m => {
          const tot = globalSummary.moduleTotals[m.key] || { totalUpdates: 0, activeSuppliesCount: 0 }
          const adoption = supplies.length ? Math.round((tot.activeSuppliesCount / supplies.length) * 100) : 0
          return [m.key, m.label, tot.totalUpdates, tot.activeSuppliesCount, `${adoption}%`]
        })
        const wsModules = XLSX.utils.aoa_to_sheet([modHeaders, ...modRows])
        wsModules["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsModules, "Module Summary")
      }

      // 3. Executive KPI Sheet
      const kpiRows = [
        ["Report Title", "Supply Update Version & Module Usage Report"],
        ["Generated At", new Date().toLocaleString("en-IN")],
        ["Total Care Centers (Supplies)", supplies.length],
        ["Active Supplies", globalSummary?.activeSuppliesCount || 0],
        ["Total Updates Across System", globalSummary?.totalUpdatesAllSupplies || 0],
        ["Top Active Supply", globalSummary?.topSupply ? `${globalSummary.topSupply.cccCode} - ${globalSummary.topSupply.cccName} (${globalSummary.topSupply.totalUpdates} updates)` : "N/A"],
        ["Top Active Module", globalSummary?.topModule ? `${globalSummary.topModule.moduleLabel} (${globalSummary.topModule.totalUpdates} updates)` : "N/A"],
      ]
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiRows)
      wsKPI["!cols"] = [{ wch: 28 }, { wch: 45 }]
      XLSX.utils.book_append_sheet(wb, wsKPI, "Executive KPIs")

      XLSX.writeFile(wb, `Supply_Module_Versions_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error("Excel export error:", e)
      alert("Failed to export Excel report.")
    }
  }

  // --- EXPORT TO PDF ---
  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      const doc = new jsPDF({ orientation: "landscape" })
      const pw = doc.internal.pageSize.width

      // Title & Header
      doc.setFontSize(16)
      doc.setTextColor(37, 99, 235)
      doc.text("Supply Module Update Versions & Activity Report", pw / 2, 12, { align: "center" })

      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-IN")}   |   Total Supplies: ${supplies.length}   |   Active Supplies: ${globalSummary?.activeSuppliesCount || 0}   |   Total Updates: ${globalSummary?.totalUpdatesAllSupplies || 0}`,
        pw / 2,
        18,
        { align: "center" }
      )

      const head = [
        [
          "CCC Code",
          "Care Center Name",
          "Updates",
          "Active",
          ...modulesList.map(m => m.shortLabel),
        ],
      ]

      const body = supplies.map(s => [
        s.cccCode,
        s.cccName,
        String(s.totalUpdates),
        `${s.activeModulesCount}/${s.totalModulesCount}`,
        ...modulesList.map(m => {
          const detail = s.modules[m.key]
          if (!detail || detail.totalUpdates === 0) return "v1.0"
          return `${detail.versionString} (${detail.totalUpdates})`
        }),
      ])

      autoTable(doc, {
        startY: 23,
        head,
        body,
        styles: { fontSize: 6.5, font: "helvetica", halign: "center", cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 7 },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold", cellWidth: 22 },
          1: { halign: "left", cellWidth: 38 },
          2: { halign: "right", fontStyle: "bold", textColor: [37, 99, 235], cellWidth: 16 },
          3: { halign: "center", cellWidth: 14 },
        },
        theme: "grid",
        didDrawPage: (data) => {
          doc.setFontSize(7)
          doc.setTextColor(150)
          doc.text(
            `Page ${doc.getNumberOfPages()}  •  Confidential Superadmin Version Registry`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 5
          )
        },
      })

      doc.save(`Supply_Module_Versions_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error("PDF export error:", e)
      alert("Failed to export PDF report.")
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── TOP BANNER & ACTION BAR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 p-2.5 rounded-xl text-white shadow-md shadow-blue-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                Supply Update Version & Module Usage Report
              </h2>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] font-mono">
                KV Live
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Live KV version pointers (<span className="font-mono text-blue-300">v&lt;base&gt;.&lt;patch&gt;</span>) & update activity tracking across all care centers.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
            Checked: {lastRefreshedAt.toLocaleTimeString("en-IN")}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-slate-300 px-2.5"
            title="Refresh Live KV Version Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-8 text-xs border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 px-2.5"
            title="Export full matrix report to Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-400" />
            <span>Excel</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPDF}
            className="h-8 text-xs border-blue-700/60 bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 px-2.5"
            title="Export printable report to PDF"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-blue-400" />
            <span>PDF</span>
          </Button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* KPI 1: Total System Updates */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Total Updates
              <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                  {(globalSummary?.totalUpdatesAllSupplies || 0).toLocaleString()}
                </div>
                <p className="text-[9px] sm:text-[10px] text-amber-400/80 font-mono mt-0.5">
                  Across all {supplies.length} Supplies
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 2: Active Supplies */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Active Supplies
              <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                  {globalSummary?.activeSuppliesCount || 0}{" "}
                  <span className="text-xs text-slate-500 font-normal">/ {supplies.length}</span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-emerald-400/80 font-mono mt-0.5">
                  {supplies.length ? Math.round(((globalSummary?.activeSuppliesCount || 0) / supplies.length) * 100) : 0}% Active Rate
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 3: Top Active Care Center */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Top Active Supply
              <TrendingUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : globalSummary?.topSupply ? (
              <div>
                <div className="text-xs sm:text-sm font-bold text-blue-300 truncate">
                  {globalSummary.topSupply.cccCode}
                </div>
                <p className="text-[10px] text-slate-300 font-medium truncate mt-0.5">
                  {globalSummary.topSupply.cccName}
                </p>
                <Badge variant="outline" className="text-[9px] bg-blue-950/60 border-blue-800 text-blue-400 mt-1 px-1 py-0 font-mono">
                  {globalSummary.topSupply.totalUpdates.toLocaleString()} updates
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic my-1">No updates yet</p>
            )}
          </CardContent>
        </Card>

        {/* KPI 4: Top Active Module */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Top Active Module
              <Zap className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : globalSummary?.topModule ? (
              <div>
                <div className="text-xs sm:text-sm font-bold text-indigo-300 truncate">
                  {globalSummary.topModule.moduleLabel}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {globalSummary.topModule.totalUpdates.toLocaleString()} updates total
                </p>
                <Badge variant="outline" className="text-[9px] bg-indigo-950/60 border-indigo-800 text-indigo-400 mt-1 px-1 py-0 font-mono">
                  #1 Module
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic my-1">No updates yet</p>
            )}
          </CardContent>
        </Card>

        {/* KPI 5: Modules Tracked */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Core Modules
              <Layers className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-xl sm:text-2xl font-black text-purple-400 font-mono">
                  {modulesList.length}
                </div>
                <p className="text-[9px] sm:text-[10px] text-purple-400/80 font-mono mt-0.5">
                  Versioned Pipelines
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 6: Average Updates / Supply */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Avg Updates / CCC
              <Activity className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                  {supplies.length
                    ? Math.round((globalSummary?.totalUpdatesAllSupplies || 0) / supplies.length).toLocaleString()
                    : 0}
                </div>
                <p className="text-[9px] sm:text-[10px] text-cyan-400/80 font-mono mt-0.5">
                  Per Care Center
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── FILTER & VIEW CONTROL BAR ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-xl border border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search CCC code, subdivision name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 text-xs h-8.5 rounded-lg"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-wrap sm:flex-nowrap">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
            className={`text-[11px] h-7.5 px-2.5 shrink-0 ${statusFilter === "all" ? "bg-blue-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            All Supplies ({supplies.length})
          </Button>

          <Button
            size="sm"
            variant={statusFilter === "active" ? "default" : "outline"}
            onClick={() => setStatusFilter("active")}
            className={`text-[11px] h-7.5 px-2.5 shrink-0 ${statusFilter === "active" ? "bg-emerald-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            Active ({globalSummary?.activeSuppliesCount || 0})
          </Button>

          <Button
            size="sm"
            variant={statusFilter === "base_only" ? "default" : "outline"}
            onClick={() => setStatusFilter("base_only")}
            className={`text-[11px] h-7.5 px-2.5 shrink-0 ${statusFilter === "base_only" ? "bg-amber-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            Base Only (0 Patches)
          </Button>

          {/* Module Filter dropdown selector */}
          <select
            value={selectedModuleKey}
            onChange={e => setSelectedModuleKey(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs h-7.5 px-2 rounded-lg outline-none cursor-pointer hover:border-slate-600"
          >
            <option value="all">All Modules ({modulesList.length})</option>
            {modulesList.map(m => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center border border-slate-700 rounded-lg p-0.5 bg-slate-950 ml-auto sm:ml-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode("matrix")}
              className={`h-6.5 px-2 text-[11px] rounded ${viewMode === "matrix" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`}
              title="Matrix Heatmap View"
            >
              <TableIcon className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Matrix</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode("cards")}
              className={`h-6.5 px-2 text-[11px] rounded ${viewMode === "cards" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`}
              title="Supply Deep-Dive Cards"
            >
              <LayoutGrid className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Cards</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode("modules")}
              className={`h-6.5 px-2 text-[11px] rounded ${viewMode === "modules" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"}`}
              title="Module Leaderboard Ranking"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Modules</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CONTAINER ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-xs text-slate-400 font-mono">Loading Supply Update Versions from KV Store...</p>
        </div>
      ) : filteredSupplies.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
          <AlertCircle className="h-8 w-8 text-slate-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Care Centers match your filters</h3>
          <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
        </div>
      ) : viewMode === "matrix" ? (
        /* ── VIEW 1: MATRIX HEATMAP VIEW ── */
        <Card className="bg-slate-900/70 border-slate-800 overflow-hidden shadow-2xl rounded-2xl">
          <CardHeader className="py-3 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/90 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs sm:text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
                <TableIcon className="h-4 w-4 text-blue-400" />
                Live Supply Module Version Matrix
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-400 mt-0.5">
                Click on any cell to inspect recent delta patches or reset base version pointer.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                Showing {filteredSupplies.length} Supplies × {filteredModulesList.length} Modules
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              {/* Table Header */}
              <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-bold sticky top-0 z-20">
                <tr>
                  <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-950 border-r border-slate-800 min-w-[200px]">
                    Care Center (Supply)
                  </th>
                  <th className="py-3 px-3 text-center border-r border-slate-800/80 w-[90px]">
                    Total Updates
                  </th>
                  {filteredModulesList.map(mod => (
                    <th key={mod.key} className="py-3 px-2 text-center border-r border-slate-800/80 min-w-[85px] last:border-r-0">
                      <div className="text-[11px] font-bold text-slate-200">{mod.shortLabel}</div>
                      <div className="text-[9px] font-normal text-slate-500 lowercase truncate max-w-[80px] mx-auto">
                        {mod.category}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredSupplies.map(supply => {
                  return (
                    <tr key={supply.cccCode} className="hover:bg-slate-800/30 transition-colors group">
                      {/* 1. Supply Name & Code (Sticky Column) */}
                      <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-slate-950/95 border-r border-slate-800 group-hover:bg-slate-900 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                            {supply.cccCode}
                          </span>
                          <span className="font-semibold text-slate-200 text-xs truncate max-w-[140px]">
                            {supply.cccName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                          <span>{supply.activeModulesCount}/{supply.totalModulesCount} active</span>
                          {supply.lastActiveTimestamp && (
                            <span className="text-slate-500">· {formatRelativeTime(supply.lastActiveTimestamp)}</span>
                          )}
                        </div>
                      </td>

                      {/* 2. Total Updates Column */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-800/80 font-mono">
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs font-bold ${
                            supply.totalUpdates > 0
                              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                              : "bg-slate-900 border-slate-800 text-slate-500"
                          }`}
                        >
                          {supply.totalUpdates.toLocaleString()}
                        </Badge>
                      </td>

                      {/* 3. Module Version Cells */}
                      {filteredModulesList.map(mod => {
                        const detail = supply.modules[mod.key] || {
                          moduleKey: mod.key,
                          moduleLabel: mod.label,
                          shortLabel: mod.shortLabel,
                          category: mod.category,
                          baseVersion: 1,
                          patchVersion: 0,
                          versionString: "v1.0",
                          totalUpdates: 0,
                          lastUpdated: null,
                          lastAction: null,
                          lastRecordId: null,
                          recentPatches: [],
                          isActive: false,
                        }

                        const cellBg = getVersionCellBgClass(detail.totalUpdates, maxPatchCount)

                        return (
                          <td
                            key={mod.key}
                            className="py-1.5 px-1.5 text-center border-r border-slate-800/80 last:border-r-0"
                          >
                            <button
                              type="button"
                              onClick={() => openInspector(supply, detail)}
                              className={`w-full py-1.5 px-1 rounded-lg border text-[11px] font-mono transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none ${cellBg}`}
                              title={`${supply.cccName} • ${mod.label}: ${detail.versionString} (${detail.totalUpdates} updates) - Click to inspect`}
                            >
                              <span className="font-bold tracking-tight">{detail.versionString}</span>
                              <span className="text-[9px] opacity-75 font-normal">
                                {detail.totalUpdates > 0 ? `(${detail.totalUpdates})` : "idle"}
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>

              {/* Table Footer: Column Totals */}
              <tfoot className="bg-slate-950/95 border-t-2 border-slate-800 font-bold text-xs sticky bottom-0 z-20">
                <tr>
                  <td className="py-3 px-3.5 sticky left-0 z-30 bg-slate-950 border-r border-slate-800 text-slate-200">
                    Grand Total
                  </td>
                  <td className="py-3 px-3 text-center border-r border-slate-800 text-amber-300 font-mono text-xs">
                    {(globalSummary?.totalUpdatesAllSupplies || 0).toLocaleString()}
                  </td>
                  {filteredModulesList.map(mod => {
                    const modTot = globalSummary?.moduleTotals[mod.key]?.totalUpdates || 0
                    const activeCCCs = globalSummary?.moduleTotals[mod.key]?.activeSuppliesCount || 0
                    return (
                      <td key={mod.key} className="py-3 px-2 text-center border-r border-slate-800/80 text-blue-300 font-mono text-[11px]">
                        <div>{modTot.toLocaleString()}</div>
                        <div className="text-[9px] font-normal text-slate-400">
                          {activeCCCs} CCCs
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </CardContent>

          {/* Color Scale Legend */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="text-slate-400 text-[11px]">
              💡 <span className="font-semibold text-slate-300">Click any version pill</span> to view recent updates, timestamps, or reset base pointer.
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono">
              <span className="text-slate-500 mr-1">Activity Level:</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">0 (idle)</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/50 text-blue-300">Low</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-200">Med</span>
              <span className="px-1.5 py-0.5 rounded bg-violet-950/90 border border-violet-600/70 text-violet-200">High</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/70 text-emerald-200">Very High</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500/80 text-amber-200 font-bold">Top</span>
            </div>
          </div>
        </Card>
      ) : viewMode === "cards" ? (
        /* ── VIEW 2: SUPPLY DEEP-DIVE CARDS VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSupplies.map(supply => {
            return (
              <Card key={supply.cccCode} className="bg-slate-900/70 border-slate-800 shadow-md hover:border-slate-700 transition-all rounded-2xl flex flex-col justify-between">
                <CardHeader className="p-4 pb-3 border-b border-slate-800/80">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/30">
                          {supply.cccCode}
                        </span>
                        <h3 className="font-bold text-sm text-slate-100 truncate">
                          {supply.cccName}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>Last update: {formatRelativeTime(supply.lastActiveTimestamp)}</span>
                      </p>
                    </div>

                    <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                      {supply.totalUpdates.toLocaleString()} updates
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-2.5 flex-1">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                    <span>Module Version Breakdown</span>
                    <span className="font-mono text-slate-500">{supply.activeModulesCount} of {supply.totalModulesCount} Active</span>
                  </div>

                  <div className="space-y-1.5">
                    {modulesList.map(mod => {
                      const detail = supply.modules[mod.key]
                      const totalUpdates = detail?.totalUpdates || 0
                      const versionStr = detail?.versionString || "v1.0"
                      const percent = Math.min(100, Math.round((totalUpdates / Math.max(supply.totalUpdates, 1)) * 100))

                      return (
                        <div
                          key={mod.key}
                          onClick={() => detail && openInspector(supply, detail)}
                          className="bg-slate-950/80 border border-slate-800/80 hover:border-blue-500/40 p-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-semibold text-slate-300 text-xs truncate group-hover:text-blue-300">
                              {mod.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-slate-500 font-mono">
                              {totalUpdates} updates
                            </span>
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] ${
                                totalUpdates > 0
                                  ? "bg-blue-500/15 border-blue-500/30 text-blue-300 font-bold"
                                  : "bg-slate-900 border-slate-800 text-slate-500"
                              }`}
                            >
                              {versionStr}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        /* ── VIEW 3: MODULE LEADERBOARD RANKING VIEW ── */
        <div className="space-y-3">
          {modulesList.map((mod, idx) => {
            const modSummary = globalSummary?.moduleTotals[mod.key] || { totalUpdates: 0, activeSuppliesCount: 0 }
            const activeCount = modSummary.activeSuppliesCount
            const adoptionPct = supplies.length ? Math.round((activeCount / supplies.length) * 100) : 0

            // Find top care centers for this module
            const topSuppliesForModule = [...supplies]
              .filter(s => (s.modules[mod.key]?.totalUpdates || 0) > 0)
              .sort((a, b) => (b.modules[mod.key]?.totalUpdates || 0) - (a.modules[mod.key]?.totalUpdates || 0))

            return (
              <Card key={mod.key} className="bg-slate-900/70 border-slate-800 shadow-md rounded-2xl overflow-hidden">
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/90">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-500/20 text-blue-400 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-slate-100">{mod.label}</h3>
                        <Badge variant="outline" className={`text-[10px] uppercase ${getCategoryColor(mod.category)}`}>
                          {mod.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{mod.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto font-mono text-xs">
                    <div className="text-right">
                      <div className="text-lg font-black text-amber-400">
                        {modSummary.totalUpdates.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500">Total Module Updates</div>
                    </div>
                    <div className="h-8 w-px bg-slate-800" />
                    <div className="text-right">
                      <div className="text-lg font-black text-emerald-400">
                        {activeCount} <span className="text-xs font-normal text-slate-500">/ {supplies.length}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{adoptionPct}% Care Centers Active</div>
                    </div>
                  </div>
                </div>

                <CardContent className="p-4 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Active Care Centers Using {mod.shortLabel} ({topSuppliesForModule.length})
                  </div>

                  {topSuppliesForModule.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">No care centers have update activity recorded for this module yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {topSuppliesForModule.map(s => {
                        const detail = s.modules[mod.key]
                        return (
                          <div
                            key={s.cccCode}
                            onClick={() => detail && openInspector(s, detail)}
                            className="bg-slate-950/80 border border-slate-800 hover:border-blue-500/50 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[11px] text-blue-400">{s.cccCode}</span>
                                <span className="font-medium text-slate-200 truncate max-w-[130px]">{s.cccName}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {formatRelativeTime(detail?.lastUpdated || null)}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <Badge variant="outline" className="font-mono text-xs bg-blue-500/10 border-blue-500/30 text-blue-300 font-bold">
                                {detail?.versionString || "v1.0"}
                              </Badge>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {detail?.totalUpdates} updates
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── INTERACTIVE DRILLDOWN & PATCH LOG INSPECTION MODAL ── */}
      <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl bg-slate-900 border-slate-800 text-slate-100 dark p-4 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
          {selectedSupply && selectedModuleDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 text-base sm:text-lg">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-blue-400" />
                    <span>
                      {selectedModuleDetail.moduleLabel} ({selectedSupply.cccCode})
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-sm bg-blue-500/15 border-blue-500/30 text-blue-300 font-bold px-2 py-0.5">
                    {selectedModuleDetail.versionString}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  {selectedSupply.cccName} • Care Center KV Version & Patch Details
                </DialogDescription>
              </DialogHeader>

              {resetFeedbackMsg && (
                <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  resetFeedbackMsg.type === "success" ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300" : "bg-rose-950/60 border border-rose-800 text-rose-300"
                }`}>
                  {resetFeedbackMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span>{resetFeedbackMsg.text}</span>
                </div>
              )}

              {/* Version Metrics Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Base Version</div>
                  <div className="text-base font-black text-blue-400 font-mono mt-0.5">
                    v{selectedModuleDetail.baseVersion}
                  </div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Patch Version (Updates)</div>
                  <div className="text-base font-black text-amber-400 font-mono mt-0.5">
                    {selectedModuleDetail.patchVersion}
                  </div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Last Action</div>
                  <div className="text-base font-black text-emerald-400 font-mono mt-0.5 uppercase">
                    {selectedModuleDetail.lastAction || "None"}
                  </div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Last Updated</div>
                  <div className="text-xs font-bold text-slate-200 font-mono mt-1">
                    {formatRelativeTime(selectedModuleDetail.lastUpdated)}
                  </div>
                </div>
              </div>

              {/* Key KV Path Info */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                  <span>KV Storage Pointers</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Base Key:</span> tenant_{selectedSupply.cccCode.toLowerCase()}:{selectedModuleDetail.moduleKey}:base_version (
                  <span className="text-blue-300">{selectedModuleDetail.baseVersion}</span>)
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Patch Key:</span> tenant_{selectedSupply.cccCode.toLowerCase()}:{selectedModuleDetail.moduleKey}:patch_version (
                  <span className="text-amber-300">{selectedModuleDetail.patchVersion}</span>)
                </div>
                {selectedModuleDetail.lastUpdated && (
                  <div className="text-slate-400 text-[10px]">
                    Exact timestamp: {formatExactDateTime(selectedModuleDetail.lastUpdated)}
                  </div>
                )}
              </div>

              {/* Recent Delta Patches List */}
              <div className="space-y-2 py-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Recent Delta Patches Log ({selectedModuleDetail.recentPatches.length})</span>
                  <span className="text-[10px] text-slate-500 font-normal">Last recorded modifications</span>
                </div>

                {selectedModuleDetail.recentPatches.length === 0 ? (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center text-slate-500 text-xs italic">
                    No individual delta patches recorded in the KV patch log for this module yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {selectedModuleDetail.recentPatches.map((patch, pIdx) => (
                      <div
                        key={`${patch.patchVersion}-${pIdx}`}
                        className="bg-slate-950 border border-slate-800/90 rounded-lg p-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-bold px-1.5 py-0 ${
                                patch.action === "DELETE"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              }`}
                            >
                              {patch.action}
                            </Badge>
                            <span className="text-blue-300 font-bold">ID: {patch.recordId || "N/A"}</span>
                            <span className="text-slate-500 text-[10px]">Patch #{patch.patchVersion}</span>
                          </div>
                          {patch.changes && Object.keys(patch.changes).length > 0 && (
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[380px]">
                              Fields: {Object.keys(patch.changes).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-[10px] text-slate-500 font-mono shrink-0">
                          {formatRelativeTime(patch.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-2 flex flex-row items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetBaseVersion}
                  disabled={resettingBase}
                  className="border-rose-800/60 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs h-8 px-2.5"
                  title="Force base compaction reset for this module"
                >
                  <RotateCcw className={`h-3.5 w-3.5 mr-1 ${resettingBase ? "animate-spin" : ""}`} />
                  Reset Base Version
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setInspectModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-8 px-3"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

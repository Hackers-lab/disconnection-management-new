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
import { toast } from "@/hooks/use-toast"
import {
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
  RotateCcw,
  Zap,
  ShieldCheck,
  Flame,
  ArrowUpDown,
  X,
  ArrowLeft,
} from "lucide-react"
import type {
  SupplyVersionReportItem,
  GlobalVersionSummary,
  SystemModuleMeta,
  SupplyModuleVersionDetail,
} from "@/lib/version-engine"

interface SupplyModuleVersionsReportProps {
  onBackToDashboard?: () => void
}

type ViewMode = "matrix" | "cards" | "modules"
type FilterStatus = "all" | "today" | "active" | "base_only" | "unused"
type SortField = "today" | "updates" | "lifetime" | "code" | "name" | "recent"

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
  if (patchCount === 0) {
    return "bg-slate-50 text-slate-400 border-slate-200/80 hover:bg-slate-100 hover:text-slate-600"
  }
  const ratio = patchCount / Math.max(maxPatch, 1)
  if (ratio < 0.1) {
    return "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100"
  }
  if (ratio < 0.25) {
    return "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100"
  }
  if (ratio < 0.5) {
    return "bg-violet-100/80 text-violet-900 border-violet-300 hover:bg-violet-100"
  }
  if (ratio < 0.75) {
    return "bg-emerald-100/80 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
  }
  return "bg-amber-100 text-amber-950 border-amber-400 font-bold shadow-2xs hover:bg-amber-200/80"
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "operations":
      return "text-blue-700 bg-blue-50 border-blue-200"
    case "metering":
      return "text-amber-800 bg-amber-50 border-amber-200"
    case "infrastructure":
      return "text-purple-700 bg-purple-50 border-purple-200"
    case "safety":
      return "text-rose-700 bg-rose-50 border-rose-200"
    default:
      return "text-slate-600 bg-slate-100 border-slate-200"
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
  const [categoryFilter] = useState<string>("all")
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("today")
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("matrix")

  // Inspector Modal State
  const [inspectModalOpen, setInspectModalOpen] = useState(false)
  const [selectedSupply, setSelectedSupply] = useState<SupplyVersionReportItem | null>(null)
  const [selectedModuleDetail, setSelectedModuleDetail] = useState<SupplyModuleVersionDetail | null>(null)
  const [resettingBase, setResettingBase] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetFeedbackMsg, setResetFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)
    setLoadError(null)

    try {
      const res = await fetch("/api/superuser/module-versions")
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      if (data.success) {
        setSupplies(data.supplies || [])
        setGlobalSummary(data.globalSummary || null)
        setModulesList(data.modulesList || [])
        setLastRefreshedAt(new Date())
      } else {
        throw new Error(data.error || "Failed to load module versions")
      }
    } catch (e: any) {
      console.error("Failed to fetch supply module versions:", e)
      setLoadError(e?.message || "Failed to fetch supply module versions.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredModulesList = useMemo(() => {
    return modulesList.filter((mod) => {
      if (categoryFilter !== "all" && mod.category !== categoryFilter) return false
      if (selectedModuleKey !== "all" && mod.key !== selectedModuleKey) return false
      return true
    })
  }, [modulesList, categoryFilter, selectedModuleKey])

  const filteredSupplies = useMemo(() => {
    const result = supplies.filter((s) => {
      const query = searchTerm.toLowerCase().trim()
      if (query) {
        const matchesCode = s.cccCode.toLowerCase().includes(query)
        const matchesName = s.cccName.toLowerCase().includes(query)
        if (!matchesCode && !matchesName) return false
      }

      if (statusFilter === "today" && s.updatesToday === 0) return false
      if (
        statusFilter === "active" &&
        s.totalUpdates === 0 &&
        s.updatesToday === 0 &&
        (s.lifetimeUpdates || 0) === 0
      )
        return false
      if (statusFilter === "base_only" && (s.totalUpdates > 0 || s.activeModulesCount === 0))
        return false
      if (statusFilter === "unused" && s.activeModulesCount > 0) return false

      if (selectedModuleKey !== "all") {
        const modDetail = s.modules[selectedModuleKey]
        if (!modDetail || (!modDetail.isActive && (modDetail.updatesToday || 0) === 0)) {
          if (statusFilter === "active" || statusFilter === "today") return false
        }
      }

      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortField === "today") {
        cmp =
          (b.updatesToday || 0) - (a.updatesToday || 0) ||
          (b.lifetimeUpdates || 0) - (a.lifetimeUpdates || 0) ||
          b.totalUpdates - a.totalUpdates
      } else if (sortField === "updates") {
        cmp = b.totalUpdates - a.totalUpdates
      } else if (sortField === "lifetime") {
        cmp = (b.lifetimeUpdates || 0) - (a.lifetimeUpdates || 0)
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

  const maxActivityCount = useMemo(() => {
    let max = 1
    supplies.forEach((s) => {
      Object.values(s.modules).forEach((m) => {
        const score = m.totalUpdates > 0 ? m.totalUpdates : (m.lifetimeUpdates || Math.max(0, m.baseVersion - 1))
        if (score > max) max = score
      })
    })
    return max
  }, [supplies])

  const openInspector = (supply: SupplyVersionReportItem, moduleDetail: SupplyModuleVersionDetail) => {
    setSelectedSupply(supply)
    setSelectedModuleDetail(moduleDetail)
    setResetFeedbackMsg(null)
    setConfirmingReset(false)
    setInspectModalOpen(true)
  }

  const handleResetBaseVersion = async () => {
    if (!selectedSupply || !selectedModuleDetail) return

    setResettingBase(true)
    setResetFeedbackMsg(null)
    setConfirmingReset(false)
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
        setSelectedModuleDetail((prev) =>
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

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      const matrixHeaders = [
        "CCC Code",
        "Subdivision / Care Center",
        "Total Updates",
        "Active Modules",
        "Last Activity Time",
        ...modulesList.map((m) => `${m.label} (Version)`),
        ...modulesList.map((m) => `${m.label} (Updates)`),
      ]

      const matrixRows = supplies.map((s) => [
        s.cccCode,
        s.cccName,
        s.totalUpdates,
        `${s.activeModulesCount} / ${s.totalModulesCount}`,
        s.lastActiveTimestamp ? new Date(s.lastActiveTimestamp).toISOString() : "Never",
        ...modulesList.map((m) => s.modules[m.key]?.versionString || "v1.0"),
        ...modulesList.map((m) => s.modules[m.key]?.totalUpdates || 0),
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

      if (globalSummary?.moduleTotals) {
        const modHeaders = ["Module Key", "Module Name", "Total Updates", "Active Supplies Count", "Adoption %"]
        const modRows = modulesList.map((m) => {
          const tot = globalSummary.moduleTotals[m.key] || { totalUpdates: 0, activeSuppliesCount: 0 }
          const adoption = supplies.length ? Math.round((tot.activeSuppliesCount / supplies.length) * 100) : 0
          return [m.key, m.label, tot.totalUpdates, tot.activeSuppliesCount, `${adoption}%`]
        })
        const wsModules = XLSX.utils.aoa_to_sheet([modHeaders, ...modRows])
        wsModules["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsModules, "Module Summary")
      }

      const kpiRows = [
        ["Report Title", "Supply Update Version & Module Usage Report"],
        ["Generated At", new Date().toLocaleString("en-IN")],
        ["Total Care Centers (Supplies)", supplies.length],
        ["Active Supplies", globalSummary?.activeSuppliesCount || 0],
        ["Total Updates Across System", globalSummary?.totalUpdatesAllSupplies || 0],
        [
          "Top Active Supply",
          globalSummary?.topSupply
            ? `${globalSummary.topSupply.cccCode} - ${globalSummary.topSupply.cccName} (${globalSummary.topSupply.totalUpdates} updates)`
            : "N/A",
        ],
        [
          "Top Active Module",
          globalSummary?.topModule
            ? `${globalSummary.topModule.moduleLabel} (${globalSummary.topModule.totalUpdates} updates)`
            : "N/A",
        ],
      ]
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiRows)
      wsKPI["!cols"] = [{ wch: 28 }, { wch: 45 }]
      XLSX.utils.book_append_sheet(wb, wsKPI, "Executive KPIs")

      XLSX.writeFile(wb, `Supply_Module_Versions_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast({ title: "Excel Export Ready", description: "Supply module versions report downloaded." })
    } catch (e) {
      console.error("Excel export error:", e)
      toast({ variant: "destructive", title: "Export Failed", description: "Failed to export Excel report." })
    }
  }

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")
      const doc = new jsPDF({ orientation: "landscape" })
      const pw = doc.internal.pageSize.width

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

      const head = [["CCC Code", "Care Center Name", "Updates", "Active", ...modulesList.map((m) => m.shortLabel)]]

      const body = supplies.map((s) => [
        s.cccCode,
        s.cccName,
        String(s.totalUpdates),
        `${s.activeModulesCount}/${s.totalModulesCount}`,
        ...modulesList.map((m) => {
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
      toast({ title: "PDF Export Ready", description: "Supply module versions PDF downloaded." })
    } catch (e) {
      console.error("PDF export error:", e)
      toast({ variant: "destructive", title: "Export Failed", description: "Failed to export PDF report." })
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-tab-enter">
      {/* TOP BANNER & ACTION BAR (Crisp Light Theme) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToDashboard && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onBackToDashboard}
              title="Back to Care Centers"
              className="h-8 w-8 rounded-xl border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="bg-sky-50 border border-sky-200/80 p-2.5 rounded-xl text-sky-600 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Supply Update Versions &amp; Module Sync
              </h2>
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-mono font-semibold">
                KV Live
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live KV version pointers (<span className="font-mono text-sky-700">v&lt;base&gt;.&lt;patch&gt;</span>) &amp; update activity across all care centers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <span className="text-[11px] text-slate-400 font-mono hidden xl:inline">
            Checked: {lastRefreshedAt.toLocaleTimeString("en-IN")}
          </span>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-8 text-xs border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold px-2.5 rounded-lg cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            <span>Excel</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportPDF}
            className="h-8 text-xs border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold px-2.5 rounded-lg cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 mr-1 text-blue-600" />
            <span>PDF</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
          <span className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            {loadError}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            className="h-7 text-xs border-rose-300 bg-white text-rose-700 hover:bg-rose-100 rounded-lg cursor-pointer"
          >
            Retry
          </Button>
        </div>
      )}

      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "today" ? "all" : "today")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "today"
              ? "border-emerald-500 ring-2 ring-emerald-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Updates Today
            </span>
            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <>
              <div className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">
                {(globalSummary?.totalUpdatesTodayAllSupplies || 0).toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {globalSummary?.activeTodaySuppliesCount || 0} CCCs active today
              </p>
            </>
          )}
        </button>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Current Patches
            </span>
            <Flame className="h-4 w-4 text-amber-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <>
              <div className="text-2xl font-extrabold text-amber-700 font-mono mt-1">
                {(globalSummary?.totalUpdatesAllSupplies || 0).toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Uncompacted delta logs</p>
            </>
          )}
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Cumulative
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <>
              <div className="text-2xl font-extrabold text-blue-700 font-mono mt-1">
                {(globalSummary?.totalLifetimeUpdatesAllSupplies || 0).toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Survives base bumps</p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "active"
              ? "border-indigo-500 ring-2 ring-indigo-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active Supplies
            </span>
            <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <>
              <div className="text-2xl font-extrabold text-indigo-700 font-mono mt-1">
                {globalSummary?.activeSuppliesCount || 0}
                <span className="text-xs text-slate-400 font-normal">/{supplies.length}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {supplies.length
                  ? Math.round(((globalSummary?.activeSuppliesCount || 0) / supplies.length) * 100)
                  : 0}
                % adoption rate
              </p>
            </>
          )}
        </button>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Top Supply
            </span>
            <TrendingUp className="h-4 w-4 text-cyan-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : globalSummary?.topSupply ? (
            <div className="mt-1">
              <div className="text-xs font-extrabold font-mono text-cyan-800 truncate">
                {globalSummary.topSupply.cccCode}
              </div>
              <p className="text-[11px] text-slate-600 font-medium truncate">
                {globalSummary.topSupply.cccName}
              </p>
              <span className="inline-block text-[10px] font-mono font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0 mt-1">
                +{globalSummary.topSupply.updatesToday} today
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic mt-2">No updates yet</p>
          )}
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Top Module
            </span>
            <Zap className="h-4 w-4 text-violet-600 shrink-0" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : globalSummary?.topModule ? (
            <div className="mt-1">
              <div className="text-xs font-extrabold text-violet-800 truncate">
                {globalSummary.topModule.moduleLabel}
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                +{globalSummary.topModule.updatesToday} today
              </p>
              <span className="inline-block text-[10px] font-mono font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0 mt-1">
                {Math.max(
                  globalSummary.topModule.lifetimeUpdates || 0,
                  globalSummary.topModule.totalUpdates || 0
                ).toLocaleString()}{" "}
                cumulative
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic mt-2">No updates yet</p>
          )}
        </div>
      </div>

      {/* FILTER & VIEW CONTROL BAR */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search CCC code or subdivision name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-8 bg-slate-50/80 border-slate-200 text-slate-900 text-xs h-9 rounded-xl focus-visible:bg-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: `All (${supplies.length})` },
              { id: "today", label: `Today (${globalSummary?.activeTodaySuppliesCount || 0})` },
              { id: "active", label: `Active (${globalSummary?.activeSuppliesCount || 0})` },
              { id: "base_only", label: "Base Only" },
            ] as Array<{ id: FilterStatus; label: string }>
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                statusFilter === pill.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {pill.label}
            </button>
          ))}

          <select
            value={selectedModuleKey}
            onChange={(e) => setSelectedModuleKey(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs h-8 px-2 rounded-lg outline-none cursor-pointer hover:border-slate-300"
          >
            <option value="all">All Modules ({modulesList.length})</option>
            {modulesList.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 shrink-0">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-white border border-slate-200 text-slate-700 text-xs h-8 px-2 rounded-lg outline-none cursor-pointer hover:border-slate-300"
              title="Sort supplies by"
            >
              <option value="today">Sort: Today</option>
              <option value="updates">Sort: Patches</option>
              <option value="lifetime">Sort: Cumulative</option>
              <option value="recent">Sort: Most Recent</option>
              <option value="code">Sort: CCC Code</option>
              <option value="name">Sort: Name</option>
            </select>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setSortAsc((prev) => !prev)}
              className="h-8 w-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              title={sortAsc ? "Ascending order" : "Descending order"}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center border border-slate-200 rounded-xl p-0.5 bg-slate-100/80 ml-auto shrink-0">
            {(
              [
                { id: "matrix", label: "Matrix", icon: TableIcon },
                { id: "cards", label: "Cards", icon: LayoutGrid },
                { id: "modules", label: "Modules", icon: BarChart3 },
              ] as Array<{ id: ViewMode; label: string; icon: typeof TableIcon }>
            ).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewMode(tab.id)}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === tab.id
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
          <p className="text-xs text-slate-500 font-medium">Loading Supply Update Versions from KV Store...</p>
        </div>
      ) : filteredSupplies.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-slate-200/80 space-y-2 shadow-2xs">
          <AlertCircle className="h-7 w-7 text-slate-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-700">No Care Centers match your filters</h3>
          <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
        </div>
      ) : viewMode === "matrix" ? (
        /* VIEW 1: CRISP LIGHT HEATMAP MATRIX */
        <Card className="bg-white border-slate-200/80 overflow-hidden shadow-xs rounded-2xl">
          <CardHeader className="py-3 px-4 sm:px-5 border-b border-slate-200/80 bg-slate-50/70 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TableIcon className="h-4 w-4 text-blue-600" />
                Live Supply Module Version Matrix
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-500 mt-0.5">
                Click any version cell to inspect delta patches or reset the base version pointer.
              </CardDescription>
            </div>
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              {filteredSupplies.length} Supplies × {filteredModulesList.length} Modules
            </span>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold sticky top-0 z-20">
                <tr>
                  <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 min-w-[215px]">
                    Care Center (Supply)
                  </th>
                  <th className="py-3 px-2 text-center border-r border-slate-200/80 w-[76px]">Today</th>
                  <th className="py-3 px-2 text-center border-r border-slate-200/80 w-[86px]">Cumulative</th>
                  {filteredModulesList.map((mod) => (
                    <th
                      key={mod.key}
                      className="py-3 px-2 text-center border-r border-slate-200/70 min-w-[85px] last:border-r-0"
                    >
                      <div className="text-[11px] font-bold text-slate-700">{mod.shortLabel}</div>
                      <div className="text-[9px] font-normal text-slate-400 lowercase truncate max-w-[80px] mx-auto">
                        {mod.category}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredSupplies.map((supply) => (
                  <tr key={supply.cccCode} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 transition-colors">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {supply.cccCode}
                        </span>
                        <span className="font-semibold text-slate-800 text-xs truncate max-w-[130px]" title={supply.cccName}>
                          {supply.cccName}
                        </span>
                        {supply.activityTier === "high" && (
                          <span className="inline-flex items-center px-1.5 py-0 text-[9px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                        <span>
                          {supply.activeModulesCount}/{supply.totalModulesCount} mods
                        </span>
                        {supply.lastActiveTimestamp && (
                          <span>· {formatRelativeTime(supply.lastActiveTimestamp)}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-center border-r border-slate-100 font-mono">
                      <Badge
                        variant="outline"
                        className={`font-mono text-[11px] font-bold ${
                          supply.updatesToday > 0
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        {supply.updatesToday > 0 ? `+${supply.updatesToday}` : "0"}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-2 text-center border-r border-slate-100 font-mono">
                      <Badge
                        variant="outline"
                        className={`font-mono text-[11px] font-bold ${
                          (supply.lifetimeUpdates || supply.totalUpdates) > 0
                            ? "bg-blue-50 border-blue-200 text-blue-800"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                        title={`Live uncompacted patches: ${supply.totalUpdates} • Cumulative updates: ${supply.lifetimeUpdates || supply.totalUpdates}`}
                      >
                        {(supply.lifetimeUpdates || supply.totalUpdates).toLocaleString()}
                      </Badge>
                      {supply.totalUpdates > 0 && (
                        <div className="text-[9px] text-amber-700 mt-0.5">{supply.totalUpdates} live</div>
                      )}
                    </td>

                    {filteredModulesList.map((mod) => {
                      const detail = supply.modules[mod.key] || {
                        moduleKey: mod.key,
                        moduleLabel: mod.label,
                        shortLabel: mod.shortLabel,
                        category: mod.category,
                        baseVersion: 1,
                        patchVersion: 0,
                        versionString: "v1.0",
                        totalUpdates: 0,
                        lifetimeUpdates: 0,
                        updatesToday: 0,
                        lastUpdated: null,
                        lastCompactedAt: null,
                        lastAction: null,
                        lastRecordId: null,
                        recentPatches: [],
                        isActive: false,
                      }

                      const activityScore =
                        detail.totalUpdates > 0
                          ? detail.totalUpdates
                          : detail.lifetimeUpdates || Math.max(0, detail.baseVersion - 1)
                      const cellBg = getVersionCellBgClass(activityScore, maxActivityCount)
                      const subLabel =
                        detail.totalUpdates > 0
                          ? `(${detail.totalUpdates})`
                          : detail.lifetimeUpdates > 0
                            ? `${detail.lifetimeUpdates} tot`
                            : detail.baseVersion > 1
                              ? "synced"
                              : "idle"

                      return (
                        <td
                          key={mod.key}
                          className="py-1.5 px-1.5 text-center border-r border-slate-100 last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => openInspector(supply, detail)}
                            className={`w-full py-1.5 px-1 rounded-lg border text-[11px] font-mono transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none ${cellBg}`}
                            title={`${supply.cccName} • ${mod.label}: ${detail.versionString} (${detail.totalUpdates} live patches, ${detail.lifetimeUpdates || 0} cumulative)`}
                          >
                            <span className="font-bold tracking-tight">{detail.versionString}</span>
                            <span className="text-[9px] opacity-80 font-normal">{subLabel}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs sticky bottom-0 z-20">
                <tr>
                  <td className="py-3 px-3.5 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 text-slate-800">
                    Grand Total
                  </td>
                  <td className="py-3 px-2 text-center border-r border-slate-200 text-emerald-700 font-mono text-xs">
                    +{(globalSummary?.totalUpdatesTodayAllSupplies || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-center border-r border-slate-200 text-blue-800 font-mono text-xs">
                    {(globalSummary?.totalLifetimeUpdatesAllSupplies || globalSummary?.totalUpdatesAllSupplies || 0).toLocaleString()}
                  </td>
                  {filteredModulesList.map((mod) => {
                    const modTot = globalSummary?.moduleTotals[mod.key]
                    const displayCount = Math.max(modTot?.lifetimeUpdates || 0, modTot?.totalUpdates || 0)
                    return (
                      <td
                        key={mod.key}
                        className="py-3 px-2 text-center border-r border-slate-200/70 text-blue-700 font-mono text-[11px] last:border-r-0"
                      >
                        <div>{displayCount.toLocaleString()}</div>
                        <div className="text-[9px] font-normal text-slate-500">
                          {modTot?.activeSuppliesCount || 0} CCCs
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </CardContent>

          <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="text-slate-500 text-[11px]">
              <span className="font-semibold text-slate-700">Tip:</span> Click any version cell to inspect delta logs or compact/reset its base pointer.
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
              <span className="text-slate-500 mr-1">Heatmap:</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500">0</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800">Low</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800">Med</span>
              <span className="px-1.5 py-0.5 rounded bg-violet-100 border border-violet-300 text-violet-900">High</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-900">Very High</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-400 text-amber-950 font-bold">Top</span>
            </div>
          </div>
        </Card>
      ) : viewMode === "cards" ? (
        /* VIEW 2: SUPPLY CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredSupplies.map((supply) => (
            <Card
              key={supply.cccCode}
              className="bg-white border-slate-200/80 shadow-2xs hover:border-blue-300/80 transition-all rounded-2xl flex flex-col justify-between"
            >
              <CardHeader className="p-4 pb-3 border-b border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 shrink-0">
                        {supply.cccCode}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 truncate">{supply.cccName}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>Last update: {formatRelativeTime(supply.lastActiveTimestamp)}</span>
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-800 font-mono text-xs font-bold shrink-0">
                    {(supply.lifetimeUpdates || supply.totalUpdates).toLocaleString()}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-2 flex-1">
                <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
                  <span>Module Breakdown</span>
                  <span className="font-mono text-slate-600">
                    {supply.activeModulesCount}/{supply.totalModulesCount} Active
                  </span>
                </div>

                <div className="space-y-1.5">
                  {modulesList.map((mod) => {
                    const detail = supply.modules[mod.key]
                    const totalUpdates = detail?.totalUpdates || 0
                    const lifetimeUpdates = detail?.lifetimeUpdates || totalUpdates
                    const isActive = Boolean(detail?.isActive)
                    const versionStr = detail?.versionString || "v1.0"

                    return (
                      <div
                        key={mod.key}
                        onClick={() => detail && openInspector(supply, detail)}
                        className="bg-slate-50/80 border border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/40 p-2 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer group"
                      >
                        <span className="font-medium text-slate-700 truncate group-hover:text-blue-700">
                          {mod.label}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-500 font-mono" title={`${totalUpdates} live • ${lifetimeUpdates} cumulative`}>
                            {lifetimeUpdates}
                          </span>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] ${
                              isActive
                                ? "bg-blue-50 border-blue-200 text-blue-700 font-bold"
                                : "bg-white border-slate-200 text-slate-400"
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
          ))}
        </div>
      ) : (
        /* VIEW 3: MODULE LEADERBOARD VIEW */
        <div className="space-y-3">
          {modulesList.map((mod, idx) => {
            const modSummary = globalSummary?.moduleTotals[mod.key] || {
              totalUpdates: 0,
              lifetimeUpdates: 0,
              activeSuppliesCount: 0,
            }
            const activeCount = modSummary.activeSuppliesCount
            const adoptionPct = supplies.length ? Math.round((activeCount / supplies.length) * 100) : 0
            const modTotalDisplay = Math.max(modSummary.lifetimeUpdates || 0, modSummary.totalUpdates || 0)

            const topSuppliesForModule = [...supplies]
              .filter((s) => Boolean(s.modules[mod.key]?.isActive))
              .sort((a, b) => {
                const aMod = a.modules[mod.key]
                const bMod = b.modules[mod.key]
                const aScore = Math.max(aMod?.lifetimeUpdates || 0, aMod?.totalUpdates || 0)
                const bScore = Math.max(bMod?.lifetimeUpdates || 0, bMod?.totalUpdates || 0)
                return bScore - aScore || (bMod?.baseVersion || 1) - (aMod?.baseVersion || 1)
              })

            return (
              <Card key={mod.key} className="bg-white border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-slate-900">{mod.label}</h3>
                        <Badge variant="outline" className={`text-[10px] uppercase ${getCategoryColor(mod.category)}`}>
                          {mod.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-auto font-mono text-xs">
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-blue-700">
                        {modTotalDisplay.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500">Cumulative Updates</div>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-emerald-700">
                        {activeCount} <span className="text-xs font-normal text-slate-400">/ {supplies.length}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{adoptionPct}% Adoption</div>
                    </div>
                  </div>
                </div>

                <CardContent className="p-4 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500">
                    Active Care Centers Using {mod.shortLabel} ({topSuppliesForModule.length})
                  </div>

                  {topSuppliesForModule.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">
                      No care centers have update activity recorded for this module yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {topSuppliesForModule.map((s) => {
                        const detail = s.modules[mod.key]
                        const countDisplay = Math.max(detail?.lifetimeUpdates || 0, detail?.totalUpdates || 0)
                        return (
                          <div
                            key={s.cccCode}
                            onClick={() => detail && openInspector(s, detail)}
                            className="bg-slate-50/80 border border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/40 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[11px] text-blue-700">{s.cccCode}</span>
                                <span className="font-medium text-slate-800 truncate max-w-[130px]">{s.cccName}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {formatRelativeTime(detail?.lastUpdated || null)}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <Badge variant="outline" className="font-mono text-xs bg-blue-50 border-blue-200 text-blue-700 font-bold">
                                {detail?.versionString || "v1.0"}
                              </Badge>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {countDisplay} total
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

      {/* DRILLDOWN & PATCH LOG INSPECTOR MODAL (Crisp Light Theme) */}
      <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
          {selectedSupply && selectedModuleDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 text-base font-bold text-slate-900 pr-6">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                      <Layers className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="truncate">
                      {selectedModuleDetail.moduleLabel} ({selectedSupply.cccCode})
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs bg-blue-50 border-blue-200 text-blue-700 font-bold px-2.5 py-0.5 shrink-0">
                    {selectedModuleDetail.versionString}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-xs">
                  {selectedSupply.cccName} • Care Center KV Version &amp; Patch Details
                </DialogDescription>
              </DialogHeader>

              {resetFeedbackMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium ${
                    resetFeedbackMsg.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border border-rose-200 text-rose-800"
                  }`}
                >
                  {resetFeedbackMsg.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  <span>{resetFeedbackMsg.text}</span>
                </div>
              )}

              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 py-1">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 font-medium">Base Version</div>
                  <div className="text-base font-extrabold text-blue-700 font-mono mt-0.5">
                    v{selectedModuleDetail.baseVersion}
                  </div>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-emerald-700 font-medium">Today</div>
                  <div className="text-base font-extrabold text-emerald-700 font-mono mt-0.5">
                    +{selectedModuleDetail.updatesToday || 0}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 font-medium">Patches</div>
                  <div className="text-base font-extrabold text-amber-700 font-mono mt-0.5">
                    {selectedModuleDetail.patchVersion}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 font-medium">Cumulative</div>
                  <div className="text-base font-extrabold text-cyan-700 font-mono mt-0.5">
                    {selectedModuleDetail.lifetimeUpdates || selectedModuleDetail.totalUpdates}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 font-medium">Updated</div>
                  <div className="text-xs font-bold text-slate-800 font-mono mt-1">
                    {formatRelativeTime(selectedModuleDetail.lastUpdated)}
                  </div>
                </div>
              </div>

              {/* KV Path Info */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 space-y-1 font-mono text-[11px]">
                <div className="text-slate-700 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                  <span>KV Storage Pointers</span>
                </div>
                <div className="text-slate-700 break-all">
                  <span className="text-slate-400">Base Key:</span> tenant_{selectedSupply.cccCode.toLowerCase()}:{selectedModuleDetail.moduleKey}:base_version (
                  <span className="text-blue-700 font-bold">{selectedModuleDetail.baseVersion}</span>)
                </div>
                <div className="text-slate-700 break-all">
                  <span className="text-slate-400">Patch Key:</span> tenant_{selectedSupply.cccCode.toLowerCase()}:{selectedModuleDetail.moduleKey}:patch_version (
                  <span className="text-amber-700 font-bold">{selectedModuleDetail.patchVersion}</span>)
                </div>
                {selectedModuleDetail.lastUpdated && (
                  <div className="text-slate-500 text-[10px]">
                    Exact timestamp: {formatExactDateTime(selectedModuleDetail.lastUpdated)}
                  </div>
                )}
              </div>

              {/* Recent Delta Patches */}
              <div className="space-y-2 py-1">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Recent Delta Patches Log ({selectedModuleDetail.recentPatches.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Latest modifications</span>
                </div>

                {selectedModuleDetail.recentPatches.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400 text-xs italic">
                    No individual delta patches recorded in the KV patch log for this module yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {selectedModuleDetail.recentPatches.map((patch, pIdx) => (
                      <div
                        key={`${patch.patchVersion}-${pIdx}`}
                        className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-bold px-1.5 py-0 ${
                                patch.action === "DELETE"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {patch.action}
                            </Badge>
                            <span className="text-blue-700 font-bold">ID: {patch.recordId || "N/A"}</span>
                            <span className="text-slate-400 text-[10px]">Patch #{patch.patchVersion}</span>
                          </div>
                          {patch.changes && Object.keys(patch.changes).length > 0 && (
                            <div className="text-[10px] text-slate-500 font-mono truncate max-w-[380px]">
                              Fields: {Object.keys(patch.changes).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-[10px] text-slate-400 font-mono shrink-0">
                          {formatRelativeTime(patch.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                {confirmingReset ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 w-full sm:w-auto">
                    <span>
                      Bump to <strong className="font-mono">v{selectedModuleDetail.baseVersion + 1}.0</strong> &amp; clear patches?
                    </span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingReset(false)}
                        className="h-7 px-2 text-xs bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleResetBaseVersion}
                        disabled={resettingBase}
                        className="h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                      >
                        {resettingBase ? "Resetting..." : "Confirm Reset"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingReset(true)}
                    disabled={resettingBase}
                    className="border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs h-8 px-3 rounded-xl font-semibold cursor-pointer"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 mr-1 ${resettingBase ? "animate-spin" : ""}`} />
                    Reset Base Version
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfirmingReset(false)
                    setInspectModalOpen(false)
                  }}
                  className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs h-8 px-4 rounded-xl cursor-pointer"
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

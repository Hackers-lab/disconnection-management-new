"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Zap,
  HardDrive,
  Cpu,
  Globe,
  ImageIcon,
  Sparkles,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Filter,
  Flame,
  Calendar,
  Edit3,
  ArrowLeft,
} from "lucide-react"
import type { VercelUsageResponse } from "@/app/api/superuser/vercel-usage/route"

interface VercelUsageMonitorProps {
  onBackToDashboard?: () => void
  onSpikesChange?: (count: number) => void
}

type FilterView = "spiked_only" | "all" | "critical_only"

function getProgressColor(percent: number): string {
  if (percent >= 90) return "bg-rose-500"
  if (percent >= 75) return "bg-orange-500"
  if (percent >= 50) return "bg-amber-500"
  return "bg-emerald-500"
}

function getSeverityBadge(severity: "normal" | "warning" | "high" | "critical", percent: number) {
  if (severity === "critical" || percent >= 90) {
    return (
      <Badge
        variant="outline"
        className="bg-rose-50 border-rose-300 text-rose-700 font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
      >
        <Flame className="h-3 w-3 text-rose-600" />
        CRITICAL {percent}%
      </Badge>
    )
  }
  if (severity === "high" || percent >= 75) {
    return (
      <Badge
        variant="outline"
        className="bg-orange-50 border-orange-300 text-orange-800 font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
      >
        <AlertTriangle className="h-3 w-3 text-orange-600" />
        HIGH {percent}%
      </Badge>
    )
  }
  if (severity === "warning" || percent >= 50) {
    return (
      <Badge
        variant="outline"
        className="bg-amber-50 border-amber-300 text-amber-800 font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
      >
        <AlertCircle className="h-3 w-3 text-amber-600" />
        SPIKE &gt; 50% ({percent}%)
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-emerald-50 border-emerald-200 text-emerald-700 font-mono text-[10px] font-semibold px-2 py-0.5"
    >
      NORMAL ({percent}%)
    </Badge>
  )
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "compute":
      return <Cpu className="h-4 w-4 text-blue-600" />
    case "bandwidth":
      return <HardDrive className="h-4 w-4 text-amber-600" />
    case "edge":
      return <Globe className="h-4 w-4 text-cyan-600" />
    case "media":
      return <ImageIcon className="h-4 w-4 text-purple-600" />
    case "build":
      return <Zap className="h-4 w-4 text-indigo-600" />
    default:
      return <Activity className="h-4 w-4 text-slate-600" />
  }
}

export function VercelUsageMonitor({ onBackToDashboard, onSpikesChange }: VercelUsageMonitorProps) {
  const [data, setData] = useState<VercelUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterView, setFilterView] = useState<FilterView>("spiked_only")

  // API Config modal
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configForm, setConfigForm] = useState({ token: "", teamId: "", projectId: "" })
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingToken, setTestingToken] = useState(false)
  const [configMsg, setConfigMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)

  // Quick Manual Readings modal
  const [showReadingsModal, setShowReadingsModal] = useState(false)
  const [readingsForm, setReadingsForm] = useState({
    fastOriginTransfer: "",
    bandwidth: "",
    serverlessExecution: "",
    serverlessInvocations: "",
    imageOptimization: "",
    edgeRequests: "",
  })
  const [savingReadings, setSavingReadings] = useState(false)
  const [readingsMsg, setReadingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchUsage = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setLoadError(null)

    try {
      const res = await fetch("/api/superuser/vercel-usage")
      if (!res.ok) throw new Error(`Failed to fetch usage (${res.status})`)
      const result: VercelUsageResponse = await res.json()
      setData(result)
      if (onSpikesChange && typeof result?.summary?.totalSpikedCount === "number") {
        onSpikesChange(result.summary.totalSpikedCount)
      }

      if (result.metrics) {
        const m = result.metrics
        const origin = m.find((x) => x.id === "fast_origin_transfer")?.used
        const bw = m.find((x) => x.id === "bandwidth")?.used
        const fn = m.find((x) => x.id === "serverless_execution")?.used
        const inv = m.find((x) => x.id === "serverless_invocations")?.used
        const img = m.find((x) => x.id === "image_optimization")?.used

        setReadingsForm({
          fastOriginTransfer: typeof origin === "number" ? String(origin) : "",
          bandwidth: typeof bw === "number" ? String(bw) : "",
          serverlessExecution: typeof fn === "number" ? String(fn) : "",
          serverlessInvocations: typeof inv === "number" ? String(inv) : "",
          imageOptimization: typeof img === "number" ? String(img) : "",
          edgeRequests: "",
        })
      }
    } catch (e: any) {
      console.error("Failed to fetch Vercel usage:", e)
      setLoadError(e?.message || "Failed to load Vercel usage metrics.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchUsage()
  }, [])

  const handleTestToken = async () => {
    setTestingToken(true)
    setConfigMsg(null)
    try {
      const res = await fetch("/api/superuser/vercel-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_token",
          token: configForm.token,
          teamId: configForm.teamId,
        }),
      })
      const resData = await res.json()
      if (res.ok && resData.success) {
        setConfigMsg({
          type: "success",
          text: `Connected to Vercel account: ${resData.user} (${resData.plan} Plan).`,
        })
      } else {
        throw new Error(resData.error || "Token test failed")
      }
    } catch (err: any) {
      setConfigMsg({ type: "error", text: err?.message || "Token verification failed" })
    } finally {
      setTestingToken(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    setConfigMsg(null)
    try {
      const res = await fetch("/api/superuser/vercel-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          token: configForm.token,
          teamId: configForm.teamId,
          projectId: configForm.projectId,
        }),
      })
      const resData = await res.json()
      if (res.ok && resData.success) {
        setConfigMsg({ type: "success", text: "Vercel credentials saved. Fetching live metrics..." })
        setTimeout(() => {
          setShowConfigModal(false)
          fetchUsage(true)
        }, 900)
      } else {
        throw new Error(resData.error || "Failed to save configuration")
      }
    } catch (err: any) {
      setConfigMsg({ type: "error", text: err?.message || "Failed to save settings" })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSaveReadings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingReadings(true)
    setReadingsMsg(null)

    try {
      const payload: Record<string, number> = {}
      const parseNonNeg = (val: string, label: string, integer = false): number | null => {
        const trimmed = val.trim()
        if (!trimmed) return null
        const n = integer ? parseInt(trimmed, 10) : parseFloat(trimmed)
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`${label} must be a valid non-negative number`)
        }
        return n
      }
      const originVal = parseNonNeg(readingsForm.fastOriginTransfer, "Fast Origin Transfer")
      if (originVal !== null) payload.fastOriginTransfer = originVal
      const bwVal = parseNonNeg(readingsForm.bandwidth, "Bandwidth")
      if (bwVal !== null) payload.bandwidth = bwVal
      const fnVal = parseNonNeg(readingsForm.serverlessExecution, "Function Execution")
      if (fnVal !== null) payload.serverlessExecution = fnVal
      const invVal = parseNonNeg(readingsForm.serverlessInvocations, "Function Invocations", true)
      if (invVal !== null) payload.serverlessInvocations = invVal
      const imgVal = parseNonNeg(readingsForm.imageOptimization, "Image Optimization", true)
      if (imgVal !== null) payload.imageOptimization = imgVal

      if (Object.keys(payload).length === 0) {
        throw new Error("Enter at least one metric value to save.")
      }

      const res = await fetch("/api/superuser/vercel-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_metrics",
          metrics: payload,
        }),
      })
      const resData = await res.json()
      if (res.ok && resData.success) {
        setReadingsMsg({ type: "success", text: "Usage metrics updated successfully." })
        setTimeout(() => {
          setShowReadingsModal(false)
          fetchUsage(true)
        }, 700)
      } else {
        throw new Error(resData.error || "Failed to save readings")
      }
    } catch (err: any) {
      setReadingsMsg({ type: "error", text: err?.message || "Failed to save readings" })
    } finally {
      setSavingReadings(false)
    }
  }

  const displayedMetrics = useMemo(() => {
    if (!data) return []
    if (filterView === "spiked_only") return data.spikedMetrics || []
    if (filterView === "critical_only") return (data.metrics || []).filter((m) => m.percent >= 75)
    return data.metrics || []
  }, [data, filterView])

  const spikedCount = data?.summary.totalSpikedCount || 0
  const criticalCount = data?.summary.criticalCount || 0
  const billing = data?.billingPeriod

  return (
    <div className="space-y-4 sm:space-y-5 animate-tab-enter">
      {/* TOP HEADER & CONTROLS (Crisp Light Theme) */}
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
          <div className="bg-orange-50 border border-orange-200/80 p-2.5 rounded-xl text-orange-600 shrink-0">
            <Flame className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Vercel Usage &amp; Spike Monitor
              </h2>
              {spikedCount > 0 ? (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-mono font-bold">
                  {spikedCount} Spikes &gt; 50%
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-mono font-semibold">
                  All &lt; 50% Healthy
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring plan quota consumption and highlighting metrics crossing the{" "}
              <span className="font-semibold text-amber-700">50% threshold</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setReadingsMsg(null)
              setShowReadingsModal(true)
            }}
            className="h-8 text-xs border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-2.5 rounded-lg cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 mr-1 text-amber-600" />
            <span>Sync Readings</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setConfigMsg(null)
              setShowConfigModal(true)
            }}
            className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 rounded-lg cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1 text-slate-500" />
            <span className="hidden sm:inline">API Config</span>
            <span className="sm:hidden">Token</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fetchUsage(true)}
            disabled={refreshing}
            className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin text-orange-600" : "text-slate-500"}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <a
            href="https://vercel.com/dashboard/usage"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Vercel</span>
          </a>
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
            onClick={() => fetchUsage(true)}
            className="h-7 text-xs border-rose-300 bg-white text-rose-700 hover:bg-rose-100 rounded-lg cursor-pointer"
          >
            Retry
          </Button>
        </div>
      )}

      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setFilterView("spiked_only")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            filterView === "spiked_only"
              ? "border-amber-500 ring-2 ring-amber-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Spiked (&gt; 50%)
            </span>
            <Flame className={`h-4 w-4 ${spikedCount > 0 ? "text-amber-600" : "text-slate-400"}`} />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <>
              <div className={`text-2xl font-extrabold font-mono mt-1 ${spikedCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {spikedCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {spikedCount > 0 ? "Requires optimization review" : "All limits within headroom"}
              </p>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setFilterView(criticalCount > 0 ? "critical_only" : "all")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            filterView === "critical_only"
              ? "border-rose-500 ring-2 ring-rose-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Peak Resource
            </span>
            <TrendingUp className="h-4 w-4 text-rose-600" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : data?.summary.highestMetric ? (
            <div className="mt-1">
              <div className="text-xs font-bold text-slate-800 truncate">
                {data.summary.highestMetric.name}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-extrabold text-rose-700 font-mono">
                  {data.summary.highestMetric.percent}%
                </span>
                <span className="text-[11px] text-slate-500">of quota</span>
              </div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">0%</div>
              <p className="text-[11px] text-slate-500 mt-0.5">No usage recorded</p>
            </>
          )}
        </button>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Vercel Plan
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : (
            <div className="mt-1">
              <div className="text-lg font-extrabold text-slate-900">{data?.plan || "Hobby"}</div>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono mt-1 ${
                  data?.source === "live_api"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-blue-50 border-blue-200 text-blue-700"
                }`}
              >
                {data?.source === "live_api" ? "Live API Sync" : "Stored Snapshot KV"}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Quota Reset
            </span>
            <Calendar className="h-4 w-4 text-cyan-600" />
          </div>
          {loading ? (
            <div className="h-7 w-16 bg-slate-100 animate-pulse rounded mt-1.5" />
          ) : billing ? (
            <div className="mt-1">
              <div className="text-2xl font-extrabold text-cyan-700 font-mono">
                {billing.daysRemaining} <span className="text-xs text-slate-400 font-normal">days left</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {billing.percentElapsed}% of month elapsed
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic mt-2">Monthly cycle</p>
          )}
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span>Metric View:</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterView("spiked_only")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filterView === "spiked_only"
                ? "bg-amber-600 text-white shadow-2xs"
                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>Spikes &gt; 50% ({spikedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterView("all")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filterView === "all"
                ? "bg-slate-900 text-white shadow-2xs"
                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>All Resources ({data?.metrics.length || 0})</span>
          </button>

          {criticalCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterView("critical_only")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterView === "critical_only"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Critical &gt; 75% ({criticalCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* METRICS GRID OR HEALTHY CARD */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <RefreshCw className="h-7 w-7 animate-spin text-orange-600" />
          <p className="text-xs text-slate-500 font-medium">Fetching live Vercel usage metrics...</p>
        </div>
      ) : filterView === "spiked_only" && displayedMetrics.length === 0 ? (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-emerald-900">
              All Vercel Resources Are Within Safe Limits
            </h3>
            <p className="text-xs text-emerald-800/80 max-w-md mx-auto mt-1">
              None of your infrastructure metrics have crossed the{" "}
              <span className="font-semibold text-emerald-950">50% plan limit threshold</span>.
            </p>
          </div>

          <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFilterView("all")}
              className="border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-xs h-8 px-3 rounded-xl font-semibold cursor-pointer"
            >
              View All {data?.metrics.length || 0} Resources
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowReadingsModal(true)}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs h-8 px-3 rounded-xl cursor-pointer"
            >
              Update Readings
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {displayedMetrics.map((metric) => {
            const isSpiked = metric.percent >= 50
            const progressColor = getProgressColor(metric.percent)

            return (
              <Card
                key={metric.id}
                className={`transition-all rounded-2xl overflow-hidden shadow-2xs ${
                  metric.percent >= 75
                    ? "bg-white border-rose-300 ring-1 ring-rose-500/10"
                    : isSpiked
                    ? "bg-white border-amber-300 ring-1 ring-amber-500/10"
                    : "bg-white border-slate-200/80"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 shrink-0">
                        {getCategoryIcon(metric.category)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 truncate">{metric.name}</h4>
                        <p className="text-[11px] text-slate-500 capitalize">
                          Category: {metric.category}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">{getSeverityBadge(metric.severity, metric.percent)}</div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-800 font-bold">
                        {metric.formattedUsed}{" "}
                        <span className="text-slate-400 font-normal">/ {metric.formattedLimit}</span>
                      </span>
                      <span
                        className={`font-extrabold text-sm ${
                          metric.percent >= 90
                            ? "text-rose-600"
                            : metric.percent >= 75
                            ? "text-orange-600"
                            : metric.percent >= 50
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {metric.percent}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(100, Math.max(2, metric.percent))}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">{metric.description}</p>

                  {isSpiked && metric.recommendation && (
                    <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-950">Optimization Tip:</span>{" "}
                        {metric.recommendation}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL 1: SYNC READINGS (Crisp Light Theme) */}
      <Dialog open={showReadingsModal} onOpenChange={setShowReadingsModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Edit3 className="h-4 w-4 text-amber-600" />
              </div>
              <span>Sync Vercel Usage Readings</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Enter your latest Vercel dashboard numbers to track quota spikes (&gt; 50%).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveReadings} className="space-y-3.5 pt-2">
            {readingsMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium ${
                  readingsMsg.type === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-800"
                }`}
              >
                {readingsMsg.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{readingsMsg.text}</span>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-amber-600" />
                  Fast Origin Transfer (GB)
                </Label>
                <span className="text-[10px] text-slate-400 font-mono">Limit: 10 GB</span>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 6.25"
                value={readingsForm.fastOriginTransfer}
                onChange={(e) => setReadingsForm({ ...readingsForm, fastOriginTransfer: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono font-semibold focus-visible:bg-white"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-cyan-600" />
                  Fast Data Transfer / Bandwidth (GB)
                </Label>
                <span className="text-[10px] text-slate-400 font-mono">Limit: 100 GB</span>
              </div>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 45.2"
                value={readingsForm.bandwidth}
                onChange={(e) => setReadingsForm({ ...readingsForm, bandwidth: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono focus-visible:bg-white"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-blue-600" />
                  Function Execution (GB-Hours)
                </Label>
                <span className="text-[10px] text-slate-400 font-mono">Limit: 100 GB-Hrs</span>
              </div>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 68.5"
                value={readingsForm.serverlessExecution}
                onChange={(e) => setReadingsForm({ ...readingsForm, serverlessExecution: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono focus-visible:bg-white"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-purple-600" />
                  Function Invocations (Calls)
                </Label>
                <span className="text-[10px] text-slate-400 font-mono">Limit: 100,000</span>
              </div>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 75000"
                value={readingsForm.serverlessInvocations}
                onChange={(e) => setReadingsForm({ ...readingsForm, serverlessInvocations: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono focus-visible:bg-white"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex gap-2 flex-row justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 rounded-xl cursor-pointer"
                onClick={() => setShowReadingsModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 px-4 rounded-xl cursor-pointer"
                disabled={savingReadings}
              >
                {savingReadings ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save &amp; Track Usage
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: API TOKEN CONFIGURATION (Crisp Light Theme) */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-white border border-slate-200 text-slate-900 p-5 sm:p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4 text-blue-600" />
              </div>
              <span>Configure Vercel API Token</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Connect your Vercel Personal Access Token to pull real-time bandwidth and function execution metrics.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-3.5 pt-2">
            {configMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium ${
                  configMsg.type === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-800"
                }`}
              >
                {configMsg.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{configMsg.text}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">Vercel Personal Access Token</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••••••••••"
                value={configForm.token}
                onChange={(e) => setConfigForm({ ...configForm, token: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono focus-visible:bg-white"
              />
              <p className="text-[11px] text-slate-500">
                Create at{" "}
                <a
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  vercel.com/account/tokens
                </a>
                . Stored securely in system KV.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700 font-semibold">
                Vercel Team ID <span className="text-slate-400 font-normal">(Optional)</span>
              </Label>
              <Input
                placeholder="e.g. team_abc123 (blank for personal)"
                value={configForm.teamId}
                onChange={(e) => setConfigForm({ ...configForm, teamId: e.target.value })}
                className="bg-slate-50/70 border-slate-200 text-slate-900 text-xs h-9 font-mono focus-visible:bg-white"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestToken}
                disabled={testingToken || !configForm.token}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3 rounded-xl cursor-pointer"
              >
                {testingToken ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                )}
                Test Token
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConfigModal(false)}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3 rounded-xl cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingConfig || !configForm.token}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 rounded-xl cursor-pointer"
                >
                  {savingConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save Token
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

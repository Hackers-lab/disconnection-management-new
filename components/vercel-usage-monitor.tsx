"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Clock,
  Filter,
  Flame,
  Info,
  Calendar,
  Layers,
} from "lucide-react"
import type { VercelMetricItem, VercelUsageResponse } from "@/app/api/superuser/vercel-usage/route"

interface VercelUsageMonitorProps {
  onBackToDashboard?: () => void
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
      <Badge variant="outline" className="bg-rose-950/80 border-rose-600 text-rose-300 font-mono text-[10px] font-bold px-2 py-0.5 animate-pulse flex items-center gap-1">
        <Flame className="h-3 w-3 text-rose-400" />
        CRITICAL {percent}%
      </Badge>
    )
  }
  if (severity === "high" || percent >= 75) {
    return (
      <Badge variant="outline" className="bg-orange-950/80 border-orange-600 text-orange-300 font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3 text-orange-400" />
        HIGH {percent}%
      </Badge>
    )
  }
  if (severity === "warning" || percent >= 50) {
    return (
      <Badge variant="outline" className="bg-amber-950/80 border-amber-600/80 text-amber-300 font-mono text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
        <AlertCircle className="h-3 w-3 text-amber-400" />
        SPIKE &gt; 50% ({percent}%)
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-emerald-950/40 border-emerald-800 text-emerald-300 font-mono text-[10px] px-1.5 py-0.5">
      NORMAL ({percent}%)
    </Badge>
  )
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "compute":
      return <Cpu className="h-4 w-4 text-blue-400" />
    case "bandwidth":
      return <HardDrive className="h-4 w-4 text-amber-400" />
    case "edge":
      return <Globe className="h-4 w-4 text-cyan-400" />
    case "media":
      return <ImageIcon className="h-4 w-4 text-purple-400" />
    case "build":
      return <Zap className="h-4 w-4 text-indigo-400" />
    default:
      return <Activity className="h-4 w-4 text-slate-400" />
  }
}

export function VercelUsageMonitor({ onBackToDashboard }: VercelUsageMonitorProps) {
  const [data, setData] = useState<VercelUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterView, setFilterView] = useState<FilterView>("spiked_only")

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configForm, setConfigForm] = useState({ token: "", teamId: "", projectId: "" })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchUsage = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch("/api/superuser/vercel-usage")
      if (res.ok) {
        const result: VercelUsageResponse = await res.json()
        setData(result)
      }
    } catch (e) {
      console.error("Failed to fetch Vercel usage:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchUsage()
  }, [])

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
        }, 1200)
      } else {
        throw new Error(resData.error || "Failed to save configuration")
      }
    } catch (err: any) {
      setConfigMsg({ type: "error", text: err?.message || "Failed to save settings" })
    } finally {
      setSavingConfig(false)
    }
  }

  // Filtered metrics based on toggle
  const displayedMetrics = useMemo(() => {
    if (!data) return []
    if (filterView === "spiked_only") {
      return data.spikedMetrics || []
    }
    if (filterView === "critical_only") {
      return (data.metrics || []).filter(m => m.percent >= 75)
    }
    return data.metrics || []
  }, [data, filterView])

  const spikedCount = data?.summary.totalSpikedCount || 0
  const criticalCount = data?.summary.criticalCount || 0
  const billing = data?.billingPeriod

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── TOP HEADER & CONTROLS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3.5 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-amber-600 to-rose-500 p-2.5 rounded-xl text-white shadow-md shadow-amber-500/20">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                Vercel Usage & Spike Monitor
              </h2>
              {spikedCount > 0 ? (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px] font-mono font-bold animate-pulse">
                  {spikedCount} Spikes &gt; 50%
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                  All &lt; 50% Healthy
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Live monitoring of Vercel resource consumption. Filtered specifically for metrics crossing the <span className="font-semibold text-amber-300">50% plan limit</span>.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowConfigModal(true)}
            className="h-8 text-xs border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-slate-300 px-2.5"
            title="Configure Vercel API Token"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1 text-slate-400" />
            <span className="hidden sm:inline">API Config</span>
            <span className="sm:hidden">Token</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchUsage(true)}
            disabled={refreshing}
            className="h-8 text-xs border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-slate-300 px-2.5"
            title="Refresh Live Vercel Usage"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <a
            href="https://vercel.com/dashboard/usage"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-all"
            title="Open official Vercel Dashboard Usage"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden sm:inline">Open Vercel</span>
          </a>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Spiked Resources Count */}
        <Card className={`border shadow-sm backdrop-blur ${
          spikedCount > 0 ? "bg-amber-950/20 border-amber-800/60" : "bg-slate-900/70 border-slate-800"
        }`}>
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Spiked Resources (&gt; 50%)
              <Flame className={`h-3.5 w-3.5 ${spikedCount > 0 ? "text-amber-400" : "text-slate-500"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className={`text-xl sm:text-2xl font-black font-mono ${spikedCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {spikedCount}
                </div>
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono mt-0.5">
                  {spikedCount > 0 ? "Require Attention" : "All Limits Within Safe Range"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Highest Peak Utilization */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Peak Resource Spike
              <TrendingUp className="h-3.5 w-3.5 text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : data?.summary.highestMetric ? (
              <div>
                <div className="text-sm sm:text-base font-bold text-rose-300 truncate">
                  {data.summary.highestMetric.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xl font-black text-rose-400 font-mono">
                    {data.summary.highestMetric.percent}%
                  </span>
                  <span className="text-[10px] text-slate-400">of quota</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">0%</div>
                <p className="text-[10px] text-slate-400 mt-0.5">No usage recorded</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Plan Status & Source */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Vercel Plan
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-base sm:text-lg font-bold text-slate-100">
                  {data?.plan || "Hobby"}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className={`text-[9px] font-mono ${
                    data?.source === "live_api"
                      ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}>
                    {data?.source === "live_api" ? "● Live API Connected" : "● Standard Quota"}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Billing Cycle Reset Countdown */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-sm backdrop-blur">
          <CardHeader className="p-2.5 sm:p-3 pb-0.5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center justify-between">
              Monthly Quota Reset
              <Calendar className="h-3.5 w-3.5 text-cyan-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-3 pt-0">
            {loading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : billing ? (
              <div>
                <div className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                  {billing.daysRemaining} <span className="text-xs text-slate-400 font-normal">days left</span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono mt-0.5">
                  {billing.percentElapsed}% of Month Elapsed
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic my-1">Monthly cycle</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── FILTER TOGGLE BAR ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">View Filter:</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-wrap">
          <Button
            size="sm"
            variant={filterView === "spiked_only" ? "default" : "outline"}
            onClick={() => setFilterView("spiked_only")}
            className={`text-xs h-7.5 px-3 rounded-lg ${
              filterView === "spiked_only"
                ? "bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md shadow-amber-600/20"
                : "border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            <Flame className="h-3.5 w-3.5 mr-1 text-amber-300" />
            <span>Spikes &gt; 50% ({spikedCount})</span>
          </Button>

          <Button
            size="sm"
            variant={filterView === "all" ? "default" : "outline"}
            onClick={() => setFilterView("all")}
            className={`text-xs h-7.5 px-3 rounded-lg ${
              filterView === "all"
                ? "bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md shadow-blue-600/20"
                : "border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            <span>All Vercel Resources ({data?.metrics.length || 0})</span>
          </Button>

          {criticalCount > 0 && (
            <Button
              size="sm"
              variant={filterView === "critical_only" ? "default" : "outline"}
              onClick={() => setFilterView("critical_only")}
              className={`text-xs h-7.5 px-3 rounded-lg ${
                filterView === "critical_only"
                  ? "bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/20"
                  : "border-slate-700 text-rose-400 hover:bg-slate-800"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              <span>Critical &gt; 75% ({criticalCount})</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: USAGE CARDS OR ZERO-SPIKE AFFIRMATION ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
          <p className="text-xs text-slate-400 font-mono">Fetching live Vercel usage metrics...</p>
        </div>
      ) : filterView === "spiked_only" && displayedMetrics.length === 0 ? (
        /* ── ZERO-SPIKES AFFIRMATION CARD ── */
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-emerald-200">
              All Vercel Resources Are Within Safe Limits
            </h3>
            <p className="text-xs text-emerald-300/80 max-w-md mx-auto mt-1">
              None of your infrastructure metrics have crossed the <span className="font-semibold text-emerald-100">50% limit threshold</span>. Your application is operating smoothly with plenty of headroom.
            </p>
          </div>

          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilterView("all")}
              className="border-emerald-700/60 bg-emerald-950/50 hover:bg-emerald-900 text-emerald-200 text-xs h-8 px-3"
            >
              View Full Breakdown of All {data?.metrics.length || 0} Resources
            </Button>
          </div>
        </div>
      ) : (
        /* ── RESOURCE USAGE CARDS GRID ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedMetrics.map(metric => {
            const isSpiked = metric.percent >= 50
            const progressColor = getProgressColor(metric.percent)

            return (
              <Card
                key={metric.id}
                className={`transition-all rounded-2xl overflow-hidden ${
                  metric.percent >= 75
                    ? "bg-rose-950/15 border-rose-800/60 shadow-lg shadow-rose-950/20"
                    : isSpiked
                    ? "bg-amber-950/15 border-amber-800/50 shadow-md shadow-amber-950/10"
                    : "bg-slate-900/70 border-slate-800"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                        {getCategoryIcon(metric.category)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-100 truncate">
                          {metric.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 capitalize">
                          Category: {metric.category}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {getSeverityBadge(metric.severity, metric.percent)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3">
                  {/* Progress Bar & Value Display */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-bold">
                        {metric.formattedUsed} <span className="text-slate-500 font-normal">/ {metric.formattedLimit}</span>
                      </span>
                      <span className={`font-black ${
                        metric.percent >= 90 ? "text-rose-400" : metric.percent >= 75 ? "text-orange-400" : metric.percent >= 50 ? "text-amber-400" : "text-emerald-400"
                      }`}>
                        {metric.percent}%
                      </span>
                    </div>

                    {/* Visual Progress Track */}
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(100, Math.max(2, metric.percent))}%` }}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {metric.description}
                  </p>

                  {/* Actionable Recommendation if Spiked */}
                  {isSpiked && metric.recommendation && (
                    <div className="bg-slate-950/80 border border-amber-500/20 rounded-xl p-2.5 text-[11px] text-amber-200/90 flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-300">Optimization Tip:</span>{" "}
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

      {/* ── API TOKEN CONFIGURATION MODAL ── */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-blue-400" />
              Configure Vercel API Token
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Connect your Vercel Personal Access Token to pull live real-time bandwidth and function execution metrics.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-3.5 py-2">
            {configMsg && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                configMsg.type === "success" ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300" : "bg-rose-950/60 border border-rose-800 text-rose-300"
              }`}>
                {configMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>{configMsg.text}</span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Vercel Personal Access Token</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••••••••••"
                value={configForm.token}
                onChange={e => setConfigForm({ ...configForm, token: e.target.value })}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-slate-500">
                Created at <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">vercel.com/account/tokens</a>. Stored securely in system KV.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Vercel Team ID (Optional)</Label>
              <Input
                placeholder="e.g. team_abc123 (Leave blank for personal account)"
                value={configForm.teamId}
                onChange={e => setConfigForm({ ...configForm, teamId: e.target.value })}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9 font-mono"
              />
            </div>

            <DialogFooter className="mt-4 flex gap-2 flex-row justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9 px-3"
                onClick={() => setShowConfigModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-9 px-3"
                disabled={savingConfig}
              >
                {savingConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Save Token
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

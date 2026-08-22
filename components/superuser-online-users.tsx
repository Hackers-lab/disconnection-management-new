"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  Building2,
  Activity,
  RefreshCw,
  Search,
  Laptop,
  Smartphone,
  Tablet,
  Shield,
  FileSpreadsheet,
  UserCheck,
  Radio,
} from "lucide-react"
import type { ActiveUserInfo, OnlineUsersReport, OfficeOnlineSummary } from "@/lib/presence-service"

interface SuperuserOnlineUsersProps {
  onBackToDashboard?: () => void
}

function formatRelativeSeconds(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000))
  if (diffSec < 10) return "Just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin === 1) return "1m ago"
  return `${diffMin}m ago`
}

function formatTimeOnly(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getRoleBadgeColor(role: string): string {
  switch (role.toLowerCase()) {
    case "superuser":
      return "bg-purple-950/80 text-purple-300 border-purple-800/60"
    case "admin":
      return "bg-blue-950/80 text-blue-300 border-blue-800/60"
    case "executive":
      return "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
    case "agency":
      return "bg-amber-950/80 text-amber-300 border-amber-800/60"
    case "monitor":
      return "bg-cyan-950/80 text-cyan-300 border-cyan-800/60"
    default:
      return "bg-slate-900 text-slate-300 border-slate-700"
  }
}

function getModuleBadgeColor(mod?: string): string {
  if (!mod) return "bg-slate-900 text-slate-400 border-slate-800"
  switch (mod.toLowerCase()) {
    case "icds":
      return "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
    case "consumer":
    case "disconnection":
      return "bg-blue-950/80 text-blue-300 border-blue-700/60"
    case "reconnection":
      return "bg-indigo-950/80 text-indigo-300 border-indigo-700/60"
    case "dd":
    case "deemed":
      return "bg-amber-950/80 text-amber-300 border-amber-700/60"
    case "safety":
      return "bg-rose-950/80 text-rose-300 border-rose-700/60"
    case "nsc":
      return "bg-cyan-950/80 text-cyan-300 border-cyan-700/60"
    case "meter":
    case "meters":
    case "meter-replacement":
      return "bg-orange-950/80 text-orange-300 border-orange-700/60"
    case "dtr":
    case "material":
      return "bg-violet-950/80 text-violet-300 border-violet-700/60"
    default:
      return "bg-slate-900 text-slate-300 border-slate-700"
  }
}

export function SuperuserOnlineUsers({ onBackToDashboard }: SuperuserOnlineUsersProps) {
  const [report, setReport] = useState<OnlineUsersReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [clientNow, setClientNow] = useState<number>(Date.now())

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOffice, setSelectedOffice] = useState<string>("all")
  const [selectedRole, setSelectedRole] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "idle">("all")

  // Fetch online users data
  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else if (!report) setLoading(true)

    try {
      const res = await fetch("/api/superuser/online-users", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setReport(data)
          setLastRefreshedAt(new Date())
          setClientNow(Date.now())
        }
      }
    } catch (err) {
      console.error("Failed to fetch online users:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [report])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Real-time ticking clock for relative seconds (every 2.5s)
  useEffect(() => {
    const timer = setInterval(() => {
      setClientNow(Date.now())
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  // Auto-refresh interval (every 10 seconds while tab is active)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchData(false)
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  // Unique list of active offices from stats
  const activeOfficesList = useMemo(() => {
    if (!report?.officeStats) return []
    return Object.values(report.officeStats).filter(o => o.onlineCount > 0)
  }, [report?.officeStats])

  // Filtered users list
  const filteredUsers = useMemo(() => {
    if (!report?.onlineUsers) return []

    return report.onlineUsers.filter(user => {
      // 1. Status filter
      if (statusFilter === "live" && !user.isLive) return false
      if (statusFilter === "idle" && user.isLive) return false

      // 2. Role filter
      if (selectedRole !== "all" && user.role.toLowerCase() !== selectedRole.toLowerCase()) {
        return false
      }

      // 3. Office filter
      if (selectedOffice !== "all" && user.cccCode.toUpperCase() !== selectedOffice.toUpperCase()) {
        return false
      }

      // 4. Search query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim()
        const matchName = (user.name || "").toLowerCase().includes(query)
        const matchUsername = (user.username || "").toLowerCase().includes(query)
        const matchCcc = (user.cccCode || "").toLowerCase().includes(query)
        const matchCccName = (user.cccName || "").toLowerCase().includes(query)
        const matchAction = (user.lastAction || "").toLowerCase().includes(query)
        const matchModule = (user.activeModule || "").toLowerCase().includes(query)
        const matchAgencies = (user.agencies || []).some(a => a.toLowerCase().includes(query))
        if (!matchName && !matchUsername && !matchCcc && !matchCccName && !matchAction && !matchModule && !matchAgencies) {
          return false
        }
      }

      return true
    })
  }, [report?.onlineUsers, statusFilter, selectedRole, selectedOffice, searchTerm])

  // Export to Excel
  const handleExportExcel = async () => {
    if (!report) return
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      const headers = [
        "Username",
        "Name",
        "Role",
        "Care Center Code",
        "Office Name",
        "Assigned Agencies",
        "Current Module",
        "Last Action",
        "Last Seen Time",
        "Status",
        "Device",
        "Browser",
        "IP Address",
      ]

      const rows = report.onlineUsers.map(u => [
        u.username,
        u.name,
        u.role.toUpperCase(),
        u.cccCode,
        u.cccName || "N/A",
        (u.agencies || []).join(", ") || "All / Full Access",
        u.activeModule ? u.activeModule.toUpperCase() : "General",
        u.lastAction || "Active",
        formatTimeOnly(u.lastSeen),
        u.isLive ? "Active Now (<1m)" : "Idle (1-3m)",
        u.deviceType || "Desktop",
        u.browserName || "Web Browser",
        u.ip || "N/A",
      ])

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws["!cols"] = [
        { wch: 18 },
        { wch: 22 },
        { wch: 14 },
        { wch: 16 },
        { wch: 26 },
        { wch: 24 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 14 },
        { wch: 20 },
        { wch: 16 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Online Users")
      XLSX.writeFile(wb, `Online_Users_Activity_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error("Export error:", e)
      alert("Failed to export online users.")
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── HEADER BANNER ── */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 relative">
            <Users className="h-6 w-6" />
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                Live Online Users & Office Activity
              </h2>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono flex items-center gap-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Real-Time
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time monitoring of connected personnel, active care center offices, and live updates.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
            <Radio className={`h-3 w-3 ${autoRefresh ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
            <span className="text-[11px] font-medium hidden sm:inline">Auto-Sync (10s)</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
              title="Toggle 10-second automatic refresh"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs border-slate-700 bg-slate-950/60 hover:bg-slate-800 text-slate-200 px-3 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
            <span>{refreshing ? "Syncing..." : "Refresh"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-8 text-xs border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 px-3 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            <span>Export Excel</span>
          </Button>

          {onBackToDashboard && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBackToDashboard}
              className="h-8 text-xs text-slate-400 hover:text-slate-200 px-2.5"
            >
              Back
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI STATS CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Total Online Users */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md backdrop-blur">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              Total Online Users
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  {report?.totalOnline || 0}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                  <span className="text-emerald-400 font-semibold">
                    {report?.activeNowCount || 0} Active Now
                  </span>
                  <span>·</span>
                  <span className="text-amber-400/90">
                    {report?.idleCount || 0} Idle
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 2: Active Offices */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md backdrop-blur">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              Active Offices (CCCs)
              <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div>
                <div className="text-2xl sm:text-3xl font-black text-blue-400 font-mono">
                  {report?.totalOfficesActive || 0}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Care Centers with live users
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 3: Admin & Agency Breakdown */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md backdrop-blur">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              Role Composition
              <Shield className="h-4 w-4 text-purple-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <div className="h-8 w-20 bg-slate-800 animate-pulse rounded my-1" />
            ) : (
              <div className="space-y-1 mt-0.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Admins:</span>
                  <span className="font-bold text-blue-300">
                    {(report?.roleStats?.["admin"] || 0) + (report?.roleStats?.["superuser"] || 0) + (report?.roleStats?.["executive"] || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Agencies:</span>
                  <span className="font-bold text-amber-300">
                    {report?.roleStats?.["agency"] || 0}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI 4: Active Modules Stream */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md backdrop-blur">
          <CardHeader className="p-3 sm:p-4 pb-1">
            <CardTitle className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              Pipeline Activity
              <Activity className="h-4 w-4 text-cyan-400 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <div className="h-8 w-20 bg-slate-800 animate-pulse rounded my-1" />
            ) : Object.keys(report?.moduleStats || {}).length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {Object.entries(report?.moduleStats || {}).slice(0, 3).map(([mod, count]) => (
                  <Badge
                    key={mod}
                    variant="outline"
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 ${getModuleBadgeColor(mod)}`}
                  >
                    {mod}: {count}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic my-1">No active modules yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ACTIVE OFFICES PILLS / QUICK SELECTOR ── */}
      {activeOfficesList.length > 0 && (
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-blue-400" /> Active Offices:
          </span>

          <Button
            size="sm"
            variant={selectedOffice === "all" ? "default" : "outline"}
            onClick={() => setSelectedOffice("all")}
            className={`h-7 text-xs px-2.5 rounded-lg shrink-0 ${
              selectedOffice === "all"
                ? "bg-blue-600 text-white font-semibold"
                : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
            }`}
          >
            All Offices ({report?.totalOnline || 0})
          </Button>

          {activeOfficesList.map(off => (
            <Button
              key={off.cccCode}
              size="sm"
              variant={selectedOffice === off.cccCode ? "default" : "outline"}
              onClick={() => setSelectedOffice(selectedOffice === off.cccCode ? "all" : off.cccCode)}
              className={`h-7 text-xs px-2.5 rounded-lg shrink-0 flex items-center gap-1.5 ${
                selectedOffice === off.cccCode
                  ? "bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-600/30"
                  : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono font-bold">{off.cccCode}</span>
              <span className="text-slate-400 font-normal truncate max-w-[120px]">{off.cccName}</span>
              <Badge variant="outline" className="ml-0.5 text-[9px] bg-slate-900 border-slate-700 text-emerald-300 px-1 py-0">
                {off.onlineCount}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-xl border border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search by user, office, role, action, agency..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 text-xs h-8.5 rounded-lg"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Status Filter Buttons */}
          <div className="flex items-center border border-slate-700 rounded-lg p-0.5 bg-slate-950">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatusFilter("all")}
              className={`h-6.5 px-2.5 text-[11px] rounded ${
                statusFilter === "all" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({report?.totalOnline || 0})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatusFilter("live")}
              className={`h-6.5 px-2.5 text-[11px] rounded ${
                statusFilter === "live" ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              Live Now ({report?.activeNowCount || 0})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatusFilter("idle")}
              className={`h-6.5 px-2.5 text-[11px] rounded ${
                statusFilter === "idle" ? "bg-amber-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Idle ({report?.idleCount || 0})
            </Button>
          </div>

          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs h-7.5 px-2 rounded-lg outline-none cursor-pointer hover:border-slate-600"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="agency">Agency</option>
            <option value="executive">Executive</option>
            <option value="superuser">Superuser</option>
          </select>
        </div>
      </div>

      {/* ── ONLINE USERS TABLE ── */}
      <Card className="bg-slate-900/70 border-slate-800 overflow-hidden shadow-2xl rounded-2xl">
        <CardHeader className="py-3 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/90 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              Active Online Personnel List
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-400 mt-0.5">
              Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} currently connected.
            </CardDescription>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Checked: {lastRefreshedAt.toLocaleTimeString("en-IN")}
          </span>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Scanning online users across all care centers...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <Users className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-300">No online users found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {report?.totalOnline === 0
                  ? "There are currently no authenticated users connected to any care center."
                  : "No connected users match your active search and filter criteria."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-bold sticky top-0 z-20">
                <tr>
                  <th className="py-3 px-4 min-w-[220px]">User & Role</th>
                  <th className="py-3 px-3.5 min-w-[180px]">Care Center / Office</th>
                  <th className="py-3 px-3.5 min-w-[240px]">Current Activity & Module</th>
                  <th className="py-3 px-3 min-w-[140px]">Device & Client</th>
                  <th className="py-3 px-3 text-right min-w-[130px]">Last Active</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredUsers.map(user => {
                  return (
                    <tr key={user.userId} className="hover:bg-slate-800/40 transition-colors group">
                      {/* 1. User & Role */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 uppercase">
                              {(user.name || user.username || "U").slice(0, 2)}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                              {user.isLive && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              )}
                              <span
                                className={`relative inline-flex rounded-full h-3 w-3 border-2 border-slate-950 ${
                                  user.isLive ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                              />
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-100 text-xs">
                                {user.name || user.username}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] uppercase px-1.5 py-0 ${getRoleBadgeColor(user.role)}`}
                              >
                                {user.role}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                              <span>@{user.username}</span>
                              {user.agencies && user.agencies.length > 0 && (
                                <span className="text-slate-500 truncate max-w-[140px]" title={user.agencies.join(", ")}>
                                  · {user.agencies.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Care Center / Office */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                            {user.cccCode}
                          </span>
                          <span className="font-semibold text-slate-200 text-xs truncate max-w-[140px]" title={user.cccName}>
                            {user.cccName}
                          </span>
                        </div>
                      </td>

                      {/* 3. Current Activity & Module */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {user.activeModule && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono uppercase px-1.5 py-0 ${getModuleBadgeColor(user.activeModule)}`}
                            >
                              {user.activeModule}
                            </Badge>
                          )}
                          <span className="text-slate-300 text-xs font-medium">
                            {user.lastAction || "Browsing system"}
                          </span>
                        </div>
                      </td>

                      {/* 4. Device & Client */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                          {user.deviceType === "Mobile" ? (
                            <Smartphone className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          ) : user.deviceType === "Tablet" ? (
                            <Tablet className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                          ) : (
                            <Laptop className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[120px]" title={user.browserName}>
                            {user.browserName || "Desktop"}
                          </span>
                        </div>
                      </td>

                      {/* 5. Last Active */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1 font-mono font-bold text-xs">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                user.isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                              }`}
                            />
                            <span className={user.isLive ? "text-emerald-300" : "text-amber-300"}>
                              {formatRelativeSeconds(user.lastSeen, clientNow)}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {formatTimeOnly(user.lastSeen)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
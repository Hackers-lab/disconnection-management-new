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

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOffice, setSelectedOffice] = useState<string>("all")
  const [selectedRole, setSelectedRole] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "offline">("all")

  const [showStatsDrawer, setShowStatsDrawer] = useState(false)

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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const timer = setInterval(() => {
      setClientNow(Date.now())
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchData(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const activeOfficesList: OfficeOnlineSummary[] = useMemo(() => {
    if (!report?.officeStats) return []
    return Object.values(report.officeStats).sort((a, b) => b.onlineCount - a.onlineCount)
  }, [report?.officeStats])

  const filteredUsers: ActiveUserInfo[] = useMemo(() => {
    if (!report?.onlineUsers) return []
    return report.onlineUsers.filter(u => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchName = (u.name || "").toLowerCase().includes(term)
        const matchUser = u.username.toLowerCase().includes(term)
        const matchCcc = (u.cccCode || "").toLowerCase().includes(term)
        const matchRole = (u.role || "").toLowerCase().includes(term)
        const matchAction = (u.lastAction || "").toLowerCase().includes(term)
        const matchAgency = (u.agencies || []).some(a => a.toLowerCase().includes(term))
        if (!matchName && !matchUser && !matchCcc && !matchRole && !matchAction && !matchAgency) {
          return false
        }
      }

      if (selectedOffice !== "all" && u.cccCode !== selectedOffice) {
        return false
      }

      if (selectedRole !== "all" && u.role?.toLowerCase() !== selectedRole.toLowerCase()) {
        return false
      }

      if (statusFilter === "live" && !u.isLive) {
        return false
      }
      if (statusFilter === "offline" && u.isLive) {
        return false
      }

      return true
    })
  }, [report?.onlineUsers, searchTerm, selectedOffice, selectedRole, statusFilter])

  const handleExportExcel = async () => {
    if (!report?.onlineUsers || report.onlineUsers.length === 0) {
      alert("No active users to export.")
      return
    }

    try {
      const XLSX = await import("xlsx")
      const rows = report.onlineUsers.map(u => ({
        "User ID": u.userId,
        Username: u.username,
        Name: u.name || "-",
        Role: u.role,
        "CCC Code": u.cccCode || "-",
        Agencies: (u.agencies || []).join(", ") || "-",
        "Active Module": u.activeModule || "-",
        "Last Action": u.lastAction || "-",
        Device: u.deviceType || "-",
        Browser: u.browserName || "-",
        "Last Seen (Timestamp)": new Date(u.lastSeen).toLocaleString("en-IN"),
        Status: u.isLive ? "Online" : "Offline",
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      ws["!cols"] = [
        { wch: 28 },
        { wch: 16 },
        { wch: 20 },
        { wch: 12 },
        { wch: 12 },
        { wch: 24 },
        { wch: 16 },
        { wch: 26 },
        { wch: 12 },
        { wch: 16 },
        { wch: 22 },
        { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Online Users")
      XLSX.writeFile(wb, `Online_Users_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error("Export error:", e)
      alert("Failed to export online users.")
    }
  }

  return (
    <div className="space-y-3">
      {/* ── TOP ACTION BAR ── */}
      <div className="bg-white border border-slate-200/90 p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              User Activity
            </h2>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-mono px-1.5 py-0"
            >
              {report?.activeNowCount || 0} Online
            </Badge>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowStatsDrawer(!showStatsDrawer)}
            className={`h-7 text-xs px-2.5 shadow-2xs ${
              showStatsDrawer
                ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            <Activity className="h-3 w-3 mr-1 text-blue-600" />
            <span className="hidden sm:inline">Stats</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-7 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2 shadow-2xs"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin text-emerald-600" : ""}`} />
            <span className="hidden sm:inline ml-1">{refreshing ? "Syncing..." : "Refresh"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-7 text-xs border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 shadow-2xs"
          >
            <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
            <span className="hidden sm:inline ml-1">Export</span>
          </Button>

          {onBackToDashboard && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBackToDashboard}
              className="h-7 text-xs text-slate-500 hover:text-slate-800 px-2"
            >
              Back
            </Button>
          )}
        </div>
      </div>

      {/* ── COLLAPSIBLE STATS DRAWER (Collapsed by Default) ── */}
      {showStatsDrawer && (
        <div className="bg-slate-50 border border-slate-200/90 p-2.5 sm:p-3 rounded-xl space-y-2.5 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Network Analytics & Office Breakdown
            </span>
            <button
              type="button"
              onClick={() => setShowStatsDrawer(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card className="bg-white border-slate-200 shadow-2xs rounded-lg">
              <CardContent className="p-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">Total Registered</div>
                <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {report?.totalOnline || 0}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-2xs rounded-lg">
              <CardContent className="p-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">Active Offices</div>
                <div className="text-lg font-bold text-blue-600 font-mono mt-0.5">
                  {activeOfficesList.length}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-2xs rounded-lg">
              <CardContent className="p-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">Online Now</div>
                <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">
                  {report?.activeNowCount || 0}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-2xs rounded-lg">
              <CardContent className="p-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">Offline History</div>
                <div className="text-lg font-bold text-slate-600 font-mono mt-0.5">
                  {report?.idleCount || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {activeOfficesList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">
                Offices:
              </span>
              <button
                type="button"
                onClick={() => setSelectedOffice("all")}
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold shrink-0 ${
                  selectedOffice === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                All ({report?.totalOnline || 0})
              </button>
              {activeOfficesList.map(off => (
                <button
                  key={off.cccCode}
                  type="button"
                  onClick={() => setSelectedOffice(off.cccCode === selectedOffice ? "all" : off.cccCode)}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono shrink-0 flex items-center gap-1 ${
                    selectedOffice === off.cccCode
                      ? "bg-blue-600 text-white font-bold"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{off.cccCode}</span>
                  <span className="opacity-75">({off.onlineCount})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search user, office, role..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 text-xs h-8 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
           <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
            <Button size="sm" variant="ghost" onClick={() => setStatusFilter("all")} className={`h-6 px-2 text-[11px] rounded ${statusFilter === "all" ? "bg-slate-700 text-white" : "text-slate-600"}`}>All</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatusFilter("live")} className={`h-6 px-2 text-[11px] rounded ${statusFilter === "live" ? "bg-emerald-600 text-white" : "text-slate-600"}`}>Live</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatusFilter("offline")} className={`h-6 px-2 text-[11px] rounded ${statusFilter === "offline" ? "bg-slate-400 text-white" : "text-slate-600"}`}>Offline</Button>
           </div>
           <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-800 text-xs h-7 px-2 rounded-lg outline-none cursor-pointer">
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="agency">Agency</option>
            <option value="executive">Executive</option>
            <option value="superuser">Superuser</option>
          </select>
        </div>
      </div>

      {/* ── USER ACTIVITY LIST ── */}
      <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="py-2.5 px-3 sm:px-4 border-b border-slate-100 bg-slate-50/70 flex flex-row items-center justify-between">
          <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            Personnel Activity ({filteredUsers.length})
          </CardTitle>
          <span className="text-[10px] text-slate-400 font-mono">
            {lastRefreshedAt.toLocaleTimeString("en-IN")}
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading user registry...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-xs font-semibold text-slate-700">No personnel found</h3>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredUsers.map(user => {
                return (
                  <div
                    key={user.userId}
                    className="p-3 sm:px-4 sm:py-3 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                      <div className="relative shrink-0 mt-0.5 sm:mt-0">
                        <div className="h-8 w-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-[11px] text-blue-700 uppercase">
                          {(user.name || user.username || "U").slice(0, 2)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                          {user.isLive && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          )}
                          <span
                            className={`relative inline-flex rounded-full h-2.5 w-2.5 border-2 border-white ${
                              user.isLive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs truncate">
                            {user.name || user.username}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            @{user.username}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[8px] uppercase px-1 py-0 ${
                              user.role === "superuser"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : user.role === "admin"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {user.role}
                          </Badge>
                          <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            {user.cccCode || "SYSTEM"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600 flex-wrap">
                          {user.activeModule && (
                            <Badge
                              variant="outline"
                              className="text-[9px] uppercase px-1 py-0 bg-blue-50 border-blue-200 text-blue-700"
                            >
                              {user.activeModule}
                            </Badge>
                          )}
                          <span className="truncate max-w-[200px] text-slate-500">
                            {user.lastAction || "Active in session"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-400 text-[10px]">
                            {user.browserName || user.deviceType || "Web Browser"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-1 shrink-0 pl-10 sm:pl-0 border-t border-slate-50 sm:border-0 pt-1 sm:pt-0">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono px-1.5 py-0 ${
                          user.isLive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {user.isLive ? "Online" : "Offline"}
                      </Badge>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-600">
                          {formatRelativeSeconds(user.lastSeen, clientNow)}
                        </span>
                        <span>({formatTimeOnly(user.lastSeen)})</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
"use client"

import { Fragment, useState, useMemo } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import type { Tenant, User, TenantStats } from "./types"
import {
  Building2,
  Users,
  Link2,
  Unlink,
  Layers,
  MapPin,
  Database,
  Search,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Pencil,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Phone,
  AlertTriangle,
  Flame,
  Sparkles,
  Loader2,
  UserPlus,
  Plus,
  Download,
  TrendingUp,
} from "lucide-react"

export type OverviewStatusFilter = "all" | "linked" | "pending_link" | "no_users" | "no_agencies"

interface CareCentersTabProps {
  hasLoadedData: boolean
  loadingTenants: boolean
  loadingUsers: boolean
  loadingStats: boolean
  tenants: Tenant[]
  users: User[]
  stats: Record<string, TenantStats>
  usersByCcc: Record<string, User[]>
  agenciesByCcc: Record<string, Set<string>>
  vercelSpikeCount: number | null
  visiblePasswords: Record<string, boolean>
  showAllPasswords: boolean
  onTogglePasswordVisibility: (userId: string) => void
  onToggleShowAllPasswords: () => void
  onLoadData: () => void
  onOpenAddTenant: () => void
  onOpenAddUserForCcc: (cccCode?: string) => void
  onEditUser: (u: User) => void
  onDeleteUser: (id: string, username: string) => void
  onGoToVercel: () => void
  onGoToRevenue: () => void
}

function getSubscriptionBadge(u: User) {
  if (u.role === "superuser" || u.role === "monitor") {
    return (
      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-md">
        System
      </span>
    )
  }
  if (u.bypassSubscription) {
    return (
      <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md">
        Free Pass
      </span>
    )
  }
  if (u.subscriptionStatus === "active") {
    let isExpired = false
    if (u.subscriptionExpiresAt) {
      const expDate = new Date(u.subscriptionExpiresAt)
      expDate.setHours(23, 59, 59, 999)
      if (Date.now() > expDate.getTime()) isExpired = true
    }
    if (isExpired) {
      return (
        <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md">
          Exp ({u.subscriptionExpiresAt})
        </span>
      )
    }
    return (
      <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">
        Active{u.subscriptionExpiresAt ? ` • ${u.subscriptionExpiresAt}` : ""}
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded-md">
      Expired
    </span>
  )
}

function getRoleBadgeStyle(role: string) {
  switch (role) {
    case "admin":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "superuser":
      return "bg-purple-50 text-purple-700 border-purple-200"
    case "agency":
      return "bg-amber-50 text-amber-800 border-amber-200"
    case "executive":
      return "bg-indigo-50 text-indigo-700 border-indigo-200"
    case "monitor":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    default:
      return "bg-slate-100 text-slate-700 border-slate-200"
  }
}

export function CareCentersTab({
  hasLoadedData,
  loadingTenants,
  loadingUsers,
  loadingStats,
  tenants,
  users,
  stats,
  usersByCcc,
  agenciesByCcc,
  vercelSpikeCount,
  visiblePasswords,
  showAllPasswords,
  onTogglePasswordVisibility,
  onToggleShowAllPasswords,
  onLoadData,
  onOpenAddTenant,
  onOpenAddUserForCcc,
  onEditUser,
  onDeleteUser,
  onGoToVercel,
  onGoToRevenue,
}: CareCentersTabProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<OverviewStatusFilter>("all")
  const [expandedCccs, setExpandedCccs] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const metrics = useMemo(() => {
    const linkedTenantsCount = tenants.filter((t) => !!t.spreadsheetId).length
    const pendingTenantsCount = tenants.length - linkedTenantsCount

    const allUniqueAgencies = new Set<string>()
    Object.values(agenciesByCcc).forEach((set) => set.forEach((a) => allUniqueAgencies.add(a)))

    let totalDcRows = 0
    let totalZoneMaps = 0
    let activeDcTenants = 0
    let activeZoneTenants = 0
    let activeAgencyTenants = 0
    let activeUserTenants = 0

    tenants.forEach((t) => {
      const code = t.cccCode.toUpperCase()
      const s = stats[t.cccCode] || stats[code] || { dcCount: 0, zoneCount: 0 }
      if (s.dcCount > 0) activeDcTenants++
      if (s.zoneCount > 0) activeZoneTenants++
      totalDcRows += s.dcCount || 0
      totalZoneMaps += s.zoneCount || 0
      if (agenciesByCcc[code] && agenciesByCcc[code].size > 0) activeAgencyTenants++
      if (usersByCcc[code] && usersByCcc[code].length > 0) activeUserTenants++
    })

    const noUsersCount = tenants.filter(
      (t) => !usersByCcc[t.cccCode.toUpperCase()] || usersByCcc[t.cccCode.toUpperCase()].length === 0
    ).length
    const noAgenciesCount = tenants.filter(
      (t) => !agenciesByCcc[t.cccCode.toUpperCase()] || agenciesByCcc[t.cccCode.toUpperCase()].size === 0
    ).length

    return {
      linkedTenantsCount,
      pendingTenantsCount,
      totalAgenciesCount: allUniqueAgencies.size,
      totalDcRows,
      totalZoneMaps,
      activeDcTenants,
      activeZoneTenants,
      activeAgencyTenants,
      activeUserTenants,
      noUsersCount,
      noAgenciesCount,
    }
  }, [tenants, stats, usersByCcc, agenciesByCcc])

  const allTenantCodes = useMemo(
    () =>
      Array.from(
        new Set([...tenants.map((t) => t.cccCode.toUpperCase()), ...Object.keys(usersByCcc)])
      ),
    [tenants, usersByCcc]
  )

  const filteredTenantRows = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim()
    return allTenantCodes.filter((cccCode) => {
      const tenant = tenants.find((t) => t.cccCode.toUpperCase() === cccCode)
      const cccName = tenant
        ? tenant.cccName
        : cccCode === "SYSTEM"
        ? "Global System Accounts"
        : "Unregistered CCC"
      const cccUsers = usersByCcc[cccCode] || []
      const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])

      const matchesSearch =
        !searchLower ||
        cccCode.toLowerCase().includes(searchLower) ||
        cccName.toLowerCase().includes(searchLower) ||
        (tenant?.contactPerson || "").toLowerCase().includes(searchLower) ||
        (tenant?.mobileNumber || "").toLowerCase().includes(searchLower) ||
        cccUsers.some(
          (u) =>
            u.username.toLowerCase().includes(searchLower) ||
            (u.name || "").toLowerCase().includes(searchLower)
        ) ||
        cccAgencies.some((a) => a.toLowerCase().includes(searchLower))

      if (!matchesSearch) return false

      if (statusFilter === "linked") return !!tenant?.spreadsheetId
      if (statusFilter === "pending_link") return cccCode !== "SYSTEM" && !tenant?.spreadsheetId
      if (statusFilter === "no_users") return cccUsers.length === 0
      if (statusFilter === "no_agencies") return cccCode !== "SYSTEM" && cccAgencies.length === 0

      return true
    })
  }, [allTenantCodes, tenants, usersByCcc, agenciesByCcc, searchTerm, statusFilter])

  const isAllExpanded =
    filteredTenantRows.length > 0 && filteredTenantRows.every((code) => !!expandedCccs[code])

  const toggleCccExpand = (code: string) => {
    setExpandedCccs((prev) => ({ ...prev, [code]: !prev[code] }))
  }

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedCccs({})
    } else {
      const next: Record<string, boolean> = {}
      filteredTenantRows.forEach((c) => {
        next[c] = true
      })
      setExpandedCccs(next)
    }
  }

  const copyCredentials = async (id: string, username: string, password?: string) => {
    const text = password ? `Username: ${username}\nPassword: ${password}` : `Username: ${username}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      toast({ title: "Credentials Copied", description: `Copied login for ${username}.` })
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800)
    } catch {
      toast({ variant: "destructive", title: "Copy Failed", description: "Clipboard permission denied." })
    }
  }

  const handleExportRegistry = () => {
    if (filteredTenantRows.length === 0) return
    const rows = filteredTenantRows.map((cccCode, idx) => {
      const tenant = tenants.find((t) => t.cccCode.toUpperCase() === cccCode)
      const cccUsers = usersByCcc[cccCode] || []
      const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
      const stat = stats[tenant?.cccCode || cccCode] || stats[cccCode] || { dcCount: 0, zoneCount: 0 }
      return {
        "#": idx + 1,
        "CCC Code": cccCode,
        "CCC Name": tenant?.cccName || (cccCode === "SYSTEM" ? "Global System Accounts" : "Unregistered CCC"),
        "Contact Person": tenant?.contactPerson || "",
        "Mobile": tenant?.mobileNumber || "",
        "Sheet Linked": tenant?.spreadsheetId ? "Yes" : "No",
        "Agencies Count": cccAgencies.length,
        "Agencies": cccAgencies.join(", "),
        "Accounts Count": cccUsers.length,
        "Usernames": cccUsers.map((u) => `${u.username} (${u.role})`).join(", "),
        "DC Rows": stat.dcCount || 0,
        "Zone Maps": stat.zoneCount || 0,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Care_Centers")
    XLSX.writeFile(wb, `Care_Centers_Registry_${new Date().toISOString().split("T")[0]}.xlsx`)
    toast({ title: "Registry Exported", description: `Downloaded ${rows.length} care center row(s).` })
  }

  // Standby Launchpad (before live sheets are loaded)
  if (!hasLoadedData) {
    return (
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl overflow-hidden animate-panel-reveal">
        <CardContent className="p-8 sm:p-12 text-center space-y-5">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200/80 flex items-center justify-center shadow-xs">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Care Centers Command Console
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Live Google Sheets queries stay paused on login to protect quota. Load the live console to inspect all registered CCCs, credentials, agencies, DC lists, and zone maps.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
            <Button
              type="button"
              onClick={onLoadData}
              disabled={loadingTenants || loadingUsers || loadingStats}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 h-10 text-xs font-semibold shadow-sm cursor-pointer"
            >
              {loadingTenants || loadingUsers ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Load Care Center Console
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenAddTenant}
              className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl px-4 h-10 text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-1.5 text-blue-600" />
              Register New CCC
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onGoToRevenue}
              className="border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 rounded-xl px-4 h-10 text-xs font-semibold cursor-pointer"
            >
              <TrendingUp className="h-4 w-4 mr-1.5 text-emerald-600" />
              Open Revenue Audit
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isLoadingAny = loadingTenants || loadingUsers
  const hasPendingActions =
    metrics.pendingTenantsCount > 0 || metrics.noUsersCount > 0 || metrics.noAgenciesCount > 0

  return (
    <div className="space-y-4 animate-tab-enter">
      {/* Vercel Quota Spike Alert Banner (Light Theme) */}
      {vercelSpikeCount !== null && vercelSpikeCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-50/90 border border-rose-200/90 text-rose-900 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
              <Flame className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-xs">
              <div className="font-bold text-rose-900">
                Vercel Usage Alert: {vercelSpikeCount} metric{vercelSpikeCount > 1 ? "s" : ""} spiked above threshold
              </div>
              <div className="text-rose-700 mt-0.5">
                Inspect quota consumption to avoid unexpected throttling or overage charges.
              </div>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onGoToVercel}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 px-3 rounded-xl font-semibold shrink-0 cursor-pointer"
          >
            Inspect Vercel Quota
          </Button>
        </div>
      )}

      {/* 6 Interactive Clickable KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "all"
              ? "border-blue-500 ring-2 ring-blue-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total CCCs
            </span>
            <Building2 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
            {tenants.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Registered supplies</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "linked" ? "all" : "linked")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "linked"
              ? "border-emerald-500 ring-2 ring-emerald-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Linked Sheets
            </span>
            <Link2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-1">
            {metrics.linkedTenantsCount}
            <span className="text-xs font-normal text-slate-400">/{tenants.length}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {metrics.pendingTenantsCount} pending link
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "no_agencies" ? "all" : "no_agencies")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "no_agencies"
              ? "border-amber-500 ring-2 ring-amber-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Agencies
            </span>
            <Layers className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
            {metrics.totalAgenciesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Active in {metrics.activeAgencyTenants} CCCs
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "no_users" ? "all" : "no_users")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "no_users"
              ? "border-indigo-500 ring-2 ring-indigo-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              User Accounts
            </span>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
            {users.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {metrics.activeUserTenants} CCCs
          </div>
        </button>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              DC List Rows
            </span>
            <Database className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-rose-700 mt-1">
            {loadingStats ? "…" : metrics.totalDcRows.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {metrics.activeDcTenants} active CCCs
          </div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Zone Maps
            </span>
            <MapPin className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-cyan-700 mt-1">
            {loadingStats ? "…" : metrics.totalZoneMaps.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {metrics.activeZoneTenants} mapped CCCs
          </div>
        </div>
      </div>

      {/* Pending Setup Actions Quick-Filter Bar */}
      {hasPendingActions && (
        <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-50/75 border border-amber-200/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Pending Setup Attention:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {metrics.pendingTenantsCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setStatusFilter(statusFilter === "pending_link" ? "all" : "pending_link")
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === "pending_link"
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-white border border-amber-200 text-amber-800 hover:bg-amber-100"
                }`}
              >
                <Unlink className="h-3 w-3" />
                <span>{metrics.pendingTenantsCount} Unlinked Sheets</span>
              </button>
            )}
            {metrics.noUsersCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "no_users" ? "all" : "no_users")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === "no_users"
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-white border border-amber-200 text-amber-800 hover:bg-amber-100"
                }`}
              >
                <Users className="h-3 w-3" />
                <span>{metrics.noUsersCount} Missing Users</span>
              </button>
            )}
            {metrics.noAgenciesCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setStatusFilter(statusFilter === "no_agencies" ? "all" : "no_agencies")
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === "no_agencies"
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-white border border-amber-200 text-amber-800 hover:bg-amber-100"
                }`}
              >
                <Layers className="h-3 w-3" />
                <span>{metrics.noAgenciesCount} Missing Agencies</span>
              </button>
            )}
            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 cursor-pointer"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Care Centers Registry Card */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200/80 bg-slate-50/50 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search CCC code, name, contact, username, agency..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-8 h-9 text-xs bg-white border-slate-200 rounded-xl"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={toggleExpandAll}
                className="h-8 text-xs border-slate-200 bg-white text-slate-700 rounded-lg cursor-pointer"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 mr-1 text-slate-500" />
                {isAllExpanded ? "Collapse All" : "Expand All"}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onToggleShowAllPasswords}
                className="h-8 text-xs border-slate-200 bg-white text-slate-700 rounded-lg cursor-pointer"
              >
                {showAllPasswords ? (
                  <EyeOff className="h-3.5 w-3.5 mr-1 text-amber-600" />
                ) : (
                  <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                )}
                <span>{showAllPasswords ? "Hide Passwords" : "Show Passwords"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleExportRegistry}
                disabled={filteredTenantRows.length === 0}
                className="h-8 text-xs border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Excel
              </Button>
            </div>
          </div>

          {/* Status Filter Pills + Result Count */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: "all", label: "All Supplies" },
                  { id: "linked", label: "Linked" },
                  { id: "pending_link", label: "Unlinked" },
                  { id: "no_users", label: "No Users" },
                  { id: "no_agencies", label: "No Agencies" },
                ] as Array<{ id: OverviewStatusFilter; label: string }>
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    statusFilter === pill.id
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Showing <b className="text-slate-800">{filteredTenantRows.length}</b> of{" "}
              {allTenantCodes.length}
            </span>
          </div>
        </div>

        <CardContent className="p-0">
          {isLoadingAny ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-xs font-medium">Loading Care Center Console...</span>
            </div>
          ) : filteredTenantRows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">No Care Centers match your filter</p>
              <p className="text-xs text-slate-500">Clear your search or filter to see all supplies.</p>
              {(searchTerm || statusFilter !== "all") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("")
                    setStatusFilter("all")
                  }}
                  className="mt-2 h-8 text-xs rounded-lg cursor-pointer"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE ACCORDION CARDS */}
              <div className="lg:hidden divide-y divide-slate-100">
                {filteredTenantRows.map((cccCode) => {
                  const tenant = tenants.find((t) => t.cccCode.toUpperCase() === cccCode)
                  const cccName = tenant
                    ? tenant.cccName
                    : cccCode === "SYSTEM"
                    ? "Global System Accounts"
                    : "Unregistered CCC"
                  const cccUsers = usersByCcc[cccCode] || []
                  const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
                  const tenantStat = stats[tenant?.cccCode || cccCode] || stats[cccCode] || { dcCount: 0, zoneCount: 0 }
                  const isExpanded = !!expandedCccs[cccCode]

                  return (
                    <div key={cccCode} className="bg-white">
                      <button
                        type="button"
                        onClick={() => toggleCccExpand(cccCode)}
                        className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                              {cccCode}
                            </span>
                            <span className="font-bold text-sm text-slate-900 truncate">{cccName}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[11px]">
                            {tenant?.spreadsheetId ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <Link2 className="h-3 w-3" /> Linked
                              </span>
                            ) : cccCode !== "SYSTEM" ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                <Unlink className="h-3 w-3" /> Unlinked
                              </span>
                            ) : null}
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-600">{cccUsers.length} users</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-600">{cccAgencies.length} agencies</span>
                            <span className="text-slate-300">•</span>
                            <span className="font-mono text-rose-600 font-semibold">
                              {tenantStat.dcCount.toLocaleString()} DC
                            </span>
                          </div>
                        </div>
                        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-3 animate-panel-reveal">
                          {/* Contact & Sheet Link */}
                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                            <div className="text-slate-600">
                              {tenant?.contactPerson && <span className="font-semibold text-slate-800 mr-2">{tenant.contactPerson}</span>}
                              {tenant?.mobileNumber && (
                                <a href={`tel:${tenant.mobileNumber}`} className="text-blue-600 font-mono inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {tenant.mobileNumber}
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {tenant?.spreadsheetId && (
                                <a
                                  href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold"
                                >
                                  Open Sheet <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onOpenAddUserForCcc(cccCode)}
                                className="h-7 text-[11px] px-2 rounded-lg bg-white border-slate-200 cursor-pointer"
                              >
                                <UserPlus className="h-3 w-3 mr-1 text-indigo-600" />
                                Add User
                              </Button>
                            </div>
                          </div>

                          {/* Agencies */}
                          {cccAgencies.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {cccAgencies.map((a) => (
                                <Badge key={a} variant="outline" className="bg-white border-slate-200 text-slate-700 text-[10px]">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Users List */}
                          <div className="space-y-2">
                            {cccUsers.length === 0 ? (
                              <div className="text-xs text-slate-400 italic py-1">No accounts provisioned for this CCC.</div>
                            ) : (
                              cccUsers.map((u) => {
                                const isPassVisible = showAllPasswords || !!visiblePasswords[u.id]
                                return (
                                  <div
                                    key={u.id}
                                    className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                        <span className="font-semibold text-xs text-slate-900 truncate">{u.name || u.username}</span>
                                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 uppercase ${getRoleBadgeStyle(u.role)}`}>
                                          {u.role}
                                        </Badge>
                                        {getSubscriptionBadge(u)}
                                      </div>
                                      {u.role !== "superuser" && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onEditUser(u)}
                                            className="h-7 w-7 text-blue-600 hover:bg-blue-50 cursor-pointer"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onDeleteUser(u.id, u.username)}
                                            className="h-7 w-7 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 flex-wrap font-mono text-[11px] text-slate-600">
                                      <span>
                                        ID: <b className="text-slate-900">{u.username}</b>
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">
                                          {isPassVisible ? u.password || "N/A" : "••••••••"}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => onTogglePasswordVisibility(u.id)}
                                          className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                        >
                                          {isPassVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => copyCredentials(u.id, u.username, u.password)}
                                          className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                          title="Copy credentials"
                                        >
                                          {copiedId === u.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* DESKTOP COLLAPSIBLE TABLE */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/90 hover:bg-slate-50/90 border-b border-slate-200/80">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Care Center / Contact</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sheet Sync</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Agencies</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Accounts Summary</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right">DC Rows</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right">Zones</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center w-20">Inspect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {filteredTenantRows.map((cccCode) => {
                      const tenant = tenants.find((t) => t.cccCode.toUpperCase() === cccCode)
                      const cccName = tenant
                        ? tenant.cccName
                        : cccCode === "SYSTEM"
                        ? "Global System Accounts"
                        : "Unregistered CCC"
                      const cccUsers = usersByCcc[cccCode] || []
                      const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
                      const tenantStat = stats[tenant?.cccCode || cccCode] || stats[cccCode] || { dcCount: 0, zoneCount: 0 }
                      const isExpanded = !!expandedCccs[cccCode]
                      const primaryAdmin = cccUsers.find((u) => u.role === "admin") || cccUsers[0]

                      return (
                        <Fragment key={cccCode}>
                          <TableRow
                            onClick={() => toggleCccExpand(cccCode)}
                            className={`cursor-pointer transition-colors ${
                              isExpanded ? "bg-blue-50/40 hover:bg-blue-50/60" : "hover:bg-slate-50/80"
                            }`}
                          >
                            {/* 1. Care Center */}
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 shrink-0">
                                  {cccCode}
                                </span>
                                <span className="font-semibold text-xs text-slate-900 truncate max-w-[200px]">
                                  {cccName}
                                </span>
                              </div>
                              {(tenant?.contactPerson || tenant?.mobileNumber) && (
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                                  {tenant.contactPerson && <span className="truncate max-w-[140px]">{tenant.contactPerson}</span>}
                                  {tenant.mobileNumber && (
                                    <a
                                      href={`tel:${tenant.mobileNumber}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 text-blue-600 hover:underline font-mono"
                                    >
                                      <Phone className="h-2.5 w-2.5" />
                                      {tenant.mobileNumber}
                                    </a>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* 2. Sheet Sync */}
                            <TableCell className="py-3">
                              {cccCode === "SYSTEM" ? (
                                <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-600 text-[10px]">
                                  Global
                                </Badge>
                              ) : tenant?.spreadsheetId ? (
                                <a
                                  href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition-colors"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Linked
                                  <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                                  <Unlink className="h-3 w-3" />
                                  Pending
                                </span>
                              )}
                            </TableCell>

                            {/* 3. Agencies Preview */}
                            <TableCell className="py-3">
                              {cccAgencies.length === 0 ? (
                                <span className="text-[11px] text-slate-400 italic">None</span>
                              ) : (
                                <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                                  {cccAgencies.slice(0, 2).map((a) => (
                                    <span
                                      key={a}
                                      className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[10px] font-medium text-slate-700"
                                    >
                                      {a}
                                    </span>
                                  ))}
                                  {cccAgencies.length > 2 && (
                                    <span className="text-[10px] font-semibold text-blue-600">
                                      +{cccAgencies.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* 4. Accounts Summary */}
                            <TableCell className="py-3">
                              {cccUsers.length === 0 ? (
                                <span className="text-[11px] text-amber-600 font-medium">No accounts</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-700 font-mono text-[10px] px-1.5">
                                    {cccUsers.length} {cccUsers.length === 1 ? "user" : "users"}
                                  </Badge>
                                  {primaryAdmin && (
                                    <span className="text-xs font-mono text-slate-600 truncate max-w-[140px]">
                                      {primaryAdmin.username}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* 5. DC Rows */}
                            <TableCell className="py-3 text-right font-mono font-bold text-xs text-rose-600">
                              {(tenantStat.dcCount || 0).toLocaleString()}
                            </TableCell>

                            {/* 6. Zone Maps */}
                            <TableCell className="py-3 text-right font-mono font-bold text-xs text-cyan-600">
                              {(tenantStat.zoneCount || 0).toLocaleString()}
                            </TableCell>

                            {/* 7. Expand Chevron */}
                            <TableCell className="py-3 text-center">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleCccExpand(cccCode)
                                }}
                                className={`h-7 w-7 p-0 rounded-lg cursor-pointer ${
                                  isExpanded
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                }`}
                                aria-label={isExpanded ? "Collapse row" : "Expand row"}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                          </TableRow>

                          {/* EXPANDED DETAILS DRAWER ROW */}
                          {isExpanded && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={7} className="p-4 border-t border-blue-100/80">
                                <div className="space-y-3 animate-panel-reveal">
                                  {/* Drawer Header */}
                                  <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                        Agencies ({cccAgencies.length}):
                                      </span>
                                      {cccAgencies.length === 0 ? (
                                        <span className="text-xs text-slate-400 italic">No agencies linked yet</span>
                                      ) : (
                                        cccAgencies.map((a) => (
                                          <Badge
                                            key={a}
                                            variant="outline"
                                            className="bg-white border-slate-200 text-slate-700 text-[10px] font-semibold"
                                          >
                                            {a}
                                          </Badge>
                                        ))
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onOpenAddUserForCcc(cccCode)}
                                      className="h-7 text-xs bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg font-semibold cursor-pointer"
                                    >
                                      <UserPlus className="h-3.5 w-3.5 mr-1" />
                                      Add Account for {cccCode}
                                    </Button>
                                  </div>

                                  {/* User Credential Cards Grid */}
                                  {cccUsers.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-white border border-dashed border-slate-200 text-center text-xs text-slate-500">
                                      No user accounts provisioned under <strong className="font-mono">{cccCode}</strong>.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                                      {cccUsers.map((u) => {
                                        const isPassVisible = showAllPasswords || !!visiblePasswords[u.id]
                                        return (
                                          <div
                                            key={u.id}
                                            className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-2 hover:border-blue-300/80 transition-colors"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                <div className="font-semibold text-xs text-slate-900 truncate">
                                                  {u.name || u.username}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                  <Badge
                                                    variant="outline"
                                                    className={`text-[10px] py-0 px-1.5 uppercase font-semibold ${getRoleBadgeStyle(u.role)}`}
                                                  >
                                                    {u.role}
                                                  </Badge>
                                                  {getSubscriptionBadge(u)}
                                                </div>
                                              </div>

                                              {u.role !== "superuser" && (
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onEditUser(u)}
                                                    className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                                                    title="Edit user"
                                                  >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDeleteUser(u.id, u.username)}
                                                    className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                                    title="Delete user"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </Button>
                                                </div>
                                              )}
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 font-mono text-[11px]">
                                              <span className="text-slate-500 truncate">
                                                ID: <b className="text-slate-900">{u.username}</b>
                                              </span>
                                              <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">
                                                  {isPassVisible ? u.password || "N/A" : "••••••••"}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => onTogglePasswordVisibility(u.id)}
                                                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
                                                  title={isPassVisible ? "Hide password" : "Show password"}
                                                >
                                                  {isPassVisible ? (
                                                    <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                                                  ) : (
                                                    <Eye className="h-3.5 w-3.5 text-blue-600" />
                                                  )}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => copyCredentials(u.id, u.username, u.password)}
                                                  className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 cursor-pointer"
                                                  title="Copy username & password"
                                                >
                                                  {copiedId === u.id ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                  ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

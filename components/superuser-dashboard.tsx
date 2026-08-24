"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { logout } from "@/app/actions/auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SupplyModuleVersionsReport } from "@/components/supply-module-versions-report"
import { VercelUsageMonitor } from "@/components/vercel-usage-monitor"
import { SuperuserOnlineUsers } from "@/components/superuser-online-users"
import { 
  Building2, 
  Users, 
  KeyRound, 
  LogOut, 
  Plus, 
  Trash2, 
  Pencil, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Database,
  Sparkles,
  Flame,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  AlertTriangle,
  Layers,
  MapPin,
  ShieldAlert,
  Link2,
  Unlink,
  UserPlus,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronRight
} from "lucide-react"

interface Tenant {
  cccCode: string
  cccName: string
  spreadsheetId?: string
  driveFolderId?: string
  googleDriveRefreshToken?: boolean
}

interface User {
  id: string
  username: string
  password?: string
  role: string
  cccCode: string
  name: string
  agencies: string[]
  subscriptionStatus?: string
  subscriptionExpiresAt?: string
  bypassSubscription?: boolean
}

interface TenantStats {
  dcCount: number
  zoneCount: number
}

export function SuperuserDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "online_users" | "module_versions" | "vercel_usage">("overview")
  const [onlineUserCount, setOnlineUserCount] = useState<number | null>(null)
  const [vercelSpikeCount, setVercelSpikeCount] = useState<number | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [masterSheetId, setMasterSheetId] = useState<string>("")
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Record<string, TenantStats>>({})
  
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)

  // Password Visibility Toggle Map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const [showAllPasswords, setShowAllPasswords] = useState(false)

  // Collapsible & Expandable CCCs state
  const [expandedCccs, setExpandedCccs] = useState<Record<string, boolean>>({})

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "linked" | "pending_link" | "no_users" | "no_agencies">("all")

  // Message states
  const [tenantMsg, setTenantMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [userMsg, setUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Dialog States
  const [showAddTenantModal, setShowAddTenantModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [submittingTenant, setSubmittingTenant] = useState(false)
  const [submittingUser, setSubmittingUser] = useState(false)

  // Forms
  const [newTenant, setNewTenant] = useState({ cccCode: "", cccName: "", spreadsheetId: "" })
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "admin",
    cccCode: "",
    name: "",
    agencies: "",
    subscriptionStatus: "active",
    subscriptionExpiresAt: "",
    bypassSubscription: false
  })

  const [editForm, setEditForm] = useState({
    id: "",
    username: "",
    name: "",
    password: "",
    role: "",
    cccCode: "",
    agencies: "",
    subscriptionStatus: "active",
    subscriptionExpiresAt: "",
    bypassSubscription: false
  })

  const getOneMonthExpiry = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split("T")[0]
  }

  useEffect(() => {
    if (newUser.role === "admin") {
      setNewUser(prev => ({
        ...prev,
        subscriptionStatus: "active",
        subscriptionExpiresAt: getOneMonthExpiry()
      }))
    } else if (newUser.role === "superuser" || newUser.role === "monitor") {
      setNewUser(prev => ({
        ...prev,
        subscriptionStatus: "active",
        subscriptionExpiresAt: "",
        bypassSubscription: true
      }))
    }
  }, [newUser.role])

  const fetchTenants = async () => {
    setLoadingTenants(true)
    try {
      const res = await fetch("/api/superuser/tenants")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setTenants(data)
        } else if (data?.tenants) {
          setTenants(data.tenants)
          if (data.masterSheetId) setMasterSheetId(data.masterSheetId)
        }
      }
    } catch (e) {
      console.error("Failed to fetch tenants", e)
    } finally {
      setLoadingTenants(false)
    }
  }

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch("/api/superuser/users")
      if (res.ok) {
        setUsers(await res.json())
      }
    } catch (e) {
      console.error("Failed to fetch users", e)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchStats = async (cccCode?: string) => {
    setLoadingStats(true)
    try {
      const url = cccCode ? `/api/superuser/stats?cccCode=${cccCode}` : "/api/superuser/stats"
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setStats(prev => ({ ...prev, ...data }))
      }
    } catch (e) {
      console.error("Failed to fetch tenant stats", e)
    } finally {
      setLoadingStats(false)
    }
  }

  const fetchVercelSummary = async () => {
    try {
      const res = await fetch("/api/superuser/vercel-usage")
      if (res.ok) {
        const d = await res.json()
        setVercelSpikeCount(d?.summary?.totalSpikedCount ?? 0)
      }
    } catch {
      // Ignore
    }
  }

  const fetchOnlineCount = async () => {
    try {
      const res = await fetch("/api/superuser/online-users", { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        if (typeof d?.totalOnline === "number") {
          setOnlineUserCount(d.totalOnline)
        }
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    fetchTenants()
    fetchUsers()
    fetchStats()
    fetchVercelSummary()
    fetchOnlineCount()
  }, [])

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }))
  }

  const toggleCccExpand = (code: string) => {
    setExpandedCccs(prev => ({
      ...prev,
      [code]: !prev[code]
    }))
  }

  const expandAllCccs = () => {
    const allExpanded: Record<string, boolean> = {}
    allTenantCodes.forEach(code => {
      allExpanded[code] = true
    })
    setExpandedCccs(allExpanded)
  }

  const collapseAllCccs = () => {
    setExpandedCccs({})
  }

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantMsg(null)
    if (!newTenant.cccCode.trim() || !newTenant.cccName.trim()) {
      setTenantMsg({ type: "error", text: "CCC Code and Name are required" })
      return
    }
    setSubmittingTenant(true)
    try {
      const res = await fetch("/api/superuser/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTenant)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTenantMsg({ type: "success", text: "Customer Care Center registered successfully" })
        setNewTenant({ cccCode: "", cccName: "", spreadsheetId: "" })
        setShowAddTenantModal(false)
        await fetchTenants()
        await fetchStats()
      } else {
        throw new Error(data.error || "Failed to register tenant")
      }
    } catch (err: any) {
      setTenantMsg({ type: "error", text: err?.message || "Failed to register tenant" })
    } finally {
      setSubmittingTenant(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserMsg(null)
    if (!newUser.username.trim() || !newUser.password.trim() || !newUser.role || !newUser.cccCode) {
      setUserMsg({ type: "error", text: "All required fields must be filled" })
      return
    }
    setSubmittingUser(true)
    try {
      const payload = {
        ...newUser,
        agencies: newUser.agencies ? newUser.agencies.split(",").map(a => a.trim()).filter(Boolean) : []
      }
      const res = await fetch("/api/superuser/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setUserMsg({ type: "success", text: `User account '${newUser.username}' created successfully.` })
        setNewUser({
          username: "",
          password: "",
          role: "admin",
          cccCode: "",
          name: "",
          agencies: "",
          subscriptionStatus: "active",
          subscriptionExpiresAt: "",
          bypassSubscription: false
        })
        setShowAddUserModal(false)
        await fetchUsers()
      } else {
        throw new Error(data.error || "Failed to create user account")
      }
    } catch (err: any) {
      setUserMsg({ type: "error", text: err?.message || "Failed to create user" })
    } finally {
      setSubmittingUser(false)
    }
  }

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Are you sure you want to delete access for '${username}'?`)) return
    try {
      const res = await fetch(`/api/superuser/users?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchUsers()
      } else {
        alert(data.error || "Failed to delete user")
      }
    } catch (e) {
      console.error(e)
    }
  }

  const startEditUser = (u: User) => {
    setEditForm({
      id: u.id,
      username: u.username,
      name: u.name || "",
      password: "",
      role: u.role,
      cccCode: u.cccCode,
      agencies: Array.isArray(u.agencies) ? u.agencies.join(", ") : "",
      subscriptionStatus: u.subscriptionStatus || "active",
      subscriptionExpiresAt: u.subscriptionExpiresAt || "",
      bypassSubscription: !!u.bypassSubscription
    })
    setShowEditUserModal(true)
  }

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editForm.username.trim() || !editForm.role || !editForm.cccCode) {
      alert("Required fields are missing")
      return
    }
    try {
      const payload = {
        ...editForm,
        agencies: editForm.agencies ? editForm.agencies.split(",").map(a => a.trim()).filter(Boolean) : []
      }
      if (!editForm.password) {
        delete (payload as any).password
      }
      const res = await fetch("/api/superuser/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setShowEditUserModal(false)
        await fetchUsers()
      } else {
        alert(data.error || "Failed to update user")
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update user")
    }
  }

  // --- DERIVED METRICS & STATS AGGREGATION ---
  const linkedTenantsCount = tenants.filter(t => !!t.spreadsheetId).length
  const pendingTenantsCount = tenants.length - linkedTenantsCount

  // Map users & agencies by cccCode
  const usersByCcc: Record<string, User[]> = {}
  const agenciesByCcc: Record<string, Set<string>> = {}

  users.forEach(u => {
    const code = (u.cccCode || "SYSTEM").toUpperCase()
    if (!usersByCcc[code]) usersByCcc[code] = []
    usersByCcc[code].push(u)

    if (!agenciesByCcc[code]) agenciesByCcc[code] = new Set()
    if (Array.isArray(u.agencies)) {
      u.agencies.forEach(a => {
        if (a && a.trim()) agenciesByCcc[code].add(a.trim().toUpperCase())
      })
    }
  })

  // Global counts for all CCCs
  let totalAgenciesCount = 0
  const allUniqueAgencies = new Set<string>()
  Object.values(agenciesByCcc).forEach(set => {
    set.forEach(a => allUniqueAgencies.add(a))
  })
  totalAgenciesCount = allUniqueAgencies.size

  let totalDcRowsCount = 0
  let totalZoneMapCount = 0
  let activeDcTenantsCount = 0
  let activeZoneTenantsCount = 0
  let activeAgencyTenantsCount = 0
  let activeUserTenantsCount = 0

  tenants.forEach(t => {
    const code = t.cccCode
    const s = stats[code] || { dcCount: 0, zoneCount: 0 }
    if (s.dcCount > 0) activeDcTenantsCount++
    if (s.zoneCount > 0) activeZoneTenantsCount++
    totalDcRowsCount += s.dcCount || 0
    totalZoneMapCount += s.zoneCount || 0

    if (agenciesByCcc[code] && agenciesByCcc[code].size > 0) activeAgencyTenantsCount++
    if (usersByCcc[code] && usersByCcc[code].length > 0) activeUserTenantsCount++
  })

  // Counts for pending alert banner
  const noUsersTenants = tenants.filter(t => !usersByCcc[t.cccCode] || usersByCcc[t.cccCode].length === 0)
  const noAgenciesTenants = tenants.filter(t => !agenciesByCcc[t.cccCode] || agenciesByCcc[t.cccCode].size === 0)

  // Combined Tenant View List (includes SYSTEM pseudo-tenant for global admins)
  const allTenantCodes = Array.from(new Set([...tenants.map(t => t.cccCode), ...Object.keys(usersByCcc)]))

  const filteredTenantRows = allTenantCodes.filter(cccCode => {
    const tenant = tenants.find(t => t.cccCode === cccCode)
    const cccName = tenant ? tenant.cccName : cccCode === "SYSTEM" ? "Global System Accounts" : "Unregistered CCC"
    const cccUsers = usersByCcc[cccCode] || []
    const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])

    // Text search matching
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = 
      !searchTerm ||
      cccCode.toLowerCase().includes(searchLower) ||
      cccName.toLowerCase().includes(searchLower) ||
      cccUsers.some(u => u.username.toLowerCase().includes(searchLower) || (u.name || "").toLowerCase().includes(searchLower)) ||
      cccAgencies.some(a => a.toLowerCase().includes(searchLower))

    if (!matchesSearch) return false

    // Status Filter matching
    if (statusFilter === "linked") return !!tenant?.spreadsheetId
    if (statusFilter === "pending_link") return cccCode !== "SYSTEM" && !tenant?.spreadsheetId
    if (statusFilter === "no_users") return cccUsers.length === 0
    if (statusFilter === "no_agencies") return cccAgencies.length === 0

    return true
  })

  const isAllExpanded = filteredTenantRows.length > 0 && filteredTenantRows.every(code => !!expandedCccs[code])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 dark selection:bg-blue-600/30">
      {/* HEADER - Mobile & Desktop Optimized */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 py-2.5 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            {/* Title & Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-blue-600/15 p-1.5 sm:p-2 rounded-xl border border-blue-500/20 shrink-0">
                <Sparkles className="h-4 w-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  Superadmin Console
                </h1>
                <p className="text-[10px] text-slate-400 truncate">
                  {tenants.length} Care Centers
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* OPEN MASTER SHEET BUTTON */}
              {masterSheetId ? (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${masterSheetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 transition-colors"
                  title="Open Master Config Google Spreadsheet"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">Master Sheet</span>
                  <ExternalLink className="h-3 w-3 text-emerald-400/80 hidden sm:inline" />
                </a>
              ) : null}

              {/* Refresh Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  fetchTenants()
                  fetchUsers()
                  fetchStats()
                }}
                className="h-8 text-xs border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 sm:px-2.5"
                title="Refresh Metrics"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingStats ? "animate-spin text-blue-400" : ""}`} />
                <span className="hidden md:inline ml-1">Refresh</span>
              </Button>

              {/* Add CCC Button */}
              <Button
                size="sm"
                onClick={() => setShowAddTenantModal(true)}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-2.5 sm:px-3 rounded-lg shadow-sm"
                title="Register New CCC"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span>Add CCC</span>
              </Button>

              {/* Create User Button */}
              <Button
                size="sm"
                onClick={() => setShowAddUserModal(true)}
                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-2.5 sm:px-3 rounded-lg shadow-sm"
                title="Create User Account"
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                <span>Add User</span>
              </Button>

              {/* Logout Button */}
              <form action={logout}>
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                  title="Logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline ml-1">Logout</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-3 py-3.5 sm:px-6 space-y-3.5">
        
        {/* TOP NAVIGATION TABS - Clean Grid on Mobile, Flex on Desktop */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 border-b border-slate-800/80 pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Care Centers</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "overview"
                  ? "bg-blue-700/80 border-blue-400/30 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {tenants.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("online_users")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "online_users"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Online Users</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "online_users"
                  ? "bg-emerald-700/80 border-emerald-400/30 text-white"
                  : onlineUserCount !== null && onlineUserCount > 0
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {onlineUserCount !== null ? onlineUserCount : "Live"}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("module_versions")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "module_versions"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-blue-300 shrink-0" />
            <span className="truncate">Module Sync</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "module_versions"
                  ? "bg-blue-700/80 border-blue-400/30 text-white"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-400"
              }`}
            >
              KV
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("vercel_usage")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "vercel_usage"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Vercel Quota</span>
            {vercelSpikeCount !== null && vercelSpikeCount > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold"
              >
                {vercelSpikeCount}
              </Badge>
            )}
          </button>
        </div>

        {activeTab === "online_users" ? (
          <SuperuserOnlineUsers onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "module_versions" ? (
          <SupplyModuleVersionsReport onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "vercel_usage" ? (
          <VercelUsageMonitor onBackToDashboard={() => setActiveTab("overview")} />
        ) : (
          <>
            {/* VERCEL USAGE SPIKE ALERT BANNER IF SPIKES > 0 */}
            {vercelSpikeCount !== null && vercelSpikeCount > 0 && (
              <div className="bg-amber-950/30 border border-amber-800/60 p-3 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-amber-200 truncate">
                      Vercel Quota Alert ({vercelSpikeCount} metric &gt; 50%)
                    </h3>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("vercel_usage")}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs h-7 px-2.5 shrink-0 rounded-lg"
                >
                  View
                </Button>
              </div>
            )}

            {/* KPI OVERVIEW METRICS GRID - Compact & Clean (3 cols on mobile, 6 on desktop) */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {/* Card 1: Total CCCs */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">Total CCCs</div>
                  {loadingTenants ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-slate-100 mt-0.5">{tenants.length}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Linked Supplies */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">Linked Sheets</div>
                  {loadingTenants ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5">
                      {linkedTenantsCount}<span className="text-[10px] text-slate-500 font-normal">/{tenants.length}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Agencies */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">Agencies</div>
                  {loadingUsers ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-amber-400 mt-0.5">{totalAgenciesCount}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 4: Active Users */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">Accounts</div>
                  {loadingUsers ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-indigo-400 mt-0.5">{users.length}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 5: DC Rows */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">DC Lists</div>
                  {loadingStats ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-rose-400 mt-0.5">{activeDcTenantsCount}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 6: Zone Maps */}
              <Card className="bg-slate-900/70 border-slate-800 backdrop-blur shadow-xs">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-400">Zone Maps</div>
                  {loadingStats ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-cyan-400 mt-0.5">{activeZoneTenantsCount}</div>
                  )}
                </CardContent>
              </Card>
            </div>

        {/* PENDINGS & ACTION NEEDED BANNER */}
        {(pendingTenantsCount > 0 || noUsersTenants.length > 0 || noAgenciesTenants.length > 0) && (
          <div className="bg-amber-950/25 border border-amber-800/40 p-3 sm:p-4 rounded-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-amber-200">System Setup & Provisioning Pending</h3>
                  <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-amber-300/80">
                    {pendingTenantsCount > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">
                        {pendingTenantsCount} Unlinked
                      </span>
                    )}
                    {noUsersTenants.length > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">
                        {noUsersTenants.length} Missing Users
                      </span>
                    )}
                    {noAgenciesTenants.length > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">
                        {noAgenciesTenants.length} Missing Agencies
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Filter Triggers */}
              <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
                {pendingTenantsCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusFilter("pending_link")}
                    className="border-amber-700/60 bg-amber-950/50 text-amber-300 hover:bg-amber-900/60 text-[11px] h-7 px-2"
                  >
                    View Unlinked ({pendingTenantsCount})
                  </Button>
                )}
                {noUsersTenants.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusFilter("no_users")}
                    className="border-amber-700/60 bg-amber-950/50 text-amber-300 hover:bg-amber-900/60 text-[11px] h-7 px-2"
                  >
                    View Missing Users ({noUsersTenants.length})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SEARCH, FILTER & EXPAND CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800 shadow-xs">
          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search CCC, agency, user..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 text-xs h-8 rounded-lg"
            />
          </div>

          {/* Filter Pills, Expand All, and Password Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "all" ? "bg-blue-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              All ({allTenantCodes.length})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "linked" ? "default" : "outline"}
              onClick={() => setStatusFilter("linked")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "linked" ? "bg-emerald-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Linked ({linkedTenantsCount})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "pending_link" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending_link")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "pending_link" ? "bg-amber-600 text-white font-semibold" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Unlinked ({pendingTenantsCount})
            </Button>

            {/* Expand / Collapse All Toggle Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={isAllExpanded ? collapseAllCccs : expandAllCccs}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-[11px] h-7 px-2 ml-auto sm:ml-0"
            >
              <ChevronsUpDown className="h-3 w-3 text-indigo-400 mr-1" />
              <span>{isAllExpanded ? "Collapse" : "Expand"}</span>
            </Button>

            {/* Password toggle button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAllPasswords(!showAllPasswords)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-[11px] h-7 px-2"
            >
              {showAllPasswords ? <EyeOff className="h-3 w-3 text-amber-400 mr-1" /> : <Eye className="h-3 w-3 text-blue-400 mr-1" />}
              <span>{showAllPasswords ? "Hide Pass" : "Pass"}</span>
            </Button>
          </div>
        </div>

        {/* UNIFIED SINGLE DASHBOARD VIEW */}
        <Card className="bg-slate-900/70 border-slate-800 overflow-hidden shadow-sm rounded-xl">
          <CardHeader className="py-2.5 px-3 sm:px-5 border-b border-slate-800/80 bg-slate-900/90 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              Care Center Console
            </CardTitle>
            <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px] font-mono">
              {filteredTenantRows.length} Care Centers
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            {loadingTenants || loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
                <p className="text-xs text-slate-400 font-mono">Loading Supply & Credential Registry...</p>
              </div>
            ) : filteredTenantRows.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs sm:text-sm">
                <ShieldAlert className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                No supply care centers found matching your search filters.
              </div>
            ) : (
              <>
                {/* 1. MOBILE COLLAPSIBLE CARD VIEW (Optimized for all mobile viewports, 0 horizontal scroll) */}
                <div className="block lg:hidden divide-y divide-slate-800/80">
                  {filteredTenantRows.map(cccCode => {
                    const tenant = tenants.find(t => t.cccCode === cccCode)
                    const cccName = tenant ? tenant.cccName : cccCode === "SYSTEM" ? "Global System & Master Users" : "Unregistered CCC"
                    const cccUsers = usersByCcc[cccCode] || []
                    const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
                    const tenantStat = stats[cccCode] || { dcCount: 0, zoneCount: 0 }
                    const isExpanded = !!expandedCccs[cccCode]

                    return (
                      <div key={cccCode} className="p-3 space-y-2.5 hover:bg-slate-900/40 transition-colors">
                        {/* Header: CCC Code, Name, Linked Status & Expand Button */}
                        <div 
                          onClick={() => toggleCccExpand(cccCode)}
                          className="flex items-center justify-between gap-2 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-xs text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/30 shrink-0">
                              {cccCode}
                            </span>
                            <h3 className="font-bold text-xs text-slate-200 truncate">
                              {cccName}
                            </h3>
                          </div>

                          {/* Link Status Pill & Expand Chevron */}
                          <div className="flex items-center gap-1 shrink-0">
                            {cccCode === "SYSTEM" ? (
                              <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-400 text-[9px] px-1.5 py-0">
                                Global
                              </Badge>
                            ) : tenant?.spreadsheetId ? (
                              <a
                                href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                                <span>Sheet</span>
                              </a>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/15 border-amber-500/30 text-amber-400 text-[9px] px-1.5 py-0 font-medium">
                                Unlinked
                              </Badge>
                            )}

                            {/* Chevron Toggle Button */}
                            <div className="p-1 text-slate-400 rounded hover:bg-slate-800">
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-blue-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                            </div>
                          </div>
                        </div>

                        {/* Summary Metrics Row */}
                        <div 
                          onClick={() => toggleCccExpand(cccCode)}
                          className="grid grid-cols-4 gap-1 text-center cursor-pointer"
                        >
                          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md py-1 px-0.5">
                            <div className="text-[9px] text-slate-400">DC Rows</div>
                            <div className="text-[11px] font-mono font-bold text-rose-400">
                              {(tenantStat.dcCount || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md py-1 px-0.5">
                            <div className="text-[9px] text-slate-400">Maps</div>
                            <div className="text-[11px] font-mono font-bold text-cyan-400">
                              {(tenantStat.zoneCount || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md py-1 px-0.5">
                            <div className="text-[9px] text-slate-400">Agencies</div>
                            <div className="text-[11px] font-mono font-bold text-amber-400">
                              {cccAgencies.length}
                            </div>
                          </div>
                          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md py-1 px-0.5">
                            <div className="text-[9px] text-slate-400">Users</div>
                            <div className="text-[11px] font-mono font-bold text-indigo-400">
                              {cccUsers.length}
                            </div>
                          </div>
                        </div>

                        {/* EXPANDABLE INTERNAL DETAILS (Agencies & Users) */}
                        {isExpanded && (
                          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                            {/* Agencies Section */}
                            <div className="space-y-1">
                              <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                                <Layers className="h-3 w-3 text-amber-400" />
                                <span>Agencies ({cccAgencies.length})</span>
                              </div>
                              {cccAgencies.length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {cccAgencies.map(a => (
                                    <span key={a} className="text-[9px] font-mono bg-slate-950 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded font-semibold">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[9px] text-slate-500 italic">No agencies configured</p>
                              )}
                            </div>

                            {/* Users & Credential List */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-indigo-400" />
                                  <span>User Logins ({cccUsers.length})</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setNewUser(prev => ({ ...prev, cccCode }))
                                    setShowAddUserModal(true)
                                  }}
                                  className="h-5 px-1.5 text-[9px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                                >
                                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                                  Add
                                </Button>
                              </div>

                              {cccUsers.length === 0 ? (
                                <div className="bg-slate-950/60 border border-slate-800/80 rounded-md p-2 text-center text-amber-500/80 text-[10px] italic">
                                  No accounts created
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {cccUsers.map(u => {
                                    const isPassVisible = showAllPasswords || visiblePasswords[u.id]

                                    return (
                                      <div
                                        key={`${u.id}-${u.username}`}
                                        className="bg-slate-950/90 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 text-xs"
                                      >
                                        <div className="space-y-0.5 min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-slate-200 text-xs truncate">{u.name || u.username}</span>
                                            <Badge
                                              className={`text-[8px] uppercase font-semibold px-1 py-0 ${
                                                u.role === "superuser"
                                                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                                  : u.role === "admin"
                                                  ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                                  : "bg-slate-800 text-slate-300 border-slate-700"
                                              }`}
                                              variant="outline"
                                            >
                                              {u.role}
                                            </Badge>
                                          </div>

                                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400 flex-wrap">
                                            <span>{u.username}</span>
                                            <span>•</span>
                                            <div className="flex items-center gap-1">
                                              <span className="text-emerald-300 font-semibold bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                                                {isPassVisible ? (u.password || "N/A") : "••••••"}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => togglePasswordVisibility(u.id)}
                                                className="text-slate-400 hover:text-slate-200 p-0.5"
                                              >
                                                {isPassVisible ? <EyeOff className="h-2.5 w-2.5 text-amber-400" /> : <Eye className="h-2.5 w-2.5 text-blue-400" />}
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Actions */}
                                        {u.role !== "superuser" && (
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => startEditUser(u)}
                                              className="h-6 w-6 text-blue-400 hover:text-blue-200 hover:bg-blue-500/15"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleDeleteUser(u.id, u.username)}
                                              className="h-6 w-6 text-red-400 hover:text-red-200 hover:bg-red-500/15"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 2. DESKTOP COLLAPSIBLE TABLE VIEW (Visible on tablet & desktop) */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-950/80 border-b border-slate-800">
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="w-[180px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                          Supply (CCC Code)
                        </TableHead>
                        <TableHead className="w-[160px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                          Linked Connection
                        </TableHead>
                        <TableHead className="w-[160px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                          Agencies Created
                        </TableHead>
                        <TableHead className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                          Users & Credentials (ID & Pass)
                        </TableHead>
                        <TableHead className="w-[100px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">
                          DC Rows
                        </TableHead>
                        <TableHead className="w-[100px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">
                          Zone Maps
                        </TableHead>
                        <TableHead className="w-[70px] text-slate-400 font-bold text-xs uppercase tracking-wider text-center">
                          View
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenantRows.map(cccCode => {
                        const tenant = tenants.find(t => t.cccCode === cccCode)
                        const cccName = tenant ? tenant.cccName : cccCode === "SYSTEM" ? "Global System & Master Users" : "Unregistered CCC"
                        const cccUsers = usersByCcc[cccCode] || []
                        const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
                        const tenantStat = stats[cccCode] || { dcCount: 0, zoneCount: 0 }
                        const isExpanded = !!expandedCccs[cccCode]

                        return (
                          <TableRow 
                            key={cccCode} 
                            className={`border-slate-800/80 transition-colors ${isExpanded ? "bg-slate-900/50" : "hover:bg-slate-800/25"}`}
                          >
                            {/* 1. Supply Code & Name */}
                            <TableCell className="align-top py-3.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-black text-sm text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                    {cccCode}
                                  </span>
                                </div>
                                <div className="font-semibold text-xs text-slate-200 mt-1.5 leading-snug">
                                  {cccName}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setNewUser(prev => ({ ...prev, cccCode }))
                                    setShowAddUserModal(true)
                                  }}
                                  className="text-[10px] h-5 px-1.5 mt-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add User
                                </Button>
                              </div>
                            </TableCell>

                            {/* 2. Linked Supply Status & Connection */}
                            <TableCell className="align-top py-3.5">
                              {cccCode === "SYSTEM" ? (
                                <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-400 text-[10px]">
                                  Global System
                                </Badge>
                              ) : tenant?.spreadsheetId ? (
                                <div className="space-y-1.5">
                                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[10px] font-semibold flex items-center w-fit gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Linked
                                  </Badge>
                                  <a
                                    href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-mono break-all leading-tight"
                                  >
                                    {tenant.spreadsheetId.substring(0, 14)}...
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="bg-amber-500/10 border-amber-500/20 text-amber-400 text-[10px] font-semibold flex items-center w-fit gap-1">
                                    <Unlink className="h-3 w-3" />
                                    Pending Link
                                  </Badge>
                                  <p className="text-[10px] text-slate-500 italic">No spreadsheet connected</p>
                                </div>
                              )}
                            </TableCell>

                            {/* 3. Created Agencies & Count */}
                            <TableCell className="align-top py-3.5">
                              <div>
                                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold mb-1.5">
                                  {cccAgencies.length} {cccAgencies.length === 1 ? "Agency" : "Agencies"}
                                </Badge>
                                {cccAgencies.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {cccAgencies.map(a => (
                                      <span key={a} className="text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                        {a}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-600 italic block">No agencies created</span>
                                )}
                              </div>
                            </TableCell>

                            {/* 4. Supply Users (with ID & Pass & Role) */}
                            <TableCell className="align-top py-3.5">
                              {cccUsers.length === 0 ? (
                                <span className="text-xs text-amber-500/90 italic flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  No users created yet
                                </span>
                              ) : (
                                <div className="space-y-2">
                                  {cccUsers.map(u => {
                                    const isPassVisible = showAllPasswords || visiblePasswords[u.id]

                                    return (
                                      <div
                                        key={`${u.id}-${u.username}`}
                                        className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                                      >
                                        {/* User details */}
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-200">{u.name || u.username}</span>
                                            <Badge
                                              className={`text-[9px] uppercase font-semibold h-4 px-1.5 ${
                                                u.role === "superuser"
                                                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                                  : u.role === "admin"
                                                  ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                                  : "bg-slate-800 text-slate-300 border-slate-700"
                                              }`}
                                              variant="outline"
                                            >
                                              {u.role}
                                            </Badge>
                                          </div>

                                          {/* Username & Password */}
                                          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 pt-0.5">
                                            <div>
                                              <span className="text-slate-500 text-[10px]">ID:</span>{" "}
                                              <span className="text-blue-300 font-semibold">{u.username}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-slate-500 text-[10px]">PASS:</span>{" "}
                                              <span className="text-emerald-300 font-semibold bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                                                {isPassVisible ? (u.password || "N/A") : "••••••••"}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => togglePasswordVisibility(u.id)}
                                                className="text-slate-500 hover:text-slate-200 ml-0.5 p-0.5 cursor-pointer"
                                                title={isPassVisible ? "Hide Password" : "Show Password"}
                                              >
                                                {isPassVisible ? <EyeOff className="h-3 w-3 text-amber-400" /> : <Eye className="h-3 w-3 text-blue-400" />}
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1 self-end sm:self-center">
                                          {u.role !== "superuser" && (
                                            <>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => startEditUser(u)}
                                                className="h-6 w-6 text-blue-400 hover:text-blue-200 hover:bg-blue-500/10"
                                                title="Edit User"
                                              >
                                                <Pencil className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteUser(u.id, u.username)}
                                                className="h-6 w-6 text-red-400 hover:text-red-200 hover:bg-red-500/10"
                                                title="Delete User"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </TableCell>

                            {/* 5. DC Row Count */}
                            <TableCell className="align-top py-3.5 text-right font-mono">
                              <Badge variant="outline" className="bg-slate-900 border-slate-800 text-rose-300 font-bold text-xs">
                                {(tenantStat.dcCount || 0).toLocaleString()}
                              </Badge>
                            </TableCell>

                            {/* 6. Zone Map Count */}
                            <TableCell className="align-top py-3.5 text-right font-mono">
                              <Badge variant="outline" className="bg-slate-900 border-slate-800 text-cyan-300 font-bold text-xs">
                                {(tenantStat.zoneCount || 0).toLocaleString()}
                              </Badge>
                            </TableCell>

                            {/* 7. Collapsible Details Toggle Button */}
                            <TableCell className="align-top py-3.5 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleCccExpand(cccCode)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                                title={isExpanded ? "Collapse CCC Details" : "Expand CCC Details"}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
          </>
        )}
      </main>

      {/* DIALOG 1: Add Care Center Modal */}
      <Dialog open={showAddTenantModal} onOpenChange={setShowAddTenantModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-blue-400" />
              Register Care Center (Supply)
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Add new CCC profile to the superuser global routing system.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTenant} className="space-y-4 py-2">
            {tenantMsg && (
              <Alert variant={tenantMsg.type === "error" ? "destructive" : "default"}>
                {tenantMsg.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                <AlertDescription>{tenantMsg.text}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">CCC Code (Supply ID)</Label>
              <Input
                placeholder="e.g. 6612107, CCC-NORTH"
                value={newTenant.cccCode}
                onChange={e => setNewTenant({...newTenant, cccCode: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Subdivision / CCC Name</Label>
              <Input
                placeholder="e.g. KUSHIDA CCC"
                value={newTenant.cccName}
                onChange={e => setNewTenant({...newTenant, cccName: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Google Spreadsheet ID (Optional)</Label>
              <Input
                placeholder="Leave blank if not linked yet"
                value={newTenant.spreadsheetId}
                onChange={e => setNewTenant({...newTenant, spreadsheetId: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2 flex-row justify-end">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9 px-3" onClick={() => setShowAddTenantModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-9 px-3" disabled={submittingTenant}>
                {submittingTenant ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Register Supply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Create User Account Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark p-4 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-indigo-400" />
              Create Supply Access Credential
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Provision user account for administrators, agencies, or staff.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-3 py-2">
            {userMsg && (
              <Alert variant={userMsg.type === "error" ? "destructive" : "default"}>
                {userMsg.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                <AlertDescription>{userMsg.text}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">User Full Name</Label>
              <Input
                placeholder="e.g. Kushida Admin Officer"
                value={newUser.name}
                onChange={e => setNewUser({...newUser, name: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Username / Login ID</Label>
                <Input
                  placeholder="e.g. kushida_admin"
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Password</Label>
                <Input
                  placeholder="Password"
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Care Center (Supply)</Label>
                <Select
                  value={newUser.cccCode}
                  onValueChange={val => setNewUser({...newUser, cccCode: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9">
                    <SelectValue placeholder="Select Supply" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="SYSTEM">SYSTEM (Global)</SelectItem>
                    {tenants.map(t => (
                      <SelectItem key={t.cccCode} value={t.cccCode}>
                        {t.cccCode} - {t.cccName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Access Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={val => setNewUser({...newUser, role: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="lt">LT</SelectItem>
                    <SelectItem value="painter">Painter</SelectItem>
                    <SelectItem value="superuser">Superuser</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Allowed Agencies (Comma separated)</Label>
              <Input
                placeholder="e.g. POWER, MAITY"
                value={newUser.agencies}
                onChange={e => setNewUser({...newUser, agencies: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2 flex-row justify-end">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9 px-3" onClick={() => setShowAddUserModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs h-9 px-3" disabled={submittingUser}>
                {submittingUser ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Edit User Access Modal */}
      <Dialog open={showEditUserModal} onOpenChange={setShowEditUserModal}>
        <DialogContent className="w-[95vw] sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark p-4 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-blue-400" />
              Edit Account Access ({editForm.username})
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Modify account role, password, or supply assignments.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUserSubmit} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Name</Label>
              <Input
                value={editForm.name}
                onChange={e => setEditForm({...editForm, name: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">New Password (Leave blank to keep current)</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={editForm.password}
                onChange={e => setEditForm({...editForm, password: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Care Center (Supply)</Label>
                <Select
                  value={editForm.cccCode}
                  onValueChange={val => setEditForm({...editForm, cccCode: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="SYSTEM">SYSTEM (Global)</SelectItem>
                    {tenants.map(t => (
                      <SelectItem key={t.cccCode} value={t.cccCode}>
                        {t.cccCode} - {t.cccName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Access Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={val => setEditForm({...editForm, role: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="lt">LT</SelectItem>
                    <SelectItem value="painter">Painter</SelectItem>
                    <SelectItem value="superuser">Superuser</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Allowed Agencies (Comma separated)</Label>
              <Input
                placeholder="e.g. POWER, MAITY"
                value={editForm.agencies}
                onChange={e => setEditForm({...editForm, agencies: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2 flex-row justify-end">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9 px-3" onClick={() => setShowEditUserModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-9 px-3">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

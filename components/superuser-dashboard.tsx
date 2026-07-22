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
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  AlertTriangle,
  Layers,
  MapPin,
  ShieldAlert,
  SlidersHorizontal,
  Link2,
  Unlink
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
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Record<string, TenantStats>>({})
  
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)

  // Password Visibility Toggle Map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const [showAllPasswords, setShowAllPasswords] = useState(false)

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
        setTenants(await res.json())
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

  useEffect(() => {
    fetchTenants()
    fetchUsers()
    fetchStats()
  }, [])

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }))
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

  // Global totals
  let totalAgenciesCount = 0
  const allUniqueAgencies = new Set<string>()
  Object.values(agenciesByCcc).forEach(set => {
    set.forEach(a => allUniqueAgencies.add(a))
  })
  totalAgenciesCount = allUniqueAgencies.size

  let totalDcRowsCount = 0
  let totalZoneMapCount = 0
  Object.values(stats).forEach(s => {
    totalDcRowsCount += s.dcCount || 0
    totalZoneMapCount += s.zoneCount || 0
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 dark">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
              <Sparkles className="h-5 w-5 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-teal-400 bg-clip-text text-transparent">
                Superuser Supply & Credential Console
              </h1>
              <p className="text-[11px] text-slate-400">Single Dashboard Unified Monitoring & Provisioning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats()}
              disabled={loadingStats}
              className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingStats ? "animate-spin text-blue-400" : ""}`} />
              Refresh Metrics
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Log Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        
        {/* OVERVIEW METRICS GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                Total Supplies
                <Building2 className="h-4 w-4 text-blue-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingTenants ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-slate-100">{tenants.length}</div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Care Centers</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                Linked Supplies
                <Link2 className="h-4 w-4 text-emerald-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingTenants ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-emerald-400">
                    {linkedTenantsCount} <span className="text-xs text-slate-500 font-normal">/ {tenants.length}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {tenants.length ? Math.round((linkedTenantsCount / tenants.length) * 100) : 0}% Active Sheets
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                Agencies Created
                <Layers className="h-4 w-4 text-amber-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingUsers ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-amber-400">{totalAgenciesCount}</div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Distinct Agencies</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                Active Users
                <Users className="h-4 w-4 text-indigo-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingUsers ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-indigo-400">{users.length}</div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Global Accounts</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                DC Rows Count
                <Database className="h-4 w-4 text-rose-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingStats ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-rose-400">{totalDcRowsCount.toLocaleString()}</div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Active DC Records</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-400 flex items-center justify-between">
                Zone Maps
                <MapPin className="h-4 w-4 text-cyan-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {loadingStats ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <div>
                  <div className="text-2xl font-black text-cyan-400">{totalZoneMapCount.toLocaleString()}</div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">MRU Mappings</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PENDINGS & ACTION NEEDED BANNER */}
        {(pendingTenantsCount > 0 || noUsersTenants.length > 0 || noAgenciesTenants.length > 0) && (
          <Card className="bg-amber-950/20 border-amber-800/40 p-4 rounded-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-amber-200">System Setup & Provisioning Pending</h3>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-amber-300/80">
                    {pendingTenantsCount > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 rounded font-mono">
                        {pendingTenantsCount} Supplies Unlinked
                      </span>
                    )}
                    {noUsersTenants.length > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 rounded font-mono">
                        {noUsersTenants.length} Supplies Missing Accounts
                      </span>
                    )}
                    {noAgenciesTenants.length > 0 && (
                      <span className="bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 rounded font-mono">
                        {noAgenciesTenants.length} Supplies Missing Agencies
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick filter triggers */}
              <div className="flex items-center gap-2 flex-wrap">
                {pendingTenantsCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusFilter("pending_link")}
                    className="border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 text-xs h-7"
                  >
                    View Unlinked ({pendingTenantsCount})
                  </Button>
                )}
                {noUsersTenants.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusFilter("no_users")}
                    className="border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 text-xs h-7"
                  >
                    View Missing Users ({noUsersTenants.length})
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* SEARCH, FILTER & ACTION BAR */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Quick search supply code, name, agency, username..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 text-xs h-9"
            />
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              className={`text-xs h-8 ${statusFilter === "all" ? "bg-blue-600 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              All Supplies ({allTenantCodes.length})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "linked" ? "default" : "outline"}
              onClick={() => setStatusFilter("linked")}
              className={`text-xs h-8 ${statusFilter === "linked" ? "bg-emerald-600 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Linked ({linkedTenantsCount})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "pending_link" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending_link")}
              className={`text-xs h-8 ${statusFilter === "pending_link" ? "bg-amber-600 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Unlinked ({pendingTenantsCount})
            </Button>

            {/* Password toggle button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAllPasswords(!showAllPasswords)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-8 ml-auto"
            >
              {showAllPasswords ? <EyeOff className="h-3.5 w-3.5 mr-1.5 text-amber-400" /> : <Eye className="h-3.5 w-3.5 mr-1.5 text-blue-400" />}
              {showAllPasswords ? "Hide All Passwords" : "Show Passwords"}
            </Button>
          </div>

          {/* Add Supply & User buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowAddTenantModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Care Center
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNewUser(prev => ({ ...prev, cccCode: tenants[0]?.cccCode || "SYSTEM" }))
                setShowAddUserModal(true)
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Account
            </Button>
          </div>
        </div>

        {/* UNIFIED SINGLE DASHBOARD MASTER TABLE */}
        <Card className="bg-slate-900/70 border-slate-800 overflow-hidden shadow-2xl">
          <CardHeader className="py-4 border-b border-slate-800/80 bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-400" />
                  Supply Overview & Credential Control Console
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Unified view of Linked Supplies, Created Agencies, User IDs & Passwords, DC Rows, and Zone Maps.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs font-mono">
                Showing {filteredTenantRows.length} Supplies
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingTenants || loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-xs text-slate-400 font-mono">Loading Supply & Credential Registry...</p>
              </div>
            ) : filteredTenantRows.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">
                <ShieldAlert className="h-10 w-10 mx-auto text-slate-600 mb-2" />
                No supply care centers found matching your search filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-950/80 border-b border-slate-800">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="w-[180px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Supply (CCC Code)
                      </TableHead>
                      <TableHead className="w-[200px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Linked Supply Connection
                      </TableHead>
                      <TableHead className="w-[180px] text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Created Agencies
                      </TableHead>
                      <TableHead className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Supply Users (ID, Pass & Role)
                      </TableHead>
                      <TableHead className="w-[100px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">
                        DC Rows
                      </TableHead>
                      <TableHead className="w-[100px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">
                        Zone Maps
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

                      return (
                        <TableRow key={cccCode} className="border-slate-800/80 hover:bg-slate-800/30 transition-colors">
                          {/* 1. Supply Code & Name */}
                          <TableCell className="align-top py-4">
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
                          <TableCell className="align-top py-4">
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
                          <TableCell className="align-top py-4">
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
                          <TableCell className="align-top py-4">
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
                                              className="text-slate-500 hover:text-slate-200 ml-0.5 p-0.5"
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
                          <TableCell className="align-top py-4 text-right font-mono">
                            <Badge variant="outline" className="bg-slate-900 border-slate-800 text-rose-300 font-bold text-xs">
                              {(tenantStat.dcCount || 0).toLocaleString()}
                            </Badge>
                          </TableCell>

                          {/* 6. Zone Map Count */}
                          <TableCell className="align-top py-4 text-right font-mono">
                            <Badge variant="outline" className="bg-slate-900 border-slate-800 text-cyan-300 font-bold text-xs">
                              {(tenantStat.zoneCount || 0).toLocaleString()}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* DIALOG 1: Add Care Center Modal */}
      <Dialog open={showAddTenantModal} onOpenChange={setShowAddTenantModal}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark">
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
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Subdivision / CCC Name</Label>
              <Input
                placeholder="e.g. KUSHIDA CCC"
                value={newTenant.cccName}
                onChange={e => setNewTenant({...newTenant, cccName: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400 font-medium">Google Spreadsheet ID (Optional)</Label>
              <Input
                placeholder="Leave blank if not linked yet"
                value={newTenant.spreadsheetId}
                onChange={e => setNewTenant({...newTenant, spreadsheetId: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs" onClick={() => setShowAddTenantModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs" disabled={submittingTenant}>
                {submittingTenant ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Register Supply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Create User Account Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark">
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
              <Label className="text-xs text-slate-400 font-medium">User Name</Label>
              <Input
                placeholder="e.g. Kushida Admin Officer"
                value={newUser.name}
                onChange={e => setNewUser({...newUser, name: e.target.value})}
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Username / ID</Label>
                <Input
                  placeholder="e.g. kushida_admin"
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Password</Label>
                <Input
                  placeholder="Password"
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Care Center (Supply)</Label>
                <Select
                  value={newUser.cccCode}
                  onValueChange={val => setNewUser({...newUser, cccCode: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs">
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
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs">
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
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs" onClick={() => setShowAddUserModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs" disabled={submittingUser}>
                {submittingUser ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Edit User Access Modal */}
      <Dialog open={showEditUserModal} onOpenChange={setShowEditUserModal}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 dark">
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
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
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
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Care Center (Supply)</Label>
                <Select
                  value={editForm.cccCode}
                  onValueChange={val => setEditForm({...editForm, cccCode: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs">
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
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs">
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
                className="bg-slate-950 border-slate-700 text-slate-100 text-xs"
              />
            </div>
            <DialogFooter className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs" onClick={() => setShowEditUserModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

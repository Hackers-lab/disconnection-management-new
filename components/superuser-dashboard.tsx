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
import { AgencyProfileTracker } from "@/components/agency-profile-tracker"
import { SuperuserSubscriptions } from "@/components/superuser-subscriptions"
import { BroadcastPushModal } from "@/components/broadcast-push-modal"
import { PushNotificationManager } from "@/components/push-notification-manager"
import { 
  Building2, 
  Users, 
  UserCheck,
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
  Bell, 
  UserPlus, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  ChevronsUpDown, 
  ChevronRight,
  Phone,
  Calendar,
  Clock,
  CreditCard
} from "lucide-react"

interface Tenant {
  id?: string | number
  cccCode: string
  cccName: string
  spreadsheetId?: string
  driveFolderId?: string
  googleDriveRefreshToken?: boolean
  contactPerson?: string
  mobileNumber?: string
  createdAt?: string
  updatedAt?: string
  adminUsername?: string
  isSelfRegistered?: boolean
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

function formatRegistrationDate(dateStr?: string): { formatted: string; relative: string } {
  if (!dateStr) return { formatted: "N/A", relative: "Legacy / Sheet" }
  try {
    const iso = dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z"
    const d = new Date(iso)
    if (isNaN(d.getTime())) return { formatted: dateStr, relative: "" }
    
    const formatted = d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }) + " IST"

    const diffMs = Date.now() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHour / 24)

    let relative = "Just now"
    if (diffDays > 0) relative = `${diffDays}d ago`
    else if (diffHour > 0) relative = `${diffHour}h ago`
    else if (diffMin > 0) relative = `${diffMin}m ago`

    return { formatted, relative }
  } catch {
    return { formatted: dateStr, relative: "" }
  }
}

export function SuperuserDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "registrations" | "online_users" | "module_versions" | "agency_tracker" | "vercel_usage" | "subscriptions">("overview")
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [onlineUserCount, setOnlineUserCount] = useState<number | null>(null)
  const [vercelSpikeCount, setVercelSpikeCount] = useState<number | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [masterSheetId, setMasterSheetId] = useState<string>("")
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Record<string, TenantStats>>({})
  
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingStats, setLoadingStats] = useState(false)

  // Password Visibility Toggle Map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const [showAllPasswords, setShowAllPasswords] = useState(false)

  // Collapsible & Expandable CCCs state
  const [expandedCccs, setExpandedCccs] = useState<Record<string, boolean>>({})

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState("")
  const [registrationsSearchTerm, setRegistrationsSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "linked" | "pending_link" | "no_users" | "no_agencies">("all")

  // Message states
  const [tenantMsg, setTenantMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [userMsg, setUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Dialog States
  const [showAddTenantModal, setShowAddTenantModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [submittingTenant, setSubmittingTenant] = useState(false)
  const [submittingUser, setSubmittingUser] = useState(false)

  // Forms
  const [newTenant, setNewTenant] = useState({ cccCode: "", cccName: "", spreadsheetId: "", contactPerson: "", mobileNumber: "" })
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

  // Explicit user-triggered load function so no APIs run automatically on login
  const loadDashboardData = async () => {
    setHasLoadedData(true)
    await Promise.all([
      fetchTenants(),
      fetchUsers(),
      fetchStats(),
      fetchOnlineCount(),
      fetchVercelSummary()
    ])
  }

  const handleTabChange = (tab: "overview" | "registrations" | "online_users" | "module_versions" | "agency_tracker" | "vercel_usage" | "subscriptions") => {
    setActiveTab(tab)
    if (!hasLoadedData && (tab === "overview" || tab === "registrations")) {
      loadDashboardData()
    } else if (tab === "online_users" && onlineUserCount === null) {
      fetchOnlineCount()
    } else if (tab === "vercel_usage" && vercelSpikeCount === null) {
      fetchVercelSummary()
    }
  }

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
        setNewTenant({ cccCode: "", cccName: "", spreadsheetId: "", contactPerson: "", mobileNumber: "" })
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

  const filteredRegistrations = [...tenants]
    .filter(t => {
      if (!registrationsSearchTerm.trim()) return true
      const q = registrationsSearchTerm.toLowerCase().trim()
      return (
        t.cccCode.toLowerCase().includes(q) ||
        t.cccName.toLowerCase().includes(q) ||
        (t.contactPerson || "").toLowerCase().includes(q) ||
        (t.mobileNumber || "").toLowerCase().includes(q) ||
        (t.adminUsername || "").toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const parseTime = (dateStr?: string) => {
        if (!dateStr) return 0
        const iso = dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z"
        const t = new Date(iso).getTime()
        return isNaN(t) ? 0 : t
      }
      const timeA = parseTime(a.createdAt)
      const timeB = parseTime(b.createdAt)
      if (timeA !== timeB) return timeB - timeA
      const idA = Number(a.id) || 0
      const idB = Number(b.id) || 0
      return idB - idA
    })

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 relative overflow-x-hidden">
      {/* Ambient Aurora Mesh Glow Lights (Apple / iOS style) */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-400/[0.08] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[28rem] h-[28rem] bg-indigo-400/[0.07] rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed top-1/3 right-10 w-72 h-72 bg-sky-300/[0.06] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* HEADER - Responsive Clean Theme */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-3.5 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {/* Title & Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-blue-50 p-2 rounded-xl border border-blue-100 shrink-0">
                <Sparkles className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  Superadmin Console
                </h1>
                <p className="text-[10px] text-slate-500 truncate">
                  {hasLoadedData ? `${tenants.length} Care Centers Registered` : "API Paused • Click to Load Data"}
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              {/* OPEN MASTER SHEET BUTTON */}
              {masterSheetId ? (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${masterSheetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 transition-colors shadow-2xs"
                  title="Open Master Config Google Spreadsheet"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">Master Sheet</span>
                  <ExternalLink className="h-3 w-3 text-emerald-600/80 hidden sm:inline" />
                </a>
              ) : null}

              {/* Load / Refresh Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={loadDashboardData}
                className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 shadow-2xs font-medium"
                title="Load or Refresh All Metrics"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingStats || loadingTenants ? "animate-spin text-blue-600" : ""}`} />
                <span className="ml-1">{hasLoadedData ? "Refresh" : "Load Data"}</span>
              </Button>

              {/* Send Broadcast Push Alert */}
              <Button
                size="sm"
                onClick={() => setShowBroadcastModal(true)}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-2.5 sm:px-3 rounded-lg shadow-sm"
                title="Send Push Notification to Connected Phones"
              >
                <Bell className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Broadcast Alert</span>
                <span className="sm:hidden">Alert</span>
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

              {/* Distinct & Always Visible Logout Button */}
              <form action={logout} className="shrink-0">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 sm:px-3 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200/80 rounded-lg shadow-2xs transition-colors shrink-0 flex items-center gap-1.5"
                  title="Sign out of Superadmin"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <span className="font-semibold">Logout</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-3 py-3.5 sm:px-6 space-y-3.5">
        
        {/* TOP NAVIGATION TABS - Clean Light Style */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 border-b border-slate-200/80 pb-2.5">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "overview"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Care Centers</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "overview"
                  ? "bg-blue-700 border-blue-400 text-white"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              {hasLoadedData ? tenants.length : "•"}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("registrations")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "registrations"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 text-purple-600 shrink-0" />
            <span className="truncate">Self Registrations</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "registrations"
                  ? "bg-purple-700 border-purple-400 text-white"
                  : "bg-purple-50 border-purple-200 text-purple-700"
              }`}
            >
              {hasLoadedData ? tenants.filter(t => Boolean(t.createdAt || t.contactPerson || t.mobileNumber)).length : "Log"}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("subscriptions")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "subscriptions"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="truncate">Subscriptions</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "subscriptions"
                  ? "bg-amber-700 border-amber-400 text-white"
                  : "bg-amber-50 border-amber-200 text-amber-700 font-bold"
              }`}
            >
              Billing
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("online_users")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "online_users"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Online Users</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "online_users"
                  ? "bg-emerald-700 border-emerald-400 text-white"
                  : onlineUserCount !== null && onlineUserCount > 0
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              {onlineUserCount !== null ? onlineUserCount : "Live"}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("module_versions")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "module_versions"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="truncate">Module Sync</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "module_versions"
                  ? "bg-blue-700 border-blue-400 text-white"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              }`}
            >
              KV
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("agency_tracker")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "agency_tracker"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">Agency Profiles</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 ${
                activeTab === "agency_tracker"
                  ? "bg-indigo-700 border-indigo-400 text-white"
                  : "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold"
              }`}
            >
              Track
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("vercel_usage")}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              activeTab === "vercel_usage"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="truncate">Vercel Quota</span>
            {vercelSpikeCount !== null && vercelSpikeCount > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 bg-amber-50 border-amber-300 text-amber-800 font-bold"
              >
                {vercelSpikeCount}
              </Badge>
            )}
          </button>
        </div>

        {activeTab === "subscriptions" ? (
          <SuperuserSubscriptions onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "agency_tracker" ? (
          <AgencyProfileTracker onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "online_users" ? (
          <SuperuserOnlineUsers onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "module_versions" ? (
          <SupplyModuleVersionsReport onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "vercel_usage" ? (
          <VercelUsageMonitor onBackToDashboard={() => setActiveTab("overview")} />
        ) : activeTab === "registrations" ? (
          !hasLoadedData ? (
            <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-6 sm:p-10 text-center my-6">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 mx-auto">
                  <UserCheck className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-900">
                    Self-Registration Log
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    View who registered each Customer Care Center and exactly when the registration occurred. Click below to load registration records.
                  </p>
                </div>
                <Button
                  onClick={loadDashboardData}
                  disabled={loadingTenants || loadingUsers}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {loadingTenants || loadingUsers ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Loading Registrations...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 text-purple-200" />
                      <span>Load Registration Records</span>
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3.5">
              {/* Header bar with Search and KPIs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by CCC Code, Name, Officer, or Mobile..."
                    value={registrationsSearchTerm}
                    onChange={e => setRegistrationsSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white border-slate-200 text-slate-900 rounded-lg shadow-2xs"
                  />
                  {registrationsSearchTerm && (
                    <button
                      onClick={() => setRegistrationsSearchTerm("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 text-xs py-1 px-2.5 font-medium">
                    {filteredRegistrations.length} Total Registrations
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadDashboardData}
                    className="h-8 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 shadow-2xs font-medium"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingTenants ? "animate-spin text-purple-600" : ""}`} />
                    <span>Refresh</span>
                  </Button>
                </div>
              </div>

              {/* Table / Card Container */}
              <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="py-2.5 px-3 sm:px-5 border-b border-slate-100 bg-slate-50/70 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-purple-600" />
                    <span>CCC Self-Registration Log</span>
                  </CardTitle>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Newest registrations first
                  </span>
                </CardHeader>

                <CardContent className="p-0">
                  {loadingTenants ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                      <Loader2 className="h-7 w-7 animate-spin text-purple-500" />
                      <p className="text-xs text-slate-400 font-mono">Loading Registration Logs...</p>
                    </div>
                  ) : filteredRegistrations.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs sm:text-sm">
                      <UserCheck className="h-8 w-8 mx-auto text-slate-400 mb-2 opacity-50" />
                      No registrations found matching your query.
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="block lg:hidden divide-y divide-slate-100">
                        {filteredRegistrations.map(reg => {
                          const dateInfo = formatRegistrationDate(reg.createdAt)
                          const adminUser = users.find(u => (u.cccCode === reg.cccCode && u.role.toLowerCase() === "admin") || u.username === reg.cccCode)
                          const isPassVisible = showAllPasswords || (adminUser && visiblePasswords[adminUser.id])

                          return (
                            <div key={reg.cccCode} className="p-3.5 space-y-2.5 hover:bg-slate-50/80 transition-colors">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono font-bold text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 shrink-0">
                                    {reg.cccCode}
                                  </span>
                                  <h3 className="font-bold text-xs text-slate-800 truncate">
                                    {reg.cccName}
                                  </h3>
                                </div>
                                <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 text-[10px] shrink-0 font-medium">
                                  {dateInfo.relative}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg text-[11px] border border-slate-100">
                                <div>
                                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Registered By</span>
                                  <span className="font-semibold text-slate-800">👤 {reg.contactPerson || adminUser?.name || "Station In-Charge"}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Mobile Number</span>
                                  {reg.mobileNumber ? (
                                    <a href={`tel:${reg.mobileNumber}`} className="font-mono font-semibold text-blue-600 hover:underline">
                                      📞 +91 {reg.mobileNumber}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 italic">Not set</span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Registration Date</span>
                                  <span className="text-slate-700 font-medium">🕒 {dateInfo.formatted}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Admin Password</span>
                                  {adminUser ? (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                                        {isPassVisible ? (adminUser.password || "N/A") : "••••••"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => togglePasswordVisibility(adminUser.id)}
                                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                      >
                                        {isPassVisible ? <EyeOff className="h-3 w-3 text-amber-600" /> : <Eye className="h-3 w-3 text-blue-600" />}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">No admin user</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                {reg.spreadsheetId ? (
                                  <a
                                    href={`https://docs.google.com/spreadsheets/d/${reg.spreadsheetId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    <span>Google Sheet Linked</span>
                                  </a>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-medium">
                                    Sheet Link Pending
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table className="w-full">
                          <TableHeader className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                            <TableRow>
                              <TableHead className="py-2.5 px-3">CCC Station</TableHead>
                              <TableHead className="py-2.5 px-3">Registered By (Officer)</TableHead>
                              <TableHead className="py-2.5 px-3">Contact Mobile</TableHead>
                              <TableHead className="py-2.5 px-3">Registration Timestamp</TableHead>
                              <TableHead className="py-2.5 px-3">Admin Login</TableHead>
                              <TableHead className="py-2.5 px-3">Google Sheet</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 text-xs">
                            {filteredRegistrations.map(reg => {
                              const dateInfo = formatRegistrationDate(reg.createdAt)
                              const adminUser = users.find(u => (u.cccCode === reg.cccCode && u.role.toLowerCase() === "admin") || u.username === reg.cccCode)
                              const isPassVisible = showAllPasswords || (adminUser && visiblePasswords[adminUser.id])

                              return (
                                <TableRow key={reg.cccCode} className="hover:bg-slate-50/80 transition-colors">
                                  <TableCell className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 shrink-0">
                                        {reg.cccCode}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-900 truncate">{reg.cccName}</div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 px-3">
                                    <div className="font-semibold text-slate-800">
                                      👤 {reg.contactPerson || adminUser?.name || "Station In-Charge"}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 px-3 font-mono">
                                    {reg.mobileNumber ? (
                                      <a href={`tel:${reg.mobileNumber}`} className="font-semibold text-blue-600 hover:underline">
                                        📞 +91 {reg.mobileNumber}
                                      </a>
                                    ) : (
                                      <span className="text-slate-400 italic">Not set</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-3 px-3">
                                    <div className="space-y-0.5">
                                      <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 text-[10px] font-medium">
                                        {dateInfo.relative}
                                      </Badge>
                                      <div className="text-[10px] text-slate-500">{dateInfo.formatted}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 px-3">
                                    {adminUser ? (
                                      <div className="space-y-1">
                                        <span className="font-mono text-slate-700 font-medium">{adminUser.username}</span>
                                        <div className="flex items-center gap-1">
                                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                                            {isPassVisible ? (adminUser.password || "N/A") : "••••••"}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => togglePasswordVisibility(adminUser.id)}
                                            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                          >
                                            {isPassVisible ? <EyeOff className="h-3 w-3 text-amber-600" /> : <Eye className="h-3 w-3 text-blue-600" />}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">No admin user</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-3 px-3">
                                    {reg.spreadsheetId ? (
                                      <a
                                        href={`https://docs.google.com/spreadsheets/d/${reg.spreadsheetId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                      >
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        <span>Linked</span>
                                      </a>
                                    ) : (
                                      <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-medium">
                                        Pending
                                      </Badge>
                                    )}
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
            </div>
          )
        ) : !hasLoadedData ? (
          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-6 sm:p-10 text-center my-6">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
                <Database className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-slate-900">
                  Superadmin Metrics On-Demand
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Automatic background API calls are paused on login to optimize database reads and cloud usage. Click below to load all Care Centers, Self-Registrations, and operational statistics.
                </p>
              </div>
              <Button
                onClick={loadDashboardData}
                disabled={loadingTenants || loadingUsers}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                {loadingTenants || loadingUsers ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading Console Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 text-blue-200" />
                    <span>Load Dashboard & Registrations</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
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

            {/* KPI OVERVIEW METRICS GRID - White iPhone Style Cards */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {/* Card 1: Total CCCs */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">Total CCCs</div>
                  {loadingTenants ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">{tenants.length}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Linked Supplies */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">Linked Sheets</div>
                  {loadingTenants ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5">
                      {linkedTenantsCount}<span className="text-[10px] text-slate-400 font-normal">/{tenants.length}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Agencies */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">Agencies</div>
                  {loadingUsers ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-amber-600 mt-0.5">{totalAgenciesCount}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 4: Active Users */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">Accounts</div>
                  {loadingUsers ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-indigo-600 mt-0.5">{users.length}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 5: DC Rows */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">DC Lists</div>
                  {loadingStats ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-rose-600 mt-0.5">{activeDcTenantsCount}</div>
                  )}
                </CardContent>
              </Card>

              {/* Card 6: Zone Maps */}
              <Card className="bg-white border-slate-200/80 shadow-2xs rounded-xl">
                <CardContent className="p-2.5 text-center">
                  <div className="text-[10px] font-semibold text-slate-500">Zone Maps</div>
                  {loadingStats ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mx-auto my-1" />
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-cyan-600 mt-0.5">{activeZoneTenantsCount}</div>
                  )}
                </CardContent>
              </Card>
            </div>

        {/* PENDINGS & ACTION NEEDED BANNER */}
        {(pendingTenantsCount > 0 || noUsersTenants.length > 0 || noAgenciesTenants.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 p-3 sm:p-3.5 rounded-xl shadow-2xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-amber-900">Pending Setup Actions</h3>
                  <div className="flex flex-wrap gap-1 mt-1 text-[11px] text-amber-800">
                    {pendingTenantsCount > 0 && (
                      <span className="bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded font-mono">
                        {pendingTenantsCount} Unlinked
                      </span>
                    )}
                    {noUsersTenants.length > 0 && (
                      <span className="bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded font-mono">
                        {noUsersTenants.length} Missing Users
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
                    className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100/60 text-[11px] h-7 px-2"
                  >
                    View Unlinked ({pendingTenantsCount})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SEARCH, FILTER & EXPAND CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search CCC, agency, user..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 text-xs h-8 rounded-lg"
            />
          </div>

          {/* Filter Pills, Expand All, and Password Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "all" ? "bg-blue-600 text-white font-semibold" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              All ({allTenantCodes.length})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "linked" ? "default" : "outline"}
              onClick={() => setStatusFilter("linked")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "linked" ? "bg-emerald-600 text-white font-semibold" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Linked ({linkedTenantsCount})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "pending_link" ? "default" : "outline"}
              onClick={() => setStatusFilter("pending_link")}
              className={`text-[11px] h-7 px-2 ${statusFilter === "pending_link" ? "bg-amber-600 text-white font-semibold" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Unlinked ({pendingTenantsCount})
            </Button>

            {/* Expand / Collapse All Toggle Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={isAllExpanded ? collapseAllCccs : expandAllCccs}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] h-7 px-2 ml-auto sm:ml-0"
            >
              <ChevronsUpDown className="h-3 w-3 text-indigo-600 mr-1" />
              <span>{isAllExpanded ? "Collapse" : "Expand"}</span>
            </Button>

            {/* Password toggle button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAllPasswords(!showAllPasswords)}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] h-7 px-2"
            >
              {showAllPasswords ? <EyeOff className="h-3 w-3 text-amber-600 mr-1" /> : <Eye className="h-3 w-3 text-blue-600 mr-1" />}
              <span>{showAllPasswords ? "Hide Pass" : "Pass"}</span>
            </Button>
          </div>
        </div>

        {/* UNIFIED SINGLE DASHBOARD VIEW */}
        <Card className="bg-white border-slate-200/90 overflow-hidden shadow-sm rounded-xl">
          <CardHeader className="py-2.5 px-3 sm:px-5 border-b border-slate-100 bg-slate-50/70 flex flex-row items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              Care Center Console
            </CardTitle>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600 text-[10px] font-mono">
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
                {/* 1. MOBILE COLLAPSIBLE CARD VIEW (Clean iOS white cards) */}
                <div className="block lg:hidden divide-y divide-slate-100">
                  {filteredTenantRows.map(cccCode => {
                    const tenant = tenants.find(t => t.cccCode === cccCode)
                    const cccName = tenant ? tenant.cccName : cccCode === "SYSTEM" ? "Global System & Master Users" : "Unregistered CCC"
                    const cccUsers = usersByCcc[cccCode] || []
                    const cccAgencies = Array.from(agenciesByCcc[cccCode] || [])
                    const tenantStat = stats[cccCode] || { dcCount: 0, zoneCount: 0 }
                    const isExpanded = !!expandedCccs[cccCode]

                    return (
                      <div key={cccCode} className="p-3 space-y-2.5 hover:bg-slate-50/80 transition-colors">
                        {/* Header: CCC Code, Name, Linked Status & Expand Button */}
                        <div 
                          onClick={() => toggleCccExpand(cccCode)}
                          className="flex items-center justify-between gap-2 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 shrink-0">
                              {cccCode}
                            </span>
                            <div className="min-w-0">
                              <h3 className="font-bold text-xs text-slate-800 truncate">
                                {cccName}
                              </h3>
                              {(tenant?.contactPerson || tenant?.mobileNumber || tenant?.createdAt) && (
                                <p className="text-[10px] text-purple-700 truncate font-medium mt-0.5">
                                  👤 {tenant.contactPerson || "Admin"}{tenant.mobileNumber ? ` • 📞 +91 ${tenant.mobileNumber}` : ""}{tenant.createdAt ? ` • 🕒 ${formatRegistrationDate(tenant.createdAt).relative}` : ""}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Link Status Pill & Expand Chevron */}
                          <div className="flex items-center gap-1 shrink-0">
                            {cccCode === "SYSTEM" ? (
                              <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-500 text-[9px] px-1.5 py-0">
                                Global
                              </Badge>
                            ) : tenant?.spreadsheetId ? (
                              <a
                                href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                <span>Sheet</span>
                              </a>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[9px] px-1.5 py-0 font-medium">
                                Unlinked
                              </Badge>
                            )}

                            {/* Chevron Toggle Button */}
                            <div className="p-1 text-slate-400 rounded hover:bg-slate-100">
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-blue-600" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                            </div>
                          </div>
                        </div>

                        {/* Summary Metrics Row */}
                        <div 
                          onClick={() => toggleCccExpand(cccCode)}
                          className="grid grid-cols-4 gap-1 text-center cursor-pointer"
                        >
                          <div className="bg-slate-50 border border-slate-100 rounded-lg py-1 px-0.5">
                            <div className="text-[9px] text-slate-500">DC Rows</div>
                            <div className="text-[11px] font-mono font-bold text-rose-600">
                              {(tenantStat.dcCount || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-lg py-1 px-0.5">
                            <div className="text-[9px] text-slate-500">Maps</div>
                            <div className="text-[11px] font-mono font-bold text-cyan-600">
                              {(tenantStat.zoneCount || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-lg py-1 px-0.5">
                            <div className="text-[9px] text-slate-500">Agencies</div>
                            <div className="text-[11px] font-mono font-bold text-amber-600">
                              {cccAgencies.length}
                            </div>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-lg py-1 px-0.5">
                            <div className="text-[9px] text-slate-500">Users</div>
                            <div className="text-[11px] font-mono font-bold text-indigo-600">
                              {cccUsers.length}
                            </div>
                          </div>
                        </div>

                        {/* EXPANDABLE INTERNAL DETAILS (Agencies & Users) */}
                        {isExpanded && (
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            {/* Agencies Section */}
                            <div className="space-y-1">
                              <div className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                                <Layers className="h-3 w-3 text-amber-600" />
                                <span>Agencies ({cccAgencies.length})</span>
                              </div>
                              {cccAgencies.length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {cccAgencies.map(a => (
                                    <span key={a} className="text-[9px] font-mono bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[9px] text-slate-400 italic">No agencies configured</p>
                              )}
                            </div>

                            {/* Users & Credential List */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-600 font-semibold">
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-indigo-600" />
                                  <span>User Accounts ({cccUsers.length})</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setNewUser(prev => ({ ...prev, cccCode }))
                                    setShowAddUserModal(true)
                                  }}
                                  className="h-5 px-1.5 text-[9px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                                  Add
                                </Button>
                              </div>

                              {cccUsers.length === 0 ? (
                                <div className="bg-slate-50 border border-slate-100 rounded-md p-2 text-center text-amber-700 text-[10px] italic">
                                  No accounts created
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {cccUsers.map(u => {
                                    const isPassVisible = showAllPasswords || visiblePasswords[u.id]

                                    return (
                                      <div
                                        key={`${u.id}-${u.username}`}
                                        className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 flex items-center justify-between gap-2 text-xs"
                                      >
                                        <div className="space-y-0.5 min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-slate-800 text-xs truncate">{u.name || u.username}</span>
                                            <Badge
                                              className={`text-[8px] uppercase font-semibold px-1 py-0 ${
                                                u.role === "superuser"
                                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                                  : u.role === "admin"
                                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                                  : "bg-slate-100 text-slate-700 border-slate-200"
                                              }`}
                                              variant="outline"
                                            >
                                              {u.role}
                                            </Badge>

                                            {/* Individual Subscription Status */}
                                            {(() => {
                                              const isExempt = u.role === "superuser" || u.role === "admin" || u.bypassSubscription
                                              const billingStartDate = new Date("2026-09-07T00:00:00")
                                              const isTrial = Date.now() < billingStartDate.getTime()

                                              if (isExempt) {
                                                return (
                                                  <span className="text-[8px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1 py-0.2 rounded">
                                                    Free Pass
                                                  </span>
                                                )
                                              } else if (isTrial) {
                                                return (
                                                  <span className="text-[8px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 py-0.2 rounded">
                                                    Trial Active
                                                  </span>
                                                )
                                              } else if (u.subscriptionStatus === "active") {
                                                let isExpired = false
                                                if (u.subscriptionExpiresAt) {
                                                  const expDate = new Date(u.subscriptionExpiresAt)
                                                  expDate.setHours(23, 59, 59, 999)
                                                  if (Date.now() > expDate.getTime()) isExpired = true
                                                }
                                                if (isExpired) {
                                                  return (
                                                    <span className="text-[8px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1 py-0.2 rounded">
                                                      Exp ({u.subscriptionExpiresAt})
                                                    </span>
                                                  )
                                                }
                                                return (
                                                  <span className="text-[8px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-0.2 rounded">
                                                    Active {u.subscriptionExpiresAt ? `(${u.subscriptionExpiresAt})` : ""}
                                                  </span>
                                                )
                                              } else {
                                                return (
                                                  <span className="text-[8px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 px-1 py-0.2 rounded">
                                                    Expired
                                                  </span>
                                                )
                                              }
                                            })()}
                                          </div>

                                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 flex-wrap">
                                            <span className="text-slate-700">{u.username}</span>
                                            <span>•</span>
                                            <div className="flex items-center gap-1">
                                              <span className="text-emerald-700 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                                {isPassVisible ? (u.password || "N/A") : "••••••"}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => togglePasswordVisibility(u.id)}
                                                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                              >
                                                {isPassVisible ? <EyeOff className="h-2.5 w-2.5 text-amber-600" /> : <Eye className="h-2.5 w-2.5 text-blue-600" />}
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
                                              className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleDeleteUser(u.id, u.username)}
                                              className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
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

                {/* 2. DESKTOP COLLAPSIBLE TABLE VIEW (Clean iOS white table) */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                      <TableRow className="border-slate-200 hover:bg-transparent">
                        <TableHead className="w-[180px] text-slate-600 font-bold text-xs uppercase tracking-wider">
                          Supply (CCC Code)
                        </TableHead>
                        <TableHead className="w-[160px] text-slate-600 font-bold text-xs uppercase tracking-wider">
                          Linked Connection
                        </TableHead>
                        <TableHead className="w-[160px] text-slate-600 font-bold text-xs uppercase tracking-wider">
                          Agencies Created
                        </TableHead>
                        <TableHead className="text-slate-600 font-bold text-xs uppercase tracking-wider">
                          Users & Credentials (ID & Pass)
                        </TableHead>
                        <TableHead className="w-[100px] text-slate-600 font-bold text-xs uppercase tracking-wider text-right">
                          DC Rows
                        </TableHead>
                        <TableHead className="w-[100px] text-slate-600 font-bold text-xs uppercase tracking-wider text-right">
                          Zone Maps
                        </TableHead>
                        <TableHead className="w-[70px] text-slate-600 font-bold text-xs uppercase tracking-wider text-center">
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
                            className={`border-slate-100 transition-colors ${isExpanded ? "bg-slate-50/70" : "hover:bg-slate-50/40"}`}
                          >
                            {/* 1. Supply Code & Name */}
                            <TableCell className="align-top py-3.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    {cccCode}
                                  </span>
                                </div>
                                <div className="font-semibold text-xs text-slate-800 mt-1.5 leading-snug">
                                  {cccName}
                                </div>
                                {(tenant?.contactPerson || tenant?.mobileNumber || tenant?.createdAt) && (
                                  <div className="mt-1 text-[10px] text-purple-700 bg-purple-50/70 border border-purple-100 rounded px-1.5 py-0.5 leading-tight">
                                    <div className="font-semibold text-purple-900">👤 {tenant.contactPerson || "Admin"}</div>
                                    {tenant.mobileNumber && <div className="text-slate-600 font-mono">📞 +91 {tenant.mobileNumber}</div>}
                                    {tenant.createdAt && <div className="text-purple-600">🕒 {formatRegistrationDate(tenant.createdAt).relative}</div>}
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setNewUser(prev => ({ ...prev, cccCode }))
                                    setShowAddUserModal(true)
                                  }}
                                  className="text-[10px] h-5 px-1.5 mt-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add User
                                </Button>
                              </div>
                            </TableCell>

                            {/* 2. Linked Supply Status & Connection */}
                            <TableCell className="align-top py-3.5">
                              {cccCode === "SYSTEM" ? (
                                <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-600 text-[10px]">
                                  Global System
                                </Badge>
                              ) : tenant?.spreadsheetId ? (
                                <div className="space-y-1.5">
                                  <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 text-[10px] font-semibold flex items-center w-fit gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    Linked
                                  </Badge>
                                  <a
                                    href={`https://docs.google.com/spreadsheets/d/${tenant.spreadsheetId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-mono break-all leading-tight"
                                  >
                                    {tenant.spreadsheetId.substring(0, 14)}...
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-semibold flex items-center w-fit gap-1">
                                    <Unlink className="h-3 w-3" />
                                    Pending Link
                                  </Badge>
                                  <p className="text-[10px] text-slate-400 italic">No sheet connected</p>
                                </div>
                              )}
                            </TableCell>

                            {/* 3. Created Agencies & Count */}
                            <TableCell className="align-top py-3.5">
                              <div>
                                <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold mb-1.5">
                                  {cccAgencies.length} {cccAgencies.length === 1 ? "Agency" : "Agencies"}
                                </Badge>
                                {cccAgencies.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {cccAgencies.map(a => (
                                      <span key={a} className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                                        {a}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic block">No agencies created</span>
                                )}
                              </div>
                            </TableCell>

                            {/* 4. Supply Users (with ID & Pass & Role) */}
                            <TableCell className="align-top py-3.5">
                              {cccUsers.length === 0 ? (
                                <span className="text-xs text-amber-700 italic flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  No users created yet
                                </span>
                              ) : (
                                <div className="space-y-2">
                                  {cccUsers.map(u => {
                                    const isPassVisible = showAllPasswords || visiblePasswords[u.id]

                                    return (
                                      <div
                                        key={u.id}
                                        className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 flex items-center justify-between gap-2"
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-xs text-slate-800">{u.name || u.username}</span>
                                            <Badge
                                              className={`text-[9px] uppercase font-semibold h-4 px-1.5 ${
                                                u.role === "superuser"
                                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                                  : u.role === "admin"
                                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                                  : "bg-slate-100 text-slate-700 border-slate-200"
                                              }`}
                                              variant="outline"
                                            >
                                              {u.role}
                                            </Badge>

                                            {/* Individual Subscription Status */}
                                            {(() => {
                                              const isExempt = u.role === "superuser" || u.role === "admin" || u.bypassSubscription
                                              const billingStartDate = new Date("2026-09-07T00:00:00")
                                              const isTrial = Date.now() < billingStartDate.getTime()

                                              if (isExempt) {
                                                return (
                                                  <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0 rounded">
                                                    Free Pass
                                                  </span>
                                                )
                                              } else if (isTrial) {
                                                return (
                                                  <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0 rounded">
                                                    Trial Active
                                                  </span>
                                                )
                                              } else if (u.subscriptionStatus === "active") {
                                                let isExpired = false
                                                if (u.subscriptionExpiresAt) {
                                                  const expDate = new Date(u.subscriptionExpiresAt)
                                                  expDate.setHours(23, 59, 59, 999)
                                                  if (Date.now() > expDate.getTime()) isExpired = true
                                                }
                                                if (isExpired) {
                                                  return (
                                                    <span className="text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0 rounded">
                                                      Exp ({u.subscriptionExpiresAt})
                                                    </span>
                                                  )
                                                }
                                                return (
                                                  <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0 rounded">
                                                    Active {u.subscriptionExpiresAt ? `(${u.subscriptionExpiresAt})` : ""}
                                                  </span>
                                                )
                                              } else {
                                                return (
                                                  <span className="text-[9px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0 rounded">
                                                    Expired
                                                  </span>
                                                )
                                              }
                                            })()}
                                          </div>
                                          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                                            <span>ID: <b className="text-slate-800">{u.username}</b></span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                              PASS: <b className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">{isPassVisible ? (u.password || "N/A") : "••••••••"}</b>
                                              <button
                                                type="button"
                                                onClick={() => togglePasswordVisibility(u.id)}
                                                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                              >
                                                {isPassVisible ? <EyeOff className="h-3 w-3 text-amber-600" /> : <Eye className="h-3 w-3 text-blue-600" />}
                                              </button>
                                            </span>
                                          </div>
                                        </div>

                                        {u.role !== "superuser" && (
                                          <div className="flex items-center gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => startEditUser(u)}
                                              className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleDeleteUser(u.id, u.username)}
                                              className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
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
                            </TableCell>

                            {/* 5. DC Rows */}
                            <TableCell className="align-top py-3.5 text-right font-mono font-bold text-xs text-rose-600">
                              {(tenantStat.dcCount || 0).toLocaleString()}
                            </TableCell>

                            {/* 6. Zone Maps */}
                            <TableCell className="align-top py-3.5 text-right font-mono font-bold text-xs text-cyan-600">
                              {(tenantStat.zoneCount || 0).toLocaleString()}
                            </TableCell>

                            {/* 7. View Toggle */}
                            <TableCell className="align-top py-3.5 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleCccExpand(cccCode)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Contact Person</Label>
                <Input
                  placeholder="Officer / In-Charge"
                  value={newTenant.contactPerson}
                  onChange={e => setNewTenant({...newTenant, contactPerson: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Contact Mobile</Label>
                <Input
                  placeholder="10-digit mobile"
                  value={newTenant.mobileNumber}
                  onChange={e => setNewTenant({...newTenant, mobileNumber: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-9"
                  maxLength={10}
                />
              </div>
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

            {/* Subscription Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Subscription Status</Label>
                <Select
                  value={newUser.subscriptionStatus || "active"}
                  onValueChange={val => setNewUser({...newUser, subscriptionStatus: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive / Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Expiry Date (YYYY-MM-DD)</Label>
                <Input
                  type="date"
                  value={newUser.subscriptionExpiresAt}
                  onChange={e => setNewUser({...newUser, subscriptionExpiresAt: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-8"
                />
              </div>
              <div className="sm:col-span-2 flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="new-user-bypass"
                  checked={newUser.bypassSubscription}
                  onChange={e => setNewUser({...newUser, bypassSubscription: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950 border-slate-700"
                />
                <label htmlFor="new-user-bypass" className="text-xs text-slate-300 cursor-pointer">
                  Bypass Subscription (Free Pass / No Expiry Restriction)
                </label>
              </div>
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

            {/* Subscription Settings in Edit Modal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Subscription Status</Label>
                <Select
                  value={editForm.subscriptionStatus || "active"}
                  onValueChange={val => setEditForm({...editForm, subscriptionStatus: val})}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 text-xs">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive / Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400 font-medium">Expiry Date (YYYY-MM-DD)</Label>
                <Input
                  type="date"
                  value={editForm.subscriptionExpiresAt || ""}
                  onChange={e => setEditForm({...editForm, subscriptionExpiresAt: e.target.value})}
                  className="bg-slate-950 border-slate-700 text-slate-100 text-xs h-8"
                />
              </div>
              <div className="sm:col-span-2 flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-user-bypass"
                  checked={!!editForm.bypassSubscription}
                  onChange={e => setEditForm({...editForm, bypassSubscription: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950 border-slate-700"
                />
                <label htmlFor="edit-user-bypass" className="text-xs text-slate-300 cursor-pointer">
                  Bypass Subscription (Free Pass / No Expiry Restriction)
                </label>
              </div>
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

      {/* Broadcast Push Alert Modal */}
      <BroadcastPushModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        isSuperuser={true}
        tenants={tenants}
      />

      {/* Push Notification Permission Manager */}
      <PushNotificationManager />
    </div>
  )
}

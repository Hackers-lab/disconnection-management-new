"use client"

import { useState, useEffect, useMemo } from "react"
import { toast } from "@/hooks/use-toast"
import { SupplyModuleVersionsReport } from "@/components/supply-module-versions-report"
import { VercelUsageMonitor } from "@/components/vercel-usage-monitor"
import { SuperuserOnlineUsers } from "@/components/superuser-online-users"
import { SuperuserSubscriptions } from "@/components/superuser-subscriptions"
import { SuperuserRevenueAnalytics } from "@/components/superuser-revenue-analytics"
import { AgencyProfileTracker } from "@/components/agency-profile-tracker"
import { BroadcastPushModal } from "@/components/broadcast-push-modal"
import { PushNotificationManager } from "@/components/push-notification-manager"
import { SuperuserShell } from "@/components/superuser/superuser-shell"
import { SuperuserModals } from "@/components/superuser/superuser-modals"
import { CareCentersTab } from "@/components/superuser/care-centers-tab"
import { RegistrationsTab } from "@/components/superuser/registrations-tab"
import type {
  SuperadminTab,
  Tenant,
  User,
  TenantStats,
  NewTenantForm,
  NewUserForm,
  EditUserForm,
} from "@/components/superuser/types"

const getOneMonthExpiry = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split("T")[0]
}

const createInitialTenantForm = (): NewTenantForm => ({
  cccCode: "",
  cccName: "",
  spreadsheetId: "",
  contactPerson: "",
  mobileNumber: "",
})

const createInitialUserForm = (cccCode = ""): NewUserForm => ({
  username: "",
  password: "",
  role: "admin",
  cccCode,
  name: "",
  agencies: "",
  subscriptionStatus: "active",
  subscriptionExpiresAt: getOneMonthExpiry(),
  bypassSubscription: false,
})

export function SuperuserDashboard() {
  const [activeTab, setActiveTab] = useState<SuperadminTab>("revenue_analytics")
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

  // Shared Password Visibility Map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
  const [showAllPasswords, setShowAllPasswords] = useState(false)

  // Form feedback messages
  const [tenantMsg, setTenantMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [userMsg, setUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Modal & submission states
  const [showAddTenantModal, setShowAddTenantModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [submittingTenant, setSubmittingTenant] = useState(false)
  const [submittingUser, setSubmittingUser] = useState(false)
  const [submittingEditUser, setSubmittingEditUser] = useState(false)
  const [pendingDeleteUser, setPendingDeleteUser] = useState<{ id: string; username: string } | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  // Form values
  const [newTenant, setNewTenant] = useState<NewTenantForm>(createInitialTenantForm)
  const [newUser, setNewUser] = useState<NewUserForm>(() => createInitialUserForm())
  const [editForm, setEditForm] = useState<EditUserForm>({
    id: "",
    username: "",
    name: "",
    password: "",
    role: "",
    cccCode: "",
    agencies: "",
    subscriptionStatus: "active",
    subscriptionExpiresAt: "",
    bypassSubscription: false,
  })

  // Auto-adjust default subscription values when role changes in Add User modal
  useEffect(() => {
    if (newUser.role === "admin") {
      setNewUser((prev) => ({
        ...prev,
        subscriptionStatus: "active",
        subscriptionExpiresAt: prev.subscriptionExpiresAt || getOneMonthExpiry(),
      }))
    } else if (newUser.role === "superuser" || newUser.role === "monitor") {
      setNewUser((prev) => ({
        ...prev,
        subscriptionStatus: "active",
        subscriptionExpiresAt: "",
        bypassSubscription: true,
      }))
    }
  }, [newUser.role])

  // --- API FETCHERS ---
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
        setStats((prev) => ({ ...prev, ...data }))
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
      // Ignore background summary error
    }
  }

  const fetchOnlineCount = async () => {
    try {
      const res = await fetch("/api/superuser/online-users", { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        const count = typeof d?.activeNowCount === "number" ? d.activeNowCount : d?.totalOnline
        if (typeof count === "number") {
          setOnlineUserCount(count)
        }
      }
    } catch {
      // Ignore background online count error
    }
  }

  // Explicit user-triggered load so no heavy Google Sheets calls run on mount
  const loadDashboardData = async () => {
    setHasLoadedData(true)
    await Promise.all([
      fetchTenants(),
      fetchUsers(),
      fetchStats(),
      fetchOnlineCount(),
      fetchVercelSummary(),
    ])
  }

  const handleTabChange = (tab: SuperadminTab) => {
    setActiveTab(tab)
    if (!hasLoadedData && (tab === "overview" || tab === "registrations")) {
      loadDashboardData()
    } else if (tab === "online_users" && onlineUserCount === null) {
      fetchOnlineCount()
    } else if (tab === "vercel_usage" && vercelSpikeCount === null) {
      fetchVercelSummary()
    }
  }

  // Modal openers (auto-load tenant list if needed and reset stale form alerts)
  const openAddTenantModal = () => {
    setTenantMsg(null)
    setShowAddTenantModal(true)
  }

  const openAddUserModal = (preselectCcc = "") => {
    setUserMsg(null)
    setNewUser(createInitialUserForm(preselectCcc))
    if (tenants.length === 0 && !loadingTenants) {
      fetchTenants()
    }
    setShowAddUserModal(true)
  }

  const openBroadcastModal = () => {
    if (tenants.length === 0 && !loadingTenants) {
      fetchTenants()
    }
    setShowBroadcastModal(true)
  }

  // --- CRUD HANDLERS ---
  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantMsg(null)
    if (!newTenant.cccCode.trim() || !newTenant.cccName.trim()) {
      setTenantMsg({ type: "error", text: "CCC Code and Name are required." })
      return
    }
    setSubmittingTenant(true)
    try {
      const normalizedTenant = {
        ...newTenant,
        cccCode: newTenant.cccCode.trim().toUpperCase(),
        cccName: newTenant.cccName.trim(),
      }
      const res = await fetch("/api/superuser/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedTenant),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Care Center Registered",
          description: `${normalizedTenant.cccCode} (${normalizedTenant.cccName}) added successfully.`,
        })
        setNewTenant(createInitialTenantForm())
        setShowAddTenantModal(false)
        setHasLoadedData(true)
        await Promise.all([fetchTenants(), fetchStats()])
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
      setUserMsg({ type: "error", text: "All required fields must be filled." })
      return
    }
    setSubmittingUser(true)
    try {
      const payload = {
        ...newUser,
        agencies: newUser.agencies
          ? newUser.agencies
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
          : [],
      }
      const res = await fetch("/api/superuser/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Account Created",
          description: `Provisioned login '${newUser.username}' under ${newUser.cccCode}.`,
        })
        setNewUser(createInitialUserForm())
        setShowAddUserModal(false)
        setHasLoadedData(true)
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
      bypassSubscription: !!u.bypassSubscription,
    })
    if (tenants.length === 0 && !loadingTenants) {
      fetchTenants()
    }
    setShowEditUserModal(true)
  }

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editForm.username.trim() || !editForm.role || !editForm.cccCode) {
      toast({
        variant: "destructive",
        title: "Missing Required Fields",
        description: "Username, role, and CCC code are required.",
      })
      return
    }
    setSubmittingEditUser(true)
    try {
      const payload: Record<string, unknown> = {
        ...editForm,
        agencies: editForm.agencies
          ? editForm.agencies
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
          : [],
      }
      if (!editForm.password) {
        delete payload.password
      }
      const res = await fetch("/api/superuser/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setShowEditUserModal(false)
        toast({ title: "User Updated", description: `Saved changes for ${editForm.username}.` })
        await fetchUsers()
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: data.error || "Failed to update user.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err?.message || "Failed to update user.",
      })
    } finally {
      setSubmittingEditUser(false)
    }
  }

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return
    const { id, username } = pendingDeleteUser
    setDeletingUserId(id)
    try {
      const res = await fetch(`/api/superuser/users?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: "User Deleted", description: `Removed access for '${username}'.` })
        setPendingDeleteUser(null)
        await fetchUsers()
      } else {
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: data.error || "Failed to delete user.",
        })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Network error deleting user.",
      })
    } finally {
      setDeletingUserId(null)
    }
  }

  // --- DERIVED MAPS ---
  const { usersByCcc, agenciesByCcc, registrationCount } = useMemo(() => {
    const uMap: Record<string, User[]> = {}
    const aMap: Record<string, Set<string>> = {}

    users.forEach((u) => {
      const code = (u.cccCode || "SYSTEM").toUpperCase()
      if (!uMap[code]) uMap[code] = []
      uMap[code].push(u)

      if (!aMap[code]) aMap[code] = new Set()
      if (Array.isArray(u.agencies)) {
        u.agencies.forEach((a) => {
          if (a && a.trim()) aMap[code].add(a.trim().toUpperCase())
        })
      }
    })

    const regCount = tenants.filter((t) =>
      Boolean(t.createdAt || t.contactPerson || t.mobileNumber)
    ).length

    return { usersByCcc: uMap, agenciesByCcc: aMap, registrationCount: regCount }
  }, [users, tenants])

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [userId]: !prev[userId] }))
  }

  return (
    <>
      <SuperuserShell
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasLoadedData={hasLoadedData}
        isLoadingData={loadingTenants || loadingUsers || loadingStats}
        tenantCount={tenants.length}
        registrationCount={registrationCount}
        onlineUserCount={onlineUserCount}
        vercelSpikeCount={vercelSpikeCount}
        masterSheetId={masterSheetId}
        onLoadData={loadDashboardData}
        onOpenAddTenant={openAddTenantModal}
        onOpenAddUser={() => openAddUserModal()}
        onOpenBroadcast={openBroadcastModal}
      >
        <div key={activeTab} className="animate-tab-enter">
          {activeTab === "overview" && (
            <CareCentersTab
              hasLoadedData={hasLoadedData}
              loadingTenants={loadingTenants}
              loadingUsers={loadingUsers}
              loadingStats={loadingStats}
              tenants={tenants}
              users={users}
              stats={stats}
              usersByCcc={usersByCcc}
              agenciesByCcc={agenciesByCcc}
              vercelSpikeCount={vercelSpikeCount}
              visiblePasswords={visiblePasswords}
              showAllPasswords={showAllPasswords}
              onTogglePasswordVisibility={togglePasswordVisibility}
              onToggleShowAllPasswords={() => setShowAllPasswords((prev) => !prev)}
              onLoadData={loadDashboardData}
              onOpenAddTenant={openAddTenantModal}
              onOpenAddUserForCcc={(cccCode) => openAddUserModal(cccCode || "")}
              onEditUser={startEditUser}
              onDeleteUser={(id, username) => setPendingDeleteUser({ id, username })}
              onGoToVercel={() => handleTabChange("vercel_usage")}
              onGoToRevenue={() => handleTabChange("revenue_analytics")}
            />
          )}

          {activeTab === "registrations" && (
            <RegistrationsTab
              hasLoadedData={hasLoadedData}
              loading={loadingTenants || loadingUsers}
              tenants={tenants}
              usersByCcc={usersByCcc}
              visiblePasswords={visiblePasswords}
              showAllPasswords={showAllPasswords}
              onTogglePasswordVisibility={togglePasswordVisibility}
              onToggleShowAllPasswords={() => setShowAllPasswords((prev) => !prev)}
              onRefresh={loadDashboardData}
            />
          )}

          {activeTab === "revenue_analytics" && (
            <SuperuserRevenueAnalytics onBackToDashboard={() => handleTabChange("overview")} />
          )}

          {activeTab === "subscriptions" && (
            <SuperuserSubscriptions onBackToDashboard={() => handleTabChange("overview")} />
          )}

          {activeTab === "agency_tracker" && (
            <AgencyProfileTracker onBackToDashboard={() => handleTabChange("overview")} />
          )}

          {activeTab === "online_users" && (
            <SuperuserOnlineUsers
              onBackToDashboard={() => handleTabChange("overview")}
              onCountChange={(count) => setOnlineUserCount(count)}
            />
          )}

          {activeTab === "module_versions" && (
            <SupplyModuleVersionsReport onBackToDashboard={() => handleTabChange("overview")} />
          )}

          {activeTab === "vercel_usage" && (
            <VercelUsageMonitor
              onBackToDashboard={() => handleTabChange("overview")}
              onSpikesChange={(count) => setVercelSpikeCount(count)}
            />
          )}
        </div>
      </SuperuserShell>

      {/* Unified Light-Themed CRUD & Confirmation Modals */}
      <SuperuserModals
        tenants={tenants}
        showAddTenantModal={showAddTenantModal}
        onAddTenantOpenChange={(open) => {
          setShowAddTenantModal(open)
          if (!open) setTenantMsg(null)
        }}
        newTenant={newTenant}
        setNewTenant={setNewTenant}
        tenantMsg={tenantMsg}
        submittingTenant={submittingTenant}
        onAddTenantSubmit={handleAddTenant}
        showAddUserModal={showAddUserModal}
        onAddUserOpenChange={(open) => {
          setShowAddUserModal(open)
          if (!open) setUserMsg(null)
        }}
        newUser={newUser}
        setNewUser={setNewUser}
        userMsg={userMsg}
        submittingUser={submittingUser}
        onAddUserSubmit={handleAddUser}
        showEditUserModal={showEditUserModal}
        onEditUserOpenChange={setShowEditUserModal}
        editForm={editForm}
        setEditForm={setEditForm}
        submittingEditUser={submittingEditUser}
        onEditUserSubmit={handleEditUserSubmit}
        pendingDeleteUser={pendingDeleteUser}
        onCancelDeleteUser={() => setPendingDeleteUser(null)}
        deletingUserId={deletingUserId}
        onConfirmDeleteUser={confirmDeleteUser}
      />

      {/* Broadcast Push Alert Modal */}
      <BroadcastPushModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        isSuperuser={true}
        tenants={tenants}
      />

      {/* Push Notification Permission Manager */}
      <PushNotificationManager />
    </>
  )
}

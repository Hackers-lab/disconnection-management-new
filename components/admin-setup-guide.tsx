"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ShieldAlert, CheckCircle2, User, Building2, ChevronRight, X, Loader2, Sparkles, Search, Check, Save } from "lucide-react"

interface IncompleteAgency {
  id: string
  name: string
  vendorCode: string
  contactPerson: string
  mobileNumber: string
  email: string
  cccCode: string
  missingFields: string[]
}

interface IncompleteUser {
  id: string
  username: string
  fullName: string
  email: string
  mobileNumber: string
  role: string
  cccCode: string
  missingFields: string[]
}

interface SetupData {
  hasIncompleteDetails: boolean
  completionPercentage: number
  totalCheckItems: number
  incompleteItemsCount: number
  incompleteUsers: IncompleteUser[]
  incompleteAgencies: IncompleteAgency[]
}

export function AdminSetupGuideBanner() {
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("admin_setup_guide_dismissed") === "true"
    }
    return false
  })
  const [activeTab, setActiveTab] = useState<"agencies" | "users">("agencies")
  const [searchQuery, setSearchQuery] = useState("")
  const [savedSuccessIds, setSavedSuccessIds] = useState<Set<string>>(new Set())

  // Form states
  const [usersForm, setUsersForm] = useState<Record<string, { fullName: string; mobileNumber: string; email: string; username: string }>>({})
  const [agenciesForm, setAgenciesForm] = useState<Record<string, { vendorCode: string; contactPerson: string; mobileNumber: string; email: string }>>({})

  const populateFormsFromData = (data: SetupData) => {
    if (data.incompleteUsers) {
      const userObj: Record<string, any> = {}
      data.incompleteUsers.forEach(u => {
        userObj[u.id] = {
          username: u.username || "",
          fullName: u.fullName || "",
          mobileNumber: u.mobileNumber || "",
          email: u.email || "",
        }
      })
      setUsersForm(userObj)
    }

    if (data.incompleteAgencies) {
      const agencyObj: Record<string, any> = {}
      data.incompleteAgencies.forEach(a => {
        agencyObj[a.id] = {
          vendorCode: a.vendorCode || "",
          contactPerson: a.contactPerson || "",
          mobileNumber: a.mobileNumber || "",
          email: a.email || "",
        }
      })
      setAgenciesForm(agencyObj)
    }
  }

  const fetchCheck = useCallback(async (force = false) => {
    if (typeof window !== "undefined") {
      // Check if already completed or dismissed in this session
      if (!force) {
        if (sessionStorage.getItem("admin_setup_guide_dismissed") === "true") {
          setDismissed(true)
          setLoading(false)
          return
        }
        if (sessionStorage.getItem("profile_completion_completed") === "true") {
          setLoading(false)
          return
        }
        const cached = sessionStorage.getItem("profile_completion_data")
        if (cached) {
          try {
            const data: SetupData = JSON.parse(cached)
            setSetupData(data)
            populateFormsFromData(data)
            setLoading(false)
            return
          } catch {
            sessionStorage.removeItem("profile_completion_data")
          }
        }
      }
    }

    try {
      setLoading(true)
      const res = await fetch("/api/admin/profile-completion-check")
      if (!res.ok) return
      const data: SetupData = await res.json()
      setSetupData(data)

      if (typeof window !== "undefined") {
        if (!data.hasIncompleteDetails) {
          sessionStorage.setItem("profile_completion_completed", "true")
          sessionStorage.removeItem("profile_completion_data")
        } else {
          sessionStorage.setItem("profile_completion_data", JSON.stringify(data))
          sessionStorage.removeItem("profile_completion_completed")
        }
      }

      populateFormsFromData(data)
    } catch (err) {
      console.warn("Failed to load setup check:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCheck()
  }, [fetchCheck])

  // Filtered lists
  const filteredAgencies = useMemo(() => {
    if (!setupData) return []
    return setupData.incompleteAgencies.filter(a => {
      if (savedSuccessIds.has(a.id)) return false
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (agenciesForm[a.id]?.vendorCode || "").includes(searchQuery) ||
        (agenciesForm[a.id]?.mobileNumber || "").includes(searchQuery)
      return matchesSearch
    })
  }, [setupData, searchQuery, agenciesForm, savedSuccessIds])

  const filteredUsers = useMemo(() => {
    if (!setupData) return []
    return setupData.incompleteUsers.filter(u => {
      if (savedSuccessIds.has(u.id)) return false
      const matchesSearch =
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (usersForm[u.id]?.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (usersForm[u.id]?.mobileNumber || "").includes(searchQuery)
      return matchesSearch
    })
  }, [setupData, searchQuery, usersForm, savedSuccessIds])

  if (loading || !setupData || !setupData.hasIncompleteDetails || dismissed) {
    return null
  }

  // Save a single agency card
  const handleSaveAgency = async (agencyId: string) => {
    const aState = agenciesForm[agencyId]
    if (!aState) return

    const vc = (aState.vendorCode || "").trim()
    const mob = (aState.mobileNumber || "").trim()

    if (!/^\d{6}$/.test(vc) || !/^\d{10}$/.test(mob)) return

    try {
      setSavingId(agencyId)
      const res = await fetch("/api/admin/profile-completion-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyUpdates: [{ id: agencyId, ...aState }],
        }),
      })

      if (!res.ok) throw new Error("Save agency failed")

      setSavedSuccessIds(prev => new Set(prev).add(agencyId))
      await fetchCheck(true)
    } catch (err) {
      console.error("Failed to save agency:", err)
    } finally {
      setSavingId(null)
    }
  }

  // Save a single user card
  const handleSaveUser = async (userId: string) => {
    const uState = usersForm[userId]
    if (!uState) return

    const mob = (uState.mobileNumber || "").trim()
    if (!/^\d{10}$/.test(mob)) return

    try {
      setSavingId(userId)
      const res = await fetch("/api/admin/profile-completion-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUpdates: [{ id: userId, ...uState }],
        }),
      })

      if (!res.ok) throw new Error("Save user failed")

      setSavedSuccessIds(prev => new Set(prev).add(userId))
      await fetchCheck(true)
    } catch (err) {
      console.error("Failed to save user:", err)
    } finally {
      setSavingId(null)
    }
  }

  // Save all valid items in batch
  const handleSaveAllValid = async () => {
    const validAgencyUpdates: any[] = []
    Object.entries(agenciesForm).forEach(([id, val]) => {
      const vc = (val.vendorCode || "").trim()
      const mob = (val.mobileNumber || "").trim()
      if (/^\d{6}$/.test(vc) && /^\d{10}$/.test(mob)) {
        validAgencyUpdates.push({ id, ...val })
      }
    })

    const validUserUpdates: any[] = []
    Object.entries(usersForm).forEach(([id, val]) => {
      const mob = (val.mobileNumber || "").trim()
      if (/^\d{10}$/.test(mob)) {
        validUserUpdates.push({ id, ...val })
      }
    })

    if (validAgencyUpdates.length === 0 && validUserUpdates.length === 0) return

    try {
      setSavingAll(true)
      const res = await fetch("/api/admin/profile-completion-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUpdates: validUserUpdates,
          agencyUpdates: validAgencyUpdates,
        }),
      })

      if (!res.ok) throw new Error("Batch save failed")

      await fetchCheck(true)
      setIsOpen(false)
    } catch (err) {
      console.error("Failed to batch save:", err)
    } finally {
      setSavingAll(false)
    }
  }

  return (
    <>
      {/* Top Banner Bar */}
      <div className="mb-6 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 p-4 shadow-sm backdrop-blur-md dark:border-amber-500/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                  Mobile Number & Agency SAP Vendor Code Setup ({setupData.completionPercentage}% Complete)
                </h4>
                <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                  ⏳ Deadline: 01-09-2026
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {setupData.incompleteItemsCount} Item{setupData.incompleteItemsCount > 1 ? "s" : ""} Need Attention
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                To prepare for mobile login and automated list assignments, please enter <strong>6-digit SAP vendor codes for contractor agencies</strong> and <strong>10-digit mobile numbers for officers & staff</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-amber-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Complete Setup
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setDismissed(true)
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("admin_setup_guide_dismissed", "true")
                }
              }}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
              title="Dismiss for now"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Setup Drawer / Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900 dark:border dark:border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    CCC Profile & Agency Setup
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Save individual items as you enter details. Mandatory fields are marked with red asterisks (*).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Tabs & Search Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 px-6 py-3 bg-gray-50/50 gap-3 dark:bg-gray-800/20 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab("agencies")}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    activeTab === "agencies"
                      ? "bg-amber-500 text-white shadow-sm dark:bg-amber-600"
                      : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Contractor Agencies ({setupData.incompleteAgencies.length})
                </button>
                <button
                  onClick={() => setActiveTab("users")}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    activeTab === "users"
                      ? "bg-amber-500 text-white shadow-sm dark:bg-amber-600"
                      : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  <User className="h-4 w-4" />
                  CCC Officers & Staff ({setupData.incompleteUsers.length})
                </button>
              </div>

              {/* Search Filter */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab === "agencies" ? "agencies" : "officers"}...`}
                  className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[55vh]">
              {/* Tab 1: Contractor Agencies */}
              {activeTab === "agencies" && (
                <div className="space-y-4">
                  {filteredAgencies.length === 0 ? (
                    <div className="text-center py-8 text-xs text-gray-500 dark:text-gray-400">
                      No matching agencies found needing attention.
                    </div>
                  ) : (
                    filteredAgencies.map((agency) => {
                      const aState = agenciesForm[agency.id] || { vendorCode: "", contactPerson: "", mobileNumber: "", email: "" }
                      const vcVal = (aState.vendorCode || "").trim()
                      const mobVal = (aState.mobileNumber || "").trim()
                      const isVcValid = /^\d{6}$/.test(vcVal)
                      const isMobValid = /^\d{10}$/.test(mobVal)
                      const isCardReady = isVcValid && isMobValid
                      const isSaving = savingId === agency.id
                      const isJustSaved = savedSuccessIds.has(agency.id)

                      return (
                        <div
                          key={agency.id}
                          className={`rounded-xl border p-4 transition-all ${
                            isJustSaved
                              ? "border-emerald-500/50 bg-emerald-50/20 dark:border-emerald-500/30"
                              : isCardReady
                              ? "border-amber-500/40 bg-amber-50/20 dark:border-amber-500/30"
                              : "border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h5 className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                {agency.name}
                              </h5>
                              <span className="text-[10px] text-gray-400">({agency.cccCode})</span>
                              {isCardReady && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <Check className="h-3 w-3" /> Ready to Save
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSaveAgency(agency.id)}
                              disabled={!isCardReady || isSaving}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                isCardReady
                                  ? "bg-amber-600 text-white shadow-sm hover:bg-amber-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
                                  : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600"
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isJustSaved ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                              ) : (
                                <Save className="h-3 w-3" />
                              )}
                              {isJustSaved ? "Saved" : "Save Item"}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                                Vendor Code (6-Digit) <span className="text-red-500 font-bold">*</span>
                              </label>
                              <input
                                type="text"
                                maxLength={6}
                                value={aState.vendorCode}
                                onChange={e => setAgenciesForm({
                                  ...agenciesForm,
                                  [agency.id]: { ...aState, vendorCode: e.target.value.replace(/\D/g, "") }
                                })}
                                placeholder="e.g. 104921"
                                className={`mt-1 w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-gray-100 ${
                                  !isVcValid ? "border-red-500 ring-1 ring-red-500/50" : "border-gray-300 focus:border-amber-500 dark:border-gray-700"
                                }`}
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                                Mobile Number (10-Digit) <span className="text-red-500 font-bold">*</span>
                              </label>
                              <input
                                type="text"
                                maxLength={10}
                                value={aState.mobileNumber}
                                onChange={e => setAgenciesForm({
                                  ...agenciesForm,
                                  [agency.id]: { ...aState, mobileNumber: e.target.value.replace(/\D/g, "") }
                                })}
                                placeholder="10-digit mobile number"
                                className={`mt-1 w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-gray-100 ${
                                  !isMobValid ? "border-red-500 ring-1 ring-red-500/50" : "border-gray-300 focus:border-amber-500 dark:border-gray-700"
                                }`}
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Contact Person Name</label>
                              <input
                                type="text"
                                value={aState.contactPerson}
                                onChange={e => setAgenciesForm({
                                  ...agenciesForm,
                                  [agency.id]: { ...aState, contactPerson: e.target.value }
                                })}
                                placeholder="Contact Person Name"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Email Address</label>
                              <input
                                type="email"
                                value={aState.email}
                                onChange={e => setAgenciesForm({
                                  ...agenciesForm,
                                  [agency.id]: { ...aState, email: e.target.value }
                                })}
                                placeholder="agency@example.com"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Tab 2: CCC Officers & Staff */}
              {activeTab === "users" && (
                <div className="space-y-4">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-xs text-gray-500 dark:text-gray-400">
                      No matching officers found needing attention.
                    </div>
                  ) : (
                    filteredUsers.map((usr) => {
                      const uState = usersForm[usr.id] || { fullName: "", mobileNumber: "", email: "", username: usr.username }
                      const mobVal = (uState.mobileNumber || "").trim()
                      const isMobValid = /^\d{10}$/.test(mobVal)
                      const isSaving = savingId === usr.id
                      const isJustSaved = savedSuccessIds.has(usr.id)

                      return (
                        <div
                          key={usr.id}
                          className={`rounded-xl border p-4 transition-all ${
                            isJustSaved
                              ? "border-emerald-500/50 bg-emerald-50/20 dark:border-emerald-500/30"
                              : isMobValid
                              ? "border-amber-500/40 bg-amber-50/20 dark:border-amber-500/30"
                              : "border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h5 className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                {usr.username}
                              </h5>
                              <span className="text-[10px] text-gray-400 font-medium font-mono">[{usr.role.toUpperCase()}]</span>
                              <span className="text-[10px] text-gray-400">({usr.cccCode})</span>
                              {isMobValid && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <Check className="h-3 w-3" /> Ready to Save
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSaveUser(usr.id)}
                              disabled={!isMobValid || isSaving}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                isMobValid
                                  ? "bg-amber-600 text-white shadow-sm hover:bg-amber-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
                                  : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600"
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isJustSaved ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                              ) : (
                                <Save className="h-3 w-3" />
                              )}
                              {isJustSaved ? "Saved" : "Save Item"}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Full Name</label>
                              <input
                                type="text"
                                value={uState.fullName}
                                onChange={e => setUsersForm({
                                  ...usersForm,
                                  [usr.id]: { ...uState, fullName: e.target.value }
                                })}
                                placeholder="Officer Full Name"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                                Mobile Number (10-Digit) <span className="text-red-500 font-bold">*</span>
                              </label>
                              <input
                                type="text"
                                maxLength={10}
                                value={uState.mobileNumber}
                                onChange={e => setUsersForm({
                                  ...usersForm,
                                  [usr.id]: { ...uState, mobileNumber: e.target.value.replace(/\D/g, "") }
                                })}
                                placeholder="10-digit mobile number"
                                className={`mt-1 w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-gray-100 ${
                                  !isMobValid ? "border-red-500 ring-1 ring-red-500/50" : "border-gray-300 focus:border-amber-500 dark:border-gray-700"
                                }`}
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Email Address</label>
                              <input
                                type="email"
                                value={uState.email}
                                onChange={e => setUsersForm({
                                  ...usersForm,
                                  [usr.id]: { ...uState, email: e.target.value }
                                })}
                                placeholder="officer@wbsedcl.in"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                You can save cards individually or batch save all completed items.
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllValid}
                  disabled={savingAll}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  {savingAll ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving Valid Items...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Save All Valid Items
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

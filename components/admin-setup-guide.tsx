"use client"

import { useState, useEffect, useCallback } from "react"
import { ShieldAlert, CheckCircle2, User, Building2, ChevronRight, X, Loader2, Sparkles } from "lucide-react"

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

interface UserProfileData {
  id: string
  username: string
  fullName: string
  email: string
  mobileNumber: string
  missingFields: string[]
}

interface SetupData {
  hasIncompleteDetails: boolean
  completionPercentage: number
  totalCheckItems: number
  incompleteItemsCount: number
  userProfile: UserProfileData | null
  incompleteAgencies: IncompleteAgency[]
}

export function AdminSetupGuideBanner() {
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Form states
  const [userForm, setUserForm] = useState({
    fullName: "",
    mobileNumber: "",
    email: "",
  })
  const [agenciesForm, setAgenciesForm] = useState<Record<string, { vendorCode: string; contactPerson: string; mobileNumber: string; email: string }>>({})

  const fetchCheck = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/profile-completion-check")
      if (!res.ok) return
      const data: SetupData = await res.json()
      setSetupData(data)

      if (data.userProfile) {
        setUserForm({
          fullName: data.userProfile.fullName || "",
          mobileNumber: data.userProfile.mobileNumber || "",
          email: data.userProfile.email || "",
        })
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
    } catch (err) {
      console.warn("Failed to load setup check:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCheck()
  }, [fetchCheck])

  if (loading || !setupData || !setupData.hasIncompleteDetails || dismissed) {
    return null
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const agencyUpdates = Object.entries(agenciesForm).map(([id, val]) => ({
        id,
        ...val,
      }))

      const res = await fetch("/api/admin/profile-completion-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUpdates: setupData.userProfile ? {
            id: setupData.userProfile.id,
            ...userForm,
          } : null,
          agencyUpdates,
        }),
      })

      if (!res.ok) throw new Error("Save failed")

      await fetchCheck()
      setIsOpen(false)
    } catch (err) {
      console.error("Failed to save setup updates:", err)
    } finally {
      setSaving(false)
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
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                  Tenant Profile Setup ({setupData.completionPercentage}% Complete)
                </h4>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {setupData.incompleteItemsCount} Item{setupData.incompleteItemsCount > 1 ? "s" : ""} Need Attention
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                Please complete missing contact details for contractor agencies and officer profiles for seamless field operations.
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
              onClick={() => setDismissed(true)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
              title="Dismiss for now"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Fill Drawer / Dialog Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900 dark:border dark:border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Complete Admin & Agency Details
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fill in missing vendor codes, contact persons, and phone numbers for your CCC.
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

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* User Profile Section */}
              {setupData.userProfile && setupData.userProfile.missingFields.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    <User className="h-4 w-4 text-amber-500" />
                    Officer Account ({setupData.userProfile.username})
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Full Name</label>
                      <input
                        type="text"
                        value={userForm.fullName}
                        onChange={e => setUserForm({ ...userForm, fullName: e.target.value })}
                        placeholder="Officer Full Name"
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Mobile Number</label>
                      <input
                        type="text"
                        value={userForm.mobileNumber}
                        onChange={e => setUserForm({ ...userForm, mobileNumber: e.target.value })}
                        placeholder="10-digit mobile"
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Email Address</label>
                      <input
                        type="email"
                        value={userForm.email}
                        onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                        placeholder="officer@wbsedcl.in"
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Contractor Agencies Section */}
              {setupData.incompleteAgencies.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    <Building2 className="h-4 w-4 text-amber-500" />
                    Contractor Agencies ({setupData.incompleteAgencies.length})
                  </div>
                  {setupData.incompleteAgencies.map((agency) => (
                    <div key={agency.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                      <h5 className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-2">
                        {agency.name} <span className="text-gray-400 font-normal">({agency.cccCode})</span>
                      </h5>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Vendor Code</label>
                          <input
                            type="text"
                            value={agenciesForm[agency.id]?.vendorCode || ""}
                            onChange={e => setAgenciesForm({
                              ...agenciesForm,
                              [agency.id]: { ...(agenciesForm[agency.id] || {}), vendorCode: e.target.value }
                            })}
                            placeholder="e.g. VEND-10492"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Contact Person Name</label>
                          <input
                            type="text"
                            value={agenciesForm[agency.id]?.contactPerson || ""}
                            onChange={e => setAgenciesForm({
                              ...agenciesForm,
                              [agency.id]: { ...(agenciesForm[agency.id] || {}), contactPerson: e.target.value }
                            })}
                            placeholder="Contact Person Full Name"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Mobile Number</label>
                          <input
                            type="text"
                            value={agenciesForm[agency.id]?.mobileNumber || ""}
                            onChange={e => setAgenciesForm({
                              ...agenciesForm,
                              [agency.id]: { ...(agenciesForm[agency.id] || {}), mobileNumber: e.target.value }
                            })}
                            placeholder="10-digit mobile number"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Email Address</label>
                          <input
                            type="email"
                            value={agenciesForm[agency.id]?.email || ""}
                            onChange={e => setAgenciesForm({
                              ...agenciesForm,
                              [agency.id]: { ...(agenciesForm[agency.id] || {}), email: e.target.value }
                            })}
                            placeholder="agency@example.com"
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving to Turso...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save & Complete Setup
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

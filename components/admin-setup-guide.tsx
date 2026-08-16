"use client"

import { useState, useEffect, useCallback } from "react"
import { ShieldAlert, CheckCircle2, User, Building2, ChevronRight, X, Loader2, Sparkles, AlertCircle } from "lucide-react"

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
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])

  // Form states
  const [usersForm, setUsersForm] = useState<Record<string, { fullName: string; mobileNumber: string; email: string; username: string }>>({})
  const [agenciesForm, setAgenciesForm] = useState<Record<string, { vendorCode: string; contactPerson: string; mobileNumber: string; email: string }>>({})

  const fetchCheck = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/profile-completion-check")
      if (!res.ok) return
      const data: SetupData = await res.json()
      setSetupData(data)

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

  const validateForms = (): boolean => {
    const errors: string[] = []

    // Validate agencies
    Object.entries(agenciesForm).forEach(([id, val]) => {
      const agencyName = setupData.incompleteAgencies.find(a => a.id === id)?.name || "Agency"
      const vc = (val.vendorCode || "").trim()
      const mob = (val.mobileNumber || "").trim()

      if (!vc) {
        errors.push(`${agencyName}: Vendor Code is required.`)
      } else if (!/^\d{6}$/.test(vc)) {
        errors.push(`${agencyName}: Vendor Code must be exactly 6 digits (e.g. 104921).`)
      }

      if (!mob) {
        errors.push(`${agencyName}: Mobile Number is required.`)
      } else if (!/^\d{10}$/.test(mob)) {
        errors.push(`${agencyName}: Mobile Number must be 10 digits.`)
      }
    })

    // Validate users
    Object.entries(usersForm).forEach(([id, val]) => {
      const username = setupData.incompleteUsers.find(u => u.id === id)?.username || "Officer"
      const mob = (val.mobileNumber || "").trim()

      if (!mob) {
        errors.push(`Officer (${username}): Mobile Number is required.`)
      } else if (!/^\d{10}$/.test(mob)) {
        errors.push(`Officer (${username}): Mobile Number must be 10 digits.`)
      }
    })

    setFormErrors(errors)
    return errors.length === 0
  }

  const handleSave = async () => {
    if (!validateForms()) return

    try {
      setSaving(true)
      const userUpdates = Object.entries(usersForm).map(([id, val]) => ({
        id,
        ...val,
      }))
      const agencyUpdates = Object.entries(agenciesForm).map(([id, val]) => ({
        id,
        ...val,
      }))

      const res = await fetch("/api/admin/profile-completion-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUpdates,
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
                Please complete missing 6-digit Vendor Codes and 10-digit Mobile Numbers for agencies & officers in your Customer Care Center.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <button
              onClick={() => { setFormErrors([]); setIsOpen(true); }}
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
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900 dark:border dark:border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Complete CCC Officer & Agency Details
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Enter mandatory 6-digit vendor codes and 10-digit mobile numbers for your CCC.
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

            {/* Form Validation Errors */}
            {formErrors.length > 0 && (
              <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  Please correct the following errors:
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {formErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* CCC Officers Section */}
              {setupData.incompleteUsers.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    <User className="h-4 w-4 text-amber-500" />
                    CCC Officers & Staff Accounts ({setupData.incompleteUsers.length})
                  </div>
                  {setupData.incompleteUsers.map((usr) => {
                    const uState = usersForm[usr.id] || { fullName: "", mobileNumber: "", email: "", username: usr.username }
                    const mobVal = (uState.mobileNumber || "").trim()
                    const isMobValid = /^\d{10}$/.test(mobVal)

                    return (
                      <div key={usr.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                            {usr.username} <span className="text-gray-400 font-normal">({usr.role.toUpperCase()})</span>
                          </h5>
                          <span className="text-[10px] text-gray-400">CCC: {usr.cccCode}</span>
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
                              Mobile Number <span className="text-red-500 font-bold">*</span>
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
                  })}
                </div>
              )}

              {/* Contractor Agencies Section */}
              {setupData.incompleteAgencies.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    <Building2 className="h-4 w-4 text-amber-500" />
                    Contractor Agencies ({setupData.incompleteAgencies.length})
                  </div>
                  {setupData.incompleteAgencies.map((agency) => {
                    const aState = agenciesForm[agency.id] || { vendorCode: "", contactPerson: "", mobileNumber: "", email: "" }
                    const vcVal = (aState.vendorCode || "").trim()
                    const mobVal = (aState.mobileNumber || "").trim()
                    const isVcValid = /^\d{6}$/.test(vcVal)
                    const isMobValid = /^\d{10}$/.test(mobVal)

                    return (
                      <div key={agency.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                        <h5 className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-2">
                          {agency.name} <span className="text-gray-400 font-normal">({agency.cccCode})</span>
                        </h5>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Contact Person Name</label>
                            <input
                              type="text"
                              value={aState.contactPerson}
                              onChange={e => setAgenciesForm({
                                ...agenciesForm,
                                [agency.id]: { ...aState, contactPerson: e.target.value }
                              })}
                              placeholder="Contact Person Full Name"
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
                  })}
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

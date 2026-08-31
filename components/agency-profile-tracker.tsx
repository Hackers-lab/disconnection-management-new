"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Building2,
  Phone,
  Hash,
  Search,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  Pencil,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  Users,
  Copy,
  Check
} from "lucide-react"

interface AgencyItem {
  id: number | string
  name: string
  cccId?: number | null
  cccCode: string
  cccName: string
  vendorCode: string | null
  vendorCodeValid: boolean
  mobileNumber: string | null
  mobileNumberValid: boolean
  contactPerson: string | null
  email: string | null
  isActive: boolean
  updatedAt?: string | null
}

interface CCCSummary {
  cccCode: string
  cccName: string
  totalAgencies: number
  fullyCompleted: number
  pending: number
  vendorCodeCompleted: number
  mobileNumberCompleted: number
  completionRate: number
}

interface SummaryData {
  totalAgencies: number
  activeAgencies: number
  inactiveAgencies: number
  fullyCompleted: number
  completionPercentage: number
  totalPending: number
  pendingPercentage: number
  vendorCode: {
    completed: number
    pending: number
    percentage: number
  }
  mobileNumber: {
    completed: number
    pending: number
    percentage: number
  }
  partiallyCompleted: number
  fullyPending: number
  totalCCCs: number
  completedCCCs: number
  pendingCCCs: number
}

interface AgencyProfileTrackerProps {
  onBackToDashboard?: () => void
}

type FilterTab = "all" | "pending" | "completed" | "missing_vendor" | "missing_mobile"
type ViewMode = "by_ccc" | "all_table"

export function AgencyProfileTracker({ onBackToDashboard }: AgencyProfileTrackerProps) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [cccList, setCccList] = useState<CCCSummary[]>([])
  const [agencies, setAgencies] = useState<AgencyItem[]>([])
  const [error, setError] = useState<string | null>(null)

  // Filters & View
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCCC, setSelectedCCC] = useState<string>("all")
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("by_ccc")
  const [expandedCCCs, setExpandedCCCs] = useState<Record<string, boolean>>({})

  // Edit Modal
  const [editingAgency, setEditingAgency] = useState<AgencyItem | null>(null)
  const [editVendorCode, setEditVendorCode] = useState("")
  const [editMobileNumber, setEditMobileNumber] = useState("")
  const [editContactPerson, setEditContactPerson] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null)
  const [copiedNotification, setCopiedNotification] = useState(false)

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/superuser/agency-profile-status", { credentials: "include" })
      if (!res.ok) {
        throw new Error(`Failed to load data (${res.status})`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setSummary(data.summary)
      setCccList(data.cccList || [])
      setAgencies(data.agencies || [])
    } catch (err: any) {
      setError(err.message || "Failed to load agency status")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleEditClick = (agency: AgencyItem) => {
    setEditingAgency(agency)
    setEditVendorCode(agency.vendorCode || "")
    setEditMobileNumber(agency.mobileNumber || "")
    setEditContactPerson(agency.contactPerson || "")
    setEditEmail(agency.email || "")
    setEditSuccessMessage(null)
  }

  const handleSaveEdit = async () => {
    if (!editingAgency) return

    // Quick validations
    const cleanVendor = editVendorCode.trim()
    const cleanMobile = editMobileNumber.trim()

    if (cleanVendor && !/^\d{6}$/.test(cleanVendor)) {
      alert("Vendor code should ideally be a 6-digit number.")
      return
    }

    if (cleanMobile && !/^\d{10}$/.test(cleanMobile)) {
      alert("Mobile number should be a 10-digit number.")
      return
    }

    setSavingEdit(true)
    try {
      const res = await fetch("/api/superuser/agency-profile-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agencyId: editingAgency.id,
          vendorCode: cleanVendor || null,
          mobileNumber: cleanMobile || null,
          contactPerson: editContactPerson.trim() || null,
          email: editEmail.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Update failed")
      }

      setEditSuccessMessage("Agency updated successfully!")
      setTimeout(() => {
        setEditingAgency(null)
        setEditSuccessMessage(null)
      }, 900)

      // Refresh data in background
      fetchData(true)
    } catch (err: any) {
      alert("Error updating agency: " + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleExpandCCC = (code: string) => {
    setExpandedCCCs((prev) => ({ ...prev, [code]: !prev[code] }))
  }

  const expandAllCCCs = () => {
    const next: Record<string, boolean> = {}
    cccList.forEach((c) => {
      next[c.cccCode] = true
    })
    setExpandedCCCs(next)
  }

  const collapseAllCCCs = () => {
    setExpandedCCCs({})
  }

  // Filtered agencies
  const filteredAgencies = useMemo(() => {
    return agencies.filter((a) => {
      // 1. CCC Filter
      if (selectedCCC !== "all" && a.cccCode !== selectedCCC) return false

      // 2. Tab Filter
      const isBoth = a.vendorCodeValid && a.mobileNumberValid
      if (filterTab === "completed" && !isBoth) return false
      if (filterTab === "pending" && isBoth) return false
      if (filterTab === "missing_vendor" && a.vendorCodeValid) return false
      if (filterTab === "missing_mobile" && a.mobileNumberValid) return false

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = a.name.toLowerCase().includes(q)
        const matchCcc = a.cccName.toLowerCase().includes(q) || a.cccCode.toLowerCase().includes(q)
        const matchVendor = String(a.vendorCode || "").toLowerCase().includes(q)
        const matchMobile = String(a.mobileNumber || "").toLowerCase().includes(q)
        const matchPerson = String(a.contactPerson || "").toLowerCase().includes(q)
        return matchName || matchCcc || matchVendor || matchMobile || matchPerson
      }

      return true
    })
  }, [agencies, selectedCCC, filterTab, searchQuery])

  // Grouped by CCC
  const groupedByCCC = useMemo(() => {
    const groups: Record<string, { ccc: CCCSummary; items: AgencyItem[] }> = {}

    // Initialize with filtered or all CCCs
    cccList.forEach((c) => {
      if (selectedCCC === "all" || selectedCCC === c.cccCode) {
        groups[c.cccCode] = { ccc: c, items: [] }
      }
    })

    filteredAgencies.forEach((a) => {
      if (groups[a.cccCode]) {
        groups[a.cccCode].items.push(a)
      } else {
        const foundCcc = cccList.find((c) => c.cccCode === a.cccCode) || {
          cccCode: a.cccCode,
          cccName: a.cccName,
          totalAgencies: 1,
          fullyCompleted: a.vendorCodeValid && a.mobileNumberValid ? 1 : 0,
          pending: a.vendorCodeValid && a.mobileNumberValid ? 0 : 1,
          vendorCodeCompleted: a.vendorCodeValid ? 1 : 0,
          mobileNumberCompleted: a.mobileNumberValid ? 1 : 0,
          completionRate: 0,
        }
        groups[a.cccCode] = { ccc: foundCcc, items: [a] }
      }
    })

    return Object.values(groups).filter((g) => g.items.length > 0)
  }, [cccList, filteredAgencies, selectedCCC])

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      "Agency Name",
      "CCC Code",
      "CCC Name",
      "Vendor Code",
      "Vendor Code Status",
      "Mobile Number",
      "Mobile Number Status",
      "Contact Person",
      "Email",
      "Overall Status",
    ]

    const rows = filteredAgencies.map((a) => [
      `"${a.name.replace(/"/g, '""')}"`,
      `"${a.cccCode}"`,
      `"${a.cccName.replace(/"/g, '""')}"`,
      `"${a.vendorCode || ""}"`,
      a.vendorCodeValid ? "Valid (6-digit)" : "Pending / Invalid",
      `"${a.mobileNumber || ""}"`,
      a.mobileNumberValid ? "Valid (10-digit)" : "Pending / Invalid",
      `"${(a.contactPerson || "").replace(/"/g, '""')}"`,
      `"${(a.email || "").replace(/"/g, '""')}"`,
      a.vendorCodeValid && a.mobileNumberValid ? "Completed" : "Pending",
    ])

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute(
      "download",
      `agency_profile_completion_report_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const copyPendingSummary = () => {
    const pendingList = filteredAgencies.filter((a) => !a.vendorCodeValid || !a.mobileNumberValid)
    const text = `PENDING AGENCY UPDATES REPORT (${pendingList.length} Agencies):\n\n` +
      pendingList
        .map(
          (a, i) =>
            `${i + 1}. ${a.name} [${a.cccName} (${a.cccCode})]: ` +
            (!a.vendorCodeValid ? "Missing 6-Digit Vendor Code; " : `Vendor Code: ${a.vendorCode}; `) +
            (!a.mobileNumberValid ? "Missing 10-Digit Mobile" : `Mobile: ${a.mobileNumber}`)
        )
        .join("\n")

    navigator.clipboard.writeText(text)
    setCopiedNotification(true)
    setTimeout(() => setCopiedNotification(false), 2500)
  }

  if (loading) {
    return (
      <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-12 text-center my-4">
        <div className="flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-700">Loading agency profile completion statistics...</p>
          <p className="text-xs text-slate-400">Scanning contractor agencies, vendor codes, and mobile numbers</p>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-white border-red-200 shadow-sm rounded-2xl p-8 text-center my-4">
        <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <h3 className="text-base font-bold text-slate-900">Failed to load agency status</h3>
          <p className="text-xs text-slate-600">{error}</p>
          <Button onClick={() => fetchData(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 rounded-xl">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Agency Profile Completion Tracker
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                  Live DB
                </Badge>
              </h1>
              <p className="text-xs text-slate-500">
                Track and update 6-digit SAP Vendor Codes and 10-digit Mobile Numbers across all CCCs
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={copyPendingSummary}
            className="text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50"
          >
            {copiedNotification ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                <span>Copy Pending</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            <span>Export CSV</span>
          </Button>

          {onBackToDashboard && (
            <Button
              variant="default"
              size="sm"
              onClick={onBackToDashboard}
              className="text-xs h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white"
            >
              Back to Care Centers
            </Button>
          )}
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Overall Completed */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Overall Completed</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{summary.fullyCompleted}</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                {summary.completionPercentage}%
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              out of {summary.totalAgencies} total agencies
            </p>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${summary.completionPercentage}%` }}
              />
            </div>
          </Card>

          {/* Card 2: Pending / Incomplete */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Pending Updates</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <AlertCircle className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600">{summary.totalPending}</span>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                {summary.pendingPercentage}%
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summary.fullyPending} missing both fields
            </p>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${summary.pendingPercentage}%` }}
              />
            </div>
          </Card>

          {/* Card 3: Vendor Code Status */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Vendor Codes (6-Digit)</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Hash className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{summary.vendorCode.completed}</span>
              <span className="text-xs font-medium text-slate-500">/ {summary.totalAgencies}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="text-blue-600 font-semibold">{summary.vendorCode.percentage}%</span> updated (
              {summary.vendorCode.pending} pending)
            </p>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${summary.vendorCode.percentage}%` }}
              />
            </div>
          </Card>

          {/* Card 4: Mobile Number Status */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Mobile Numbers (10-Digit)</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                <Phone className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{summary.mobileNumber.completed}</span>
              <span className="text-xs font-medium text-slate-500">/ {summary.totalAgencies}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="text-purple-600 font-semibold">{summary.mobileNumber.percentage}%</span> updated (
              {summary.mobileNumber.pending} pending)
            </p>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${summary.mobileNumber.percentage}%` }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <Card className="bg-white border-slate-200/90 shadow-xs rounded-2xl p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search agency name, vendor code, mobile, CCC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9 bg-slate-50/70 border-slate-200 focus:bg-white rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* CCC Select Dropdown */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={selectedCCC}
              onChange={(e) => setSelectedCCC(e.target.value)}
              className="text-xs h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Care Centers ({cccList.length})</option>
              {cccList.map((c) => (
                <option key={c.cccCode} value={c.cccCode}>
                  {c.cccName} ({c.cccCode}) — {c.fullyCompleted}/{c.totalAgencies} Done
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode("by_ccc")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === "by_ccc"
                    ? "bg-white text-blue-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                By Care Center
              </button>
              <button
                onClick={() => setViewMode("all_table")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === "all_table"
                    ? "bg-white text-blue-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Table
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter:
          </span>

          <button
            onClick={() => setFilterTab("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterTab === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({agencies.length})
          </button>

          <button
            onClick={() => setFilterTab("pending")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
              filterTab === "pending"
                ? "bg-amber-600 text-white font-semibold"
                : "bg-amber-50 text-amber-800 border border-amber-200/60 hover:bg-amber-100"
            }`}
          >
            <AlertCircle className="h-3 w-3" />
            Pending Updates ({summary?.totalPending || 0})
          </button>

          <button
            onClick={() => setFilterTab("completed")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
              filterTab === "completed"
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            Fully Completed ({summary?.fullyCompleted || 0})
          </button>

          <button
            onClick={() => setFilterTab("missing_vendor")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterTab === "missing_vendor"
                ? "bg-blue-600 text-white font-semibold"
                : "bg-blue-50 text-blue-800 border border-blue-200/60 hover:bg-blue-100"
            }`}
          >
            Missing Vendor Code ({summary?.vendorCode.pending || 0})
          </button>

          <button
            onClick={() => setFilterTab("missing_mobile")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterTab === "missing_mobile"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-purple-50 text-purple-800 border border-purple-200/60 hover:bg-purple-100"
            }`}
          >
            Missing Mobile ({summary?.mobileNumber.pending || 0})
          </button>

          {viewMode === "by_ccc" && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={expandAllCCCs}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                Expand All
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={collapseAllCCCs}
                className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* VIEW MODE 1: BY CARE CENTER (GROUPED ACCORDION / CARDS) */}
      {viewMode === "by_ccc" && (
        <div className="space-y-3">
          {groupedByCCC.length === 0 ? (
            <Card className="bg-white border-slate-200/90 p-8 text-center rounded-2xl">
              <p className="text-xs text-slate-500">No agencies match your filter criteria.</p>
            </Card>
          ) : (
            groupedByCCC.map(({ ccc, items }) => {
              const isExpanded = expandedCCCs[ccc.cccCode] ?? (filterTab === "pending" || ccc.completionRate < 100)
              const completedInCcc = items.filter((a) => a.vendorCodeValid && a.mobileNumberValid).length
              const pendingInCcc = items.length - completedInCcc
              const is100Percent = items.length > 0 && pendingInCcc === 0

              return (
                <Card
                  key={ccc.cccCode}
                  className={`bg-white border rounded-2xl transition-all shadow-2xs overflow-hidden ${
                    is100Percent ? "border-emerald-200/80" : "border-slate-200/90"
                  }`}
                >
                  {/* CCC Card Header */}
                  <div
                    onClick={() => toggleExpandCCC(ccc.cccCode)}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          is100Percent
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : pendingInCcc > 0 && completedInCcc > 0
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-rose-100 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {ccc.completionRate}%
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">{ccc.cccName}</h3>
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 font-mono">
                            {ccc.cccCode}
                          </Badge>
                          {is100Percent ? (
                            <Badge className="bg-emerald-500 text-white text-[10px] font-semibold">
                              All Complete
                            </Badge>
                          ) : pendingInCcc > 0 ? (
                            <Badge className="bg-amber-500 text-white text-[10px] font-semibold">
                              {pendingInCcc} Pending
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {items.length} {items.length === 1 ? "agency" : "agencies"} ({completedInCcc} complete, {pendingInCcc} pending)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      {/* Mini visual indicator */}
                      <div className="w-24 sm:w-32 bg-slate-100 rounded-full h-2 overflow-hidden hidden xs:block">
                        <div
                          className={`h-2 rounded-full ${is100Percent ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${ccc.completionRate}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Agency List */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/40 p-2 sm:p-3 space-y-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200/80 text-[11px] font-semibold text-slate-500">
                              <th className="py-2 px-2.5">Agency Name</th>
                              <th className="py-2 px-2.5">Vendor Code (6 Digits)</th>
                              <th className="py-2 px-2.5">Mobile Number (10 Digits)</th>
                              <th className="py-2 px-2.5">Contact Person</th>
                              <th className="py-2 px-2.5 text-center">Status</th>
                              <th className="py-2 px-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 bg-white">
                            {items.map((agency) => {
                              const isComplete = agency.vendorCodeValid && agency.mobileNumberValid

                              return (
                                <tr key={agency.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-2.5 font-medium text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <span>{agency.name}</span>
                                      {!agency.isActive && (
                                        <Badge variant="outline" className="text-[9px] text-slate-400 bg-slate-100">
                                          Inactive
                                        </Badge>
                                      )}
                                    </div>
                                  </td>

                                  <td className="py-2.5 px-2.5 font-mono">
                                    {agency.vendorCodeValid ? (
                                      <span className="inline-flex items-center gap-1 text-slate-900 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        {agency.vendorCode}
                                      </span>
                                    ) : agency.vendorCode ? (
                                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                        <AlertCircle className="h-3 w-3 text-amber-600" />
                                        {agency.vendorCode} (Invalid)
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 font-sans italic text-[11px] bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                                        Not Set
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-2.5 font-mono">
                                    {agency.mobileNumberValid ? (
                                      <span className="inline-flex items-center gap-1 text-slate-900 font-semibold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        {agency.mobileNumber}
                                      </span>
                                    ) : agency.mobileNumber ? (
                                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                        <AlertCircle className="h-3 w-3 text-amber-600" />
                                        {agency.mobileNumber} (Invalid)
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 font-sans italic text-[11px] bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                                        Not Set
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-2.5 text-slate-600">
                                    {agency.contactPerson || <span className="text-slate-300 italic">—</span>}
                                  </td>

                                  <td className="py-2.5 px-2.5 text-center">
                                    {isComplete ? (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 text-[10px]">
                                        Complete
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 text-[10px]">
                                        Pending
                                      </Badge>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-2.5 text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleEditClick(agency)}
                                      className="h-7 px-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* VIEW MODE 2: ALL TABLE */}
      {viewMode === "all_table" && (
        <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Care Center (CCC)</th>
                  <th className="py-3 px-3">Agency Name</th>
                  <th className="py-3 px-3">Vendor Code (6 Digits)</th>
                  <th className="py-3 px-3">Mobile Number (10 Digits)</th>
                  <th className="py-3 px-3">Contact Person</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {filteredAgencies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No agencies match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredAgencies.map((agency, idx) => {
                    const isComplete = agency.vendorCodeValid && agency.mobileNumberValid

                    return (
                      <tr key={agency.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] font-mono">{idx + 1}</td>

                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-800">{agency.cccName}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">({agency.cccCode})</span>
                        </td>

                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {agency.name}
                        </td>

                        <td className="py-2.5 px-3 font-mono">
                          {agency.vendorCodeValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              {agency.vendorCode}
                            </span>
                          ) : (
                            <span className="text-rose-600 italic text-[11px] bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                              {agency.vendorCode ? `Invalid (${agency.vendorCode})` : "Missing"}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-mono">
                          {agency.mobileNumberValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              {agency.mobileNumber}
                            </span>
                          ) : (
                            <span className="text-rose-600 italic text-[11px] bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                              {agency.mobileNumber ? `Invalid (${agency.mobileNumber})` : "Missing"}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-slate-600">
                          {agency.contactPerson || <span className="text-slate-300 italic">—</span>}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          {isComplete ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 text-[10px]">
                              Complete
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 text-[10px]">
                              Pending
                            </Badge>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditClick(agency)}
                            className="h-7 px-2.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 rounded-lg cursor-pointer"
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* QUICK EDIT MODAL */}
      <Dialog open={!!editingAgency} onOpenChange={(open) => !open && setEditingAgency(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" />
              Edit Contractor Agency Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update vendor code and mobile contact for <strong>{editingAgency?.name}</strong> under{" "}
              <strong>{editingAgency?.cccName} ({editingAgency?.cccCode})</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            {editSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {editSuccessMessage}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Vendor Code (SAP / Contractor 6-Digits)</Label>
              <Input
                type="text"
                placeholder="e.g. 504105 (6 digits)"
                maxLength={10}
                value={editVendorCode}
                onChange={(e) => setEditVendorCode(e.target.value)}
                className="text-xs font-mono rounded-xl h-9"
              />
              <p className="text-[10px] text-slate-400">Must be a valid 6-digit vendor code number.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Mobile Number (10 Digits)</Label>
              <Input
                type="tel"
                placeholder="e.g. 9876543210 (10 digits)"
                maxLength={10}
                value={editMobileNumber}
                onChange={(e) => setEditMobileNumber(e.target.value.replace(/\D/g, ""))}
                className="text-xs font-mono rounded-xl h-9"
              />
              <p className="text-[10px] text-slate-400">10-digit Indian mobile number for SMS/WhatsApp sync.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Contact Person Name</Label>
              <Input
                type="text"
                placeholder="e.g. Subhash Ghosh"
                value={editContactPerson}
                onChange={(e) => setEditContactPerson(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Email Address (Optional)</Label>
              <Input
                type="email"
                placeholder="agency@example.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingAgency(null)}
              disabled={savingEdit}
              className="text-xs h-9 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="text-xs h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
            >
              {savingEdit ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

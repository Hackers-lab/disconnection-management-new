"use client"

import { useState, useMemo } from "react"
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
import {
  type Tenant,
  type User,
  formatRegistrationDate,
  parseRegistrationTimestamp,
} from "./types"
import {
  UserCheck,
  Search,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Phone,
  Calendar,
  Clock,
  Link2,
  Unlink,
  ExternalLink,
  Download,
  X,
  Building2,
  Sparkles,
} from "lucide-react"

interface RegistrationsTabProps {
  hasLoadedData: boolean
  loading: boolean
  tenants: Tenant[]
  usersByCcc: Record<string, User[]>
  visiblePasswords: Record<string, boolean>
  showAllPasswords: boolean
  onTogglePasswordVisibility: (userId: string) => void
  onToggleShowAllPasswords: () => void
  onRefresh: () => void
}

type RegStatusFilter = "all" | "linked" | "pending" | "recent"

export function RegistrationsTab({
  hasLoadedData,
  loading,
  tenants,
  usersByCcc,
  visiblePasswords,
  showAllPasswords,
  onTogglePasswordVisibility,
  onToggleShowAllPasswords,
  onRefresh,
}: RegistrationsTabProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<RegStatusFilter>("all")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const summary = useMemo(() => {
    const linked = tenants.filter((t) => Boolean(t.spreadsheetId)).length
    const pending = tenants.length - linked
    const recent = tenants.filter((t) => parseRegistrationTimestamp(t.createdAt) >= sevenDaysAgo).length
    return { total: tenants.length, linked, pending, recent }
  }, [tenants, sevenDaysAgo])

  const filteredRegistrations = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    return [...tenants]
      .filter((t) => {
        if (statusFilter === "linked" && !t.spreadsheetId) return false
        if (statusFilter === "pending" && !!t.spreadsheetId) return false
        if (statusFilter === "recent" && parseRegistrationTimestamp(t.createdAt) < sevenDaysAgo) return false

        if (!q) return true
        return (
          t.cccCode.toLowerCase().includes(q) ||
          t.cccName.toLowerCase().includes(q) ||
          (t.contactPerson || "").toLowerCase().includes(q) ||
          (t.mobileNumber || "").toLowerCase().includes(q) ||
          (t.adminUsername || "").toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        const timeA = parseRegistrationTimestamp(a.createdAt)
        const timeB = parseRegistrationTimestamp(b.createdAt)
        if (timeA !== timeB) return timeB - timeA
        return (Number(b.id) || 0) - (Number(a.id) || 0)
      })
  }, [tenants, searchTerm, statusFilter, sevenDaysAgo])

  const copyCredentials = async (key: string, username: string, password?: string) => {
    const text = password ? `Username: ${username}\nPassword: ${password}` : `Username: ${username}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast({
        title: "Credentials Copied",
        description: `Copied login details for ${username}.`,
      })
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000)
    } catch {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Browser blocked clipboard access.",
      })
    }
  }

  const handleExportExcel = () => {
    if (filteredRegistrations.length === 0) return
    const rows = filteredRegistrations.map((t, idx) => {
      const cccUsers = usersByCcc[t.cccCode.toUpperCase()] || []
      const adminUser =
        cccUsers.find((u) => u.username === t.adminUsername) ||
        cccUsers.find((u) => u.role === "admin") ||
        cccUsers[0]
      const regTime = formatRegistrationDate(t.createdAt)
      return {
        "#": idx + 1,
        "CCC Code": t.cccCode,
        "CCC Name": t.cccName,
        "Contact Person": t.contactPerson || "N/A",
        "Mobile Number": t.mobileNumber || "N/A",
        "Admin Username": adminUser?.username || t.adminUsername || "N/A",
        "Sheet Status": t.spreadsheetId ? "Linked" : "Pending",
        "Spreadsheet ID": t.spreadsheetId || "",
        "Registered At": regTime.formatted,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Registrations")
    XLSX.writeFile(wb, `CCC_Registrations_${new Date().toISOString().split("T")[0]}.xlsx`)
    toast({
      title: "Excel Exported",
      description: `Downloaded ${rows.length} registration record(s).`,
    })
  }

  if (!hasLoadedData) {
    return (
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl animate-panel-reveal">
        <CardContent className="p-8 sm:p-12 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-50 border border-violet-200/80 flex items-center justify-center">
            <UserCheck className="h-7 w-7 text-violet-600" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-slate-900">Self-Registration Onboarding Log</h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Load live care center records to inspect newly onboarded CCCs, contact numbers, admin credentials, and Google Sheet link status.
            </p>
          </div>
          <Button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-5 h-10 text-xs font-semibold shadow-sm cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Load Registration Log
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 animate-tab-enter">
      {/* KPI Filter Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "all"
              ? "border-violet-500 ring-2 ring-violet-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Registered
            </span>
            <Building2 className="h-4 w-4 text-violet-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
            {summary.total}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">All care center profiles</div>
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
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Sheet Linked
            </span>
            <Link2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-1">
            {summary.linked}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Active Google Sheet sync</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "pending"
              ? "border-amber-500 ring-2 ring-amber-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Sheet Pending
            </span>
            <Unlink className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-amber-700 mt-1">
            {summary.pending}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Awaiting sheet link</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "recent" ? "all" : "recent")}
          className={`text-left p-3.5 rounded-2xl border bg-white transition-all cursor-pointer interactive-tap ${
            statusFilter === "recent"
              ? "border-blue-500 ring-2 ring-blue-500/15 shadow-sm"
              : "border-slate-200/80 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Last 7 Days
            </span>
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-blue-700 mt-1">
            {summary.recent}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Recent self-signups</div>
        </button>
      </div>

      {/* Main Registrations Table Card */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search CCC code, name, contact, mobile, admin..."
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
            {(
              [
                { id: "all", label: "All" },
                { id: "linked", label: "Linked" },
                { id: "pending", label: "Pending" },
                { id: "recent", label: "Last 7d" },
              ] as Array<{ id: RegStatusFilter; label: string }>
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === pill.id
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {pill.label}
              </button>
            ))}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onToggleShowAllPasswords}
              className="h-8 text-xs border-slate-200 bg-white text-slate-700 rounded-lg cursor-pointer"
            >
              {showAllPasswords ? <EyeOff className="h-3.5 w-3.5 mr-1 text-amber-600" /> : <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />}
              <span className="hidden sm:inline">{showAllPasswords ? "Hide Passwords" : "Show Passwords"}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportExcel}
              disabled={filteredRegistrations.length === 0}
              className="h-8 text-xs border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-semibold cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Excel
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 text-xs border-slate-200 bg-white text-slate-700 rounded-lg cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              <span className="text-xs font-medium">Loading onboarding records...</span>
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">No matching registrations found</p>
              <p className="text-xs text-slate-500">
                Try adjusting your search query or status filter.
              </p>
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
              {/* Mobile Cards View */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredRegistrations.map((t, index) => {
                  const cccUsers = usersByCcc[t.cccCode.toUpperCase()] || []
                  const adminUser =
                    cccUsers.find((u) => u.username === t.adminUsername) ||
                    cccUsers.find((u) => u.role === "admin") ||
                    cccUsers[0]
                  const isPassVisible = adminUser ? showAllPasswords || !!visiblePasswords[adminUser.id] : false
                  const regTime = formatRegistrationDate(t.createdAt)
                  const copyId = `mob-${t.cccCode}`

                  return (
                    <div key={`${t.cccCode}-${index}`} className="p-4 space-y-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">
                              {t.cccCode}
                            </span>
                            <span className="font-bold text-sm text-slate-900 truncate">{t.cccName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{regTime.formatted}</span>
                            {regTime.relative && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-50 text-slate-600 border-slate-200">
                                {regTime.relative}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {t.spreadsheetId ? (
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${t.spreadsheetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold shrink-0"
                          >
                            <Link2 className="h-3 w-3" />
                            Linked
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold shrink-0">
                            <Unlink className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <div className="text-[10px] uppercase text-slate-400 font-semibold">Contact</div>
                          <div className="font-medium text-slate-800 truncate">{t.contactPerson || "—"}</div>
                          {t.mobileNumber ? (
                            <a
                              href={`tel:${t.mobileNumber}`}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-mono mt-0.5"
                            >
                              <Phone className="h-3 w-3" />
                              {t.mobileNumber}
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">No phone</span>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-slate-400 font-semibold">Admin Login</div>
                          {adminUser ? (
                            <div className="space-y-1">
                              <div className="font-mono font-bold text-slate-900 truncate">{adminUser.username}</div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {isPassVisible ? adminUser.password || "N/A" : "••••••••"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onTogglePasswordVisibility(adminUser.id)}
                                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  {isPassVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyCredentials(copyId, adminUser.username, adminUser.password)}
                                  className="text-slate-400 hover:text-blue-600 cursor-pointer"
                                  title="Copy username & password"
                                >
                                  {copiedKey === copyId ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No account</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/90 hover:bg-slate-50/90 border-b border-slate-200/80">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 w-10 text-center">#</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Care Center</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Officer & Contact</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Admin Credentials</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sheet Status</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right">Registered On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {filteredRegistrations.map((t, index) => {
                      const cccUsers = usersByCcc[t.cccCode.toUpperCase()] || []
                      const adminUser =
                        cccUsers.find((u) => u.username === t.adminUsername) ||
                        cccUsers.find((u) => u.role === "admin") ||
                        cccUsers[0]
                      const isPassVisible = adminUser ? showAllPasswords || !!visiblePasswords[adminUser.id] : false
                      const regTime = formatRegistrationDate(t.createdAt)
                      const copyId = `desk-${t.cccCode}`

                      return (
                        <TableRow key={`${t.cccCode}-${index}`} className="hover:bg-slate-50/70 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-slate-400">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">
                                {t.cccCode}
                              </span>
                              <span className="font-semibold text-xs text-slate-900">{t.cccName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-medium text-slate-800">{t.contactPerson || "—"}</div>
                            {t.mobileNumber ? (
                              <a
                                href={`tel:${t.mobileNumber}`}
                                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-mono mt-0.5"
                              >
                                <Phone className="h-3 w-3" />
                                {t.mobileNumber}
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-400">Not provided</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {adminUser ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {adminUser.username}
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {isPassVisible ? adminUser.password || "N/A" : "••••••••"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onTogglePasswordVisibility(adminUser.id)}
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                                  title={isPassVisible ? "Hide password" : "Reveal password"}
                                >
                                  {isPassVisible ? <EyeOff className="h-3.5 w-3.5 text-amber-600" /> : <Eye className="h-3.5 w-3.5 text-blue-600" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyCredentials(copyId, adminUser.username, adminUser.password)}
                                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                  title="Copy username & password"
                                >
                                  {copiedKey === copyId ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No account provisioned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {t.spreadsheetId ? (
                              <a
                                href={`https://docs.google.com/spreadsheets/d/${t.spreadsheetId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors"
                              >
                                <Link2 className="h-3 w-3" />
                                Linked
                                <ExternalLink className="h-3 w-3 opacity-70" />
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                                <Unlink className="h-3 w-3" />
                                Pending Link
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-xs font-medium text-slate-800">{regTime.formatted}</div>
                            {regTime.relative && (
                              <div className="text-[11px] text-slate-400 font-mono">{regTime.relative}</div>
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
}

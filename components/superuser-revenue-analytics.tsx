"use client"

import { useState, useEffect, useMemo } from "react"
import {
  IndianRupee,
  Users,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Search,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  Building2,
  UserCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  CreditCard,
  UserX,
  UserPlus
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface RevenueCohortItem {
  userId: string
  username: string
  fullName?: string
  role: string
  cccCode: string
  cccName?: string
  paymentCount: number
  totalPaidAmount: number
  lastPaymentDate?: string | null
  lastPaymentAmount?: number
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  // Cohort category for the selected month:
  // "paid_in_month": paid in this month
  // "expiring_in_month": active subscription ending in this month
  // "expired_last_month_probable": paid in prior month, expired by this month (likely to pay again)
  // "deemed_user": expired 60+ days ago (no longer using)
  cohortStatus: "paid" | "expiring_soon" | "expired_will_pay" | "deemed" | "active_other"
  cohortLabel: string
  expiredDaysAgo?: number
}

export interface MonthlyRevenueData {
  monthKey: string // "YYYY-MM"
  monthLabel: string // "October 2026"
  totalRevenue: number
  transactionsCount: number
  uniquePaidUsersCount: number
  expiringThisMonthCount: number
  expiredLastMonthWillPayCount: number
  deemedUsersCount: number
}

interface Props {
  onBackToDashboard?: () => void
}

export function SuperuserRevenueAnalytics({ onBackToDashboard }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    months: MonthlyRevenueData[]
    cohorts: Record<string, RevenueCohortItem[]>
    overallMetrics: {
      allTimeRevenue: number
      totalTransactions: number
      totalDeemedUsers: number
      currentActiveUsers: number
    }
  } | null>(null)

  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [cohortFilter, setCohortFilter] = useState<"all" | "paid" | "expiring_soon" | "expired_will_pay" | "deemed">("all")
  const [searchQuery, setSearchQuery] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/superuser/subscriptions")
      if (!res.ok) throw new Error("Failed to fetch subscription data")
      const json = await res.json()

      const transactions: any[] = json.transactions || []
      const subscribers: any[] = json.subscribers || []

      const now = new Date()

      // 1. Group transactions by Month (YYYY-MM)
      const monthMap: Record<
        string,
        {
          revenue: number
          txCount: number
          paidUserMap: Map<string, { amount: number; date: string; username?: string; subscriberName?: string; ccc_code?: string }>
        }
      > = {}

      transactions.forEach((tx) => {
        const dStr = tx.created_at
        if (!dStr) return
        const d = new Date(dStr.includes("Z") || dStr.includes("+") ? dStr : dStr.replace(" ", "T") + "Z")
        if (isNaN(d.getTime())) return
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

        if (!monthMap[key]) {
          monthMap[key] = { revenue: 0, txCount: 0, paidUserMap: new Map() }
        }

        const amt = typeof tx.amount === "number" ? tx.amount : 0
        monthMap[key].revenue += amt
        monthMap[key].txCount += 1

        const uid = tx.user_id || tx.username || tx.id
        const existing = monthMap[key].paidUserMap.get(uid) || {
          amount: 0,
          date: dStr,
          username: tx.username || tx.user_id,
          subscriberName: tx.subscriberName || tx.agency_name || tx.username || uid,
          ccc_code: tx.ccc_code,
        }
        existing.amount += amt
        if (new Date(dStr) > new Date(existing.date)) existing.date = dStr
        if (!existing.username && tx.username) existing.username = tx.username
        if (!existing.subscriberName && tx.subscriberName) existing.subscriberName = tx.subscriberName
        if (!existing.ccc_code && tx.ccc_code) existing.ccc_code = tx.ccc_code
        monthMap[key].paidUserMap.set(uid, existing)
      })

      // Ensure current month is always present even if 0 transactions yet
      const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      if (!monthMap[curMonthKey]) {
        monthMap[curMonthKey] = { revenue: 0, txCount: 0, paidUserMap: new Map() }
      }

      // Sort months descending (latest first)
      const sortedMonthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a))

      // 2. Build Cohort data for each month
      const cohortsByMonth: Record<string, RevenueCohortItem[]> = {}
      const monthSummaries: MonthlyRevenueData[] = []

      sortedMonthKeys.forEach((mKey, idx) => {
        const [yearStr, monthStr] = mKey.split("-")
        const y = parseInt(yearStr, 10)
        const m = parseInt(monthStr, 10) - 1 // 0-based month index

        const monthStart = new Date(y, m, 1)
        const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999)

        // Previous month range
        const prevMonthStart = new Date(y, m - 1, 1)
        const prevMonthEnd = new Date(y, m, 0, 23, 59, 59, 999)
        const prevMonthKey = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}`
        const prevMonthPaidUsers = monthMap[prevMonthKey]?.paidUserMap || new Map()

        // Fast lookup map for subscriber records by various possible keys
        const subLookup = new Map<string, any>()
        subscribers.forEach((s) => {
          if (s.id) {
            subLookup.set(s.id, s)
            subLookup.set(s.id.toLowerCase(), s)
            if (s.id.startsWith("user_")) {
              const stripped = s.id.replace(/^user_/, "")
              subLookup.set(stripped, s)
              subLookup.set(stripped.toLowerCase(), s)
            }
            if (s.id.startsWith("agency_")) {
              const stripped = s.id.replace(/^agency_/, "")
              subLookup.set(stripped, s)
              subLookup.set(stripped.toLowerCase(), s)
            }
          }
          if (s.username) {
            subLookup.set(s.username, s)
            subLookup.set(s.username.toLowerCase(), s)
          }
          if (s.name) {
            subLookup.set(s.name, s)
            subLookup.set(s.name.toLowerCase(), s)
          }
        })

        // Helper to check if a subscriber paid in a given month
        const getSubscriberPaidInfo = (sub: any, targetMonthKey: string) => {
          const pMap = monthMap[targetMonthKey]?.paidUserMap
          if (!pMap) return undefined
          const keysToTry = [
            sub.id,
            sub.id?.toLowerCase(),
            sub.id?.replace(/^user_/, ""),
            sub.id?.replace(/^agency_/, ""),
            sub.username,
            sub.username?.toLowerCase(),
            sub.name,
            sub.name?.toLowerCase(),
          ].filter(Boolean)

          for (const k of keysToTry) {
            if (pMap.has(k)) return pMap.get(k)
          }
          return undefined
        }

        const monthUsersList: RevenueCohortItem[] = []
        const addedUserKeys = new Set<string>()

        // 1. FIRST: Add ALL users who actually made transactions in this month
        // This guarantees that "Paid This Month" list is NEVER blank when transactions exist
        monthMap[mKey].paidUserMap.forEach((pInfo, uid) => {
          const matchedSub =
            subLookup.get(uid) ||
            subLookup.get(uid.toLowerCase()) ||
            subLookup.get(`user_${uid}`) ||
            subLookup.get(`agency_${uid}`)

          const uKey = matchedSub?.id || uid
          if (addedUserKeys.has(uKey)) return
          addedUserKeys.add(uKey)

          monthUsersList.push({
            userId: uKey,
            username: matchedSub?.username || pInfo.username || uid,
            fullName: matchedSub?.name || pInfo.subscriberName || matchedSub?.username || uid,
            role: matchedSub?.role || (matchedSub?.type === "agency" ? "agency" : "technician"),
            cccCode: matchedSub?.cccCode || pInfo.ccc_code || "—",
            cccName: matchedSub?.cccName || pInfo.ccc_code || "Care Center",
            paymentCount: matchedSub?.orderCount || 1,
            totalPaidAmount: matchedSub?.totalPaidAmount || pInfo.amount,
            lastPaymentDate: pInfo.date || matchedSub?.lastPaymentDate || null,
            lastPaymentAmount: pInfo.amount,
            subscriptionStatus: matchedSub?.subscriptionStatus || "active",
            subscriptionExpiresAt: matchedSub?.subscriptionExpiresAt || null,
            cohortStatus: "paid",
            cohortLabel: `Paid This Month (₹${pInfo.amount.toLocaleString("en-IN")})`,
          })
        })

        // 2. SECOND: Add cohort users (expired_will_pay, expiring_soon, deemed) from subscribers
        let expiringCount = 0
        let willPayCount = 0
        let deemedCount = 0

        subscribers.forEach((sub) => {
          const uKey = sub.id
          // If already added via paid list above, skip re-evaluating
          if (addedUserKeys.has(uKey)) return

          const paidInThisMonth = getSubscriberPaidInfo(sub, mKey)
          const paidInPrevMonth = getSubscriberPaidInfo(sub, prevMonthKey)

          const expStr = sub.subscriptionExpiresAt
          const expDate = expStr ? new Date(expStr) : null
          const isExpValid = expDate && !isNaN(expDate.getTime())

          let diffDaysFromMonth = 0
          if (isExpValid) {
            const diffMs = monthEnd.getTime() - expDate.getTime()
            diffDaysFromMonth = Math.floor(diffMs / (1000 * 60 * 60 * 24))
          }

          let cohortStatus: RevenueCohortItem["cohortStatus"] = "active_other"
          let cohortLabel = "Active User"

          if (paidInThisMonth) {
            cohortStatus = "paid"
            cohortLabel = `Paid This Month (₹${paidInThisMonth.amount.toLocaleString("en-IN")})`
          } else if (
            isExpValid &&
            diffDaysFromMonth >= 60 // Expired 2+ months ago relative to this period
          ) {
            cohortStatus = "deemed"
            cohortLabel = `Deemed (Expired ${diffDaysFromMonth}d ago • Dormant)`
            deemedCount++
          } else if (paidInPrevMonth && isExpValid && expDate <= monthEnd) {
            // Paid last month but now expired in this period -> prime candidate to pay again!
            cohortStatus = "expired_will_pay"
            cohortLabel = "Paid Last Month • Currently Expired (Will Pay)"
            willPayCount++
          } else if (isExpValid && expDate >= monthStart && expDate <= monthEnd) {
            // Expires in this month
            cohortStatus = "expiring_soon"
            cohortLabel = "Expires In This Month"
            expiringCount++
          }

          // If relevant to this month's analytics
          if (cohortStatus !== "active_other" || paidInThisMonth) {
            addedUserKeys.add(uKey)
            monthUsersList.push({
              userId: sub.id,
              username: sub.username || sub.name,
              fullName: sub.name,
              role: sub.role,
              cccCode: sub.cccCode,
              cccName: sub.cccName,
              paymentCount: sub.orderCount || 0,
              totalPaidAmount: sub.totalPaidAmount || 0,
              lastPaymentDate: paidInThisMonth?.date || sub.lastPaymentDate || null,
              lastPaymentAmount: paidInThisMonth?.amount,
              subscriptionStatus: sub.subscriptionStatus,
              subscriptionExpiresAt: sub.subscriptionExpiresAt,
              cohortStatus,
              cohortLabel,
              expiredDaysAgo: isExpValid && expDate < monthEnd ? diffDaysFromMonth : undefined,
            })
          }
        })

        // Unique paid users count in this month
        const uniquePaidCount = monthUsersList.filter((u) => u.cohortStatus === "paid").length

        // Format label: "October 2026"
        const monthLabel = monthStart.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })

        monthSummaries.push({
          monthKey: mKey,
          monthLabel,
          totalRevenue: monthMap[mKey].revenue,
          transactionsCount: monthMap[mKey].txCount,
          uniquePaidUsersCount: uniquePaidCount,
          expiringThisMonthCount: expiringCount,
          expiredLastMonthWillPayCount: willPayCount,
          deemedUsersCount: deemedCount,
        })

        cohortsByMonth[mKey] = monthUsersList
      })

      // Overall metrics
      const allTimeRevenue = transactions.reduce((acc, tx) => acc + (typeof tx.amount === "number" ? tx.amount : 0), 0)
      const currentActiveUsers = subscribers.filter((s) => !s.isExpired).length
      const twoMonthsAgo = new Date(now)
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
      const totalDeemed = subscribers.filter((s) => {
        if (!s.subscriptionExpiresAt) return false
        const d = new Date(s.subscriptionExpiresAt)
        return !isNaN(d.getTime()) && d < twoMonthsAgo
      }).length

      setData({
        months: monthSummaries,
        cohorts: cohortsByMonth,
        overallMetrics: {
          allTimeRevenue,
          totalTransactions: transactions.length,
          totalDeemedUsers: totalDeemed,
          currentActiveUsers,
        },
      })

      if (sortedMonthKeys.length > 0) {
        setSelectedMonth(sortedMonthKeys[0])
      }
    } catch (e: any) {
      console.error("Superuser revenue analytics error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const currentMonthData = useMemo(() => {
    if (!data || !selectedMonth) return null
    return data.months.find((m) => m.monthKey === selectedMonth) || null
  }, [data, selectedMonth])

  const currentCohorts = useMemo(() => {
    if (!data || !selectedMonth) return []
    const list = data.cohorts[selectedMonth] || []

    return list.filter((user) => {
      // Cohort filter
      if (cohortFilter !== "all" && user.cohortStatus !== cohortFilter) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          user.username.toLowerCase().includes(q) ||
          (user.fullName || "").toLowerCase().includes(q) ||
          user.cccCode.toLowerCase().includes(q) ||
          (user.cccName || "").toLowerCase().includes(q) ||
          user.cohortLabel.toLowerCase().includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [data, selectedMonth, cohortFilter, searchQuery])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs space-y-3">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Generating Revenue & Cohort Analytics...</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Scanning Razorpay transactions, user expiration dates, and 2-month deemed users.
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center shadow-xs">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-800">Failed to load revenue analytics</p>
        <Button size="sm" onClick={fetchData} className="mt-3 text-xs bg-blue-600 hover:bg-blue-500 text-white">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-tight">Monthly Revenue & User Health Check</h2>
            <Badge className="bg-emerald-500/30 text-emerald-300 border-emerald-400/40 text-[10px] font-bold">
              Live Audited
            </Badge>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Track collected revenue month-by-month, pinpoint users who paid last month and are ready to renew, and auto-flag deemed dormant accounts (&gt;2 months expired).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={fetchData}
            variant="outline"
            className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-semibold cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            <span>Recalculate</span>
          </Button>
          {onBackToDashboard && (
            <Button
              size="sm"
              onClick={onBackToDashboard}
              variant="outline"
              className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-semibold cursor-pointer"
            >
              <span>Back</span>
            </Button>
          )}
        </div>
      </div>

      {/* Month Selection Bar (Cards Strip) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
          <span>Select Audit Month:</span>
          <span className="text-[11px] text-slate-400">Showing {data.months.length} recorded months</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {data.months.map((m) => {
            const isSelected = selectedMonth === m.monthKey
            return (
              <div
                key={m.monthKey}
                onClick={() => setSelectedMonth(m.monthKey)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none relative overflow-hidden ${
                  isSelected
                    ? "bg-emerald-50/90 border-emerald-500 shadow-sm ring-2 ring-emerald-500/30"
                    : "bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div className="text-[11px] font-bold text-slate-700 truncate">{m.monthLabel}</div>
                <div className="text-base sm:text-lg font-black text-slate-900 mt-1 flex items-baseline gap-0.5">
                  <span className="text-xs font-semibold text-emerald-600">₹</span>
                  <span>{m.totalRevenue.toLocaleString("en-IN")}</span>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                  <span>{m.uniquePaidUsersCount} Paid</span>
                  {m.expiredLastMonthWillPayCount > 0 ? (
                    <span className="font-semibold text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">
                      +{m.expiredLastMonthWillPayCount} Will Pay
                    </span>
                  ) : (
                    <span>{m.transactionsCount} txs</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Month Summary KPIs (4 Cards Grid) */}
      {currentMonthData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Monthly Revenue */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-xl">
            <CardContent className="p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>Revenue ({currentMonthData.monthLabel})</span>
                <span className="p-1 rounded-md bg-emerald-50 text-emerald-700">
                  <IndianRupee className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900">
                ₹{currentMonthData.totalRevenue.toLocaleString("en-IN")}
              </div>
              <p className="text-[10px] text-slate-500">
                {currentMonthData.transactionsCount} orders received
              </p>
            </CardContent>
          </Card>

          {/* 2. Paid Users in Month */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-xl">
            <CardContent className="p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>Paid Users</span>
                <span className="p-1 rounded-md bg-blue-50 text-blue-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-700">
                {currentMonthData.uniquePaidUsersCount}
              </div>
              <p className="text-[10px] text-slate-500">Subscribed / Renewed successfully</p>
            </CardContent>
          </Card>

          {/* 3. Expired Last Month / Will Pay (Target Conversion) */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-xl border-l-4 border-l-amber-500">
            <CardContent className="p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800">
                <span>Paid Last Mo. • Expired (Will Pay)</span>
                <span className="p-1 rounded-md bg-amber-50 text-amber-700">
                  <Clock className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-700">
                {currentMonthData.expiredLastMonthWillPayCount}
              </div>
              <p className="text-[10px] text-amber-700 font-medium">Paid last month, pending renewal this month</p>
            </CardContent>
          </Card>

          {/* 4. Deemed Users (Dormant >2 months expired) */}
          <Card className="bg-white border-slate-200/90 shadow-2xs rounded-xl border-l-4 border-l-rose-500">
            <CardContent className="p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-rose-800">
                <span>Deemed Users (Dormant)</span>
                <span className="p-1 rounded-md bg-rose-50 text-rose-700">
                  <UserX className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-700">
                {currentMonthData.deemedUsersCount}
              </div>
              <p className="text-[10px] text-rose-600 font-medium">Expired &gt;60 days ago (no longer using)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cohort Breakdown Filter & Search Section */}
      <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <CardTitle className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <span>User Cohorts Breakdown — {currentMonthData?.monthLabel}</span>
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-500">
              Inspect user renewal patterns, conversion targets, and dormant users.
            </CardDescription>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search user, CCC code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white border-slate-200 text-slate-900 rounded-lg"
            />
          </div>
        </CardHeader>

        {/* Filter Tabs Pills */}
        <div className="p-3 border-b border-slate-100 flex items-center gap-1.5 flex-wrap bg-slate-50/40">
          <Button
            size="sm"
            variant={cohortFilter === "all" ? "default" : "outline"}
            onClick={() => setCohortFilter("all")}
            className={`text-[11px] h-7 px-2.5 rounded-lg ${
              cohortFilter === "all"
                ? "bg-slate-900 text-white font-semibold"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All Cohorts ({data.cohorts[selectedMonth]?.length || 0})
          </Button>

          <Button
            size="sm"
            variant={cohortFilter === "paid" ? "default" : "outline"}
            onClick={() => setCohortFilter("paid")}
            className={`text-[11px] h-7 px-2.5 rounded-lg ${
              cohortFilter === "paid"
                ? "bg-blue-600 text-white font-semibold"
                : "border-blue-200 bg-blue-50/50 text-blue-800 hover:bg-blue-100/60"
            }`}
          >
            ✓ Paid This Month ({currentMonthData?.uniquePaidUsersCount || 0})
          </Button>

          <Button
            size="sm"
            variant={cohortFilter === "expired_will_pay" ? "default" : "outline"}
            onClick={() => setCohortFilter("expired_will_pay")}
            className={`text-[11px] h-7 px-2.5 rounded-lg ${
              cohortFilter === "expired_will_pay"
                ? "bg-amber-600 text-white font-semibold"
                : "border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/60"
            }`}
          >
            ⚡ Will Pay / Target ({currentMonthData?.expiredLastMonthWillPayCount || 0})
          </Button>

          <Button
            size="sm"
            variant={cohortFilter === "expiring_soon" ? "default" : "outline"}
            onClick={() => setCohortFilter("expiring_soon")}
            className={`text-[11px] h-7 px-2.5 rounded-lg ${
              cohortFilter === "expiring_soon"
                ? "bg-purple-600 text-white font-semibold"
                : "border-purple-200 bg-purple-50/50 text-purple-800 hover:bg-purple-100/60"
            }`}
          >
            ⏳ Expiring In This Month ({currentMonthData?.expiringThisMonthCount || 0})
          </Button>

          <Button
            size="sm"
            variant={cohortFilter === "deemed" ? "default" : "outline"}
            onClick={() => setCohortFilter("deemed")}
            className={`text-[11px] h-7 px-2.5 rounded-lg ${
              cohortFilter === "deemed"
                ? "bg-rose-600 text-white font-semibold"
                : "border-rose-200 bg-rose-50/50 text-rose-800 hover:bg-rose-100/60"
            }`}
          >
            ⛔ Deemed Users ({currentMonthData?.deemedUsersCount || 0})
          </Button>
        </div>

        {/* Users List Container */}
        <CardContent className="p-0">
          {currentCohorts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <Users className="h-8 w-8 mx-auto text-slate-400 mb-2 opacity-50" />
              No user accounts found matching this cohort filter for {currentMonthData?.monthLabel}.
            </div>
          ) : (
            <>
              {/* MOBILE VIEW (< md): Card list, perfectly fits portrait phone screens with 0 horizontal scroll */}
              <div className="block md:hidden divide-y divide-slate-100">
                {currentCohorts.map((u) => {
                  return (
                    <div
                      key={`mob-${u.userId}`}
                      className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Top: Name, Role & Status Pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {u.fullName || u.username}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-slate-600 font-semibold">@{u.username}</span>
                            <span>•</span>
                            <span className="capitalize px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                              {u.role}
                            </span>
                          </div>
                        </div>

                        {/* Cohort Status Badge */}
                        <div className="shrink-0">
                          {u.cohortStatus === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold px-2 py-0.5">
                              ✓ Paid This Month
                            </Badge>
                          ) : u.cohortStatus === "expired_will_pay" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold animate-pulse px-2 py-0.5">
                              ⚡ Will Pay
                            </Badge>
                          ) : u.cohortStatus === "expiring_soon" ? (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px] font-semibold px-2 py-0.5">
                              ⏳ Expiring
                            </Badge>
                          ) : u.cohortStatus === "deemed" ? (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] font-bold px-2 py-0.5">
                              ⛔ Deemed (&gt;60d)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-600 text-[10px] px-2 py-0.5">
                              Active
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Care Center & Expiration Info Strip */}
                      <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                            {u.cccCode}
                          </span>
                          <span className="text-slate-700 font-medium truncate text-[11px]">
                            {u.cccName || "Care Center"}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          {u.subscriptionExpiresAt ? (
                            <div className="text-[10px] font-mono">
                              <span className="text-slate-400">Exp: </span>
                              <span
                                className={
                                  u.expiredDaysAgo !== undefined && u.expiredDaysAgo > 0
                                    ? "text-rose-600 font-bold"
                                    : "text-slate-700 font-semibold"
                                }
                              >
                                {u.subscriptionExpiresAt}
                              </span>
                              {u.expiredDaysAgo !== undefined && u.expiredDaysAgo > 0 && (
                                <span className="text-[9px] text-rose-500 ml-1">
                                  ({u.expiredDaysAgo}d ago)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No expiry</span>
                          )}
                        </div>
                      </div>

                      {/* Financial Metrics Strip */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px]">
                        <div>
                          <span className="text-slate-500 text-[10px]">Month Amount: </span>
                          {u.lastPaymentAmount ? (
                            <span className="font-mono font-bold text-emerald-700 text-xs">
                              ₹{u.lastPaymentAmount.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-slate-500 text-[10px]">Lifetime Paid: </span>
                          <span className="font-mono font-bold text-slate-800 text-xs">
                            ₹{(u.totalPaidAmount || 0).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* DESKTOP / TABLET VIEW (md+): Standard Full Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-[11px]">
                      <TableHead>User / Agency</TableHead>
                      <TableHead>Care Center (CCC)</TableHead>
                      <TableHead className="text-center">Cohort Status</TableHead>
                      <TableHead className="text-center">Expiry Date</TableHead>
                      <TableHead className="text-right">Month Amount</TableHead>
                      <TableHead className="text-right">Lifetime Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentCohorts.map((u) => {
                      return (
                        <TableRow key={u.userId} className="text-xs hover:bg-slate-50/80 transition-colors">
                          {/* User / Agency */}
                          <TableCell className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{u.fullName || u.username}</div>
                            <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                              <span>@{u.username}</span>
                              <span>•</span>
                              <span className="capitalize">{u.role}</span>
                            </div>
                          </TableCell>

                          {/* Care Center */}
                          <TableCell className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                {u.cccCode}
                              </span>
                              <span className="text-slate-700 font-medium truncate max-w-[140px]">
                                {u.cccName || "Care Center"}
                              </span>
                            </div>
                          </TableCell>

                          {/* Cohort Status Pill */}
                          <TableCell className="py-2.5 px-3 text-center">
                            {u.cohortStatus === "paid" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                                ✓ Paid This Month
                              </Badge>
                            ) : u.cohortStatus === "expired_will_pay" ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold animate-pulse">
                                ⚡ Paid Last Mo • Will Pay
                              </Badge>
                            ) : u.cohortStatus === "expiring_soon" ? (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px] font-semibold">
                                ⏳ Expiring In Month
                              </Badge>
                            ) : u.cohortStatus === "deemed" ? (
                              <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] font-bold">
                                ⛔ Deemed Dormant (&gt;60d)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-600 text-[10px]">
                                Active
                              </Badge>
                            )}
                          </TableCell>

                          {/* Expiry Date */}
                          <TableCell className="py-2.5 px-3 text-center font-mono text-xs">
                            {u.subscriptionExpiresAt ? (
                              <div>
                                <span className={u.expiredDaysAgo !== undefined && u.expiredDaysAgo > 0 ? "text-rose-600 font-bold" : "text-slate-700 font-medium"}>
                                  {u.subscriptionExpiresAt}
                                </span>
                                {u.expiredDaysAgo !== undefined && u.expiredDaysAgo > 0 && (
                                  <div className="text-[9px] text-slate-400">
                                    {u.expiredDaysAgo}d ago
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No expiry</span>
                            )}
                          </TableCell>

                          {/* Month Amount */}
                          <TableCell className="py-2.5 px-3 text-right font-mono font-bold">
                            {u.lastPaymentAmount ? (
                              <span className="text-emerald-700">₹{u.lastPaymentAmount.toLocaleString("en-IN")}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>

                          {/* Lifetime Paid */}
                          <TableCell className="py-2.5 px-3 text-right font-mono font-medium text-slate-600">
                            {u.totalPaidAmount > 0 ? (
                              <span>₹{u.totalPaidAmount.toLocaleString("en-IN")}</span>
                            ) : (
                              <span className="text-slate-400">₹0</span>
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

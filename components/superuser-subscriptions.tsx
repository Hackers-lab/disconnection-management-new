"use client"

import { useState, useEffect, useMemo } from "react"
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  ExternalLink,
  Copy,
  Plus,
  ShieldCheck,
  Building2,
  User,
  ArrowUpRight,
  Filter,
  Check,
  Calendar,
  RotateCcw,
  Receipt,
  Layers,
  Sparkles,
  Banknote,
  HelpCircle,
  X,
  Loader2,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Trash2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import type { SubscriberItem, TransactionItem } from "@/app/api/superuser/subscriptions/route"

interface SuperuserSubscriptionsProps {
  onBackToDashboard?: () => void
}

export function SuperuserSubscriptions({ onBackToDashboard }: SuperuserSubscriptionsProps) {
  const [data, setData] = useState<{
    metrics: {
      totalRevenue: number
      totalRefunded: number
      netRevenue: number
      totalOrdersCount: number
      totalSubscribers: number
      activePaidCount: number
      dbActiveCount: number
      trialCount: number
      bypassedCount: number
      expiredCount: number
    }
    subscribers: SubscriberItem[]
    transactions: TransactionItem[]
    razorpayConnected: boolean
    billingStartDate: string
    isBillingActive: boolean
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeView, setActiveView] = useState<"subscribers" | "transactions" | "refunds">("subscribers")
  const [subscriberFilter, setSubscriberFilter] = useState<"all" | "paid" | "db_active" | "trial" | "bypassed" | "expired">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCcc, setSelectedCcc] = useState<string>("all")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [subscriberViewMode, setSubscriberViewMode] = useState<"tenant" | "flat">("tenant")
  const [collapsedTenants, setCollapsedTenants] = useState<Record<string, boolean>>({})

  const toggleTenantCollapse = (cccCode: string) => {
    setCollapsedTenants((prev) => ({
      ...prev,
      [cccCode]: !prev[cccCode],
    }))
  }

  const expandAllTenants = () => setCollapsedTenants({})
  const collapseAllTenants = () => {
    const allCollapsed: Record<string, boolean> = {}
    tenantGroups.forEach((g) => {
      allCollapsed[g.cccCode] = true
    })
    setCollapsedTenants(allCollapsed)
  }

  // Modals
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null)
  const [extendTarget, setExtendTarget] = useState<SubscriberItem | null>(null)
  const [extendDays, setExtendDays] = useState<number>(30)

  // Helper to safely parse and display date/time in IST (Indian Standard Time)
  const formatTxToIST = (dateStr?: string) => {
    if (!dateStr) return { date: "—", time: "" }
    try {
      // Ensure ISO string ends with Z if timezone offset is not specified, so it's parsed as UTC
      const iso = dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
        ? dateStr
        : dateStr.replace(" ", "T") + "Z"
      const d = new Date(iso)
      if (isNaN(d.getTime())) return { date: dateStr, time: "" }

      const date = d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })

      const time = d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST"

      return { date, time }
    } catch {
      return { date: dateStr, time: "" }
    }
  }

  // Parse any transaction timestamp string to UNIX timestamp for accurate sorting
  const parseTxTimestamp = (dateStr?: string): number => {
    if (!dateStr) return 0
    try {
      const iso = dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
        ? dateStr
        : dateStr.replace(" ", "T") + "Z"
      const ms = new Date(iso).getTime()
      return isNaN(ms) ? 0 : ms
    } catch {
      return 0
    }
  }
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  const [refundTarget, setRefundTarget] = useState<TransactionItem | null>(null)
  const [refundAmount, setRefundAmount] = useState<string>("")
  const [deleteTarget, setDeleteTarget] = useState<TransactionItem | null>(null)

  const { toast } = useToast()

  const fetchData = async () => {
    try {
      setRefreshing(true)
      const res = await fetch("/api/superuser/subscriptions", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to fetch subscription telemetry")
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      toast({
        title: "Failed to load subscriptions",
        description: e?.message || "Please check server logs",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast({
      title: "Copied to clipboard",
      description: text,
    })
  }

  const handleExtendDays = async () => {
    if (!extendTarget) return
    setIsProcessingAction(true)
    try {
      const res = await fetch("/api/superuser/subscriptions/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extend_days",
          targetId: extendTarget.id,
          targetType: extendTarget.type,
          days: extendDays,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to extend subscription")

      toast({
        title: "Subscription Extended! 🎉",
        description: result.message,
      })
      setExtendTarget(null)
      fetchData()
    } catch (e: any) {
      toast({
        title: "Action Failed",
        description: e.message || "Failed to extend subscription",
        variant: "destructive",
      })
    } finally {
      setIsProcessingAction(false)
    }
  }

  const handleToggleBypass = async (subscriber: SubscriberItem) => {
    if (subscriber.type !== "user") {
      toast({
        title: "Not Applicable",
        description: "Free Pass bypass can only be toggled for user accounts.",
      })
      return
    }

    try {
      const nextBypass = !subscriber.bypassSubscription
      const res = await fetch("/api/superuser/subscriptions/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_bypass",
          targetId: subscriber.id,
          bypass: nextBypass,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to toggle bypass")

      toast({
        title: nextBypass ? "Free Pass Activated 🛡️" : "Free Pass Removed",
        description: result.message,
      })
      fetchData()
    } catch (e: any) {
      toast({
        title: "Action Failed",
        description: e.message,
        variant: "destructive",
      })
    }
  }

  const handleRefund = async () => {
    if (!refundTarget) return
    setIsProcessingAction(true)
    try {
      const amountNum = refundAmount ? parseFloat(refundAmount) : undefined
      const res = await fetch("/api/superuser/subscriptions/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refund_payment",
          paymentId: refundTarget.razorpay_payment_id,
          refundAmount: amountNum,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to process refund")

      toast({
        title: "Refund Processed Successfully! 💸",
        description: result.message,
      })
      setRefundTarget(null)
      setSelectedTx(null)
      fetchData()
    } catch (e: any) {
      toast({
        title: "Refund Error",
        description: e.message,
        variant: "destructive",
      })
    } finally {
      setIsProcessingAction(false)
    }
  }

  const handleDeletePayment = async () => {
    if (!deleteTarget) return
    setIsProcessingAction(true)
    try {
      const res = await fetch("/api/superuser/subscriptions/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_payment",
          paymentId: deleteTarget.razorpay_payment_id,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to delete payment")

      toast({
        title: "Payment Removed",
        description: result.message || "Transaction deleted and excluded from dashboard.",
      })
      setDeleteTarget(null)
      setSelectedTx(null)
      fetchData()
    } catch (e: any) {
      toast({
        title: "Delete Error",
        description: e.message,
        variant: "destructive",
      })
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Unique CCCs for filter
  const cccOptions = useMemo(() => {
    if (!data?.subscribers) return []
    const set = new Set<string>()
    data.subscribers.forEach((s) => {
      if (s.cccCode) set.add(s.cccCode)
    })
    return Array.from(set).sort()
  }, [data?.subscribers])

  // Filtered subscribers
  const filteredSubscribers = useMemo(() => {
    if (!data?.subscribers) return []
    return data.subscribers.filter((s) => {
      // CCC Filter
      if (selectedCcc !== "all" && s.cccCode !== selectedCcc) return false

      // Category / Source Filter
      if (subscriberFilter === "paid" && s.source !== "razorpay_paid") return false
      if (subscriberFilter === "db_active" && (s.source === "razorpay_paid" || s.isExpired)) return false
      if (subscriberFilter === "trial" && s.source !== "dc_upload_trial" && s.source !== "setup_window_trial") return false
      if (subscriberFilter === "bypassed" && s.source !== "admin_bypass") return false
      if (subscriberFilter === "expired" && !s.isExpired) return false

      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          (s.username && s.username.toLowerCase().includes(q)) ||
          s.cccCode.toLowerCase().includes(q) ||
          (s.cccName && s.cccName.toLowerCase().includes(q))
        )
      }

      return true
    })
  }, [data?.subscribers, selectedCcc, subscriberFilter, searchQuery])

  // Tenant-wise grouped subscribers
  const tenantGroups = useMemo(() => {
    const map = new Map<string, {
      cccCode: string
      cccName: string
      subscribers: SubscriberItem[]
      agenciesCount: number
      usersCount: number
      totalRevenue: number
      paidCount: number
      trialCount: number
      bypassedCount: number
      expiredCount: number
    }>()

    filteredSubscribers.forEach((sub) => {
      const code = sub.cccCode || "UNKNOWN"
      if (!map.has(code)) {
        map.set(code, {
          cccCode: code,
          cccName: sub.cccName || code,
          subscribers: [],
          agenciesCount: 0,
          usersCount: 0,
          totalRevenue: 0,
          paidCount: 0,
          trialCount: 0,
          bypassedCount: 0,
          expiredCount: 0,
        })
      }
      const g = map.get(code)!
      g.subscribers.push(sub)
      if (sub.type === "agency") g.agenciesCount++
      else g.usersCount++
      g.totalRevenue += sub.totalPaidAmount || 0
      if (sub.source === "razorpay_paid") g.paidCount++
      else if (sub.source === "dc_upload_trial" || sub.source === "setup_window_trial") g.trialCount++
      else if (sub.source === "admin_bypass") g.bypassedCount++
      if (sub.isExpired) g.expiredCount++
    })

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue
      return b.subscribers.length - a.subscribers.length
    })
  }, [filteredSubscribers])

  // Filtered transactions — strictly sorted from newest to oldest
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return []
    const filtered = data.transactions.filter((tx) => {
      if (activeView === "refunds" && !tx.refund_status && (!tx.amount_refunded || tx.amount_refunded <= 0)) {
        return false
      }

      if (selectedCcc !== "all" && tx.ccc_code !== selectedCcc) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          tx.razorpay_order_id.toLowerCase().includes(q) ||
          tx.razorpay_payment_id.toLowerCase().includes(q) ||
          tx.subscriberName.toLowerCase().includes(q) ||
          (tx.username && tx.username.toLowerCase().includes(q)) ||
          tx.ccc_code.toLowerCase().includes(q) ||
          (tx.vpa && tx.vpa.toLowerCase().includes(q))
        )
      }

      return true
    })

    // Strict chronological sort: Latest to Oldest
    return [...filtered].sort((a, b) => parseTxTimestamp(b.created_at) - parseTxTimestamp(a.created_at))
  }, [data?.transactions, activeView, selectedCcc, searchQuery])

  if (loading) {
    return (
      <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl p-12 text-center my-6">
        <div className="flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-700">Loading Subscriptions & Payment Telemetry...</p>
          <p className="text-xs text-slate-400">Connecting to Turso database & Razorpay gateway...</p>
        </div>
      </Card>
    )
  }

  const metrics = data?.metrics || {
    totalRevenue: 0,
    totalRefunded: 0,
    netRevenue: 0,
    totalOrdersCount: 0,
    totalSubscribers: 0,
    activePaidCount: 0,
    dbActiveCount: 0,
    trialCount: 0,
    bypassedCount: 0,
    expiredCount: 0,
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {onBackToDashboard && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBackToDashboard}
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 rounded-xl"
                title="Back to Overview"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Subscriptions & Payment Informatics
            </h1>
            <Badge
              variant="outline"
              className={
                data?.razorpayConnected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold"
                  : "bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold"
              }
            >
              {data?.razorpayConnected ? "● Razorpay Live Gateway Connected" : "● Local Turso DB Mode"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 pl-10">
            Comprehensive financial ledger, subscriber validity tracking, and live Razorpay transaction telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={refreshing}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
            <span>{refreshing ? "Syncing..." : "Sync Telemetry"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 1. Total Revenue */}
        <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Total Revenue</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Banknote className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
            ₹{metrics.totalRevenue.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Net: ₹{metrics.netRevenue.toLocaleString("en-IN")}</span>
            {metrics.totalRefunded > 0 && (
              <span className="text-rose-500 font-medium">(-₹{metrics.totalRefunded})</span>
            )}
          </div>
        </Card>

        {/* 2. Razorpay Paid Subscriptions */}
        <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Paid (Razorpay)</span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-600">
            {metrics.activePaidCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Verified online transactions
          </div>
        </Card>

        {/* 3. Database Active (No Razorpay) - KEY REQUEST */}
        <Card className="bg-white border-blue-200/80 bg-blue-50/20 shadow-2xs rounded-2xl p-4">
          <div className="flex items-center justify-between text-blue-700 text-xs mb-1">
            <span className="font-bold">DB Active (No Razorpay)</span>
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-blue-700">
            {metrics.dbActiveCount}
          </div>
          <div className="text-[11px] text-blue-600/80 mt-1">
            {metrics.trialCount} Free Trials • {metrics.bypassedCount} Free Pass
          </div>
        </Card>

        {/* 4. Expired / Lapsed */}
        <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Expired / Due</span>
            <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-rose-600">
            {metrics.expiredCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Subscription expired
          </div>
        </Card>

        {/* 5. Total Orders */}
        <Card className="bg-white border-slate-200/90 shadow-2xs rounded-2xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-medium">Total Orders</span>
            <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
            {metrics.totalOrdersCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.totalSubscribers} total tracked accounts
          </div>
        </Card>
      </div>

      {/* Main Views Navigation & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4 shadow-2xs">
        {/* Segmented View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-150 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl max-w-fit">
            <button
              onClick={() => setActiveView("subscribers")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeView === "subscribers"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Subscribers Matrix ({filteredSubscribers.length})
            </button>
            <button
              onClick={() => setActiveView("transactions")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeView === "transactions"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Orders & Payments Ledger ({data?.transactions.length || 0})
            </button>
            <button
              onClick={() => setActiveView("refunds")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeView === "refunds"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Refunds ({data?.transactions.filter((t) => t.refund_status || (t.amount_refunded && t.amount_refunded > 0)).length || 0})
            </button>
          </div>

          {/* Search Input & CCC Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search subscriber, order, UPI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9 bg-slate-50/70 border-slate-200 rounded-xl"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={selectedCcc}
              onChange={(e) => setSelectedCcc(e.target.value)}
              aria-label="Filter by CCC office"
              className="text-xs h-9 bg-slate-50/70 border border-slate-200 rounded-xl px-2.5 text-slate-700 font-medium focus:outline-hidden"
            >
              <option value="all">All CCCs</option>
              {cccOptions.map((ccc) => (
                <option key={ccc} value={ccc}>
                  {ccc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* --- VIEW 1: SUBSCRIBERS MATRIX --- */}
        {activeView === "subscribers" && (
          <div className="space-y-4">
            {/* View Mode & Filter Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Filter:
                </span>
                {[
                  { id: "all", label: "All Subscribers" },
                  { id: "paid", label: "Paid (Razorpay)" },
                  { id: "db_active", label: "DB Active (No Razorpay)" },
                  { id: "trial", label: "Free Trial" },
                  { id: "bypassed", label: "Free Pass" },
                  { id: "expired", label: "Expired" },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setSubscriberFilter(pill.id as any)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none ${
                      subscriberFilter === pill.id
                        ? "bg-slate-900 text-white font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Tenant-wise vs Flat Switcher & Controls */}
              <div className="flex items-center gap-2 self-start lg:self-auto shrink-0 flex-wrap">
                <div className="p-0.5 bg-slate-100 rounded-xl flex items-center gap-0.5 text-xs border border-slate-200/60">
                  <button
                    onClick={() => setSubscriberViewMode("tenant")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                      subscriberViewMode === "tenant"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Group subscribers by CCC tenant"
                  >
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tenant View ({tenantGroups.length})</span>
                  </button>
                  <button
                    onClick={() => setSubscriberViewMode("flat")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                      subscriberViewMode === "flat"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Show flat table of all subscribers"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Flat Matrix ({filteredSubscribers.length})</span>
                  </button>
                </div>

                {subscriberViewMode === "tenant" && tenantGroups.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={expandAllTenants}
                      className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 rounded-xl border-slate-200"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={collapseAllTenants}
                      className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 rounded-xl border-slate-200"
                    >
                      Collapse All
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* --- SUBSCRIBERS DISPLAY --- */}
            {filteredSubscribers.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Building2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-600">No subscribers matched your filters</p>
                <p className="text-[11px] text-slate-400 mt-1">Try resetting the CCC office filter or clearing your search term.</p>
              </div>
            ) : subscriberViewMode === "tenant" ? (
              /* Tenant-wise Grouped View */
              <div className="space-y-3">
                {tenantGroups.map((group) => {
                  const isCollapsed = !!collapsedTenants[group.cccCode]
                  return (
                    <div
                      key={group.cccCode}
                      className="border border-slate-200/90 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all hover:border-slate-300"
                    >
                      {/* Tenant Header Bar */}
                      <div
                        onClick={() => toggleTenantCollapse(group.cccCode)}
                        className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-50/90 via-slate-50/50 to-white hover:bg-slate-100/60 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-slate-900 text-sm tracking-tight truncate">
                                {group.cccName || "Office"}
                              </h4>
                              <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-mono text-[10px] px-1.5 py-0">
                                CCC: {group.cccCode}
                              </Badge>
                              {group.totalRevenue > 0 && (
                                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-[10px] px-2 py-0">
                                  ₹{group.totalRevenue.toLocaleString("en-IN")} collected
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>
                                {group.subscribers.length} total {group.subscribers.length === 1 ? "account" : "accounts"} ({group.agenciesCount} {group.agenciesCount === 1 ? "agency" : "agencies"}, {group.usersCount} {group.usersCount === 1 ? "user" : "users"})
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Chevron Toggle */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                          {group.paidCount > 0 && (
                            <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold py-0.5 px-2">
                              {group.paidCount} Paid
                            </Badge>
                          )}
                          {group.trialCount > 0 && (
                            <Badge className="bg-purple-50 text-purple-800 border-purple-200 text-[10px] font-semibold py-0.5 px-2">
                              {group.trialCount} Trial
                            </Badge>
                          )}
                          {group.bypassedCount > 0 && (
                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold py-0.5 px-2">
                              {group.bypassedCount} Free Pass
                            </Badge>
                          )}
                          {group.expiredCount > 0 && (
                            <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px] font-semibold py-0.5 px-2">
                              {group.expiredCount} Expired
                            </Badge>
                          )}

                          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center ml-1">
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Tenant Table Body */}
                      {!isCollapsed && (
                        <div className="border-t border-slate-150 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                              <tr>
                                <th className="py-2.5 px-3.5">Subscriber</th>
                                <th className="py-2.5 px-3">Subscription Status & Source</th>
                                <th className="py-2.5 px-3">Valid Till</th>
                                <th className="py-2.5 px-3">Orders / Paid</th>
                                <th className="py-2.5 px-3 text-right">Quick Management</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150">
                              {group.subscribers.map((sub) => (
                                <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                                  {/* Subscriber Name & Role */}
                                  <td className="py-2.5 px-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs uppercase">
                                        {sub.type === "agency" ? (
                                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                        ) : (
                                          <User className="w-3.5 h-3.5 text-blue-600" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-xs">
                                          {sub.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                          {sub.username && <span>@{sub.username} • </span>}
                                          <span className="capitalize">{sub.role}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Subscription Status & Source Badge */}
                                  <td className="py-2.5 px-3">
                                    <div className="space-y-1">
                                      {sub.source === "razorpay_paid" ? (
                                        <Badge className="bg-amber-50 text-amber-800 border-amber-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <CheckCircle2 className="w-3 h-3 text-amber-600" />
                                          Paid (Razorpay)
                                        </Badge>
                                      ) : sub.source === "admin_bypass" ? (
                                        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                          Free Pass (Admin Bypass)
                                        </Badge>
                                      ) : sub.source === "dc_upload_trial" ? (
                                        <Badge className="bg-purple-50 text-purple-800 border-purple-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <Sparkles className="w-3 h-3 text-purple-600" />
                                          Free Trial (DC Upload - 90 Days)
                                        </Badge>
                                      ) : sub.source === "setup_window_trial" ? (
                                        <Badge className="bg-blue-50 text-blue-800 border-blue-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <Clock className="w-3 h-3 text-blue-600" />
                                          Free Trial (Setup Window)
                                        </Badge>
                                      ) : sub.source === "db_grant" ? (
                                        <Badge className="bg-cyan-50 text-cyan-800 border-cyan-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <Layers className="w-3 h-3 text-cyan-600" />
                                          Direct DB Grant (No Razorpay)
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-rose-50 text-rose-800 border-rose-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                                          Expired
                                        </Badge>
                                      )}
                                    </div>
                                  </td>

                                  {/* Validity & Expiry */}
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-slate-800 font-mono text-[11px]">
                                      {sub.subscriptionExpiresAt || "—"}
                                    </div>
                                    <div
                                      className={`text-[10px] font-medium ${
                                        sub.isExpired
                                          ? "text-rose-600"
                                          : sub.daysRemaining <= 7
                                          ? "text-amber-600 font-bold"
                                          : "text-emerald-600"
                                      }`}
                                    >
                                      {sub.source === "admin_bypass"
                                        ? "Permanent (Bypassed)"
                                        : sub.isExpired
                                        ? Math.abs(sub.daysRemaining) <= 1
                                          ? "Expired"
                                          : `Expired ${Math.abs(sub.daysRemaining)} days ago`
                                        : `${sub.daysRemaining} days remaining`}
                                    </div>
                                  </td>

                                  {/* Orders & Total Paid */}
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-900">
                                      {sub.totalPaidAmount > 0
                                        ? `₹${sub.totalPaidAmount.toLocaleString("en-IN")}`
                                        : "₹0 (Free / Trial)"}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      {sub.orderCount} {sub.orderCount === 1 ? "order" : "orders"}
                                    </div>
                                  </td>

                                  {/* Quick Management Actions */}
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setExtendTarget(sub)
                                          setExtendDays(30)
                                        }}
                                        className="h-7 text-[11px] font-semibold rounded-lg px-2 text-slate-700 hover:text-blue-600 hover:border-blue-300 cursor-pointer"
                                        title="Extend subscription validity by 30/60/90 days"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Extend
                                      </Button>

                                      {sub.type === "user" && (
                                        <Button
                                          variant={sub.bypassSubscription ? "destructive" : "outline"}
                                          size="sm"
                                          onClick={() => handleToggleBypass(sub)}
                                          className={`h-7 text-[11px] font-semibold rounded-lg px-2 cursor-pointer ${
                                            sub.bypassSubscription
                                              ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                              : "text-slate-700 hover:text-emerald-600 hover:border-emerald-300"
                                          }`}
                                          title={
                                            sub.bypassSubscription
                                              ? "Revoke Free Pass"
                                              : "Grant Permanent Free Pass (Bypass Subscription)"
                                          }
                                        >
                                          {sub.bypassSubscription ? "Revoke Pass" : "Free Pass"}
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Flat Matrix View */
              <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5">Subscriber</th>
                      <th className="py-3 px-3">Office (CCC)</th>
                      <th className="py-3 px-3">Subscription Status & Source</th>
                      <th className="py-3 px-3">Valid Till</th>
                      <th className="py-3 px-3">Orders / Paid</th>
                      <th className="py-3 px-3 text-right">Quick Management</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {filteredSubscribers.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Subscriber Name & Role */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs uppercase">
                              {sub.type === "agency" ? (
                                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-blue-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-xs">
                                {sub.name}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                {sub.username && <span>@{sub.username} • </span>}
                                <span className="capitalize">{sub.role}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* CCC Office */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 uppercase">{sub.cccCode}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {sub.cccName || "Default Office"}
                          </div>
                        </td>

                        {/* Subscription Status & Source Badge */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {sub.source === "razorpay_paid" ? (
                              <Badge className="bg-amber-50 text-amber-800 border-amber-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <CheckCircle2 className="w-3 h-3 text-amber-600" />
                                Paid (Razorpay)
                              </Badge>
                            ) : sub.source === "admin_bypass" ? (
                              <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                Free Pass (Admin Bypass)
                              </Badge>
                            ) : sub.source === "dc_upload_trial" ? (
                              <Badge className="bg-purple-50 text-purple-800 border-purple-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <Sparkles className="w-3 h-3 text-purple-600" />
                                Free Trial (DC Upload - 90 Days)
                              </Badge>
                            ) : sub.source === "setup_window_trial" ? (
                              <Badge className="bg-blue-50 text-blue-800 border-blue-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <Clock className="w-3 h-3 text-blue-600" />
                                Free Trial (Setup Window)
                              </Badge>
                            ) : sub.source === "db_grant" ? (
                              <Badge className="bg-cyan-50 text-cyan-800 border-cyan-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <Layers className="w-3 h-3 text-cyan-600" />
                                Direct DB Grant (No Razorpay)
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-50 text-rose-800 border-rose-300 font-bold text-[10px] gap-1 px-2 py-0.5">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                Expired
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Validity & Expiry */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 font-mono text-[11px]">
                            {sub.subscriptionExpiresAt || "—"}
                          </div>
                          <div
                            className={`text-[10px] font-medium ${
                              sub.isExpired
                                ? "text-rose-600"
                                : sub.daysRemaining <= 7
                                ? "text-amber-600 font-bold"
                                : "text-emerald-600"
                            }`}
                          >
                              {sub.source === "admin_bypass"
                                ? "Permanent (Bypassed)"
                                : sub.isExpired
                                ? Math.abs(sub.daysRemaining) <= 1
                                  ? "Expired"
                                  : `Expired ${Math.abs(sub.daysRemaining)} days ago`
                                : `${sub.daysRemaining} days remaining`}
                          </div>
                        </td>

                        {/* Orders & Total Paid */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {sub.totalPaidAmount > 0
                              ? `₹${sub.totalPaidAmount.toLocaleString("en-IN")}`
                              : "₹0 (Free / Trial)"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {sub.orderCount} {sub.orderCount === 1 ? "order" : "orders"}
                          </div>
                        </td>

                        {/* Quick Management Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setExtendTarget(sub)
                                setExtendDays(30)
                              }}
                              className="h-7 text-[11px] font-semibold rounded-lg px-2 text-slate-700 hover:text-blue-600 hover:border-blue-300 cursor-pointer"
                              title="Extend subscription validity by 30/60/90 days"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Extend
                            </Button>

                            {sub.type === "user" && (
                              <Button
                                variant={sub.bypassSubscription ? "destructive" : "outline"}
                                size="sm"
                                onClick={() => handleToggleBypass(sub)}
                                className={`h-7 text-[11px] font-semibold rounded-lg px-2 cursor-pointer ${
                                  sub.bypassSubscription
                                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                    : "text-slate-700 hover:text-emerald-600 hover:border-emerald-300"
                                }`}
                                title={
                                  sub.bypassSubscription
                                    ? "Revoke Free Pass"
                                    : "Grant Permanent Free Pass (Bypass Subscription)"
                                }
                              >
                                {sub.bypassSubscription ? "Revoke Pass" : "Free Pass"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* --- VIEW 2 & 3: ORDERS & PAYMENTS LEDGER / REFUNDS --- */}
        {(activeView === "transactions" || activeView === "refunds") && (
          <div className="space-y-3">
            {filteredTransactions.length === 0 ? (
              <div className="border border-slate-200 rounded-2xl bg-white p-12 text-center text-slate-400 text-xs">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No payment transactions recorded yet.
              </div>
            ) : (
              <>
                {/* Mobile View: Zero-horizontal-scroll compact cards with minimal row height */}
                <div className="md:hidden space-y-2">
                  {filteredTransactions.map((tx) => {
                    const { date, time } = formatTxToIST(tx.created_at)
                    const isRefund = tx.refund_status || (tx.amount_refunded && tx.amount_refunded > 0)
                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTx(tx)}
                        className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs hover:border-blue-300 active:bg-slate-50/80 transition cursor-pointer"
                      >
                        {/* Header: Amount + Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              ₹{tx.amount.toLocaleString("en-IN")}
                            </span>
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 text-[9px] uppercase px-1.5 py-0 font-medium">
                              {tx.methodDetails || tx.method || "Razorpay"}
                            </Badge>
                          </div>
                          <div>
                            {isRefund ? (
                              <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold px-1.5 py-0">
                                Refunded (₹{tx.amount_refunded})
                              </Badge>
                            ) : tx.status === "captured" ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-1.5 py-0">
                                Captured
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold px-1.5 py-0">
                                {tx.status}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Middle: Subscriber & CCC */}
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 truncate max-w-[210px]">
                            {tx.subscriberName}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase font-mono font-medium">
                            CCC: <strong className="text-slate-700">{tx.ccc_code}</strong>
                          </span>
                        </div>

                        {/* Footer: Date/Time + Payment ID + Details link */}
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{date} {time ? `• ${time}` : ""}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                            <span className="truncate max-w-[100px]">{tx.razorpay_payment_id}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(tx.razorpay_payment_id, tx.razorpay_payment_id)
                              }}
                              className="text-slate-400 hover:text-slate-700 p-0.5"
                              title="Copy Payment ID"
                            >
                              {copiedId === tx.razorpay_payment_id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Desktop View: Full Data Table */}
                <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-3.5">Date & Time</th>
                        <th className="py-3 px-3">Order & Payment IDs</th>
                        <th className="py-3 px-3">Subscriber</th>
                        <th className="py-3 px-3">Plan Details</th>
                        <th className="py-3 px-3">Amount</th>
                        <th className="py-3 px-3">Method</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredTransactions.map((tx) => {
                        const { date, time } = formatTxToIST(tx.created_at)
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Timestamp in IST */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-900 text-[11px]">
                                {date}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                                <Clock className="w-2.5 h-2.5" />
                                {time}
                              </div>
                            </td>

                            {/* Order & Payment IDs */}
                            <td className="py-3 px-3">
                              <div className="space-y-1">
                                {/* Payment ID */}
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[10px] font-bold text-slate-900 truncate max-w-[130px]">
                                    {tx.razorpay_payment_id}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(tx.razorpay_payment_id, tx.razorpay_payment_id)}
                                    className="text-slate-400 hover:text-slate-700 p-0.5"
                                    title="Copy Payment ID"
                                  >
                                    {copiedId === tx.razorpay_payment_id ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>

                                {/* Order ID */}
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[9px] text-slate-400 truncate max-w-[130px]">
                                    {tx.razorpay_order_id}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Subscriber */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900 truncate max-w-[140px]">
                                {tx.subscriberName}
                              </div>
                              <div className="text-[10px] text-slate-400 uppercase">
                                CCC: <span className="font-semibold text-slate-700">{tx.ccc_code}</span>
                              </div>
                            </td>

                            {/* Plan Details */}
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-800">
                                {tx.plan_name || "Quarterly Subscription"}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                +{tx.days_granted || 90} Days Validity
                              </div>
                            </td>

                            {/* Amount */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-bold text-slate-900 text-sm">
                                ₹{tx.amount.toLocaleString("en-IN")}
                              </div>
                              {tx.fee !== undefined && (
                                <div className="text-[9px] text-slate-400">
                                  Fee: ₹{tx.fee} • Net: ₹{tx.netAmount}
                                </div>
                              )}
                            </td>

                            {/* Payment Method */}
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px] uppercase font-semibold">
                                {tx.methodDetails || tx.method || "Razorpay"}
                              </Badge>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3">
                              {tx.refund_status || (tx.amount_refunded && tx.amount_refunded > 0) ? (
                                <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">
                                  Refunded (₹{tx.amount_refunded})
                                </Badge>
                              ) : tx.status === "captured" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                  Captured
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                  {tx.status}
                                </Badge>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedTx(tx)}
                                  className="h-7 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg px-2"
                                >
                                  Inspect Receipt
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteTarget(tx)}
                                  title="Delete transaction record"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* --- MODAL 1: TRANSACTION RECEIPT INSPECTOR --- */}
      {selectedTx && (
        <Dialog open={!!selectedTx} onOpenChange={(o) => !o && setSelectedTx(null)}>
          <DialogContent className="max-w-lg w-[92vw] p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-blue-500 to-indigo-600" />
            <div className="p-5 sm:p-6 space-y-4">
              <DialogHeader className="text-left space-y-1">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    Payment Transaction Receipt
                  </DialogTitle>
                  <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                    Captured & Verified
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-500">
                  Detailed payment breakdown from Razorpay & Turso database.
                </DialogDescription>
              </DialogHeader>

              {/* Receipt Summary Card */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs text-slate-500 font-medium">Total Paid Amount</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    ₹{selectedTx.amount.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Payment ID</span>
                    <span className="font-mono text-slate-800 font-semibold select-all">
                      {selectedTx.razorpay_payment_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Order ID</span>
                    <span className="font-mono text-slate-800 font-semibold select-all">
                      {selectedTx.razorpay_order_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Subscriber</span>
                    <span className="text-slate-800 font-medium">{selectedTx.subscriberName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Supply Office</span>
                    <span className="text-slate-800 font-medium uppercase">{selectedTx.ccc_code}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Payment Method</span>
                    <span className="text-slate-800 font-medium">
                      {selectedTx.methodDetails || selectedTx.method || "Razorpay Gateway"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Transaction Time (IST)</span>
                    <span className="text-slate-800 font-medium">
                      {(() => {
                        const { date, time } = formatTxToIST(selectedTx.created_at)
                        return date !== "—" ? `${date}, ${time}` : "—"
                      })()}
                    </span>
                  </div>
                </div>

                {/* Gateway Fee Deductions */}
                {selectedTx.fee !== undefined && (
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Razorpay Fee & Tax: ₹{selectedTx.fee}</span>
                    <span className="font-bold text-slate-800">Net Settled: ₹{selectedTx.netAmount}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <a
                  href={selectedTx.razorpayDashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 underline decoration-blue-300"
                >
                  <span>Open in Razorpay Dashboard</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget(selectedTx)
                    }}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-semibold h-8"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                  {selectedTx.status === "captured" && !selectedTx.refund_status && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRefundTarget(selectedTx)
                        setRefundAmount(selectedTx.amount.toString())
                      }}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-semibold h-8"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Refund
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTx(null)}
                    className="text-slate-600 hover:bg-slate-100 text-xs h-8"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- MODAL 2: EXTEND SUBSCRIPTION DAYS --- */}
      {extendTarget && (
        <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
          <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
            <div className="p-5 space-y-4">
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Extend Subscription Validity
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Grant extra validity days to{" "}
                  <span className="font-bold text-slate-800">{extendTarget.name}</span> (
                  {extendTarget.cccCode}).
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                <label className="text-xs font-semibold text-slate-700 block">Select Days to Add:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[14, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExtendDays(d)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        extendDays === d
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      +{d} Days
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">
                    Or enter custom days:
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={extendDays}
                    onChange={(e) => setExtendDays(parseInt(e.target.value) || 30)}
                    className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtendTarget(null)}
                  className="text-xs text-slate-600 hover:bg-slate-100 h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessingAction}
                  onClick={handleExtendDays}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-xs"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Extending...
                    </>
                  ) : (
                    `Grant +${extendDays} Days`
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- MODAL 3: INITIATE REFUND --- */}
      {refundTarget && (
        <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
          <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
            <div className="h-1.5 w-full bg-rose-500" />
            <div className="p-5 space-y-4">
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Initiate Razorpay Refund
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  This will process an immediate refund through Razorpay to the customer's original payment method.
                </DialogDescription>
              </DialogHeader>

              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1">
                <div className="text-rose-900 font-bold">Payment ID: {refundTarget.razorpay_payment_id}</div>
                <div className="text-rose-700">Original Amount: ₹{refundTarget.amount}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Refund Amount (₹):</label>
                <Input
                  type="number"
                  step="1"
                  max={refundTarget.amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl font-bold"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRefundTarget(null)}
                  className="text-xs text-slate-600 hover:bg-slate-100 h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessingAction}
                  onClick={handleRefund}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-xs"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Processing...
                    </>
                  ) : (
                    `Confirm Refund ₹${refundAmount}`
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- MODAL 4: DELETE / REMOVE TEST TRANSACTION --- */}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900">
            <div className="h-1.5 w-full bg-rose-600" />
            <div className="p-5 space-y-4">
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  Remove Transaction
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Are you sure you want to permanently remove this transaction from the database and prevent auto-reconciliation?
                </DialogDescription>
              </DialogHeader>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Payment ID:</span>
                  <span className="font-mono font-bold text-slate-800">{deleteTarget.razorpay_payment_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Subscriber / Agency:</span>
                  <span className="font-semibold text-slate-800">{deleteTarget.subscriberName} ({deleteTarget.agency_name || deleteTarget.username})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Amount:</span>
                  <span className="font-bold text-emerald-700">₹{deleteTarget.amount}</span>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(null)}
                  className="text-xs text-slate-600 hover:bg-slate-100 h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessingAction}
                  onClick={handleDeletePayment}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-xs"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Removing...
                    </>
                  ) : (
                    "Remove Transaction"
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

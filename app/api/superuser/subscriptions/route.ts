import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"
import { getRazorpayClient } from "@/lib/razorpay"
import { BILLING_START_DATE_STR, isBillingActive } from "@/lib/billing-config"

export const dynamic = "force-dynamic"

export interface SubscriberItem {
  id: string
  type: "agency" | "user"
  name: string
  username?: string
  role: string
  cccCode: string
  cccName?: string
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  bypassSubscription: boolean
  daysRemaining: number
  isExpired: boolean
  source: "razorpay_paid" | "dc_upload_trial" | "setup_window_trial" | "admin_bypass" | "db_grant" | "expired"
  sourceLabel: string
  totalPaidAmount: number
  orderCount: number
  lastPaymentDate?: string | null
  firstDcUploadAt?: string | null
}

export interface TransactionItem {
  id: string
  razorpay_order_id: string
  razorpay_payment_id: string
  amount: number
  currency: string
  status: "captured" | "authorized" | "failed" | "refunded"
  method?: string
  methodDetails?: string
  vpa?: string
  bank?: string
  wallet?: string
  fee?: number
  tax?: number
  netAmount?: number
  refund_status?: string | null
  amount_refunded?: number
  plan_id?: string
  plan_name?: string
  days_granted?: number
  subscription_expires_at?: string
  created_at: string
  subscriberName: string
  username?: string
  ccc_code: string
  user_id?: string
  razorpayDashboardUrl: string
}

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()

    // 1. Fetch DB transactions
    let dbTransactions: any[] = []
    try {
      const txRes = await db.execute(`
        SELECT pt.*, u.username, u.full_name as user_full_name
        FROM payment_transactions pt
        LEFT JOIN users u ON pt.user_id = u.id
        ORDER BY pt.created_at DESC
      `)
      dbTransactions = txRes.rows || []
    } catch (e) {
      console.warn("[Subscriptions API] payment_transactions query note:", e)
    }

    // 2. Fetch CCC Registry (for cccName and first_dc_upload_at)
    const cccMap = new Map<string, { name: string; firstDcUploadAt?: string | null }>()
    try {
      const cccRes = await db.execute(`SELECT ccc_code, ccc_name, first_dc_upload_at FROM ccc_registry`)
      for (const row of cccRes.rows || []) {
        const code = String(row.ccc_code || "").toUpperCase()
        cccMap.set(code, {
          name: String(row.ccc_name || code),
          firstDcUploadAt: row.first_dc_upload_at ? String(row.first_dc_upload_at) : null,
        })
      }
    } catch (e) {
      console.warn("[Subscriptions API] ccc_registry query note:", e)
    }

    // 3. Fetch Agencies
    let agencies: any[] = []
    try {
      const agRes = await db.execute(`
        SELECT a.id, a.name, a.vendor_code, a.subscription_status, a.subscription_expires_at, a.created_at,
               c.ccc_code, c.ccc_name, c.first_dc_upload_at
        FROM agencies a
        JOIN ccc_registry c ON a.ccc_id = c.id
        ORDER BY a.name ASC
      `)
      agencies = agRes.rows || []
    } catch (e) {
      console.warn("[Subscriptions API] agencies query note:", e)
    }

    // 4. Fetch Users
    let users: any[] = []
    try {
      const uRes = await db.execute(`
        SELECT u.id, u.username, u.full_name, u.role, u.agencies, u.subscription_status, 
               u.subscription_expires_at, u.bypass_subscription, u.created_at,
               c.ccc_code, c.ccc_name, c.first_dc_upload_at
        FROM users u
        LEFT JOIN ccc_registry c ON u.ccc_id = c.id
        ORDER BY u.created_at DESC
      `)
      users = uRes.rows || []
    } catch (e) {
      console.warn("[Subscriptions API] users query note:", e)
    }

    // 5. Try fetching live telemetry from Razorpay API
    let livePaymentsMap = new Map<string, any>()
    let razorpayConnected = false
    try {
      const razorpay = getRazorpayClient()
      const rzPayments = await razorpay.payments.all({ count: 50 })
      if (rzPayments && Array.isArray(rzPayments.items)) {
        razorpayConnected = true
        for (const item of rzPayments.items) {
          livePaymentsMap.set(item.id, item)
        }
      }
    } catch (rzErr: any) {
      // Live Razorpay credentials may not be present in local dev or error
      console.log("[Subscriptions API] Razorpay live fetch note:", rzErr?.message || rzErr)
    }

    // 6. Map payment transactions and calculate user/agency totals
    const userPaymentsMap = new Map<string, { totalAmount: number; count: number; lastDate: string }>()
    const agencyPaymentsMap = new Map<string, { totalAmount: number; count: number; lastDate: string }>()

    const transactions: TransactionItem[] = dbTransactions.map((tx: any) => {
      const pid = String(tx.razorpay_payment_id || "")
      const rzInfo = livePaymentsMap.get(pid)
      const amountRupees = typeof tx.amount === "number" ? (tx.amount >= 100 ? tx.amount / 100 : tx.amount) : 0

      // Update aggregator maps
      const uid = String(tx.user_id || "")
      if (uid) {
        const uStat = userPaymentsMap.get(uid) || { totalAmount: 0, count: 0, lastDate: "" }
        uStat.totalAmount += amountRupees
        uStat.count += 1
        if (!uStat.lastDate || new Date(tx.created_at) > new Date(uStat.lastDate)) {
          uStat.lastDate = tx.created_at
        }
        userPaymentsMap.set(uid, uStat)
      }

      const agKey = `${String(tx.ccc_code || "").toUpperCase()}_${String(tx.agency_name || "").toUpperCase()}`
      if (tx.agency_name) {
        const aStat = agencyPaymentsMap.get(agKey) || { totalAmount: 0, count: 0, lastDate: "" }
        aStat.totalAmount += amountRupees
        aStat.count += 1
        if (!aStat.lastDate || new Date(tx.created_at) > new Date(aStat.lastDate)) {
          aStat.lastDate = tx.created_at
        }
        agencyPaymentsMap.set(agKey, aStat)
      }

      // Method description
      let method = rzInfo?.method || "razorpay"
      let methodDetails = ""
      if (rzInfo) {
        if (rzInfo.method === "upi") {
          methodDetails = rzInfo.vpa || "UPI"
        } else if (rzInfo.method === "card") {
          methodDetails = rzInfo.card?.network ? `${rzInfo.card.network} •••• ${rzInfo.card.last4 || ""}` : "Card"
        } else if (rzInfo.method === "netbanking") {
          methodDetails = rzInfo.bank || "Netbanking"
        } else if (rzInfo.method === "wallet") {
          methodDetails = rzInfo.wallet || "Wallet"
        }
      }

      const fee = rzInfo?.fee ? rzInfo.fee / 100 : undefined
      const tax = rzInfo?.tax ? rzInfo.tax / 100 : undefined
      const netAmount = fee !== undefined ? amountRupees - fee : amountRupees

      return {
        id: String(tx.id || pid),
        razorpay_order_id: String(tx.razorpay_order_id || ""),
        razorpay_payment_id: pid,
        amount: amountRupees,
        currency: String(tx.currency || "INR"),
        status: (rzInfo?.status as any) || "captured",
        method,
        methodDetails,
        vpa: rzInfo?.vpa,
        bank: rzInfo?.bank,
        wallet: rzInfo?.wallet,
        fee,
        tax,
        netAmount,
        refund_status: rzInfo?.refund_status || null,
        amount_refunded: rzInfo?.amount_refunded ? rzInfo.amount_refunded / 100 : 0,
        plan_id: tx.plan_id,
        plan_name: tx.plan_name,
        days_granted: tx.days_granted,
        subscription_expires_at: tx.subscription_expires_at,
        created_at: tx.created_at,
        subscriberName: tx.agency_name || tx.user_full_name || tx.username || "Unknown Subscriber",
        username: tx.username,
        ccc_code: String(tx.ccc_code || "").toUpperCase(),
        user_id: tx.user_id,
        razorpayDashboardUrl: `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(pid)}`,
      }
    })

    // 7. Build complete Subscribers List (agencies & users)
    const subscribers: SubscriberItem[] = []

    // Helper to calculate source and expiration info
    function evaluateSubscription(
      expiresAtStr: string | null | undefined,
      bypassed: boolean,
      firstDcUploadAtStr: string | null | undefined,
      hasPaidTx: boolean
    ): {
      isExpired: boolean
      daysRemaining: number
      source: SubscriberItem["source"]
      sourceLabel: string
    } {
      if (bypassed) {
        return {
          isExpired: false,
          daysRemaining: 999,
          source: "admin_bypass",
          sourceLabel: "Admin Bypass (Free Pass)",
        }
      }

      let expDate: Date | null = null
      if (expiresAtStr) {
        const parsed = new Date(expiresAtStr)
        if (!isNaN(parsed.getTime())) {
          expDate = parsed
        }
      }

      if (!expDate) {
        // Default to billing start date if not set
        expDate = new Date(`${BILLING_START_DATE_STR}T23:59:59`)
      }

      const diffMs = expDate.getTime() - now.getTime()
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const isExpired = isBillingActive() && daysRemaining <= 0

      if (isExpired) {
        return {
          isExpired: true,
          daysRemaining,
          source: "expired",
          sourceLabel: "Expired",
        }
      }

      if (hasPaidTx) {
        return {
          isExpired: false,
          daysRemaining,
          source: "razorpay_paid",
          sourceLabel: "Paid (Razorpay)",
        }
      }

      if (firstDcUploadAtStr) {
        return {
          isExpired: false,
          daysRemaining,
          source: "dc_upload_trial",
          sourceLabel: "Free Trial (DC List Upload - 90 Days)",
        }
      }

      if (!isBillingActive() || daysRemaining > 0) {
        return {
          isExpired: false,
          daysRemaining,
          source: "setup_window_trial",
          sourceLabel: "Free Trial (Setup Window)",
        }
      }

      return {
        isExpired: false,
        daysRemaining,
        source: "db_grant",
        sourceLabel: "Direct DB Grant (No Razorpay)",
      }
    }

    // Process Agencies
    for (const ag of agencies) {
      const cccCode = String(ag.ccc_code || "").toUpperCase()
      const agKey = `${cccCode}_${String(ag.name || "").toUpperCase()}`
      const paymentInfo = agencyPaymentsMap.get(agKey) || { totalAmount: 0, count: 0, lastDate: null }
      const hasPaid = paymentInfo.count > 0

      const { isExpired, daysRemaining, source, sourceLabel } = evaluateSubscription(
        ag.subscription_expires_at,
        false,
        ag.first_dc_upload_at,
        hasPaid
      )

      subscribers.push({
        id: `agency_${ag.id}`,
        type: "agency",
        name: ag.name,
        role: "agency",
        cccCode,
        cccName: ag.ccc_name || cccCode,
        subscriptionStatus: isExpired ? "expired" : "active",
        subscriptionExpiresAt: ag.subscription_expires_at || BILLING_START_DATE_STR,
        bypassSubscription: false,
        daysRemaining,
        isExpired,
        source,
        sourceLabel,
        totalPaidAmount: paymentInfo.totalAmount,
        orderCount: paymentInfo.count,
        lastPaymentDate: paymentInfo.lastDate,
        firstDcUploadAt: ag.first_dc_upload_at,
      })
    }

    // Process Users (focus on agency & admin users)
    for (const u of users) {
      const cccCode = String(u.ccc_code || "").toUpperCase()
      const paymentInfo = userPaymentsMap.get(String(u.id)) || { totalAmount: 0, count: 0, lastDate: null }
      const hasPaid = paymentInfo.count > 0

      const { isExpired, daysRemaining, source, sourceLabel } = evaluateSubscription(
        u.subscription_expires_at,
        !!u.bypass_subscription,
        u.first_dc_upload_at,
        hasPaid
      )

      subscribers.push({
        id: `user_${u.id}`,
        type: "user",
        name: u.full_name || u.username,
        username: u.username,
        role: u.role,
        cccCode,
        cccName: u.ccc_name || cccCode,
        subscriptionStatus: isExpired ? "expired" : "active",
        subscriptionExpiresAt: u.subscription_expires_at || BILLING_START_DATE_STR,
        bypassSubscription: !!u.bypass_subscription,
        daysRemaining,
        isExpired,
        source,
        sourceLabel,
        totalPaidAmount: paymentInfo.totalAmount,
        orderCount: paymentInfo.count,
        lastPaymentDate: paymentInfo.lastDate,
        firstDcUploadAt: u.first_dc_upload_at,
      })
    }

    // 8. Compute KPI Summary
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.status === "captured" ? t.amount : 0), 0)
    const totalRefunded = transactions.reduce((sum, t) => sum + (t.amount_refunded || 0), 0)
    const activePaidCount = subscribers.filter((s) => s.source === "razorpay_paid" && !s.isExpired).length
    const dbActiveCount = subscribers.filter((s) => s.source !== "razorpay_paid" && !s.isExpired).length
    const trialCount = subscribers.filter(
      (s) => (s.source === "dc_upload_trial" || s.source === "setup_window_trial") && !s.isExpired
    ).length
    const bypassedCount = subscribers.filter((s) => s.source === "admin_bypass").length
    const expiredCount = subscribers.filter((s) => s.isExpired).length

    return NextResponse.json({
      metrics: {
        totalRevenue,
        totalRefunded,
        netRevenue: totalRevenue - totalRefunded,
        totalOrdersCount: transactions.length,
        totalSubscribers: subscribers.length,
        activePaidCount,
        dbActiveCount,
        trialCount,
        bypassedCount,
        expiredCount,
      },
      subscribers,
      transactions,
      razorpayConnected,
      billingStartDate: BILLING_START_DATE_STR,
      isBillingActive: isBillingActive(),
    })
  } catch (error: any) {
    console.error("[Subscriptions API Error]:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}

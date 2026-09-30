import { db } from "@/lib/db"
import { invalidateAgencyCache } from "@/lib/agency-storage"
import { randomUUID } from "crypto"

export interface ReconcileResult {
  reconciled: boolean
  alreadyProcessed?: boolean
  reason?: string
  paymentId?: string
  agencyName?: string
  expiresAt?: string
  cccCode?: string
}

/**
 * Reconciles a captured payment from Razorpay into Turso DB and activates agency access.
 * Safe to call repeatedly — protected by unique checks on razorpay_payment_id.
 */
export async function reconcileCapturedPayment(payment: any): Promise<ReconcileResult> {
  const paymentId = String(payment?.id || "").trim()
  if (!paymentId) {
    return { reconciled: false, reason: "Invalid payment object: missing ID" }
  }

  if (payment.status !== "captured") {
    return { reconciled: false, reason: `Payment ${paymentId} status is '${payment.status}', not 'captured'` }
  }

  try {
    // 1. Duplicate check: is this payment already recorded?
    const existing = await db.execute({
      sql: `SELECT id, ccc_code, agency_name, subscription_expires_at 
            FROM payment_transactions 
            WHERE razorpay_payment_id = ? 
            LIMIT 1`,
      args: [paymentId],
    })

    if (existing.rows && existing.rows.length > 0) {
      const row: any = existing.rows[0]
      return {
        reconciled: true,
        alreadyProcessed: true,
        paymentId,
        agencyName: row.agency_name,
        expiresAt: row.subscription_expires_at,
        cccCode: row.ccc_code,
      }
    }

    // 2. Extract metadata from payment.notes
    const notes = payment.notes || {}
    let cccCode = String(notes.cccCode || "").trim()
    const userId = String(notes.userId || "").trim()
    const username = String(notes.username || "").trim()
    const amount = typeof payment.amount === "number" ? payment.amount : parseInt(String(payment.amount), 10)
    
    // Resolve plan from amount or notes
    const { getPlanByAmount, getPlanById } = await import("@/lib/subscription-plans")
    const matchedPlan = getPlanByAmount(amount) || (notes.planId ? getPlanById(notes.planId) : null)
    const planDays = parseInt(notes.days, 10) || matchedPlan?.days || 30
    const planId = notes.planId || matchedPlan?.id || "monthly_79"
    const planName = notes.planName || matchedPlan?.name || "1 Month Vendor Access"
    const orderId = String(payment.order_id || "").trim()

    let agencyName = ""
    let vendorCode = ""

    // 3. Resolve user and CCC context if missing from notes
    if (userId || username) {
      try {
        const uRes = await db.execute({
          sql: `SELECT u.id, u.username, u.full_name, u.agencies, c.ccc_code 
                FROM users u 
                LEFT JOIN ccc_registry c ON u.ccc_id = c.id 
                WHERE u.id = ? OR u.username = ? COLLATE NOCASE
                LIMIT 1`,
          args: [userId || username, username || userId],
        })

        if (uRes.rows && uRes.rows.length > 0) {
          const uRow: any = uRes.rows[0]
          if (!cccCode && uRow.ccc_code) cccCode = String(uRow.ccc_code)
          
          const userAgencies = uRow.agencies 
            ? String(uRow.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) 
            : []
          if (userAgencies.length > 0) {
            agencyName = userAgencies[0]
          } else if (uRow.full_name) {
            agencyName = String(uRow.full_name).trim()
          }
        }
      } catch (err) {
        console.warn("[Reconcile] User lookup error:", err)
      }
    }

    if (!agencyName && username) {
      // Clean username suffix e.g. "samad_chanchal" -> "samad"
      const cleanAgency = username.replace(/_[a-zA-Z0-9]+$/, "").trim()
      agencyName = cleanAgency.toUpperCase()
    }

    if (!agencyName) {
      agencyName = "UNKNOWN_AGENCY"
    }

    if (!cccCode) {
      return { reconciled: false, reason: `Could not identify CCC for payment ${paymentId}` }
    }

    // 4. Look up existing agency row to preserve vendor code and calculate expiry
    const now = new Date()
    let baseDate = new Date()
    try {
      const agRes = await db.execute({
        sql: `SELECT a.id, a.name, a.vendor_code, a.subscription_expires_at
              FROM agencies a
              JOIN ccc_registry c ON a.ccc_id = c.id
              WHERE c.ccc_code = ? COLLATE NOCASE
                AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE OR a.vendor_code = ? COLLATE NOCASE)
              LIMIT 1`,
        args: [cccCode, agencyName, username, agencyName],
      })

      if (agRes.rows && agRes.rows.length > 0) {
        const aRow: any = agRes.rows[0]
        if (aRow.name) agencyName = String(aRow.name)
        if (aRow.vendor_code) vendorCode = String(aRow.vendor_code)
        if (aRow.subscription_expires_at) {
          const agExp = new Date(aRow.subscription_expires_at)
          if (!isNaN(agExp.getTime()) && agExp > now) {
            baseDate = agExp
          }
        }
      }
    } catch (agErr) {
      console.warn("[Reconcile] Agency lookup error:", agErr)
    }

    baseDate.setDate(baseDate.getDate() + planDays)
    const expiresAt = baseDate.toISOString().split("T")[0]

    // 5. Insert transaction into payment_transactions
    const txId = randomUUID()
    const createdAtStr = payment.created_at
      ? new Date(payment.created_at * 1000).toISOString()
      : new Date().toISOString()

    await db.execute({
      sql: `INSERT INTO payment_transactions (
        id, user_id, ccc_code, agency_name, vendor_code,
        razorpay_order_id, razorpay_payment_id, amount, currency,
        plan_id, plan_name, days_granted, subscription_expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?)`,
      args: [
        txId,
        userId || "reconciled_user",
        cccCode,
        agencyName,
        vendorCode || null,
        orderId || "unknown_order",
        paymentId,
        amount,
        planId,
        planName,
        planDays,
        expiresAt,
        createdAtStr,
      ],
    })

    // 6. Update agency in agencies table if it exists in Manage Agencies (never create new agency)
    const updateRes = await db.execute({
      sql: `UPDATE agencies
            SET subscription_status = 'active',
                subscription_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1)
              AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE OR name = ? COLLATE NOCASE)`,
      args: [expiresAt, cccCode, agencyName, agencyName, username],
    })

    if (updateRes.rowsAffected && updateRes.rowsAffected > 0) {
      invalidateAgencyCache(cccCode)
    } else {
      console.log(`ℹ️ [Reconcile] Agency '${agencyName}' does not exist in Manage Agencies for CCC '${cccCode}' — skipped agency creation`)
    }

    // Also update user directly in users table
    if (userId || username) {
      await db.execute({
        sql: `UPDATE users
              SET subscription_status = 'active',
                  subscription_expires_at = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ? OR username = ? COLLATE NOCASE`,
        args: [expiresAt, userId || username, username || userId],
      })
    }

    invalidateAgencyCache(cccCode)

    console.log(
      `🎉 [Payment Auto-Reconciled] Successfully synced captured payment ${paymentId} for agency '${agencyName}' (CCC: ${cccCode}) -> Active until ${expiresAt}`
    )

    return {
      reconciled: true,
      paymentId,
      agencyName,
      expiresAt,
      cccCode,
    }
  } catch (error: any) {
    console.error(`[Reconcile Error] Failed to reconcile payment ${paymentId}:`, error)
    return {
      reconciled: false,
      reason: error?.message || "Internal database error during reconciliation",
    }
  }
}

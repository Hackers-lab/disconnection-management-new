import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"
import { createSubscriptionOrder } from "@/lib/razorpay"
import { getPlanByAmount, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans"

import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Endpoint to create a Razorpay Order strictly for vendor subscriptions.
 * POST /api/create-order
 *
 * Only accepts amounts that match predefined subscription plans.
 * The `days` field is derived server-side from the plan catalog — never from the client.
 */
export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized: Please log in to continue" }, { status: 401 })
    }

    // Security check: Verify that the user still exists in the database and was not deleted
    try {
      const userCheck = await db.execute({
        sql: `SELECT u.id, u.status, u.role, u.ccc_id, c.ccc_code 
              FROM users u
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE u.id = ? OR (u.username = ? COLLATE NOCASE AND c.ccc_code = ? COLLATE NOCASE)
              LIMIT 1`,
        args: [session.userId, session.username, session.cccCode || ""]
      })

      if (!userCheck.rows || userCheck.rows.length === 0) {
        console.warn(`⚠️ [Order Blocked] User '${session.username}' (${session.userId}) was deleted or does not exist in DB.`)
        return NextResponse.json(
          { error: "Your user account is no longer active or was removed by the office administrator. Please contact your office." },
          { status: 403 }
        )
      }

      const activeUser: any = userCheck.rows[0]
      if (activeUser.status && String(activeUser.status).toUpperCase() === "INACTIVE") {
        return NextResponse.json(
          { error: "Your user account has been deactivated. Please contact your office administrator." },
          { status: 403 }
        )
      }

      // If user is an agency, check that their agency still exists in Manage Agencies for this CCC
      if (session.role === "agency" || (session.agencies && session.agencies.length > 0)) {
        const agencyName = (session.agencies && session.agencies.length > 0) ? session.agencies[0] : session.username
        const cccCode = session.cccCode || activeUser.ccc_code
        if (cccCode && agencyName) {
          const agencyCheck = await db.execute({
            sql: `SELECT a.id, a.name, a.is_active 
                  FROM agencies a
                  JOIN ccc_registry c ON a.ccc_id = c.id
                  WHERE c.ccc_code = ? COLLATE NOCASE
                    AND (a.name = ? COLLATE NOCASE OR a.vendor_code = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE)
                  LIMIT 1`,
            args: [cccCode, agencyName, agencyName, session.username]
          })

          if (!agencyCheck.rows || agencyCheck.rows.length === 0) {
            console.warn(`⚠️ [Order Blocked] Agency '${agencyName}' is no longer registered under CCC '${cccCode}'.`)
            return NextResponse.json(
              { error: `Agency '${agencyName}' is not registered under your office. Please contact your office administrator.` },
              { status: 403 }
            )
          }

          const agencyRow: any = agencyCheck.rows[0]
          if (agencyRow.is_active === 0 || agencyRow.is_active === false) {
            return NextResponse.json(
              { error: `Agency '${agencyName}' is currently marked inactive by the office administrator.` },
              { status: 403 }
            )
          }
        }
      }
    } catch (dbErr: any) {
      console.warn("Database verification check warning during order creation:", dbErr)
    }

    const body = await request.json().catch(() => ({}))
    const { amount = 9900 } = body

    // Enforce that amount matches a predefined subscription plan
    const parsedAmount = typeof amount === "number" ? amount : parseInt(amount, 10)
    const plan = getPlanByAmount(parsedAmount)

    if (!plan) {
      return NextResponse.json(
        {
          error: `Invalid plan amount. Allowed plans: ${SUBSCRIPTION_PLANS.map((p) => `₹${(p.amount / 100).toFixed(0)} (${p.name})`).join(", ")}`,
        },
        { status: 400 }
      )
    }

    const orderData = await createSubscriptionOrder({
      amount: plan.amount,
      currency: "INR",
      receipt: `sub_${session.userId}_${Date.now()}`,
      notes: {
        userId: session.userId,
        username: session.username,
        role: session.role,
        cccCode: session.cccCode || "",
        planId: plan.id,
        planName: plan.name,
        days: String(plan.days),
      },
    })

    return NextResponse.json({
      success: true,
      ...orderData,
      planId: plan.id,
      planName: plan.name,
      days: plan.days,
    })
  } catch (error: any) {
    console.error("POST /api/create-order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create payment order" },
      { status: 500 }
    )
  }
})

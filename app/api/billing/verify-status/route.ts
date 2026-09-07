import { NextRequest, NextResponse } from "next/server"
import { verifySession, createSession } from "@/lib/session"
import { isAgencySubscribed } from "@/lib/agency-storage"
import { getRazorpayClient } from "@/lib/razorpay"
import { reconcileCapturedPayment } from "@/lib/billing-reconcile"

export const dynamic = "force-dynamic"

/**
 * Endpoint to auto-check and recover subscription status for the current user.
 * POST /api/billing/verify-status
 *
 * If a user completes payment on UPI but the browser tab was refreshed/closed,
 * this endpoint checks Razorpay for recently captured payments belonging to this user/CCC
 * and automatically activates access without requiring another payment.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cccCode = session.cccCode || ""
    const rawAgencies = session.agencies || []
    const agencyName = rawAgencies.length > 0 ? rawAgencies[0] : (session.name || session.username)

    // 1. First check if agency is already active in DB
    if (cccCode && agencyName) {
      const sub = await isAgencySubscribed(cccCode, agencyName)
      if (sub.subscribed) {
        return NextResponse.json({
          subscribed: true,
          expiresAt: sub.expiresAt,
          agencyName,
          recovered: false,
        })
      }
    }

    // 2. Check Razorpay live API for any recent captured payments for this user/CCC
    try {
      const razorpay = getRazorpayClient()
      const rzPayments = await razorpay.payments.all({ count: 20 })

      if (rzPayments?.items) {
        const capturedMatch = rzPayments.items.find((item: any) => {
          if (item.status !== "captured") return false
          const notes = item.notes || {}
          const matchesUser = notes.userId === session.userId || 
            (notes.username && notes.username.toLowerCase() === session.username.toLowerCase())
          const matchesCcc = notes.cccCode && notes.cccCode.toLowerCase() === cccCode.toLowerCase()
          return matchesUser || (matchesCcc && notes.agencyName === agencyName)
        })

        if (capturedMatch) {
          const rec = await reconcileCapturedPayment(capturedMatch)
          if (rec.reconciled) {
            // Re-issue session cookie with active subscription
            await createSession(
              session.userId,
              session.username,
              session.role,
              session.agencies || [],
              session.cccCode,
              session.name || "",
              "active",
              rec.expiresAt || "",
              session.bypassSubscription || false
            )

            return NextResponse.json({
              subscribed: true,
              expiresAt: rec.expiresAt,
              agencyName: rec.agencyName || agencyName,
              paymentId: capturedMatch.id,
              recovered: true,
            })
          }
        }
      }
    } catch (rzErr) {
      console.warn("[Verify Status Check] Razorpay lookup warning:", rzErr)
    }

    return NextResponse.json({
      subscribed: false,
      agencyName,
      cccCode,
    })
  } catch (error: any) {
    console.error("POST /api/billing/verify-status error:", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}

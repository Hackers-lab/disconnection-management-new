import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"
import { UserStorage } from "@/lib/user-storage"
import { invalidateAgencyCache } from "@/lib/agency-storage"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.userId
    const cccCode = session.cccCode || "SYSTEM"

    // Query user details from DB
    const res = await db.execute({
      sql: `SELECT u.id, u.username, u.full_name, u.mobile_number, u.email, u.role, 
                   u.agencies, u.subscription_status, u.subscription_expires_at, u.bypass_subscription,
                   c.ccc_code, c.ccc_name
            FROM users u
            LEFT JOIN ccc_registry c ON u.ccc_id = c.id
            WHERE u.id = ?
            LIMIT 1`,
      args: [userId]
    })

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const row: any = res.rows[0]
    const userRole = String(row.role || session.role || "viewer").toLowerCase()
    const username = String(row.username || session.username || "")
    let userMobile = String(row.mobile_number || "").trim()
    let agencyMobile = ""
    let vendorCode = ""

    // Check if user is an agency or has assigned agencies to retrieve vendor_code and agency mobile if needed
    const rawAgencies = row.agencies ? String(row.agencies).split(",").map((s: string) => s.trim()).filter(Boolean) : []
    const agencyNameToCheck = userRole === "agency" ? (rawAgencies[0] || username) : (rawAgencies[0] || "")

    if (agencyNameToCheck || userRole === "agency") {
      try {
        const agencyRes = await db.execute({
          sql: `SELECT a.vendor_code, a.mobile_number 
                FROM agencies a
                JOIN ccc_registry c ON a.ccc_id = c.id
                WHERE c.ccc_code = ? COLLATE NOCASE 
                  AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE)
                LIMIT 1`,
          args: [cccCode, agencyNameToCheck, username]
        })
        if (agencyRes.rows && agencyRes.rows.length > 0) {
          const aRow: any = agencyRes.rows[0]
          if (aRow.vendor_code) {
            vendorCode = String(aRow.vendor_code).trim()
          }
          if (aRow.mobile_number) {
            agencyMobile = String(aRow.mobile_number).trim()
          }
        }
      } catch (err) {
        console.warn("Agency vendor code lookup error:", err)
      }
    }

    // Check if this user or agency has verified paid transactions in payment_transactions
    let isPaid = false
    let planName = ""
    let lastPaymentDate = ""
    let paymentHistory: any[] = []
    try {
      const txCheck = await db.execute({
        sql: `SELECT id, razorpay_payment_id, razorpay_order_id, amount, currency, plan_name, days_granted, subscription_expires_at, created_at 
              FROM payment_transactions 
              WHERE (user_id = ? OR ccc_code = ? COLLATE NOCASE AND agency_name = ? COLLATE NOCASE)
              ORDER BY created_at DESC 
              LIMIT 15`,
        args: [String(row.id), cccCode, agencyNameToCheck || username],
      })
      if (txCheck.rows && txCheck.rows.length > 0) {
        paymentHistory = txCheck.rows.map((r: any) => ({
          id: String(r.id),
          paymentId: String(r.razorpay_payment_id || ""),
          orderId: String(r.razorpay_order_id || ""),
          amount: Number(r.amount || 0) / 100,
          currency: String(r.currency || "INR"),
          planName: String(r.plan_name || "Vendor Access"),
          daysGranted: Number(r.days_granted || 30),
          expiresAt: String(r.subscription_expires_at || ""),
          createdAt: String(r.created_at || ""),
        }))
        const txRow: any = txCheck.rows[0]
        isPaid = true
        planName = String(txRow.plan_name || "Pro Vendor Access")
        lastPaymentDate = String(txRow.created_at || "")
      }
    } catch (txErr) {
      console.warn("payment_transactions check warning in profile:", txErr)
    }

    const currentSubStatus = String(row.subscription_status || session.subscriptionStatus || "active")
    if (currentSubStatus === "paid") {
      isPaid = true
    }

    return NextResponse.json({
      id: String(row.id),
      username,
      name: String(row.full_name || username),
      fullName: String(row.full_name || username),
      email: String(row.email || ""),
      role: userRole,
      cccCode: String(row.ccc_code || cccCode),
      cccName: String(row.ccc_name || cccCode),
      agencies: rawAgencies.length > 0 ? rawAgencies : (userRole === "agency" ? [username] : []),
      mobileNumber: userMobile || agencyMobile, // fallback for legacy callers
      userMobile: userMobile,
      agencyMobile: agencyMobile,
      vendorCode,
      hasAgency: Boolean(agencyNameToCheck || userRole === "agency"),
      subscriptionStatus: currentSubStatus,
      subscriptionExpiresAt: String(row.subscription_expires_at || session.subscriptionExpiresAt || ""),
      bypassSubscription: Boolean(row.bypass_subscription ?? session.bypassSubscription),
      isSubscribed: session.isSubscribed,
      isPaid,
      planName: planName || (isPaid ? "Pro Vendor Access" : ""),
      lastPaymentDate,
      paymentHistory,
    }, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    })
  } catch (error: any) {
    console.error("Error fetching user profile:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch profile" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.userId
    const cccCode = session.cccCode || "SYSTEM"
    const body = await req.json()
    const { mobileNumber, userMobile, agencyMobile, vendorCode, fullName, email } = body

    // agencyMobile defaults to mobileNumber if not explicitly passed
    const targetAgencyMobile = agencyMobile !== undefined ? String(agencyMobile).trim() : (mobileNumber !== undefined ? String(mobileNumber).trim() : null)
    // userMobile defaults to mobileNumber if not explicitly passed
    const targetUserMobile = userMobile !== undefined ? String(userMobile).trim() : (mobileNumber !== undefined ? String(mobileNumber).trim() : null)

    const cleanAgencyMobile = targetAgencyMobile ? targetAgencyMobile.replace(/\D/g, "").slice(-10) : null
    const cleanUserMobile = targetUserMobile ? targetUserMobile.replace(/\D/g, "").slice(-10) : null
    const cleanVendor = vendorCode !== undefined && vendorCode ? String(vendorCode).trim() : null
    const cleanName = fullName !== undefined ? String(fullName).trim() : null
    const cleanEmail = email !== undefined ? String(email).trim() : null

    // Validation
    if (cleanAgencyMobile && cleanAgencyMobile.length !== 10) {
      return NextResponse.json({ error: "Agency contact mobile number must be exactly 10 digits" }, { status: 400 })
    }

    if (cleanUserMobile) {
      if (cleanUserMobile.length !== 10) {
        return NextResponse.json({ error: "User personal mobile number must be exactly 10 digits" }, { status: 400 })
      }
      // Check uniqueness across all users table
      const conflictRes = await db.execute({
        sql: `SELECT id, username, role FROM users WHERE mobile_number = ? AND id != ? LIMIT 1`,
        args: [cleanUserMobile, userId]
      })
      if (conflictRes.rows && conflictRes.rows.length > 0) {
        const conf: any = conflictRes.rows[0]
        return NextResponse.json({
          error: `Mobile number ${cleanUserMobile} is already registered to user '${conf.username}' (${String(conf.role).toUpperCase()}). Every user account must have a unique login mobile number.`
        }, { status: 400 })
      }
    }

    if (cleanVendor && !/^\d{6}$/.test(cleanVendor)) {
      return NextResponse.json({ error: "Vendor Code must be exactly 6 digits" }, { status: 400 })
    }

    // 1. Update users table (user personal mobile)
    if (cleanUserMobile !== null || cleanName !== null || cleanEmail !== null) {
      await db.execute({
        sql: `UPDATE users 
              SET mobile_number = COALESCE(?, mobile_number),
                  full_name = COALESCE(?, full_name),
                  email = COALESCE(?, email),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [cleanUserMobile || null, cleanName || null, cleanEmail || null, userId]
      })
      UserStorage.getInstance().invalidateCache()
    }

    // 2. Update agencies table: Admin/Superuser or Agency updating their own assigned agency details
    const userRole = (session.role || "").toLowerCase()
    const canUpdateAgency = userRole === "admin" || userRole === "superuser" || userRole === "agency"

    if (canUpdateAgency && (cleanVendor !== null || cleanAgencyMobile !== null)) {
      const username = session.username
      const rawAgencies = session.agencies || []
      const agencyCandidates = Array.from(new Set([
        ...rawAgencies,
        session.name,
        username
      ].filter(Boolean).map(s => String(s).trim())))

      for (const agName of agencyCandidates) {
        try {
          // First try to update matching agency
          const updateRes = await db.execute({
            sql: `UPDATE agencies
                  SET vendor_code = COALESCE(?, vendor_code),
                      mobile_number = COALESCE(?, mobile_number),
                      is_active = 1,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1)
                    AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
            args: [cleanVendor || null, cleanAgencyMobile || null, cccCode, agName, agName]
          })

          // If no existing agency row was updated and user is an agency, insert/reactivate an agency row
          if ((!updateRes.rowsAffected || updateRes.rowsAffected === 0) && userRole === "agency") {
            const cccRes = await db.execute({
              sql: `SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1`,
              args: [cccCode]
            })
            if (cccRes.rows && cccRes.rows.length > 0) {
              const cccId = cccRes.rows[0].id
              await db.execute({
                sql: `INSERT INTO agencies (vendor_code, ccc_id, name, mobile_number, is_active, subscription_status)
                      VALUES (?, ?, ?, ?, 1, 'active')`,
                args: [cleanVendor || null, cccId, agName.toUpperCase().trim(), cleanAgencyMobile || null]
              }).catch(() => {})
            }
          }
        } catch (err) {
          console.warn("Agency profile candidate update warning:", err)
        }
      }
      invalidateAgencyCache(cccCode)
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      profile: {
        agencyMobile: cleanAgencyMobile,
        userMobile: cleanUserMobile,
        vendorCode: cleanVendor,
        fullName: cleanName,
      }
    })
  } catch (error: any) {
    console.error("Error updating user profile:", error)
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 })
  }
}

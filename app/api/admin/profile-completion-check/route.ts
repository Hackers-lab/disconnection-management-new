import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = getTenantContext()
    const cccCode = context?.cccCode || session.cccCode || "SYSTEM"
    const isGlobalAdmin = session.role === "superuser" || !cccCode || cccCode === "SYSTEM"

    // 1. Check logged-in admin user details
    let userRecord: any = null
    try {
      const userRes = await db.execute({
        sql: `SELECT u.id, u.username, u.full_name, u.email, u.mobile_number, u.role
              FROM users u WHERE LOWER(u.username) = LOWER(?)`,
        args: [session.username]
      })
      userRecord = userRes.rows[0] || null
    } catch (err) {
      console.warn("Turso user check warning:", err)
    }

    const userMissingFields: string[] = []
    if (userRecord) {
      if (!userRecord.full_name || userRecord.full_name === userRecord.username) userMissingFields.push("full_name")
      if (!userRecord.mobile_number) userMissingFields.push("mobile_number")
      if (!userRecord.email) userMissingFields.push("email")
    }

    // 2. Check contractor agencies in this CCC
    let agencyRows: any[] = []
    try {
      const agencyRes = await db.execute({
        sql: `SELECT a.id, a.name, a.vendor_code, a.contact_person, a.mobile_number, a.email, a.is_active, c.ccc_code
              FROM agencies a
              LEFT JOIN ccc_registry c ON a.ccc_id = c.id
              WHERE (${isGlobalAdmin ? '1=1' : 'c.ccc_code = ? OR a.ccc_id IS NULL'}) AND a.is_active = 1`,
        args: isGlobalAdmin ? [] : [cccCode]
      })
      agencyRows = agencyRes.rows || []
    } catch (err) {
      console.warn("Turso agency check warning:", err)
    }

    const incompleteAgencies = agencyRows
      .map((r: any) => {
        const missing: string[] = []
        if (!r.vendor_code) missing.push("vendor_code")
        if (!r.contact_person) missing.push("contact_person")
        if (!r.mobile_number) missing.push("mobile_number")
        if (!r.email) missing.push("email")
        return {
          id: String(r.id),
          name: String(r.name || ""),
          vendorCode: String(r.vendor_code || ""),
          contactPerson: String(r.contact_person || ""),
          mobileNumber: String(r.mobile_number || ""),
          email: String(r.email || ""),
          cccCode: String(r.ccc_code || cccCode),
          missingFields: missing
        }
      })
      .filter(a => a.missingFields.length > 0)

    const totalCheckItems = 1 + agencyRows.length
    const incompleteItemsCount = (userMissingFields.length > 0 ? 1 : 0) + incompleteAgencies.length
    const completedItemsCount = totalCheckItems - incompleteItemsCount
    const completionPercentage = totalCheckItems > 0 ? Math.round((completedItemsCount / totalCheckItems) * 100) : 100

    return NextResponse.json({
      hasIncompleteDetails: incompleteItemsCount > 0,
      completionPercentage,
      totalCheckItems,
      incompleteItemsCount,
      userProfile: userRecord ? {
        id: String(userRecord.id),
        username: String(userRecord.username),
        fullName: String(userRecord.full_name || ""),
        email: String(userRecord.email || ""),
        mobileNumber: String(userRecord.mobile_number || ""),
        missingFields: userMissingFields
      } : null,
      incompleteAgencies
    })
  } catch (e: any) {
    console.error("Profile completion check error:", e)
    return NextResponse.json({ error: e.message || "Failed to check profile completion" }, { status: 500 })
  }
})

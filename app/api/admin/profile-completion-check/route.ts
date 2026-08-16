import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = getTenantContext()
    const cccCode = context?.cccCode || session.cccCode || "SYSTEM"
    const isGlobalAdmin = session.role === "superuser" || !cccCode || cccCode === "SYSTEM"

    // 1. Fetch all users/officers in this CCC
    let allUserRows: any[] = []
    try {
      const usersRes = await db.execute({
        sql: `SELECT u.id, u.username, u.full_name, u.email, u.mobile_number, u.role, c.ccc_code
              FROM users u
              LEFT JOIN ccc_registry c ON u.ccc_id = c.id
              WHERE LOWER(u.role) != 'superuser' AND (${isGlobalAdmin ? '1=1' : 'c.ccc_code = ?'})`,
        args: isGlobalAdmin ? [] : [cccCode]
      })
      allUserRows = usersRes.rows || []
    } catch (err) {
      console.warn("Turso users check warning:", err)
    }

    const incompleteUsers = allUserRows
      .map((r: any) => {
        const missing: string[] = []
        if (!r.full_name || r.full_name === r.username) missing.push("full_name")
        if (!r.mobile_number || !/^\d{10}$/.test(String(r.mobile_number).trim())) missing.push("mobile_number")
        if (!r.email) missing.push("email")
        return {
          id: String(r.id),
          username: String(r.username || ""),
          fullName: String(r.full_name || ""),
          email: String(r.email || ""),
          mobileNumber: String(r.mobile_number || ""),
          role: String(r.role || "viewer"),
          cccCode: String(r.ccc_code || cccCode),
          missingFields: missing
        }
      })
      .filter(u => u.missingFields.length > 0)

    // 2. Check contractor agencies in this CCC
    let agencyRows: any[] = []
    try {
      const agencyRes = await db.execute({
        sql: `SELECT a.id, a.name, a.vendor_code, a.contact_person, a.mobile_number, a.email, a.is_active, c.ccc_code
              FROM agencies a
              INNER JOIN ccc_registry c ON a.ccc_id = c.id
              WHERE ${isGlobalAdmin ? '1=1' : 'c.ccc_code = ?'} AND a.is_active = 1`,
        args: isGlobalAdmin ? [] : [cccCode]
      })
      agencyRows = agencyRes.rows || []
    } catch (err) {
      console.warn("Turso agency check warning:", err)
    }

    const incompleteAgencies = agencyRows
      .map((r: any) => {
        const missing: string[] = []
        const vc = String(r.vendor_code || "").trim()
        const mob = String(r.mobile_number || "").trim()
        if (!vc || !/^\d{6}$/.test(vc)) missing.push("vendor_code")
        if (!r.contact_person) missing.push("contact_person")
        if (!mob || !/^\d{10}$/.test(mob)) missing.push("mobile_number")
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

    const totalCheckItems = allUserRows.length + agencyRows.length
    const incompleteItemsCount = incompleteUsers.length + incompleteAgencies.length
    const completedItemsCount = Math.max(0, totalCheckItems - incompleteItemsCount)
    const completionPercentage = totalCheckItems > 0 ? Math.round((completedItemsCount / totalCheckItems) * 100) : 100

    return NextResponse.json({
      hasIncompleteDetails: incompleteItemsCount > 0,
      completionPercentage,
      totalCheckItems,
      incompleteItemsCount,
      incompleteUsers,
      incompleteAgencies
    })
  } catch (e: any) {
    console.error("Profile completion check error:", e)
    return NextResponse.json({ error: e.message || "Failed to check profile completion" }, { status: 500 })
  }
})

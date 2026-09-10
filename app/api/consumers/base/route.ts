import { NextRequest, NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { checkApiPermission } from "@/lib/permissions"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const { authorized, error, status, session } = await checkApiPermission("disconnection", "read")
    if (!authorized) {
      return NextResponse.json({ error }, { status: status || 403 })
    }

    // Agency Profile Completeness Check
    if (session?.role === "agency") {
      const { db } = await import("@/lib/db")
      const rawAgencies = session.agencies || []
      const agencyName = rawAgencies.length > 0 ? rawAgencies[0] : (session.name || session.username)
      const cccCode = session.cccCode || ""
      if (cccCode && agencyName) {
        const agencyRes = await db.execute({
          sql: `SELECT a.vendor_code, a.mobile_number, a.is_active, u.mobile_number as user_mobile 
                FROM users u
                LEFT JOIN ccc_registry c ON u.ccc_id = c.id
                LEFT JOIN agencies a ON a.ccc_id = c.id AND (a.name = ? COLLATE NOCASE OR a.name = ? COLLATE NOCASE)
                WHERE u.id = ? AND c.ccc_code = ? COLLATE NOCASE
                ORDER BY a.is_active DESC, a.id DESC 
                LIMIT 1`,
          args: [agencyName, session.username, session.userId, cccCode]
        })
        const ag: any = (agencyRes.rows && agencyRes.rows.length > 0) ? agencyRes.rows[0] : null
        if (!ag || !ag.vendor_code || !String(ag.vendor_code).trim() || !ag.mobile_number || !String(ag.mobile_number).trim()) {
          return NextResponse.json({ 
            error: "Agency profile incomplete: Please enter your Vendor Code and Mobile Number to unlock field data." 
          }, { status: 403 })
        }
      }
    }

    let data = []
    try {
      const spreadsheetId = getSpreadsheetId()
      const bypassCache = req.nextUrl.searchParams.get("bypassCache") === "true"
      data = await fetchConsumerData(spreadsheetId, bypassCache)

      // Filter by agency scoping if role has restricted agencies
      if (session?.agencies && session.agencies.length > 0) {
        const upperAgencies = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
        data = data.filter((c: any) => upperAgencies.includes(String(c.agency || "").trim().toUpperCase()))
      }
    } catch (e: any) {
      console.warn("Failed to fetch base consumer data (likely sheet not linked yet):", e.message || e)
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    const lastRow = data[data.length - 1]

    if (lastRow && lastRow.consumerId && !lastRow.agency) {
      return NextResponse.json(data, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        'Vary': 'Cookie, Authorization',
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/base error:", error)
    return NextResponse.json({ error: "Failed to fetch base data" }, { status: 500 })
  }
})

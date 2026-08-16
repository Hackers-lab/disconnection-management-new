import { NextRequest, NextResponse } from "next/server"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { verifySession } from "@/lib/session"
import { db } from "@/lib/db"
import { invalidateAgencyCache } from "@/lib/agency-storage"
import { UserStorage } from "@/lib/user-storage"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || !session.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { userUpdates, agencyUpdates } = body

    const context = getTenantContext()
    const cccCode = context?.cccCode || session.cccCode || "SYSTEM"

    // 1. Update user profile fields if provided
    if (userUpdates && userUpdates.id) {
      const { fullName, mobileNumber, email } = userUpdates
      await db.execute({
        sql: `UPDATE users 
              SET full_name = COALESCE(?, full_name),
                  mobile_number = COALESCE(?, mobile_number),
                  email = COALESCE(?, email),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ? OR LOWER(username) = LOWER(?)`,
        args: [fullName || null, mobileNumber || null, email || null, userUpdates.id, session.username]
      })
      UserStorage.getInstance().invalidateCache()
    }

    // 2. Update contractor agency details if provided
    if (Array.isArray(agencyUpdates) && agencyUpdates.length > 0) {
      for (const agency of agencyUpdates) {
        if (!agency.id) continue
        await db.execute({
          sql: `UPDATE agencies 
                SET vendor_code = COALESCE(?, vendor_code),
                    contact_person = COALESCE(?, contact_person),
                    mobile_number = COALESCE(?, mobile_number),
                    email = COALESCE(?, email),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [
            agency.vendorCode || null,
            agency.contactPerson || null,
            agency.mobileNumber || null,
            agency.email || null,
            agency.id
          ]
        })
      }
      invalidateAgencyCache(cccCode)
    }

    return NextResponse.json({
      success: true,
      message: "Profile and agency details updated successfully in Turso DB"
    })
  } catch (e: any) {
    console.error("Profile completion update error:", e)
    return NextResponse.json({ error: e.message || "Failed to update profile completion" }, { status: 500 })
  }
})

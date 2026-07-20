import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { roleStorage } from "@/lib/role-storage"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let permissions
    try {
      permissions = await roleStorage.getPermissionsForRole(session.role)
    } catch (e: any) {
      console.warn("Failed to retrieve custom role permissions (likely sheet not linked yet):", e.message || e)
      // Fallback: If they are an admin, give them access to the admin module so they can link Google account
      if (session.role === "admin") {
        permissions = {
          disconnection: [],
          reconnection: [],
          deemed: [],
          dtr: [],
          meter: [],
          nsc: [],
          consumer_master: [],
          admin: ["read", "create", "update", "delete"],
          meter_replacement: [],
          material: [],
        }
      } else {
        permissions = null
      }
    }

    if (!permissions) {
      // Default to empty permissions if role is not configured
      return NextResponse.json({
        role: session.role,
        permissions: {
          disconnection: [],
          reconnection: [],
          deemed: [],
          dtr: [],
          meter: [],
          nsc: [],
          consumer_master: [],
          admin: [],
          meter_replacement: [],
          material: [],
        },
        isSubscribed: session.isSubscribed,
        subscriptionExpiresAt: session.subscriptionExpiresAt,
        name: session.name,
        username: session.username,
        cccCode: session.cccCode,
        agencies: session.agencies,
        subscriptionStatus: session.subscriptionStatus,
        bypassSubscription: session.bypassSubscription,
      })
    }

    return NextResponse.json({
      role: session.role,
      permissions,
      isSubscribed: session.isSubscribed,
      subscriptionExpiresAt: session.subscriptionExpiresAt,
      name: session.name,
      username: session.username,
      cccCode: session.cccCode,
      agencies: session.agencies,
      subscriptionStatus: session.subscriptionStatus,
      bypassSubscription: session.bypassSubscription,
    })
  } catch (error) {
    console.error("Error in permissions API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
})

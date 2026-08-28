import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { roleStorage } from "@/lib/role-storage"
import { withTenant } from "@/lib/tenant-context"

import { expandRolePermissions } from "@/lib/permissions"
import { getTenantRegistry } from "@/lib/tenant-resolver"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let permissions
    try {
      const raw = await roleStorage.getPermissionsForRole(session.role)
      permissions = expandRolePermissions(session.role, raw)
    } catch (e: any) {
      console.warn("Failed to retrieve custom role permissions (likely sheet not linked yet):", e.message || e)
      // Fallback: If they are an admin, give them access to the admin module so they can link Google account
      const userRoleLower = (session.role || "").toLowerCase()
      if (userRoleLower === "admin" || userRoleLower === "superuser" || userRoleLower === "executive") {
        permissions = {
          disconnection: ["read", "create", "update", "delete"],
          reconnection: ["read", "create", "update", "delete"],
          deemed: ["read", "create", "update", "delete"],
          dtr: ["read", "create", "update", "delete"],
          meter: ["read", "create", "update", "delete"],
          nsc: ["read", "create", "update", "delete"],
          consumer_master: ["read", "create", "update", "delete"],
          admin: ["read", "create", "update", "delete"],
          meter_replacement: ["read", "create", "update", "delete"],
          material: ["read", "create", "update", "delete"],
          icds: ["read", "create", "update", "delete", "inspect", "process", "execute", "install", "certify"],
        }
      } else {
        permissions = null
      }
    }

    let cccName = ""
    if (session.cccCode) {
      try {
        const registry = await getTenantRegistry()
        const tenant = registry[session.cccCode] || registry[session.cccCode.toUpperCase()]
        if (tenant) {
          cccName = tenant.cccName
        }
      } catch (err) {
        console.warn("Failed to lookup tenant cccName for session:", err)
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
          icds: [],
        },
        isSubscribed: session.isSubscribed,
        subscriptionExpiresAt: session.subscriptionExpiresAt,
        name: session.name,
        username: session.username,
        cccCode: session.cccCode,
        cccName: cccName || session.cccCode || "",
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
      cccName: cccName || session.cccCode || "",
      agencies: session.agencies,
      subscriptionStatus: session.subscriptionStatus,
      bypassSubscription: session.bypassSubscription,
    }, {
      headers: {
        "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (error) {
    console.error("Error in permissions API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
})

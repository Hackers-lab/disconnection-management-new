import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const users = await userStorage.getUsers()
    return NextResponse.json(users)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { username, password, role, cccCode, name, agencies, subscriptionStatus, subscriptionExpiresAt, bypassSubscription } = await request.json()
    if (!username || !password || !role || !cccCode) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 })
    }

    const newUser = await userStorage.addUser({
      username: username.trim(),
      password: password.trim(),
      role: role.trim(),
      cccCode: cccCode.trim().toUpperCase(),
      name: name?.trim() || "",
      agencies: Array.isArray(agencies) ? agencies : [],
      subscriptionStatus: subscriptionStatus || "active",
      subscriptionExpiresAt: subscriptionExpiresAt || "",
      bypassSubscription: !!bypassSubscription
    })

    return NextResponse.json({ success: true, user: newUser })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    await userStorage.deleteUser(id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id, username, name, role, cccCode, agencies, subscriptionStatus, subscriptionExpiresAt, bypassSubscription } = await request.json()
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const updatedUser = await userStorage.updateUser(id, {
      username: username?.trim(),
      name: name?.trim(),
      role: role?.trim(),
      cccCode: cccCode?.trim()?.toUpperCase(),
      agencies: Array.isArray(agencies) ? agencies : undefined,
      subscriptionStatus,
      subscriptionExpiresAt,
      bypassSubscription: bypassSubscription !== undefined ? !!bypassSubscription : undefined
    })

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Sync subscription status and expiry to corresponding agency in agencies table
    // so dynamic isAgencySubscribed checks stay completely aligned with user status
    if (subscriptionStatus !== undefined || subscriptionExpiresAt !== undefined) {
      try {
        const { db } = await import("@/lib/db")
        const { invalidateAgencyCache } = await import("@/lib/agency-storage")
        const targetCcc = updatedUser.cccCode || cccCode?.trim()?.toUpperCase()
        const targetAgencies = updatedUser.agencies && updatedUser.agencies.length > 0 
          ? updatedUser.agencies 
          : (updatedUser.name ? [updatedUser.name] : [])

        for (const agName of targetAgencies) {
          if (!agName) continue
          await db.execute({
            sql: `UPDATE agencies 
                  SET subscription_status = COALESCE(?, subscription_status),
                      subscription_expires_at = COALESCE(?, subscription_expires_at),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ccc_id = (SELECT id FROM ccc_registry WHERE ccc_code = ? COLLATE NOCASE LIMIT 1)
                    AND (name = ? COLLATE NOCASE OR vendor_code = ? COLLATE NOCASE)`,
            args: [subscriptionStatus || null, subscriptionExpiresAt || null, targetCcc, agName, agName]
          })
        }
        invalidateAgencyCache(targetCcc)
      } catch (syncErr) {
        console.warn("[Superuser User Edit] Warning syncing agency status:", syncErr)
      }
    }

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

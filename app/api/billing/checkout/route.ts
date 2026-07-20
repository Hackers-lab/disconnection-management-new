import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const d = new Date()
    d.setDate(d.getDate() + 30) // Extend by 30 days
    const expiresAt = d.toISOString().split("T")[0]

    // Update user subscription state directly in userStorage
    const updatedUser = await userStorage.updateUser(session.userId, {
      subscriptionStatus: "active",
      subscriptionExpiresAt: expiresAt,
    })

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    console.log(`💳 [Simulated Payment] User ${session.username} successfully subscribed until ${expiresAt}.`)
    return NextResponse.json({ success: true, expiresAt })
  } catch (error: any) {
    console.error("Simulation payment error:", error)
    return NextResponse.json({ error: error.message || "Failed to process simulation payment" }, { status: 500 })
  }
})

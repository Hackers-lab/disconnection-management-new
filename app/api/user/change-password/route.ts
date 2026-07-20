import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 })
    }

    const users = await userStorage.getUsers()
    const user = users.find((u) => u.id === session.userId)

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.password !== currentPassword) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    await userStorage.updateUser(session.userId, { password: newPassword })

    return NextResponse.json({ success: true, message: "Password changed successfully" })
  } catch (error) {
    console.error("Error changing password:", error)
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 })
  }
})

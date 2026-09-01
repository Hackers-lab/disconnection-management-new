import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"
import { validateVerificationToken } from "@/lib/otp-service"
import { db } from "@/lib/db"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { currentPassword, newPassword, mobileNumber, verificationToken } = await request.json()

    if (!newPassword || newPassword.length < 4) {
      return NextResponse.json({ error: "New password must be at least 4 characters long" }, { status: 400 })
    }

    if (!mobileNumber || !verificationToken) {
      return NextResponse.json({ error: "OTP verification is mandatory to change password. Please verify OTP first." }, { status: 400 })
    }

    const cleanMobile = String(mobileNumber).replace(/\D/g, "").slice(-10)
    if (!validateVerificationToken(cleanMobile, verificationToken)) {
      return NextResponse.json({ error: "OTP verification expired or invalid. Please verify via OTP again." }, { status: 401 })
    }

    const user = await userStorage.getUserById(session.userId)

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If current password provided, verify it too
    if (currentPassword && user.password !== currentPassword) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    // Verify that the mobile number belongs to this user or CCC
    const userDbRes = await db.execute({
      sql: `SELECT u.mobile_number as userMobile, c.mobile_number as cccMobile 
            FROM users u 
            LEFT JOIN ccc_registry c ON u.ccc_id = c.id 
            WHERE u.id = ? 
            LIMIT 1`,
      args: [session.userId]
    })

    if (userDbRes.rows && userDbRes.rows.length > 0) {
      const row: any = userDbRes.rows[0]
      const linkedMobile = String(row.userMobile || row.cccMobile || "").replace(/\D/g, "").slice(-10)
      if (linkedMobile && linkedMobile !== cleanMobile) {
        return NextResponse.json({ error: "Verified mobile number does not match the linked account mobile number." }, { status: 403 })
      }
    }

    await userStorage.updateUser(session.userId, { password: newPassword })

    return NextResponse.json({ success: true, message: "Password changed successfully" })
  } catch (error) {
    console.error("Error changing password:", error)
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 })
  }
})

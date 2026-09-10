import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { checkApiPermission } from "@/lib/permissions"
import { withTenant, getTenantContext } from "@/lib/tenant-context"

import { isCccInTrialPeriod } from "@/lib/agency-storage"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("admin", "read")
  if (!authorized) {
    return NextResponse.json({ error }, { status })
  }

  const context = getTenantContext()
  const cccCode = context?.cccCode || ""

  const [tenantUsers, trialCheck] = await Promise.all([
    userStorage.getUsersByCcc(cccCode),
    isCccInTrialPeriod(cccCode)
  ])
  
  // If CCC is under trial period (90-day operational trial or setup window), admin can see user passwords
  // Otherwise, redact agency user passwords (vendors manage their own passwords via OTP)
  const sanitizedUsers = tenantUsers.map(user => ({
    ...user,
    password: (user.role === "agency" && !trialCheck.inTrial) ? "" : user.password,
    isTrialPeriod: trialCheck.inTrial,
    trialExpiresAt: trialCheck.expiresAt,
  }))
  
  return NextResponse.json(sanitizedUsers, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
})

// POST - Add new user
export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("admin", "update")
  if (!authorized) {
    return NextResponse.json({ error }, { status })
  }

  const context = getTenantContext()
  const cccCode = context?.cccCode

  if (!cccCode) {
    return NextResponse.json({ error: "Tenant context not found" }, { status: 400 })
  }

  try {
    const { username, password, role, agencies, mobileNumber, name } = await request.json()

    // Validate input
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    // Check if username already exists globally
    const existingUser = await userStorage.getUserByUsername(username)
    if (existingUser) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 })
    }

    // Validate mobile number uniqueness across all users
    let cleanMobile: string | null = null
    if (mobileNumber && String(mobileNumber).trim()) {
      cleanMobile = String(mobileNumber).replace(/\D/g, "").slice(-10)
      if (cleanMobile.length !== 10) {
        return NextResponse.json({ error: "Mobile number must be exactly 10 digits" }, { status: 400 })
      }
      const existingUserByMobile = await userStorage.getUserByMobile(cleanMobile)
      if (existingUserByMobile) {
        return NextResponse.json({ 
          error: `Mobile number ${cleanMobile} is already registered to user '${existingUserByMobile.username}' (${existingUserByMobile.role.toUpperCase()}). Every user account must have a unique mobile number.` 
        }, { status: 400 })
      }
    }

    const assignedRole = role || "agency"
    const assignedAgencies = Array.isArray(agencies) ? agencies.map((a: any) => String(a).trim()).filter(Boolean) : []

    if (assignedRole === "agency" && assignedAgencies.length > 1) {
      return NextResponse.json({
        error: "Users with the Agency role can only be assigned to a single agency.",
      }, { status: 400 })
    }

    const newUser = await userStorage.addUser({
      username,
      password,
      role: assignedRole,
      cccCode,
      name: name || username,
      mobileNumber: cleanMobile || undefined,
      agencies: assignedAgencies,
      subscriptionStatus: "active",
      subscriptionExpiresAt: "",
      bypassSubscription: false,
    })

    console.log("✅ User added successfully:", username, cleanMobile ? `(Mobile: ${cleanMobile})` : "")
    return NextResponse.json({ success: true, message: "User added successfully", user: newUser })
  } catch (error) {
    console.error("Error adding user:", error)
    return NextResponse.json({ error: "Failed to add user" }, { status: 500 })
  }
})

// PUT - Update user
export const PUT = withTenant(async function PUT(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("admin", "update")
  if (!authorized) {
    return NextResponse.json({ error }, { status })
  }

  const context = getTenantContext()
  const cccCode = context?.cccCode

  if (!cccCode) {
    return NextResponse.json({ error: "Tenant context not found" }, { status: 400 })
  }

  try {
    const { id, username, password, role, agencies, mobileNumber, name } = await request.json()

    const existingUser = await userStorage.getUserById(id)

    if (!existingUser || existingUser.cccCode !== cccCode) {
      return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 })
    }

    // Option B: Vendor Privacy Lock — prevent regular admins from overwriting agency/vendor passwords AFTER trial period
    if (password && existingUser.role === "agency") {
      const trialCheck = await isCccInTrialPeriod(cccCode)
      if (!trialCheck.inTrial) {
        return NextResponse.json(
          { error: "Vendor passwords cannot be changed by Admins outside of trial period. The vendor must use the 'Forgot Password' option on the login page to reset their password via mobile OTP." },
          { status: 403 }
        )
      }
    }

    // Check if new username conflicts with existing users
    if (username && username.toLowerCase() !== existingUser.username.toLowerCase()) {
      const conflictUser = await userStorage.getUserByUsername(username)
      if (conflictUser && conflictUser.id !== id) {
        return NextResponse.json({ error: "Username already exists" }, { status: 400 })
      }
    }

    // Validate unique mobile number across all users
    let cleanMobile: string | null = existingUser.mobileNumber || null
    if (mobileNumber !== undefined) {
      if (mobileNumber && String(mobileNumber).trim()) {
        const parsed = String(mobileNumber).replace(/\D/g, "").slice(-10)
        if (parsed.length !== 10) {
          return NextResponse.json({ error: "Mobile number must be exactly 10 digits" }, { status: 400 })
        }
        const conflictMobile = await userStorage.getUserByMobile(parsed)
        if (conflictMobile && conflictMobile.id !== id) {
          return NextResponse.json({ 
            error: `Mobile number ${parsed} is already registered to user '${conflictMobile.username}' (${conflictMobile.role.toUpperCase()}). Every user account must have a unique mobile number.` 
          }, { status: 400 })
        }
        cleanMobile = parsed
      } else {
        cleanMobile = null
      }
    }

    const targetRole = role || existingUser.role
    const assignedAgencies = Array.isArray(agencies) 
      ? agencies.map((a: any) => String(a).trim()).filter(Boolean)
      : (existingUser.agencies || [])

    if (targetRole === "agency" && assignedAgencies.length > 1) {
      return NextResponse.json({
        error: "Users with the Agency role can only be assigned to a single agency.",
      }, { status: 400 })
    }

    const updatedUser = await userStorage.updateUser(id, {
      username,
      password: password || existingUser.password,
      name: name || existingUser.name,
      role: targetRole,
      cccCode,
      mobileNumber: cleanMobile || undefined,
      agencies: assignedAgencies,
      subscriptionStatus: existingUser.subscriptionStatus,
      subscriptionExpiresAt: existingUser.subscriptionExpiresAt,
      bypassSubscription: existingUser.bypassSubscription,
    })

    if (updatedUser) {
      console.log("✅ User updated successfully:", username, cleanMobile ? `(Mobile: ${cleanMobile})` : "")
      return NextResponse.json({ success: true, message: "User updated successfully", user: updatedUser })
    } else {
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
})

// DELETE - Delete user
export const DELETE = withTenant(async function DELETE(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("admin", "update")
  if (!authorized) {
    return NextResponse.json({ error }, { status })
  }

  const context = getTenantContext()
  const cccCode = context?.cccCode

  if (!cccCode) {
    return NextResponse.json({ error: "Tenant context not found" }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const userToDelete = await userStorage.getUserById(id)

    if (!userToDelete || userToDelete.cccCode !== cccCode) {
      return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 })
    }

    // Prevent deleting admin user
    if (userToDelete.username === "admin") {
      return NextResponse.json({ error: "Cannot delete admin user" }, { status: 400 })
    }

    const deletedUser = await userStorage.deleteUser(id)

    if (deletedUser) {
      console.log("✅ User deleted successfully:", deletedUser.username)
      return NextResponse.json({ success: true, message: "User deleted successfully" })
    } else {
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
})

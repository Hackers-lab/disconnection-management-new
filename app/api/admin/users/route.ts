import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { checkApiPermission } from "@/lib/permissions"
import { withTenant, getTenantContext } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("admin", "read")
  if (!authorized) {
    return NextResponse.json({ error }, { status })
  }

  const context = getTenantContext()
  const cccCode = context?.cccCode || ""

  const allUsers = await userStorage.getUsers()
  // Filter users by current tenant cccCode
  const tenantUsers = allUsers.filter((u) => u.cccCode === cccCode)
  
  return NextResponse.json(tenantUsers, {
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
    const { username, password, role, agencies } = await request.json()

    // Validate input
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    const allUsers = await userStorage.getUsers()

    // Check if username already exists globally
    if (allUsers.find((u) => u.username === username)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 })
    }

    const newUser = await userStorage.addUser({
      username,
      password,
      role: role || "agency",
      cccCode,
      name: username,
      agencies: agencies || [],
      subscriptionStatus: "active",
      subscriptionExpiresAt: "",
      bypassSubscription: false,
    })

    console.log("✅ User added successfully:", username)
    return NextResponse.json({ success: true, message: "User added successfully" })
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
    const { id, username, password, role, agencies } = await request.json()

    const allUsers = await userStorage.getUsers()
    const existingUser = allUsers.find((u) => u.id === id && u.cccCode === cccCode)

    if (!existingUser) {
      return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 })
    }

    // Check if new username conflicts with existing users
    if (allUsers.find((u) => u.username === username && u.id !== id)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 })
    }

    const updatedUser = await userStorage.updateUser(id, {
      username,
      password: password || existingUser.password,
      role,
      cccCode,
      agencies: agencies || [],
    })

    if (updatedUser) {
      console.log("✅ User updated successfully:", username)
      return NextResponse.json({ success: true, message: "User updated successfully" })
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

    const allUsers = await userStorage.getUsers()
    const userToDelete = allUsers.find((u) => u.id === id && u.cccCode === cccCode)

    if (!userToDelete) {
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

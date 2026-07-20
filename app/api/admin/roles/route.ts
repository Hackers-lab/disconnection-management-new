import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { roleStorage, type RolePermissions } from "@/lib/role-storage"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

// GET - List all roles
export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantConfig = await getTenantConfig(session.cccCode)
    const roles = await roleStorage.getRoles(tenantConfig.spreadsheetId)
    return NextResponse.json(roles, {
      headers: { 'Cache-Control': 'no-store' }, // Security-sensitive: always serve fresh
    })
  } catch (error) {
    console.error("Error fetching roles:", error)
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 })
  }
})

// POST - Add or update a role's permissions
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { role } = body

    if (!role) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 })
    }

    const tenantConfig = await getTenantConfig(session.cccCode)
    const updatedRole = await roleStorage.addOrUpdateRole(body as RolePermissions, tenantConfig.spreadsheetId)
    console.log(`✅ Role permissions saved successfully for: ${role}`)
    return NextResponse.json({ success: true, role: updatedRole })
  } catch (error) {
    console.error("Error saving role permissions:", error)
    return NextResponse.json({ error: "Failed to save role permissions" }, { status: 500 })
  }
})

// DELETE - Delete custom role
export const DELETE = withTenant(async function DELETE(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")

    if (!role) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 })
    }

    // Protect built-in admin role from being deleted
    if (role.toLowerCase() === "admin") {
      return NextResponse.json({ error: "Cannot delete the admin role" }, { status: 400 })
    }

    const tenantConfig = await getTenantConfig(session.cccCode)
    const deleted = await roleStorage.deleteRole(role, tenantConfig.spreadsheetId)
    if (deleted) {
      console.log(`✅ Role deleted successfully: ${role}`)
      return NextResponse.json({ success: true, message: "Role deleted successfully" })
    } else {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Error deleting role:", error)
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 })
  }
})

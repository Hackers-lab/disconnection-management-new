import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getAgencies, addAgency, updateAgency, deleteAgency } from "@/lib/agency-storage"
import { userStorage, type MasterUser } from "@/lib/user-storage"
import { withTenant } from "@/lib/tenant-context"
import { incrKV, getTenantKey } from "@/lib/kv-store"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET - List all agencies (accessible to authenticated users for dropdowns/filters)
export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const agencies = await getAgencies()
  return NextResponse.json(agencies, {
    // no-store: browser never caches — every user always hits the server.
    // The server holds agencies in memory (write-invalidated) so this is
    // near-zero cost and guarantees instant propagation to ALL users.
    headers: { 'Cache-Control': 'no-store' },
  })
})

// POST - Add new agency
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const { name, description, isActive, vendorCode, mobileNumber } = await request.json()
    if (!name) {
      return NextResponse.json({ error: "Agency name is required" }, { status: 400 })
    }
    const agencies = await getAgencies()
    if (agencies.find((a) => a.name.toUpperCase() === name.toUpperCase())) {
      return NextResponse.json({ error: "Agency name already exists" }, { status: 400 })
    }

    const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    await addAgency({ 
      name: name.toUpperCase(), 
      description: description || "", 
      isActive: isActive !== false,
      vendorCode: vendorCode || undefined,
      mobileNumber: mobileNumber || undefined,
      subscriptionExpiresAt: trialExpiresAt
    })

    const tenantId = request.headers.get("x-tenant-id") || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))

    return NextResponse.json({
      success: true,
      message: "Agency added successfully",
      agency: {
        name: name.toUpperCase().trim(),
        vendorCode: vendorCode ? vendorCode.trim() : undefined,
        mobileNumber: mobileNumber ? mobileNumber.trim() : undefined,
        expiresAt: trialExpiresAt
      }
    })
  } catch (error) {
    console.error("Error adding agency:", error)
    return NextResponse.json({ error: "Failed to add agency" }, { status: 500 })
  }
})

// PUT - Update agency
export const PUT = withTenant(async function PUT(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const { id, name, description, isActive, vendorCode, mobileNumber } = await request.json()
    const agencies = await getAgencies()
    const agencyIndex = agencies.findIndex((a) => a.id === id)
    if (agencyIndex === -1) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 })
    }

    const existingAgency = agencies[agencyIndex]
    const isSubscribed = existingAgency.subscriptionExpiresAt && 
      new Date(existingAgency.subscriptionExpiresAt).getTime() > Date.now() &&
      existingAgency.subscriptionStatus === "active"

    // Find linked user to check if on temporary credentials
    const oldCleanMobile = existingAgency.mobileNumber ? existingAgency.mobileNumber.replace(/\D/g, '').slice(-10) : ""
    let linkedUser = oldCleanMobile ? await userStorage.getUserByUsername(oldCleanMobile) : null
    if (!linkedUser) {
      const cccUsers = await userStorage.getUsersByCcc(session.cccCode || "")
      linkedUser = cccUsers.find(u => u.role === "agency" && (
        u.name?.toUpperCase().trim() === existingAgency.name.toUpperCase().trim() ||
        u.agencies.some(ag => ag.toUpperCase().trim() === existingAgency.name.toUpperCase().trim())
      )) || null
    }

    const isOnTempCredentials = !linkedUser || (existingAgency.vendorCode && linkedUser.password === existingAgency.vendorCode.trim())

    // Prevent renaming or changing vendor code of a paid agency by regular admins unless on temporary credentials
    if (isSubscribed && !isOnTempCredentials) {
      if (name && name.toUpperCase().trim() !== existingAgency.name.toUpperCase().trim()) {
        return NextResponse.json(
          { error: "Agency Name cannot be changed while an active subscription exists. Please contact Superuser for authorization." },
          { status: 403 }
        )
      }
      if (vendorCode && existingAgency.vendorCode && vendorCode.trim() !== existingAgency.vendorCode.trim()) {
        return NextResponse.json(
          { error: "SAP Vendor Code cannot be changed while an active subscription exists. Please contact Superuser for authorization." },
          { status: 403 }
        )
      }
    }

    if (agencies.find((a) => a.name.toUpperCase() === name.toUpperCase() && a.id !== id)) {
      return NextResponse.json({ error: "Agency name already exists" }, { status: 400 })
    }

    await updateAgency({ 
      id, 
      name: name.toUpperCase(), 
      description: description || "", 
      isActive: isActive !== false,
      vendorCode: vendorCode || undefined,
      mobileNumber: mobileNumber || undefined
    })

    // Also update the linked user in users table if mobile or vendor code changes!
    const newCleanMobile = mobileNumber ? mobileNumber.replace(/\D/g, '').slice(-10) : ""
    const newVendorCode = vendorCode ? vendorCode.trim() : ""
    const newAgencyName = name ? name.toUpperCase().trim() : ""

    if (linkedUser) {
      const userUpdates: Partial<Omit<MasterUser, "id">> = {}
      if (newCleanMobile && linkedUser.username !== newCleanMobile) {
        const existingWithNewMobile = await userStorage.getUserByUsername(newCleanMobile)
        if (!existingWithNewMobile || existingWithNewMobile.id === linkedUser.id) {
          userUpdates.username = newCleanMobile
          userUpdates.mobileNumber = newCleanMobile
        }
      }
      if (newVendorCode && (isOnTempCredentials || !linkedUser.password)) {
        userUpdates.password = newVendorCode
      }
      if (newAgencyName && linkedUser.name !== newAgencyName) {
        userUpdates.name = newAgencyName
        userUpdates.agencies = [newAgencyName]
      }
      if (Object.keys(userUpdates).length > 0) {
        await userStorage.updateUser(linkedUser.id, userUpdates)
        console.log(`👤 [AUTO-PROVISION] Updated linked agency user for: ${newAgencyName || linkedUser.name}`)
      }
    } else if (newCleanMobile && newVendorCode) {
      // Check for mobile number conflicts before auto-provisioning
      const existingUser = await userStorage.getUserByUsername(newCleanMobile)
      let mobileConflict = false
      if (!existingUser) {
        try {
          const mobileCheck = await db.execute({
            sql: `SELECT u.id FROM users u WHERE u.mobile_number = ? LIMIT 1`,
            args: [newCleanMobile]
          })
          if (mobileCheck.rows && mobileCheck.rows.length > 0) mobileConflict = true
        } catch {}
        if (!mobileConflict) {
          try {
            const cccCheck = await db.execute({
              sql: `SELECT c.id FROM ccc_registry c WHERE c.mobile_number = ? LIMIT 1`,
              args: [newCleanMobile]
            })
            if (cccCheck.rows && cccCheck.rows.length > 0) mobileConflict = true
          } catch {}
        }
      }
      if (!existingUser && !mobileConflict) {
        const trialExpiresAt = existingAgency.subscriptionExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        await userStorage.addUser({
          username: newCleanMobile,
          password: newVendorCode,
          name: newAgencyName || existingAgency.name.toUpperCase().trim(),
          role: "agency",
          cccCode: session.cccCode || "",
          mobileNumber: newCleanMobile,
          agencies: [newAgencyName || existingAgency.name.toUpperCase().trim()],
          subscriptionStatus: existingAgency.subscriptionStatus || "active",
          subscriptionExpiresAt: trialExpiresAt,
          bypassSubscription: false,
        })
        console.log(`👤 [AUTO-PROVISION] Created missing agency user on update: ${newCleanMobile}`)
      } else {
        console.log(`⚠️ [AUTO-PROVISION SKIPPED] Mobile ${newCleanMobile} already in use — skipping user creation on update`)
      }
    }

    const tenantId = request.headers.get("x-tenant-id") || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))
    return NextResponse.json({ success: true, message: "Agency updated successfully" })
  } catch (error) {
    console.error("Error updating agency:", error)
    return NextResponse.json({ error: "Failed to update agency" }, { status: 500 })
  }
})

// DELETE - Delete agency
export const DELETE = withTenant(async function DELETE(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Agency ID is required" }, { status: 400 })
    }
    const agencies = await getAgencies()
    const agencyIndex = agencies.findIndex((a) => a.id === id)
    if (agencyIndex === -1) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 })
    }

    const existingAgency = agencies[agencyIndex]
    const isSubscribed = existingAgency.subscriptionExpiresAt && 
      new Date(existingAgency.subscriptionExpiresAt).getTime() > Date.now() &&
      existingAgency.subscriptionStatus === "active"

    if (isSubscribed) {
      return NextResponse.json(
        { error: "Cannot delete an agency with an active subscription. Contact Superuser." },
        { status: 403 }
      )
    }

    await deleteAgency(id)
    const tenantId = request.headers.get("x-tenant-id") || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))
    return NextResponse.json({ success: true, message: "Agency deleted successfully" })
  } catch (error) {
    console.error("Error deleting agency:", error)
    return NextResponse.json({ error: "Failed to delete agency" }, { status: 500 })
  }
})

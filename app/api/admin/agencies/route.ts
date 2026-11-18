import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getAgencies, addAgency, updateAgency, deleteAgency, resolveAgencyDefaultExpiry } from "@/lib/agency-storage"
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
    headers: { 'Cache-Control': 'private, s-maxage=300, stale-while-revalidate=900, max-age=60' },
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

    // Inherit the CCC's current expiry date rather than blindly adding 90 days from today
    const cccCode = session.cccCode || "SYSTEM"
    const trialExpiresAt = await resolveAgencyDefaultExpiry(cccCode)

    const createdAgency = await addAgency({ 
      name: name.toUpperCase().trim(), 
      description: description || "", 
      isActive: isActive !== false,
      vendorCode: vendorCode || undefined,
      mobileNumber: mobileNumber || undefined,
      subscriptionExpiresAt: trialExpiresAt
    })

    const tenantId = request.headers.get("x-tenant-id") || cccCode || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))

    return NextResponse.json({
      success: true,
      message: "Agency added successfully",
      agency: createdAgency
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
    const billingStartDate = new Date("2026-09-07T00:00:00").getTime()
    const isPaidAgency = Boolean(
      Date.now() >= billingStartDate &&
      existingAgency.subscriptionStatus === "paid" &&
      existingAgency.subscriptionExpiresAt && 
      new Date(existingAgency.subscriptionExpiresAt).getTime() > Date.now()
    )

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

    // Prevent renaming or changing vendor code ONLY if a real paid subscription exists
    if (isPaidAgency && !isOnTempCredentials) {
      if (name && name.toUpperCase().trim() !== existingAgency.name.toUpperCase().trim()) {
        return NextResponse.json(
          { error: "Agency Name cannot be changed while an active paid subscription exists. Please contact Superuser for authorization." },
          { status: 403 }
        )
      }
      if (vendorCode && existingAgency.vendorCode && vendorCode.trim() !== existingAgency.vendorCode.trim()) {
        return NextResponse.json(
          { error: "SAP Vendor Code cannot be changed while an active paid subscription exists. Please contact Superuser for authorization." },
          { status: 403 }
        )
      }
    }

    if (agencies.find((a) => a.name.toUpperCase() === name.toUpperCase() && a.id !== id)) {
      return NextResponse.json({ error: "Agency name already exists" }, { status: 400 })
    }

    const oldNameUpper = existingAgency.name?.trim().toUpperCase()
    const newNameUpper = name ? name.trim().toUpperCase() : oldNameUpper

    await updateAgency({ 
      id, 
      name: name.toUpperCase(), 
      description: description || "", 
      isActive: isActive !== false,
      vendorCode: vendorCode || undefined,
      mobileNumber: mobileNumber || undefined
    })

    console.log(`🏢 [AGENCY UPDATED] ${name.toUpperCase()} (Vendor Code: ${vendorCode || "N/A"}) in CCC ${session.cccCode}`)

    const tenantId = request.headers.get("x-tenant-id") || session.cccCode || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))

    // Cascade agency rename to AgencyZoneMap & consumer sheet if name changed
    if (oldNameUpper && newNameUpper && oldNameUpper !== newNameUpper) {
      try {
        const { getSpreadsheetId } = await import("@/lib/google-sheets-api")
        const { sheets: googleSheets } = await import("@googleapis/sheets")
        const { auth } = await import("@/lib/google-drive")
        const sheetsClient = googleSheets({ version: "v4", auth })
        const sheetId = getSpreadsheetId()
        const resp = await sheetsClient.spreadsheets.values.get({ spreadsheetId: sheetId, range: "AgencyZoneMap!A:D" })
        const existingZoneRows = (resp.data.values || []).slice(1)
        let hasChange = false
        const updatedZoneMap = new Map<string, string>()
        const newZoneRows = existingZoneRows.map(r => {
          const mru = String(r[0] || "").trim().toUpperCase()
          let ag = String(r[1] || "").trim().toUpperCase()
          if (ag === oldNameUpper) {
            ag = newNameUpper
            hasChange = true
          }
          if (mru && ag) updatedZoneMap.set(mru, ag)
          return [mru, ag, r[2] || "", r[3] || ""]
        })
        if (hasChange) {
          await sheetsClient.spreadsheets.values.clear({ spreadsheetId: sheetId, range: "AgencyZoneMap!A2:D" })
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: "AgencyZoneMap!A2:D",
            valueInputOption: "RAW",
            requestBody: { values: newZoneRows },
          })
          const { syncConsumersWithZoneMap } = await import("@/lib/zone-map-sync")
          const { compactBaseVersion } = await import("@/lib/version-engine")
          await syncConsumersWithZoneMap({
            spreadsheetId: sheetId,
            changedBy: session.userId || "admin",
            tenantId,
            zoneAgencyMap: updatedZoneMap,
          })
          await compactBaseVersion(tenantId, "zone-map")
        }
      } catch (cascadeErr) {
        console.warn("Cascade agency rename to zone map notice:", cascadeErr)
      }
    }
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
    const billingStartDate = new Date("2026-09-07T00:00:00").getTime()
    const isPaidAgency = Boolean(
      Date.now() >= billingStartDate &&
      existingAgency.subscriptionStatus === "paid" &&
      existingAgency.subscriptionExpiresAt && 
      new Date(existingAgency.subscriptionExpiresAt).getTime() > Date.now()
    )

    if (isPaidAgency) {
      return NextResponse.json(
        { error: "Cannot delete an agency with an active paid subscription. Contact Superuser." },
        { status: 403 }
      )
    }

    await deleteAgency(id)

    // Cascade clean up: remove this agency from any users assigned to it in this CCC
    try {
      const cccUsers = await userStorage.getUsersByCcc(session.cccCode || "")
      const deletedNameUpper = existingAgency.name.trim().toUpperCase()
      for (const u of cccUsers) {
        if (u.agencies && u.agencies.some(a => a.trim().toUpperCase() === deletedNameUpper)) {
          const updatedAgencies = u.agencies.filter(a => a.trim().toUpperCase() !== deletedNameUpper)
          await userStorage.updateUser(u.id, { agencies: updatedAgencies })
        }
      }
    } catch (cleanErr) {
      console.warn("User agency assignment cleanup notice:", cleanErr)
    }
    const tenantId = request.headers.get("x-tenant-id") || "default"
    await incrKV(getTenantKey(tenantId, "agencies:version"))
    return NextResponse.json({ success: true, message: "Agency deleted successfully" })
  } catch (error) {
    console.error("Error deleting agency:", error)
    return NextResponse.json({ error: "Failed to delete agency" }, { status: 500 })
  }
})

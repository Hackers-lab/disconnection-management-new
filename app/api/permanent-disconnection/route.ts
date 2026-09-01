import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchPermanentDisconnections,
  _fetchPDRaw,
  proposePD,
  issuePDs,
  executePDDisconnection,
  returnPDMeterToStore,
  updatePDNoteSheet,
  reassignPDAgency,
  closePD
} from "@/lib/permanent-disconnection-service"
import { checkApiPermission } from "@/lib/permissions"
import { matchesAgency } from "@/lib/permission-utils"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("permanent_disconnection", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  const id = getSpreadsheetId()
  const bypass = request.nextUrl.searchParams.get("bypassCache") === "true"
  const all = bypass ? await _fetchPDRaw(id) : await fetchPermanentDisconnections(id)

  if (session.role === "agency") {
    const upperAgencies = (session.agencies || []).map((a: string) => a.trim().toUpperCase())
    return NextResponse.json(
      all.filter(r => {
        const recAgency = (r.agency || "").trim().toUpperCase()
        return upperAgencies.some((ua: string) => matchesAgency(recAgency, ua))
      }),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    )
  }

  return NextResponse.json(all, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
  })
})

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("permanent_disconnection", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { consumerId, consumerName, address, mobile, liveOsdAmount, agency } = body

    if (!consumerId || !consumerName || !address) {
      return NextResponse.json({ error: "Consumer ID, Name, and Address are required" }, { status: 400 })
    }

    const result = await proposePD({
      consumerId,
      consumerName,
      address,
      mobile: mobile || "",
      liveOsdAmount: typeof liveOsdAmount === "number" ? liveOsdAmount : parseFloat(liveOsdAmount || "0") || 0,
      agency: agency || "",
      proposedBy: session.name || session.username || "Admin"
    })

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.cccCode || request.headers.get("x-tenant-id") || "default"
    await appendDeltaPatch(tenantId, "permanent-disconnection", {
      action: "UPDATE",
      recordId: result.pdId,
      changes: { pdId: result.pdId, consumerId, consumerName, status: agency ? "issued" : "proposed" }
    }).catch(e => console.warn("Patch log error:", e))

    if (agency) {
      await updateBadgeCounts(tenantId, "permanent-disconnection", undefined, 1).catch(e => console.warn("Badge count error:", e))
    }

    return NextResponse.json({ success: true, pdId: result.pdId, record: result.record })
  } catch (e: any) {
    console.error("Propose PD error:", e)
    return NextResponse.json({ error: e.message || "Failed to propose PD" }, { status: 500 })
  }
})

export const PATCH = withTenant(async function PATCH(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { action, pdId, pdIds } = body

    // 1. Issue to Agency
    if (action === "issue") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["issue", "update", "create"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      const { agency } = body
      if (!agency) return NextResponse.json({ error: "Agency name is required" }, { status: 400 })

      const targetIds = pdIds && Array.isArray(pdIds) ? pdIds : (pdId ? [pdId] : [])
      if (targetIds.length === 0) return NextResponse.json({ error: "No PD records specified" }, { status: 400 })

      await issuePDs(targetIds, agency, session.name || session.username || "Admin")
      return NextResponse.json({ success: true, count: targetIds.length })
    }

    // 2. Agency Field Execution (Disconnect)
    if (action === "disconnect") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["install", "disconnect", "update"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      if (!pdId) return NextResponse.json({ error: "PD ID is required" }, { status: 400 })
      const { finalReading, removedMeterNo, meterCondition, evidencePhotos, latitude, longitude, disconnectionDateTime, agencyRemarks } = body

      await executePDDisconnection(pdId, {
        finalReading: finalReading || "",
        removedMeterNo: removedMeterNo || "",
        meterCondition: meterCondition || "working",
        evidencePhotos: evidencePhotos || "",
        latitude: latitude || "",
        longitude: longitude || "",
        disconnectionDateTime: disconnectionDateTime || "",
        agencyRemarks: agencyRemarks || ""
      })

      return NextResponse.json({ success: true })
    }

    // 3. Return Meter to Store
    if (action === "return_meter") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["return", "update"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      if (!pdId) return NextResponse.json({ error: "PD ID is required" }, { status: 400 })
      const { returnDate, condition, remarks } = body

      await returnPDMeterToStore(pdId, {
        returnDate,
        condition,
        remarks
      })

      return NextResponse.json({ success: true })
    }

    // 4. Update Note Sheet
    if (action === "note_sheet") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["finalize", "update"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      if (!pdId || !body.noteSheetNo) {
        return NextResponse.json({ error: "PD ID and Note Sheet No are required" }, { status: 400 })
      }

      await updatePDNoteSheet(pdId, {
        noteSheetNo: body.noteSheetNo,
        noteSheetDate: body.noteSheetDate
      })

      return NextResponse.json({ success: true })
    }

    // 5. Reassign Agency
    if (action === "reassign_agency") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["issue", "update"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      if (!pdId || body.agency === undefined) {
        return NextResponse.json({ error: "PD ID and agency are required" }, { status: 400 })
      }

      await reassignPDAgency(pdId, body.agency)
      return NextResponse.json({ success: true })
    }

    // 6. Close / Cancel PD Proposal
    if (action === "close" || action === "cancel") {
      const permCheck = await checkApiPermission("permanent_disconnection", ["create", "update", "delete"])
      if (!permCheck.authorized) return NextResponse.json({ error: permCheck.error }, { status: permCheck.status })

      if (!pdId || !body.remarks) {
        return NextResponse.json({ error: "PD ID and remarks are required" }, { status: 400 })
      }

      await closePD(pdId, body.remarks)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e: any) {
    console.error("Update PD error:", e)
    return NextResponse.json({ error: e.message || "Failed to update PD record" }, { status: 500 })
  }
})

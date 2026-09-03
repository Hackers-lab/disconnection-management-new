import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchReplacements, _fetchReplacementsRaw, addReplacement } from "@/lib/meter-replacement-service"
import { checkApiPermission } from "@/lib/permissions"
import { withTenant, getTenantContext } from "@/lib/tenant-context"
import { appendDeltaPatch, updateBadgeCounts } from "@/lib/version-engine"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  const id = getSpreadsheetId()
  const bypass = request.nextUrl.searchParams.get("bypassCache") === "true"
  const all = bypass ? await _fetchReplacementsRaw(id) : await fetchReplacements(id)

  if (session.role === "agency") {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(r => upper.includes((r.agency || "").toUpperCase())), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  }
  return NextResponse.json(all, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  })
})
export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { consumerId, consumerName, address, mobile, agency, purpose, remarks, attachmentUrl, oldMeterNo } = body

    if (!consumerId || !consumerName || !address || !purpose) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate live connection status: Deemed Disconnected connections are strictly blocked from meter replacement
    if (consumerId && /^\d{9}$/.test(String(consumerId).trim())) {
      try {
        const { fetchLiveOsdData } = await import("@/lib/live-osd-service")
        const liveCheck = await fetchLiveOsdData(String(consumerId).trim(), { timeoutMs: 10000 })
        if (liveCheck.success && liveCheck.data?.isDeemed) {
          return NextResponse.json({
            error: `Cannot propose meter replacement: Consumer connection is Deemed Disconnected (${liveCheck.data.connectionStatus}) on WBSEDCL portal.`,
            isDeemed: true
          }, { status: 400 })
        }
      } catch (err) {
        console.warn("Server-side live deemed check error, proceeding with proposal:", err)
      }
    }

    const replacementId = await addReplacement({
      consumerId,
      consumerName,
      address,
      mobile: mobile || "",
      agency: agency || "",
      purpose,
      remarks: remarks || "",
      attachmentUrl: attachmentUrl || "",
      oldMeterNo: oldMeterNo || ""
    })

    return NextResponse.json({ success: true, replacementId })
  } catch (e: any) {
    console.error("Create replacement error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

export const PATCH = withTenant(async function PATCH(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { action, replacementId, remarks, noteSheetNo, status } = body

    if (action === "close" || action === "cancel" || status === "closed" || status === "cancelled") {
      const { closeReplacement } = await import("@/lib/meter-replacement-service")
      if (!replacementId || !remarks) {
        return NextResponse.json({ error: "Replacement ID and remarks are required" }, { status: 400 })
      }
      await closeReplacement(replacementId, remarks)

      const tenantContext = getTenantContext()
      const tenantId = tenantContext?.cccCode || request.headers.get("x-tenant-id") || "default"
      await appendDeltaPatch(tenantId, "meter-replacement", {
        action: "UPDATE",
        recordId: String(replacementId),
        changes: { status: "closed", remarks },
      }).catch(e => console.warn("Patch log error:", e))

      await updateBadgeCounts(tenantId, "meter-replacement", undefined, -1).catch(e => console.warn("Badge count error:", e))

      return NextResponse.json({ success: true })
    }

    if (action === "note_sheet") {
      const { updateReplacementNoteSheet } = await import("@/lib/meter-replacement-service")
      if (!replacementId || !noteSheetNo) {
        return NextResponse.json({ error: "Replacement ID and Note Sheet No are required" }, { status: 400 })
      }
      await updateReplacementNoteSheet(replacementId, noteSheetNo)
      return NextResponse.json({ success: true })
    }

    if (action === "reassign_agency") {
      const { reassignAgency } = await import("@/lib/meter-replacement-service")
      const { agency } = body
      if (!replacementId || agency === undefined) {
        return NextResponse.json({ error: "Replacement ID and agency are required" }, { status: 400 })
      }
      await reassignAgency(replacementId, agency)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e: any) {
    console.error("Update replacement error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})


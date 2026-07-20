import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { updateDTRPainting } from "@/lib/dtr-service"
import { appendDTRHistory } from "@/lib/dtr-history"
import { nowTs } from "@/lib/date-utils"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  // Painting updates can be performed by admin or anyone with update permission (including agency painters)
  let { authorized, error, status, session } = await checkApiPermission("dtr", "update")
  if (!authorized) {
    const fallback = await checkApiPermission("dtr_painting", "update")
    if (fallback.authorized) {
      authorized = true
      session = fallback.session
    } else {
      return NextResponse.json({ error }, { status })
    }
  }

  try {
    const body = await request.json()
    if (!body.dtrCode) {
      return NextResponse.json({ error: "DTR Code is required" }, { status: 400 })
    }
    if (!body.image) {
      return NextResponse.json({ error: "Photographic image proof of painting is mandatory" }, { status: 400 })
    }
    if (!body.painting || (body.painting !== "Done" && body.painting !== "Pending")) {
      return NextResponse.json({ error: "Painting status must be Done or Pending" }, { status: 400 })
    }

    const dtrCode = String(body.dtrCode).trim()
    const painting = String(body.painting).trim()
    const image = String(body.image).trim()
    const remarks = String(body.remarks || "").trim()
    const verifiedBy = session.username || "painter"

    const tenantConfig = await getTenantConfig(session.cccCode)
    await updateDTRPainting(dtrCode, painting, image, remarks, verifiedBy, tenantConfig.spreadsheetId)

    // Save update log to DTR History
    await appendDTRHistory({
      timestamp: nowTs(),
      dtrCode: dtrCode,
      feederName: "Painting Update",
      painting: painting,
      kiosk: "Painting Update",
      la: "Painting Update",
      ne: "Painting Update",
      loadCurrents: "N/A",
      verifiedBy: verifiedBy,
      remarks: remarks || "Painting Completed Registrations",
      imageUrl: image,
      locationName: "Painting Site Work"
    }, tenantConfig.spreadsheetId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("💥 DTR painting update error:", e)
    return NextResponse.json({ error: e.message || "Failed to update DTR painting status" }, { status: 500 })
  }
})

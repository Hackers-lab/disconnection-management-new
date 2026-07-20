import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
import { fetchDTRData, updateDTRRecord, uploadDTRData, DTRRecord } from "@/lib/dtr-service"
import { nowTs } from "@/lib/date-utils"
import { appendDTRHistory } from "@/lib/dtr-history"

export const GET = withTenant(async function GET(request: NextRequest) {
  let { authorized, error, status, session } = await checkApiPermission("dtr", "read")
  if (!authorized) {
    const fallback = await checkApiPermission("dtr_painting", "read")
    if (fallback.authorized) {
      authorized = true
      session = fallback.session
    } else {
      return NextResponse.json({ error }, { status })
    }
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const all = await fetchDTRData(spreadsheetId)
    return NextResponse.json(all, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("💥 DTR fetch error:", e)
    return NextResponse.json({ error: e.message || "Failed to fetch DTR data" }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("dtr", "update")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    if (!body.dtrCode) {
      return NextResponse.json({ error: "DTR Code is required" }, { status: 400 })
    }

    const originalDtrCode = body.originalDtrCode ? String(body.originalDtrCode).trim() : undefined
    const newDtrCode = String(body.dtrCode).trim()

    // Restrict changing DTR code to admin only
    if (originalDtrCode && originalDtrCode.toUpperCase() !== newDtrCode.toUpperCase()) {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "Only system admins are permitted to change DTR codes." }, { status: 403 })
      }
    }

    const record: DTRRecord = {
      dtrCode:        newDtrCode,
      feederName:     String(body.feederName || "").trim(),
      locationName:   String(body.locationName || "").trim(),
      kvCapacity:     String(body.kvCapacity || "").trim(),
      status:         String(body.status || "").trim(),
      actualFeeder:   String(body.actualFeeder || "").trim(),
      actualRating:   String(body.actualRating || "").trim(),
      actualLocation: String(body.actualLocation || "").trim(),
      supplyOffice:   String(body.supplyOffice || "").trim(),
      latlong:        String(body.latlong || "").trim(),
      long:           String(body.long || "").trim(),
      image:          String(body.image || "").trim(),
      painting:       String(body.painting || "").trim(),
      kiosk:          String(body.kiosk || "").trim(),
      la:             String(body.la || "").trim(),
      ne:             String(body.ne || "").trim(),
      loadR:          String(body.loadR || "").trim(),
      loadY:          String(body.loadY || "").trim(),
      loadB:          String(body.loadB || "").trim(),
      loadN:          String(body.loadN || "").trim(),
      verifiedBy:     session.username || "system",
      verifiedAt:     nowTs(),
      remarks:        String(body.remarks || "").trim(),
      paintingAgency: String(body.paintingAgency || "").trim(),
      auditAgency:    String(body.auditAgency || "").trim(),
      paintingImage:  String(body.paintingImage || "").trim(),
    }

    const spreadsheetId = getSpreadsheetId()
    await updateDTRRecord(record, originalDtrCode, spreadsheetId)

    // Save update to DTR History sheet
    await appendDTRHistory({
      timestamp: nowTs(),
      dtrCode: record.dtrCode,
      feederName: record.actualFeeder || record.feederName,
      painting: record.painting || "Pending",
      kiosk: record.kiosk || "Good",
      la: record.la || "Good",
      ne: record.ne || "Good",
      loadCurrents: `R:${record.loadR || 0}, Y:${record.loadY || 0}, B:${record.loadB || 0}, N:${record.loadN || 0}`,
      verifiedBy: record.verifiedBy,
      remarks: record.remarks || "",
      imageUrl: record.image || "",
      locationName: record.actualLocation || record.locationName
    }, spreadsheetId)

    return NextResponse.json({ success: true, record })
  } catch (e: any) {
    console.error("💥 DTR update error:", e)
    return NextResponse.json({ error: e.message || "Failed to update DTR record" }, { status: 500 })
  }
})

export const PUT = withTenant(async function PUT(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("dtr", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const rows = body.rows || []
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows must be an array" }, { status: 400 })
    }

    const dtrRows = rows.map((r: any) => ({
      dtrCode:        String(r.dtrCode || "").trim(),
      feederName:     String(r.feederName || "").trim(),
      locationName:   String(r.locationName || "").trim(),
      kvCapacity:     String(r.kvCapacity || "").trim(),
      status:         String(r.status || "").trim(),
      actualFeeder:   String(r.actualFeeder || "").trim(),
      actualRating:   String(r.actualRating || "").trim(),
      actualLocation: String(r.actualLocation || "").trim(),
      supplyOffice:   String(r.supplyOffice || "").trim(),
      latlong:        String(r.latlong || "").trim(),
      long:           String(r.long || "").trim(),
      image:          String(r.image || "").trim(),
      painting:       String(r.painting || "Pending").trim(),
      kiosk:          String(r.kiosk || "Good").trim(),
      la:             String(r.la || "Good").trim(),
      ne:             String(r.ne || "Good").trim(),
      loadR:          String(r.loadR || "").trim(),
      loadY:          String(r.loadY || "").trim(),
      loadB:          String(r.loadB || "").trim(),
      loadN:          String(r.loadN || "").trim(),
      remarks:        String(r.remarks || "").trim(),
      paintingAgency: String(r.paintingAgency || r["Painting Agency"] || r["paintingagency"] || "").trim(),
      auditAgency:    String(r.auditAgency || r["Audit Agency"] || r["auditagency"] || "").trim(),
      paintingImage:  String(r.paintingImage || r["Painting Image"] || r["paintingimage"] || "").trim(),
    }))

    const spreadsheetId = getSpreadsheetId()
    const count = await uploadDTRData(dtrRows, true, spreadsheetId)
    return NextResponse.json({ success: true, count })
  } catch (e: any) {
    console.error("💥 DTR bulk upload error:", e)
    return NextResponse.json({ error: e.message || "Failed to upload DTR data" }, { status: 500 })
  }
})

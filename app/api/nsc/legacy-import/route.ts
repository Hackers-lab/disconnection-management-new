import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { importLegacyApplications, type LegacyImportRow } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "rows array required" }, { status: 400 })
    }
    const rows: LegacyImportRow[] = (body.rows as any[]).map(r => ({
      applicantName: String(r.applicantName || "").trim(),
      careOf:        String(r.careOf        || "").trim(),
      address:       String(r.address       || "").trim(),
      mobile:        String(r.mobile        || "").trim(),
      appliedClass:  String(r.appliedClass  || "domestic").trim(),
      phase:         String(r.phase         || "1P").trim(),
      agency:        String(r.agency        || "").trim(),
      officeRefNo:   String(r.officeRefNo   || "").trim(),
      receivedDate:  String(r.receivedDate  || "").trim(),
      status:        String(r.status        || "quotation_issued").trim(),
      createdBy:     `${session.role}:${session.username}`,
    })).filter(r => r.applicantName)

    const count = await importLegacyApplications(rows)
    return NextResponse.json({ success: true, count })
  } catch (e: any) {
    console.error("Legacy import error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

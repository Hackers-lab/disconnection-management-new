import { NextRequest, NextResponse } from "next/server"
import { submitInspection } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"
import { checkApiPermission } from "@/lib/permissions"

export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("nsc", "update")
  if (!authorized) {
    return NextResponse.json({ error }, { status: status || 403 })
  }

  try {
    const body = await request.json()
    if (!body.receiveNo)      return NextResponse.json({ error: "receiveNo required" }, { status: 400 })
    if (!body.agencyDecision) return NextResponse.json({ error: "Agency decision required" }, { status: 400 })
    if (!body.siteImg)        return NextResponse.json({ error: "Site image required" }, { status: 400 })
    if (!body.inspectionFormImg) return NextResponse.json({ error: "Inspection form image required" }, { status: 400 })
    if (body.poleRequired === "yes" && !body.poleDrawingImg) {
      return NextResponse.json({ error: "Pole Drawing Image is required for pole cases" }, { status: 400 })
    }

    await submitInspection({
      receiveNo:         body.receiveNo,
      verifyName:        body.verifyName        || "",
      verifyCO:          body.verifyCO          || "",
      verifyAddress:     body.verifyAddress     || "",
      verifyClass:       body.verifyClass       || "",
      existingMeter:     body.existingMeter     || "no",
      existingMeterNo:   body.existingMeterNo   || "",
      existingMeterImg:  body.existingMeterImg  || "",
      validPartition:    body.validPartition    || "yes",
      partitionImg:      body.partitionImg      || "",
      dispute:           body.dispute           || "",
      load:              body.load              || "",
      serviceLength:     body.serviceLength     || "",
      poleRequired:      body.poleRequired      || "no",
      poleDrawingImg:    body.poleDrawingImg    || "",
      dtrCapacity:       body.dtrCapacity       || "",
      dtrLoad:           body.dtrLoad           || "",
      siteImg:           body.siteImg,
      inspectionFormImg: body.inspectionFormImg,
      agencyDecision:    body.agencyDecision,
      agencyRemarks:     body.agencyRemarks     || "",
      inspectedBy:       `${session.role}:${session.username}`,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("NSC inspect error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

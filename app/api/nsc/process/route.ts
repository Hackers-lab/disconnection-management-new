import { NextRequest, NextResponse } from "next/server"
import { processApplication } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"
import { checkApiPermission } from "@/lib/permissions"

export const POST = withTenant(async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("nsc", "update")
  if (!authorized) {
    return NextResponse.json({ error }, { status: status || 403 })
  }

  try {
    const body = await request.json()
    if (!body.receiveNo)   return NextResponse.json({ error: "receiveNo required" }, { status: 400 })
    if (!body.finalAction) return NextResponse.json({ error: "finalAction required" }, { status: 400 })

    if (body.finalAction === "quotation" && !body.applicationNo) {
      return NextResponse.json({ error: "Application No (10-digit) required for quotation" }, { status: 400 })
    }
    if (body.finalAction === "dispute_letter" && !body.memoNo) {
      return NextResponse.json({ error: "Memo No required for dispute letter" }, { status: 400 })
    }
    if (body.finalAction === "reassign" && !body.newAgency) {
      return NextResponse.json({ error: "New agency required for reassignment" }, { status: 400 })
    }

    await processApplication({
      receiveNo:          body.receiveNo,
      adminDecision:      body.adminDecision      || "",
      adminRemarks:       body.adminRemarks       || "",
      finalAction:        body.finalAction,
      memoNo:             body.memoNo             || "",
      applicationNo:      body.applicationNo      || "",
      newAgency:          body.newAgency          || "",
      existingConsumerId: body.existingConsumerId ?? undefined,
      finalizedBy:        `${session.role}:${session.username}`,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("NSC process error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { saveCheckMeterCrossCheck, finalizeCheckMeter } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.isSubscribed) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 })
  }

  try {
    const body = await request.json()
    const { action, issueId } = body

    if (!issueId) {
      return NextResponse.json({ error: "Issue ID is required" }, { status: 400 })
    }

    if (action === "cross_check") {
      const { checkNum, crossCheckDate, existingMeterReading, checkMeterReading, nextCheckDate, diffUnits, accuracyPct } = body
      if (!checkNum || !crossCheckDate || !existingMeterReading || !checkMeterReading) {
        return NextResponse.json({ error: "Missing required cross-check parameters" }, { status: 400 })
      }
      await saveCheckMeterCrossCheck({
        issueId,
        checkNum,
        crossCheckDate,
        existingMeterReading,
        checkMeterReading,
        nextCheckDate,
        diffUnits,
        accuracyPct,
      })
      return NextResponse.json({ success: true })
    }

    if (action === "finalize") {
      const { outcome, remarks } = body
      if (!outcome || (outcome !== "removed_ok" && outcome !== "replace_meter")) {
        return NextResponse.json({ error: "Valid outcome is required (removed_ok or replace_meter)" }, { status: 400 })
      }
      await finalizeCheckMeter({
        issueId,
        outcome,
        remarks: remarks || "",
        finalizedBy: session.username || session.role,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e: any) {
    console.error("Check meter API error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

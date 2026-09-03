import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { completeMeterInstallation } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.isSubscribed) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 })
  }

  try {
    const body = await request.json()
    if (!body.issueId)    return NextResponse.json({ error: "issueId required" }, { status: 400 })
    if (!body.afterImage) return NextResponse.json({ error: "After-installation image required" }, { status: 400 })

    const { getSpreadsheetId } = await import("@/lib/google-sheets-api")
    const { _fetchIssuesRaw } = await import("@/lib/meter-service")
    const issues = await _fetchIssuesRaw(getSpreadsheetId())
    const issue = issues.find((i: any) => i.issueId === body.issueId)
    if (issue?.agency) {
      const { assertAgencySubscribedForUpdate } = await import("@/lib/permissions")
      const subCheck = await assertAgencySubscribedForUpdate(session, issue.agency)
      if (!subCheck.allowed) {
        return NextResponse.json({ error: subCheck.error }, { status: 403 })
      }
    }

    await completeMeterInstallation({
      issueId:          body.issueId,
      afterImage:       body.afterImage,
      beforeImage:      body.beforeImage || "",
      lastReading:      body.lastReading || "",
      newReading:       body.newReading  || "",
      completedBy:      `${session.role}:${session.username}`,
      remarks:          body.remarks || "",
      installationDate: body.installationDate || "",
      dtrCode:          body.dtrCode || "",
      zoneNo:           body.zoneNo || "",
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Complete meter error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

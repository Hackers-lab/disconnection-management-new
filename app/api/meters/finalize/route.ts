import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { finalizeMeterInstallation, bulkFinalizeMeterInstallations } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()

    const finalizedBy = `${session.role}:${session.username}`

    // Bulk path: { issueIds: string[], completionRef, installationNo? }
    if (Array.isArray(body.issueIds) && body.issueIds.length > 0) {
      const result = await bulkFinalizeMeterInstallations({
        issueIds:       body.issueIds,
        completionRef:  body.completionRef,
        installationNo: body.installationNo || "",
        finalizedBy,
      })
      return NextResponse.json(result)
    }

    // Single path: { issueId, completionRef, installationNo? }
    if (!body.issueId) return NextResponse.json({ error: "issueId or issueIds required" }, { status: 400 })
    await finalizeMeterInstallation({
      issueId:        body.issueId,
      completionRef:  body.completionRef,
      installationNo: body.installationNo || "",
      finalizedBy,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Finalize error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

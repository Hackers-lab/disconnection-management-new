import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { completeMeterInstallation } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.issueId)    return NextResponse.json({ error: "issueId required" }, { status: 400 })
    if (!body.afterImage) return NextResponse.json({ error: "After-installation image required" }, { status: 400 })

    await completeMeterInstallation({
      issueId:     body.issueId,
      afterImage:  body.afterImage,
      beforeImage: body.beforeImage || "",
      lastReading: body.lastReading || "",
      newReading:  body.newReading  || "",
      completedBy: `${session.role}:${session.username}`,
      remarks:     body.remarks || "",
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Complete meter error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

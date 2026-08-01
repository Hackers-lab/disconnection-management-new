import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { addFeedback } from "@/lib/feedback-service"
import { getTenantConfig } from "@/lib/tenant-resolver"

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const comment = String(body.comment || "").trim()
    const rating = Math.min(5, Math.max(1, parseInt(body.rating || "5", 10)))

    if (!comment) {
      return NextResponse.json({ error: "Feedback comment cannot be empty" }, { status: 400 })
    }

    const tenantConfig = await getTenantConfig(session.cccCode).catch(() => null)
    const supplyOffice = tenantConfig?.cccName || session.cccCode || "Supply Office"

    const created = await addFeedback(
      {
        username: session.username || "user",
        name: session.name || session.username || "User Officer",
        supplyOffice,
        cccCode: session.cccCode || "",
        rating,
        comment,
      },
      tenantConfig?.spreadsheetId
    )

    return NextResponse.json({ success: true, feedback: created })
  } catch (error: any) {
    console.error("Error saving user feedback:", error)
    return NextResponse.json({ error: error.message || "Failed to submit feedback" }, { status: 500 })
  }
}

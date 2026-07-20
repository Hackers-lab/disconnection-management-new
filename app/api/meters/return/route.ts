import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { returnMeterToStock } from "@/lib/meter-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    await returnMeterToStock({
      issueId: body.issueId,
      remarks: body.remarks || "",
      faulty:  !!body.faulty,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

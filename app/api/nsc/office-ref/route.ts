import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { updateOfficeRefNo } from "@/lib/nsc-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { receiveNo, officeRefNo } = await request.json()
    if (!receiveNo) return NextResponse.json({ error: "receiveNo required" }, { status: 400 })
    await updateOfficeRefNo(receiveNo, officeRefNo || "")
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

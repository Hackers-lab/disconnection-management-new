import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  return NextResponse.json({ ok: true })
})

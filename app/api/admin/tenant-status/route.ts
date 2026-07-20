import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const config = await getTenantConfig(session.cccCode)
    return NextResponse.json({
      cccCode: config.cccCode,
      cccName: config.cccName,
      linked: !!(config.driveFolderId && config.googleDriveRefreshToken),
      driveFolderId: config.driveFolderId || null,
      spreadsheetId: config.spreadsheetId || null
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
})

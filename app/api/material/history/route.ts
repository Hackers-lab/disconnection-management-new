import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getMaterialHistory } from "@/lib/material-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["read", "stock", "receive", "issue", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    const materialId = searchParams.get("materialId")

    if (!materialId) {
      return NextResponse.json({ error: "materialId query param is required" }, { status: 400 })
    }

    const id = getSpreadsheetId()
    const history = await getMaterialHistory(materialId, id)
    return NextResponse.json(history)
  } catch (e: any) {
    console.error("Material history error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

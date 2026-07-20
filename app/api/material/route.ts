import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getStock, getCatalogue, invalidateMaterialCache } from "@/lib/material-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const dynamic = "force-dynamic"

export const GET = withTenant(async function GET(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["read", "stock", "receive", "issue", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    if (searchParams.get("revalidate") === "true") {
      invalidateMaterialCache()
    }
    const id = getSpreadsheetId()
    const [stock, catalogue] = await Promise.all([getStock(id), getCatalogue(id)])
    return NextResponse.json({ stock, catalogue }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("Material stock error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

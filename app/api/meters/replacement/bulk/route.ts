import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { addBulkReplacements, fetchReplacements } from "@/lib/meter-replacement-service"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { checkApiPermission } from "@/lib/permissions"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { items } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No replacement items provided" }, { status: 400 })
    }

    // Filter out consumers with existing active (incomplete) meter replacements
    const id = getSpreadsheetId()
    const allReplacements = await fetchReplacements(id)
    const activeSet = new Set(
      allReplacements
        .filter(r => r.status !== "closed" && r.status !== "completed" && !(r.status === "replaced" && r.noteSheetNo && r.noteSheetNo.trim()))
        .map(r => String(r.consumerId).trim())
    )

    const duplicateConsumerIds: string[] = []
    const cleanItems = items.filter(item => {
      const cid = String(item.consumerId || "").trim()
      if (cid && cid !== "000000000" && activeSet.has(cid)) {
        duplicateConsumerIds.push(cid)
        return false
      }
      return true
    })

    if (cleanItems.length === 0) {
      return NextResponse.json({
        error: `All proposed consumers already have active meter replacements in progress: ${duplicateConsumerIds.join(", ")}`,
        duplicates: duplicateConsumerIds
      }, { status: 400 })
    }

    const res = await addBulkReplacements(cleanItems)
    return NextResponse.json({
      success: true,
      added: res.added,
      skippedDuplicatesCount: duplicateConsumerIds.length,
      skippedConsumerIds: duplicateConsumerIds.length > 0 ? duplicateConsumerIds : undefined
    })
  } catch (e: any) {
    console.error("Bulk create replacement error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

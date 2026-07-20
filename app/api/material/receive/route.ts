import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getReceiveHistory, addReceives, deleteReceive } from "@/lib/material-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["read", "receive", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const id = getSpreadsheetId()
    const receives = await getReceiveHistory(id)
    return NextResponse.json(receives, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("Material receive history error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("material", ["create", "receive"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const formData = await req.formData()
    const itemsStr     = formData.get("items")        as string
    const challanRef   = formData.get("challanRef")   as string || ""
    const receivedDate = formData.get("receivedDate") as string || ""
    const receivedFrom = formData.get("receivedFrom") as string || ""
    const remarks      = formData.get("remarks")      as string || ""
    const photoFile    = formData.get("photo")         as File | null

    if (!itemsStr) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    const items = JSON.parse(itemsStr)
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items must be a non-empty array" }, { status: 400 })
    }

    const receive = await addReceives({
      items,
      challanRef: challanRef.trim(),
      receivedDate: receivedDate.trim(),
      receivedFrom: receivedFrom.trim(),
      photoFile: photoFile && photoFile.size > 0 ? photoFile : null,
      remarks: remarks.trim(),
      createdBy: session.agencies?.[0] || session.role || "unknown",
    })

    return NextResponse.json(receive)
  } catch (e: any) {
    console.error("Add receive error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const DELETE = withTenant(async function DELETE(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["delete", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    const receiveId = searchParams.get("receiveId")

    if (!receiveId) {
      return NextResponse.json({ error: "Receive ID is required" }, { status: 400 })
    }

    await deleteReceive(receiveId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Delete receive error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

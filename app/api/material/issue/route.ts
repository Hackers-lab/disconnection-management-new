import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getIssueHistory, addIssues, deleteIssue } from "@/lib/material-service"
import { withTenant } from "@/lib/tenant-context"
import { getSpreadsheetId } from "@/lib/google-sheets-api"

export const GET = withTenant(async function GET(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["read", "issue", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const id = getSpreadsheetId()
    const issues = await getIssueHistory(id)
    return NextResponse.json(issues, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e: any) {
    console.error("Material issue history error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const POST = withTenant(async function POST(req: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("material", ["update", "issue"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const formData = await req.formData()
    const itemsStr             = formData.get("items")                as string
    const recipientName        = formData.get("recipientName")        as string || ""
    const recipientDesignation = formData.get("recipientDesignation") as string || ""
    const purpose              = formData.get("purpose")              as string || ""
    const issueDate            = formData.get("issueDate")            as string || ""
    const remarks              = formData.get("remarks")              as string || ""
    const photoFile            = formData.get("photo")                as File | null

    if (!itemsStr) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    const items = JSON.parse(itemsStr)
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items must be a non-empty array" }, { status: 400 })
    }

    const issue = await addIssues({
      items,
      recipientName: recipientName.trim(),
      recipientDesignation: recipientDesignation.trim(),
      purpose: purpose.trim(),
      issueDate: issueDate.trim(),
      photoFile: photoFile && photoFile.size > 0 ? photoFile : null,
      remarks: remarks.trim(),
      issuedBy: session.agencies?.[0] || session.role || "unknown",
    })

    return NextResponse.json(issue)
  } catch (e: any) {
    console.error("Add issue error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

export const DELETE = withTenant(async function DELETE(req: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("material", ["delete", "settings"])
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const { searchParams } = new URL(req.url)
    const issueId = searchParams.get("issueId")

    if (!issueId) {
      return NextResponse.json({ error: "Issue ID is required" }, { status: 400 })
    }

    await deleteIssue(issueId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Delete issue error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})

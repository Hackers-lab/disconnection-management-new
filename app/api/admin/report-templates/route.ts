import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getTemplatesForUser, saveTemplate, deleteTemplate } from "@/lib/report-templates"

export const dynamic = "force-dynamic"

// GET - list the current admin's saved report templates
export async function GET() {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await getTemplatesForUser(session.userId), {
      headers: { 'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error("Error loading report templates:", error)
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 })
  }
}

// POST - create/update a named template { name, config }
export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { name, config } = await request.json()
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 })
    }
    await saveTemplate(session.userId, name.trim(), config ?? {})
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving report template:", error)
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 })
  }
}

// DELETE - remove a named template (?name=)
export async function DELETE(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const name = new URL(request.url).searchParams.get("name")
    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 })
    }
    return NextResponse.json({ success: await deleteTemplate(session.userId, name) })
  } catch (error) {
    console.error("Error deleting report template:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}

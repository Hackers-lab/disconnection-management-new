import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getRuleSetsForUser, saveRuleSet, deleteRuleSet } from "@/lib/upload-rules"

export const dynamic = "force-dynamic"

// GET - list the current admin's saved filter presets
export async function GET() {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const sets = await getRuleSetsForUser(session.userId)
    return NextResponse.json(sets, {
      headers: { 'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error("Error loading upload rules:", error)
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 })
  }
}

// POST - create/update a named preset { name, groups }
export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { name, groups } = await request.json()
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Preset name is required" }, { status: 400 })
    }
    await saveRuleSet(session.userId, name.trim(), groups ?? [])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving upload rules:", error)
    return NextResponse.json({ error: "Failed to save rules" }, { status: 500 })
  }
}

// DELETE - remove a named preset (?name=)
export async function DELETE(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const name = new URL(request.url).searchParams.get("name")
    if (!name) {
      return NextResponse.json({ error: "Preset name is required" }, { status: 400 })
    }
    const deleted = await deleteRuleSet(session.userId, name)
    return NextResponse.json({ success: deleted })
  } catch (error) {
    console.error("Error deleting upload rule:", error)
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { updateIssueNoteSheet } from "@/lib/meter-service"
import { updateReplacementNoteSheet } from "@/lib/meter-replacement-service"
import { withTenant } from "@/lib/tenant-context"

export const POST = withTenant(async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { issueId, issueIds, replacementId, replacementIds, noteSheetNo } = body

    if (!noteSheetNo || (!issueId && !issueIds?.length && !replacementId && !replacementIds?.length)) {
      return NextResponse.json({ error: "Note Sheet No and target IDs are required" }, { status: 400 })
    }

    const targetIssueIds: string[] = issueIds || (issueId ? [issueId] : [])
    const targetReplacementIds: string[] = replacementIds || (replacementId ? [replacementId] : [])

    let updatedCount = 0

    // Combine all IDs to try updating both tables
    const allIds = Array.from(new Set([...targetIssueIds, ...targetReplacementIds]))

    for (const id of allIds) {
      let updatedInIssue = false
      try {
        await updateIssueNoteSheet(id, noteSheetNo)
        updatedInIssue = true
      } catch { /* not in issues table */ }

      let updatedInRep = false
      try {
        await updateReplacementNoteSheet(id, noteSheetNo)
        updatedInRep = true
      } catch { /* not in replacements table */ }

      if (updatedInIssue || updatedInRep) {
        updatedCount++
      }
    }

    return NextResponse.json({ success: true, count: updatedCount })
  } catch (e: any) {
    console.error("Note sheet API error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
})

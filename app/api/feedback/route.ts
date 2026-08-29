import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getUserFeedback, addFeedback } from "@/lib/feedback-service"
import { getTenantRegistry } from "@/lib/tenant-resolver"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const feedback = await getUserFeedback(session.username, session.cccCode)

    if (!feedback || !feedback.comment) {
      return NextResponse.json({ feedback: null, hasSubmitted: false })
    }

    return NextResponse.json({
      hasSubmitted: true,
      feedback: {
        id: feedback.id,
        cccCode: feedback.cccCode || session.cccCode,
        username: feedback.username || session.username,
        name: feedback.name || session.name || "Officer",
        supplyOffice: feedback.supplyOffice || (session.cccCode ? `${session.cccCode} CCC` : "CCC Office"),
        rating: feedback.rating || 5,
        category: "General",
        feedbackText: feedback.comment,
        comment: feedback.comment,
      },
    }, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      }
    })
  } catch (e: any) {
    console.error("GET Feedback Error:", e)
    return NextResponse.json({ error: e.message || "Failed to fetch feedback" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const rating = Number(body.rating || 5)
    const comment = String(body.feedbackText || body.comment || "").trim()

    if (!comment) {
      return NextResponse.json({ error: "Feedback text is required" }, { status: 400 })
    }

    const cccCode = String(session.cccCode || "MAIN").trim()
    const username = String(session.username).trim()

    let officialCccName = ""
    try {
      const registry = await getTenantRegistry()
      officialCccName = registry[cccCode]?.cccName || registry[username]?.cccName || ""
    } catch (e) {}

    const name = String(
      body.name ||
      session.name ||
      (session as any).agencyName ||
      (username && !/^\d+$/.test(username) ? username : (officialCccName ? `${officialCccName.replace(/\s*ccc$/i, '')} Officer` : "Officer"))
    ).trim()

    let supplyOffice = String(
      body.supplyOffice ||
      officialCccName ||
      (session as any).supplyOffice ||
      (session as any).cccName ||
      (cccCode ? `${cccCode} CCC` : "CCC Office")
    ).trim()

    if (officialCccName && (/^\d+\s*ccc$/i.test(supplyOffice) || /^\d+$/.test(supplyOffice))) {
      supplyOffice = officialCccName
    }

    const saved = await addFeedback({
      username,
      name,
      supplyOffice,
      cccCode,
      rating,
      comment,
    })

    return NextResponse.json({ success: true, message: "Feedback saved successfully", feedback: saved })
  } catch (e: any) {
    console.error("POST Feedback Error:", e)
    return NextResponse.json({ error: e.message || "Failed to save feedback" }, { status: 500 })
  }
}

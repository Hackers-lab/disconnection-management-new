import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getUserFeedback, addFeedback } from "@/lib/feedback-service"
import { getTenantRegistry } from "@/lib/tenant-resolver"
import {
  getFeedbackRewardStatus,
  tryGrantFeedbackReward,
} from "@/lib/feedback-reward-service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [feedback, rewardStatus] = await Promise.all([
      getUserFeedback(session.username, session.cccCode),
      getFeedbackRewardStatus(session),
    ])

    const headers = {
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    }

    if (!feedback || !feedback.comment) {
      return NextResponse.json(
        { feedback: null, hasSubmitted: false, rewardStatus },
        { headers }
      )
    }

    return NextResponse.json(
      {
        hasSubmitted: true,
        rewardStatus,
        feedback: {
          id: feedback.id,
          cccCode: feedback.cccCode || session.cccCode,
          username: feedback.username || session.username,
          name: feedback.name || session.name || "Officer",
          supplyOffice:
            feedback.supplyOffice ||
            (session.cccCode ? `${session.cccCode} CCC` : "CCC Office"),
          rating: feedback.rating || 5,
          category: "General",
          feedbackText: feedback.comment,
          comment: feedback.comment,
        },
      },
      { headers }
    )
  } catch (e: any) {
    console.error("GET Feedback Error:", e)
    return NextResponse.json(
      { error: e.message || "Failed to fetch feedback" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session?.username) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const rating = Math.min(5, Math.max(1, Number(body.rating || 5)))
    const comment = String(body.feedbackText || body.comment || "").trim()
    // Preserve raw user-typed text (before any quick-star auto-fill) for genuine written-review reward validation
    const rawUserText =
      typeof body.userWrittenText === "string" ? body.userWrittenText : comment

    if (!comment) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 }
      )
    }

    const cccCode = String(session.cccCode || "MAIN").trim()
    const username = String(session.username).trim()

    let officialCccName = ""
    try {
      const registry = await getTenantRegistry()
      officialCccName =
        registry[cccCode]?.cccName || registry[username]?.cccName || ""
    } catch {}

    const name = String(
      body.name ||
        session.name ||
        (session as any).agencyName ||
        (username && !/^\d+$/.test(username)
          ? username
          : officialCccName
            ? `${officialCccName.replace(/\s*ccc$/i, "")} Officer`
            : "Officer")
    ).trim()

    let supplyOffice = String(
      body.supplyOffice ||
        officialCccName ||
        (session as any).supplyOffice ||
        (session as any).cccName ||
        (cccCode ? `${cccCode} CCC` : "CCC Office")
    ).trim()

    if (
      officialCccName &&
      (/^\d+\s*ccc$/i.test(supplyOffice) || /^\d+$/.test(supplyOffice))
    ) {
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

    // Evaluate and atomically grant +7 day individual subscription bonus if eligible
    const reward = await tryGrantFeedbackReward(session, saved.id, rawUserText)
    const rewardStatus = await getFeedbackRewardStatus({
      ...session,
      subscriptionExpiresAt:
        reward.newExpiresAt || session.subscriptionExpiresAt,
      subscriptionStatus: reward.granted
        ? "active"
        : session.subscriptionStatus,
    })

    return NextResponse.json({
      success: true,
      message: reward.granted
        ? reward.message
        : "Feedback saved successfully",
      feedback: saved,
      reward,
      rewardStatus,
    })
  } catch (e: any) {
    console.error("POST Feedback Error:", e)
    return NextResponse.json(
      { error: e.message || "Failed to save feedback" },
      { status: 500 }
    )
  }
}

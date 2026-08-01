import { NextResponse } from "next/server"
import { fetchApprovedFeedbacks } from "@/lib/feedback-service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const feedbacks = await fetchApprovedFeedbacks()
    return NextResponse.json(feedbacks, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (error: any) {
    console.error("Public feedback fetch error:", error)
    return NextResponse.json([], { status: 200 })
  }
}

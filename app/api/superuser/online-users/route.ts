import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getOnlineUsersReport } from "@/lib/presence-service"

export const dynamic = "force-dynamic"
export const maxDuration = 10

getOnlineUsersReport().then().catch(() => {})

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession()
    if (!session || session.role !== "superuser") {
      return NextResponse.json({ error: "Unauthorized: Superuser privileges required" }, { status: 401 })
    }

    const report = await getOnlineUsersReport()

    return NextResponse.json({
      success: true,
      ...report,
    })
  } catch (error: any) {
    console.error("GET /api/superuser/online-users error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get online users report" },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { backupAllTenants, backupTenantSpreadsheet } from "@/lib/backup-service"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET/POST /api/system/daily-backup
 *
 * Can be triggered:
 * 1. Automatically via Vercel Cron (authenticated via CRON_SECRET header / query param)
 * 2. Manually by an admin / superuser session for a specific CCC (?cccCode=3234103) or all CCCs.
 */
async function handleBackup(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  const paramSecret = searchParams.get("secret")

  const isCronAuthed = Boolean(
    cronSecret && (authHeader === `Bearer ${cronSecret}` || paramSecret === cronSecret)
  )

  let session: any = null
  if (!isCronAuthed) {
    session = await verifySession()
    if (!session || (session.role !== "admin" && session.role !== "superuser")) {
      return NextResponse.json(
        { error: "Unauthorized. Admin credentials or Cron token required." },
        { status: 401 }
      )
    }
  }

  const targetCcc = searchParams.get("cccCode") || (session?.role === "admin" ? session.cccCode : null)

  try {
    if (targetCcc && targetCcc !== "ALL") {
      const config = await getTenantConfig(targetCcc)
      const result = await backupTenantSpreadsheet(config)
      return NextResponse.json({
        success: result.status === "success",
        result,
      })
    }

    // Backup all registered CCCs
    const results = await backupAllTenants()
    const summary = {
      total: results.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    }

    return NextResponse.json({ success: true, summary })
  } catch (err: any) {
    console.error("Backup route error:", err)
    return NextResponse.json(
      { error: err?.message || "Internal backup failure" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handleBackup(req)
}

export async function POST(req: NextRequest) {
  return handleBackup(req)
}

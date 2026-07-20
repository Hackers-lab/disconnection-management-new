// app/api/consumers/update/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { updateConsumerInGoogleSheet } from "@/lib/google-sheets-api" // Changed import
import { invalidateConsumerCache, fetchConsumerData, type ConsumerData } from "@/lib/google-sheets"
import { appendHistory, nowTimestamp, invalidateHistoryCache } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"
import { checkApiPermission, isAgencyScopeRestricted } from "@/lib/permissions"
import { getTenantConfig } from "@/lib/tenant-resolver"
import { withTenant } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

// Previous-state fields the client sends so we can log old→new history
// without an extra sheet read.
type UpdatePayload = ConsumerData & {
  previousStatus?: string
  previousOsd?: string
  previousNotes?: string
}

export const POST = withTenant(async function POST(request: NextRequest) {
  try {
    const { authorized, error, status, session } = await checkApiPermission("disconnection", "update")
    if (!authorized) {
      return NextResponse.json({ error }, { status })
    }

    const consumer: UpdatePayload = await request.json()
    const tenantConfig = await getTenantConfig(session.cccCode)
    const spreadsheetId = tenantConfig.spreadsheetId

    // Scoping check for agency/executive roles
    const allConsumers = await fetchConsumerData(spreadsheetId)
    const existing = allConsumers.find((c) => c.consumerId === consumer.consumerId)
    
    if (
      isAgencyScopeRestricted(session, existing?.agency) ||
      isAgencyScopeRestricted(session, consumer.agency)
    ) {
      return NextResponse.json(
        { error: "Forbidden: This consumer is not assigned to your agency scope" },
        { status: 403 }
      )
    }

    console.log(`🔄 Updating consumer ${consumer.consumerId}...`)

    // Use the direct Sheets API function
    const result = await updateConsumerInGoogleSheet(consumer, spreadsheetId)

    // Invalidate the warm-function memo so the next /base or /patch read
    // reflects this write immediately within this container.
    invalidateConsumerCache()

    // Log a field-action history event when the status actually changed.
    // Fire-and-forget — non-critical, never blocks the response.
    const newStatus = String(consumer.disconStatus || "").trim()
    const oldStatus = String(consumer.previousStatus || "").trim()
    if (newStatus && newStatus.toLowerCase() !== oldStatus.toLowerCase()) {
      appendHistory([{
        timestamp: nowTimestamp(),
        consumerId: String(consumer.consumerId || ""),
        name: String(consumer.name || ""),
        action: "status_changed",
        oldStatus,
        newStatus,
        oldOsd: String(consumer.previousOsd ?? consumer.d2NetOS ?? ""),
        oldNotes: String(consumer.previousNotes ?? ""),
        oldImageUrl: String(consumer.imageUrl || ""),
        changedBy: session?.role ? `${session.role}${session.agencies?.[0] ? ":" + session.agencies[0] : ""}` : "field",
        eventDate: String(consumer.disconDate || ""),
      }], spreadsheetId)
        .then(() => invalidateHistoryCache(spreadsheetId))
        .catch(e => console.warn("Field history append failed (non-critical):", e))
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error("💥 API /consumers/update error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update consumer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
})
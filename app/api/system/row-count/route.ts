import { sheets as googleSheets } from "@googleapis/sheets";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getConsumerCountAndVersion } from "@/lib/google-sheets";
import { getSpreadsheetId } from "@/lib/google-sheets-api";
import { withTenant } from "@/lib/tenant-context";

const SERVER_CACHE_TTL_MS = 20_000
const serverCache = new Map<string, { data: { count: number; version: string | null }; timestamp: number }>()

export const GET = withTenant(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'consumer'

    let spreadsheetId
    try {
      spreadsheetId = getSpreadsheetId()
    } catch (e: any) {
      console.warn("Failed to get spreadsheet ID for row count (likely sheet not linked yet):", e.message || e)
      return NextResponse.json({ count: 0, version: null }, {
        headers: { "Cache-Control": "no-store" },
      })
    }

    // Consumer counts reuse the shared, cross-instance cache of parsed consumer
    // data — no second Sheets fetch and no full-JSON MD5. The version hashes
    // only the consumer-ID set (same semantics as the old column-C hash).
    if (type === 'consumer') {
      const data = await getConsumerCountAndVersion(spreadsheetId)
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      })
    }

    const cacheKey = `${spreadsheetId}_${type}`
    const cached = serverCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      })
    }

    // Fetch Column C for consumer ID (DD sheet)
    let range = "DD!C:C";

    const { auth } = await import("@/lib/google-drive")
    const sheets = googleSheets({ version: "v4", auth })

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    })

    const rows = response.data.values || []

    // Filter for non-empty rows first to ensure consistency
    const nonEmptyRows = rows.filter((row: any[]) =>
      row && row[0] && String(row[0]).trim() !== ""
    );

    // Count is the length of the filtered array
    const count = nonEmptyRows.length;

    // Generate MD5 hash of only the non-empty data for stable hashing
    const dataString = JSON.stringify(nonEmptyRows);
    const hash = crypto.createHash('md5').update(dataString).digest('hex');

    const responseData = { count, version: hash }
    serverCache.set(cacheKey, { data: responseData, timestamp: Date.now() })

    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
    })
  } catch (error) {
    console.error(`API Error: Failed to fetch row count or generate hash for '${(request.nextUrl.searchParams.get('type') || 'consumer')}':`, error)
    return NextResponse.json({ count: 0, version: null }, { status: 500 })
  }
})
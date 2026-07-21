import { NextRequest, NextResponse } from "next/server";
import { fetchConsumerData } from "@/lib/google-sheets";
import { withTenant } from "@/lib/tenant-context";
import { getSpreadsheetId } from "@/lib/google-sheets-api";

// No force-dynamic — allow CDN to cache the response.
// The 24h s-maxage means most client loads are served from CDN edge.
// The integrity check below falls back to no-store only when data is incomplete.

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    let data = [];
    try {
      const spreadsheetId = getSpreadsheetId();
      data = await fetchConsumerData(spreadsheetId);
    } catch (e: any) {
      console.warn("Failed to fetch base consumer data (likely sheet not linked yet):", e.message || e);
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const lastRow = data[data.length - 1];

    // If the last row has an ID but no agency, the sheet may still be loading.
    // Serve it but don't cache so the next client gets a fresh read.
    if (lastRow && lastRow.consumerId && !lastRow.agency) {
      return NextResponse.json(data, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error("💥 API /consumers/base error:", error);
    return NextResponse.json({ error: "Failed to fetch base data" }, { status: 500 });
  }
})

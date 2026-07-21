import { NextRequest, NextResponse } from 'next/server';
import { getAgencyLastUpdates } from '@/lib/google-sheets'; // Your data source
import { withTenant } from '@/lib/tenant-context';
import { getSpreadsheetId } from '@/lib/google-sheets-api';

// Define the response type
type AgencyUpdate = {
  name: string;
  lastUpdate: string;
  lastUpdateCount: number;
};

export const GET = withTenant(async function GET(req: NextRequest) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const updates = await getAgencyLastUpdates(spreadsheetId);

    if (!Array.isArray(updates)) {
      throw new Error('Invalid data format from getAgencyLastUpdates');
    }

    return NextResponse.json(updates, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
})
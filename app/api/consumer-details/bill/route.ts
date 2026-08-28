import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveConsumerDetails } from '@/lib/consumer-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, token, offCode, conId, invoiceNo } = body;

    if (!username || !token || !offCode || !conId || !invoiceNo) {
      return NextResponse.json({ error: 'Missing required bill query parameters' }, { status: 400 });
    }

    const res = await fetchLiveConsumerDetails(
      username,
      token,
      offCode,
      conId,
      'BILLING',
      'P',
      invoiceNo
    );

    if (res?.code === '200' && Array.isArray(res.message) && res.message[0]?.base64) {
      return NextResponse.json({
        success: true,
        invoiceNo,
        base64: res.message[0].base64,
      });
    } else {
      return NextResponse.json({
        error: res?.message || 'Bill PDF not found on server'
      }, { status: 404 });
    }
  } catch (err: any) {
    console.error('Bill PDF Fetch Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch bill PDF' }, { status: 500 });
  }
}

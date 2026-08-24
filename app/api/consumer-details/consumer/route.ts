import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveConsumerDetails } from '@/lib/consumer-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, token, offCode, conId } = body;

    if (!username || !token || !conId) {
      return NextResponse.json({ error: 'Missing authentication or consumer ID' }, { status: 400 });
    }

    // Concurrent lookups for 360 view
    const [master, payments, osd, billing, readings, meter] = await Promise.all([
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'MASTER', 'C').catch(e => ({ code: '500', error: e.message })),
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'PAYMENT', 'P').catch(e => ({ code: '500', error: e.message })),
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'OSD', 'O').catch(e => ({ code: '500', error: e.message })),
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'BILLING', 'B').catch(e => ({ code: '500', error: e.message })),
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'READING', 'R').catch(e => ({ code: '500', error: e.message })),
      fetchLiveConsumerDetails(username, token, offCode || '', conId, 'METER', 'M').catch(e => ({ code: '500', error: e.message })),
    ]);

    const masterData = Array.isArray(master?.message) ? master.message[0] : null;

    if (!masterData) {
      return NextResponse.json({
        success: false,
        error: master?.message || 'Consumer record not found or session expired',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      master: masterData,
      payments: Array.isArray(payments?.message) ? payments.message : [],
      osd: Array.isArray(osd?.message) ? osd.message[0] : null,
      billing: Array.isArray(billing?.message) ? billing.message : [],
      readings: Array.isArray(readings?.message) ? readings.message : [],
      meter: Array.isArray(meter?.message) ? meter.message : [],
    });
  } catch (err: any) {
    console.error('Consumer Query Error:', err);
    return NextResponse.json({ error: err.message || 'Internal query error' }, { status: 500 });
  }
}

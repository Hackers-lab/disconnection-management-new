import { NextRequest, NextResponse } from 'next/server';
import { requestOfficerOtp, verifyOfficerOtp } from '@/lib/consumer-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, username, password, otp } = body;

    if (action === 'request_otp') {
      if (!username || !password) {
        return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
      }
      const result = await requestOfficerOtp(username, password);
      return NextResponse.json(result);
    }

    if (action === 'verify_otp') {
      if (!username || !otp) {
        return NextResponse.json({ error: 'Username and OTP required' }, { status: 400 });
      }
      const result = await verifyOfficerOtp(username, otp);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (err: any) {
    console.error('Auth API Error:', err);
    return NextResponse.json({ error: err.message || 'Authentication error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/openrouter';

export const dynamic = 'force-dynamic';

// Sends "Hi are you listening" to the configured OpenRouter model. 200 = model answered.
export async function POST() {
  try {
    const { model, reply } = await testConnection();
    return NextResponse.json({ success: true, model, reply });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message || String(err) });
  }
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * Epay pay route — DISABLED while PAYMENT_MODE=credits (default).
 * Keep file for future wiring; do not call from UI.
 */
export async function POST(_req: NextRequest) {
  if ((process.env.PAYMENT_MODE ?? 'credits') !== 'epay') {
    return NextResponse.json(
      {
        error: '当前为积分预付模式，易支付未启用',
        payment_mode: process.env.PAYMENT_MODE ?? 'credits',
        hint: '请使用 POST /api/wallet/recharge',
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: 'Epay not wired yet' }, { status: 501 });
}

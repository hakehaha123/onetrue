import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { pointsToCny } from '@/lib/credits';

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      wallet_id: user.id,
      user_id: user.id,
      points: Number(user.balance_cents),
      cny: pointsToCny(Number(user.balance_cents)),
      name: user.name,
      avatar_url: user.avatar_url,
      role: user.role,
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: 'login_required', message: '请先登录' }, { status: 401 });
    }
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

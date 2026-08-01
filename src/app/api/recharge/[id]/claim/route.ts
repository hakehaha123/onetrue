import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { claimRechargeOrder } from '@/lib/recharge';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const order = await claimRechargeOrder({
      orderId: id,
      userId: user.id,
      userName: user.name,
    });
    return NextResponse.json({
      ok: true,
      order,
      message: '已提交，等待管理员确认入账（通常数小时内）',
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return NextResponse.json({ error: 'login_required' }, { status: 401 });
    const msg = e instanceof Error ? e.message : 'error';
    if (msg === 'CLAIM_FAILED') {
      return NextResponse.json({ error: '无法申报（可能已过期或状态不对）' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

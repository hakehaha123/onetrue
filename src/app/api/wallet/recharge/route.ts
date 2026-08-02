import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { CREDIT_PACKAGES } from '@/lib/credits';
import { createRechargeOrder, listUserRecharges } from '@/lib/recharge';
import { stripeEnabled } from '@/lib/stripe';

export async function GET() {
  try {
    const user = await requireUser();
    const orders = await listUserRecharges(user.id);
    const stripeOn = stripeEnabled();
    return NextResponse.json({
      packages: CREDIT_PACKAGES.map((p) => ({
        ...p,
        points_label: `${p.points} 积分`,
        cny_label: `¥${p.cny}`,
      })),
      orders,
      pay: {
        mode: stripeOn ? 'stripe_and_manual_qr' : 'manual_qr',
        stripe: stripeOn,
        wechat_qr: process.env.PAY_QR_WECHAT_URL || null,
        alipay_qr: process.env.PAY_QR_ALIPAY_URL || null,
        note: '转账时请填写备注码；提交「我已支付」后由管理员确认入账（通常数小时内）。',
      },
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status });
  }
}

/** Create pending manual-QR recharge order (does NOT credit). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { package_id?: string; channel?: string };
    const channel = body.channel === 'alipay' ? 'alipay' : 'wechat';
    if (!body.package_id) {
      return NextResponse.json({ error: 'invalid package_id' }, { status: 400 });
    }
    const order = await createRechargeOrder({
      userId: user.id,
      packageId: body.package_id,
      channel,
    });
    return NextResponse.json({
      ok: true,
      order,
      amount_cny: order.amount_cents / 100,
      qr_url:
        channel === 'alipay'
          ? process.env.PAY_QR_ALIPAY_URL || null
          : process.env.PAY_QR_WECHAT_URL || null,
      instructions: {
        amount: `¥${(order.amount_cents / 100).toFixed(2)}`,
        remark: order.remark_code,
        hint: '请按金额转账，备注必须填写此备注码，然后点「我已支付」。',
      },
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return NextResponse.json({ error: 'login_required' }, { status: 401 });
    const msg = e instanceof Error ? e.message : 'error';
    if (msg === 'TOO_MANY_OPEN') {
      return NextResponse.json({ error: '请先完成或等待已有充值单过期（最多 2 笔）' }, { status: 400 });
    }
    if (msg === 'invalid package') {
      return NextResponse.json({ error: 'invalid package_id' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

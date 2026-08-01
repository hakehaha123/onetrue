import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  confirmRechargeOrders,
  listClaimedRecharges,
  rejectRechargeOrder,
} from '@/lib/recharge';

export async function GET() {
  try {
    await requireAdmin();
    const orders = await listClaimedRecharges();
    return NextResponse.json({ orders });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return NextResponse.json({ error: 'login_required' }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json()) as {
      action?: 'confirm' | 'reject';
      order_ids?: string[];
      order_id?: string;
      reason?: string;
    };

    if (body.action === 'reject') {
      const id = body.order_id || body.order_ids?.[0];
      if (!id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });
      const ok = await rejectRechargeOrder({
        orderId: id,
        adminId: admin.id,
        reason: body.reason,
      });
      return NextResponse.json({ ok });
    }

    const ids = body.order_ids?.length ? body.order_ids : body.order_id ? [body.order_id] : [];
    if (!ids.length) return NextResponse.json({ error: 'order_ids required' }, { status: 400 });
    const result = await confirmRechargeOrders({ orderIds: ids, adminId: admin.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return NextResponse.json({ error: 'login_required' }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  attachStripeSession,
  createStripeRechargeOrder,
} from '@/lib/recharge';
import { getStripe, stripeAmountForPackage, stripeEnabled } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    if (!stripeEnabled()) {
      return NextResponse.json({ error: 'Stripe 未配置（STRIPE_SECRET_KEY）' }, { status: 503 });
    }
    const user = await requireUser();
    const body = (await req.json()) as { package_id?: string };
    if (!body.package_id) {
      return NextResponse.json({ error: 'invalid package_id' }, { status: 400 });
    }

    let amount;
    try {
      amount = stripeAmountForPackage(body.package_id);
    } catch {
      return NextResponse.json({ error: 'invalid package_id' }, { status: 400 });
    }

    const order = await createStripeRechargeOrder({
      userId: user.id,
      packageId: body.package_id,
    });

    const base =
      process.env.APP_BASE_URL ||
      process.env.AUTH_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: amount.currency,
            unit_amount: amount.unitAmount,
            product_data: {
              name: `缘初 AI · ${amount.points} 积分`,
              description: `${amount.label} · ${amount.points} credits`,
            },
          },
        },
      ],
      metadata: {
        order_id: order.id,
        user_id: user.id,
        package_id: body.package_id,
        points: String(amount.points),
      },
      success_url: `${base}/credits?stripe=success&order=${order.id}`,
      cancel_url: `${base}/credits?stripe=cancel`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe session missing url' }, { status: 500 });
    }

    await attachStripeSession(order.id, session.id);

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.id,
      order_id: order.id,
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return NextResponse.json({ error: 'login_required' }, { status: 401 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: status === 401 ? 401 : 500 },
    );
  }
}

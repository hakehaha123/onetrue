import { NextRequest, NextResponse } from 'next/server';
import { confirmStripeRecharge } from '@/lib/recharge';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET missing' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid signature' },
      { status: 400 },
    );
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      id: string;
      payment_status?: string;
      metadata?: Record<string, string>;
    };
    if (session.payment_status && session.payment_status !== 'paid') {
      return NextResponse.json({ ok: true, skipped: 'not_paid' });
    }
    const orderId = session.metadata?.order_id;
    if (!orderId) {
      return NextResponse.json({ error: 'missing order_id' }, { status: 400 });
    }
    const result = await confirmStripeRecharge({
      orderId,
      sessionId: session.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

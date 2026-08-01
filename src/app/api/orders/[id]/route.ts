import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      id: order.id,
      status: order.status,
      price_cents: order.price_cents,
      currency: order.currency,
      kind: order.kind,
      quote_expires_at: order.quote_expires_at,
      paid_at: order.paid_at,
      output_video_url: order.output_video_url,
      output_image_url: order.output_image_url,
      error_code: order.error_code,
      error_message: order.error_message,
      created_at: order.created_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

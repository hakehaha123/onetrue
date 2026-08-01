/**
 * POST/GET /api/webhooks/epay
 * Idempotent: webhook_events + ledger UNIQUE(provider_ref, type)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyEpaySign, moneyStringToCents, estimateEpayFeeCents } from '@/lib/epay';
import {
  enqueueGeneration,
  getOrder,
  isWebhookProcessed,
  markOrderPaid,
  markWebhookProcessed,
} from '@/lib/db';

async function paramsFromRequest(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (req.method === 'GET') {
    req.nextUrl.searchParams.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await req.json()) as Record<string, string>;
    return body;
  }
  const form = await req.formData();
  form.forEach((v, k) => {
    out[k] = String(v);
  });
  return out;
}

export async function POST(req: NextRequest) {
  return handleEpay(req);
}

export async function GET(req: NextRequest) {
  return handleEpay(req);
}

async function handleEpay(req: NextRequest): Promise<NextResponse> {
  const params = await paramsFromRequest(req);

  if (!verifyEpaySign(params)) {
    return new NextResponse('fail', { status: 400 });
  }

  if (params.trade_status !== 'TRADE_SUCCESS') {
    return new NextResponse('success', { status: 200 });
  }

  const eventId = params.trade_no;
  if (await isWebhookProcessed('epay', eventId)) {
    return new NextResponse('success', { status: 200 });
  }

  const orderId = params.out_trade_no;
  const order = await getOrder(orderId);
  if (!order) {
    await markWebhookProcessed('epay', eventId, params);
    return new NextResponse('success', { status: 200 });
  }

  if (order.status !== 'pending_payment') {
    await markWebhookProcessed('epay', eventId, params);
    return new NextResponse('success', { status: 200 });
  }

  const paidCents = moneyStringToCents(params.money);
  if (paidCents !== order.price_cents) {
    await markWebhookProcessed('epay', eventId, { ...params, mismatch: true });
    return new NextResponse('fail', { status: 400 });
  }

  const feeCents = estimateEpayFeeCents(paidCents, Number(process.env.EPAY_RATE ?? 0.025));
  const updated = await markOrderPaid({
    orderId,
    paymentRef: params.trade_no,
    amountPaidCents: paidCents,
    paymentFeeCents: feeCents,
    channel: params.type,
  });

  if (updated) {
    await enqueueGeneration(orderId);
  }

  await markWebhookProcessed('epay', eventId, params);
  return new NextResponse('success', { status: 200 });
}

import { NextRequest, NextResponse } from 'next/server';
import { createPendingOrder, getTemplateBySlug } from '@/lib/db';
import { quoteForTemplate, type BillingPath, type GpuTier } from '@/lib/quote';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      template_slug?: string;
      face_url?: string;
      garment_url?: string;
      scene_url?: string;
      billing_path?: BillingPath;
      /** Optional: 24gb (default) | 48gb — not mid-job VRAM expand, routes to another endpoint */
      gpu_tier?: GpuTier;
    };

    if (!body.template_slug) {
      return NextResponse.json({ error: 'template_slug required' }, { status: 400 });
    }

    const template = await getTemplateBySlug(body.template_slug);
    if (!template) {
      return NextResponse.json({ error: 'template not found' }, { status: 404 });
    }

    const billingPath = body.billing_path === 'hot' ? 'hot' : 'cold';
    const quote = quoteForTemplate(template, billingPath, body.gpu_tier);
    const quoteExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

    const { id } = await createPendingOrder({
      templateId: template.id,
      kind: template.kind,
      priceCents: quote.priceCents,
      fxRate: Number(process.env.PRICE_FX_CNY_PER_USD ?? 7.2),
      quoteJson: { ...quote.quoteJson, workflow_key: template.workflow_key },
      quoteExpiresAt,
      faceUrl: body.face_url,
      garmentUrl: body.garment_url,
      sceneUrl: body.scene_url,
      vastEndpoint: quote.endpointKey,
      tMaxSec: quote.tMaxSec,
      costCapUsd: quote.costCapUsd,
      rateUsdHr: quote.rateUsdHr,
    });

    return NextResponse.json({
      order_id: id,
      status: 'pending_payment',
      price_cents: quote.priceCents,
      currency: 'CNY',
      eta_seconds: quote.tBillEstSec,
      gpu_tier: quote.gpuTier,
      endpoint_key: quote.endpointKey,
      quote_expires_at: quoteExpiresAt.toISOString(),
      quote: quote.quoteJson,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/db';
import { quoteForTemplate } from '@/lib/quote';

export async function GET() {
  try {
    const templates = await listTemplates();
    const items = templates.map((t) => {
      const q = quoteForTemplate(t, 'cold');
      return {
        slug: t.slug,
        kind: t.kind,
        title: t.title,
        endpoint_key: q.endpointKey,
        gpu_tier: q.gpuTier,
        min_vram_gb: t.min_vram_gb,
        eta_seconds: q.tBillEstSec,
        price_cents: q.priceCents,
        currency: 'CNY',
      };
    });
    return NextResponse.json({ templates: items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

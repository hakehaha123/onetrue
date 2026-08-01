import { NextRequest, NextResponse } from 'next/server';
import { quoteFluxTxt2Img, quoteForTemplate, type BillingPath, type GpuTier } from '@/lib/quote';
import { getTemplateBySlug } from '@/lib/db';
import { pointsToCny } from '@/lib/credits';

/** Price preview for UI — credits mode, no charge */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const kind = sp.get('kind') || 'flux';
    const billingPath = (sp.get('path') === 'hot' ? 'hot' : 'cold') as BillingPath;
    const gpuTier = (sp.get('gpu_tier') === '48gb' ? '48gb' : '24gb') as GpuTier;
    const steps = Number(sp.get('steps') || 20);

    if (kind === 'flux' || kind === 'image') {
      const q = quoteFluxTxt2Img({ steps, billingPath, gpuTier });
      return NextResponse.json({
        kind: 'flux_txt2img',
        gpu_tier: q.gpuTier,
        rate_usd_hr: q.rateUsdHr,
        t_bill_est_sec: q.tBillEstSec,
        cost_gpu_usd: q.cGpuUsd,
        points: q.points,
        cny: pointsToCny(q.points),
        price_cents: q.priceCents,
        multiplier: Number(process.env.PRICE_MULTIPLIER ?? 2),
        note: '预付积分；含×倍数与预留支付手续费缓冲，开发期不走易支付',
      });
    }

    const slug = sp.get('template');
    if (!slug) {
      return NextResponse.json({ error: 'template required' }, { status: 400 });
    }
    const template = await getTemplateBySlug(slug);
    if (!template) {
      return NextResponse.json({ error: 'template not found' }, { status: 404 });
    }
    const q = quoteForTemplate(template, billingPath, gpuTier);
    return NextResponse.json({
      kind: template.kind,
      template: slug,
      gpu_tier: q.gpuTier,
      rate_usd_hr: q.rateUsdHr,
      t_bill_est_sec: q.tBillEstSec,
      cost_gpu_usd: q.cGpuUsd,
      points: q.points,
      cny: pointsToCny(q.points),
      price_cents: q.priceCents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

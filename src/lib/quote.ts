import { computePriceCny, type PricingBreakdown } from './pricing';
import type { TemplateRow } from './db';

export type BillingPath = 'cold' | 'hot';
export type GpuTier = '24gb' | '48gb';

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * RunPod Deploy ComfyUI price sheet (user screenshot, 2026):
 * 24GB $0.69/hr (default — selected endpoint), 24GB PRO $1.10, 48GB $1.22, 48GB PRO $1.75
 */
export function gpuUsdPerSecForTier(tier: GpuTier): number {
  if (tier === '48gb') {
    const hr = numEnv('PRICE_GPU_USD_HR_48', 1.22);
    return hr / 3600;
  }
  const hr = numEnv('PRICE_GPU_USD_HR_24', 0.69);
  return hr / 3600;
}

export function resolveGpuTier(template: TemplateRow, override?: GpuTier): GpuTier {
  if (override === '24gb' || override === '48gb') return override;
  const t = (template.gpu_tier || '24gb').toLowerCase();
  return t === '48gb' ? '48gb' : '24gb';
}

export function quoteForTemplate(
  template: TemplateRow,
  billingPath: BillingPath = 'cold',
  gpuTierOverride?: GpuTier,
): PricingBreakdown & {
  tBillEstSec: number;
  rateUsdHr: number;
  tMaxSec: number;
  costCapUsd: number;
  gpuTier: GpuTier;
  endpointKey: string;
  quoteJson: Record<string, unknown>;
} {
  const gpuTier = resolveGpuTier(template, gpuTierOverride);
  const rGpuUsdPerSec = gpuUsdPerSecForTier(gpuTier);
  const tBillEstSec =
    billingPath === 'hot' ? template.est_seconds_hot : template.est_seconds_cold;
  const fx = numEnv('PRICE_FX_CNY_PER_USD', 7.2);
  const epayRate = numEnv('EPAY_RATE', 0.025);
  const multiplier = numEnv('PRICE_MULTIPLIER', 2);

  const breakdown = computePriceCny({
    rGpuUsdPerSec,
    tBillEstSec,
    cWarmUsdPerOrder: 0,
    fxCnyPerUsd: fx,
    epayRate,
    epayFixedCny: 0,
    multiplier,
    minPriceCents: Number(template.min_price_cents) || 0,
  });

  const alpha = Number(template.alpha_cap) || 0.25;
  const costCapUsd = breakdown.cVastUsd * (1 + alpha);
  const tMaxFromCap = Math.floor(costCapUsd / rGpuUsdPerSec);
  const tMaxSec = Math.min(template.t_hard_seconds, Math.max(tBillEstSec, tMaxFromCap));

  const endpointKey =
    template.kind === 'video'
      ? gpuTier === '48gb'
        ? 'video_48'
        : 'video_24'
      : 'image_24';

  const quoteJson = {
    formula_ver: 'runpod_credits_v1',
    provider: 'runpod',
    payment_mode: 'credits',
    billing_path: billingPath,
    gpu_tier: gpuTier,
    endpoint_key: endpointKey,
    R_gpu_usd_hr: breakdown.rateUsdHr,
    R_gpu_usd_per_sec: rGpuUsdPerSec,
    T_bill_est_sec: tBillEstSec,
    C_gpu: breakdown.cGpuUsd,
    C_compute: breakdown.cVastUsd,
    C_pay_cny_reserved: breakdown.cPayCny,
    multiplier,
    fx,
    points: breakdown.points,
    price_cents: breakdown.priceCents,
    price_cny: breakdown.priceCny,
  };

  return {
    ...breakdown,
    tBillEstSec,
    rateUsdHr: breakdown.rateUsdHr,
    tMaxSec,
    costCapUsd,
    gpuTier,
    endpointKey,
    quoteJson,
  };
}

/** Standalone quote for Flux txt2img UI (no DB template required) */
export function quoteFluxTxt2Img(input?: {
  steps?: number;
  billingPath?: BillingPath;
  gpuTier?: GpuTier;
}): PricingBreakdown & { tBillEstSec: number; rateUsdHr: number; gpuTier: GpuTier } {
  const gpuTier = input?.gpuTier ?? '24gb';
  const steps = input?.steps ?? 20;
  const path = input?.billingPath ?? 'cold';
  // cold: boot+download buffer + infer; hot: infer only (rough)
  const infer = Math.round(40 + steps * 3.5);
  const tBillEstSec = path === 'hot' ? infer : 60 + infer;
  const rGpuUsdPerSec = gpuUsdPerSecForTier(gpuTier);
  const breakdown = computePriceCny({
    rGpuUsdPerSec,
    tBillEstSec,
    fxCnyPerUsd: numEnv('PRICE_FX_CNY_PER_USD', 7.2),
    epayRate: numEnv('EPAY_RATE', 0.025),
    epayFixedCny: 0,
    multiplier: numEnv('PRICE_MULTIPLIER', 2),
    minPriceCents: numEnv('PRICE_MIN_CENTS_FLUX', 50),
  });
  return { ...breakdown, tBillEstSec, rateUsdHr: breakdown.rateUsdHr, gpuTier };
}

/**
 * Prepaid credits pricing.
 * 1 积分 = ¥0.01（与 price_cents 对齐）
 * C_gpu = T_bill × ($/hr / 3600); 售价 = max((C_gpu×fx)×multiplier 含预留手续费缓冲, floor)
 * 开发期不走易支付；手续费用 epayRate 仅作报价预留，不真实扣款。
 */

export type PricingInput = {
  rGpuUsdPerSec: number;
  tBillEstSec: number;
  cWarmUsdPerOrder?: number;
  fxCnyPerUsd: number;
  /** Reserved for future real payments; still folded into quote buffer */
  epayRate: number;
  epayFixedCny: number;
  multiplier?: number;
  minPriceCents?: number;
};

export type PricingBreakdown = {
  cGpuUsd: number;
  cDiskUsd: number;
  cBwUsd: number;
  cWarmUsd: number;
  cVastUsd: number;
  cPayCny: number;
  priceCny: number;
  priceCents: number;
  /** Same as priceCents when 1积分=¥0.01 */
  points: number;
  rateUsdHr: number;
};

export function computeComputeCostUsd(
  input: PricingInput,
): Omit<PricingBreakdown, 'cPayCny' | 'priceCny' | 'priceCents' | 'points' | 'rateUsdHr'> {
  const cGpuUsd = input.tBillEstSec * input.rGpuUsdPerSec;
  const cWarmUsd = input.cWarmUsdPerOrder ?? 0;
  const cVastUsd = cGpuUsd + cWarmUsd;
  return { cGpuUsd, cDiskUsd: 0, cBwUsd: 0, cWarmUsd, cVastUsd };
}

export function computePriceCny(input: PricingInput): PricingBreakdown {
  const mult = input.multiplier ?? 2;
  const base = computeComputeCostUsd(input);
  const rateUsdHr = input.rGpuUsdPerSec * 3600;
  let priceCny = base.cVastUsd * input.fxCnyPerUsd * mult;
  let cPayCny = 0;
  for (let i = 0; i < 3; i++) {
    cPayCny = priceCny * input.epayRate + input.epayFixedCny;
    const poolCny = (base.cVastUsd * input.fxCnyPerUsd + cPayCny) * mult;
    priceCny = Math.ceil(poolCny * 100) / 100;
  }
  let priceCents = Math.ceil(priceCny * 100);
  const floor = input.minPriceCents ?? 0;
  if (priceCents < floor) {
    priceCents = floor;
    priceCny = floor / 100;
  }
  return {
    ...base,
    cPayCny,
    priceCny,
    priceCents,
    points: priceCents,
    rateUsdHr,
  };
}

/** Flux cold @ RunPod 24GB $0.69/hr */
export function exampleFluxCold24(): PricingBreakdown {
  return computePriceCny({
    rGpuUsdPerSec: 0.69 / 3600,
    tBillEstSec: 150,
    fxCnyPerUsd: 7.2,
    epayRate: 0.025,
    epayFixedCny: 0,
    multiplier: 2,
    minPriceCents: 50,
  });
}

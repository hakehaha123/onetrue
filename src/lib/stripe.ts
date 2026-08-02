import Stripe from 'stripe';
import { getCreditPackage } from '@/lib/credits';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY 未配置');
  return new Stripe(key, { apiVersion: '2026-07-29.dahlia' });
}

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Stripe Checkout unit amount in the smallest currency unit. */
export function stripeAmountForPackage(packageId: string): {
  currency: string;
  unitAmount: number;
  points: number;
  label: string;
} {
  const pkg = getCreditPackage(packageId);
  if (!pkg) throw new Error('invalid package');
  const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
  if (currency === 'cny') {
    return {
      currency: 'cny',
      unitAmount: Math.round(pkg.cny * 100),
      points: pkg.points,
      label: pkg.label,
    };
  }
  const fx = Number(process.env.PRICE_FX_CNY_PER_USD || 7.2);
  const usd = pkg.cny / (fx > 0 ? fx : 7.2);
  return {
    currency: 'usd',
    unitAmount: Math.max(50, Math.round(usd * 100)),
    points: pkg.points,
    label: pkg.label,
  };
}

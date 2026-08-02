/**
 * Full RunPod rate / multiplier breakdown:
 * - always for admin (incl. Dev Admin)
 * - hidden for everyone else on Vercel production
 */
export function showPricingBreakdown(isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production';
}

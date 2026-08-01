/** Dev prepaid packages — 1积分 = ¥0.01。上线后可接易支付，仍发同样积分。 */
export const CREDIT_PACKAGES = [
  { id: 'p_1000', points: 1000, cny: 10, label: '体验包' },
  { id: 'p_5000', points: 5000, cny: 50, label: '常用包' },
  { id: 'p_20000', points: 20000, cny: 200, label: '加量包' },
  { id: 'p_50000', points: 50000, cny: 500, label: '大客户包' },
] as const;

export function getCreditPackage(id: string) {
  return CREDIT_PACKAGES.find((p) => p.id === id) ?? null;
}

export function pointsToCny(points: number): number {
  return Math.round(points) / 100;
}

export function formatPoints(points: number): string {
  return `${points} 积分（¥${pointsToCny(points).toFixed(2)}）`;
}

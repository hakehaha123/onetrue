/** node scripts/price-demo.mjs — RunPod 24GB $0.69/hr */
function price({ t, usdHr, minCents }) {
  const perSec = usdHr / 3600;
  const cGpu = t * perSec;
  let p = cGpu * 7.2 * 2;
  for (let i = 0; i < 3; i++) {
    const fee = p * 0.025;
    p = Math.ceil((cGpu * 7.2 + fee) * 2 * 100) / 100;
  }
  let cents = Math.ceil(p * 100);
  if (cents < minCents) cents = minCents;
  return { t, usdHr, cGpu: +cGpu.toFixed(4), points: cents, cny: cents / 100 };
}

console.log('24GB $0.69/hr ×2 + fee buffer');
console.log(' flux cold ~150s', price({ t: 150, usdHr: 0.69, minCents: 50 }));
console.log(' flux cold steps30 ~165s', price({ t: 165, usdHr: 0.69, minCents: 50 }));
console.log(' video_fast 300s', price({ t: 300, usdHr: 0.69, minCents: 990 }));
console.log(' video_std 480s', price({ t: 480, usdHr: 0.69, minCents: 1990 }));

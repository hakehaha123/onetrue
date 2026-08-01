import crypto from 'crypto';

export type EpayNotifyPayload = {
  pid: string;
  trade_no: string;
  out_trade_no: string;
  type: string;
  name: string;
  money: string;
  trade_status: string;
  sign: string;
  sign_type?: string;
};

const EPAY_KEY = process.env.EPAY_KEY ?? '';

/** Verify Epay sign (common MD5 scheme; adjust to your provider docs). */
export function verifyEpaySign(params: Record<string, string>, key: string = EPAY_KEY): boolean {
  const sign = params.sign;
  if (!sign) return false;
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && k !== 'sign_type' && v !== '' && v != null)
    .sort(([a], [b]) => a.localeCompare(b));
  const query = entries.map(([k, v]) => `${k}=${v}`).join('&');
  const expected = crypto.createHash('md5').update(`${query}${key}`).digest('hex');
  return expected.toLowerCase() === sign.toLowerCase();
}

export function moneyStringToCents(money: string): number {
  const yuan = parseFloat(money);
  if (Number.isNaN(yuan)) return -1;
  return Math.round(yuan * 100);
}

export function estimateEpayFeeCents(amountCents: number, rate = 0.025, fixedCents = 0): number {
  const amountCny = amountCents / 100;
  return Math.ceil(amountCny * rate * 100) + fixedCents;
}

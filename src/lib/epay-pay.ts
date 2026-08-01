import crypto from 'crypto';

export function buildEpayPayUrl(input: {
  orderId: string;
  name: string;
  moneyYuan: string;
  channel: 'alipay' | 'wxpay';
  returnUrl?: string;
}): string {
  const pid = process.env.EPAY_PID;
  const key = process.env.EPAY_KEY;
  const apiUrl = process.env.EPAY_API_URL;
  if (!pid || !key || !apiUrl) {
    throw new Error('EPAY_PID / EPAY_KEY / EPAY_API_URL not configured');
  }

  const notifyUrl = process.env.EPAY_NOTIFY_URL ?? `${process.env.APP_BASE_URL}/api/webhooks/epay`;
  const returnUrl =
    input.returnUrl ??
    process.env.EPAY_RETURN_URL ??
    `${process.env.APP_BASE_URL}/orders/${input.orderId}`;

  const params: Record<string, string> = {
    pid,
    type: input.channel,
    out_trade_no: input.orderId,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: input.name,
    money: input.moneyYuan,
  };

  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const sign = crypto.createHash('md5').update(`${query}${key}`).digest('hex');

  const search = new URLSearchParams({ ...params, sign, sign_type: 'MD5' });
  return `${apiUrl}?${search.toString()}`;
}

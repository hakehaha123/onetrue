import nodemailer from 'nodemailer';

export type RechargeNotifyPayload = {
  amountCny: number;
  points: number;
  remarkCode: string;
  channel: string;
  userName: string;
  orderId: string;
  adminUrl: string;
};

function formatMessage(p: RechargeNotifyPayload): string {
  const channel = p.channel === 'alipay' ? '支付宝' : '微信';
  return [
    `【缘初AI】待确认充值`,
    `金额：¥${p.amountCny.toFixed(2)}（${p.points} 积分）`,
    `备注码：${p.remarkCode}`,
    `渠道：${channel}`,
    `用户：${p.userName}`,
    `订单：${p.orderId}`,
    `管理页：${p.adminUrl}`,
  ].join('\n');
}

async function sendWeCom(text: string): Promise<void> {
  const url = process.env.WECOM_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('wecom notify failed', res.status, body);
  }
}

async function sendQqEmail(subject: string, text: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL_TO || user;
  if (!host || !user || !pass || !to) return;

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"缘初AI" <${user}>`,
    to,
    subject,
    text,
  });
}

/** Fire-and-forget safe: callers should catch. Missing env = no-op. */
export async function notifyAdminRechargeClaimed(payload: RechargeNotifyPayload): Promise<void> {
  const text = formatMessage(payload);
  const subject = `[缘初AI] 待确认充值 ¥${payload.amountCny.toFixed(2)} 备注 ${payload.remarkCode}`;
  const tasks: Promise<void>[] = [sendWeCom(text), sendQqEmail(subject, text)];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'rejected') console.error('notify error', r.reason);
  }
}

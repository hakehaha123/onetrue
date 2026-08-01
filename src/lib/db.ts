import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let sql: NeonQueryFunction<false, false> | null = null;

export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    sql = neon(url);
  }
  return sql;
}

export type TemplateRow = {
  id: string;
  slug: string;
  kind: 'image' | 'video';
  title: string;
  workflow_key: string;
  /** RunPod endpoint key, e.g. image_24 | video_24 | video_48 */
  vast_endpoint: string;
  est_seconds_cold: number;
  est_seconds_hot: number;
  t_hard_seconds: number;
  alpha_cap: string;
  disk_gb: number;
  preferred_gpu: string;
  min_vram_gb: number;
  gpu_tier: string;
  min_price_cents: number;
  enabled: boolean;
};

export type OrderRow = {
  id: string;
  status: string;
  price_cents: number;
  currency: string;
  template_id: string;
  kind: string;
  quote_expires_at: string;
  output_video_url: string | null;
  output_image_url: string | null;
  error_code: string | null;
  error_message: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function getTemplateBySlug(slug: string): Promise<TemplateRow | null> {
  const db = getSql();
  const rows = await db`
    SELECT * FROM templates WHERE slug = ${slug} AND enabled = true LIMIT 1
  `;
  return (rows[0] as TemplateRow) ?? null;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const db = getSql();
  const rows = await db`
    SELECT * FROM templates WHERE enabled = true ORDER BY kind, slug
  `;
  return rows as TemplateRow[];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const db = getSql();
  const rows = await db`
    SELECT id, status, price_cents, currency, template_id, kind, quote_expires_at,
           output_video_url, output_image_url, error_code, error_message, paid_at, created_at
    FROM orders WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as OrderRow) ?? null;
}

export async function createPendingOrder(input: {
  templateId: string;
  kind: 'image' | 'video';
  priceCents: number;
  fxRate: number;
  quoteJson: object;
  quoteExpiresAt: Date;
  faceUrl?: string;
  garmentUrl?: string;
  sceneUrl?: string;
  vastEndpoint: string;
  tMaxSec: number;
  costCapUsd: number;
  rateUsdHr: number;
}): Promise<{ id: string }> {
  const db = getSql();
  const rows = await db`
    INSERT INTO orders (
      template_id, kind, status, currency, price_cents, fx_rate, quote_json, quote_expires_at,
      face_url, garment_url, scene_url, vast_endpoint, t_max_sec, cost_cap_usd, rate_usd_hr
    ) VALUES (
      ${input.templateId}, ${input.kind}, 'pending_payment', 'CNY', ${input.priceCents},
      ${input.fxRate}, ${JSON.stringify(input.quoteJson)}, ${input.quoteExpiresAt.toISOString()},
      ${input.faceUrl ?? null}, ${input.garmentUrl ?? null}, ${input.sceneUrl ?? null},
      ${input.vastEndpoint}, ${input.tMaxSec}, ${input.costCapUsd}, ${input.rateUsdHr}
    )
    RETURNING id
  `;
  return { id: (rows[0] as { id: string }).id };
}

export async function isWebhookProcessed(provider: string, eventId: string): Promise<boolean> {
  const db = getSql();
  const rows = await db`
    SELECT 1 FROM webhook_events WHERE provider = ${provider} AND event_id = ${eventId} LIMIT 1
  `;
  return rows.length > 0;
}

export async function markWebhookProcessed(
  provider: string,
  eventId: string,
  payload: unknown,
): Promise<void> {
  const db = getSql();
  await db`
    INSERT INTO webhook_events (provider, event_id, payload_json, processed_at)
    VALUES (${provider}, ${eventId}, ${JSON.stringify(payload)}, now())
    ON CONFLICT (provider, event_id) DO NOTHING
  `;
}

/** Returns true if status transitioned pending_payment → paid */
export async function markOrderPaid(input: {
  orderId: string;
  paymentRef: string;
  amountPaidCents: number;
  paymentFeeCents: number;
  channel: string;
}): Promise<boolean> {
  const db = getSql();
  const rows = await db`
    UPDATE orders SET
      status = 'paid',
      payment_provider = 'epay',
      payment_ref = ${input.paymentRef},
      amount_paid_cents = ${input.amountPaidCents},
      payment_fee_cents = ${input.paymentFeeCents},
      paid_at = now(),
      updated_at = now()
    WHERE id = ${input.orderId} AND status = 'pending_payment'
    RETURNING id
  `;
  if (rows.length === 0) return false;

  await db`
    INSERT INTO ledger_entries (order_id, type, amount_cents, currency, provider_ref, meta_json)
    VALUES (
      ${input.orderId}, 'payment', ${input.amountPaidCents}, 'CNY', ${input.paymentRef},
      ${JSON.stringify({ channel: input.channel, fee_cents: input.paymentFeeCents })}
    )
    ON CONFLICT (provider_ref, type) DO NOTHING
  `;

  await db`
    UPDATE orders SET status = 'queued', updated_at = now()
    WHERE id = ${input.orderId} AND status = 'paid'
  `;
  return true;
}

/** Placeholder: Cron / worker will pick status=queued and submit Vast Serverless */
export async function enqueueGeneration(orderId: string): Promise<void> {
  const db = getSql();
  await db`
    UPDATE orders SET status = 'queued', updated_at = now()
    WHERE id = ${orderId} AND status IN ('paid', 'queued')
  `;
}

# API contract (MVP)

## Offer filter (`POST /api/internal/vast/search-offers`)

Request body matches `system_settings.gpu_price_caps` — see prior chat. For video orders force `min_vram_gb: 24`, `gpu_names: ["RTX 4090"]`.

## Create order `POST /api/orders`

```json
{
  "template_slug": "video_std",
  "face_url": "https://...",
  "garment_url": "https://...",
  "scene_url": "https://...",
  "billing_path": "cold"
}
```

Response: `order_id`, `status: pending_payment`, `price_cents`, `quote_json`, `quote_expires_at`.

Pricing uses `templates.est_seconds_cold|hot` + live `rGpuUsdHr` from Vast search or cached settings.

## Pay `POST /api/orders/:id/pay`

```json
{ "pay_mode": "direct", "channel": "alipay" }
```

Returns `pay_url`. On success webhook → `paid` → enqueue Serverless job.

## Epay webhook

See `src/app/api/webhooks/epay/route.ts`. Must return plaintext `success`.

## After paid — Vast Serverless

```json
{
  "order_id": "uuid",
  "endpoint": "video",
  "workflow_key": "wan_10s_v1",
  "inputs": { "face_url": "...", "garment_url": "...", "scene_url": "..." },
  "t_max_sec": 900,
  "cost_cap_usd": 0.35
}
```

Worker uploads output to R2; order → `completed` with `output_video_url`.

## Refund

Auto on: provision fail, workflow fail with no asset, exceed `t_max` with no asset. Ledger `type=refund`, same `provider_ref` uniqueness.

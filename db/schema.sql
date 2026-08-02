-- OneTrue AI — core schema (Postgres / Neon)
-- RunPod Serverless MVP (no Network Volume)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE order_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'queued',
  'provisioning',
  'running',
  'uploading',
  'completed',
  'failed',
  'refunded',
  'cancelled'
);

CREATE TYPE pay_mode AS ENUM ('direct', 'balance');
CREATE TYPE job_kind AS ENUM ('image', 'video');
CREATE TYPE ledger_type AS ENUM (
  'payment',
  'refund',
  'balance_debit',
  'balance_credit',
  'adjustment'
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE,
  wechat_openid   TEXT UNIQUE,
  wechat_unionid  TEXT,
  google_sub      TEXT UNIQUE,
  name            TEXT,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'user',
  balance_cents   BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recharge_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id),
  package_id        TEXT NOT NULL,
  points            BIGINT NOT NULL CHECK (points > 0),
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  remark_code       TEXT NOT NULL UNIQUE,
  channel           TEXT NOT NULL DEFAULT 'wechat'
                    CHECK (channel IN ('wechat', 'alipay', 'stripe')),
  status            TEXT NOT NULL DEFAULT 'pending_pay'
                    CHECK (status IN ('pending_pay', 'claimed', 'confirmed', 'expired', 'cancelled', 'rejected')),
  expires_at        TIMESTAMPTZ NOT NULL,
  claimed_at        TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      UUID REFERENCES users (id),
  rejected_at       TIMESTAMPTZ,
  reject_reason     TEXT,
  stripe_session_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recharge_orders_user_status_idx ON recharge_orders (user_id, status);
CREATE INDEX recharge_orders_status_claimed_idx ON recharge_orders (status, claimed_at DESC);

CREATE TABLE templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  kind              job_kind NOT NULL,
  title             TEXT NOT NULL,
  cover_url         TEXT,
  sample_video_url  TEXT,
  workflow_key      TEXT NOT NULL,
  -- stores RunPod endpoint key: image_24 | video_24 | video_48
  vast_endpoint     TEXT NOT NULL,
  est_seconds_cold  INT NOT NULL CHECK (est_seconds_cold > 0),
  est_seconds_hot   INT NOT NULL CHECK (est_seconds_hot > 0),
  t_hard_seconds    INT NOT NULL DEFAULT 900,
  alpha_cap         NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
  disk_gb           INT NOT NULL DEFAULT 50,
  preferred_gpu     TEXT NOT NULL DEFAULT 'RTX_4090',
  min_vram_gb       INT NOT NULL DEFAULT 24,
  gpu_tier          TEXT NOT NULL DEFAULT '24gb',
  min_price_cents   BIGINT NOT NULL DEFAULT 0,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users (id),
  template_id         UUID NOT NULL REFERENCES templates (id),
  kind                job_kind NOT NULL,
  status              order_status NOT NULL DEFAULT 'draft',

  currency            TEXT NOT NULL DEFAULT 'CNY',
  price_cents         BIGINT NOT NULL CHECK (price_cents > 0),
  fx_rate             NUMERIC(12, 6) NOT NULL DEFAULT 7.2,
  quote_json          JSONB NOT NULL,
  quote_expires_at    TIMESTAMPTZ NOT NULL,

  pay_mode            pay_mode NOT NULL DEFAULT 'direct',
  payment_provider    TEXT,
  payment_ref         TEXT,
  amount_paid_cents   BIGINT,
  payment_fee_cents   BIGINT,
  paid_at             TIMESTAMPTZ,

  face_url            TEXT,
  garment_url         TEXT,
  scene_url           TEXT,
  output_video_url    TEXT,
  output_image_url    TEXT,

  vast_endpoint       TEXT,          -- runpod endpoint key
  vast_job_ref        TEXT,          -- runpod job id
  vast_worker_ref     TEXT,
  rate_usd_hr         NUMERIC(12, 6),
  t_max_sec           INT,
  cost_cap_usd        NUMERIC(12, 6),
  billing_started_at  TIMESTAMPTZ,
  billing_ended_at    TIMESTAMPTZ,
  billable_seconds    INT,
  cost_gpu_usd        NUMERIC(12, 6),
  cost_disk_usd       NUMERIC(12, 6),
  cost_bw_usd         NUMERIC(12, 6),
  cost_warm_usd       NUMERIC(12, 6),
  cost_vast_usd       NUMERIC(12, 6), -- compute total USD
  margin_cents        BIGINT,

  error_code          TEXT,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_user_id_idx ON orders (user_id);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users (id),
  order_id      UUID REFERENCES orders (id),
  type          ledger_type NOT NULL,
  amount_cents  BIGINT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'CNY',
  provider_ref  TEXT,
  meta_json     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_ref, type)
);

CREATE TABLE webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE gpu_workers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID REFERENCES orders (id),
  vast_worker_ref     TEXT,
  status              TEXT NOT NULL DEFAULT 'requested',
  rate_usd_hr         NUMERIC(12, 6),
  last_heartbeat_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  destroyed_at        TIMESTAMPTZ
);

-- T_bill cold includes model download; hot is warm-cache path
INSERT INTO templates (
  slug, kind, title, workflow_key, vast_endpoint,
  est_seconds_cold, est_seconds_hot, t_hard_seconds, disk_gb,
  preferred_gpu, min_vram_gb, gpu_tier, min_price_cents
) VALUES
  ('image_fast', 'image', '快速出图 (SDXL/Krea)', 'sdxl_krea_v1', 'image_24',
   150, 45, 600, 50, 'RTX_4090', 24, '24gb', 0),
  ('image_std', 'image', '高质出图 (Flux 量化)', 'flux_q_v1', 'image_24',
   240, 70, 600, 50, 'RTX_4090', 24, '24gb', 0),
  ('video_fast', 'video', '快速短视频 (LTX ~10s)', 'ltx_10s_v1', 'video_24',
   300, 120, 720, 50, 'RTX_4090', 24, '24gb', 990),
  ('video_std', 'video', '标准带货视频 (Wan ~10s)', 'wan_10s_v1', 'video_24',
   480, 200, 900, 50, 'RTX_4090', 24, '24gb', 1990);

-- Auth + manual QR recharge (B scheme)
-- Run via: node scripts/apply-auth-recharge.mjs

ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_unionid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_openid_uidx
  ON users (wechat_openid) WHERE wechat_openid IS NOT NULL;

CREATE TABLE IF NOT EXISTS recharge_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id),
  package_id        TEXT NOT NULL,
  points            BIGINT NOT NULL CHECK (points > 0),
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  remark_code       TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'wechat'
                    CHECK (channel IN ('wechat', 'alipay')),
  status            TEXT NOT NULL DEFAULT 'pending_pay'
                    CHECK (status IN ('pending_pay', 'claimed', 'confirmed', 'expired', 'cancelled', 'rejected')),
  expires_at        TIMESTAMPTZ NOT NULL,
  claimed_at        TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      UUID REFERENCES users (id),
  rejected_at       TIMESTAMPTZ,
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recharge_orders_remark_code_uidx
  ON recharge_orders (remark_code);

CREATE INDEX IF NOT EXISTS recharge_orders_user_status_idx
  ON recharge_orders (user_id, status);

CREATE INDEX IF NOT EXISTS recharge_orders_status_claimed_idx
  ON recharge_orders (status, claimed_at DESC);

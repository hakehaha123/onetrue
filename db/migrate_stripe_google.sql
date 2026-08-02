-- Stripe channel + Google OAuth support
-- Run via: node scripts/apply-auth-recharge.mjs (or psql)

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uidx
  ON users (google_sub) WHERE google_sub IS NOT NULL;

-- Expand recharge channel check to include stripe
ALTER TABLE recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_channel_check;
ALTER TABLE recharge_orders
  ADD CONSTRAINT recharge_orders_channel_check
  CHECK (channel IN ('wechat', 'alipay', 'stripe'));

ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS recharge_orders_stripe_session_uidx
  ON recharge_orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

import { creditWallet, getWalletById } from '@/lib/wallet';
import { getSql } from '@/lib/db';
import { getCreditPackage } from '@/lib/credits';
import { notifyAdminRechargeClaimed } from '@/lib/notify';

export type RechargeOrder = {
  id: string;
  user_id: string;
  package_id: string;
  points: number;
  amount_cents: number;
  remark_code: string;
  channel: 'wechat' | 'alipay' | 'stripe';
  status: string;
  expires_at: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  stripe_session_id?: string | null;
};

const REMARK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomRemarkCode(len = 6): string {
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += REMARK_ALPHABET[bytes[i]! % REMARK_ALPHABET.length];
  return out;
}

export async function expireStaleOrders(userId?: string): Promise<void> {
  const db = getSql();
  if (userId) {
    await db`
      UPDATE recharge_orders
      SET status = 'expired', updated_at = now()
      WHERE user_id = ${userId}
        AND status IN ('pending_pay', 'claimed')
        AND expires_at < now()
    `;
  } else {
    await db`
      UPDATE recharge_orders
      SET status = 'expired', updated_at = now()
      WHERE status IN ('pending_pay', 'claimed')
        AND expires_at < now()
    `;
  }
}

export async function countOpenOrders(userId: string): Promise<number> {
  const db = getSql();
  const rows = await db`
    SELECT count(*)::int AS c FROM recharge_orders
    WHERE user_id = ${userId} AND status IN ('pending_pay', 'claimed')
  `;
  return Number((rows[0] as { c: number }).c ?? 0);
}

export async function createRechargeOrder(input: {
  userId: string;
  packageId: string;
  channel: 'wechat' | 'alipay' | 'stripe';
}): Promise<RechargeOrder> {
  const pkg = getCreditPackage(input.packageId);
  if (!pkg) throw new Error('invalid package');

  await expireStaleOrders(input.userId);
  const open = await countOpenOrders(input.userId);
  if (open >= 2) throw new Error('TOO_MANY_OPEN');

  const db = getSql();
  const amountCents = Math.round(pkg.cny * 100);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const remark = randomRemarkCode(6);
    try {
      const rows = await db`
        INSERT INTO recharge_orders (
          user_id, package_id, points, amount_cents, remark_code, channel, status, expires_at
        ) VALUES (
          ${input.userId}, ${pkg.id}, ${pkg.points}, ${amountCents}, ${remark},
          ${input.channel}, 'pending_pay', ${expiresAt}
        )
        RETURNING id, user_id, package_id, points, amount_cents, remark_code, channel,
                  status, expires_at, claimed_at, confirmed_at, created_at
      `;
      return rows[0] as RechargeOrder;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('recharge_orders_remark_code') && !msg.includes('unique')) throw e;
    }
  }
  throw new Error('remark code collision');
}

export async function getRechargeOrder(id: string): Promise<RechargeOrder | null> {
  const db = getSql();
  const rows = await db`
    SELECT id, user_id, package_id, points, amount_cents, remark_code, channel,
           status, expires_at, claimed_at, confirmed_at, created_at
    FROM recharge_orders WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as RechargeOrder) ?? null;
}

export async function listUserRecharges(userId: string, limit = 20): Promise<RechargeOrder[]> {
  await expireStaleOrders(userId);
  const db = getSql();
  const rows = await db`
    SELECT id, user_id, package_id, points, amount_cents, remark_code, channel,
           status, expires_at, claimed_at, confirmed_at, created_at
    FROM recharge_orders
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as RechargeOrder[];
}

export async function claimRechargeOrder(input: {
  orderId: string;
  userId: string;
  userName?: string | null;
}): Promise<RechargeOrder> {
  await expireStaleOrders(input.userId);
  const db = getSql();
  const rows = await db`
    UPDATE recharge_orders
    SET status = 'claimed', claimed_at = now(), updated_at = now()
    WHERE id = ${input.orderId}
      AND user_id = ${input.userId}
      AND status = 'pending_pay'
      AND expires_at > now()
    RETURNING id, user_id, package_id, points, amount_cents, remark_code, channel,
              status, expires_at, claimed_at, confirmed_at, created_at
  `;
  const order = rows[0] as RechargeOrder | undefined;
  if (!order) throw new Error('CLAIM_FAILED');

  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  void notifyAdminRechargeClaimed({
    amountCny: order.amount_cents / 100,
    points: Number(order.points),
    remarkCode: order.remark_code,
    channel: order.channel,
    userName: input.userName || '用户',
    orderId: order.id,
    adminUrl: `${base}/admin/recharges`,
  }).catch(() => undefined);

  return order;
}

export async function listClaimedRecharges(limit = 50) {
  await expireStaleOrders();
  const db = getSql();
  return db`
    SELECT r.id, r.user_id, r.package_id, r.points, r.amount_cents, r.remark_code, r.channel,
           r.status, r.expires_at, r.claimed_at, r.confirmed_at, r.created_at,
           u.name AS user_name, u.avatar_url AS user_avatar
    FROM recharge_orders r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.status = 'claimed'
    ORDER BY r.claimed_at ASC NULLS LAST
    LIMIT ${limit}
  `;
}

export async function confirmRechargeOrders(input: {
  orderIds: string[];
  adminId: string;
}): Promise<{ confirmed: string[]; failed: string[] }> {
  const confirmed: string[] = [];
  const failed: string[] = [];
  const db = getSql();

  for (const id of input.orderIds) {
    try {
      const rows = await db`
        UPDATE recharge_orders
        SET status = 'confirmed', confirmed_at = now(), confirmed_by = ${input.adminId}, updated_at = now()
        WHERE id = ${id} AND status = 'claimed'
        RETURNING id, user_id, package_id, points, amount_cents, remark_code
      `;
      const order = rows[0] as
        | {
            id: string;
            user_id: string;
            package_id: string;
            points: number;
            amount_cents: number;
            remark_code: string;
          }
        | undefined;
      if (!order) {
        failed.push(id);
        continue;
      }
      await creditWallet({
        userId: order.user_id,
        points: Number(order.points),
        packageId: order.package_id,
        note: `manual_qr_${order.remark_code}`,
        providerRef: `recharge_${order.id}`,
      });
      confirmed.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { confirmed, failed };
}

/** Create Stripe Checkout pending order (does not credit until webhook). */
export async function createStripeRechargeOrder(input: {
  userId: string;
  packageId: string;
}): Promise<RechargeOrder> {
  const db = getSql();
  await db`
    UPDATE recharge_orders
    SET status = 'cancelled', updated_at = now()
    WHERE user_id = ${input.userId}
      AND channel = 'stripe'
      AND status = 'pending_pay'
  `;
  return createRechargeOrder({
    userId: input.userId,
    packageId: input.packageId,
    channel: 'stripe',
  });
}

export async function attachStripeSession(orderId: string, sessionId: string): Promise<void> {
  const db = getSql();
  await db`
    UPDATE recharge_orders
    SET stripe_session_id = ${sessionId}, updated_at = now()
    WHERE id = ${orderId}
  `;
}

/** Idempotent credit after Stripe Checkout succeeds. */
export async function confirmStripeRecharge(input: {
  orderId: string;
  sessionId: string;
}): Promise<{ ok: true; already?: boolean } | { ok: false; reason: string }> {
  const db = getSql();
  const rows = await db`
    SELECT id, user_id, package_id, points, amount_cents, remark_code, channel, status,
           stripe_session_id
    FROM recharge_orders WHERE id = ${input.orderId} LIMIT 1
  `;
  const order = rows[0] as
    | (RechargeOrder & { stripe_session_id?: string | null })
    | undefined;
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (order.channel !== 'stripe') return { ok: false, reason: 'not_stripe' };
  if (order.status === 'confirmed') return { ok: true, already: true };

  const updated = await db`
    UPDATE recharge_orders
    SET status = 'confirmed',
        confirmed_at = now(),
        claimed_at = COALESCE(claimed_at, now()),
        stripe_session_id = COALESCE(stripe_session_id, ${input.sessionId}),
        updated_at = now()
    WHERE id = ${input.orderId}
      AND status IN ('pending_pay', 'claimed')
    RETURNING id, user_id, package_id, points, remark_code
  `;
  const row = updated[0] as
    | { id: string; user_id: string; package_id: string; points: number; remark_code: string }
    | undefined;
  if (!row) {
    const again = await getRechargeOrder(input.orderId);
    if (again?.status === 'confirmed') return { ok: true, already: true };
    return { ok: false, reason: 'confirm_failed' };
  }

  await creditWallet({
    userId: row.user_id,
    points: Number(row.points),
    packageId: row.package_id,
    note: `stripe_${row.remark_code}`,
    providerRef: `stripe_${input.sessionId}`,
  });
  return { ok: true };
}

export async function rejectRechargeOrder(input: {
  orderId: string;
  adminId: string;
  reason?: string;
}): Promise<boolean> {
  const db = getSql();
  const rows = await db`
    UPDATE recharge_orders
    SET status = 'rejected',
        rejected_at = now(),
        confirmed_by = ${input.adminId},
        reject_reason = ${input.reason ?? 'rejected'},
        updated_at = now()
    WHERE id = ${input.orderId} AND status = 'claimed'
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function getUserBalance(userId: string): Promise<number> {
  const w = await getWalletById(userId);
  return Number(w?.balance_cents ?? 0);
}

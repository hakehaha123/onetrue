import { getSql } from './db';
import { requireUser, type AppUser } from '@/lib/auth';

export type WalletRow = {
  id: string;
  balance_cents: number;
  email: string | null;
  created_at?: string;
  name?: string | null;
  avatar_url?: string | null;
  role?: string;
};

/** @deprecated Cookie wallets removed — use requireUser / getSessionWallet */
export const WALLET_COOKIE = 'fvs_wallet_id';

export async function getSessionWallet(): Promise<AppUser> {
  return requireUser();
}

export async function getWalletById(id: string): Promise<WalletRow | null> {
  const db = getSql();
  const rows = await db`
    SELECT id, balance_cents, email, name, avatar_url, role, created_at
    FROM users WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as WalletRow) ?? null;
}

/** Manual / package top-up. 1积分 = ¥0.01. Idempotent via provider_ref. */
export async function creditWallet(input: {
  userId: string;
  points: number;
  packageId: string;
  note?: string;
  providerRef?: string;
}): Promise<WalletRow> {
  if (input.points <= 0) throw new Error('points must be positive');
  const db = getSql();
  const ref = input.providerRef ?? `topup_${input.packageId}_${crypto.randomUUID()}`;
  const inserted = await db`
    INSERT INTO ledger_entries (user_id, type, amount_cents, currency, provider_ref, meta_json)
    VALUES (
      ${input.userId}, 'balance_credit', ${input.points}, 'CNY', ${ref},
      ${JSON.stringify({
        package_id: input.packageId,
        note: input.note ?? 'recharge',
        mode: input.note?.startsWith('stripe_') ? 'stripe' : 'manual_qr',
      })}
    )
    ON CONFLICT (provider_ref, type) DO NOTHING
    RETURNING id
  `;
  if (!inserted[0]) {
    const cur = await getWalletById(input.userId);
    if (!cur) throw new Error('user not found');
    return cur;
  }
  const rows = await db`
    UPDATE users SET balance_cents = balance_cents + ${input.points}
    WHERE id = ${input.userId}
    RETURNING id, balance_cents, email, name, avatar_url, role, created_at
  `;
  return rows[0] as WalletRow;
}

/** Atomic debit; returns false if insufficient */
export async function debitWallet(input: {
  userId: string;
  points: number;
  reason: string;
  jobRef?: string;
}): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  if (input.points <= 0) throw new Error('points must be positive');
  const db = getSql();
  const rows = await db`
    UPDATE users SET balance_cents = balance_cents - ${input.points}
    WHERE id = ${input.userId} AND balance_cents >= ${input.points}
    RETURNING balance_cents
  `;
  if (!rows[0]) {
    const cur = await db`SELECT balance_cents FROM users WHERE id = ${input.userId} LIMIT 1`;
    return {
      ok: false,
      balance: Number((cur[0] as { balance_cents: number } | undefined)?.balance_cents ?? 0),
    };
  }
  const ref = `debit_${input.reason}_${input.jobRef ?? crypto.randomUUID()}`;
  await db`
    INSERT INTO ledger_entries (user_id, type, amount_cents, currency, provider_ref, meta_json)
    VALUES (
      ${input.userId}, 'balance_debit', ${-input.points}, 'CNY', ${ref},
      ${JSON.stringify({ reason: input.reason, job_ref: input.jobRef ?? null })}
    )
    ON CONFLICT (provider_ref, type) DO NOTHING
  `;
  return { ok: true, balance: Number((rows[0] as { balance_cents: number }).balance_cents) };
}

export async function refundWallet(input: {
  userId: string;
  points: number;
  reason: string;
  jobRef?: string;
}): Promise<void> {
  if (input.points <= 0) return;
  const db = getSql();
  const ref = `refund_${input.reason}_${input.jobRef ?? crypto.randomUUID()}`;
  await db`
    INSERT INTO ledger_entries (user_id, type, amount_cents, currency, provider_ref, meta_json)
    VALUES (
      ${input.userId}, 'refund', ${input.points}, 'CNY', ${ref},
      ${JSON.stringify({ reason: input.reason, job_ref: input.jobRef ?? null })}
    )
    ON CONFLICT (provider_ref, type) DO NOTHING
  `;
  await db`
    UPDATE users SET balance_cents = balance_cents + ${input.points}
    WHERE id = ${input.userId}
  `;
}

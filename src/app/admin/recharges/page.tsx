'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { LangSwitch, useI18n } from '@/lib/i18n/I18nProvider';

type Claimed = {
  id: string;
  user_id: string;
  package_id: string;
  points: number;
  amount_cents: number;
  remark_code: string;
  channel: string;
  claimed_at: string | null;
  user_name: string | null;
  user_avatar: string | null;
};

export default function AdminRechargesPage() {
  const { t } = useI18n();
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<Claimed[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/recharges');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'failed');
    setOrders((data.orders || []) as Claimed[]);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    refresh().catch((e) => setErr(e instanceof Error ? e.message : 'error'));
  }, [status, refresh]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmIds(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`确认这 ${ids.length} 笔已到账并入账？`)) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recharges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm', order_ids: ids }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'failed');
        setMsg(`已确认 ${data.confirmed?.length ?? 0} 笔`);
        setSelected(new Set());
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  function rejectOne(id: string) {
    if (!window.confirm('拒绝该笔充值（不入账）？')) return;
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recharges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', order_id: id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'failed');
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  if (status === 'loading') return <p className="pad">…</p>;
  if (!session?.user) {
    return (
      <p className="pad">
        <Link href="/login">{t.login}</Link>
      </p>
    );
  }
  if (session.user.role !== 'admin') {
    return <p className="pad">{t.forbidden}</p>;
  }

  return (
    <div className="page">
      <header>
        <div className="top">
          <Link href="/">{t.backTxt2img}</Link>
          <LangSwitch />
        </div>
        <p className="brand">{t.brand}</p>
        <h1>{t.adminRecharges}</h1>
        <p className="lede">{t.adminRechargesLede}</p>
      </header>

      <div className="actions">
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => confirmIds([...selected])}
        >
          {t.confirmSelected} ({selected.size})
        </button>
        <button type="button" disabled={pending} onClick={() => refresh().catch(() => undefined)}>
          {t.refresh}
        </button>
      </div>

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err">{err}</p>}

      <ul className="list">
        {orders.length === 0 && <li className="empty">{t.noPendingRecharges}</li>}
        {orders.map((o) => (
          <li key={o.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggle(o.id)}
              />
            </label>
            <div className="body">
              <div
                className="code"
                title={t.copyRemark}
                role="button"
                tabIndex={0}
                onClick={() => navigator.clipboard?.writeText(o.remark_code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigator.clipboard?.writeText(o.remark_code);
                }}
              >
                {o.remark_code}
              </div>
              <div className="meta">
                ¥{(Number(o.amount_cents) / 100).toFixed(2)} · {o.points} {t.points} ·{' '}
                {o.channel === 'alipay' ? '支付宝' : '微信'}
              </div>
              <div className="user">
                {o.user_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.user_avatar} alt="" width={20} height={20} />
                ) : null}
                {o.user_name || o.user_id.slice(0, 8)}
              </div>
              <div className="time">{o.claimed_at ? new Date(o.claimed_at).toLocaleString() : ''}</div>
            </div>
            <div className="btns">
              <button type="button" disabled={pending} onClick={() => confirmIds([o.id])}>
                {t.confirmPaid}
              </button>
              <button type="button" className="rej" disabled={pending} onClick={() => rejectOne(o.id)}>
                {t.reject}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: clamp(1rem, 3vw, 2.5rem);
          background: linear-gradient(165deg, #0e0c0a, #15120e 40%, #12161c);
          color: #f3ebe1;
        }
        .top {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .top a {
          color: #b5a893;
          text-decoration: none;
        }
        .brand {
          font-family: var(--font-display), Georgia, serif;
          font-size: 2rem;
          margin: 0;
        }
        h1 {
          margin: 0.35rem 0;
          font-size: 1.2rem;
        }
        .lede {
          color: #9a8f82;
          margin: 0 0 1rem;
        }
        .actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .actions button,
        .btns button {
          border: 1px solid #ffffff22;
          background: #c4a57422;
          color: #e8dcc8;
          padding: 0.45rem 0.7rem;
          cursor: pointer;
          font: inherit;
        }
        .btns .rej {
          background: transparent;
          color: #e8a0a0;
        }
        .list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          max-width: 720px;
        }
        li {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 0.75rem;
          align-items: center;
          border: 1px solid #ffffff14;
          background: #090807cc;
          padding: 0.75rem;
        }
        .code {
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #c4a574;
          font-variant-numeric: tabular-nums;
          cursor: pointer;
        }
        .meta,
        .time,
        .user {
          font-size: 0.82rem;
          color: #9a8f82;
        }
        .user {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-top: 0.2rem;
        }
        .user img {
          border-radius: 50%;
        }
        .btns {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .ok {
          color: #b7d4a8;
        }
        .err {
          color: #e8a0a0;
        }
        .empty {
          color: #7a7268;
          border: none;
          background: transparent;
        }
        .pad {
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}

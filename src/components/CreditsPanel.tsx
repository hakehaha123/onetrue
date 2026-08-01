'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { LangSwitch, useI18n } from '@/lib/i18n/I18nProvider';
import { UserBar } from '@/components/AuthWidgets';

type Package = {
  id: string;
  points: number;
  cny: number;
  label: string;
};

type Order = {
  id: string;
  package_id: string;
  points: number;
  amount_cents: number;
  remark_code: string;
  channel: string;
  status: string;
  expires_at: string;
};

type ActivePay = {
  order: Order;
  qr_url: string | null;
  channel: 'wechat' | 'alipay';
};

function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) {
      setLeft(0);
      return;
    }
    const tick = () => {
      setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

function formatRemain(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CreditsPanel() {
  const { t, locale } = useI18n();
  const { status: authStatus } = useSession();
  const [points, setPoints] = useState<number | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wechatQr, setWechatQr] = useState<string | null>(null);
  const [alipayQr, setAlipayQr] = useState<string | null>(null);
  const [active, setActive] = useState<ActivePay | null>(null);
  const [channel, setChannel] = useState<'wechat' | 'alipay'>('wechat');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const [w, p] = await Promise.all([
      fetch('/api/wallet').then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() })),
      fetch('/api/wallet/recharge').then(async (r) => ({
        ok: r.ok,
        status: r.status,
        data: await r.json(),
      })),
    ]);
    if (w.status === 401 || p.status === 401) {
      setErr('login_required');
      return;
    }
    if (!w.ok) throw new Error(w.data.error || 'wallet failed');
    if (!p.ok) throw new Error(p.data.error || 'packages failed');
    setPoints(Number(w.data.points));
    setPackages((p.data.packages || []) as Package[]);
    setOrders((p.data.orders || []) as Order[]);
    setWechatQr(p.data.pay?.wechat_qr || null);
    setAlipayQr(p.data.pay?.alipay_qr || null);
  }, []);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      setErr('login_required');
      return;
    }
    if (authStatus !== 'authenticated') return;
    refresh().catch((e) => setErr(e instanceof Error ? e.message : 'error'));
  }, [authStatus, refresh]);

  function createOrder(packageId: string) {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/wallet/recharge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package_id: packageId, channel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'failed');
        setActive({
          order: data.order as Order,
          qr_url: data.qr_url,
          channel,
        });
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  function claim(orderId: string) {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/recharge/${orderId}/claim`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'failed');
        setMsg(data.message || t.rechargeClaimed);
        setActive(null);
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'failed');
      }
    });
  }

  const qr = active?.qr_url || (channel === 'alipay' ? alipayQr : wechatQr);
  const remainSec = useCountdown(active?.order.expires_at ?? null);

  return (
    <div className="page">
      <header className="top">
        <div className="row">
          <Link href="/" className="back">
            {t.backTxt2img}
          </Link>
          <div className="right">
            <UserBar />
            <LangSwitch />
          </div>
        </div>
        <p className="brand">{t.brand}</p>
        <h1>{t.creditsTitle}</h1>
        <p className="lede">{t.creditsLede}</p>
      </header>

      {err === 'login_required' ? (
        <section className="login-need">
          <p>{t.loginRequired}</p>
          <Link href="/login">{t.login}</Link>
        </section>
      ) : (
        <>
          <section className="balance">
            <span>{t.currentBalance}</span>
            <strong>{points == null ? '…' : `${points} ${t.points}`}</strong>
            <em>{points == null ? '' : `≈ ¥${(points / 100).toFixed(2)}`}</em>
          </section>

          <section className="channel">
            <span>{t.payChannel}</span>
            <div className="tabs">
              <button
                type="button"
                className={channel === 'wechat' ? 'on' : ''}
                onClick={() => setChannel('wechat')}
              >
                {t.channelWechat}
              </button>
              <button
                type="button"
                className={channel === 'alipay' ? 'on' : ''}
                onClick={() => setChannel('alipay')}
              >
                {t.channelAlipay}
              </button>
            </div>
          </section>

          <section className="grid">
            {packages.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pack"
                disabled={pending}
                onClick={() => createOrder(p.id)}
              >
                <span className="label">{p.label}</span>
                <span className="pts">
                  {p.points} {t.points}
                </span>
                <span className="cny">¥{p.cny}</span>
              </button>
            ))}
          </section>

          {active && (
            <section className="paybox">
              <h2>{t.payNow}</h2>
              <p className="amount">
                {t.payAmount} <strong>¥{(active.order.amount_cents / 100).toFixed(2)}</strong>
              </p>
              <p className="remark">
                {t.payRemark}{' '}
                <strong className="code">{active.order.remark_code}</strong>{' '}
                <button
                  type="button"
                  className="copy"
                  onClick={() => navigator.clipboard?.writeText(active.order.remark_code)}
                >
                  {t.copyRemark}
                </button>
              </p>
              <p className="hint">
                {t.expiresIn} {formatRemain(remainSec)}
              </p>
              <p className="hint">{t.payRemarkHint}</p>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="pay qr" className="qr" />
              ) : (
                <p className="hint">{t.payQrMissing}</p>
              )}
              <button type="button" className="claim" disabled={pending} onClick={() => claim(active.order.id)}>
                {t.iPaid}
              </button>
              <p className="delay">{t.rechargeDelayNote}</p>
            </section>
          )}

          {msg && <p className="ok">{msg}</p>}
          {err && err !== 'login_required' && <p className="err">{err}</p>}

          <section className="hist">
            <h2>{t.myRecharges}</h2>
            <ul>
              {orders.length === 0 && <li className="empty">{t.noRecharges}</li>}
              {orders.map((o) => (
                <li key={o.id}>
                  <span className="code">{o.remark_code}</span>
                  <span>
                    ¥{(o.amount_cents / 100).toFixed(2)} · {statusLabel(o.status, t, locale)}
                  </span>
                  {o.status === 'pending_pay' && (
                    <button type="button" disabled={pending} onClick={() => claim(o.id)}>
                      {t.iPaid}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="tips">
            <h2>{t.tipsTitle}</h2>
            <ol>
              <li>{t.tip1}</li>
              <li>{t.tipManualPay}</li>
              <li>{t.tip3}</li>
              <li>{t.tip4}</li>
            </ol>
          </section>
        </>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: clamp(1rem, 3vw, 2.5rem);
          background:
            radial-gradient(1000px 500px at 10% -10%, #3d2a1a44, transparent 50%),
            linear-gradient(165deg, #0e0c0a, #15120e 40%, #12161c);
          color: #f3ebe1;
        }
        .row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        .right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .back {
          color: #b5a893;
          text-decoration: none;
        }
        .brand {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(2rem, 5vw, 2.8rem);
          margin: 1rem 0 0.25rem;
        }
        h1 {
          margin: 0.25rem 0;
          font-size: 1.25rem;
        }
        .lede {
          color: #9a8f82;
          margin: 0 0 1.25rem;
        }
        .balance {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin-bottom: 1.25rem;
          padding: 1rem;
          border: 1px solid #ffffff14;
          background: #090807cc;
          max-width: 420px;
        }
        .balance strong {
          font-size: 1.5rem;
          color: #c4a574;
        }
        .balance em {
          color: #7a7268;
          font-style: normal;
          font-size: 0.85rem;
        }
        .channel {
          margin-bottom: 1rem;
          color: #cbb9a4;
          font-size: 0.9rem;
        }
        .tabs {
          display: flex;
          gap: 0.4rem;
          margin-top: 0.4rem;
        }
        .tabs button {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #d7cdc1;
          padding: 0.4rem 0.7rem;
          cursor: pointer;
          font: inherit;
        }
        .tabs button.on {
          border-color: #c4a57499;
          background: #c4a57422;
          color: #c4a574;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.65rem;
          max-width: 720px;
          margin-bottom: 1.25rem;
        }
        .pack {
          border: 1px solid #ffffff14;
          background: #0c0a08aa;
          color: #f3ebe1;
          padding: 0.9rem;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font: inherit;
        }
        .pack .pts {
          color: #c4a574;
          font-weight: 600;
        }
        .pack .cny {
          color: #9a8f82;
          font-size: 0.85rem;
        }
        .paybox {
          max-width: 420px;
          padding: 1rem;
          border: 1px solid #c4a57455;
          background: #140f0ccc;
          margin-bottom: 1.25rem;
        }
        .paybox h2 {
          margin: 0 0 0.5rem;
          font-size: 1rem;
        }
        .code {
          font-size: 1.4rem;
          letter-spacing: 0.1em;
          color: #c4a574;
        }
        .copy {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #c4a574;
          padding: 0.15rem 0.4rem;
          font: inherit;
          font-size: 0.8rem;
          cursor: pointer;
          vertical-align: middle;
        }
        .hint,
        .delay {
          color: #9a8f82;
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .qr {
          width: min(220px, 100%);
          margin: 0.75rem 0;
          background: #fff;
          padding: 0.5rem;
        }
        .claim {
          width: 100%;
          border: none;
          padding: 0.75rem;
          background: linear-gradient(120deg, #c4a574, #8f6b3e);
          color: #1a120a;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .hist,
        .tips {
          max-width: 720px;
          margin-top: 1.5rem;
        }
        .hist h2,
        .tips h2 {
          font-size: 1rem;
          margin: 0 0 0.5rem;
        }
        .hist ul,
        .tips ol {
          margin: 0;
          padding-left: 1.1rem;
          color: #9a8f82;
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .hist ul {
          list-style: none;
          padding: 0;
        }
        .hist li {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 1rem;
          align-items: center;
          padding: 0.55rem 0;
          border-bottom: 1px solid #ffffff10;
        }
        .hist button {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #c4a574;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          font: inherit;
        }
        .ok {
          color: #b7d4a8;
        }
        .err {
          color: #e8a0a0;
        }
        .login-need {
          padding: 1.25rem;
          border: 1px solid #ffffff14;
          max-width: 420px;
        }
        .login-need a {
          color: #c4a574;
        }
      `}</style>
    </div>
  );
}

function statusLabel(
  status: string,
  t: { rechargePending: string; rechargeClaimed: string; rechargeConfirmed: string; rechargeOther: string },
  _locale: string,
) {
  if (status === 'pending_pay') return t.rechargePending;
  if (status === 'claimed') return t.rechargeClaimed;
  if (status === 'confirmed') return t.rechargeConfirmed;
  return t.rechargeOther;
}

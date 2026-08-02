'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useI18n } from '@/lib/i18n/I18nProvider';

const BRAND = '缘初 AI';
const LOGO_URL = 'https://pub-38aba3cae8ff4b60ab5825a0c87ddccd.r2.dev/images/logo.png';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { data, status } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const refreshWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      const json = await res.json();
      if (res.ok) setBalance(Number(json.points));
      else setBalance(null);
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') refreshWallet().catch(() => undefined);
    else setBalance(null);
  }, [status, refreshWallet]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (langRef.current && !langRef.current.contains(t)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(t)) setUserOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const nav = [
    { href: '/', label: t.txt2img, match: (p: string) => p === '/' },
    { href: '/video', label: t.txt2vid, match: (p: string) => p.startsWith('/video') },
  ];

  const userLabel =
    status === 'loading' ? '…' : data?.user ? data.user.name || t.user : t.login;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="" className="brand-logo" width={28} height={28} />
          <span>{BRAND}</span>
        </div>
        <nav className="side-nav">
          {nav.map((item) => {
            const on = item.match(pathname || '/');
            return (
              <Link key={item.href} href={item.href} className={on ? 'nav-item on' : 'nav-item'}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="side-foot">
          <Link href="/credits" className="nav-item quiet">
            {t.recharge}
          </Link>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" className="top-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="" className="brand-logo" width={28} height={28} />
            <span>{BRAND}</span>
          </Link>
          <div className="top-actions">
            <Link href="/credits" className="top-link">
              {t.recharge}
            </Link>

            <div className="dd" ref={langRef}>
              <button
                type="button"
                className="dd-btn"
                aria-expanded={langOpen}
                onClick={() => {
                  setLangOpen((v) => !v);
                  setUserOpen(false);
                }}
              >
                {locale === 'zh' ? '中文' : 'EN'}
                <span className="caret" aria-hidden>
                  ▾
                </span>
              </button>
              {langOpen ? (
                <div className="dd-menu">
                  <button
                    type="button"
                    className={locale === 'zh' ? 'dd-opt on' : 'dd-opt'}
                    onClick={() => {
                      setLocale('zh');
                      setLangOpen(false);
                    }}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    className={locale === 'en' ? 'dd-opt on' : 'dd-opt'}
                    onClick={() => {
                      setLocale('en');
                      setLangOpen(false);
                    }}
                  >
                    EN
                  </button>
                </div>
              ) : null}
            </div>

            <div className="dd" ref={userRef}>
              <button
                type="button"
                className="dd-btn"
                aria-expanded={userOpen}
                onClick={() => {
                  if (!data?.user && status !== 'loading') {
                    window.location.href = '/login';
                    return;
                  }
                  setUserOpen((v) => !v);
                  setLangOpen(false);
                }}
              >
                {userLabel}
                {data?.user ? (
                  <span className="caret" aria-hidden>
                    ▾
                  </span>
                ) : null}
              </button>
              {userOpen && data?.user ? (
                <div className="dd-menu">
                  {data.user.role === 'admin' ? (
                    <Link
                      href="/admin/recharges"
                      className="dd-opt link"
                      onClick={() => setUserOpen(false)}
                    >
                      {t.adminRecharges}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="dd-opt"
                    onClick={() => signOut({ callbackUrl: '/' })}
                  >
                    {t.logout}
                  </button>
                </div>
              ) : null}
            </div>

            <Link href="/credits" className="balance-pill" title={t.recharge}>
              <span className="bal-label">{t.balance}</span>
              <span className="bal-val">
                {status !== 'authenticated' ? '—' : balance == null ? '…' : balance}
              </span>
            </Link>
          </div>
        </header>

        <div className="content">{children}</div>
      </div>

      <style jsx>{`
        .shell {
          --bg: #12141a;
          --side: #0c0e12;
          --line: #ffffff14;
          --text: #ece8e1;
          --muted: #b8b2a8;
          --accent: #d4a574;
          --accent-dim: #d4a57433;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 220px 1fr;
          background: radial-gradient(1200px 600px at 10% -10%, #1a2230 0%, transparent 55%),
            radial-gradient(900px 500px at 100% 0%, #1c1814 0%, transparent 50%), var(--bg);
          color: var(--text);
        }
        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 1.25rem 0.9rem;
          background: linear-gradient(180deg, #10131a 0%, var(--side) 100%);
          border-right: 1px solid var(--line);
        }
        .side-brand,
        .top-brand {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          font-family: var(--font-display), Georgia, serif;
          letter-spacing: 0.03em;
          color: #f5f1ea;
          text-decoration: none;
        }
        .side-brand {
          font-size: 1.25rem;
          padding: 0.35rem 0.65rem 0.85rem;
          border-bottom: 1px solid var(--line);
        }
        .brand-logo {
          width: 28px;
          height: 28px;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 6px;
        }
        .side-nav {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          flex: 1;
        }
        .side-foot {
          border-top: 1px solid var(--line);
          padding-top: 0.75rem;
        }
        .nav-item {
          display: block;
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          color: var(--muted);
          text-decoration: none;
          font-size: 0.95rem;
          transition: background 0.15s, color 0.15s;
        }
        .nav-item:hover,
        .nav-item:visited {
          color: var(--text);
        }
        .nav-item:hover {
          background: #ffffff08;
        }
        .nav-item.on,
        .nav-item.on:visited {
          color: #fffaf3;
          background: #ffffff0d;
          box-shadow: inset 3px 0 0 #cfc6ba;
        }
        .nav-item.quiet {
          font-size: 0.85rem;
        }
        .main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .topbar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 1.5rem;
          background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .top-brand {
          font-size: 1.15rem;
        }
        .top-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .top-link,
        .top-link:visited {
          color: #d8d2c8;
          text-decoration: none;
          font-size: 0.85rem;
          padding: 0.35rem 0.5rem;
        }
        .top-link:hover {
          color: #fff;
        }
        .dd {
          position: relative;
        }
        .dd-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border: 1px solid var(--line);
          background: #ffffff08;
          color: var(--text);
          padding: 0.35rem 0.65rem;
          border-radius: 8px;
          cursor: pointer;
          font: inherit;
          font-size: 0.85rem;
          max-width: 10rem;
        }
        .dd-btn:hover {
          border-color: #ffffff28;
        }
        .caret {
          font-size: 0.65rem;
          opacity: 0.7;
        }
        .dd-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          min-width: 8rem;
          background: #171a22;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 0.25rem;
          box-shadow: 0 12px 40px #00000066;
          z-index: 30;
        }
        .dd-opt {
          display: block;
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          color: var(--text);
          padding: 0.5rem 0.65rem;
          border-radius: 6px;
          cursor: pointer;
          font: inherit;
          font-size: 0.85rem;
          text-decoration: none;
        }
        .dd-opt:hover,
        .dd-opt.on {
          background: #ffffff10;
        }
        .balance-pill,
        .balance-pill:visited {
          display: inline-flex;
          align-items: baseline;
          gap: 0.35rem;
          text-decoration: none;
          border: 1px solid #ffffff22;
          background: #ffffff0a;
          color: #f2efe8;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          font-size: 0.85rem;
        }
        .bal-label {
          color: #b8b2a8;
          font-size: 0.75rem;
        }
        .bal-val {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: #fff;
        }
        .content {
          flex: 1;
          padding: 1.25rem 1.5rem 2.5rem;
        }
        @media (max-width: 860px) {
          .shell {
            grid-template-columns: 1fr;
          }
          .sidebar {
            position: relative;
            height: auto;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem;
          }
          .side-brand {
            border: none;
            padding: 0.25rem 0.5rem;
            width: 100%;
          }
          .side-nav {
            flex-direction: row;
            flex: 1;
          }
          .side-foot {
            border: none;
            padding: 0;
          }
          .top-brand {
            display: none;
          }
          .content {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

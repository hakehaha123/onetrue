'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LangSwitch, useI18n } from '@/lib/i18n/I18nProvider';
import { DevLoginForm, GoogleLoginButton, WeChatLoginButton } from '@/components/AuthWidgets';

function LoginInner() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const err = sp.get('error');
  const [wechatReady, setWechatReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [devReady, setDevReady] = useState(false);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((p: Record<string, { id?: string }>) => {
        setWechatReady(Boolean(p.wechat));
        setGoogleReady(Boolean(p.google));
        setDevReady(Boolean(p.dev));
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="page">
      <header>
        <div className="row">
          <Link href="/">{t.backTxt2img}</Link>
          <LangSwitch />
        </div>
        <p className="brand">{t.brand}</p>
        <h1>{t.loginTitle}</h1>
        <p className="lede">{t.loginLede}</p>
      </header>

      <section className="box">
        {wechatReady ? <WeChatLoginButton /> : null}
        {googleReady ? <GoogleLoginButton /> : null}
        {!wechatReady && !googleReady ? <p className="hint">{t.loginWechatPending}</p> : null}
        {devReady ? <DevLoginForm /> : null}
        {err ? <p className="err">{err}</p> : null}
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: clamp(1rem, 3vw, 2.5rem);
          background:
            radial-gradient(900px 500px at 20% -10%, #3d2a1a55, transparent 55%),
            linear-gradient(165deg, #0e0c0a, #15120e 45%, #12161c);
          color: #f3ebe1;
        }
        header {
          max-width: 420px;
          margin: 0 auto 1.5rem;
        }
        .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .row a {
          color: #b5a893;
          text-decoration: none;
        }
        .brand {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(2rem, 5vw, 2.8rem);
          margin: 0;
          color: #e8dcc8;
        }
        h1 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.4rem 0;
        }
        .lede {
          color: #9a8f82;
          margin: 0;
          font-size: 0.9rem;
        }
        .box {
          max-width: 420px;
          margin: 0 auto;
          padding: 1.25rem;
          border: 1px solid #ffffff14;
          background: #090807cc;
        }
        .hint {
          color: #9a8f82;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .err {
          color: #e8a0a0;
          margin-top: 0.75rem;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

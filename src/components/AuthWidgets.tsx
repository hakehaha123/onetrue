'use client';

import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';

export function AuthProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export function UserBar() {
  const { t } = useI18n();
  const { data, status } = useSession();

  if (status === 'loading') {
    return <span className="ub muted">…</span>;
  }

  if (!data?.user) {
    return (
      <Link href="/login" className="ub login">
        {t.login}
      </Link>
    );
  }

  return (
    <div className="ub row">
      {data.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.user.image} alt="" className="av" width={28} height={28} />
      ) : null}
      <span className="name">{data.user.name || t.user}</span>
      {data.user.role === 'admin' ? (
        <Link href="/admin/recharges" className="admin">
          {t.adminRecharges}
        </Link>
      ) : null}
      <button type="button" className="out" onClick={() => signOut({ callbackUrl: '/' })}>
        {t.logout}
      </button>
      <style jsx>{`
        .ub.row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.85rem;
          color: #cbb9a4;
        }
        .av {
          border-radius: 50%;
          object-fit: cover;
        }
        .name {
          max-width: 8rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin,
        .login {
          color: #c4a574;
          text-decoration: none;
        }
        .out {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #b5a893;
          padding: 0.2rem 0.45rem;
          cursor: pointer;
          font: inherit;
        }
        .muted {
          color: #7a7268;
        }
      `}</style>
    </div>
  );
}

export function WeChatLoginButton() {
  const { t } = useI18n();
  return (
    <button type="button" className="wx" onClick={() => signIn('wechat', { callbackUrl: '/' })}>
      {t.loginWechat}
      <style jsx>{`
        .wx {
          width: 100%;
          border: none;
          padding: 0.9rem 1.2rem;
          font: inherit;
          font-size: 1.05rem;
          cursor: pointer;
          color: #fff;
          background: #07c160;
        }
        .wx:hover {
          filter: brightness(1.05);
        }
      `}</style>
    </button>
  );
}

export function GoogleLoginButton() {
  const { t } = useI18n();
  return (
    <button type="button" className="gg" onClick={() => signIn('google', { callbackUrl: '/' })}>
      {t.loginGoogle}
      <style jsx>{`
        .gg {
          width: 100%;
          border: 1px solid #ffffff28;
          padding: 0.9rem 1.2rem;
          font: inherit;
          font-size: 1.05rem;
          cursor: pointer;
          color: #f2efe8;
          background: #1a1f2a;
          margin-top: 0.65rem;
        }
        .gg:hover {
          background: #222836;
        }
      `}</style>
    </button>
  );
}

export function DevLoginForm() {
  const { t } = useI18n();
  return (
    <form
      className="dev"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get('password') || '');
        signIn('dev', { password, callbackUrl: '/' });
      }}
    >
      <label>
        <span>{t.devLogin}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button type="submit">{t.login}</button>
      <style jsx>{`
        .dev {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          margin-top: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          color: #cbb9a4;
          font-size: 0.85rem;
        }
        input {
          border: 1px solid #ffffff22;
          background: #0c0a08;
          color: #f3ebe1;
          padding: 0.55rem 0.7rem;
          font: inherit;
        }
        button {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #c4a574;
          padding: 0.55rem;
          cursor: pointer;
          font: inherit;
        }
      `}</style>
    </form>
  );
}

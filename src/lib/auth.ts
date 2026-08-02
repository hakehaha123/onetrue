import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import type { OAuthConfig, Provider } from 'next-auth/providers';
import { getSql } from '@/lib/db';

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  role: string;
  balance_cents: number;
  wechat_openid: string | null;
};

type WeChatProfile = {
  openid: string;
  unionid?: string;
  nickname?: string;
  headimgurl?: string;
  errcode?: number;
  errmsg?: string;
};

type WeChatTokenRequestContext = {
  params: { code?: string | null };
};

type WeChatUserinfoTokens = {
  access_token?: string;
  openid?: string;
  unionid?: string;
};

function adminOpenIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_WECHAT_OPENIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function adminGoogleEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_GOOGLE_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const db = getSql();
  const rows = await db`
    SELECT id, email, name, avatar_url, role, balance_cents, wechat_openid
    FROM users WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as AppUser) ?? null;
}

export async function upsertWechatUser(input: {
  openid: string;
  unionid?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<AppUser> {
  const db = getSql();
  const role = adminOpenIds().has(input.openid) ? 'admin' : 'user';
  const existing = await db`
    SELECT id, email, name, avatar_url, role, balance_cents, wechat_openid
    FROM users WHERE wechat_openid = ${input.openid} LIMIT 1
  `;
  if (existing[0]) {
    const rows = await db`
      UPDATE users SET
        wechat_unionid = COALESCE(${input.unionid ?? null}, wechat_unionid),
        name = COALESCE(${input.name ?? null}, name),
        avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url),
        role = CASE WHEN ${role} = 'admin' THEN 'admin' ELSE role END
      WHERE wechat_openid = ${input.openid}
      RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
    `;
    return rows[0] as AppUser;
  }
  const rows = await db`
    INSERT INTO users (wechat_openid, wechat_unionid, name, avatar_url, role, balance_cents, email)
    VALUES (
      ${input.openid},
      ${input.unionid ?? null},
      ${input.name ?? null},
      ${input.avatarUrl ?? null},
      ${role},
      0,
      NULL
    )
    RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
  `;
  return rows[0] as AppUser;
}

/** Google / email login — one user row ↔ one credits balance. */
export async function upsertGoogleUser(input: {
  email: string;
  googleSub?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<AppUser> {
  const db = getSql();
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error('email required');
  const role = adminGoogleEmails().has(email) ? 'admin' : 'user';

  const bySub = input.googleSub
    ? await db`
        SELECT id, email, name, avatar_url, role, balance_cents, wechat_openid
        FROM users WHERE google_sub = ${input.googleSub} LIMIT 1
      `
    : [];
  if (bySub[0]) {
    const rows = await db`
      UPDATE users SET
        email = COALESCE(email, ${email}),
        name = COALESCE(${input.name ?? null}, name),
        avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url),
        role = CASE WHEN ${role} = 'admin' THEN 'admin' ELSE role END
      WHERE google_sub = ${input.googleSub!}
      RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
    `;
    return rows[0] as AppUser;
  }

  const byEmail = await db`
    SELECT id, email, name, avatar_url, role, balance_cents, wechat_openid
    FROM users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (byEmail[0]) {
    const id = (byEmail[0] as AppUser).id;
    const rows = await db`
      UPDATE users SET
        google_sub = COALESCE(google_sub, ${input.googleSub ?? null}),
        name = COALESCE(${input.name ?? null}, name),
        avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url),
        role = CASE WHEN ${role} = 'admin' THEN 'admin' ELSE role END
      WHERE id = ${id}
      RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
    `;
    return rows[0] as AppUser;
  }

  const rows = await db`
    INSERT INTO users (email, google_sub, name, avatar_url, role, balance_cents)
    VALUES (
      ${email},
      ${input.googleSub ?? null},
      ${input.name ?? null},
      ${input.avatarUrl ?? null},
      ${role},
      0
    )
    RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
  `;
  return rows[0] as AppUser;
}

async function getOrCreateDevAdmin(): Promise<AppUser> {
  const db = getSql();
  const email = 'dev_admin@local';
  const existing = await db`
    SELECT id, email, name, avatar_url, role, balance_cents, wechat_openid
    FROM users WHERE email = ${email} LIMIT 1
  `;
  if (existing[0]) {
    await db`UPDATE users SET role = 'admin', name = COALESCE(name, 'Dev Admin') WHERE email = ${email}`;
    return (await findUserById((existing[0] as AppUser).id)) as AppUser;
  }
  const rows = await db`
    INSERT INTO users (email, name, role, balance_cents)
    VALUES (${email}, 'Dev Admin', 'admin', 0)
    RETURNING id, email, name, avatar_url, role, balance_cents, wechat_openid
  `;
  return rows[0] as AppUser;
}

function WeChatProvider(): OAuthConfig<WeChatProfile> {
  const clientId = process.env.WECHAT_OPEN_APP_ID ?? '';
  const clientSecret = process.env.WECHAT_OPEN_APP_SECRET ?? '';

  return {
    id: 'wechat',
    name: 'WeChat',
    type: 'oauth',
    clientId,
    clientSecret,
    authorization: {
      url: 'https://open.weixin.qq.com/connect/qrconnect',
      params: {
        appid: clientId,
        scope: 'snsapi_login',
        response_type: 'code',
      },
    },
    token: {
      url: 'https://api.weixin.qq.com/sns/oauth2/access_token',
      async request({ params }: WeChatTokenRequestContext) {
        const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
        url.searchParams.set('appid', clientId);
        url.searchParams.set('secret', clientSecret);
        url.searchParams.set('code', String(params.code ?? ''));
        url.searchParams.set('grant_type', 'authorization_code');
        const res = await fetch(url);
        const data = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          openid?: string;
          unionid?: string;
          errcode?: number;
          errmsg?: string;
        };
        if (!data.access_token || !data.openid) {
          throw new Error(data.errmsg || `wechat token failed: ${data.errcode}`);
        }
        return {
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 7200),
            openid: data.openid,
            unionid: data.unionid,
          },
        } as { tokens: Record<string, unknown> };
      },
    },
    userinfo: {
      url: 'https://api.weixin.qq.com/sns/userinfo',
      async request({ tokens }: { tokens: WeChatUserinfoTokens }) {
        const openid = String(tokens.openid ?? '');
        const url = new URL('https://api.weixin.qq.com/sns/userinfo');
        url.searchParams.set('access_token', String(tokens.access_token ?? ''));
        url.searchParams.set('openid', openid);
        const res = await fetch(url);
        const data = (await res.json()) as WeChatProfile;
        if (data.errcode) throw new Error(data.errmsg || 'wechat userinfo failed');
        return { ...data, openid: data.openid || openid };
      },
    },
    profile(profile) {
      return {
        id: profile.openid,
        name: profile.nickname ?? '微信用户',
        image: profile.headimgurl,
        openid: profile.openid,
        unionid: profile.unionid,
      };
    },
    checks: ['state'],
    style: { brandColor: '#07c160' },
  };
}

const providers: Provider[] = [];

if (process.env.WECHAT_OPEN_APP_ID && process.env.WECHAT_OPEN_APP_SECRET) {
  providers.push(WeChatProvider());
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (process.env.AUTH_DEV_PASSWORD) {
  providers.push(
    Credentials({
      id: 'dev',
      name: 'Dev Login',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const password = credentials?.password;
        if (!password || password !== process.env.AUTH_DEV_PASSWORD) return null;
        const user = await getOrCreateDevAdmin();
        return {
          id: user.id,
          name: user.name ?? 'Dev Admin',
          email: user.email,
          image: user.avatar_url,
          role: user.role,
        };
      },
    }),
  );
}

if (providers.length === 0) {
  providers.push(
    Credentials({
      id: 'setup',
      name: 'Configure auth',
      credentials: { password: { label: 'Password', type: 'password' } },
      async authorize() {
        return null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'wechat') {
        const p = profile as WeChatProfile | undefined;
        const openid =
          p?.openid ||
          (user as { openid?: string }).openid ||
          String(user.id ?? '');
        if (!openid) return false;
        const dbUser = await upsertWechatUser({
          openid,
          unionid: p?.unionid ?? null,
          name: p?.nickname ?? user.name ?? null,
          avatarUrl: p?.headimgurl ?? user.image ?? null,
        });
        user.id = dbUser.id;
        (user as { role?: string }).role = dbUser.role;
        return true;
      }
      if (account?.provider === 'google') {
        const email = user.email?.trim();
        if (!email) return false;
        const dbUser = await upsertGoogleUser({
          email,
          googleSub: account.providerAccountId ?? null,
          name: user.name ?? null,
          avatarUrl: user.image ?? null,
        });
        user.id = dbUser.id;
        (user as { role?: string }).role = dbUser.role;
        return true;
      }
      if (account?.provider === 'dev') {
        return true;
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? 'user';
        token.name = user.name;
        token.picture = user.image;
      } else if (token.uid && typeof token.uid === 'string') {
        const fresh = await findUserById(token.uid);
        if (fresh) {
          token.role = fresh.role;
          token.name = fresh.name;
          token.picture = fresh.avatar_url;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? '');
        session.user.role = String(token.role ?? 'user');
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.image = (token.picture as string) ?? session.user.image;
      }
      return session;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});

export async function requireUser(): Promise<AppUser> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    const err = new Error('UNAUTHORIZED');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  const user = await findUserById(id);
  if (!user) {
    const err = new Error('UNAUTHORIZED');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    const err = new Error('FORBIDDEN');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user;
}

export function isAdminUser(user: { role?: string | null; wechat_openid?: string | null }): boolean {
  if (user.role === 'admin') return true;
  if (user.wechat_openid && adminOpenIds().has(user.wechat_openid)) return true;
  return false;
}

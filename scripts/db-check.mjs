import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const url = env.DATABASE_URL;
if (!url) {
  console.error('NO DATABASE_URL');
  process.exit(1);
}

const sql = neon(url);

try {
  const ping = await sql`SELECT 1 as ok`;
  console.log('ping', ping);
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log(
    'tables',
    tables.map((t) => t.table_name),
  );
  const users = await sql`SELECT count(*)::int as c FROM users`.catch((e) => ({ error: e.message }));
  console.log('users', users);
} catch (e) {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
}

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

const sql = neon(env.DATABASE_URL);
const schema = readFileSync('db/migrate_auth_recharge.sql', 'utf8');

const parts = schema
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter((s) => s.length > 0);

for (const stmt of parts) {
  const q = stmt.endsWith(';') ? stmt : `${stmt};`;
  try {
    await sql.query(q);
    console.log('OK', q.slice(0, 70).replace(/\s+/g, ' '), '…');
  } catch (e) {
    console.error('FAIL', q.slice(0, 100).replace(/\s+/g, ' '));
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

console.log('migrate_auth_recharge done');

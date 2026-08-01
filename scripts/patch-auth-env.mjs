import { readFileSync, writeFileSync } from 'fs';

const path = '.env.local';
let t = readFileSync(path, 'utf8');
const lines = [
  'AUTH_SECRET=dev-auth-secret-change-me-please-32chars',
  'AUTH_DEV_PASSWORD=devadmin',
  'AUTH_URL=http://localhost:3000',
  'PAYMENT_MODE=manual_qr',
];
for (const line of lines) {
  const key = line.split('=')[0];
  if (!new RegExp(`^${key}=`, 'm').test(t)) {
    t += `\n${line}`;
  }
}
writeFileSync(path, t.endsWith('\n') ? t : `${t}\n`);
console.log('patched auth env keys if missing');

# OneTrue AI

MVP：Vercel + Neon + R2 + **RunPod Serverless** + **积分预付（个人码人工确认）**。

## 积分与登录

- 1 积分 = ¥0.01；先登录、先充值再生成
- 微信扫码登录（开放平台）或本地 `AUTH_DEV_PASSWORD`
- `/credits` 个人收款码 + 备注码 → 管理员 `/admin/recharges` 确认入账
- 企业微信群机器人提醒（`WECOM_WEBHOOK_URL`）

详见 [docs/USERS.md](docs/USERS.md)、[docs/CREDITS.md](docs/CREDITS.md)

## 本地

```bash
cp .env.example .env.local
npm install
node scripts/apply-schema.mjs
node scripts/apply-auth-recharge.mjs
npm run dev
```

1. 打开 `/login`（开发密码见 `AUTH_DEV_PASSWORD`）
2. `/credits` 下单并申报「我已支付」
3. `/admin/recharges` 确认入账
4. 回首页生成

默认 GPU 单价：**24GB $0.69/hr**。

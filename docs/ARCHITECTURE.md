# OneTrue AI — Architecture (locked MVP)

## Runtime

- **Vercel** — Next.js app, API
- **Neon Postgres** — wallet/users, ledger, templates
- **Cloudflare R2** — uploads + outputs（后期）
- **RunPod Serverless** — ComfyUI worker，`activeWorkers=0`
- **支付** — 开发期 **积分预付**；易支付代码保留，`PAYMENT_MODE=credits` 时不走

## 资金流

1. 用户先在 `/credits` 充值积分（开发期模拟到账）
2. 生成前按报价扣积分；提交失败退回
3. RunPod 侧请自设 Daily Spend Limit

## Billing

参照 RunPod 价目：默认 **24GB $0.69/hr**（非 PRO $1.10）。  
售价 =（GPU 成本×汇率 + 预留手续费）×2，1 积分 = ¥0.01。

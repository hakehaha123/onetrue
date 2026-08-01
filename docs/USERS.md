# 用户体系与人工充值（B 方案）

## 登录

- Auth.js（next-auth v5）+ **微信开放平台网站应用扫码登录**
- 本地可用 `AUTH_DEV_PASSWORD` 开发登录（自动建 `dev_admin@local` 管理员）
- 积分绑定登录用户，不再使用可伪造的 `fvs_wallet_id` Cookie
- 管理员：`users.role = admin`，或 `ADMIN_WECHAT_OPENIDS` 白名单

## 充值（个人码 + 人工确认）

1. 登录用户选套餐 → 生成备注码订单（30 分钟有效）
2. 按金额转账到个人微信/支付宝，**备注填备注码**
3. 用户点「我已支付」→ 状态 `claimed` → 企业微信机器人提醒
4. 管理员打开 `/admin/recharges`，核对账单后确认 → 积分入账

零通道费；用户可能等待数小时。不做易支付/虎皮椒自动入账。

## 迁移

```bash
node scripts/apply-auth-recharge.mjs
```

## 环境变量（关键）

见 `.env.example`：`AUTH_SECRET`、`WECHAT_OPEN_*`、`PAY_QR_*`、`WECOM_WEBHOOK_URL`、`AUTH_DEV_PASSWORD`。

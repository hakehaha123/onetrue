# 闲置费用 & 提示词翻译

## 闲置会不会产生费用？

**正常配置下，没有生成请求 ≈ 不产生 GPU 费用。**

| 组件 | 闲置 |
|------|------|
| RunPod Serverless `activeWorkers=0` | **$0**（无 Worker） |
| Vercel / Neon / R2 免费档 | 基本 $0（超额才收费） |
| DeepLX 翻译 | 仅调用时耗 Vercel 函数时间，**无 GPU** |

注意：若把 `activeWorkers`/`min workers` 设成 ≥1，或 Idle Timeout 很长且刚跑完任务，会短暂有 GPU 费。

## 翻译方案

采用 **DeepLX（你提的）跑在 Vercel 侧调用**：

1. 检测是否含汉字（`\u4e00-\u9fff` 等）  
2. **有中文** → DeepLX `ZH→EN`，再交给 Flux  
3. **无中文（纯英文）** → 不翻译  

环境变量：`DEEPLX_API_URL`（服务根地址或 `.../translate`）。

### 其它可选（未接）

| 方案 | 说明 |
|------|------|
| 腾讯/百度/火山翻译 | 国内稳、要密钥与实名，上线可换 |
| DeepL 官方 API | 质量高，需付费 Key |
| 浏览器端免费接口 | 不稳定、易被墙，不推荐生产 |

## 部署到自己的 Vercel？

**可以**，但建议是**单独一个 Vercel 项目**，不要和 `fashion-video-studio` 混在一个仓库里（DeepLX 是独立 Serverless/Go 包装）。

推荐一键模板：[xjasonlyu/vercel-deeplx](https://github.com/xjasonlyu/vercel-deeplx)

1. 用 Vercel 导入/Deploy 该仓库  
2.（可选）设环境变量 `TOKEN`，防别人白嫖你的翻译接口  
3. 部署完成后得到 `https://xxx.vercel.app`  
4. 在本项目 `.env.local`：

```env
DEEPLX_API_URL=https://xxx.vercel.app
DEEPLX_TOKEN=你设的TOKEN
```

本平台通过 `/api/translate` 服务端去调它（Token 不暴露给浏览器）。

docs/TRANSLATE.md

## 500 排查清单

1. **改完 `.env.local` 必须重启** `npm run dev`（否则读不到 `DEEPLX_API_URL`）
2. DeepLX 项目环境变量名是 **`TOKEN`**（不是 DEEPLX_TOKEN）
3. 本项目 `DEEPLX_TOKEN` = DeepLX 的 `TOKEN`；**或两边都留空**
4. `DEEPLX_API_URL` 用部署域名，例如 `https://deeplx-five-swart.vercel.app`（不要多写路径也行，代码会补 `/translate`）
5. 浏览器 F12 → Network → `/api/translate` → 看响应里的 `error` 原文

## fetch failed 是什么？

浏览器能打开 DeepLX，但 **本机 Next.js（Node）连不上** `*.vercel.app` 时，会报 `fetch failed`（和 GET/POST、TOKEN 无关）。国内网络/IPv6 上较常见。

本项目已做：

1. DNS **IPv4 优先**  
2. DeepLX 失败时 **自动回退 MyMemory**（开发够用；可关：`TRANSLATE_FALLBACK=false`）

生产环境若把主站也部署在 Vercel，服务器访问 DeepLX 通常比你家宽带更稳。

临时也可：`TRANSLATE_PROVIDER=mymemory` 完全不走 DeepLX。

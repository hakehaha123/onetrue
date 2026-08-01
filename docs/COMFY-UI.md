# ComfyUI 调参界面：方案对比

## 结论：**选方案一**

把「节点/参数编辑」放在 Vercel（或静态站）上，**只在 Queue 时**把 workflow JSON 发给 RunPod Serverless。

| | 方案一（推荐） | 方案二 |
|--|----------------|--------|
| 调参成本 | ≈ $0（无 GPU） | 需常驻 CPU ComfyUI，仍有小额/运维成本 |
| 工程量 | 中：自研简易编辑器或参数表 + JSON | 高：魔改 ComfyUI 执行链路 |
| 体验 | 参数表 / 轻量节点 UI 足够 MVP | 原汁原味 ComfyUI，但难维护 |
| 与现有架构 | 已对齐（`/workflow` + `/api/generate/txt2img`） | 另起一套常驻服务 |

方案二适合以后「专业用户要完整节点图」再做；MVP 不要上。

## 本项目已落地

- 首页按钮 **打开工作流调参** → `/workflow`
- 浏览器改 prompt / 尺寸 / steps / guidance / seed，可编辑 API JSON
- 点「开始生成」才扣积分并唤醒 GPU
- 出图写入 **R2** `output/{job_id}.png`

## 后续可增强

- 嵌入开源 ComfyUI 前端（纯静态）+ 自定义 backend adapter  
- 模板市场：保存用户 workflow JSON 到 Neon

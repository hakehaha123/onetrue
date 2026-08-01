# RunPod Serverless

## LTX 视频 Worker（MVP）

镜像源码：`docker/worker-comfyui-ltx/Dockerfile`（只 bake 节点，不 bake 大模型；冷启动再下权重）。

### 用 GitHub 构建并部署（推荐）

1. 把本仓库推到 GitHub（含上述 Dockerfile）。
2. RunPod Console → **Serverless** → **New Endpoint** → **Start from GitHub Repo**。
3. 选仓库与分支；**Dockerfile Path** 填 `docker/worker-comfyui-ltx/Dockerfile`；**Context Path** 填 `docker/worker-comfyui-ltx`（或按控制台要求填 `/` 并保证能找到该 Dockerfile）。
4. Endpoint 建议：
   - Active Workers = **0**
   - Max Workers: 2～3
   - Idle Timeout: 120～300s（便于热复用已下载模型）
   - Flash Boot: 开
   - **不挂** Network Volume
   - Container Disk: **100GB**（LTX-2.3 四套权重约 64GB，需留余量）
   - GPU: 24GB 起（`video_24`）；完整 Gemma BF16 更吃显存，不够用 48GB（`video_48`）
   - Environment Variables：
     - `HF_TOKEN` = 你的 Hugging Face token（**只配在 RunPod 控制台，不要写进 Dockerfile/脚本**）
5. 冷启动时 `start_with_models.sh` 会按需把缺失权重拉到 `/comfyui/models/...`，再启动 Comfy。
6. 部署完成后把 Endpoint ID 写入应用环境变量：
   - `RUNPOD_ENDPOINT_VIDEO_24=...`
   - 可选 `RUNPOD_ENDPOINT_VIDEO_48=...`

本地也可先构建再推 Docker Hub，再在 Template 里填镜像名：

```bash
cd docker/worker-comfyui-ltx
docker build --platform linux/amd64 -t YOUR_USER/worker-comfyui-ltx:v1 .
docker push YOUR_USER/worker-comfyui-ltx:v1
```

## Endpoint 配置建议

- Template: `runpod/worker-comfyui`（或你的衍生镜像）
- **Active Workers = 0**
- Max Workers: 按并发上限（如 2～3）
- **Idle Timeout**: 稀疏流量 5～30s；成簇流量可 120～300s（空闲仍计 GPU 费）
- Flash Boot: 开
- **Network Volume: MVP 不挂**

## 按需模型

Worker 启动脚本 / workflow 依赖：

1. 检查本地是否已有权重  
2. 无则 `aria2c` 从 HF / R2 拉取  
3. 热窗口内后续请求跳过下载  

冷启动秒数写入模板 `est_seconds_cold`。

## 显存「动态扩容」？

**同一次 job 不能热扩容显存。**  
做法是多 Endpoint + 路由：

| `gpu_tier` | RunPod GPU 选择 | Env |
|------------|-----------------|-----|
| `24gb` | RTX 4090 24GB 等 | `RUNPOD_ENDPOINT_IMAGE_24` / `RUNPOD_ENDPOINT_VIDEO_24` |
| `48gb` | A6000 / L40 等 | `RUNPOD_ENDPOINT_VIDEO_48` |

下单默认用模板的 `gpu_tier`；可选 `gpu_tier` 覆盖（差价在报价里体现）。

## API（本项目封装）

- `src/lib/runpod.ts` — `submitJob` / `getJobStatus`
- Cron: `POST /api/internal/worker/tick` 扫 `queued` 并提交、回写 `running|completed|failed`

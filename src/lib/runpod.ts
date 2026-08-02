export type RunpodJobStatus = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
  delayTime?: number;
  executionTime?: number;
  output?: Record<string, unknown> & {
    images?: Array<string | { data?: string; url?: string; type?: string }>;
    videos?: Array<string | { data?: string; url?: string; type?: string; filename?: string }>;
    files?: Array<string | { data?: string; url?: string; type?: string; filename?: string }>;
    message?: string;
    type?: string;
    value?: number;
    max?: number;
    percent?: number;
    node?: string;
    progress?: number | { value?: number; max?: number; percent?: number };
  };
  error?: string;
};

function endpointIdForKey(key: string): string {
  const map: Record<string, string | undefined> = {
    image_24: process.env.RUNPOD_ENDPOINT_IMAGE_24,
    video_24: process.env.RUNPOD_ENDPOINT_VIDEO_24,
    video_48: process.env.RUNPOD_ENDPOINT_VIDEO_48,
  };
  const id = map[key]?.trim();
  if (!id) throw new Error(`RunPod endpoint not configured for key=${key}`);
  return id;
}

function apiKey(): string {
  const key = process.env.RUNPOD_API_KEY?.trim();
  if (!key) throw new Error('RUNPOD_API_KEY is not set');
  return key;
}

/**
 * Official worker-comfyui body:
 * { input: { workflow: {...}, images?: [...] } }
 */
export async function submitComfyWorkflow(input: {
  endpointKey: string;
  workflow: Record<string, unknown>;
  images?: Array<{ name: string; image: string }>;
}): Promise<{ jobId: string }> {
  const endpointId = endpointIdForKey(input.endpointKey);
  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        workflow: input.workflow,
        ...(input.images?.length ? { images: input.images } : {}),
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod submit failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return { jobId: data.id };
}

export async function getJobStatus(endpointKey: string, jobId: string): Promise<RunpodJobStatus> {
  const endpointId = endpointIdForKey(endpointKey);
  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod status failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunpodJobStatus;
}

function asMediaUrl(
  item: string | { data?: string; url?: string; filename?: string } | undefined,
  fallbackMime: string,
): string | null {
  if (!item) return null;
  if (typeof item === 'string') {
    if (item.startsWith('http') || item.startsWith('data:')) return item;
    return `data:${fallbackMime};base64,${item}`;
  }
  if (item.url) return item.url;
  if (item.data) {
    if (item.data.startsWith('data:')) return item.data;
    const name = (item.filename || '').toLowerCase();
    const mime = name.endsWith('.webm')
      ? 'video/webm'
      : name.endsWith('.gif')
        ? 'image/gif'
        : fallbackMime;
    return `data:${mime};base64,${item.data}`;
  }
  return null;
}

/** Extract first image as data URL or remote URL from worker output */
export function extractOutputImage(status: RunpodJobStatus): string | null {
  const out = status.output as Record<string, unknown> | undefined;
  if (!out) return null;

  const images = out.images;
  if (Array.isArray(images) && images.length) {
    return asMediaUrl(images[0] as string | { data?: string; url?: string }, 'image/png');
  }

  // some workers nest under output.result / output.image
  for (const key of ['image', 'result', 'url'] as const) {
    const v = out[key];
    if (typeof v === 'string' && v.length > 32) {
      if (v.startsWith('http') || v.startsWith('data:')) return v;
      return `data:image/png;base64,${v}`;
    }
  }
  return null;
}

/** Extract first video (mp4/webm) from worker-comfyui output */
export function extractOutputVideo(status: RunpodJobStatus): string | null {
  const out = status.output as Record<string, unknown> | undefined;
  if (!out) return null;

  for (const key of ['videos', 'files', 'images'] as const) {
    const arr = out[key];
    if (!Array.isArray(arr) || !arr.length) continue;
    for (const item of arr) {
      if (typeof item === 'string') {
        const lower = item.slice(0, 40).toLowerCase();
        if (
          item.startsWith('data:video') ||
          lower.includes('video') ||
          item.endsWith('.mp4') ||
          item.endsWith('.webm')
        ) {
          return asMediaUrl(item, 'video/mp4');
        }
        // images array sometimes carries mp4 base64 without prefix
        if (key === 'videos') return asMediaUrl(item, 'video/mp4');
      } else if (item && typeof item === 'object') {
        const rec = item as { data?: string; url?: string; type?: string; filename?: string };
        const name = `${rec.filename || ''} ${rec.type || ''} ${rec.url || ''}`.toLowerCase();
        if (
          key === 'videos' ||
          name.includes('.mp4') ||
          name.includes('.webm') ||
          name.includes('video')
        ) {
          const url = asMediaUrl(rec, 'video/mp4');
          if (url) return url;
        }
      }
    }
  }

  for (const key of ['video', 'result', 'url'] as const) {
    const v = out[key];
    if (typeof v === 'string' && v.length > 32) {
      if (v.startsWith('http') || v.startsWith('data:video')) return v;
      if (key === 'video') return `data:video/mp4;base64,${v}`;
    }
  }
  return null;
}

export type GenerationProgress = {
  /** 0–100 */
  percent: number;
  /** true when from worker sampler progress */
  exact: boolean;
  stage: 'queued' | 'running' | 'done' | 'failed' | 'unknown';
  detail?: string;
};

/** Pull progress from RunPod status (worker-comfyui progress_update or soft stage). */
export function extractProgress(status: RunpodJobStatus): GenerationProgress {
  const s = (status.status || '').toUpperCase();
  if (s === 'COMPLETED') {
    return { percent: 100, exact: true, stage: 'done' };
  }
  if (s === 'FAILED') {
    return { percent: 100, exact: true, stage: 'failed', detail: status.error };
  }
  if (s === 'IN_QUEUE' || s === 'QUEUED') {
    return { percent: 8, exact: false, stage: 'queued' };
  }

  const out = status.output;
  if (out && typeof out === 'object') {
    // Normalised worker-comfyui payload
    if (typeof out.percent === 'number' && Number.isFinite(out.percent)) {
      const p = Math.min(99, Math.max(0, out.percent));
      return {
        percent: Math.round(p),
        exact: true,
        stage: 'running',
        detail:
          typeof out.value === 'number' && typeof out.max === 'number'
            ? `${out.value}/${out.max}`
            : undefined,
      };
    }
    if (typeof out.value === 'number' && typeof out.max === 'number' && out.max > 0) {
      const p = Math.min(99, Math.round((out.value / out.max) * 100));
      return { percent: p, exact: true, stage: 'running', detail: `${out.value}/${out.max}` };
    }
    const nested = out.progress;
    if (typeof nested === 'number' && Number.isFinite(nested)) {
      return { percent: Math.min(99, Math.max(0, Math.round(nested))), exact: true, stage: 'running' };
    }
    if (nested && typeof nested === 'object') {
      if (typeof nested.percent === 'number') {
        return {
          percent: Math.min(99, Math.max(0, Math.round(nested.percent))),
          exact: true,
          stage: 'running',
        };
      }
      if (typeof nested.value === 'number' && typeof nested.max === 'number' && nested.max > 0) {
        return {
          percent: Math.min(99, Math.round((nested.value / nested.max) * 100)),
          exact: true,
          stage: 'running',
          detail: `${nested.value}/${nested.max}`,
        };
      }
    }
  }

  // Soft estimate while IN_PROGRESS without sampler progress
  if (s === 'IN_PROGRESS') {
    return { percent: 35, exact: false, stage: 'running' };
  }
  return { percent: 5, exact: false, stage: 'unknown' };
}


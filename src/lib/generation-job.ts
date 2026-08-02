/**
 * Persist in-flight generation jobs so image/video studios can resume polling
 * after refresh or brief network blips.
 *
 * Use a unique `scope` per UI surface, e.g.:
 *   - flux-txt2img
 *   - ltx-txt2vid
 * Future endpoints: pick a new scope and reuse read/write + useGenerationPoll.
 */

export type ActiveGenerationJob = {
  jobId: string;
  endpointKey: string;
  startedAt: number;
  etaSec: number;
  kind?: 'image' | 'video';
};

export function activeJobStorageKey(scope: string): string {
  return `fvs.gen.activeJob.${scope}`;
}

export function readActiveJob(scope: string): ActiveGenerationJob | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(activeJobStorageKey(scope));
    if (!raw) return null;
    const j = JSON.parse(raw) as ActiveGenerationJob;
    if (!j?.jobId || !j?.endpointKey) return null;
    return j;
  } catch {
    return null;
  }
}

export function writeActiveJob(scope: string, job: ActiveGenerationJob | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = activeJobStorageKey(scope);
    if (!job) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(job));
  } catch {
    /* private mode / quota */
  }
}

export type GenerationStatusPayload = {
  status?: string;
  video_url?: string | null;
  image_url?: string | null;
  storage?: string | null;
  ephemeral?: boolean;
  error?: string | null;
  progress?: { percent?: number; exact?: boolean; stage?: string };
};

export function progressLabelForStatus(
  status: string,
  stage: string | undefined,
  labels: { queued: string; running: string; done: string; generating: string },
): string {
  const s = (status || '').toUpperCase();
  if (s === 'IN_QUEUE' || stage === 'queued') return labels.queued;
  if (s === 'IN_PROGRESS' || stage === 'running') return labels.running;
  if (s === 'COMPLETED' || stage === 'done') return labels.done;
  return labels.generating;
}

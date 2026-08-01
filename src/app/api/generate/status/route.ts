import { NextRequest, NextResponse } from 'next/server';
import { extractOutputImage, extractProgress, getJobStatus } from '@/lib/runpod';
import { putGeneratedImage } from '@/lib/r2';

export const dynamic = 'force-dynamic';

/**
 * Default: return RunPod base64 / data URL only (ephemeral — user downloads locally).
 * Set SAVE_OUTPUT_TO_R2=true only if you explicitly want platform-side archive.
 */
export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('job_id');
    const endpointKey = req.nextUrl.searchParams.get('endpoint_key') || 'image_24';
    const startedAt = Number(req.nextUrl.searchParams.get('started_at') || 0);
    const etaSec = Number(req.nextUrl.searchParams.get('eta_sec') || 120);

    if (!jobId) {
      return NextResponse.json({ error: 'job_id required' }, { status: 400 });
    }

    const status = await getJobStatus(endpointKey, jobId);
    let imageUrl = extractOutputImage(status);
    let stored: string | null = null;
    const saveToR2 = process.env.SAVE_OUTPUT_TO_R2 === 'true';

    if (
      saveToR2 &&
      status.status === 'COMPLETED' &&
      imageUrl &&
      !imageUrl.startsWith('http')
    ) {
      try {
        const saved = await putGeneratedImage({ jobId, dataUrlOrBase64: imageUrl });
        stored = saved.publicUrl;
        imageUrl = saved.publicUrl;
      } catch (e) {
        console.error('R2 persist failed', e instanceof Error ? e.message : e);
      }
    }

    let progress = extractProgress(status);

    // Soft time-based ramp when worker does not expose sampler percent
    if (!progress.exact && progress.stage === 'running' && startedAt > 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const eta = Math.max(30, etaSec);
      // 15% → 92% over eta, never finish until COMPLETED
      const soft = 15 + Math.min(77, (elapsed / eta) * 77);
      progress = {
        ...progress,
        percent: Math.round(Math.max(progress.percent, soft)),
        exact: false,
      };
    } else if (!progress.exact && progress.stage === 'queued' && startedAt > 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const soft = Math.min(18, 5 + elapsed * 0.4);
      progress = { ...progress, percent: Math.round(soft), exact: false };
    }

    return NextResponse.json({
      job_id: status.id || jobId,
      status: status.status,
      image_url: imageUrl,
      stored_url: stored,
      storage: stored ? 'r2' : imageUrl?.startsWith('http') ? 'remote' : imageUrl ? 'ephemeral' : null,
      ephemeral: !stored,
      progress,
      error: status.error ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { extractOutputImage, extractOutputVideo, extractProgress, getJobStatus } from '@/lib/runpod';
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
    const kind = req.nextUrl.searchParams.get('kind') || 'image';

    if (!jobId) {
      return NextResponse.json({ error: 'job_id required' }, { status: 400 });
    }

    const status = await getJobStatus(endpointKey, jobId);
    const videoUrl = kind === 'video' ? extractOutputVideo(status) : null;
    let imageUrl = kind === 'video' ? null : extractOutputImage(status);
    // Fallback: some workers only put mp4 under images
    const mediaUrl = videoUrl || (kind === 'video' ? extractOutputImage(status) : imageUrl);
    if (kind === 'video') imageUrl = null;

    let stored: string | null = null;
    const saveToR2 = process.env.SAVE_OUTPUT_TO_R2 === 'true';

    if (
      saveToR2 &&
      status.status === 'COMPLETED' &&
      mediaUrl &&
      !mediaUrl.startsWith('http') &&
      kind !== 'video'
    ) {
      try {
        const saved = await putGeneratedImage({ jobId, dataUrlOrBase64: mediaUrl });
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
      // 12% → 92% over eta, never finish until COMPLETED
      const soft = 12 + Math.min(80, (elapsed / eta) * 80);
      progress = {
        ...progress,
        percent: Math.round(Math.max(progress.percent, soft)),
        exact: false,
      };
    } else if (!progress.exact && progress.stage === 'queued' && startedAt > 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      // Video cold start can sit in queue+download longer
      const cap = kind === 'video' ? 28 : 18;
      const soft = Math.min(cap, 4 + elapsed * (kind === 'video' ? 0.15 : 0.4));
      progress = { ...progress, percent: Math.round(soft), exact: false };
    }

    return NextResponse.json({
      job_id: status.id || jobId,
      status: status.status,
      image_url: kind === 'video' ? null : imageUrl || mediaUrl,
      video_url: kind === 'video' ? mediaUrl : videoUrl,
      stored_url: stored,
      storage: stored
        ? 'r2'
        : mediaUrl?.startsWith('http')
          ? 'remote'
          : mediaUrl
            ? 'ephemeral'
            : null,
      ephemeral: !stored,
      progress,
      error: status.error ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

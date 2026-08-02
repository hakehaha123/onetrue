import { NextRequest, NextResponse } from 'next/server';
import { buildLtxTxt2VidWorkflow } from '@/lib/ltx-workflow';
import { submitComfyWorkflow } from '@/lib/runpod';
import { ltxAlignFrames, quoteLtxTxt2Vid, type GpuTier } from '@/lib/quote';
import { debitWallet, refundWallet } from '@/lib/wallet';
import { requireUser } from '@/lib/auth';
import { pointsToCny } from '@/lib/credits';
import { translateZhToEnIfNeeded } from '@/lib/translate';

export const maxDuration = 60;

/**
 * LTX-2.3 single-stage distilled T2V (optional I2V later).
 * Uses RUNPOD_ENDPOINT_VIDEO_24 / VIDEO_48.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      negative_prompt?: string;
      width?: number;
      height?: number;
      frames?: number;
      fps?: number;
      steps?: number;
      seed?: number;
      gpu_tier?: GpuTier;
      skip_translate?: boolean;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }
    if (prompt.length > 4000) {
      return NextResponse.json({ error: 'prompt too long' }, { status: 400 });
    }

    let promptEn = prompt;
    let promptMeta: {
      original?: string;
      prompt_en?: string;
      translated?: boolean;
      skipped?: boolean;
    } = {};

    if (!body.skip_translate) {
      const tr = await translateZhToEnIfNeeded(prompt);
      promptEn = tr.text;
      promptMeta = {
        original: prompt,
        prompt_en: promptEn,
        translated: tr.translated,
        skipped: tr.skipped,
      };
    } else {
      promptMeta = { original: prompt, prompt_en: prompt, translated: false, skipped: true };
    }

    const gpuTier: GpuTier = body.gpu_tier === '48gb' ? '48gb' : '24gb';
    const fps = body.fps ?? 24;
    const frames = ltxAlignFrames(body.frames ?? fps * 5 + 1);
    const width = body.width ?? 960;
    const height = body.height ?? 544;
    const quote = quoteLtxTxt2Vid({
      billingPath: 'cold',
      gpuTier,
      frames,
      fps,
      width,
      height,
    });

    let wallet;
    try {
      wallet = await requireUser();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) {
        return NextResponse.json({ error: 'login_required', message: '请先登录' }, { status: 401 });
      }
      throw e;
    }

    const debited = await debitWallet({
      userId: wallet.id,
      points: quote.points,
      reason: 'ltx_txt2vid',
    });
    if (!debited.ok) {
      return NextResponse.json(
        {
          error: 'insufficient_credits',
          code: 'insufficient_credits',
          need_points: quote.points,
          need_cny: pointsToCny(quote.points),
          balance_points: debited.balance,
        },
        { status: 402 },
      );
    }

    const workflow = buildLtxTxt2VidWorkflow({
      prompt: promptEn,
      negativePrompt: body.negative_prompt,
      width,
      height,
      frames,
      fps,
      steps: body.steps,
      seed: body.seed,
      bypassI2v: true,
    });

    try {
      const { jobId } = await submitComfyWorkflow({
        endpointKey: quote.endpointKey,
        workflow,
      });

      return NextResponse.json({
        job_id: jobId,
        endpoint_key: quote.endpointKey,
        status: 'IN_QUEUE',
        charged_points: quote.points,
        charged_cny: pointsToCny(quote.points),
        balance_points: debited.balance,
        prompt: promptMeta,
        quote: {
          rate_usd_hr: quote.rateUsdHr,
          t_bill_est_sec: quote.tBillEstSec,
          cost_gpu_usd: quote.cGpuUsd,
          gpu_tier: quote.gpuTier,
          duration_sec: quote.durationSec,
          frames: quote.frames,
          fps: quote.fps,
        },
      });
    } catch (e) {
      await refundWallet({
        userId: wallet.id,
        points: quote.points,
        reason: 'ltx_submit_fail',
      });
      throw e;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { buildFluxTxt2ImgWorkflow } from '@/lib/flux-workflow';
import { submitComfyWorkflow } from '@/lib/runpod';
import { quoteFluxTxt2Img } from '@/lib/quote';
import { debitWallet, refundWallet } from '@/lib/wallet';
import { requireUser } from '@/lib/auth';
import { pointsToCny } from '@/lib/credits';
import { translateWorkflowPromptIfNeeded, translateZhToEnIfNeeded } from '@/lib/translate';

export const maxDuration = 60;

/**
 * Accept either simplified params OR a full ComfyUI API workflow JSON.
 * Chinese prompts are translated ZH→EN via DeepLX on Vercel before RunPod.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      negative_prompt?: string;
      width?: number;
      height?: number;
      steps?: number;
      guidance?: number;
      seed?: number;
      workflow?: Record<string, unknown>;
      /** if true, skip auto-translate (already English / user handled) */
      skip_translate?: boolean;
    };

    let workflow = body.workflow;
    let steps = body.steps ?? 20;
    let promptMeta: {
      original?: string;
      prompt_en?: string;
      translated?: boolean;
      skipped?: boolean;
    } = {};

    if (workflow) {
      const sampler = workflow['31'] as { inputs?: { steps?: number } } | undefined;
      if (sampler?.inputs?.steps) steps = Number(sampler.inputs.steps) || steps;

      if (!body.skip_translate) {
        const { workflow: wf, translation } = await translateWorkflowPromptIfNeeded(workflow);
        workflow = wf;
        if (translation) {
          promptMeta = {
            original: (body.workflow?.['6'] as { inputs?: { text?: string } })?.inputs?.text,
            prompt_en: translation.text,
            translated: translation.translated,
            skipped: translation.skipped,
          };
        }
      }
    } else {
      const prompt = body.prompt?.trim();
      if (!prompt) {
        return NextResponse.json({ error: 'prompt or workflow required' }, { status: 400 });
      }
      if (prompt.length > 2000) {
        return NextResponse.json({ error: 'prompt too long' }, { status: 400 });
      }

      let promptEn = prompt;
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

      workflow = buildFluxTxt2ImgWorkflow({
        prompt: promptEn,
        negativePrompt: body.negative_prompt,
        width: body.width,
        height: body.height,
        steps: body.steps,
        guidance: body.guidance,
        seed: body.seed,
        ckptName: process.env.FLUX_CKPT_NAME || undefined,
      });
    }

    const quote = quoteFluxTxt2Img({ steps, billingPath: 'cold', gpuTier: '24gb' });
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
      reason: 'flux_txt2img',
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

    try {
      const { jobId } = await submitComfyWorkflow({
        endpointKey: 'image_24',
        workflow,
      });

      return NextResponse.json({
        job_id: jobId,
        endpoint_key: 'image_24',
        status: 'IN_QUEUE',
        charged_points: quote.points,
        charged_cny: pointsToCny(quote.points),
        balance_points: debited.balance,
        prompt: promptMeta,
        quote: {
          rate_usd_hr: quote.rateUsdHr,
          t_bill_est_sec: quote.tBillEstSec,
          cost_gpu_usd: quote.cGpuUsd,
        },
      });
    } catch (e) {
      await refundWallet({
        userId: wallet.id,
        points: quote.points,
        reason: 'flux_submit_fail',
      });
      throw e;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

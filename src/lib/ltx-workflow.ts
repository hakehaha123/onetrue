import baseWorkflow from '@/workflows/ltx-2.3-t2v.api.json';

export type LtxTxt2VidParams = {
  prompt: string;
  negativePrompt?: string;
  /** Frame count (8n+1). Default 121 ≈ 5s @ 24fps */
  frames?: number;
  width?: number;
  height?: number;
  fps?: number;
  steps?: number;
  seed?: number;
  /** Keep true for text-to-video (default) */
  bypassI2v?: boolean;
};

type WorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
};

/** Official LTX-2.3 single-stage distilled full workflow (API format), prompt-patched. */
export function buildLtxTxt2VidWorkflow(params: LtxTxt2VidParams): Record<string, WorkflowNode> {
  const workflow = structuredClone(baseWorkflow) as Record<string, WorkflowNode>;

  const frames = alignFrames(params.frames ?? 121);
  const width = clampEven(params.width ?? 960, 512, 1280);
  const height = clampEven(params.height ?? 544, 512, 768);
  const fps = clamp(params.fps ?? 24, 8, 30);
  const steps = clamp(params.steps ?? 15, 4, 40);
  const seed =
    params.seed != null && Number.isFinite(params.seed)
      ? Math.floor(params.seed)
      : Math.floor(Math.random() * 1_000_000_000);
  const bypassI2v = params.bypassI2v !== false;

  // Positive / negative prompts
  if (workflow['2483']) workflow['2483'].inputs.text = params.prompt.trim();
  if (workflow['2612']) {
    workflow['2612'].inputs.text = (
      params.negativePrompt ?? 'pc game, console game, video game, cartoon, childish, ugly'
    ).trim();
  }

  // Resolution
  if (workflow['3059']) {
    workflow['3059'].inputs.width = width;
    workflow['3059'].inputs.height = height;
    workflow['3059'].inputs.batch_size = 1;
  }

  // Frames + fps primitives
  if (workflow['4979']) workflow['4979'].inputs.value = frames;
  if (workflow['4978']) workflow['4978'].inputs.value = fps;

  // Scheduler steps
  if (workflow['4966']) workflow['4966'].inputs.steps = steps;

  // T2V bypass
  if (workflow['4977']) workflow['4977'].inputs.value = bypassI2v;

  // Seeds
  if (workflow['4967']) workflow['4967'].inputs.seed = seed;
  if (workflow['4814']) workflow['4814'].inputs.noise_seed = seed;
  if (workflow['4832']) workflow['4832'].inputs.noise_seed = seed + 1;

  // ResizeImageMaskNode uses ComfyUI DynamicCombo — subfields must be dotted keys.
  if (workflow['4981']) {
    const n = workflow['4981'].inputs;
    n.scale_method = n.scale_method ?? 'lanczos';
    n.resize_type = n.resize_type ?? 'scale longer dimension';
    const longer =
      n['resize_type.longer_size'] ?? n.longer_size ?? n.largest_side ?? 1536;
    n['resize_type.longer_size'] = longer;
    delete n.longer_size;
    delete n.largest_side;
  }

  // Align LTXVTiledVAEDecode to current ComfyUI-LTXVideo INPUT_TYPES
  for (const id of ['4982', '4983'] as const) {
    const n = workflow[id]?.inputs;
    if (!n) continue;
    if (n.horizontal != null && n.horizontal_tiles == null) n.horizontal_tiles = n.horizontal;
    if (n.vertical != null && n.vertical_tiles == null) n.vertical_tiles = n.vertical;
    n.horizontal_tiles = n.horizontal_tiles ?? 2;
    n.vertical_tiles = n.vertical_tiles ?? 2;
    n.overlap = n.overlap ?? 1;
    n.last_frame_fix = n.last_frame_fix ?? false;
    delete n.horizontal;
    delete n.vertical;
    delete n.frames;
    delete n.cpu_vae;
    delete n.temporal_mode;
    delete n.spatial_mode;
  }

  return workflow;
}

function alignFrames(n: number): number {
  // LTX expects 8k+1
  const x = Math.max(9, Math.min(241, Math.round(n)));
  return Math.floor((x - 1) / 8) * 8 + 1;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampEven(n: number, min: number, max: number) {
  let v = clamp(n, min, max);
  if (v % 2) v += 1;
  return v;
}

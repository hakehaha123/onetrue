import baseWorkflow from '@/workflows/flux-txt2img.api.json';

export type FluxTxt2ImgParams = {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  /** Override if your endpoint uses a different checkpoint filename */
  ckptName?: string;
};

type WorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
};

export function buildFluxTxt2ImgWorkflow(params: FluxTxt2ImgParams): Record<string, WorkflowNode> {
  const workflow = structuredClone(baseWorkflow) as Record<string, WorkflowNode>;
  const width = clamp(params.width ?? 1024, 256, 1536);
  const height = clamp(params.height ?? 1024, 256, 1536);
  const steps = clamp(params.steps ?? 20, 4, 50);
  const guidance = clamp(params.guidance ?? 3.5, 1, 10);
  const seed =
    params.seed != null && Number.isFinite(params.seed)
      ? Math.floor(params.seed)
      : Math.floor(Math.random() * 1_000_000_000);

  workflow['6'].inputs.text = params.prompt.trim();
  workflow['33'].inputs.text = (params.negativePrompt ?? '').trim();
  workflow['27'].inputs.width = width;
  workflow['27'].inputs.height = height;
  workflow['31'].inputs.seed = seed;
  workflow['31'].inputs.steps = steps;
  workflow['35'].inputs.guidance = guidance;
  if (params.ckptName) {
    workflow['30'].inputs.ckpt_name = params.ckptName;
  }

  return workflow;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

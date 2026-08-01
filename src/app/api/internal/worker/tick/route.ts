/**
 * Legacy order worker — fashion garment pipeline (not used by Flux txt2img UI).
 * Kept as stub until garment templates are wired to Comfy workflows.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    note: 'Use /api/generate/txt2img for Flux. Order→RunPod garment worker not enabled yet.',
  });
}

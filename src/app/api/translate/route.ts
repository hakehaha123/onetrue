import { NextRequest, NextResponse } from 'next/server';
import { containsChinese, translateZhToEnIfNeeded } from '@/lib/translate';

/** Preview / manual translate — Vercel only, no RunPod/GPU */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim() ?? '';
    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: 'text too long' }, { status: 400 });
    }

    if (!containsChinese(text)) {
      return NextResponse.json({
        original: text,
        translated: text,
        skipped: true,
        reason: 'no_chinese',
      });
    }

    const result = await translateZhToEnIfNeeded(text);
    return NextResponse.json({
      original: text,
      translated: result.text,
      skipped: false,
      provider: result.provider,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

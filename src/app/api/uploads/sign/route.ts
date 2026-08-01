import { NextRequest, NextResponse } from 'next/server';
import { createUploadUrl } from '@/lib/r2';

const ALLOWED = new Set(['face', 'garment', 'scene']);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      folder?: string;
      content_type?: string;
      ext?: string;
    };
    if (!body.folder || !ALLOWED.has(body.folder)) {
      return NextResponse.json({ error: 'folder must be face|garment|scene' }, { status: 400 });
    }
    const contentType = body.content_type ?? 'image/png';
    const ext = body.ext ?? 'png';
    const signed = await createUploadUrl({
      contentType,
      ext,
      folder: body.folder as 'face' | 'garment' | 'scene',
    });
    return NextResponse.json(signed);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

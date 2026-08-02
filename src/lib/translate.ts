/**
 * Prompt language helpers + ZH→EN for Flux.
 * Prefer DeepLX; fall back if Node cannot reach Vercel (common on some networks).
 */

import dns from 'node:dns';

try {
  // Windows/Node 访问部分 *.vercel.app 时，IPv6 优先会导致 fetch failed
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore on older runtimes
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

export function containsChinese(text: string): boolean {
  return CJK_RE.test(text);
}

export type TranslateResult = {
  text: string;
  translated: boolean;
  skipped: boolean;
  provider?: 'deeplx' | 'mymemory' | 'none';
};

function translateUrl(baseRaw: string): string {
  const base = baseRaw.trim().replace(/\/$/, '');
  if (/\/translate$/i.test(base)) return base;
  return `${base}/translate`;
}

function extractDeeplxText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.data === 'string' && o.data.trim()) return o.data.trim();
  if (typeof o.translation === 'string' && o.translation.trim()) return o.translation.trim();
  if (Array.isArray(o.alternatives) && typeof o.alternatives[0] === 'string') {
    return o.alternatives[0].trim();
  }
  return null;
}

function fetchErrorDetail(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${e.message} (${cause.message})`;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return `${e.message} (${String((cause as { code?: string }).code)})`;
  }
  return e.message;
}

async function translateWithDeeplx(text: string): Promise<string> {
  const base = process.env.DEEPLX_API_URL?.trim();
  if (!base) {
    throw new Error('DEEPLX_API_URL 未配置');
  }

  const url = translateUrl(base);
  const token = process.env.DEEPLX_TOKEN?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        source_lang: 'ZH',
        target_lang: 'EN',
      }),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`DeepLX 网络失败：${fetchErrorDetail(e)}`);
  }

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'DeepLX 鉴权失败：DeepLX 项目 TOKEN 须与本项目 DEEPLX_TOKEN 一致（或两边都留空）',
    );
  }
  if (!res.ok) {
    throw new Error(`DeepLX HTTP ${res.status}：${raw.slice(0, 160)}`);
  }

  const code =
    parsed && typeof parsed === 'object' ? (parsed as { code?: number }).code : undefined;
  if (code != null && code !== 200) {
    const message =
      parsed && typeof parsed === 'object'
        ? (parsed as { message?: string }).message
        : undefined;
    throw new Error(message || `DeepLX code ${code}`);
  }

  const out = extractDeeplxText(parsed);
  if (!out) throw new Error(`DeepLX 无译文：${raw.slice(0, 160)}`);
  return out;
}

/** Free fallback — no key; fine for light personal/dev use */
async function translateWithMyMemory(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh|en`;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new Error(`MyMemory 网络失败：${fetchErrorDetail(e)}`);
  }
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  };
  const out = data.responseData?.translatedText?.trim();
  if (!out) throw new Error('MyMemory 无译文');
  // MyMemory sometimes echoes QUOTA warnings into text
  if (/MYMEMORY WARNING/i.test(out)) {
    throw new Error('MyMemory 额度受限，请稍后重试或修好 DeepLX 网络');
  }
  return out;
}

export async function translateZhToEnIfNeeded(text: string): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text: trimmed, translated: false, skipped: true, provider: 'none' };
  }
  if (!containsChinese(trimmed)) {
    return { text: trimmed, translated: false, skipped: true, provider: 'none' };
  }

  const prefer = (process.env.TRANSLATE_PROVIDER || 'deeplx').toLowerCase();
  const allowFallback = process.env.TRANSLATE_FALLBACK !== 'false';

  if (prefer === 'mymemory') {
    const out = await translateWithMyMemory(trimmed);
    return { text: out, translated: true, skipped: false, provider: 'mymemory' };
  }

  try {
    const out = await translateWithDeeplx(trimmed);
    return { text: out, translated: true, skipped: false, provider: 'deeplx' };
  } catch (deeplxErr) {
    const detail = deeplxErr instanceof Error ? deeplxErr.message : String(deeplxErr);
    console.warn('[translate] DeepLX failed:', detail);
    if (!allowFallback) throw deeplxErr;
    try {
      const out = await translateWithMyMemory(trimmed);
      console.warn('[translate] fell back to MyMemory (set TRANSLATE_FALLBACK=false to disable)');
      return { text: out, translated: true, skipped: false, provider: 'mymemory' };
    } catch (fallbackErr) {
      const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`${detail}；备用翻译也失败：${b}`);
    }
  }
}

export async function translateWorkflowPromptIfNeeded(
  workflow: Record<string, unknown>,
): Promise<{ workflow: Record<string, unknown>; translation?: TranslateResult }> {
  const node = workflow['6'] as { inputs?: { text?: string } } | undefined;
  const original = node?.inputs?.text;
  if (typeof original !== 'string' || !containsChinese(original)) {
    return { workflow };
  }
  const translation = await translateZhToEnIfNeeded(original);
  const next = structuredClone(workflow) as Record<string, unknown>;
  const n6 = next['6'] as { inputs: { text: string } };
  n6.inputs.text = translation.text;
  return { workflow: next, translation };
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GenerationProgressBar } from '@/components/GenerationProgressBar';
import { useGenerationPoll } from '@/hooks/useGenerationPoll';
import { showPricingBreakdown } from '@/lib/pricing-ui';

type GenState = 'idle' | 'submitting' | 'running' | 'done' | 'error';

const SIZES = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '3:4', width: 768, height: 1024 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
] as const;

const JOB_SCOPE = 'flux-txt2img';

const DEFAULT_IMAGE_PROMPT =
  'A breathtakingly beautiful cinematic portrait of a serene female angel. She has large, majestic white feathered wings that softly glow at the edges, spreading elegantly behind her. She wears a flowing, ethereal gown made of translucent white silk and subtle golden embroidery. Her long, wavy golden hair cascades over her shoulders, and her eyes have a gentle, compassionate expression. She is standing on a pure white marble balcony overlooking a celestial city partially obscured by soft, fluffy cumulus clouds during the warm golden hour sunset. Volumetric lighting, god rays piercing through clouds, highly detailed skin texture with visible pores, shot on a 85mm f/1.4 lens, photorealistic 8K resolution, stunning depth of field.';

const DEMO_IMAGE_URL =
  'https://pub-38aba3cae8ff4b60ab5825a0c87ddccd.r2.dev/images/flux1-image.png';

function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

export function Txt2ImgStudio() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const showCalc = showPricingBreakdown(session?.user?.role === 'admin');
  const [prompt, setPrompt] = useState(DEFAULT_IMAGE_PROMPT);
  const [promptEn, setPromptEn] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [steps, setSteps] = useState(20);
  const [state, setState] = useState<GenState>('idle');
  const [statusText, setStatusText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [storage, setStorage] = useState<string | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [needPoints, setNeedPoints] = useState<number | null>(null);
  const [needCny, setNeedCny] = useState<number | null>(null);
  const [rateHr, setRateHr] = useState<number | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [progressExact, setProgressExact] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pending, startTransition] = useTransition();
  const startedAtRef = useRef<number>(0);
  const etaSecRef = useRef<number>(120);
  const endpointKeyRef = useRef('image_24');

  const refreshWallet = useCallback(async () => {
    const res = await fetch('/api/wallet');
    const data = await res.json();
    if (res.ok) setBalance(Number(data.points));
  }, []);

  const refreshQuote = useCallback(async () => {
    const res = await fetch(`/api/pricing/quote?kind=flux&path=cold&steps=${steps}&gpu_tier=24gb`);
    const data = await res.json();
    if (!res.ok) return;
    setNeedPoints(Number(data.points));
    setNeedCny(Number(data.cny));
    setRateHr(Number(data.rate_usd_hr));
    setEtaSec(Number(data.t_bill_est_sec));
  }, [steps]);

  function downloadImage(url: string, id: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `fvs-${id || 'out'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setDownloadNote(t.downloadDone);
  }

  const { startPoll, resumeFromStorage } = useGenerationPoll({
    scope: JOB_SCOPE,
    kind: 'image',
    intervalMs: 2000,
    labels: {
      queued: t.progressQueued,
      running: t.progressRunning,
      done: t.progressDone,
      generating: t.generating,
    },
    getEndpointKey: () => endpointKeyRef.current || 'image_24',
    getStartedAt: () => startedAtRef.current || Date.now(),
    getEtaSec: () => etaSecRef.current || 120,
    onTick: ({ status, percent, exact, label }) => {
      setStatusText(status);
      if (percent > 0 || exact) setProgressPct(percent);
      setProgressExact(exact);
      setProgressLabel(label);
    },
    onRunning: () => setState('running'),
    onCompleted: (data, id) => {
      setProgressPct(100);
      setProgressExact(true);
      setProgressLabel(t.progressDone);
      const url = data.image_url || null;
      setImageUrl(url);
      setIsDemo(false);
      setStorage(data.storage || (data.ephemeral ? 'ephemeral' : null));
      setState(url ? 'done' : 'error');
      if (!url) setError('no image in output');
      else downloadImage(url, id);
      refreshWallet().catch(() => undefined);
    },
    onFailed: (err) => {
      setState('error');
      setError(err);
    },
  });

  useEffect(() => {
    refreshWallet().catch(() => undefined);
  }, [refreshWallet]);

  useEffect(() => {
    refreshQuote().catch(() => undefined);
  }, [refreshQuote]);

  useEffect(() => {
    if (etaSec != null && etaSec > 0) etaSecRef.current = etaSec;
  }, [etaSec]);

  useEffect(() => {
    if (state !== 'submitting' && state !== 'running') return;
    const tick = () => {
      const start = startedAtRef.current || Date.now();
      setElapsedSec(Math.max(0, (Date.now() - start) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    const saved = resumeFromStorage();
    if (!saved) return;
    setJobId(saved.jobId);
    endpointKeyRef.current = saved.endpointKey || 'image_24';
    startedAtRef.current = saved.startedAt;
    etaSecRef.current = saved.etaSec || 120;
    setEtaSec(saved.etaSec || 120);
    setElapsedSec(Math.max(0, (Date.now() - saved.startedAt) / 1000));
    setState('running');
    setStatusText('…');
    setProgressPct(12);
    setProgressExact(false);
    setProgressLabel(t.progressQueued);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once on mount
  }, []);

  async function onTranslate() {
    setError(null);
    setTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'translate failed');
      if (data.skipped) {
        setPromptEn(null);
        setError(t.translateSkip);
      } else {
        setPromptEn(data.translated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'translate failed');
    } finally {
      setTranslating(false);
    }
  }

  function onGenerate() {
    setError(null);
    setStorage(null);
    setDownloadNote(null);
    setJobId(null);
    setProgressPct(3);
    setProgressExact(false);
    setProgressLabel(t.progressSubmit);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    setState('submitting');
    setStatusText('…');
    const size = SIZES[sizeIdx];

    startTransition(async () => {
      try {
        const res = await fetch('/api/generate/txt2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            width: size.width,
            height: size.height,
            steps,
          }),
        });
        const data = (await res.json()) as {
          job_id?: string;
          error?: string;
          need_points?: number;
          need_cny?: number;
          balance_points?: number;
          charged_points?: number;
          prompt?: { prompt_en?: string; translated?: boolean; skipped?: boolean };
        };
        if (res.status === 401) {
          throw new Error(t.loginRequired);
        }
        if (res.status === 402) {
          setBalance(data.balance_points ?? balance);
          throw new Error(
            `${data.need_points} ${t.points} (¥${Number(data.need_cny).toFixed(2)})`,
          );
        }
        if (!res.ok || !data.job_id) throw new Error(data.error || 'submit failed');
        if (data.charged_points != null) setNeedPoints(data.charged_points);
        if (data.prompt?.prompt_en && data.prompt.translated) {
          setPromptEn(data.prompt.prompt_en);
        } else if (data.prompt?.skipped) {
          setPromptEn(null);
        }
        await refreshWallet();
        setJobId(data.job_id);
        startedAtRef.current = Date.now();
        endpointKeyRef.current = 'image_24';
        setProgressPct(8);
        setProgressLabel(t.progressQueued);
        setState('running');
        setStatusText('IN_QUEUE');
        startPoll(data.job_id);
      } catch (e) {
        setState('error');
        setProgressPct(0);
        setError(e instanceof Error ? e.message : 'submit failed');
      }
    });
  }

  const busy = state === 'submitting' || state === 'running' || pending;
  const displayImage = imageUrl || DEMO_IMAGE_URL;

  return (
    <div className="studio">
      <div className="page-head">
        <h1>{t.txt2img}</h1>
        <p className="lede">{t.lede}</p>
      </div>

      <section className="stage">
        <div className={`canvas ${busy ? 'busy' : ''}`} aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayImage} alt={isDemo ? t.demoSample : 'result'} className="result" />
          {busy ? (
            <div className="canvas-overlay">
              <span>{statusText || t.generating}</span>
              <GenerationProgressBar
                visible
                percent={progressPct}
                exact={progressExact}
                label={progressLabel || t.generating}
              />
              <p className="eta-hint">已用时 {formatElapsed(elapsedSec)}</p>
            </div>
          ) : null}
          <div className="canvas-bar">
            <span>
              {isDemo
                ? t.demoSample
                : storage === 'r2'
                  ? t.savedToR2
                  : t.downloadHint}
            </span>
            {!isDemo && imageUrl ? (
              <button type="button" className="dl" onClick={() => downloadImage(imageUrl, jobId || 'out')}>
                {t.download}
              </button>
            ) : null}
          </div>
          {downloadNote && <p className="dl-note">{downloadNote}</p>}
          {(state === 'done' || state === 'error') && elapsedSec > 0 && (
            <p className="eta-hint elapsed-final">本次任务用时 {formatElapsed(elapsedSec)}</p>
          )}
        </div>

        <div className="panel">
          <label className="field">
            <span className="prompt-head">
              {t.prompt}
              <button type="button" className="tr-btn" disabled={busy || translating || !prompt.trim()} onClick={onTranslate}>
                {translating ? t.translating : t.translateZh}
              </button>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptEn(null);
              }}
              rows={5}
              disabled={busy}
              placeholder={t.promptPh}
            />
            {promptEn && (
              <p className="prompt-en">
                <span>EN</span>
                {promptEn}
              </p>
            )}
            <p className="prompt-tip">{t.translateTip}</p>
          </label>

          <div className="row">
            <label className="field grow">
              <span>{t.aspect}</span>
              <div className="chips">
                {SIZES.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    className={i === sizeIdx ? 'chip on' : 'chip'}
                    disabled={busy}
                    onClick={() => setSizeIdx(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="field narrow">
              <span>
                {t.steps} {steps}
              </span>
              <input
                type="range"
                min={8}
                max={30}
                value={steps}
                disabled={busy}
                onChange={(e) => setSteps(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="cost">
            <div>
              <span>{t.estimate}</span>
              <strong>
                {needPoints == null ? '…' : `${needPoints} ${t.points}`}
                {needCny != null ? ` · ¥${needCny.toFixed(2)}` : ''}
              </strong>
            </div>
            <p>
              {showCalc ? (
                <>
                  {t.rateNote} ${rateHr?.toFixed(2) ?? '0.69'}/hr
                  {etaSec != null ? ` · ${t.coldNote} ${etaSec}s` : ''}
                  {' · '}
                  {t.multiplierNote}
                </>
              ) : etaSec != null ? (
                t.etaOnly.replace('{sec}', String(etaSec))
              ) : null}
            </p>
          </div>

          <button type="button" className="cta" disabled={busy || !prompt.trim()} onClick={onGenerate}>
            {busy
              ? t.generating
              : needPoints != null
                ? `${t.generate} · ${t.deduct} ${needPoints} ${t.points}`
                : t.generate}
          </button>

          {jobId && <p className="meta">Job · {jobId}</p>}
          {error && (
            <p className="err">
              {error}{' '}
              <Link href="/credits" className="inline">
                {t.recharge}
              </Link>
            </p>
          )}
        </div>
      </section>

      <style jsx>{`
        .studio {
          max-width: 1100px;
          margin: 0 auto;
          color: #f3ebe1;
        }
        .page-head {
          margin-bottom: 1.15rem;
        }
        h1 {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 400;
          font-size: clamp(1.45rem, 2.4vw, 1.9rem);
          color: #f3ebe1;
        }
        .lede {
          margin: 0.4rem 0 0;
          color: #9a948a;
          font-size: 0.9rem;
        }
        .stage {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 1.5rem;
        }
        @media (max-width: 860px) {
          .stage {
            grid-template-columns: 1fr;
          }
        }
        .canvas {
          min-height: min(70vh, 640px);
          border: 1px solid #ffffff14;
          background: #090807cc;
          position: relative;
          overflow: hidden;
          border-radius: 10px;
        }
        .result {
          width: 100%;
          height: min(70vh, 640px);
          object-fit: contain;
          display: block;
          background: #050505;
        }
        .canvas-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: center;
          gap: 0.75rem;
          padding: 1.5rem;
          background: #0a0a0acc;
          text-align: center;
        }
        .canvas-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: #00000088;
          font-size: 0.8rem;
          color: #cbb9a4;
        }
        .dl {
          color: #1a120a;
          background: #c4a574;
          border: 0;
          padding: 0.25rem 0.55rem;
          cursor: pointer;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .dl-note {
          margin: 0;
          padding: 0.35rem 0.75rem;
          font-size: 0.75rem;
          color: #b7d4a8;
          background: #00000066;
        }
        .eta-hint {
          margin: 0;
          font-size: 0.8rem;
          color: #8fa8b8;
        }
        .elapsed-final {
          margin: 0;
          padding: 0.35rem 0.75rem 2.5rem;
          text-align: center;
          color: #c4b8a8;
          font-size: 0.8rem;
        }
        .panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .field span {
          font-size: 0.8rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #9a8f82;
        }
        .prompt-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          text-transform: none;
          letter-spacing: 0;
        }
        .tr-btn {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #c4a574;
          padding: 0.2rem 0.55rem;
          font: inherit;
          font-size: 0.78rem;
          cursor: pointer;
        }
        .tr-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .prompt-en {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border: 1px solid #ffffff14;
          background: #0c0a08aa;
          color: #d7cdc1;
          font-size: 0.85rem;
          line-height: 1.4;
        }
        .prompt-en span {
          display: inline-block;
          margin-right: 0.45rem;
          color: #c4a574;
          font-size: 0.7rem;
          letter-spacing: 0.06em;
        }
        .prompt-tip {
          margin: 0;
          font-size: 0.75rem;
          color: #7a7268;
          text-transform: none;
          letter-spacing: 0;
        }
        textarea {
          resize: vertical;
          min-height: 120px;
          padding: 0.9rem 1rem;
          border: 1px solid #ffffff1f;
          background: #140f0ccc;
          color: #f3ebe1;
          font: inherit;
        }
        .row {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .grow {
          flex: 1;
          min-width: 180px;
        }
        .narrow {
          width: 140px;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .chip {
          border: 1px solid #ffffff22;
          background: transparent;
          color: #d7cdc1;
          padding: 0.4rem 0.7rem;
          cursor: pointer;
          font: inherit;
        }
        .chip.on {
          background: #c4a57422;
          border-color: #c4a57499;
        }
        .cost {
          border: 1px solid #ffffff14;
          padding: 0.75rem 0.9rem;
          background: #0c0a08aa;
        }
        .cost span {
          display: block;
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #b8b2a8;
          margin-bottom: 0.25rem;
        }
        .cost strong {
          font-size: 1.15rem;
          color: #f2efe8;
          font-weight: 600;
          background: none;
          -webkit-text-fill-color: #f2efe8;
        }
        .cost p {
          margin: 0.45rem 0 0;
          font-size: 0.78rem;
          color: #a8a29a;
        }
        .cta {
          border: 0;
          padding: 0.95rem 1.2rem;
          background: linear-gradient(120deg, #c4a574, #8f6b3e);
          color: #1a120a;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .cta:disabled {
          opacity: 0.55;
        }
        .meta {
          margin: 0;
          font-size: 0.75rem;
          color: #a8a29a;
          word-break: break-all;
        }
        .err {
          margin: 0;
          color: #e8a090;
          font-size: 0.9rem;
        }
        .err :global(a.inline) {
          color: #c4a574;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

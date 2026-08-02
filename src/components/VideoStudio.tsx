'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { LangSwitch, useI18n } from '@/lib/i18n/I18nProvider';
import { GenerationProgressBar } from '@/components/GenerationProgressBar';
import { UserBar } from '@/components/AuthWidgets';
import { useGenerationPoll } from '@/hooks/useGenerationPoll';

type GenState = 'idle' | 'submitting' | 'running' | 'done' | 'error';

const RESOLUTIONS = [
  { label: '16:9 · 960×544', width: 960, height: 544 },
  { label: '16:9 · 768×512', width: 768, height: 512 },
  { label: '9:16 · 544×960', width: 544, height: 960 },
  { label: '9:16 · 512×768', width: 512, height: 768 },
] as const;

const DURATIONS = [5, 8, 10] as const;
const FPS_OPTIONS = [16, 24] as const;
const JOB_SCOPE = 'ltx-txt2vid';

const DEFAULT_VIDEO_PROMPT =
  'Cinematic close-up shot of a breathtakingly beautiful female angel with soft luminous skin, glowing golden-white wings, and a serene smile. She wears a delicate ethereal white gown with golden embroidery, floating gently above soft clouds in golden hour sunlight. She looks directly into the camera, warmly waving her hand and speaking friendly greetings in a clear, sweet tone. Cinematic lighting, photorealistic, 8k resolution, ultra-detailed features, smooth animation.';

/** LTX frame rule 8n+1 */
function framesFor(durationSec: number, fps: number): number {
  const raw = Math.round(durationSec * fps);
  const x = Math.max(9, Math.min(241, raw));
  return Math.floor((x - 1) / 8) * 8 + 1;
}

function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

export function VideoStudio() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState(DEFAULT_VIDEO_PROMPT);
  const [promptEn, setPromptEn] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [resIdx, setResIdx] = useState(0);
  const [durationSec, setDurationSec] = useState<(typeof DURATIONS)[number]>(5);
  const [fps, setFps] = useState<(typeof FPS_OPTIONS)[number]>(24);
  const [gpuTier, setGpuTier] = useState<'24gb' | '48gb'>('24gb');
  const [state, setState] = useState<GenState>('idle');
  const [statusText, setStatusText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [endpointKey, setEndpointKey] = useState('video_24');
  const [balance, setBalance] = useState<number | null>(null);
  const [needPoints, setNeedPoints] = useState<number | null>(null);
  const [needCny, setNeedCny] = useState<number | null>(null);
  const [rateHr, setRateHr] = useState<number | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<{ frames: number; fps: number; duration: number } | null>(
    null,
  );
  const [progressPct, setProgressPct] = useState(0);
  const [progressExact, setProgressExact] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pending, startTransition] = useTransition();
  const startedAtRef = useRef<number>(0);
  const etaSecRef = useRef<number>(600);
  const endpointKeyRef = useRef('video_24');

  const res = RESOLUTIONS[resIdx];
  const frames = framesFor(durationSec, fps);

  const refreshWallet = useCallback(async () => {
    const resW = await fetch('/api/wallet');
    const data = await resW.json();
    if (resW.ok) setBalance(Number(data.points));
  }, []);

  const refreshQuote = useCallback(async () => {
    const qs = new URLSearchParams({
      kind: 'ltx',
      path: 'cold',
      gpu_tier: gpuTier,
      frames: String(frames),
      fps: String(fps),
      width: String(res.width),
      height: String(res.height),
    });
    const r = await fetch(`/api/pricing/quote?${qs}`);
    const data = await r.json();
    if (!r.ok) return;
    setNeedPoints(Number(data.points));
    setNeedCny(Number(data.cny));
    setRateHr(Number(data.rate_usd_hr));
    setEtaSec(Number(data.t_bill_est_sec));
    setQuoteMeta({
      frames: Number(data.frames) || frames,
      fps: Number(data.fps) || fps,
      duration: Number(data.duration_sec) || durationSec,
    });
    if (data.endpoint_key) {
      setEndpointKey(String(data.endpoint_key));
      endpointKeyRef.current = String(data.endpoint_key);
    }
  }, [gpuTier, frames, fps, res.width, res.height, durationSec]);

  function downloadVideo(url: string, id: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `fvs-video-${id || 'out'}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setDownloadNote(t.downloadDone);
  }

  const { startPoll, resumeFromStorage } = useGenerationPoll({
    scope: JOB_SCOPE,
    kind: 'video',
    intervalMs: 2500,
    labels: {
      queued: t.progressQueued,
      running: t.progressRunningVideo,
      done: t.progressDone,
      generating: t.generating,
    },
    getEndpointKey: () => endpointKeyRef.current || 'video_24',
    getStartedAt: () => startedAtRef.current || Date.now(),
    getEtaSec: () => etaSecRef.current || 600,
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
      const url = data.video_url || data.image_url || null;
      setVideoUrl(url);
      setState(url ? 'done' : 'error');
      if (!url) setError('no video in output');
      else downloadVideo(url, id);
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

  // Live wall-clock for billing / ETA comparison (keeps final value when done).
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

  // Resume polling after refresh if a job was still running.
  useEffect(() => {
    const saved = resumeFromStorage();
    if (!saved) return;
    setJobId(saved.jobId);
    setEndpointKey(saved.endpointKey);
    endpointKeyRef.current = saved.endpointKey;
    startedAtRef.current = saved.startedAt;
    etaSecRef.current = saved.etaSec || 600;
    setEtaSec(saved.etaSec || 600);
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
    setVideoUrl(null);
    setDownloadNote(null);
    setJobId(null);
    setProgressPct(3);
    setProgressExact(false);
    setProgressLabel(t.progressSubmit);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    setState('submitting');
    setStatusText('…');

    startTransition(async () => {
      try {
        const resGen = await fetch('/api/generate/txt2vid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            width: res.width,
            height: res.height,
            frames,
            fps,
            steps: 15,
            gpu_tier: gpuTier,
          }),
        });
        const data = (await resGen.json()) as {
          job_id?: string;
          endpoint_key?: string;
          error?: string;
          need_points?: number;
          need_cny?: number;
          balance_points?: number;
          charged_points?: number;
          quote?: {
            t_bill_est_sec?: number;
            duration_sec?: number;
            frames?: number;
            fps?: number;
          };
          prompt?: { prompt_en?: string; translated?: boolean; skipped?: boolean };
        };
        if (resGen.status === 401) throw new Error(t.loginRequired);
        if (resGen.status === 402) {
          setBalance(data.balance_points ?? balance);
          throw new Error(
            `${data.need_points} ${t.points} (¥${Number(data.need_cny).toFixed(2)})`,
          );
        }
        if (!resGen.ok || !data.job_id) throw new Error(data.error || 'submit failed');
        if (data.charged_points != null) setNeedPoints(data.charged_points);
        if (data.endpoint_key) {
          setEndpointKey(data.endpoint_key);
          endpointKeyRef.current = data.endpoint_key;
        }
        if (data.quote?.t_bill_est_sec) {
          setEtaSec(data.quote.t_bill_est_sec);
          etaSecRef.current = data.quote.t_bill_est_sec;
        }
        if (data.quote?.frames && data.quote?.fps) {
          setQuoteMeta({
            frames: data.quote.frames,
            fps: data.quote.fps,
            duration: data.quote.duration_sec ?? data.quote.frames / data.quote.fps,
          });
        }
        if (data.prompt?.prompt_en && data.prompt.translated) setPromptEn(data.prompt.prompt_en);
        else if (data.prompt?.skipped) setPromptEn(null);

        await refreshWallet();
        setJobId(data.job_id);
        startedAtRef.current = Date.now();
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
  const etaMin = etaSec != null ? Math.max(1, Math.round(etaSec / 60)) : null;

  return (
    <div className="studio">
      <header className="hero">
        <div className="hero-row">
          <p className="brand">{t.brand}</p>
          <div className="actions">
            <UserBar />
            <LangSwitch />
            <Link href="/" className="ghost">
              {t.txt2img}
            </Link>
            <Link href="/credits" className="wallet">
              {t.balance} {balance == null ? '…' : `${balance}`}
              <span>{t.recharge}</span>
            </Link>
          </div>
        </div>
        <h1>{t.txt2vid}</h1>
        <p className="lede">{t.videoLede}</p>
      </header>

      <section className="stage">
        <div className="canvas" aria-live="polite">
          {videoUrl ? (
            <>
              <video className="result" src={videoUrl} controls playsInline autoPlay loop />
              <div className="canvas-bar">
                <span>{t.videoDownloadHint}</span>
                <button
                  type="button"
                  className="dl"
                  onClick={() => videoUrl && downloadVideo(videoUrl, jobId || 'out')}
                >
                  {t.download}
                </button>
              </div>
              {downloadNote && <p className="dl-note">{downloadNote}</p>}
            </>
          ) : (
            <div className={`placeholder ${busy ? 'pulse' : ''}`}>
              <div className="ph-inner">
                <span>{busy ? statusText || t.generating : t.videoPlaceholder}</span>
                <GenerationProgressBar
                  visible={busy}
                  percent={progressPct}
                  exact={progressExact}
                  label={progressLabel || t.generating}
                />
                {busy && (
                  <p className="eta-hint">
                    已用时 {formatElapsed(elapsedSec)}
                    {etaMin != null ? ` · ${t.videoEtaHint.replace('{min}', String(etaMin))}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}
          {(state === 'done' || state === 'error') && elapsedSec > 0 && (
            <p className="eta-hint elapsed-final">本次任务用时 {formatElapsed(elapsedSec)}</p>
          )}
        </div>

        <div className="panel">
          <label className="field">
            <span className="prompt-head">
              {t.prompt}
              <button
                type="button"
                className="tr-btn"
                disabled={busy || translating || !prompt.trim()}
                onClick={onTranslate}
              >
                {translating ? t.translating : t.translateZh}
              </button>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptEn(null);
              }}
              rows={6}
              disabled={busy}
              placeholder={t.videoPromptPh}
            />
            {promptEn && (
              <p className="prompt-en">
                <span>EN</span>
                {promptEn}
              </p>
            )}
            <p className="prompt-tip">{t.translateTip}</p>
          </label>

          <label className="field">
            <span>{t.resolution}</span>
            <div className="chips">
              {RESOLUTIONS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  className={i === resIdx ? 'chip on' : 'chip'}
                  disabled={busy}
                  onClick={() => setResIdx(i)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </label>

          <div className="row">
            <label className="field grow">
              <span>{t.duration}</span>
              <div className="chips">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={durationSec === d ? 'chip on' : 'chip'}
                    disabled={busy}
                    onClick={() => setDurationSec(d)}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </label>
            <label className="field grow">
              <span>{t.frameRate}</span>
              <div className="chips">
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={fps === f ? 'chip on' : 'chip'}
                    disabled={busy}
                    onClick={() => setFps(f)}
                  >
                    {f} fps
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label className="field">
            <span>{t.gpuTier}</span>
            <div className="chips">
              {(['24gb', '48gb'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={gpuTier === tier ? 'chip on' : 'chip'}
                  disabled={busy}
                  onClick={() => setGpuTier(tier)}
                >
                  {tier === '24gb' ? t.gpu24 : t.gpu48}
                </button>
              ))}
            </div>
          </label>

          <p className="spec-line">
            {t.outputSpec
              .replace('{sec}', String((quoteMeta?.duration ?? frames / fps).toFixed(1)))
              .replace('{fps}', String(quoteMeta?.fps ?? fps))
              .replace('{frames}', String(quoteMeta?.frames ?? frames))
              .replace('{res}', `${res.width}×${res.height}`)}
          </p>

          <div className="cost">
            <div>
              <span>{t.estimate}</span>
              <strong>
                {needPoints == null ? '…' : `${needPoints} ${t.points}`}
                {needCny != null ? ` · ¥${needCny.toFixed(2)}` : ''}
              </strong>
            </div>
            <p>
              {gpuTier === '48gb' ? t.rateNote48 : t.rateNote} $
              {rateHr?.toFixed(2) ?? (gpuTier === '48gb' ? '1.22' : '0.69')}/hr
              {etaSec != null ? ` · ${t.coldNote} ~${etaMin} ${t.minutes}` : ''}
              {' · '}
              {t.videoColdNote}
            </p>
          </div>

          <button
            type="button"
            className="cta"
            disabled={busy || !prompt.trim()}
            onClick={onGenerate}
          >
            {busy
              ? t.generating
              : needPoints != null
                ? `${t.generateVideo} · ${t.deduct} ${needPoints} ${t.points}`
                : t.generateVideo}
          </button>

          {jobId && (
            <p className="meta">
              Job · {jobId} · {endpointKey}
            </p>
          )}
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
          min-height: 100vh;
          padding: clamp(1.25rem, 4vw, 3rem);
          background:
            radial-gradient(1200px 600px at 10% -10%, #1a2e3d55, transparent 55%),
            radial-gradient(900px 500px at 100% 0%, #3d241a55, transparent 50%),
            linear-gradient(165deg, #0a0c0e 0%, #12161a 45%, #1a1410 100%);
          color: #f3ebe1;
        }
        .hero {
          max-width: 1100px;
          margin: 0 auto 2rem;
        }
        .hero-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .brand {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 4vw, 2.6rem);
        }
        h1 {
          margin: 0.6rem 0 0.35rem;
          font-family: var(--font-display);
          font-weight: 500;
          font-size: clamp(1.5rem, 3vw, 2rem);
        }
        .lede {
          margin: 0;
          color: #c9bdae;
          max-width: 40rem;
          line-height: 1.5;
        }
        .ghost {
          color: #d7cdc1;
          text-decoration: none;
          border: 1px solid #ffffff22;
          padding: 0.4rem 0.65rem;
          font-size: 0.85rem;
        }
        .wallet {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: #e8dcc8;
          text-decoration: none;
          border: 1px solid #ffffff22;
          padding: 0.4rem 0.65rem;
          font-size: 0.85rem;
        }
        .wallet span {
          opacity: 0.75;
          font-size: 0.78rem;
        }
        .stage {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 1.25rem;
          align-items: start;
        }
        @media (max-width: 860px) {
          .stage {
            grid-template-columns: 1fr;
          }
        }
        .canvas {
          min-height: 360px;
          background: #0a0a0c;
          border: 1px solid #ffffff14;
          position: relative;
          overflow: hidden;
        }
        .result {
          display: block;
          width: 100%;
          max-height: 70vh;
          object-fit: contain;
          background: #000;
        }
        .canvas-bar {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          padding: 0.65rem 0.85rem;
          font-size: 0.8rem;
          color: #cfc3b4;
          border-top: 1px solid #ffffff12;
        }
        .dl {
          border: 1px solid #ffffff33;
          background: #ffffff12;
          color: #f3ebe1;
          padding: 0.35rem 0.7rem;
          cursor: pointer;
        }
        .dl-note {
          margin: 0;
          padding: 0.4rem 0.85rem 0.7rem;
          font-size: 0.78rem;
          color: #9ecb9a;
        }
        .placeholder {
          min-height: 360px;
          display: grid;
          place-items: center;
          padding: 2rem;
        }
        .placeholder.pulse .ph-inner {
          animation: pulse 1.8s ease-in-out infinite;
        }
        .ph-inner {
          width: min(100%, 420px);
          text-align: center;
          color: #b8aea0;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .eta-hint {
          margin: 0;
          font-size: 0.8rem;
          color: #8fa8b8;
        }
        .elapsed-final {
          margin: 0.5rem 0 0;
          text-align: center;
          color: #c4b8a8;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.75;
          }
          50% {
            opacity: 1;
          }
        }
        .panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.85rem;
          color: #d5c9ba;
        }
        .field.grow {
          flex: 1;
        }
        .prompt-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }
        .tr-btn {
          border: 1px solid #ffffff28;
          background: transparent;
          color: #e8dcc8;
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
        }
        .tr-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        textarea {
          width: 100%;
          resize: vertical;
          background: #12151a;
          border: 1px solid #ffffff18;
          color: #f3ebe1;
          padding: 0.75rem;
          font: inherit;
          line-height: 1.45;
        }
        .prompt-en {
          margin: 0;
          font-size: 0.78rem;
          color: #a8b8c4;
          line-height: 1.4;
        }
        .prompt-en span {
          display: inline-block;
          margin-right: 0.4rem;
          padding: 0.05rem 0.3rem;
          border: 1px solid #ffffff22;
          font-size: 0.68rem;
        }
        .prompt-tip {
          margin: 0;
          font-size: 0.72rem;
          color: #8a8074;
        }
        .spec-line {
          margin: 0;
          font-size: 0.78rem;
          color: #a8b0b8;
          line-height: 1.4;
        }
        .row {
          display: flex;
          gap: 0.85rem;
          flex-wrap: wrap;
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
          padding: 0.35rem 0.65rem;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .chip.on {
          background: #ffffff14;
          border-color: #ffffff44;
          color: #fff;
        }
        .chip:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .cost {
          border-top: 1px solid #ffffff12;
          padding-top: 0.75rem;
          font-size: 0.82rem;
        }
        .cost strong {
          display: block;
          margin-top: 0.2rem;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .cost p {
          margin: 0.35rem 0 0;
          color: #9a8f82;
          font-size: 0.75rem;
          line-height: 1.4;
        }
        .cta {
          border: none;
          background: linear-gradient(135deg, #c4a574, #8b6b3e);
          color: #140f0a;
          font-weight: 600;
          padding: 0.85rem 1rem;
          cursor: pointer;
          font-size: 0.95rem;
        }
        .cta:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .meta {
          margin: 0;
          font-size: 0.72rem;
          color: #7d756c;
          word-break: break-all;
        }
        .err {
          margin: 0;
          color: #e8a0a0;
          font-size: 0.85rem;
        }
        .err .inline {
          color: #f0c9a0;
        }
      `}</style>
    </div>
  );
}

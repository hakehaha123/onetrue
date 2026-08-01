'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { LangSwitch, useI18n } from '@/lib/i18n/I18nProvider';
import { GenerationProgressBar } from '@/components/GenerationProgressBar';
import { UserBar } from '@/components/AuthWidgets';
import { buildFluxTxt2ImgWorkflow } from '@/lib/flux-workflow';
import baseWorkflow from '@/workflows/flux-txt2img.api.json';

/**
 * Scheme 1: edit workflow on Vercel (CPU/$0), GPU only when Queue is clicked.
 */
export function WorkflowEditor() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('fashion editorial, soft light, 85mm');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(20);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState<number | ''>('');
  const [raw, setRaw] = useState('');
  const [useRaw, setUseRaw] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [needPoints, setNeedPoints] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [progressExact, setProgressExact] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [etaSec, setEtaSec] = useState(120);
  const [pending, startTransition] = useTransition();
  const startedAtRef = useRef(0);

  const built = useMemo(
    () =>
      buildFluxTxt2ImgWorkflow({
        prompt,
        width,
        height,
        steps,
        guidance,
        seed: seed === '' ? undefined : Number(seed),
      }),
    [prompt, width, height, steps, guidance, seed],
  );

  useEffect(() => {
    if (!useRaw) setRaw(JSON.stringify(built, null, 2));
  }, [built, useRaw]);

  const refresh = useCallback(async () => {
    const [w, q] = await Promise.all([
      fetch('/api/wallet').then((r) => r.json()),
      fetch(`/api/pricing/quote?kind=flux&path=cold&steps=${steps}`).then((r) => r.json()),
    ]);
    if (w.points != null) setBalance(Number(w.points));
    if (q.points != null) setNeedPoints(Number(q.points));
    if (q.t_bill_est_sec != null) setEtaSec(Number(q.t_bill_est_sec));
  }, [steps]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  function labelFor(st: string, stage?: string) {
    const s = (st || '').toUpperCase();
    if (s === 'IN_QUEUE' || stage === 'queued') return t.progressQueued;
    if (s === 'IN_PROGRESS' || stage === 'running') return t.progressRunning;
    if (s === 'COMPLETED' || stage === 'done') return t.progressDone;
    return t.generating;
  }

  function onQueue() {
    setError(null);
    setImageUrl(null);
    setStatus('submit');
    setProgressPct(3);
    setProgressExact(false);
    setProgressLabel(t.progressSubmit);
    startTransition(async () => {
      try {
        let workflow: Record<string, unknown> = built;
        if (useRaw) {
          workflow = JSON.parse(raw) as Record<string, unknown>;
        }
        const res = await fetch('/api/generate/txt2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow }),
        });
        const data = await res.json();
        if (res.status === 402) {
          throw new Error(`${t.points}: ${data.need_points} / ¥${data.need_cny}`);
        }
        if (!res.ok || !data.job_id) throw new Error(data.error || 'failed');
        await refresh();
        setStatus(data.status || 'IN_QUEUE');
        setProgressPct(8);
        setProgressLabel(t.progressQueued);
        startedAtRef.current = Date.now();
        const jobId = data.job_id as string;
        for (;;) {
          await new Promise((r) => setTimeout(r, 2000));
          const qs = new URLSearchParams({
            job_id: jobId,
            endpoint_key: 'image_24',
            started_at: String(startedAtRef.current),
            eta_sec: String(etaSec || 120),
          });
          const st = await fetch(`/api/generate/status?${qs.toString()}`).then((r) => r.json());
          setStatus(st.status || '…');
          setProgressPct(Number(st.progress?.percent ?? 0));
          setProgressExact(Boolean(st.progress?.exact));
          setProgressLabel(labelFor(st.status || '', st.progress?.stage));
          if (st.status === 'COMPLETED') {
            setProgressPct(100);
            setProgressExact(true);
            setProgressLabel(t.progressDone);
            setImageUrl(st.image_url || null);
            break;
          }
          if (st.status === 'FAILED') throw new Error(st.error || 'failed');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'error');
        setStatus('');
        setProgressPct(0);
      }
    });
  }

  return (
    <div className="page">
      <header className="top">
        <div className="row">
          <Link href="/">{t.backTxt2img}</Link>
          <div className="right">
            <UserBar />
            <LangSwitch />
          </div>
        </div>
        <p className="brand">{t.brand}</p>
        <h1>{t.workflowTitle}</h1>
        <p className="lede">{t.workflowLede}</p>
        <p className="bal">
          {t.balance} {balance ?? '…'} · {t.estimate} {needPoints ?? '…'} {t.points}
        </p>
      </header>

      <div className="grid">
        <div className="form">
          <label>
            <span>{t.prompt}</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} disabled={pending} />
          </label>
          <div className="two">
            <label>
              <span>W</span>
              <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} disabled={pending} />
            </label>
            <label>
              <span>H</span>
              <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} disabled={pending} />
            </label>
          </div>
          <div className="two">
            <label>
              <span>{t.steps} {steps}</span>
              <input type="range" min={8} max={30} value={steps} onChange={(e) => setSteps(Number(e.target.value))} disabled={pending} />
            </label>
            <label>
              <span>{t.guidance} {guidance}</span>
              <input type="range" min={1} max={8} step={0.5} value={guidance} onChange={(e) => setGuidance(Number(e.target.value))} disabled={pending} />
            </label>
          </div>
          <label>
            <span>{t.seed}</span>
            <div className="seed">
              <input
                type="number"
                value={seed}
                placeholder={t.seedRandom}
                onChange={(e) => setSeed(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={pending}
              />
            </div>
          </label>

          <label className="check">
            <input type="checkbox" checked={useRaw} onChange={(e) => setUseRaw(e.target.checked)} />
            {t.advancedJson}
          </label>
          {useRaw && (
            <textarea className="json" value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} spellCheck={false} />
          )}

          <button type="button" className="cta" disabled={pending} onClick={onQueue}>
            {pending ? t.generating : t.queuePrompt}
          </button>
          <GenerationProgressBar
            visible={pending}
            percent={progressPct}
            exact={progressExact}
            label={progressLabel || status || t.generating}
          />
          {status && !pending && <p className="meta">{status}</p>}
          {error && <p className="err">{error}</p>}
          <p className="hint">template nodes: {Object.keys(baseWorkflow).length}</p>
        </div>

        <div className="preview">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="out" />
          ) : (
            <div className="empty">
              {pending ? progressLabel || t.generating : t.placeholder}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: clamp(1rem, 3vw, 2.5rem);
          background: linear-gradient(165deg, #0e0c0a, #15120e 40%, #12161c);
          color: #f3ebe1;
        }
        .top {
          max-width: 1100px;
          margin: 0 auto 1.25rem;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
        }
        .right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .row a {
          color: #b5a893;
          text-decoration: none;
        }
        .brand {
          margin: 0.8rem 0 0;
          font-family: var(--font-display);
          font-size: 1.8rem;
        }
        h1 {
          margin: 0.2rem 0 0;
          font-size: 1.05rem;
          font-weight: 500;
          color: #cbb9a4;
        }
        .lede,
        .bal,
        .hint,
        .meta {
          color: #8f8578;
          font-size: 0.88rem;
        }
        .grid {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        @media (max-width: 860px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8rem;
          color: #9a8f82;
        }
        textarea,
        input[type='number'],
        input[type='text'] {
          border: 1px solid #ffffff1f;
          background: #140f0ccc;
          color: #f3ebe1;
          padding: 0.65rem 0.75rem;
          font: inherit;
        }
        .json {
          font-family: ui-monospace, monospace;
          font-size: 0.75rem;
        }
        .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .check {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
        }
        .cta {
          border: 0;
          padding: 0.85rem 1rem;
          background: linear-gradient(120deg, #c4a574, #8f6b3e);
          color: #1a120a;
          font-weight: 600;
          cursor: pointer;
        }
        .cta:disabled {
          opacity: 0.55;
        }
        .err {
          color: #e8a090;
        }
        .preview {
          min-height: 420px;
          border: 1px solid #ffffff14;
          background: #090807;
          display: grid;
          place-items: center;
        }
        .preview img {
          max-width: 100%;
          max-height: 70vh;
        }
        .empty {
          color: #6e655c;
        }
      `}</style>
    </div>
  );
}

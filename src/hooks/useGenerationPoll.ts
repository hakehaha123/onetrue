'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  type ActiveGenerationJob,
  type GenerationStatusPayload,
  progressLabelForStatus,
  readActiveJob,
  writeActiveJob,
} from '@/lib/generation-job';

type Labels = {
  queued: string;
  running: string;
  done: string;
  generating: string;
};

type Options = {
  /** Unique per studio page, e.g. flux-txt2img / ltx-txt2vid */
  scope: string;
  kind?: 'image' | 'video';
  intervalMs?: number;
  maxFailStreak?: number;
  labels: Labels;
  getEndpointKey: () => string;
  getStartedAt: () => number;
  getEtaSec: () => number;
  onTick: (update: {
    status: string;
    percent: number;
    exact: boolean;
    label: string;
  }) => void;
  onRunning: () => void;
  onCompleted: (data: GenerationStatusPayload, jobId: string) => void;
  onFailed: (error: string, opts?: { keepStored?: boolean }) => void;
};

/**
 * Shared RunPod job polling with sessionStorage resume + transient retry.
 * Reuse for every future image/video endpoint UI.
 */
export function useGenerationPoll(options: Options) {
  const {
    scope,
    kind,
    intervalMs = 2000,
    maxFailStreak = 5,
    labels,
    getEndpointKey,
    getStartedAt,
    getEtaSec,
    onTick,
    onRunning,
    onCompleted,
    onFailed,
  } = options;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failStreakRef = useRef(0);
  const optsRef = useRef(options);
  optsRef.current = options;

  const stopPoll = useCallback(
    (clearStored = false) => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (clearStored) writeActiveJob(scope, null);
    },
    [scope],
  );

  const startPoll = useCallback(
    (jobId: string, persist: ActiveGenerationJob | true = true) => {
      stopPoll(false);
      failStreakRef.current = 0;

      const job: ActiveGenerationJob =
        persist === true
          ? {
              jobId,
              endpointKey: getEndpointKey(),
              startedAt: getStartedAt() || Date.now(),
              etaSec: getEtaSec() || 120,
              kind,
            }
          : persist;
      writeActiveJob(scope, job);

      pollRef.current = setInterval(async () => {
        const o = optsRef.current;
        try {
          const qs = new URLSearchParams({
            job_id: jobId,
            endpoint_key: o.getEndpointKey() || 'image_24',
            started_at: String(o.getStartedAt() || Date.now()),
            eta_sec: String(o.getEtaSec() || 120),
          });
          if (o.kind) qs.set('kind', o.kind);

          const res = await fetch(`/api/generate/status?${qs.toString()}`);
          const data = (await res.json()) as GenerationStatusPayload;
          if (!res.ok) throw new Error(data.error || 'status failed');

          failStreakRef.current = 0;
          const status = data.status || '…';
          const percent = Number(data.progress?.percent ?? 0);
          const exact = Boolean(data.progress?.exact);
          const label = progressLabelForStatus(status, data.progress?.stage, o.labels);
          o.onTick({ status, percent, exact, label });

          if (data.status === 'COMPLETED') {
            stopPoll(true);
            o.onCompleted(data, jobId);
          } else if (data.status === 'FAILED') {
            stopPoll(true);
            o.onFailed(data.error || 'failed');
          } else {
            o.onRunning();
          }
        } catch (e) {
          failStreakRef.current += 1;
          o.onTick({
            status: 'retrying…',
            percent: 0,
            exact: false,
            label: o.labels.generating,
          });
          if (failStreakRef.current >= maxFailStreak) {
            stopPoll(false); // keep stored job for refresh resume
            o.onFailed(
              `${e instanceof Error ? e.message : 'poll failed'} · 刷新页面可继续查询任务进度`,
              { keepStored: true },
            );
          }
        }
      }, intervalMs);
    },
    [scope, kind, intervalMs, maxFailStreak, getEndpointKey, getStartedAt, getEtaSec, stopPoll],
  );

  const resumeFromStorage = useCallback((): ActiveGenerationJob | null => {
    const saved = readActiveJob(scope);
    if (!saved) return null;
    startPoll(saved.jobId, saved);
    return saved;
  }, [scope, startPoll]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return { startPoll, stopPoll, resumeFromStorage };
}

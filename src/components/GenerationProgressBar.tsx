'use client';

type Props = {
  percent: number;
  label: string;
  exact?: boolean;
  visible: boolean;
};

export function GenerationProgressBar({ percent, label, exact, visible }: Props) {
  if (!visible) return null;
  const p = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div className="gpb" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className="gpb-top">
        <span className="gpb-label">{label}</span>
        <span className="gpb-pct">
          {p}%{exact ? '' : '~'}
        </span>
      </div>
      <div className="gpb-track">
        <div className={`gpb-fill ${exact ? '' : 'soft'}`} style={{ width: `${p}%` }} />
      </div>
      <style jsx>{`
        .gpb {
          width: 100%;
          margin-top: 0.35rem;
        }
        .gpb-top {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
          font-size: 0.8rem;
          color: #cbb9a4;
        }
        .gpb-pct {
          font-variant-numeric: tabular-nums;
          color: #c4a574;
        }
        .gpb-track {
          height: 8px;
          background: #ffffff12;
          overflow: hidden;
        }
        .gpb-fill {
          height: 100%;
          background: linear-gradient(90deg, #8f6b3e, #c4a574);
          transition: width 0.45s ease;
        }
        .gpb-fill.soft {
          background: linear-gradient(90deg, #6a5840, #b89a6a, #6a5840);
          background-size: 200% 100%;
          animation: shimmer 1.6s linear infinite;
        }
        @keyframes shimmer {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
      `}</style>
    </div>
  );
}

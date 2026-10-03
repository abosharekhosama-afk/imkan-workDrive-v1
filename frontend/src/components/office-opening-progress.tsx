'use client';

import { useEffect, useState } from 'react';

export type OfficeOpenStage =
  | 'connecting'
  | 'session'
  | 'document'
  | 'layout'
  | 'ready'
  | 'error';

const STAGE_META: Record<
  Exclude<OfficeOpenStage, 'error' | 'ready'>,
  { label: string; labelAr: string; pct: number }
> = {
  connecting: { label: 'Connecting…', labelAr: 'جارٍ الاتصال…', pct: 12 },
  session: { label: 'Opening session…', labelAr: 'فتح الجلسة…', pct: 35 },
  document: { label: 'Loading document…', labelAr: 'تحميل المستند…', pct: 65 },
  layout: { label: 'Preparing editor…', labelAr: 'تجهيز المحرر…', pct: 88 },
};

type Props = {
  stage: OfficeOpenStage;
  percent?: number;
  title?: string;
  subtitle?: string;
  error?: string | null;
  ar?: boolean;
};

/** Full-screen opening progress for IMKAN Office editors (Show / Writer / Sheet). */
export function OfficeOpeningProgress({ stage, percent, title, subtitle, error, ar }: Props) {
  const [displayPct, setDisplayPct] = useState(0);
  const target =
    typeof percent === 'number'
      ? Math.max(0, Math.min(100, percent))
      : stage === 'ready'
        ? 100
        : stage === 'error'
          ? displayPct
          : STAGE_META[stage as keyof typeof STAGE_META]?.pct ?? 20;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setDisplayPct((p) => {
        if (p >= target) return target;
        const next = p + Math.max(0.8, (target - p) * 0.12);
        return next >= target ? target : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const meta = stage !== 'error' && stage !== 'ready' ? STAGE_META[stage] : null;
  const label =
    error ||
    (meta ? (ar ? meta.labelAr : meta.label) : ar ? 'اكتمل' : 'Ready');

  return (
    <div className="imkan-office-boot" role="status" aria-live="polite" aria-busy={stage !== 'ready' && !error}>
      <div className="imkan-office-boot-card">
        <div className="imkan-office-boot-brand">
          <span className="imkan-office-boot-mark">IMKAN</span>
          <span className="imkan-office-boot-product">{title || (ar ? 'مكتب إمكان' : 'IMKAN Office')}</span>
        </div>
        <p className="imkan-office-boot-sub">{subtitle || (ar ? 'جارٍ فتح المحرر' : 'Opening editor')}</p>
        <div className="imkan-office-boot-bar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayPct)}>
          <span
            className={`imkan-office-boot-fill${error ? ' is-error' : ''}${stage === 'ready' ? ' is-done' : ''}`}
            style={{ width: `${displayPct}%` }}
          />
        </div>
        <div className="imkan-office-boot-meta">
          <span className={error ? 'is-error' : ''}>{label}</span>
          <span>{Math.round(displayPct)}%</span>
        </div>
        {error ? <p className="imkan-office-boot-error">{error}</p> : null}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

export type OfficeOpenStage =
  | 'connecting'
  | 'session'
  | 'document'
  | 'layout'
  | 'ready'
  | 'error';

const STAGES: Record<string, { en: string; ar: string; pct: number }> = {
  connecting: { en: 'Connecting…', ar: 'جارٍ الاتصال…', pct: 15 },
  session: { en: 'Opening session…', ar: 'فتح الجلسة…', pct: 40 },
  document: { en: 'Loading document…', ar: 'تحميل المستند…', pct: 70 },
  layout: { en: 'Preparing editor…', ar: 'تجهيز المحرر…', pct: 90 },
  ready: { en: 'Ready', ar: 'جاهز', pct: 100 },
  error: { en: 'Failed to open', ar: 'فشل الفتح', pct: 100 },
};

type Props = {
  stage?: OfficeOpenStage;
  percent?: number;
  product?: string; // Show | Writer | Sheet
  error?: string | null;
  ar?: boolean;
  onReady?: () => void;
};

/** Loading screen with progress bar under the title (Zoho-like). */
export function OfficeOpeningProgress({
  stage = 'document',
  percent,
  product = 'IMKAN Office',
  error,
  ar,
  onReady,
}: Props) {
  const meta = STAGES[stage] || STAGES.document;
  const target = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : meta.pct;
  const pctRef = useRef(6);
  const readySent = useRef(false);
  const [pct, setPct] = useState(6);

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const current = pctRef.current;
      if (current >= target - 0.4) {
        pctRef.current = target;
        setPct(target);
        if (stage === 'ready' && !error && !readySent.current) {
          readySent.current = true;
          onReady?.();
        }
        return;
      }
      const next = Math.min(target, current + Math.max(0.7, (target - current) * 0.2));
      pctRef.current = next;
      setPct(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [target, stage, error, onReady]);

  const title = `Loading ${product}…`;
  const titleAr = `جارٍ تحميل ${product}…`;
  const status = error || (ar ? meta.ar : meta.en);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg,#f8fafc,#e2e8f0 50%,#dbeafe)',
        padding: 24,
      }}
      role="status"
      aria-live="polite"
      aria-busy={!error && stage !== 'ready'}
    >
      <div
        style={{
          width: 'min(400px, 92vw)',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 12px 40px rgba(15,23,42,.1)',
          padding: '28px 24px 22px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em', marginBottom: 6 }}>
          IMKAN
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 18 }}>
          {ar ? titleAr : title}
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: '#e2e8f0',
            overflow: 'hidden',
            marginBottom: 10,
          }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 999,
              background: error
                ? '#dc2626'
                : 'linear-gradient(90deg,#60a5fa,#2563eb)',
              transition: 'width .2s ease-out',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: error ? '#b91c1c' : '#64748b',
          }}
        >
          <span>{status}</span>
          <span>{Math.round(pct)}%</span>
        </div>
        {error ? (
          <p style={{ marginTop: 12, fontSize: 12, color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: '8px 10px' }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

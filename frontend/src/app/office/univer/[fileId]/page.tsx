'use client';

/**
 * Univer editor page — primary path for documents, spreadsheets, presentations,
 * new files, and template working copies.
 *
 * Native .imkan documents continue under /office/writer|sheet|show.
 * Header always offers "Open in IMKAN Office".
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getFileDetails } from '@/lib/api/files';
import {
  imkanOfficeEditorPath,
  resolveOfficeEditor,
  type OfficeEditor,
} from '@/lib/office-file-routing';

const UniverEditor = dynamic(
  () => import('@/components/univer/univer-editor').then((m) => m.UniverEditor),
  { ssr: false, loading: () => <EditorSkeleton label="Loading Univer…" /> },
);

function EditorSkeleton({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
        color: '#64748b',
        fontSize: 14,
      }}
    >
      {label}
    </div>
  );
}

const KIND_LABEL: Record<OfficeEditor, { en: string; ar: string }> = {
  writer: { en: 'Document', ar: 'مستند' },
  sheet: { en: 'Spreadsheet', ar: 'جدول' },
  show: { en: 'Presentation', ar: 'عرض تقديمي' },
};

export default function UniverOfficePage() {
  const params = useParams<{ fileId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileId = params.fileId;

  const kindParam = searchParams.get('kind') as OfficeEditor | null;
  const templateId = searchParams.get('templateId');

  const [fileName, setFileName] = useState<string>('Document');
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void getFileDetails(fileId)
      .then((file: any) => {
        if (cancelled) return;
        setFileName(file.name || file.originalName || 'Document');
        setMimeType(file.mimeType ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load file details');
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const kind: OfficeEditor = useMemo(() => {
    if (kindParam === 'writer' || kindParam === 'sheet' || kindParam === 'show') return kindParam;
    return resolveOfficeEditor(fileName, mimeType) ?? 'writer';
  }, [kindParam, fileName, mimeType]);

  const imkanHref = useMemo(() => {
    const base =
      imkanOfficeEditorPath(fileId, fileName, mimeType) ??
      `/office/${kind}/${encodeURIComponent(fileId)}`;
    if (!templateId) return base;
    return `${base}${base.includes('?') ? '&' : '?'}templateId=${encodeURIComponent(templateId)}`;
  }, [fileId, fileName, mimeType, kind, templateId]);

  if (loadError) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: '#f8fafc',
        }}
      >
        <p style={{ color: '#b91c1c' }}>{loadError}</p>
        <button
          type="button"
          onClick={() => router.push('/files')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Back to files
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: '#0f172a',
          color: '#e2e8f0',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        <Link href="/files" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 13 }}>
          ← Files
        </Link>
        <span
          style={{
            fontWeight: 600,
            fontSize: 14,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '40vw',
          }}
        >
          {fileName}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#1e293b',
            color: '#38bdf8',
          }}
        >
          Univer · {KIND_LABEL[kind].en}
        </span>
        {templateId && (
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#312e81',
              color: '#c7d2fe',
            }}
          >
            Template
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {ready && <span style={{ fontSize: 11, color: '#64748b' }}>Ready</span>}
          
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, background: '#fff' }}>
        <UniverEditor kind={kind} title={fileName} onReady={() => setReady(true)} className="univer-host" />
      </main>
    </div>
  );
}

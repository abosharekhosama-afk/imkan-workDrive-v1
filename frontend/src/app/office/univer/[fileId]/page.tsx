'use client';

/**
 * Univer editor with real load/save against WorkDrive Office APIs:
 *  - openOfficeSession / openOfficeDocument  → load content
 *  - saveOfficeDocument                     → persist Univer snapshot
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFileDetails } from '@/lib/api/files';
import {
  closeOfficeSession,
  openOfficeDocument,
  openOfficeSession,
  saveOfficeDocument,
  touchOfficeSession,
  type OfficeDocument,
} from '@/lib/api/office';
import {
  extractUniverSnapshot,
  officeTypeToKind,
  wrapUniverContent,
  type UniverKind,
} from '@/lib/univer-persistence';
import { resolveOfficeEditor, type OfficeEditor } from '@/lib/office-file-routing';
import type { UniverEditorHandle } from '@/components/univer/univer-editor';

const UniverEditor = dynamic(
  () => import('@/components/univer/univer-editor').then((m) => m.UniverEditor),
  { ssr: false, loading: () => <Center label="Loading Univer…" /> },
);

function Center({ label }: { label: string }) {
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

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const KIND_LABEL: Record<UniverKind, string> = {
  writer: 'Document',
  sheet: 'Spreadsheet',
  show: 'Presentation',
};

export default function UniverOfficePage() {
  const params = useParams<{ fileId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileId = params.fileId;
  const kindParam = searchParams.get('kind') as OfficeEditor | null;
  const templateId = searchParams.get('templateId');

  const editorRef = useRef<UniverEditorHandle>(null);
  const sessionIdRef = useRef<string | null>(null);
  const revisionRef = useRef<number>(0);
  const touchTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fileName, setFileName] = useState('Document');
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [legacyNotice, setLegacyNotice] = useState(false);
  const [officeType, setOfficeType] = useState<string | null>(null);

  const kind: UniverKind = useMemo(() => {
    if (kindParam === 'writer' || kindParam === 'sheet' || kindParam === 'show') return kindParam;
    if (officeType) return officeTypeToKind(officeType);
    return (resolveOfficeEditor(fileName, mimeType) as UniverKind) ?? 'writer';
  }, [kindParam, officeType, fileName, mimeType]);

  // Load file details + office document content
  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setLoadError(null);
    setSnapshotReady(false);
    setEditorReady(false);
    setSaveState('idle');

    (async () => {
      try {
        const [file, sessionOrDoc] = await Promise.all([
          getFileDetails(fileId).catch(() => null),
          openOfficeSession(fileId).catch(async () => {
            // Fallback when session endpoint fails: open document only
            const doc = await openOfficeDocument(fileId);
            return { sessionId: null as string | null, document: doc };
          }),
        ]);

        if (cancelled) return;

        if (file) {
          setFileName((file as any).name || (file as any).originalName || 'Document');
          setMimeType((file as any).mimeType ?? null);
        }

        const sessionId =
          sessionOrDoc && 'sessionId' in sessionOrDoc ? (sessionOrDoc as any).sessionId : null;
        const document: OfficeDocument =
          sessionOrDoc && 'document' in sessionOrDoc
            ? (sessionOrDoc as any).document
            : (sessionOrDoc as unknown as OfficeDocument);

        sessionIdRef.current = sessionId;
        revisionRef.current = document?.revision ?? 0;
        setOfficeType(document?.type ?? null);

        const extracted = extractUniverSnapshot(document?.content);
        setLegacyNotice(extracted.legacy && !extracted.snapshot);
        setSnapshot(extracted.snapshot);
        setSnapshotReady(true);
        setLoadingDoc(false);

        // Keep session alive
        if (sessionId) {
          touchTimer.current = setInterval(() => {
            void touchOfficeSession(sessionId).catch(() => undefined);
          }, 45_000);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // No office document yet — open empty Univer unit; first save will create content via PATCH
        // (backend bootstrap may still create OfficeDocument on open)
        setLegacyNotice(true);
        setSnapshot(null);
        setSnapshotReady(true);
        setLoadingDoc(false);
        setLoadError(null);
        console.warn('[Univer] open failed, starting empty unit', err);
      }
    })();

    return () => {
      cancelled = true;
      if (touchTimer.current) clearInterval(touchTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      const sid = sessionIdRef.current;
      if (sid) void closeOfficeSession(sid).catch(() => undefined);
    };
  }, [fileId]);

  const performSave = useCallback(async () => {
    const handle = editorRef.current;
    if (!handle?.isReady()) {
      setSaveMessage('Editor is not ready yet');
      setSaveState('error');
      return;
    }
    const snap = handle.getSnapshot();
    if (!snap) {
      setSaveMessage('Could not read document snapshot from Univer');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setSaveMessage(null);
    try {
      const payload = wrapUniverContent(kind, snap);
      const saved = await saveOfficeDocument(
        fileId,
        payload,
        revisionRef.current || undefined,
        sessionIdRef.current ?? undefined,
      );
      revisionRef.current = saved.revision ?? revisionRef.current + 1;
      setSaveState('saved');
      setSaveMessage(`Saved · rev ${revisionRef.current}`);
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveState('error');
      setSaveMessage(msg);
    }
  }, [fileId, kind]);

  const onDirty = useCallback(() => {
    setSaveState((s) => (s === 'saving' ? s : 'dirty'));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void performSave();
    }, 4000);
  }, [performSave]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void performSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [performSave]);

  if (loadError) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <p style={{ color: '#b91c1c' }}>{loadError}</p>
        <button type="button" onClick={() => router.push('/files')} style={btnStyle}>
          Back to files
        </button>
      </div>
    );
  }

  const statusColor =
    saveState === 'error' ? '#f87171' : saveState === 'saved' ? '#4ade80' : saveState === 'dirty' ? '#fbbf24' : '#94a3b8';

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
            maxWidth: '36vw',
          }}
        >
          {fileName}
        </span>
        <span style={chipStyle}>Univer · {KIND_LABEL[kind]}</span>
        {templateId && <span style={{ ...chipStyle, background: '#312e81', color: '#c7d2fe' }}>Template</span>}
        {legacyNotice && (
          <span style={{ ...chipStyle, background: '#422006', color: '#fdba74' }} title="Previous format will be replaced on save">
            New Univer format
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: statusColor }}>
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && (saveMessage || 'Saved')}
            {saveState === 'dirty' && 'Unsaved changes'}
            {saveState === 'error' && (saveMessage || 'Save error')}
            {saveState === 'idle' && editorReady && 'Ready'}
            {loadingDoc && 'Loading…'}
          </span>
          <button
            type="button"
            onClick={() => void performSave()}
            disabled={!editorReady || saveState === 'saving'}
            style={{
              ...btnStyle,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              opacity: !editorReady || saveState === 'saving' ? 0.6 : 1,
            }}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, background: '#fff' }}>
        {loadingDoc || !snapshotReady ? (
          <Center label="Loading document from storage…" />
        ) : (
          <UniverEditor
            ref={editorRef}
            kind={kind}
            title={fileName}
            initialSnapshot={snapshot}
            onReady={() => setEditorReady(true)}
            onDirty={onDirty}
            onError={(m) => {
              setSaveState('error');
              setSaveMessage(m);
            }}
          />
        )}
      </main>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#e2e8f0',
  fontSize: 12,
  cursor: 'pointer',
};

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  background: '#1e293b',
  color: '#38bdf8',
};

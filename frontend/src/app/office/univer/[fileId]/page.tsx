'use client';

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
    <div style={{ display: 'flex', height: '100%', minHeight: 560, alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b', fontSize: 14 }}>
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
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [officeType, setOfficeType] = useState<string | null>(null);

  const kind: UniverKind = useMemo(() => {
    if (kindParam === 'writer' || kindParam === 'sheet' || kindParam === 'show') return kindParam;
    if (officeType) return officeTypeToKind(officeType);
    return (resolveOfficeEditor(fileName, mimeType) as UniverKind) ?? 'writer';
  }, [kindParam, officeType, fileName, mimeType]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setSnapshotReady(false);
    setEditorReady(false);
    setSaveState('idle');
    setBanner(null);

    (async () => {
      try {
        const file = await getFileDetails(fileId).catch(() => null);
        if (cancelled) return;
        if (file) {
          setFileName((file as any).name || (file as any).originalName || 'Document');
          setMimeType((file as any).mimeType ?? null);
        }

        let document: OfficeDocument | null = null;
        let sessionId: string | null = null;

        try {
          const session = await openOfficeSession(fileId);
          sessionId = (session as any).sessionId ?? null;
          document = (session as any).document ?? null;
        } catch (err: any) {
          console.warn('[Univer] openOfficeSession failed, trying openOfficeDocument', err?.message || err);
          try {
            document = await openOfficeDocument(fileId);
          } catch (err2: any) {
            console.warn('[Univer] openOfficeDocument failed — empty unit', err2?.message || err2);
            setBanner(
              err2?.message ||
                err?.message ||
                'Could not load stored office state. Opening a blank Univer editor. Save to create a new document state.',
            );
            document = null;
          }
        }

        if (cancelled) return;

        sessionIdRef.current = sessionId;
        if (document) {
          revisionRef.current = document.revision ?? 0;
          setOfficeType(document.type ?? null);
          const preferredKind = kindParam === 'sheet' || kindParam === 'show' || kindParam === 'writer' ? kindParam : undefined;
          const extracted = extractUniverSnapshot(document.content, preferredKind, (file as any)?.name);
          if (extracted.source === 'imkan') {
            setBanner('Loaded file content into Univer. Save to store in Univer format.');
          } else if (extracted.legacy && !extracted.snapshot) {
            setBanner('Could not map this file content. Starting blank — Save will create Univer format.');
          }
          setSnapshot(extracted.snapshot);
          if (extracted.kind && !kindParam) {
            // Prefer kind stored with Univer content
            setOfficeType(
              extracted.kind === 'sheet' ? 'SHEET' : extracted.kind === 'show' ? 'SHOW' : 'WRITER',
            );
          }
        } else {
          revisionRef.current = 0;
          setSnapshot(null);
        }

        setSnapshotKey((k) => k + 1);
        setSnapshotReady(true);
        setLoadingDoc(false);

        if (sessionId) {
          touchTimer.current = setInterval(() => {
            void touchOfficeSession(sessionId!).catch(() => undefined);
          }, 45_000);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setBanner(err instanceof Error ? err.message : 'Failed to open file');
        setSnapshot(null);
        setSnapshotKey((k) => k + 1);
        setSnapshotReady(true);
        setLoadingDoc(false);
      }
    })();

    return () => {
      cancelled = true;
      if (touchTimer.current) clearInterval(touchTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      const sid = sessionIdRef.current;
      if (sid) void closeOfficeSession(sid).catch(() => undefined);
    };
  }, [fileId, kindParam]);

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
        revisionRef.current > 0 ? revisionRef.current : undefined,
        sessionIdRef.current ?? undefined,
      );
      revisionRef.current = saved.revision ?? revisionRef.current + 1;
      setSaveState('saved');
      setSaveMessage(`Saved · rev ${revisionRef.current}`);
      setBanner(null);
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
        <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '36vw' }}>
          {fileName}
        </span>
        <span style={chipStyle}>Univer · {KIND_LABEL[kind]}</span>
        {templateId && <span style={{ ...chipStyle, background: '#312e81', color: '#c7d2fe' }}>Template</span>}

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
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              opacity: !editorReady || saveState === 'saving' ? 0.6 : 1,
            }}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {banner && (
        <div style={{ background: '#422006', color: '#fdba74', fontSize: 12, padding: '8px 16px', borderBottom: '1px solid #78350f' }}>
          {banner}
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, background: '#fff', display: 'flex', flexDirection: 'column' }}>
        {loadingDoc || !snapshotReady ? (
          <Center label="Loading document from storage…" />
        ) : (
          <div style={{ flex: 1, minHeight: 560, height: '100%' }}>
            <UniverEditor
              key={`${fileId}-${kind}-${snapshotKey}`}
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
          </div>
        )}
      </main>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  background: '#1e293b',
  color: '#38bdf8',
};

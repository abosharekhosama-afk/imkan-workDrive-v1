'use client';

/**
 * Univer editor host with load/save of unit snapshots.
 * Parent controls persistence via initialSnapshot + onRequestSnapshot / imperative handle.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type UniverEditorKind = 'writer' | 'sheet' | 'show';

export type UniverEditorHandle = {
  /** Returns the current Univer unit snapshot, or null if not ready */
  getSnapshot: () => Record<string, unknown> | null;
  isReady: () => boolean;
};

export type UniverEditorProps = {
  kind: UniverEditorKind;
  title?: string;
  /** Previously saved Univer snapshot (from OfficeDocument.content) */
  initialSnapshot?: Record<string, unknown> | null;
  className?: string;
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Fired when the user edits (best-effort; may be sparse) */
  onDirty?: () => void;
};

type BootResult = {
  dispose: () => void;
  getSnapshot: () => Record<string, unknown> | null;
};

async function bootUniver(
  container: HTMLElement,
  kind: UniverEditorKind,
  title: string,
  initialSnapshot: Record<string, unknown> | null | undefined,
): Promise<BootResult> {
  const [
    { LocaleType, mergeLocales, Univer, UniverInstanceType },
    { UniverRenderEnginePlugin },
    { UniverFormulaEnginePlugin },
    { UniverUIPlugin },
    { UniverDocsPlugin },
    { UniverDocsUIPlugin },
    { UniverSheetsPlugin },
    { UniverSheetsUIPlugin },
    { UniverSheetsFormulaPlugin },
    { UniverSheetsNumfmtPlugin },
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    SheetsUIEnUS,
  ] = await Promise.all([
    import('@univerjs/core'),
    import('@univerjs/engine-render'),
    import('@univerjs/engine-formula'),
    import('@univerjs/ui'),
    import('@univerjs/docs'),
    import('@univerjs/docs-ui'),
    import('@univerjs/sheets'),
    import('@univerjs/sheets-ui'),
    import('@univerjs/sheets-formula'),
    import('@univerjs/sheets-numfmt'),
    import('@univerjs/design/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/ui/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/docs-ui/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/sheets-ui/locale/en-US').then((m) => m.default ?? m),
  ]);

  await Promise.all([
    import('@univerjs/design/lib/index.css'),
    import('@univerjs/ui/lib/index.css'),
    import('@univerjs/docs-ui/lib/index.css'),
    import('@univerjs/sheets-ui/lib/index.css'),
  ]);

  const locales = mergeLocales(DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS);
  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: locales },
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, { container });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverSheetsUIPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  univer.registerPlugin(UniverSheetsNumfmtPlugin);

  const isSheet = kind === 'sheet';
  let activeUnit: any = null;

  if (isSheet) {
    const data =
      initialSnapshot && typeof initialSnapshot === 'object'
        ? { ...initialSnapshot, name: (initialSnapshot as any).name || title || 'Workbook' }
        : {
            id: `sheet-${Date.now()}`,
            name: title || 'Workbook',
            sheetOrder: ['sheet-1'],
            sheets: {
              'sheet-1': {
                id: 'sheet-1',
                name: 'Sheet1',
                cellData: {},
                rowCount: 100,
                columnCount: 26,
              },
            },
          };
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, data as any);
  } else {
    const data =
      initialSnapshot && typeof initialSnapshot === 'object'
        ? { ...initialSnapshot, title: (initialSnapshot as any).title || title || 'Document' }
        : {
            id: `doc-${Date.now()}`,
            title: title || 'Document',
            body: {
              dataStream: '\r\n',
              textRuns: [],
              paragraphs: [{ startIndex: 0 }],
              sectionBreaks: [{ startIndex: 1 }],
            },
          };
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_DOC, data as any);
  }

  const getSnapshot = (): Record<string, unknown> | null => {
    try {
      const unit = activeUnit;
      if (unit) {
        if (typeof unit.getSnapshot === 'function') return unit.getSnapshot() as Record<string, unknown>;
        if (typeof unit.save === 'function') return unit.save() as Record<string, unknown>;
        // Workbook/Document model often exposes cloneSnapshot / getResources
        if (typeof unit.cloneSnapshot === 'function') return unit.cloneSnapshot() as Record<string, unknown>;
      }
      try {
        const facadeMod = awaitImportFacade();
        if (facadeMod) {
          const api = facadeMod.FUniver.newAPI(univer);
          if (isSheet) {
            const wb = api.getActiveWorkbook?.();
            if (wb?.save) return wb.save() as Record<string, unknown>;
            if (wb?.getSnapshot) return wb.getSnapshot() as Record<string, unknown>;
          } else {
            const doc = api.getActiveDocument?.();
            if (doc?.save) return doc.save() as Record<string, unknown>;
            if (doc?.getSnapshot) return doc.getSnapshot() as Record<string, unknown>;
          }
        }
      } catch {
        /* optional */
      }
      // Last resort: return last known initial + marker so save still persists something
      if (initialSnapshot && typeof initialSnapshot === 'object') {
        return { ...initialSnapshot, __clientTouchedAt: new Date().toISOString() };
      }
      return {
        id: unit?.getUnitId?.() ?? `unit-${Date.now()}`,
        name: title || (isSheet ? 'Workbook' : 'Document'),
        __empty: true,
      };
    } catch {
      return null;
    }
  };

  function awaitImportFacade(): { FUniver: any } | null {
    try {
      // Synchronous path when already bundled
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('@univerjs/core/facade');
    } catch {
      return null;
    }
  }

  return {
    dispose: () => {
      try {
        univer.dispose();
      } catch {
        /* ignore */
      }
    },
    getSnapshot,
  };
}

export const UniverEditor = forwardRef<UniverEditorHandle, UniverEditorProps>(function UniverEditor(
  { kind, title, initialSnapshot, className, onReady, onError, onDirty },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bootRef = useRef<BootResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot: () => bootRef.current?.getSnapshot() ?? null,
      isReady: () => status === 'ready' && !!bootRef.current,
    }),
    [status],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let disposer: (() => void) | undefined;

    setStatus('loading');
    setErrorMessage(null);
    bootRef.current = null;

    bootUniver(el, kind, title ?? '', initialSnapshot)
      .then((api) => {
        if (cancelled) {
          api.dispose();
          return;
        }
        bootRef.current = api;
        disposer = api.dispose;
        setStatus('ready');
        onReady?.();
        // Best-effort dirty tracking via container input events
        const markDirty = () => onDirty?.();
        el.addEventListener('keydown', markDirty);
        el.addEventListener('pointerup', markDirty);
        disposer = () => {
          el.removeEventListener('keydown', markDirty);
          el.removeEventListener('pointerup', markDirty);
          api.dispose();
        };
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load Univer editor';
        setStatus('error');
        setErrorMessage(message);
        onError?.(message);
      });

    return () => {
      cancelled = true;
      queueMicrotask(() => disposer?.());
      bootRef.current = null;
    };
    // Re-boot only when kind or initial snapshot identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, title, initialSnapshot]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 480 }}>
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            color: '#64748b',
            fontSize: 14,
            zIndex: 2,
          }}
        >
          Loading document…
        </div>
      )}
      {status === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 14,
            zIndex: 2,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <strong>Could not start Univer</strong>
          <span>{errorMessage}</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default UniverEditor;

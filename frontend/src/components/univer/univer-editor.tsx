'use client';

/**
 * Univer-based office editor host.
 * Mounts Univer Docs or Sheets inside a container and disposes on unmount.
 * Imkan Office remains available on /office/writer|sheet|show routes.
 */

import { useEffect, useRef, useState } from 'react';

export type UniverEditorKind = 'writer' | 'sheet' | 'show';

export type UniverEditorProps = {
  kind: UniverEditorKind;
  /** Optional document title shown in the Univer workbook/doc metadata */
  title?: string;
  className?: string;
  /** Called once Univer has finished initializing */
  onReady?: () => void;
  /** Called if initialization fails */
  onError?: (message: string) => void;
};

/**
 * Dynamically loads Univer packages so the main bundle stays lean and SSR is avoided.
 */
async function bootUniver(
  container: HTMLElement,
  kind: UniverEditorKind,
  title: string,
): Promise<{ dispose: () => void }> {
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

  // Styles (side-effect imports)
  await Promise.all([
    import('@univerjs/design/lib/index.css'),
    import('@univerjs/ui/lib/index.css'),
    import('@univerjs/docs-ui/lib/index.css'),
    import('@univerjs/sheets-ui/lib/index.css'),
  ]);

  const locales = mergeLocales(DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS);

  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: locales,
    },
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

  if (kind === 'sheet') {
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
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
    });
  } else {
    // writer + show (presentation not fully supported in open-source core yet → Docs as fallback)
    univer.createUnit(UniverInstanceType.UNIVER_DOC, {
      id: `doc-${Date.now()}`,
      title: title || 'Document',
      body: {
        dataStream: '\r\n',
        textRuns: [],
        paragraphs: [{ startIndex: 0 }],
        sectionBreaks: [{ startIndex: 1 }],
      },
    });
  }

  return {
    dispose: () => {
      try {
        univer.dispose();
      } catch {
        /* ignore dispose races */
      }
    },
  };
}

export function UniverEditor({ kind, title, className, onReady, onError }: UniverEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let disposer: (() => void) | undefined;

    setStatus('loading');
    setErrorMessage(null);

    bootUniver(el, kind, title ?? '')
      .then((api) => {
        if (cancelled) {
          api.dispose();
          return;
        }
        disposer = api.dispose;
        setStatus('ready');
        onReady?.();
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
      // Dispose after React cleanup microtask so nested roots unwind safely
      queueMicrotask(() => disposer?.());
    };
  }, [kind, title, onReady, onError]);

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
          Loading Univer editor…
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
          <span style={{ color: '#64748b', fontSize: 12 }}>
            Run <code>npm install</code> in <code>frontend/</code> to install @univerjs packages.
          </span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default UniverEditor;

'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type UniverEditorKind = 'writer' | 'sheet' | 'show';

export type UniverEditorHandle = {
  getSnapshot: () => Record<string, unknown> | null;
  isReady: () => boolean;
};

export type UniverEditorProps = {
  kind: UniverEditorKind;
  title?: string;
  initialSnapshot?: Record<string, unknown> | null;
  className?: string;
  onReady?: () => void;
  onError?: (message: string) => void;
  onDirty?: () => void;
};

type BootResult = {
  dispose: () => void;
  getSnapshot: () => Record<string, unknown> | null;
};

function defaultSheetData(title: string) {
  return {
    id: `workbook-${Date.now()}`,
    name: title || 'Workbook',
    appVersion: '0.25.1',
    sheets: {
      'sheet-1': {
        id: 'sheet-1',
        name: 'Sheet1',
        tabColor: '',
        hidden: 0,
        rowCount: 100,
        columnCount: 26,
        zoomRatio: 1,
        freeze: { startRow: -1, startColumn: -1, ySplit: 0, xSplit: 0 },
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        mergeData: [],
        cellData: {
          0: { 0: { v: 'Welcome', t: 1 } },
        },
        rowData: {},
        columnData: {},
        showGridlines: 1,
        rowHeader: { width: 46, hidden: 0 },
        columnHeader: { height: 20, hidden: 0 },
        rightToLeft: 0,
      },
    },
    locale: 'enUS',
    sheetOrder: ['sheet-1'],
    styles: {},
  };
}

function defaultDocData(title: string) {
  return {
    id: `doc-${Date.now()}`,
    title: title || 'Document',
    body: {
      dataStream: 'Start typing here.\r\n',
      textRuns: [],
      paragraphs: [{ startIndex: 0 }, { startIndex: 18 }],
      sectionBreaks: [{ startIndex: 19 }],
    },
  };
}

async function bootUniver(
  container: HTMLElement,
  kind: UniverEditorKind,
  title: string,
  initialSnapshot: Record<string, unknown> | null | undefined,
): Promise<BootResult> {
  const [
    core,
    { UniverRenderEnginePlugin },
    { UniverFormulaEnginePlugin },
    { UniverUIPlugin },
    { UniverDocsPlugin },
    { UniverDocsUIPlugin },
    { UniverSheetsPlugin },
    { UniverSheetsUIPlugin },
    { UniverSheetsFormulaPlugin },
    { UniverSheetsNumfmtPlugin },
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
  ]);

  const { LocaleType, mergeLocales, Univer, UniverInstanceType } = core;

  const [DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS] = await Promise.all([
    import('@univerjs/design/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/ui/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/docs-ui/locale/en-US').then((m) => m.default ?? m),
    import('@univerjs/sheets-ui/locale/en-US').then((m) => m.default ?? m),
  ]);

  // CSS is required for the canvas UI to appear
  await Promise.all([
    import('@univerjs/design/lib/index.css'),
    import('@univerjs/ui/lib/index.css'),
    import('@univerjs/docs-ui/lib/index.css'),
    import('@univerjs/sheets-ui/lib/index.css'),
  ]);

  // Ensure container has layout dimensions before Univer mounts
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minHeight = '480px';
  container.style.position = 'relative';

  const locales = mergeLocales(DesignEnUS as any, UIEnUS as any, DocsUIEnUS as any, SheetsUIEnUS as any);
  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: locales },
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container,
    header: true,
    footer: kind === 'sheet',
    toolbar: true,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverSheetsUIPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  univer.registerPlugin(UniverSheetsNumfmtPlugin);

  const isSheet = kind === 'sheet';
  let activeUnit: any = null;

  const hasSnapshot = initialSnapshot && typeof initialSnapshot === 'object' && Object.keys(initialSnapshot).length > 0;

  if (isSheet) {
    const data = hasSnapshot
      ? { ...defaultSheetData(title), ...initialSnapshot, name: (initialSnapshot as any).name || title || 'Workbook' }
      : defaultSheetData(title);
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, data as any);
  } else {
    // writer + show (open-source slides limited → Docs surface with visible starter text)
    const data = hasSnapshot
      ? { ...defaultDocData(title), ...initialSnapshot, title: (initialSnapshot as any).title || title || 'Document' }
      : defaultDocData(kind === 'show' ? title || 'Presentation' : title);
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_DOC, data as any);
  }

  // Force a layout pass so the canvas paints
  requestAnimationFrame(() => {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch {
      /* ignore */
    }
  });

  const getSnapshot = (): Record<string, unknown> | null => {
    try {
      const unit = activeUnit;
      if (unit) {
        if (typeof unit.getSnapshot === 'function') return unit.getSnapshot() as Record<string, unknown>;
        if (typeof unit.save === 'function') return unit.save() as Record<string, unknown>;
        if (typeof unit.cloneSnapshot === 'function') return unit.cloneSnapshot() as Record<string, unknown>;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FUniver } = require('@univerjs/core/facade');
        const api = FUniver.newAPI(univer);
        if (isSheet) {
          const wb = api.getActiveWorkbook?.();
          if (wb?.save) return wb.save() as Record<string, unknown>;
          if (wb?.getSnapshot) return wb.getSnapshot() as Record<string, unknown>;
        } else {
          const doc = api.getActiveDocument?.();
          if (doc?.save) return doc.save() as Record<string, unknown>;
          if (doc?.getSnapshot) return doc.getSnapshot() as Record<string, unknown>;
        }
      } catch {
        /* optional */
      }
      if (hasSnapshot) return { ...(initialSnapshot as object), __clientTouchedAt: new Date().toISOString() } as Record<string, unknown>;
      return isSheet ? (defaultSheetData(title) as unknown as Record<string, unknown>) : (defaultDocData(title) as unknown as Record<string, unknown>);
    } catch {
      return null;
    }
  };

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
        const markDirty = () => onDirty?.();
        el.addEventListener('keydown', markDirty);
        el.addEventListener('pointerup', markDirty);
        disposer = () => {
          el.removeEventListener('keydown', markDirty);
          el.removeEventListener('pointerup', markDirty);
          api.dispose();
        };
        setStatus('ready');
        onReady?.();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load Univer editor';
        console.error('[UniverEditor]', err);
        setStatus('error');
        setErrorMessage(message);
        onError?.(message);
      });

    return () => {
      cancelled = true;
      queueMicrotask(() => disposer?.());
      bootRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, title, initialSnapshot]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, background: '#fff' }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b', fontSize: 14, zIndex: 2 }}>
          Loading editor UI…
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', fontSize: 14, zIndex: 2, padding: 24, textAlign: 'center' }}>
          <strong>Could not start Univer</strong>
          <span>{errorMessage}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>Ensure @univerjs packages are installed (npm install in frontend/).</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 560 }} />
    </div>
  );
});

export default UniverEditor;

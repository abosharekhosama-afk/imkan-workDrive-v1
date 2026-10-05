'use client';

/**
 * Univer host for Documents (writer), Spreadsheets (sheet), and Presentations (show).
 * Presentations use @univerjs/slides + @univerjs/slides-ui (UNIVER_SLIDE unit).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { emptyUniverPresentation, ensureUniverDocSnapshot, ensureUniverSlideSnapshot } from '@/lib/imkan-to-univer';

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
    locale: 'enUS',
    sheetOrder: ['sheet-1'],
    styles: {},
    sheets: {
      'sheet-1': {
        id: 'sheet-1',
        name: 'Sheet1',
        rowCount: 100,
        columnCount: 26,
        zoomRatio: 1,
        cellData: { 0: { 0: { v: 'Welcome', t: 1 } } },
        mergeData: [],
        rowData: {},
        columnData: {},
        showGridlines: 1,
      },
    },
  };
}

function defaultDocData(title: string) {
  return {
    id: `doc-${Date.now()}`,
    title: title || 'Document',
    body: {
      dataStream: 'Start typing here.\r\n',
      textRuns: [{ st: 0, ed: 18, ts: { fs: 14, ff: 'Arial', cl: { rgb: 'rgb(17,24,39)' } } }],
      paragraphs: [{ startIndex: 18 }],
      sectionBreaks: [{ startIndex: 19 }],
    },
    documentStyle: {
      pageSize: { width: 793.7, height: 1122.5 },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
      documentFlavor: 1,
      textStyle: { fs: 14, ff: 'Arial', cl: { rgb: 'rgb(17,24,39)' } },
    },
  };
}

function defaultSlideData(title: string) {
  return emptyUniverPresentation(title || 'Presentation');
}

function kickEditorLayout(container: HTMLElement) {
  const parent = container.parentElement;
  const height = Math.max(560, parent?.clientHeight || 0);
  container.style.width = '100%';
  container.style.height = `${height}px`;
  container.style.minHeight = `${height}px`;
  const fire = () => {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch {
      /* ignore */
    }
  };
  fire();
  requestAnimationFrame(fire);
  window.setTimeout(fire, 80);
  window.setTimeout(fire, 280);
}

async function bootUniver(
  container: HTMLElement,
  kind: UniverEditorKind,
  title: string,
  initialSnapshot: Record<string, unknown> | null | undefined,
): Promise<BootResult> {
  const core = await import('@univerjs/core');
  const { LocaleType, mergeLocales, Univer, UniverInstanceType } = core;

  const [
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

  // Slides (presentations) — open-source packages
  let UniverSlidesPlugin: any = null;
  let UniverSlidesUIPlugin: any = null;
  let UniverDrawingPlugin: any = null;
  let SlidesUIEnUS: any = null;

  if (kind === 'show') {
    try {
      const slidesMod = await import('@univerjs/slides');
      const slidesUiMod = await import('@univerjs/slides-ui');
      UniverSlidesPlugin = slidesMod.UniverSlidesPlugin;
      UniverSlidesUIPlugin = slidesUiMod.UniverSlidesUIPlugin;
      try {
        const drawingMod = await import('@univerjs/drawing');
        UniverDrawingPlugin = (drawingMod as any).UniverDrawingPlugin;
      } catch {
        /* drawing optional on some builds */
      }
      SlidesUIEnUS = (await import('@univerjs/slides-ui/locale/en-US')).default ?? (await import('@univerjs/slides-ui/locale/en-US'));
      await import('@univerjs/slides-ui/lib/index.css');
    } catch (e) {
      console.error('[Univer] slides packages missing — run npm install @univerjs/slides @univerjs/slides-ui', e);
      throw new Error(
        'Presentation editor requires @univerjs/slides and @univerjs/slides-ui. Run: npm install @univerjs/slides@0.25.1 @univerjs/slides-ui@0.25.1',
      );
    }
  }

  const [DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS] = await Promise.all([
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

  container.style.position = 'relative';
  kickEditorLayout(container);

  // @univerjs/slides@0.25.1 does not expose the core slides locale at
  // @univerjs/slides/locale/en-US. Keep the Slides UI locale (when available)
  // and let the core package fall back to the registered UI/core locale.
  const localeBags = [DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS, SlidesUIEnUS].filter(Boolean);
  const locales = mergeLocales(...(localeBags as any[]));

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

  if (kind === 'show') {
    if (UniverDrawingPlugin) univer.registerPlugin(UniverDrawingPlugin);
    univer.registerPlugin(UniverSlidesPlugin);
    univer.registerPlugin(UniverSlidesUIPlugin);
  }

  const hasSnapshot = !!(initialSnapshot && typeof initialSnapshot === 'object' && Object.keys(initialSnapshot).length > 0);
  let activeUnit: any = null;

  if (kind === 'sheet') {
    const data = hasSnapshot
      ? { ...defaultSheetData(title), ...initialSnapshot, name: (initialSnapshot as any).name || title || 'Workbook' }
      : defaultSheetData(title);
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, data as any);
  } else if (kind === 'show') {
    const slideType =
      (UniverInstanceType as any).UNIVER_SLIDE ??
      (UniverInstanceType as any).SLIDE ??
      'slide';
    const merged = hasSnapshot
      ? {
          ...initialSnapshot,
          title: (initialSnapshot as any).title || (initialSnapshot as any).name || title || 'Presentation',
          name: (initialSnapshot as any).name || (initialSnapshot as any).title || title || 'Presentation',
        }
      : defaultSlideData(title);
    const data = ensureUniverSlideSnapshot(merged as Record<string, unknown>, title || 'Presentation');
    activeUnit = univer.createUnit(slideType, data as any);
  } else {
    const merged = hasSnapshot
      ? { ...defaultDocData(title), ...initialSnapshot, title: (initialSnapshot as any).title || title || 'Document' }
      : defaultDocData(title);
    const data = ensureUniverDocSnapshot(merged as Record<string, unknown>);
    activeUnit = univer.createUnit(UniverInstanceType.UNIVER_DOC, data as any);
  }

  kickEditorLayout(container);

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
        if (kind === 'sheet') {
          const wb = api.getActiveWorkbook?.();
          if (wb?.save) return wb.save() as Record<string, unknown>;
          if (wb?.getSnapshot) return wb.getSnapshot() as Record<string, unknown>;
        } else if (kind === 'show') {
          const pres = api.getActivePresentation?.() ?? api.getActiveSlide?.();
          if (pres?.save) return pres.save() as Record<string, unknown>;
          if (pres?.getSnapshot) return pres.getSnapshot() as Record<string, unknown>;
        } else {
          const doc = api.getActiveDocument?.();
          if (doc?.save) return doc.save() as Record<string, unknown>;
          if (doc?.getSnapshot) return doc.getSnapshot() as Record<string, unknown>;
        }
      } catch {
        /* optional */
      }
      if (hasSnapshot) return { ...(initialSnapshot as object) } as Record<string, unknown>;
      if (kind === 'sheet') return defaultSheetData(title) as unknown as Record<string, unknown>;
      if (kind === 'show') return defaultSlideData(title) as unknown as Record<string, unknown>;
      return defaultDocData(title) as unknown as Record<string, unknown>;
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
          {kind === 'show' ? 'Loading presentation editor…' : kind === 'sheet' ? 'Loading spreadsheet…' : 'Loading document…'}
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', fontSize: 14, zIndex: 2, padding: 24, textAlign: 'center' }}>
          <strong>Could not start Univer ({kind})</strong>
          <span>{errorMessage}</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 560 }} />
    </div>
  );
});

export default UniverEditor;

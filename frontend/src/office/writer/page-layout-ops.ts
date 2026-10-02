import type { WriterDocument, WriterPageSettings, WriterSection } from './model';
import { insertSectionBreak, updatePageSettings, updateSection } from './commands';
import { pageDimensionsMm } from './print-layout';

export type PageSetupForm = {
  size: WriterPageSettings['size'];
  orientation: WriterPageSettings['orientation'];
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  widthMm: number;
  heightMm: number;
  header: string;
  footer: string;
  firstHeader: string;
  firstFooter: string;
  oddHeader: string;
  oddFooter: string;
  evenHeader: string;
  evenFooter: string;
  showPageNumbers: boolean;
  pageNumberFormat: NonNullable<WriterPageSettings['pageNumberFormat']>;
  pageNumberStart: number;
  differentFirstPage: boolean;
  differentOddEven: boolean;
  columns: number;
  columnGapMm: number;
  breakType: 'next-page' | 'continuous' | 'even-page' | 'odd-page';
};

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Normalize page settings to safe printable values (Zoho-like constraints). */
export function normalizePageSettings(page: Partial<WriterPageSettings>): WriterPageSettings {
  const size = (['A4', 'LETTER', 'LEGAL', 'CUSTOM'].includes(String(page.size)) ? page.size : 'A4') as WriterPageSettings['size'];
  const orientation = page.orientation === 'landscape' ? 'landscape' : 'portrait';
  const base: WriterPageSettings = {
    size,
    orientation,
    marginTopMm: clamp(Number(page.marginTopMm), 0, 80, 20),
    marginRightMm: clamp(Number(page.marginRightMm), 0, 80, 20),
    marginBottomMm: clamp(Number(page.marginBottomMm), 0, 80, 20),
    marginLeftMm: clamp(Number(page.marginLeftMm), 0, 80, 20),
    widthMm: clamp(Number(page.widthMm), 80, 500, 210),
    heightMm: clamp(Number(page.heightMm), 80, 500, 297),
    header: typeof page.header === 'string' ? page.header.slice(0, 500) : '',
    footer: typeof page.footer === 'string' ? page.footer.slice(0, 500) : '',
    showPageNumbers: page.showPageNumbers !== false,
    differentFirstPage: Boolean(page.differentFirstPage),
    differentOddEven: Boolean(page.differentOddEven),
    pageNumberStart: clamp(Number(page.pageNumberStart), 1, 99999, 1),
    pageNumberFormat: (['decimal', 'roman-lower', 'roman-upper', 'letter-upper', 'letter-lower'].includes(String(page.pageNumberFormat))
      ? page.pageNumberFormat
      : 'decimal') as WriterPageSettings['pageNumberFormat'],
    firstHeader: typeof (page as any).firstHeader === 'string' ? (page as any).firstHeader.slice(0, 500) : (page as any).firstHeader,
    firstFooter: typeof (page as any).firstFooter === 'string' ? (page as any).firstFooter.slice(0, 500) : (page as any).firstFooter,
    oddHeader: typeof (page as any).oddHeader === 'string' ? (page as any).oddHeader.slice(0, 500) : (page as any).oddHeader,
    oddFooter: typeof (page as any).oddFooter === 'string' ? (page as any).oddFooter.slice(0, 500) : (page as any).oddFooter,
    evenHeader: typeof (page as any).evenHeader === 'string' ? (page as any).evenHeader.slice(0, 500) : (page as any).evenHeader,
    evenFooter: typeof (page as any).evenFooter === 'string' ? (page as any).evenFooter.slice(0, 500) : (page as any).evenFooter,
  };
  return base;
}

export function pageSetupFormFromDoc(doc: WriterDocument): PageSetupForm {
  const p = doc.page || ({} as WriterPageSettings);
  const dims = pageDimensionsMm(p);
  return {
    size: (p.size as any) || 'A4',
    orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginTop: p.marginTopMm ?? 20,
    marginRight: p.marginRightMm ?? 20,
    marginBottom: p.marginBottomMm ?? 20,
    marginLeft: p.marginLeftMm ?? 20,
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    header: p.header || '',
    footer: p.footer || '',
    firstHeader: (p as any).firstHeader || '',
    firstFooter: (p as any).firstFooter || '',
    oddHeader: (p as any).oddHeader || '',
    oddFooter: (p as any).oddFooter || '',
    evenHeader: (p as any).evenHeader || '',
    evenFooter: (p as any).evenFooter || '',
    showPageNumbers: p.showPageNumbers !== false,
    pageNumberFormat: (p.pageNumberFormat as any) || 'decimal',
    pageNumberStart: p.pageNumberStart ?? 1,
    differentFirstPage: Boolean(p.differentFirstPage),
    differentOddEven: Boolean(p.differentOddEven),
    columns: 1,
    columnGapMm: 8,
    breakType: 'next-page',
  };
}

/** Apply page-level setup (document default margins/headers). */
export function applyDocumentPageSetup(doc: WriterDocument, form: PageSetupForm): WriterDocument {
  const patch = normalizePageSettings({
    size: form.size,
    orientation: form.orientation,
    marginTopMm: form.marginTop,
    marginRightMm: form.marginRight,
    marginBottomMm: form.marginBottom,
    marginLeftMm: form.marginLeft,
    widthMm: form.widthMm,
    heightMm: form.heightMm,
    header: form.header,
    footer: form.footer,
    showPageNumbers: form.showPageNumbers,
    pageNumberFormat: form.pageNumberFormat,
    pageNumberStart: form.pageNumberStart,
    differentFirstPage: form.differentFirstPage,
    differentOddEven: form.differentOddEven,
    firstHeader: form.firstHeader,
    firstFooter: form.firstFooter,
    oddHeader: form.oddHeader,
    oddFooter: form.oddFooter,
    evenHeader: form.evenHeader,
    evenFooter: form.evenFooter,
  } as any);
  return updatePageSettings(doc, patch);
}

/** Apply section break + section-local headers/columns (Zoho section setup). */
export function applySectionPageSetup(doc: WriterDocument, afterBlockId: string | undefined, form: PageSetupForm): WriterDocument {
  let next = insertSectionBreak(doc, afterBlockId, form.columns, form.breakType);
  const sec = next.sections[next.sections.length - 1];
  if (!sec) return next;
  next = updateSection(next, sec.id, {
    columns: clamp(form.columns, 1, 4, 1),
    columnGapMm: clamp(form.columnGapMm, 4, 40, 8),
    breakType: form.breakType,
    header: form.header,
    footer: form.footer,
    firstHeader: form.firstHeader,
    firstFooter: form.firstFooter,
    oddHeader: form.oddHeader,
    oddFooter: form.oddFooter,
    evenHeader: form.evenHeader,
    evenFooter: form.evenFooter,
    differentFirstPage: form.differentFirstPage,
    differentOddEven: form.differentOddEven,
    pageNumberStart: clamp(form.pageNumberStart, 1, 99999, 1),
    pageNumberFormat: form.pageNumberFormat,
  } as Partial<WriterSection>);
  // Also refresh document-level defaults for margins/size
  next = applyDocumentPageSetup(next, form);
  return next;
}

export function clampZoom(percent: number): number {
  return clamp(Math.round(percent), 50, 200, 100);
}

export function contentWidthMm(page: WriterPageSettings): number {
  const { widthMm } = pageDimensionsMm(page);
  return Math.max(40, widthMm - (page.marginLeftMm ?? 20) - (page.marginRightMm ?? 20));
}

import type { WriterDocument, WriterPageSettings, WriterSection } from './model';

export function pageDimensionsMm(page: WriterPageSettings) {
  const presets: Record<string, [number, number]> = {
    A4: [210, 297], LETTER: [216, 279], LEGAL: [216, 356],
  };
  const [baseW, baseH] = presets[page.size] ?? [page.widthMm || 210, page.heightMm || 297];
  const width = page.size === 'CUSTOM' ? (page.widthMm || baseW) : baseW;
  const height = page.size === 'CUSTOM' ? (page.heightMm || baseH) : baseH;
  return page.orientation === 'landscape' ? { widthMm: height, heightMm: width } : { widthMm: width, heightMm: height };
}

export function printPageCss(page: WriterPageSettings) {
  const { widthMm, heightMm } = pageDimensionsMm(page);
  return `@page{size:${widthMm}mm ${heightMm}mm;margin:0}`;
}

export function sectionHeaderFooter(doc: WriterDocument, section: WriterSection | undefined, pageOrdinal: number, pageNumber: number) {
  const first = Boolean((section?.differentFirstPage ?? doc.page.differentFirstPage) && pageOrdinal === 1);
  const odd = pageNumber % 2 === 1;
  const differentOddEven = section?.differentOddEven ?? doc.page.differentOddEven;
  const header = first
    ? (section?.firstHeader ?? '')
    : differentOddEven
      ? (odd ? (section?.oddHeader ?? section?.header ?? doc.page.header) : (section?.evenHeader ?? section?.header ?? doc.page.header))
      : (section?.header ?? doc.page.header);
  const footer = first
    ? (section?.firstFooter ?? '')
    : differentOddEven
      ? (odd ? (section?.oddFooter ?? section?.footer ?? doc.page.footer) : (section?.evenFooter ?? section?.footer ?? doc.page.footer))
      : (section?.footer ?? doc.page.footer);
  return { header: header || '', footer: footer || '', showPageNumber: doc.page.showPageNumbers !== false };
}

export function printBlockStyle(options: { pageBreakBefore?: boolean; keepWithNext?: boolean }) {
  return {
    breakBefore: options.pageBreakBefore ? 'page' as const : 'auto' as const,
    pageBreakBefore: options.pageBreakBefore ? 'always' as const : 'auto' as const,
    breakAfter: options.keepWithNext ? 'avoid' as const : 'auto' as const,
    pageBreakAfter: options.keepWithNext ? 'avoid' as const : 'auto' as const,
  };
}

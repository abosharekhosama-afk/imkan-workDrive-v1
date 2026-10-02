import type { WriterSection } from './model';

export function sectionColumnStyle(section?: Pick<WriterSection, 'columns'|'columnGapMm'>) {
  const columns = Math.max(1, Math.min(4, section?.columns ?? 1));
  const gap = Math.max(4, Math.min(40, section?.columnGapMm ?? 8));
  return columns > 1
    ? { columnCount: columns, columnGap: `${gap}mm`, columnFill: 'auto' as const }
    : { columnCount: 1, columnGap: `${gap}mm`, columnFill: 'auto' as const };
}

export function imageWrapStyle(wrap?: string, direction: 'ltr'|'rtl' = 'ltr') {
  if (wrap === 'square') return { float: 'inline-start' as const, marginInlineEnd: '12px', marginBlockEnd: '8px' };
  if (wrap === 'behind') return { position: 'absolute' as const, insetInlineStart: '0', insetBlockStart: '0', zIndex: 0 };
  if (wrap === 'front') return { position: 'relative' as const, zIndex: 10 };
  return { display: 'block' as const, marginInline: 'auto' };
}

export function tableBreakStyle(allowRowBreak = true) {
  return {
    breakInside: allowRowBreak ? 'auto' as const : 'avoid' as const,
    pageBreakInside: allowRowBreak ? 'auto' as const : 'avoid' as const,
  };
}

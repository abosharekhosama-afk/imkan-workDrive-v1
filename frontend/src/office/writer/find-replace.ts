import type { WriterBlock, WriterDocument, WriterRun } from './model';

export type FindMatch = { blockId: string; start: number; end: number; text: string };

function blockText(block: WriterBlock): string { return (block.runs ?? []).map(r => r.text || '').join(''); }

export function findMatches(doc: WriterDocument, query: string, caseSensitive = false): FindMatch[] {
  const q = query.trim(); if (!q) return [];
  const needle = caseSensitive ? q : q.toLocaleLowerCase();
  const out: FindMatch[] = [];
  for (const block of doc.blocks) {
    const text = blockText(block);
    const haystack = caseSensitive ? text : text.toLocaleLowerCase();
    let from = 0;
    while (from <= haystack.length) {
      const index = haystack.indexOf(needle, from);
      if (index < 0) break;
      out.push({ blockId: block.id, start: index, end: index + q.length, text: text.slice(index, index + q.length) });
      from = index + Math.max(1, needle.length);
    }
  }
  return out;
}

export function nextFindMatch(doc: WriterDocument, query: string, current?: FindMatch, caseSensitive = false): FindMatch | undefined {
  const matches = findMatches(doc, query, caseSensitive); if (!matches.length) return undefined;
  if (!current) return matches[0];
  const index = matches.findIndex(m => m.blockId === current.blockId && m.start === current.start && m.end === current.end);
  return matches[(index + 1 + matches.length) % matches.length];
}

function replaceInRuns(runs: WriterRun[], start: number, end: number, replacement: string): WriterRun[] {
  const next: WriterRun[] = [];
  let offset = 0;
  let inserted = false;
  for (const run of runs) {
    const text = run.text || '';
    const runStart = offset; const runEnd = offset + text.length;
    const overlaps = runStart < end && runEnd > start;
    if (!overlaps) { next.push({ ...run }); offset = runEnd; continue; }
    const left = text.slice(0, Math.max(0, start - runStart));
    const right = text.slice(Math.max(0, end - runStart));
    if (left) next.push({ ...run, text: left });
    if (!inserted) { next.push({ ...run, text: replacement }); inserted = true; }
    if (right) next.push({ ...run, text: right });
    offset = runEnd;
  }
  if (!next.length) return [{ text: replacement }];
  const merged: WriterRun[] = [];
  for (const run of next) { const prev = merged[merged.length - 1]; if (prev && JSON.stringify({...prev, text: undefined}) === JSON.stringify({...run, text: undefined})) prev.text += run.text; else merged.push(run); }
  return merged;
}

export function replaceAllMatches(doc: WriterDocument, query: string, replacement: string, caseSensitive = false): { doc: WriterDocument; count: number } {
  const matches = findMatches(doc, query, caseSensitive);
  if (!matches.length) return { doc, count: 0 };
  const grouped = new Map<string, FindMatch[]>();
  for (const match of matches) grouped.set(match.blockId, [...(grouped.get(match.blockId) ?? []), match]);
  const next = JSON.parse(JSON.stringify(doc)) as WriterDocument;
  for (const block of next.blocks) {
    const blockMatches = grouped.get(block.id);
    if (!blockMatches?.length) continue;
    for (const match of [...blockMatches].reverse()) block.runs = replaceInRuns(block.runs ?? [], match.start, match.end, replacement);
  }
  return { doc: next, count: matches.length };
}

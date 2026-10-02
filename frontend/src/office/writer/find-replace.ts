import type { WriterBlock, WriterDocument, WriterRun } from './model';

export type FindMatch = {
  blockId: string;
  start: number;
  end: number;
  text: string;
  /** Present when the match is inside a table cell. */
  cell?: { row: number; col: number };
};

export type FindOptions = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
};

function runsText(runs: WriterRun[] | undefined): string {
  return (runs ?? []).map((r) => r.text || '').join('');
}

function blockText(block: WriterBlock): string {
  return runsText(block.runs);
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[0-9A-Za-z\u00C0-\u024F\u0600-\u06FF_]/.test(ch);
}

function isWholeWordMatch(haystack: string, index: number, length: number): boolean {
  const before = index > 0 ? haystack[index - 1] : undefined;
  const after = index + length < haystack.length ? haystack[index + length] : undefined;
  return !isWordChar(before) && !isWordChar(after);
}

function scanText(
  text: string,
  query: string,
  options: FindOptions,
  base: Omit<FindMatch, 'start' | 'end' | 'text'>,
): FindMatch[] {
  const q = query;
  if (!q) return [];
  const caseSensitive = Boolean(options.caseSensitive);
  const wholeWord = Boolean(options.wholeWord);
  const needle = caseSensitive ? q : q.toLocaleLowerCase();
  const haystack = caseSensitive ? text : text.toLocaleLowerCase();
  const out: FindMatch[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    if (!wholeWord || isWholeWordMatch(haystack, index, needle.length)) {
      out.push({
        ...base,
        start: index,
        end: index + q.length,
        text: text.slice(index, index + q.length),
      });
    }
    from = index + Math.max(1, needle.length);
  }
  return out;
}

export function findMatches(doc: WriterDocument, query: string, caseSensitiveOrOptions: boolean | FindOptions = false): FindMatch[] {
  const options: FindOptions =
    typeof caseSensitiveOrOptions === 'boolean'
      ? { caseSensitive: caseSensitiveOrOptions }
      : caseSensitiveOrOptions || {};
  const q = query.trim();
  if (!q) return [];
  const out: FindMatch[] = [];
  for (const block of doc.blocks) {
    if (block.type === 'table' && block.table?.rows) {
      block.table.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell.hidden) return;
          out.push(...scanText(runsText(cell.runs), q, options, { blockId: block.id, cell: { row: r, col: c } }));
        });
      });
      continue;
    }
    out.push(...scanText(blockText(block), q, options, { blockId: block.id }));
  }
  return out;
}

function matchKey(m: FindMatch): string {
  return `${m.blockId}:${m.cell ? `${m.cell.row}:${m.cell.col}` : '-'}:${m.start}:${m.end}`;
}

export function nextFindMatch(
  doc: WriterDocument,
  query: string,
  current?: FindMatch,
  caseSensitiveOrOptions: boolean | FindOptions = false,
): FindMatch | undefined {
  const matches = findMatches(doc, query, caseSensitiveOrOptions);
  if (!matches.length) return undefined;
  if (!current) return matches[0];
  const index = matches.findIndex((m) => matchKey(m) === matchKey(current));
  return matches[(index + 1 + matches.length) % matches.length];
}

export function previousFindMatch(
  doc: WriterDocument,
  query: string,
  current?: FindMatch,
  caseSensitiveOrOptions: boolean | FindOptions = false,
): FindMatch | undefined {
  const matches = findMatches(doc, query, caseSensitiveOrOptions);
  if (!matches.length) return undefined;
  if (!current) return matches[matches.length - 1];
  const index = matches.findIndex((m) => matchKey(m) === matchKey(current));
  return matches[(index - 1 + matches.length) % matches.length];
}

export function matchIndexOf(
  doc: WriterDocument,
  query: string,
  current: FindMatch | undefined,
  caseSensitiveOrOptions: boolean | FindOptions = false,
): { index: number; total: number } {
  const matches = findMatches(doc, query, caseSensitiveOrOptions);
  if (!matches.length || !current) return { index: 0, total: matches.length };
  const index = matches.findIndex((m) => matchKey(m) === matchKey(current));
  return { index: index >= 0 ? index + 1 : 0, total: matches.length };
}

function replaceInRuns(runs: WriterRun[], start: number, end: number, replacement: string): WriterRun[] {
  const next: WriterRun[] = [];
  let offset = 0;
  let inserted = false;
  for (const run of runs) {
    const text = run.text || '';
    const runStart = offset;
    const runEnd = offset + text.length;
    const overlaps = runStart < end && runEnd > start;
    if (!overlaps) {
      next.push({ ...run });
      offset = runEnd;
      continue;
    }
    const left = text.slice(0, Math.max(0, start - runStart));
    const right = text.slice(Math.max(0, end - runStart));
    if (left) next.push({ ...run, text: left });
    if (!inserted) {
      next.push({ ...run, text: replacement });
      inserted = true;
    }
    if (right) next.push({ ...run, text: right });
    offset = runEnd;
  }
  if (!next.length) return [{ text: replacement }];
  const merged: WriterRun[] = [];
  for (const run of next) {
    const prev = merged[merged.length - 1];
    if (prev && JSON.stringify({ ...prev, text: undefined }) === JSON.stringify({ ...run, text: undefined })) {
      prev.text += run.text;
    } else {
      merged.push(run);
    }
  }
  return merged;
}

function applyMatchReplace(doc: WriterDocument, match: FindMatch, replacement: string): WriterDocument {
  const next = JSON.parse(JSON.stringify(doc)) as WriterDocument;
  const block = next.blocks.find((b) => b.id === match.blockId);
  if (!block) return next;
  if (match.cell && block.table?.rows) {
    const cell = block.table.rows[match.cell.row]?.[match.cell.col];
    if (cell) cell.runs = replaceInRuns(cell.runs ?? [], match.start, match.end, replacement);
    return next;
  }
  block.runs = replaceInRuns(block.runs ?? [], match.start, match.end, replacement);
  return next;
}

/** Replace a single match and return the updated document plus a suggested next match. */
export function replaceCurrentMatch(
  doc: WriterDocument,
  query: string,
  replacement: string,
  current: FindMatch,
  caseSensitiveOrOptions: boolean | FindOptions = false,
): { doc: WriterDocument; count: number; next?: FindMatch } {
  const updated = applyMatchReplace(doc, current, replacement);
  // After replace, find next from the same logical position (may shift offsets)
  const matches = findMatches(updated, query, caseSensitiveOrOptions);
  const sameBlock = matches.find(
    (m) =>
      m.blockId === current.blockId &&
      (current.cell
        ? m.cell?.row === current.cell.row && m.cell?.col === current.cell.col && m.start >= current.start
        : !m.cell && m.start >= current.start),
  );
  const next = sameBlock ?? nextFindMatch(updated, query, undefined, caseSensitiveOrOptions);
  return { doc: updated, count: 1, next };
}

export function replaceAllMatches(
  doc: WriterDocument,
  query: string,
  replacement: string,
  caseSensitiveOrOptions: boolean | FindOptions = false,
): { doc: WriterDocument; count: number } {
  const matches = findMatches(doc, query, caseSensitiveOrOptions);
  if (!matches.length) return { doc, count: 0 };
  // Replace from end to start so earlier offsets stay valid within each target.
  const ordered = [...matches].sort((a, b) => {
    if (a.blockId !== b.blockId) return a.blockId < b.blockId ? -1 : 1;
    const ac = a.cell ? a.cell.row * 1000 + a.cell.col : -1;
    const bc = b.cell ? b.cell.row * 1000 + b.cell.col : -1;
    if (ac !== bc) return bc - ac;
    return b.start - a.start;
  });
  let next = doc;
  for (const match of ordered) {
    next = applyMatchReplace(next, match, replacement);
  }
  return { doc: next, count: matches.length };
}

import type { WriterRun } from './model';

export type SelectionRunPatch = Partial<Pick<WriterRun,'bold'|'italic'|'underline'|'strike'|'fontFamily'|'fontSize'|'color'|'highlight'|'verticalAlign'|'href'>>;

export type ToggleMark = 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript';

function mergeRuns(runs: WriterRun[]): WriterRun[] {
  const out: WriterRun[] = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.bold === run.bold &&
      prev.italic === run.italic &&
      prev.underline === run.underline &&
      prev.strike === run.strike &&
      prev.fontFamily === run.fontFamily &&
      prev.fontSize === run.fontSize &&
      prev.color === run.color &&
      prev.href === run.href &&
      prev.highlight === run.highlight &&
      prev.verticalAlign === run.verticalAlign
    ) {
      prev.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out.length ? out : [{ text: '' }];
}

/** Returns true when every character in [start, end) carries the given boolean mark. */
export function rangeHasFormat(runs: WriterRun[], start: number, end: number, mark: ToggleMark): boolean {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(from, end);
  if (from === to) return false;
  let offset = 0;
  let covered = 0;
  for (const run of runs) {
    const text = run.text || '';
    const runStart = offset;
    const runEnd = offset + text.length;
    const overlapStart = Math.max(from, runStart);
    const overlapEnd = Math.min(to, runEnd);
    if (overlapStart < overlapEnd) {
      const has =
        mark === 'bold' ? Boolean(run.bold) :
        mark === 'italic' ? Boolean(run.italic) :
        mark === 'underline' ? Boolean(run.underline) :
        mark === 'strike' ? Boolean(run.strike) :
        mark === 'superscript' ? run.verticalAlign === 'superscript' :
        run.verticalAlign === 'subscript';
      if (!has) return false;
      covered += overlapEnd - overlapStart;
    }
    offset = runEnd;
  }
  return covered === to - from;
}

export function patchRunsInRange(runs: WriterRun[], start: number, end: number, patch: SelectionRunPatch): WriterRun[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(from, end);
  if (from === to) return runs.map(run => ({ ...run }));
  let offset = 0;
  const out: WriterRun[] = [];
  for (const run of runs) {
    const text = run.text || '';
    const runStart = offset;
    const runEnd = offset + text.length;
    const overlapStart = Math.max(from, runStart);
    const overlapEnd = Math.min(to, runEnd);
    if (overlapStart < overlapEnd) {
      const a = text.slice(0, overlapStart - runStart);
      const selected = text.slice(overlapStart - runStart, overlapEnd - runStart);
      const b = text.slice(overlapEnd - runStart);
      if (a) out.push({ ...run, text: a });
      out.push({ ...run, ...patch, text: selected });
      if (b) out.push({ ...run, text: b });
    } else {
      out.push({ ...run });
    }
    offset = runEnd;
  }
  return mergeRuns(out.length ? out : [{ text: '' }]);
}

/** Toggle a boolean mark on the selected range (off only when the whole range already has it). */
export function toggleMarkInRange(runs: WriterRun[], start: number, end: number, mark: ToggleMark): WriterRun[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(from, end);
  if (from === to) return runs.map(run => ({ ...run }));
  const active = rangeHasFormat(runs, from, to, mark);
  if (mark === 'superscript' || mark === 'subscript') {
    const nextAlign = active ? 'baseline' : mark === 'superscript' ? 'superscript' : 'subscript';
    return patchRunsInRange(runs, from, to, { verticalAlign: nextAlign as WriterRun['verticalAlign'] });
  }
  const patch: SelectionRunPatch = { [mark]: !active } as SelectionRunPatch;
  return patchRunsInRange(runs, from, to, patch);
}

/** Clear character formatting on the selected range only. */
export function clearFormatInRange(runs: WriterRun[], start: number, end: number): WriterRun[] {
  return patchRunsInRange(runs, start, end, {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    fontFamily: undefined,
    fontSize: undefined,
    color: undefined,
    highlight: undefined,
    verticalAlign: 'baseline',
  });
}

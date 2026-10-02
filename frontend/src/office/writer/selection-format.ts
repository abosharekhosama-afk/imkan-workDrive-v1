import type { WriterRun } from './model';

export type SelectionRunPatch = Partial<Pick<WriterRun,'bold'|'italic'|'underline'|'strike'|'fontFamily'|'fontSize'|'color'|'highlight'|'verticalAlign'>>;

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
  return out.length ? out : [{ text: '' }];
}

export type SelectionFormatRun = { text: string; [key: string]: unknown };
export type SelectionFormatPatch = Record<string, unknown>;
export function rangeHasFormat(runs: SelectionFormatRun[], start: number, end: number, key: string): boolean {
  const from=Math.max(0,Math.min(start,end)), to=Math.max(from,Math.max(start,end));
  let offset=0, covered=0, formatted=0;
  for(const run of runs){ const text=String(run.text??''); const a=Math.max(from,offset), b=Math.min(to,offset+text.length); if(b>a){covered+=b-a;if(run[key]===true)formatted+=b-a;} offset+=text.length; if(offset>=to)break; }
  return covered>0 && covered===formatted;
}

/** Pure range formatter used by the Writer selection model. Range is [start,end). */
export function patchRunsInRange<T extends SelectionFormatRun>(runs: T[], start: number, end: number, patch: SelectionFormatPatch): T[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(from, Math.max(start, end));
  if (from === to) return runs.map(run => ({ ...run }));
  const out: T[] = [];
  let offset = 0;
  for (const run of runs) {
    const text = String(run.text ?? '');
    const runStart = offset;
    const runEnd = offset + text.length;
    if (runEnd <= from || runStart >= to) {
      out.push({ ...run });
      offset = runEnd;
      continue;
    }
    const localStart = Math.max(0, from - runStart);
    const localEnd = Math.min(text.length, to - runStart);
    if (localStart > 0) out.push({ ...run, text: text.slice(0, localStart) });
    out.push({ ...run, text: text.slice(localStart, localEnd), ...patch });
    if (localEnd < text.length) out.push({ ...run, text: text.slice(localEnd) });
    offset = runEnd;
  }
  return out.length ? out : [{ text: '' } as T];
}


export function patchSelectionFormat<T extends SelectionFormatRun>(
  runs: T[],
  start: number,
  end: number,
  patch: SelectionFormatPatch,
): T[] {
  return patchRunsInRange(runs, start, end, patch);
}

export function clearSelectionFormatting<T extends SelectionFormatRun>(runs: T[], start: number, end: number): T[] {
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

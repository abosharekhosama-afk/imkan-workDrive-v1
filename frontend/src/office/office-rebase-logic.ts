export type RebasePatch = { op: 'set' | 'delete'; path: string; value?: unknown };

const ORDER_PATHS = {
  '/blockOrder': 'blocks',
  '/sheetOrder': 'sheets',
  '/slideOrder': 'slides',
} as const;

export function rebasePathsOverlap(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export function mergeIdOrder(remoteIds: string[], localIds: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of localIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of remoteIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function planOfficeRebase(
  localPatches: RebasePatch[],
  remotePatches: RebasePatch[],
  remoteDocument: unknown,
  mode: 'safe' | 'adopt',
): { safe: RebasePatch[]; pending: RebasePatch[] } {
  const safe: RebasePatch[] = [];
  const pending: RebasePatch[] = [];
  const remote = remoteDocument && typeof remoteDocument === 'object' ? remoteDocument as Record<string, unknown> : {};
  for (const patch of localPatches) {
    const listKey = ORDER_PATHS[patch.path as keyof typeof ORDER_PATHS];
    if (listKey && patch.op === 'set') {
      const list = Array.isArray(remote[listKey]) ? remote[listKey] as Array<{ id?: string }> : [];
      const remoteIds = list.map((item) => String(item?.id ?? '')).filter(Boolean);
      const localIds = Array.isArray(patch.value) ? patch.value.map((id) => String(id)) : remoteIds;
      safe.push({ ...patch, value: mergeIdOrder(remoteIds, localIds) });
      continue;
    }
    const overlaps = remotePatches.some((remotePatch) => rebasePathsOverlap(patch.path, remotePatch.path));
    if (overlaps && mode === 'safe') pending.push(patch);
    else safe.push(patch);
  }
  return { safe, pending };
}
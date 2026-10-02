import type { WriterBlock, WriterDocument } from './model.ts';

export type WriterConflictChoice = 'local' | 'remote';
export type WriterConflictEntry = {
  id: string;
  kind: 'block' | 'document';
  label: string;
  local: unknown;
  remote: unknown;
  conflict: boolean;
  defaultChoice: WriterConflictChoice;
};

const stable = (value: unknown) => JSON.stringify(value);

export function buildWriterConflictEntries(local: WriterDocument | null, remote: WriterDocument | null): WriterConflictEntry[] {
  if (!local || !remote) return [];
  const entries: WriterConflictEntry[] = [];
  const metadataKeys = ['title', 'language', 'page', 'review', 'sections', 'citations', 'captions', 'crossReferences', 'indexEntries', 'bookmarks', 'footnotes'] as const;
  for (const key of metadataKeys) {
    const a = local[key];
    const b = remote[key];
    if (stable(a) === stable(b)) continue;
    entries.push({ id: `document:${key}`, kind: 'document', label: key, local: a, remote: b, conflict: true, defaultChoice: 'local' });
  }

  const localBlocks = new Map(local.blocks.map(block => [block.id, block]));
  const remoteBlocks = new Map(remote.blocks.map(block => [block.id, block]));
  const ids = new Set([...localBlocks.keys(), ...remoteBlocks.keys()]);
  for (const id of ids) {
    const a = localBlocks.get(id);
    const b = remoteBlocks.get(id);
    if (stable(a) === stable(b)) continue;
    const conflict = Boolean(a && b);
    entries.push({
      id: `block:${id}`,
      kind: 'block',
      label: (a ?? b)?.type === 'paragraph' ? `Paragraph ${id.slice(0, 8)}` : `${(a ?? b)?.type ?? 'block'} ${id.slice(0, 8)}`,
      local: a ?? null,
      remote: b ?? null,
      conflict,
      defaultChoice: a ? 'local' : 'remote',
    });
  }
  return entries;
}

export function resolveWriterConflict(
  local: WriterDocument,
  remote: WriterDocument,
  choices: Record<string, WriterConflictChoice>,
): WriterDocument {
  const merged = structuredClone(remote) as WriterDocument;
  const metadataKeys = ['title', 'language', 'page', 'review', 'sections', 'citations', 'captions', 'crossReferences', 'indexEntries', 'bookmarks', 'footnotes'] as const;
  for (const key of metadataKeys) {
    const id = `document:${key}`;
    if (choices[id] === 'local') (merged as any)[key] = structuredClone((local as any)[key]);
  }

  const localBlocks = new Map(local.blocks.map(block => [block.id, block]));
  const remoteBlocks = new Map(remote.blocks.map(block => [block.id, block]));
  const ids = new Set([...localBlocks.keys(), ...remoteBlocks.keys()]);
  const blocks: WriterBlock[] = [];
  for (const id of ids) {
    const choice = choices[`block:${id}`];
    const selected = choice === 'local' ? localBlocks.get(id) : remoteBlocks.get(id);
    if (selected) blocks.push(structuredClone(selected));
  }
  const order = choices['document:blockOrder'] === 'local' ? local.blocks.map(block => block.id) : remote.blocks.map(block => block.id);
  const byId = new Map(blocks.map(block => [block.id, block]));
  merged.blocks = order.map(id => byId.get(id)).filter(Boolean) as WriterBlock[];
  for (const block of blocks) if (!merged.blocks.some(item => item.id === block.id)) merged.blocks.push(block);
  return merged;
}

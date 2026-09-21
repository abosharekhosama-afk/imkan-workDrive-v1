import type { WriterDocument } from './model';
import { applyWriterPatches, type WriterPatch } from './operation-patches';

export type WriterOperation = {
  opId: string;
  fileId: string;
  baseRevision: number;
  patches: WriterPatch[];
  createdAt: string;
};

const storageKey = (fileId: string) => `imkan:writer:offline:${fileId}`;

export function diffWriterDocuments(previous: WriterDocument, next: WriterDocument): WriterPatch[] {
  const patches: WriterPatch[] = [];
  const keys = ['title','language','page','review','sections','citations','captions','crossReferences','indexEntries','bookmarks','footnotes'] as const;
  for (const key of keys) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) patches.push({ op: 'set', path: `/${key}`, value: next[key] });
  }
  const before = new Map(previous.blocks.map(block => [block.id, block]));
  const after = new Map(next.blocks.map(block => [block.id, block]));
  for (const [id, block] of after) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(block)) patches.push({ op: 'set', path: `/blocksById/${encodeURIComponent(id)}`, value: block });
  }
  for (const id of before.keys()) if (!after.has(id)) patches.push({ op: 'delete', path: `/blocksById/${encodeURIComponent(id)}` });
  if (previous.blocks.length !== next.blocks.length || previous.blocks.map(x=>x.id).join('|') !== next.blocks.map(x=>x.id).join('|')) {
    patches.push({ op: 'set', path: '/blockOrder', value: next.blocks.map(x => x.id) });
  }
  return patches;
}

export function queueWriterOperation(operation: WriterOperation) {
  const key = storageKey(operation.fileId);
  const current = readWriterQueue(operation.fileId);
  current.push(operation);
  localStorage.setItem(key, JSON.stringify(current.slice(-200)));
}

export function readWriterQueue(fileId: string): WriterOperation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(fileId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function removeWriterOperation(fileId: string, opId: string) {
  const next = readWriterQueue(fileId).filter(x => x.opId !== opId);
  if (next.length) localStorage.setItem(storageKey(fileId), JSON.stringify(next));
  else localStorage.removeItem(storageKey(fileId));
}

export function applyQueuedWriterOperation(doc: WriterDocument, operation: WriterOperation): WriterDocument {
  return applyWriterPatches(doc, operation.patches);
}

export function createWriterOperation(fileId: string, baseRevision: number, patches: WriterPatch[]): WriterOperation {
  return { opId: crypto.randomUUID(), fileId, baseRevision, patches, createdAt: new Date().toISOString() };
}

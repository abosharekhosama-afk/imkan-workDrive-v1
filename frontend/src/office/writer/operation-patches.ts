import type { WriterBlock, WriterDocument } from './model';

export type WriterPatch = { op: 'set' | 'delete'; path: string; value?: unknown };

export function applyWriterPatches(source: WriterDocument, patches: WriterPatch[]): WriterDocument {
  const next = structuredClone(source) as WriterDocument;
  for (const patch of patches) {
    const match = patch.path.match(/^\/blocksById\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const index = next.blocks.findIndex(block => block.id === id);
      if (patch.op === 'delete') { if (index >= 0) next.blocks.splice(index, 1); }
      else {
        const block = patch.value as WriterBlock;
        if (index >= 0) next.blocks[index] = block;
        else next.blocks.push(block);
      }
      continue;
    }
    if (patch.path === '/blockOrder' && patch.op === 'set' && Array.isArray(patch.value)) {
      const byId = new Map(next.blocks.map(block => [block.id, block]));
      next.blocks = (patch.value as string[]).map(id => byId.get(id)).filter(Boolean) as WriterBlock[];
      continue;
    }
    const key = patch.path.replace(/^\//, '') as keyof WriterDocument;
    if (patch.op === 'delete') delete (next as any)[key];
    else (next as any)[key] = patch.value;
  }
  return next;
}

export function patchPathsOverlap(a: string, b: string) {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || (a.startsWith('/blocksById/') && b === '/blockOrder') || (b.startsWith('/blocksById/') && a === '/blockOrder');
}

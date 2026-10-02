import type { WriterDocument, WriterBlock } from './model.ts';
import type { WriterPatch } from './operation-patches.ts';
import { applyWriterPatches, patchPathsOverlap } from './operation-patches.ts';
import type { WriterSelectionBookmark } from './history-selection.ts';

export type RemoteWriterOperation = {
  id?: string;
  revision: number;
  userId?: string;
  payload?: { opId?: string; patches?: WriterPatch[] };
};

export type RealtimeWriterResult = {
  document: WriterDocument;
  selection: WriterSelectionBookmark | null;
  conflict: boolean;
  appliedRevisions: number[];
};

export function remotePatchesOverlapPending(remote: WriterPatch[], pending: WriterPatch[][]): boolean {
  return pending.some(localPatches => localPatches.some(local => remote.some(next => patchPathsOverlap(local.path, next.path))));
}

function blockTextLength(block: WriterBlock): number {
  return block.runs.reduce((sum, run) => sum + run.text.length, 0);
}

export function transformWriterSelectionForRemote(
  selection: WriterSelectionBookmark | null,
  before: WriterDocument,
  after: WriterDocument,
  patches: WriterPatch[],
): WriterSelectionBookmark | null {
  if (!selection) return null;
  const touchedSelectedBlock = patches.some(patch => patchPathsOverlap(patch.path, `/blocksById/${encodeURIComponent(selection.blockId)}`));
  if (!touchedSelectedBlock) {
    const stillExists = after.blocks.some(block => block.id === selection.blockId);
    return stillExists ? selection : null;
  }
  const block = after.blocks.find(item => item.id === selection.blockId);
  if (!block) return null;
  const max = blockTextLength(block);
  const start = Math.min(selection.start, max);
  const end = Math.min(selection.end, max);
  return { ...selection, start, end, collapsed: selection.collapsed || start === end };
}

export function applyRemoteWriterOperations(
  source: WriterDocument,
  operations: RemoteWriterOperation[],
  pendingPatches: WriterPatch[][],
  selection: WriterSelectionBookmark | null,
): RealtimeWriterResult {
  let document = source;
  let nextSelection = selection;
  const appliedRevisions: number[] = [];

  for (const operation of [...operations].sort((a, b) => a.revision - b.revision)) {
    const patches = Array.isArray(operation.payload?.patches) ? operation.payload!.patches! : [];
    if (!patches.length) {
      appliedRevisions.push(operation.revision);
      continue;
    }
    if (remotePatchesOverlapPending(patches, pendingPatches)) {
      return { document, selection: nextSelection, conflict: true, appliedRevisions };
    }
    const before = document;
    document = applyWriterPatches(document, patches);
    nextSelection = transformWriterSelectionForRemote(nextSelection, before, document, patches);
    appliedRevisions.push(operation.revision);
  }

  // Re-apply local queued patches on top of the latest remote revision. Since
  // overlapping paths were rejected above, this is deterministic and preserves
  // the user's unsynced work in the visible document.
  for (const patches of pendingPatches) document = applyWriterPatches(document, patches);

  return { document, selection: nextSelection, conflict: false, appliedRevisions };
}

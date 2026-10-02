'use client';

import { submitWriterOperation, type OfficeOperationPatch } from '@/lib/api/office';
import { officeEqual } from '../performance';
import { applyWriterPatches, type WriterPatch } from './operation-patches';
import type { WriterBlock, WriterDocument } from './model';

export type WriterOperation = {
  opId: string;
  fileId: string;
  baseRevision: number;
  patches: WriterPatch[];
  createdAt: string;
  clientId: string;
  sequence: number;
  held?: boolean;
};

const queueKey = (fileId: string) => `imkan:writer:offline:${fileId}`;
const clientKey = (fileId: string) => `imkan:writer:client:${fileId}`;

function getClientId(fileId: string) {
  let id = localStorage.getItem(clientKey(fileId));
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(clientKey(fileId), id);
  }
  return id;
}

function nextSequence(fileId: string) {
  const key = `${clientKey(fileId)}:seq`;
  const next = Number(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export function createWriterOperation(fileId: string, baseRevision: number, patches: WriterPatch[]): WriterOperation {
  return {
    opId: crypto.randomUUID(),
    fileId,
    baseRevision,
    patches,
    createdAt: new Date().toISOString(),
    clientId: getClientId(fileId),
    sequence: nextSequence(fileId),
  };
}

export function readWriterQueue(fileId: string): WriterOperation[] {
  try {
    const value = JSON.parse(localStorage.getItem(queueKey(fileId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function queueWriterOperation(operation: WriterOperation) {
  const next = [...readWriterQueue(operation.fileId), operation].slice(-200);
  localStorage.setItem(queueKey(operation.fileId), JSON.stringify(next));
}

export function removeWriterOperation(fileId: string, opId: string) {
  const next = readWriterQueue(fileId).filter(operation => operation.opId !== opId);
  if (next.length) localStorage.setItem(queueKey(fileId), JSON.stringify(next));
  else localStorage.removeItem(queueKey(fileId));
}

function replaceWriterOperation(fileId: string, operation: WriterOperation) {
  const next = readWriterQueue(fileId).map(item => item.opId === operation.opId ? operation : item);
  localStorage.setItem(queueKey(fileId), JSON.stringify(next));
}

function writerPath(parts: string[]) {
  return `/${parts.map(encodeURIComponent).join('/')}`;
}

function diffWriterBlocks(previous: WriterBlock[] = [], next: WriterBlock[] = []): WriterPatch[] {
  const patches: WriterPatch[] = [];
  const previousById = new Map(previous.map(block => [block.id, block]));
  const nextIds = next.map(block => block.id);
  const previousIds = previous.map(block => block.id);

  if (!officeEqual(previousIds, nextIds)) {
    patches.push({ op: 'set', path: '/blockOrder', value: nextIds });
  }

  for (const block of next) {
    const before = previousById.get(block.id);
    if (!before || !officeEqual(before, block)) {
      patches.push({
        op: 'set',
        path: `/blocksById/${encodeURIComponent(block.id)}`,
        value: structuredClone(block),
      });
    }
  }

  for (const block of previous) {
    if (!next.some(item => item.id === block.id)) {
      patches.push({
        op: 'delete',
        path: `/blocksById/${encodeURIComponent(block.id)}`,
      });
    }
  }

  return patches;
}

export function diffWriterDocuments(previous: WriterDocument, next: WriterDocument): WriterPatch[] {
  const patches: WriterPatch[] = [];

  const previousBlocks = Array.isArray(previous?.blocks) ? previous.blocks : [];
  const nextBlocks = Array.isArray(next?.blocks) ? next.blocks : [];
  patches.push(...diffWriterBlocks(previousBlocks, nextBlocks));

  const previousWithoutBlocks = { ...previous };
  const nextWithoutBlocks = { ...next };
  delete previousWithoutBlocks.blocks;
  delete nextWithoutBlocks.blocks;

  const walk = (a: unknown, b: unknown, parts: string[], depth = 0) => {
    if (officeEqual(a, b)) return;
    if (depth > 5 || a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
      patches.push({ op: 'set', path: writerPath(parts), value: structuredClone(b) });
      return;
    }
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    for (const key of keys) {
      if (!(key in bRecord)) patches.push({ op: 'delete', path: writerPath([...parts, key]) });
      else walk(aRecord[key], bRecord[key], [...parts, key], depth + 1);
    }
  };

  walk(previousWithoutBlocks, nextWithoutBlocks, []);
  return patches.filter(patch => patch.path !== '/');
}

export function applyQueuedWriterOperation<T extends WriterDocument | null>(document: T, operation: WriterOperation): T {
  if (!document) return document;
  return applyWriterPatches(document, operation.patches) as T;
}

function isRevisionOrRetryError(error: unknown) {
  const code = (error as any)?.code;
  return code === 'OFFICE_OPERATION_REVISION' || code === 'OFFICE_OPERATION_RETRY';
}

export async function flushWriterQueue(
  fileId: string,
  sessionId?: string,
  onRevision?: (revision: number) => void,
  onConflict?: (error: any) => void,
) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  for (const queued of [...readWriterQueue(fileId)]) {
    if (queued.held) continue;
    let operation = queued;
    let retried = false;

    while (true) {
      try {
        const result = await submitWriterOperation(fileId, {
          opId: operation.opId,
          baseRevision: operation.baseRevision,
          patches: operation.patches as OfficeOperationPatch[],
          sessionId,
          clientId: operation.clientId,
          sequence: operation.sequence,
        });

        removeWriterOperation(fileId, operation.opId);
        const remaining = readWriterQueue(fileId).map(item => ({ ...item, baseRevision: result.revision }));
        if (remaining.length) localStorage.setItem(queueKey(fileId), JSON.stringify(remaining));
        onRevision?.(result.revision);
        break;
      } catch (error: any) {
        if (!retried && isRevisionOrRetryError(error)) {
          retried = true;
          // The server will reject a stale base revision; keep the operation
          // queued so the caller can perform the normal conflict/rebase flow.
          onConflict?.(error);
          break;
        }
        onConflict?.(error);
        break;
      }
    }

    if (readWriterQueue(fileId).some(item => item.opId === operation.opId)) break;
  }
}

export function writerOfflineQueueCount(fileId: string) {
  return readWriterQueue(fileId).length;
}

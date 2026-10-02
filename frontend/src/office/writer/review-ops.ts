import type { WriterChange, WriterComment, WriterDocument } from './model';
import {
  acceptAllChanges,
  acceptChange,
  addComment,
  rejectAllChanges,
  rejectChange,
  replyComment,
  toggleCommentResolved,
  toggleTrackChanges,
} from './review';

export function pendingChanges(doc: WriterDocument): WriterChange[] {
  return (doc.review?.changes ?? []).filter((c) => c.status === 'pending');
}

export function openComments(doc: WriterDocument): WriterComment[] {
  return (doc.review?.comments ?? []).filter((c) => !c.resolved && !c.deleted);
}

export function nextPendingChange(doc: WriterDocument, currentId?: string): WriterChange | undefined {
  const list = pendingChanges(doc);
  if (!list.length) return undefined;
  if (!currentId) return list[0];
  const idx = list.findIndex((c) => c.id === currentId);
  return list[(idx + 1) % list.length];
}

export function previousPendingChange(doc: WriterDocument, currentId?: string): WriterChange | undefined {
  const list = pendingChanges(doc);
  if (!list.length) return undefined;
  if (!currentId) return list[list.length - 1];
  const idx = list.findIndex((c) => c.id === currentId);
  return list[(idx - 1 + list.length) % list.length];
}

export function nextOpenComment(doc: WriterDocument, currentId?: string): WriterComment | undefined {
  const list = openComments(doc);
  if (!list.length) return undefined;
  if (!currentId) return list[0];
  const idx = list.findIndex((c) => c.id === currentId);
  return list[(idx + 1) % list.length];
}

export function changeKindFromRuns(beforeLen: number, afterLen: number): 'insert' | 'delete' | 'format' {
  if (afterLen > beforeLen) return 'insert';
  if (afterLen < beforeLen) return 'delete';
  return 'format';
}

export function acceptNextChange(doc: WriterDocument, currentId?: string): { document: WriterDocument; nextId?: string } {
  const target = currentId
    ? doc.review.changes.find((c) => c.id === currentId && c.status === 'pending')
    : pendingChanges(doc)[0];
  if (!target) return { document: doc };
  const next = acceptChange(doc, target.id);
  const following = nextPendingChange(next);
  return { document: next, nextId: following?.id };
}

export function rejectNextChange(doc: WriterDocument, currentId?: string): { document: WriterDocument; nextId?: string } {
  const target = currentId
    ? doc.review.changes.find((c) => c.id === currentId && c.status === 'pending')
    : pendingChanges(doc)[0];
  if (!target) return { document: doc };
  const next = rejectChange(doc, target.id);
  const following = nextPendingChange(next);
  return { document: next, nextId: following?.id };
}

export {
  acceptAllChanges,
  acceptChange,
  addComment,
  rejectAllChanges,
  rejectChange,
  replyComment,
  toggleCommentResolved,
  toggleTrackChanges,
};

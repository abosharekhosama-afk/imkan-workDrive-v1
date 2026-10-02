import type { WriterBlock, WriterDocument, WriterRun } from './model';

export type CaretSplit = {
  before: WriterRun[];
  after: WriterRun[];
};

function cloneDoc(doc: WriterDocument): WriterDocument {
  return JSON.parse(JSON.stringify(doc)) as WriterDocument;
}

function textOfRuns(runs: WriterRun[]): string {
  return runs.map((r) => r.text || '').join('');
}

function isEmptyRuns(runs: WriterRun[]): boolean {
  return textOfRuns(runs).length === 0;
}

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

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitParagraph(
  doc: WriterDocument,
  id: string,
  leftRuns: WriterRun[],
  rightRuns: WriterRun[],
): WriterDocument {
  const next = cloneDoc(doc);
  const index = next.blocks.findIndex((x) => x.id === id);
  if (index < 0) return next;
  const source = next.blocks[index];
  const left = { ...source, id: source.id, runs: leftRuns.length ? leftRuns : [{ text: '' }] };
  const right = { ...source, id: newId(), runs: rightRuns.length ? rightRuns : [{ text: '' }] };
  next.blocks.splice(index, 1, left, right);
  return next;
}

function addParagraph(doc: WriterDocument, afterId?: string): WriterDocument {
  const next = cloneDoc(doc);
  const block: WriterBlock = {
    id: newId(),
    type: 'paragraph',
    align: 'start',
    runs: [{ text: '' }],
    lineSpacing: 1.5,
    spaceAfter: 8,
  };
  const index = afterId ? next.blocks.findIndex((x) => x.id === afterId) : -1;
  next.blocks.splice(index < 0 ? next.blocks.length : index + 1, 0, block);
  return next;
}

function removeBlock(doc: WriterDocument, id: string): WriterDocument {
  const next = cloneDoc(doc);
  if (next.blocks.length <= 1) return next;
  next.blocks = next.blocks.filter((x) => x.id !== id);
  return next;
}

/**
 * Zoho-like Enter behaviour for a block.
 * - Empty list item → exit list (become paragraph).
 * - Non-empty list item → new list item with same ordered flag (split at caret).
 * - Heading after Enter → following block is a normal paragraph.
 * - Other blocks → split paragraph at caret.
 */
export function applyEnterAtBlock(
  doc: WriterDocument,
  blockId: string,
  split: CaretSplit | null,
): { document: WriterDocument; focusBlockId: string | null } {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) return { document: doc, focusBlockId: null };

  const isList = block.type === 'list-item';
  const empty = isEmptyRuns(block.runs);

  if (isList && empty) {
    const next = cloneDoc(doc);
    const target = next.blocks.find((b) => b.id === blockId);
    if (target) {
      target.type = 'paragraph';
      target.ordered = undefined;
    }
    return { document: next, focusBlockId: blockId };
  }

  if (isList) {
    if (split) {
      const next = splitParagraph(doc, blockId, split.before, split.after);
      const index = next.blocks.findIndex((b) => b.id === blockId);
      const left = next.blocks[index];
      const right = next.blocks[index + 1];
      if (left) {
        left.type = 'list-item';
        left.ordered = Boolean(block.ordered);
      }
      if (right) {
        right.type = 'list-item';
        right.ordered = Boolean(block.ordered);
      }
      return { document: next, focusBlockId: right?.id ?? null };
    }
    const next = addParagraph(doc, blockId);
    const index = next.blocks.findIndex((b) => b.id === blockId);
    const inserted = next.blocks[index + 1];
    if (inserted) {
      inserted.type = 'list-item';
      inserted.ordered = Boolean(block.ordered);
      inserted.runs = [{ text: '' }];
    }
    return { document: next, focusBlockId: inserted?.id ?? null };
  }

  if (split) {
    const next = splitParagraph(doc, blockId, split.before, split.after);
    const index = next.blocks.findIndex((b) => b.id === blockId);
    const right = next.blocks[index + 1];
    if (right && ['title', 'subtitle', 'heading1', 'heading2', 'heading3'].includes(block.type)) {
      right.type = 'paragraph';
    }
    return { document: next, focusBlockId: right?.id ?? null };
  }

  const next = addParagraph(doc, blockId);
  const index = next.blocks.findIndex((b) => b.id === blockId);
  return { document: next, focusBlockId: next.blocks[index + 1]?.id ?? null };
}

/**
 * Zoho-like Backspace at the start of a block (caret offset 0, collapsed).
 * - List item → convert to paragraph (exit list), keep content.
 * - Non-first paragraph → merge with previous block's runs.
 */
export function applyBackspaceAtBlockStart(
  doc: WriterDocument,
  blockId: string,
): { document: WriterDocument; focusBlockId: string | null; caretOffset: number | null } {
  const index = doc.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return { document: doc, focusBlockId: null, caretOffset: null };
  const block = doc.blocks[index];

  if (block.type === 'list-item') {
    const next = cloneDoc(doc);
    const target = next.blocks[index];
    target.type = 'paragraph';
    target.ordered = undefined;
    return { document: next, focusBlockId: blockId, caretOffset: 0 };
  }

  if (index === 0) {
    return { document: doc, focusBlockId: blockId, caretOffset: 0 };
  }

  const prev = doc.blocks[index - 1];
  if (prev.type === 'page-break' || prev.type === 'table' || prev.type === 'image') {
    if (isEmptyRuns(block.runs) && doc.blocks.length > 1) {
      return {
        document: removeBlock(doc, blockId),
        focusBlockId: prev.id,
        caretOffset: textOfRuns(prev.runs || []).length,
      };
    }
    return { document: doc, focusBlockId: blockId, caretOffset: 0 };
  }

  const next = cloneDoc(doc);
  const left = next.blocks[index - 1];
  const right = next.blocks[index];
  const joinOffset = textOfRuns(left.runs || []).length;
  left.runs = mergeRuns([
    ...(left.runs?.length ? left.runs : [{ text: '' }]),
    ...(right.runs?.length ? right.runs : [{ text: '' }]),
  ]);
  next.blocks.splice(index, 1);
  return { document: next, focusBlockId: left.id, caretOffset: joinOffset };
}

export function blockIsEmpty(block: WriterBlock): boolean {
  return isEmptyRuns(block.runs || []);
}

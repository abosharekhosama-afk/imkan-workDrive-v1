export type WriterSelectionBookmark = {
  blockId: string;
  start: number;
  end: number;
  collapsed: boolean;
};

function textOffset(root: Node, container: Node, offset: number): number {
  if (!root.contains(container) && root !== container) return 0;
  const range = document.createRange();
  range.selectNodeContents(root);
  try { range.setEnd(container, offset); } catch { return 0; }
  return range.toString().length;
}

function pointAtOffset(root: Node, target: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, target);
  let node: Node | null = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    node = walker.nextNode();
  }
  return { node: root, offset: root.childNodes.length };
}

export function captureWriterSelection(): WriterSelectionBookmark | null {
  if (typeof window === 'undefined') return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) return null;
  const anchor = selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode as HTMLElement;
  const block = anchor?.closest?.('[data-writer-block]') as HTMLElement | null;
  if (!block) return null;
  const range = selection.getRangeAt(0);
  if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) return null;
  return {
    blockId: block.getAttribute('data-writer-block') || '',
    start: textOffset(block, range.startContainer, range.startOffset),
    end: textOffset(block, range.endContainer, range.endOffset),
    collapsed: range.collapsed,
  };
}

export function restoreWriterSelection(bookmark: WriterSelectionBookmark | null): boolean {
  if (typeof window === 'undefined' || !bookmark?.blockId) return false;
  const block = document.querySelector(`[data-writer-block="${CSS.escape(bookmark.blockId)}"]`) as HTMLElement | null;
  if (!block) return false;
  const start = pointAtOffset(block, bookmark.start);
  const end = pointAtOffset(block, bookmark.end);
  const range = document.createRange();
  range.setStart(start.node, Math.min(start.offset, start.node.textContent?.length ?? start.node.childNodes.length));
  range.setEnd(end.node, Math.min(end.offset, end.node.textContent?.length ?? end.node.childNodes.length));
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  block.focus();
  return true;
}

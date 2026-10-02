import type { WriterBlock, WriterDocument } from './model';

export type WriterOutlineItem = {
  blockId: string;
  text: string;
  level: 1 | 2 | 3;
  index: number;
};

export function buildWriterOutline(doc: WriterDocument): WriterOutlineItem[] {
  const result: WriterOutlineItem[] = [];
  doc.blocks.forEach((block, index) => {
    const level = block.type === 'heading1' ? 1 : block.type === 'heading2' ? 2 : block.type === 'heading3' ? 3 : 0;
    if (!level) return;
    const text = block.runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();
    result.push({ blockId: block.id, text: text || `Heading ${result.length + 1}`, level: level as 1 | 2 | 3, index });
  });
  return result;
}

export function findWriterOutlineItem(doc: WriterDocument, blockId: string): WriterOutlineItem | undefined {
  return buildWriterOutline(doc).find(item => item.blockId === blockId);
}

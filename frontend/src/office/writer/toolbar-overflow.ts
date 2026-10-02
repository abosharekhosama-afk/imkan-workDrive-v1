export type WriterToolbarKey =
  | 'lineSpacing' | 'alignment' | 'indent' | 'outdent' | 'bullets' | 'numbering' | 'checklist'
  | 'image' | 'table' | 'link' | 'comments' | 'clearFormatting' | 'highlight' | 'textColor';

export type WriterToolbarLayout = {
  visible: WriterToolbarKey[];
  overflow: WriterToolbarKey[];
};

const ALL: WriterToolbarKey[] = [
  'lineSpacing', 'alignment', 'indent', 'outdent', 'bullets', 'numbering', 'checklist',
  'image', 'table', 'link', 'comments', 'clearFormatting', 'highlight', 'textColor',
];

/**
 * Priority-aware Writer toolbar layout. Core editing controls stay visible longer;
 * insertion/review helpers move to overflow first as the available width shrinks.
 */
export function getWriterToolbarLayout(width: number): WriterToolbarLayout {
  if (width >= 1180) return { visible: [...ALL], overflow: [] };
  if (width >= 980) return { visible: ALL.filter(k => !['image', 'table', 'link', 'comments'].includes(k)), overflow: ['image', 'table', 'link', 'comments'] };
  if (width >= 820) return { visible: ALL.filter(k => !['image', 'table', 'link', 'comments', 'checklist', 'numbering'].includes(k)), overflow: ['image', 'table', 'link', 'comments', 'checklist', 'numbering'] };
  if (width >= 680) return { visible: ['alignment', 'indent', 'outdent', 'bullets', 'numbering', 'clearFormatting'], overflow: ['lineSpacing', 'checklist', 'image', 'table', 'link', 'comments', 'highlight', 'textColor'] };
  return { visible: ['alignment', 'clearFormatting'], overflow: ['lineSpacing', 'indent', 'outdent', 'bullets', 'numbering', 'checklist', 'image', 'table', 'link', 'comments', 'highlight', 'textColor'] };
}

export function isToolbarKeyVisible(layout: WriterToolbarLayout, key: WriterToolbarKey) {
  return layout.visible.includes(key);
}

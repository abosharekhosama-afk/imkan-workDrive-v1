export type WriterRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  href?: string;
  highlight?: string;
  verticalAlign?: 'baseline' | 'superscript' | 'subscript';
};

export type WriterTableCell = { id: string; runs: WriterRun[]; align?: 'start' | 'center' | 'end' };

export type WriterComment = {
  id: string;
  blockId: string;
  text: string;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  resolved?: boolean;
  replies?: { id: string; text: string; authorId?: string; authorName?: string; createdAt: string }[];
};

export type WriterChange = {
  id: string;
  blockId: string;
  kind: 'insert' | 'delete' | 'format';
  before: WriterRun[];
  after: WriterRun[];
  authorId?: string;
  authorName?: string;
  createdAt: string;
  status?: 'pending' | 'accepted' | 'rejected';
};

export type WriterSnapshot = {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
  blocks: WriterBlock[];
};

export type WriterReview = {
  comments: WriterComment[];
  changes: WriterChange[];
  snapshots: WriterSnapshot[];
  trackChanges: boolean;
};
export type WriterTable = { rows: WriterTableCell[][]; bordered?: boolean };

export type WriterBlockType = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'list-item' | 'table' | 'image' | 'page-break';

export type WriterBookmark = { id: string; name: string; blockId: string };
export type WriterFootnote = { id: string; marker: string; text: string; blockId: string };

export type WriterBlock = {
  id: string;
  type: WriterBlockType;
  align: 'start' | 'center' | 'end' | 'justify';
  ordered?: boolean;
  runs: WriterRun[];
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  table?: WriterTable;
  image?: { src: string; alt?: string; width?: number; height?: number };
  pageBreakBefore?: boolean;
  indentLeftMm?: number;
  indentRightMm?: number;
  firstLineIndentMm?: number;
  keepWithNext?: boolean;
};

export type WriterPageSettings = {
  size: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  orientation: 'portrait' | 'landscape';
  header?: string;
  footer?: string;
  showPageNumbers?: boolean;
};

export type WriterDocument = {
  schema: 5;
  type: 'WRITER';
  title: string;
  language: 'ar' | 'en' | 'mixed';
  page: WriterPageSettings;
  blocks: WriterBlock[];
  review: WriterReview;
  bookmarks: WriterBookmark[];
  footnotes: WriterFootnote[];
};

export const defaultWriterPage = (): WriterPageSettings => ({
  size: 'A4', widthMm: 210, heightMm: 297, marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20,
  orientation: 'portrait', header: '', footer: '', showPageNumbers: true,
});

export const emptyWriterDocument = (): WriterDocument => ({
  schema: 5, type: 'WRITER', title: 'Untitled document', language: 'mixed', page: defaultWriterPage(),
  blocks: [{ id: crypto.randomUUID(), type: 'paragraph', align: 'start', runs: [{ text: '' }] }],
  review: { comments: [], changes: [], snapshots: [], trackChanges: false },
  bookmarks: [], footnotes: [],
});

export function normalizeWriterDocument(value: any): WriterDocument {
  const source = value && typeof value === 'object' ? value : {};
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
  const rawPage = source.page && typeof source.page === 'object' ? source.page : {};
  const defaults = defaultWriterPage();
  const page: WriterPageSettings = {
    ...defaults,
    ...rawPage,
    size: ['A4', 'LETTER', 'LEGAL', 'CUSTOM'].includes(rawPage.size) ? rawPage.size : defaults.size,
    orientation: rawPage.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginTopMm: clampNumber(rawPage.marginTopMm, 0, 80, defaults.marginTopMm),
    marginRightMm: clampNumber(rawPage.marginRightMm, 0, 80, defaults.marginRightMm),
    marginBottomMm: clampNumber(rawPage.marginBottomMm, 0, 80, defaults.marginBottomMm),
    marginLeftMm: clampNumber(rawPage.marginLeftMm, 0, 80, defaults.marginLeftMm),
    widthMm: clampNumber(rawPage.widthMm, 80, 500, defaults.widthMm),
    heightMm: clampNumber(rawPage.heightMm, 80, 500, defaults.heightMm),
    header: typeof rawPage.header === 'string' ? rawPage.header.slice(0, 500) : '',
    footer: typeof rawPage.footer === 'string' ? rawPage.footer.slice(0, 500) : '',
    showPageNumbers: rawPage.showPageNumbers !== false,
  };
  const blocks: WriterBlock[] = rawBlocks.map((block: any) => normalizeBlock(block));
  const rawReview = source.review && typeof source.review === 'object' ? source.review : {};
  const review: WriterReview = {
    trackChanges: Boolean(rawReview.trackChanges),
    comments: Array.isArray(rawReview.comments) ? rawReview.comments.slice(-500).map(normalizeComment) : [],
    changes: Array.isArray(rawReview.changes) ? rawReview.changes.slice(-500).map(normalizeChange) : [],
    snapshots: Array.isArray(rawReview.snapshots) ? rawReview.snapshots.slice(-20).map(normalizeSnapshot) : [],
  };
  return {
    schema: 5, type: 'WRITER',
    title: typeof source.title === 'string' ? source.title.slice(0, 255) : 'Untitled document',
    language: source.language === 'ar' || source.language === 'en' ? source.language : 'mixed',
    page, blocks: blocks.length ? blocks : emptyWriterDocument().blocks, review,
    bookmarks: Array.isArray(source.bookmarks) ? source.bookmarks.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id:crypto.randomUUID(),name:typeof x?.name==='string'?x.name.slice(0,120):'Bookmark',blockId:typeof x?.blockId==='string'?x.blockId:''})) : [],
    footnotes: Array.isArray(source.footnotes) ? source.footnotes.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id:crypto.randomUUID(),marker:typeof x?.marker==='string'?x.marker.slice(0,20):'*',text:typeof x?.text==='string'?x.text.slice(0,4000):'',blockId:typeof x?.blockId==='string'?x.blockId:''})) : [],
  };
}


function normalizeComment(value: any): WriterComment {
  return {
    id: typeof value?.id === 'string' ? value.id : crypto.randomUUID(),
    blockId: typeof value?.blockId === 'string' ? value.blockId : '',
    text: typeof value?.text === 'string' ? value.text.slice(0, 4000) : '',
    authorId: typeof value?.authorId === 'string' ? value.authorId.slice(0, 100) : undefined,
    authorName: typeof value?.authorName === 'string' ? value.authorName.slice(0, 120) : undefined,
    createdAt: typeof value?.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    resolved: Boolean(value?.resolved),
    replies: Array.isArray(value?.replies) ? value.replies.slice(-50).map((reply: any) => ({ id: typeof reply?.id === 'string' ? reply.id : crypto.randomUUID(), text: typeof reply?.text === 'string' ? reply.text.slice(0, 2000) : '', authorId: typeof reply?.authorId === 'string' ? reply.authorId.slice(0, 100) : undefined, authorName: typeof reply?.authorName === 'string' ? reply.authorName.slice(0, 120) : undefined, createdAt: typeof reply?.createdAt === 'string' ? reply.createdAt : new Date().toISOString() })) : [],
  };
}

function normalizeChange(value: any): WriterChange {
  const kind = value?.kind === 'delete' || value?.kind === 'format' ? value.kind : 'insert';
  const status = value?.status === 'accepted' || value?.status === 'rejected' ? value.status : 'pending';
  return { id: typeof value?.id === 'string' ? value.id : crypto.randomUUID(), blockId: typeof value?.blockId === 'string' ? value.blockId : '', kind, before: Array.isArray(value?.before) ? value.before.map(normalizeRun) : [], after: Array.isArray(value?.after) ? value.after.map(normalizeRun) : [], authorId: typeof value?.authorId === 'string' ? value.authorId.slice(0,100) : undefined, authorName: typeof value?.authorName === 'string' ? value.authorName.slice(0,120) : undefined, createdAt: typeof value?.createdAt === 'string' ? value.createdAt : new Date().toISOString(), status };
}

function normalizeSnapshot(value: any): WriterSnapshot {
  return { id: typeof value?.id === 'string' ? value.id : crypto.randomUUID(), revision: Number.isFinite(Number(value?.revision)) ? Number(value.revision) : 0, title: typeof value?.title === 'string' ? value.title.slice(0,255) : 'Snapshot', createdAt: typeof value?.createdAt === 'string' ? value.createdAt : new Date().toISOString(), blocks: Array.isArray(value?.blocks) ? value.blocks.slice(0,5000).map(normalizeBlock) : [] };
}

function clampNumber(value: any, min: number, max: number, fallback: number): number {
  const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeBlock(block: any): WriterBlock {
  const allowed = ['paragraph', 'heading1', 'heading2', 'heading3', 'list-item', 'table', 'image', 'page-break'];
  const type = allowed.includes(block?.type) ? block.type : 'paragraph';
  const runs = Array.isArray(block?.runs) && block.runs.length ? block.runs.map(normalizeRun) : [{ text: '' }];
  const out: WriterBlock = {
    id: typeof block?.id === 'string' ? block.id : crypto.randomUUID(),
    type, align: ['start', 'center', 'end', 'justify'].includes(block?.align) ? block.align : 'start',
    ordered: Boolean(block?.ordered), runs,
    lineSpacing: clampNumber(block?.lineSpacing, 1, 3, 1.5),
    spaceBefore: clampNumber(block?.spaceBefore, 0, 100, 0),
    spaceAfter: clampNumber(block?.spaceAfter, 0, 100, 8),
    pageBreakBefore: Boolean(block?.pageBreakBefore),
    indentLeftMm: clampNumber(block?.indentLeftMm, 0, 100, 0),
    indentRightMm: clampNumber(block?.indentRightMm, 0, 100, 0),
    firstLineIndentMm: clampNumber(block?.firstLineIndentMm, -30, 50, 0),
    keepWithNext: Boolean(block?.keepWithNext),
  };
  if (type === 'table') out.table = normalizeTable(block?.table);
  if (type === 'image' && typeof block?.image?.src === 'string') out.image = { src: block.image.src.slice(0, 2_000_000), alt: String(block.image.alt ?? '').slice(0, 255), width: clampNumber(block.image.width, 40, 760, 560), height: block.image.height ? clampNumber(block.image.height, 40, 1100, 315) : undefined };
  return out;
}

function normalizeRun(run: any): WriterRun {
  const out: WriterRun = { text: typeof run?.text === 'string' ? run.text : '', bold: Boolean(run?.bold), italic: Boolean(run?.italic), underline: Boolean(run?.underline), strike: Boolean(run?.strike) };
  if (typeof run?.fontFamily === 'string') out.fontFamily = run.fontFamily.slice(0, 80);
  if (Number.isFinite(Number(run?.fontSize))) out.fontSize = Math.min(96, Math.max(8, Number(run.fontSize)));
  if (typeof run?.color === 'string' && /^#[0-9a-f]{6}$/i.test(run.color)) out.color = run.color;
  if (typeof run?.href === 'string' && /^https?:\/\//i.test(run.href)) out.href = run.href.slice(0, 2000);
  if (typeof run?.highlight === 'string' && /^#[0-9a-f]{6}$/i.test(run.highlight)) out.highlight = run.highlight;
  if (run?.verticalAlign === 'superscript' || run?.verticalAlign === 'subscript') out.verticalAlign = run.verticalAlign;
  return out;
}

function normalizeTable(table: any): WriterTable {
  const rows = Array.isArray(table?.rows) ? table.rows.slice(0, 50) : [];
  return { bordered: table?.bordered !== false, rows: rows.map((row: any) => Array.isArray(row) ? row.slice(0, 20).map((cell: any) => ({ id: typeof cell?.id === 'string' ? cell.id : crypto.randomUUID(), runs: Array.isArray(cell?.runs) && cell.runs.length ? cell.runs.map(normalizeRun) : [{ text: '' }], align: ['start', 'center', 'end'].includes(cell?.align) ? cell.align : 'start' })) : []) };
}

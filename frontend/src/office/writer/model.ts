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

export type WriterCellVerticalAlign = 'top' | 'middle' | 'bottom';
export type WriterTableBorder = { style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'; width?: number; color?: string };
export type WriterTableCell = { id: string; runs: WriterRun[]; align?: 'start' | 'center' | 'end'; verticalAlign?: WriterCellVerticalAlign; colSpan?: number; rowSpan?: number; nestedTable?: WriterTable };
export type WriterTable = { rows: WriterTableCell[][]; bordered?: boolean; headerRows?: number; repeatHeaderRow?: boolean; allowRowBreak?: boolean; borders?: { top?: WriterTableBorder; right?: WriterTableBorder; bottom?: WriterTableBorder; left?: WriterTableBorder; inside?: WriterTableBorder } };

export type WriterComment = {
  id: string;
  blockId: string;
  text: string;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  resolved?: boolean;
  replies?: { id: string; text: string; authorId?: string; authorName?: string; createdAt: string }[];
  mentions?: string[];
  deleted?: boolean;
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
  showFormattingChanges?: boolean;
  displayMode?: 'simple' | 'all' | 'original';
};
export type WriterBlockType = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'list-item' | 'table' | 'image' | 'page-break' | 'equation' | 'symbol' | 'bibliography' | 'index';

export type WriterBookmark = { id: string; name: string; blockId: string };
export type WriterFootnote = { id: string; marker: string; text: string; blockId: string };
export type WriterSectionBreak = 'next-page' | 'continuous' | 'even-page' | 'odd-page';
export type WriterSection = { id: string; startBlockId?: string; breakType?: WriterSectionBreak; columns: number; columnGapMm: number; differentFirstPage?: boolean; differentOddEven?: boolean; header?: string; footer?: string; firstHeader?: string; firstFooter?: string; oddHeader?: string; oddFooter?: string; evenHeader?: string; evenFooter?: string; pageNumberStart?: number; pageNumberFormat?: 'decimal' | 'roman-lower' | 'roman-upper' | 'letter-upper' | 'letter-lower' };
export type WriterCitation = { id: string; source: string; author?: string; year?: string; title?: string; url?: string };
export type WriterCaption = { id: string; blockId: string; label: string; text: string; number: number };
export type WriterCrossReference = { id: string; name: string; targetId: string; display: 'label' | 'number' | 'text' };
export type WriterIndexEntry = { id: string; term: string; blockId: string; subentry?: string };

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
  image?: { src: string; alt?: string; width?: number; height?: number; rotation?: number; crop?: { top: number; right: number; bottom: number; left: number }; wrap?: 'inline' | 'square' | 'tight' | 'through' | 'top-bottom' | 'behind' | 'front'; anchor?: 'paragraph' | 'page' | 'margin'; };
  pageBreakBefore?: boolean;
  indentLeftMm?: number;
  indentRightMm?: number;
  firstLineIndentMm?: number;
  keepWithNext?: boolean;
  sectionId?: string;
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
  differentFirstPage?: boolean;
  differentOddEven?: boolean;
  pageNumberStart?: number;
  pageNumberFormat?: 'decimal' | 'roman-lower' | 'roman-upper' | 'letter-upper' | 'letter-lower';
};

export type WriterDocument = {
  schema: 7;
  type: 'WRITER';
  title: string;
  language: 'ar' | 'en' | 'mixed';
  page: WriterPageSettings;
  blocks: WriterBlock[];
  review: WriterReview;
  bookmarks: WriterBookmark[];
  footnotes: WriterFootnote[];
  sections: WriterSection[];
  citations: WriterCitation[];
  captions: WriterCaption[];
  crossReferences: WriterCrossReference[];
  indexEntries: WriterIndexEntry[];
};

export const defaultWriterPage = (): WriterPageSettings => ({
  size: 'A4', widthMm: 210, heightMm: 297, marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20,
  orientation: 'portrait', header: '', footer: '', showPageNumbers: true, differentFirstPage: false, differentOddEven: false, pageNumberStart: 1, pageNumberFormat: 'decimal',
});

export const emptyWriterDocument = (): WriterDocument => ({
  schema: 7, type: 'WRITER', title: 'Untitled document', language: 'mixed', page: defaultWriterPage(),
  blocks: [{ id: crypto.randomUUID(), type: 'paragraph', align: 'start', runs: [{ text: '' }] }],
  sections: [{ id: crypto.randomUUID(), columns: 1, columnGapMm: 8 }],
  citations: [], captions: [], crossReferences: [], indexEntries: [],
  review: { comments: [], changes: [], snapshots: [], trackChanges: false, showFormattingChanges: true, displayMode: 'all' },
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
    differentFirstPage: Boolean(rawPage.differentFirstPage), differentOddEven: Boolean(rawPage.differentOddEven),
    pageNumberStart: clampNumber(rawPage.pageNumberStart, 1, 99999, 1),
    pageNumberFormat: ['decimal','roman-lower','roman-upper','letter-upper','letter-lower'].includes(rawPage.pageNumberFormat) ? rawPage.pageNumberFormat : 'decimal',
  };
  const blocks: WriterBlock[] = rawBlocks.map((block: any) => normalizeBlock(block));
  const rawReview = source.review && typeof source.review === 'object' ? source.review : {};
  const review: WriterReview = {
    trackChanges: Boolean(rawReview.trackChanges),
    showFormattingChanges: rawReview.showFormattingChanges !== false,
    displayMode: rawReview.displayMode === 'simple' || rawReview.displayMode === 'original' ? rawReview.displayMode : 'all',
    comments: Array.isArray(rawReview.comments) ? rawReview.comments.slice(-500).map(normalizeComment) : [],
    changes: Array.isArray(rawReview.changes) ? rawReview.changes.slice(-500).map(normalizeChange) : [],
    snapshots: Array.isArray(rawReview.snapshots) ? rawReview.snapshots.slice(-20).map(normalizeSnapshot) : [],
  };
  return {
    schema: 7, type: 'WRITER',
    title: typeof source.title === 'string' ? source.title.slice(0, 255) : 'Untitled document',
    language: source.language === 'ar' || source.language === 'en' ? source.language : 'mixed',
    page, blocks: blocks.length ? blocks : emptyWriterDocument().blocks, review,
    sections: Array.isArray(source.sections) && source.sections.length ? source.sections.slice(0,100).map(normalizeSection) : [{id:crypto.randomUUID(),columns:1,columnGapMm:8,breakType:'next-page'}],
    citations: Array.isArray(source.citations) ? source.citations.slice(0,1000).map(normalizeCitation) : [],
    captions: Array.isArray(source.captions) ? source.captions.slice(0,1000).map(normalizeCaption) : [],
    crossReferences: Array.isArray(source.crossReferences) ? source.crossReferences.slice(0,1000).map(normalizeCrossReference) : [],
    indexEntries: Array.isArray(source.indexEntries) ? source.indexEntries.slice(0,1000).map(normalizeIndexEntry) : [],
    bookmarks: Array.isArray(source.bookmarks) ? source.bookmarks.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id:crypto.randomUUID(),name:typeof x?.name==='string'?x.name.slice(0,120):'Bookmark',blockId:typeof x?.blockId==='string'?x.blockId:''})) : [],
    footnotes: Array.isArray(source.footnotes) ? source.footnotes.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id:crypto.randomUUID(),marker:typeof x?.marker==='string'?x.marker.slice(0,20):'*',text:typeof x?.text==='string'?x.text.slice(0,4000):'',blockId:typeof x?.blockId==='string'?x.blockId:''})) : [],
  };
}



function normalizeSection(value:any): WriterSection { return { id: typeof value?.id==='string'?value.id:crypto.randomUUID(), startBlockId:typeof value?.startBlockId==='string'?value.startBlockId:undefined, breakType:['next-page','continuous','even-page','odd-page'].includes(value?.breakType)?value.breakType:'next-page', columns:clampNumber(value?.columns,1,4,1), columnGapMm:clampNumber(value?.columnGapMm,4,40,8), differentFirstPage:Boolean(value?.differentFirstPage), differentOddEven:Boolean(value?.differentOddEven), header:typeof value?.header==='string'?value.header.slice(0,500):'', footer:typeof value?.footer==='string'?value.footer.slice(0,500):'', firstHeader:typeof value?.firstHeader==='string'?value.firstHeader.slice(0,500):'', firstFooter:typeof value?.firstFooter==='string'?value.firstFooter.slice(0,500):'', oddHeader:typeof value?.oddHeader==='string'?value.oddHeader.slice(0,500):'', oddFooter:typeof value?.oddFooter==='string'?value.oddFooter.slice(0,500):'', evenHeader:typeof value?.evenHeader==='string'?value.evenHeader.slice(0,500):'', evenFooter:typeof value?.evenFooter==='string'?value.evenFooter.slice(0,500):'', pageNumberStart:clampNumber(value?.pageNumberStart,1,99999,1), pageNumberFormat:['decimal','roman-lower','roman-upper','letter-upper','letter-lower'].includes(value?.pageNumberFormat)?value.pageNumberFormat:'decimal' }; }
function normalizeCitation(value:any): WriterCitation { return {id:typeof value?.id==='string'?value.id:crypto.randomUUID(),source:typeof value?.source==='string'?value.source.slice(0,500):'',author:typeof value?.author==='string'?value.author.slice(0,200):undefined,year:typeof value?.year==='string'?value.year.slice(0,20):undefined,title:typeof value?.title==='string'?value.title.slice(0,500):undefined,url:typeof value?.url==='string'?value.url.slice(0,2000):undefined}; }
function normalizeCaption(value:any): WriterCaption { return {id:typeof value?.id==='string'?value.id:crypto.randomUUID(),blockId:typeof value?.blockId==='string'?value.blockId:'',label:typeof value?.label==='string'?value.label.slice(0,80):'Figure',text:typeof value?.text==='string'?value.text.slice(0,500):'',number:clampNumber(value?.number,1,99999,1)}; }
function normalizeCrossReference(value:any): WriterCrossReference { return {id:typeof value?.id==='string'?value.id:crypto.randomUUID(),name:typeof value?.name==='string'?value.name.slice(0,120):'Reference',targetId:typeof value?.targetId==='string'?value.targetId:'',display:['label','number','text'].includes(value?.display)?value.display:'label'}; }
function normalizeIndexEntry(value:any): WriterIndexEntry { return {id:typeof value?.id==='string'?value.id:crypto.randomUUID(),term:typeof value?.term==='string'?value.term.slice(0,200):'',blockId:typeof value?.blockId==='string'?value.blockId:'',subentry:typeof value?.subentry==='string'?value.subentry.slice(0,200):undefined}; }

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
    sectionId: typeof block?.sectionId === 'string' ? block.sectionId : undefined,
  };
  if (type === 'table') out.table = normalizeTable(block?.table);
  if (type === 'image' && typeof block?.image?.src === 'string') out.image = { src: block.image.src.slice(0, 2_000_000), alt: String(block.image.alt ?? '').slice(0, 255), width: clampNumber(block.image.width, 40, 760, 560), height: block.image.height ? clampNumber(block.image.height, 40, 1100, 315) : undefined, rotation: clampNumber(block.image.rotation, -180, 180, 0), crop: block.image.crop && typeof block.image.crop === 'object' ? {top:clampNumber(block.image.crop.top,0,90,0),right:clampNumber(block.image.crop.right,0,90,0),bottom:clampNumber(block.image.crop.bottom,0,90,0),left:clampNumber(block.image.crop.left,0,90,0)} : undefined, wrap: ['inline','square','tight','through','top-bottom','behind','front'].includes(block.image.wrap) ? block.image.wrap : 'inline', anchor: ['paragraph','page','margin'].includes(block.image.anchor) ? block.image.anchor : 'paragraph' };
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
  return { bordered: table?.bordered !== false, headerRows: clampNumber(table?.headerRows,0,20,0), repeatHeaderRow: Boolean(table?.repeatHeaderRow), allowRowBreak: table?.allowRowBreak !== false, borders: table?.borders, rows: rows.map((row: any) => Array.isArray(row) ? row.slice(0, 20).map((cell: any) => ({ id: typeof cell?.id === 'string' ? cell.id : crypto.randomUUID(), runs: Array.isArray(cell?.runs) && cell.runs.length ? cell.runs.map(normalizeRun) : [{ text: '' }], align: ['start', 'center', 'end'].includes(cell?.align) ? cell.align : 'start', verticalAlign: ['top','middle','bottom'].includes(cell?.verticalAlign) ? cell.verticalAlign : 'top', colSpan: clampNumber(cell?.colSpan,1,20,1), rowSpan: clampNumber(cell?.rowSpan,1,50,1), nestedTable: cell?.nestedTable ? normalizeTable(cell.nestedTable) : undefined })) : []) };
}

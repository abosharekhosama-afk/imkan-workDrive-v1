import {
  ConflictException,
  ForbiddenException,
  Injectable,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { OfficeDocumentType, OfficeSessionStatus, FileStatus, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { FilesService } from '../files/files.service';
import type { OfficeDocumentState, OfficeEngine, OfficeType } from './core/office-engine.interface';
import { OfficeConversionService, type OfficeImportResult } from './office-conversion.service';
import { publishOfficeRealtimeEvent } from './office-realtime';
import { Inject } from '@nestjs/common';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';


function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeOoxmlPreservation(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, any> : null;
  if (!v || !v.parts || typeof v.parts !== 'object') return undefined;
  const parts: Record<string,string> = {};
  let bytes = 0;
  for (const [path, encoded] of Object.entries(v.parts).slice(0, 120)) {
    if (!/^(?:word|xl|ppt)\/[^\0]+$|^\[Content_Types\]\.xml$|^_rels\/\.rels$/i.test(path) || typeof encoded !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(encoded)) continue;
    const size = Math.floor(encoded.length * 0.75);
    if (bytes + size > 4 * 1024 * 1024) break;
    parts[path] = encoded; bytes += size;
  }
  const relationships: Record<string, any[]> = {};
  if (v.relationships && typeof v.relationships === 'object') for (const [source, edges] of Object.entries(v.relationships).slice(0, 120)) {
    if (!Array.isArray(edges)) continue;
    relationships[source] = edges.slice(0, 200).map((e:any) => ({
      id: typeof e?.id === 'string' ? e.id.slice(0,200) : undefined,
      type: typeof e?.type === 'string' ? e.type.slice(0,500) : undefined,
      target: typeof e?.target === 'string' ? e.target.slice(0,1000) : undefined,
      targetMode: typeof e?.targetMode === 'string' ? e.targetMode.slice(0,50) : undefined,
      external: Boolean(e?.external),
      resolvedTarget: typeof e?.resolvedTarget === 'string' ? e.resolvedTarget.slice(0,1000) : undefined,
    }));
  }
  const partKinds = v.partKinds && typeof v.partKinds === 'object' ? Object.fromEntries(Object.entries(v.partKinds).slice(0,120).filter(([k,x]) => parts[k] && typeof x === 'string').map(([k,x]) => [k,String(x).slice(0,50)])) : {};
  return { version: 4, sourceFormat: ['docx','xlsx','pptx'].includes(String(v.sourceFormat)) ? String(v.sourceFormat) : 'docx', capturedAt: typeof v.capturedAt === 'string' ? v.capturedAt : new Date().toISOString(), parts, relationships, partKinds, generatedParts: Array.isArray(v.generatedParts) ? v.generatedParts.slice(0,50).map((x:any)=>String(x).slice(0,200)) : [], truncated: Boolean(v.truncated) || Object.keys(parts).length >= 120, totalBytes: bytes };
}

function normalizeOoxmlBridge(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, any> : null;
  if (!v) return undefined;
  const out:any = {};
  if (v.hyperlinks && typeof v.hyperlinks === 'object') out.hyperlinks = Object.fromEntries(Object.entries(v.hyperlinks).slice(0,200).filter(([k,x]) => typeof k === 'string' && typeof x === 'string').map(([k,x]) => [k.slice(0,200), String(x).slice(0,2000)]));
  if (Array.isArray(v.bookmarks)) out.bookmarks = v.bookmarks.slice(0,500).map((b:any)=>({id:String(b?.id||'').slice(0,50),name:String(b?.name||'').slice(0,200)})).filter((b:any)=>b.name);
  if (Array.isArray(v.definedNames)) out.definedNames = v.definedNames.slice(0,500).map((n:any)=>({name:String(n?.name||'').slice(0,255),localSheetId:Number.isFinite(Number(n?.localSheetId))?Number(n.localSheetId):undefined,formula:String(n?.formula||'').slice(0,2000)})).filter((n:any)=>n.name&&n.formula);
  if (v.theme && typeof v.theme === 'object') out.theme = {accent: typeof v.theme.accent === 'string' && /^#[0-9a-f]{6}$/i.test(v.theme.accent) ? v.theme.accent : undefined, fontFamily: typeof v.theme.fontFamily === 'string' ? v.theme.fontFamily.slice(0,100) : undefined};
  return Object.keys(out).length ? out : undefined;
}

function normalizeSheetCell(value: unknown) {
  const c = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const raw = c.value;
  const normalizedValue = typeof raw === 'number' || typeof raw === 'boolean' ? raw : (typeof raw === 'string' ? raw.slice(0, 20000) : null);
  const f = c.format && typeof c.format === 'object' ? c.format as Record<string, unknown> : {};
  return {
    value: normalizedValue,
    formula: typeof c.formula === 'string' && /^=[A-Za-z0-9_$'! .,+\-*/()><=:"]{1,1000}$/.test(c.formula) ? c.formula.slice(0, 1000) : undefined,
    format: {
      bold: Boolean(f.bold), italic: Boolean(f.italic),
      color: typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : undefined,
      background: typeof f.background === 'string' && /^#[0-9a-f]{6}$/i.test(f.background) ? f.background : undefined,
      align: ['start','center','end'].includes(String(f.align)) ? String(f.align) : 'start',
      numberFormat: ['general','number','currency','percent','date'].includes(String(f.numberFormat)) ? String(f.numberFormat) : 'general',
      decimals: Number.isFinite(Number(f.decimals)) ? Math.max(0, Math.min(8, Number(f.decimals))) : undefined,
      border: Boolean(f.border),
    },
    validation: f.validation && typeof f.validation === 'object' ? { type: ['list','number','text'].includes(String((f.validation as any).type)) ? String((f.validation as any).type) : 'text', values: Array.isArray((f.validation as any).values) ? (f.validation as any).values.slice(0,50).map((x:any)=>String(x).slice(0,200)) : undefined, min: Number.isFinite(Number((f.validation as any).min)) ? Number((f.validation as any).min) : undefined, max: Number.isFinite(Number((f.validation as any).max)) ? Number((f.validation as any).max) : undefined } : undefined,
  };
}
function normalizeSheet(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sheets = Array.isArray(v.sheets) ? v.sheets.slice(0, 100).map((x:any, i:number) => {
    const cells: Record<string, unknown> = {};
    if (x?.cells && typeof x.cells === 'object') for (const [key, cell] of Object.entries(x.cells as Record<string, unknown>).slice(0, 10000)) {
      if (/^[A-Z]{1,4}\d{1,7}$/i.test(key)) cells[key.toUpperCase()] = normalizeSheetCell(cell);
    }
    return { id: typeof x?.id === 'string' ? x.id.slice(0,100) : crypto.randomUUID(), name: typeof x?.name === 'string' ? x.name.slice(0,80) : `Sheet${i+1}`, cells, tables: Array.isArray(x?.tables) ? x.tables.slice(0,100).filter((t:any)=>/^[A-Z]{1,4}\d{1,7}$/.test(String(t?.start))&&/^[A-Z]{1,4}\d{1,7}$/.test(String(t?.end))).map((t:any)=>({id:typeof t?.id==='string'?t.id.slice(0,100):crypto.randomUUID(),name:typeof t?.name==='string'?t.name.slice(0,80):'Table',start:String(t.start).toUpperCase(),end:String(t.end).toUpperCase(),hasHeader:t?.hasHeader!==false,style:t?.style==='plain'?'plain':'banded'})) : [], pivotTables: Array.isArray(x?.pivotTables) ? x.pivotTables.slice(0,50).map((t:any)=>({id:typeof t?.id==='string'?t.id.slice(0,100):crypto.randomUUID(),name:typeof t?.name==='string'?t.name.slice(0,80):'Pivot',sourceRange:typeof t?.sourceRange==='string'?t.sourceRange.slice(0,200):'A1:B10',rowField:typeof t?.rowField==='string'?t.rowField.slice(0,80):undefined,columnField:typeof t?.columnField==='string'?t.columnField.slice(0,80):undefined,valueField:typeof t?.valueField==='string'?t.valueField.slice(0,80):undefined,aggregation:['sum','count','average'].includes(String(t?.aggregation))?String(t.aggregation):'sum'})) : [], frozenRows: Number.isFinite(Number(x?.frozenRows)) ? Math.max(0, Math.min(10, Number(x.frozenRows))) : 0, frozenColumns: Number.isFinite(Number(x?.frozenColumns)) ? Math.max(0, Math.min(10, Number(x.frozenColumns))) : 0, columnWidths: x?.columnWidths && typeof x.columnWidths==='object' ? Object.fromEntries(Object.entries(x.columnWidths as Record<string,unknown>).slice(0,100).filter(([k,v])=>/^[A-Z]{1,4}$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Math.max(60,Math.min(420,Number(v)))])) : {}, rowHeights: x?.rowHeights && typeof x.rowHeights==='object' ? Object.fromEntries(Object.entries(x.rowHeights as Record<string,unknown>).slice(0,1000).filter(([k,v])=>/^\d+$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Math.max(22,Math.min(100,Number(v)))])) : {}, filters: x?.filters && typeof x.filters==='object' ? Object.fromEntries(Object.entries(x.filters as Record<string,unknown>).slice(0,100).filter(([k,v])=>/^[A-Z]{1,4}$/.test(k)&&typeof v==='string').map(([k,v])=>[k,String(v).slice(0,200)])) : null, sort: x?.sort && typeof x.sort==='object' && /^[A-Z]{1,4}$/.test(String(x.sort.column)) ? {column:String(x.sort.column),direction:x.sort.direction==='desc'?'desc':'asc'} : null, merges: Array.isArray(x?.merges) ? x.merges.slice(0,200).filter((m:any)=>/^[A-Z]{1,4}\d{1,7}$/.test(String(m?.start))&&/^[A-Z]{1,4}\d{1,7}$/.test(String(m?.end))).map((m:any)=>({start:String(m.start).toUpperCase(),end:String(m.end).toUpperCase()})) : [], charts: Array.isArray(x?.charts) ? x.charts.slice(0,50).map((c:any)=>({id:typeof c?.id==='string'?c.id.slice(0,100):crypto.randomUUID(),type:['column','bar','line','area','pie','doughnut'].includes(String(c?.type))?String(c.type):'column',title:typeof c?.title==='string'?c.title.slice(0,255):'Chart',rangeStart:typeof c?.rangeStart==='string'?c.rangeStart.toUpperCase().slice(0,20):'A1',rangeEnd:typeof c?.rangeEnd==='string'?c.rangeEnd.toUpperCase().slice(0,20):'B5',position:{row:Math.max(0,Math.min(1000,Number(c?.position?.row)||1)),col:Math.max(0,Math.min(1000,Number(c?.position?.col)||7))},width:clampNumber(c?.width,360,900,520),height:clampNumber(c?.height,220,600,300),legend:c?.legend!==false,showLabels:Boolean(c?.showLabels),series:Array.isArray(c?.series)?c.series.slice(0,20).map((x:any)=>String(x).slice(0,100)):undefined})) : [] };
  }) : [];
  const safeSheets = sheets.length ? sheets : [{ id: 'sheet-1', name: 'Sheet1', cells: {} }];
  const active = typeof v.activeSheet === 'string' && safeSheets.some((x:any) => x.id === v.activeSheet) ? v.activeSheet : safeSheets[0].id;
  return { schema: 6, type: 'SHEET', title: typeof v.title === 'string' ? v.title.slice(0,255) : 'Untitled spreadsheet', activeSheet: active, sheets: safeSheets, namedRanges: Array.isArray(v.namedRanges) ? v.namedRanges.slice(0,500).map((n:any)=>({name:typeof n?.name==='string'?n.name.slice(0,80):'Range',reference:typeof n?.reference==='string'?n.reference.slice(0,200):'A1',scopeSheetId:typeof n?.scopeSheetId==='string'?n.scopeSheetId.slice(0,100):undefined})) : [], _ooxmlPreservation: normalizeOoxmlPreservation(v._ooxmlPreservation), _ooxmlBridge: normalizeOoxmlBridge(v._ooxmlBridge) };
}

function normalizeWriterPage(value: unknown) {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    size: ['A4','LETTER','LEGAL','CUSTOM'].includes(String(p.size)) ? String(p.size) : 'A4',
    widthMm: clampNumber(p.widthMm, 80, 500, 210), heightMm: clampNumber(p.heightMm, 80, 500, 297),
    marginTopMm: clampNumber(p.marginTopMm, 0, 80, 20), marginRightMm: clampNumber(p.marginRightMm, 0, 80, 20),
    marginBottomMm: clampNumber(p.marginBottomMm, 0, 80, 20), marginLeftMm: clampNumber(p.marginLeftMm, 0, 80, 20),
    orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait',
    header: typeof p.header === 'string' ? p.header.slice(0,500) : '', footer: typeof p.footer === 'string' ? p.footer.slice(0,500) : '',
    showPageNumbers: p.showPageNumbers !== false,
  };
}
function normalizeWriterRun(value: unknown) {
  const r = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { text: typeof r.text === 'string' ? r.text.slice(0, 20000) : '', bold: Boolean(r.bold), italic: Boolean(r.italic), underline: Boolean(r.underline), strike: Boolean(r.strike), fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily.slice(0,80) : undefined, fontSize: clampNumber(r.fontSize,8,96,16), color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : undefined, href: typeof r.href === 'string' && /^https?:\/\//i.test(r.href) ? r.href.slice(0,2000) : undefined, highlight: typeof r.highlight === 'string' && /^#[0-9a-f]{6}$/i.test(r.highlight) ? r.highlight : undefined, verticalAlign: r.verticalAlign === 'superscript' || r.verticalAlign === 'subscript' ? r.verticalAlign : undefined };
}
function normalizeWriterReview(value: unknown, actorId?: string) {
  const r = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const comments = Array.isArray(r.comments) ? r.comments.slice(-500).map((c:any) => ({
    id: typeof c?.id === 'string' ? c.id.slice(0,100) : crypto.randomUUID(), blockId: typeof c?.blockId === 'string' ? c.blockId.slice(0,100) : '',
    text: typeof c?.text === 'string' ? c.text.slice(0,4000) : '', authorId: actorId ?? (typeof c?.authorId === 'string' ? c.authorId.slice(0,100) : undefined),
    authorName: typeof c?.authorName === 'string' ? c.authorName.slice(0,120) : undefined, createdAt: typeof c?.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
    resolved: Boolean(c?.resolved), replies: Array.isArray(c?.replies) ? c.replies.slice(-50).map((x:any)=>({id:typeof x?.id==='string'?x.id.slice(0,100):crypto.randomUUID(),text:typeof x?.text==='string'?x.text.slice(0,2000):'',authorId:actorId ?? (typeof x?.authorId==='string'?x.authorId.slice(0,100):undefined),authorName:typeof x?.authorName==='string'?x.authorName.slice(0,120):undefined,createdAt:typeof x?.createdAt==='string'?x.createdAt:new Date().toISOString()})) : []
  })) : [];
  const changes = Array.isArray(r.changes) ? r.changes.slice(-500).map((c:any) => ({
    id: typeof c?.id === 'string' ? c.id.slice(0,100) : crypto.randomUUID(), blockId: typeof c?.blockId === 'string' ? c.blockId.slice(0,100) : '',
    kind: c?.kind === 'delete' || c?.kind === 'format' ? c.kind : 'insert', before: Array.isArray(c?.before) ? c.before.slice(0,500).map(normalizeWriterRun) : [], after: Array.isArray(c?.after) ? c.after.slice(0,500).map(normalizeWriterRun) : [],
    authorId: actorId ?? (typeof c?.authorId === 'string' ? c.authorId.slice(0,100) : undefined), authorName: typeof c?.authorName === 'string' ? c.authorName.slice(0,120) : undefined,
    createdAt: typeof c?.createdAt === 'string' ? c.createdAt : new Date().toISOString(), status: c?.status === 'accepted' || c?.status === 'rejected' ? c.status : 'pending'
  })) : [];
  const snapshots = Array.isArray(r.snapshots) ? r.snapshots.slice(-20).map((x:any)=>({id:typeof x?.id==='string'?x.id.slice(0,100):crypto.randomUUID(),revision:Number.isFinite(Number(x?.revision))?Number(x.revision):0,title:typeof x?.title==='string'?x.title.slice(0,255):'Snapshot',createdAt:typeof x?.createdAt==='string'?x.createdAt:new Date().toISOString(),blocks:Array.isArray(x?.blocks)?x.blocks.slice(0,5000).map(normalizeWriterBlock):[]})) : [];
  return { trackChanges: Boolean(r.trackChanges), comments, changes, snapshots };
}
function normalizeWriterBlock(value: unknown) {
  const b = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const type = ['paragraph','heading1','heading2','heading3','list-item','table','image','page-break'].includes(String(b.type)) ? String(b.type) : 'paragraph';
  const runs = Array.isArray(b.runs) ? b.runs.slice(0,500).map(normalizeWriterRun) : [{text:''}];
  const base: any = { id: typeof b.id === 'string' ? b.id.slice(0,100) : crypto.randomUUID(), type, align: ['start','center','end','justify'].includes(String(b.align)) ? String(b.align) : 'start', ordered: Boolean(b.ordered), runs, lineSpacing: clampNumber(b.lineSpacing,1,3,1.5), spaceBefore: clampNumber(b.spaceBefore,0,100,0), spaceAfter: clampNumber(b.spaceAfter,0,100,8), pageBreakBefore: Boolean(b.pageBreakBefore), indentLeftMm: clampNumber(b.indentLeftMm,0,100,0), indentRightMm: clampNumber(b.indentRightMm,0,100,0), firstLineIndentMm: clampNumber(b.firstLineIndentMm,-30,50,0), keepWithNext: Boolean(b.keepWithNext) };
  if (type === 'image' && b.image && typeof b.image === 'object') { const i=b.image as Record<string,unknown>; base.image={src:typeof i.src==='string'?i.src.slice(0,2000000):'',alt:typeof i.alt==='string'?i.alt.slice(0,255):'',width:clampNumber(i.width,40,760,560),height:i.height?clampNumber(i.height,40,1100,315):undefined}; }
  if (type === 'table' && b.table && typeof b.table === 'object') { const t=b.table as Record<string,unknown>; base.table={bordered:t.bordered!==false,rows:Array.isArray(t.rows)?t.rows.slice(0,50).map((row:any)=>Array.isArray(row)?row.slice(0,20).map((c:any)=>({id:typeof c?.id==='string'?c.id.slice(0,100):crypto.randomUUID(),runs:Array.isArray(c?.runs)?c.runs.slice(0,500).map(normalizeWriterRun):[{text:''}],align:['start','center','end'].includes(String(c?.align))?String(c.align):'start'})):[]):[]}; }
  return base;
}
function normalizeWriterExtras(value: unknown) {
  const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const bookmarks=Array.isArray(v.bookmarks)?v.bookmarks.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id.slice(0,100):crypto.randomUUID(),name:typeof x?.name==='string'?x.name.slice(0,120):'Bookmark',blockId:typeof x?.blockId==='string'?x.blockId.slice(0,100):''})):[];
  const footnotes=Array.isArray(v.footnotes)?v.footnotes.slice(0,500).map((x:any)=>({id:typeof x?.id==='string'?x.id.slice(0,100):crypto.randomUUID(),marker:typeof x?.marker==='string'?x.marker.slice(0,20):'*',text:typeof x?.text==='string'?x.text.slice(0,4000):'',blockId:typeof x?.blockId==='string'?x.blockId.slice(0,100):''})):[];
  return {bookmarks,footnotes};
}

const TYPE_TO_FORMAT: Record<OfficeType, string> = {
  WRITER: 'imkan-writer-json',
  SHEET: 'imkan-sheet-json',
  SHOW: 'imkan-show-json',
};

const MIME_BY_TYPE: Record<OfficeType, string> = {
  WRITER: 'application/vnd.imkan.writer+json',
  SHEET: 'application/vnd.imkan.sheet+json',
  SHOW: 'application/vnd.imkan.show+json',
};

function defaultContent(type: OfficeType) {
  if (type === 'WRITER') {
    return { schema: 5, type, title: 'Untitled document', language: 'mixed', page: normalizeWriterPage(undefined), blocks: [{ id: 'p1', type: 'paragraph', align: 'start', lineSpacing: 1.5, spaceAfter: 8, runs: [{ text: '' }] }], review: { trackChanges: false, comments: [], changes: [], snapshots: [] } };
  }
  if (type === 'SHEET') {
    return { schema: 6, type, title: 'Untitled spreadsheet', activeSheet: 'sheet-1', sheets: [{ id: 'sheet-1', name: 'Sheet1', cells: {} }] };
  }
  return { schema: 3, type, title: 'Untitled presentation', aspectRatio: '16:9', activeSlide: 'slide-1', theme: { fontFamily: 'Arial', accent: '#2563eb' }, slides: [{ id: 'slide-1', layout: 'title-content', background: '#ffffff', elements: [{ id: 'title', type: 'text', x: 8, y: 12, width: 84, height: 18, text: 'Presentation title', fontSize: 32, bold: true, align: 'center', color: '#111827' }, { id: 'content', type: 'text', x: 12, y: 40, width: 76, height: 28, text: 'Add your content here', fontSize: 20, align: 'center', color: '#475569' }] }] };
}

@Injectable()
export class OfficeService implements OfficeEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    @Inject(forwardRef(() => FilesService)) private readonly files: FilesService,
    private readonly conversion: OfficeConversionService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private async getAuthorizedFile(user: AccessTokenPayload, fileId: string, write = false) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId: user.org_id, deletedAt: null, status: FileStatus.ACTIVE },
      include: { folder: { select: { teamFolderId: true } } },
    });
    if (!file) throw new NotFoundException('File not found');
    const resource = { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null };
    if (!this.permissions.canRead(user, resource) || (write && !this.permissions.canWrite(user, resource))) {
      throw new ForbiddenException(write ? 'You do not have permission to edit this file' : 'You do not have permission to open this file');
    }
    return file;
  }

  private normalizeType(value: unknown): OfficeType {
    const type = String(value ?? '').toUpperCase();
    if (type === 'WRITER' || type === 'SHEET' || type === 'SHOW') return type;
    throw new ForbiddenException('Unsupported Office document type');
  }

  async createImported(user: AccessTokenPayload, result: OfficeImportResult, folderId: string | null) {
    const type = result.type;
    const content = this.normalizeOfficeContent(result.content);
    const bytes = Buffer.from(JSON.stringify(content), 'utf8');
    const file = await this.files.createFileFromBytes(user, { folderId, name: `${result.title}.imkan`, mimeType: MIME_BY_TYPE[type], extension: 'imkan', bytes });
    const document = await this.prisma.officeDocument.create({ data: { orgId: user.org_id, fileId: file.file_id, type: type as OfficeDocumentType, nativeFormat: TYPE_TO_FORMAT[type], content: content as Prisma.InputJsonValue } });
    return { ...this.toState(document), importedFrom: result.sourceFormat };
  }

  async exportFile(user: AccessTokenPayload, fileId: string, format: 'docx'|'xlsx'|'pptx') {
    const document = await this.open(user, fileId);
    const result = await this.conversion.export(document.type as OfficeType, document.content, format);
    return { filename: result.filename, mimeType: result.mimeType, dataBase64: result.buffer.toString('base64') };
  }

  /**
   * Completes the Template -> File -> OfficeDocument lifecycle for a file
   * created from a template snapshot. The original file bytes remain the
   * canonical FileVersion while the native Office state becomes the editable
   * representation used by Writer/Sheet/Show sessions.
   */
  async initializeFromTemplateFile(
    user: AccessTokenPayload,
    fileId: string,
    sourceTemplateId: string,
    sourceTemplateVersionId: string,
  ): Promise<OfficeDocumentState> {
    const file = await this.getAuthorizedFile(user, fileId, true);
    const existing = await this.prisma.officeDocument.findUnique({ where: { fileId } });
    if (existing) return this.toState(existing);

    const version = await this.prisma.fileVersion.findFirst({
      where: { fileId, orgId: user.org_id },
      orderBy: { versionNumber: 'desc' },
      include: { storageObject: true },
    });
    const extension = (file.extension ?? version?.extension ?? '').replace(/^\./, '').toLowerCase();
    if (!version?.storageObject?.storageKey || !['docx', 'xlsx', 'pptx'].includes(extension)) {
      throw new ConflictException('Template output is not a supported IMKAN Office format');
    }

    const bytes = await this.storage.readStoredObject(version.storageObject.storageKey);
    const imported = await this.conversion.import(bytes, file.name);
    const content = this.normalizeOfficeContent(imported.content);
    const document = await this.prisma.officeDocument.create({
      data: {
        orgId: user.org_id,
        fileId,
        type: imported.type as OfficeDocumentType,
        nativeFormat: TYPE_TO_FORMAT[imported.type],
        content: content as Prisma.InputJsonValue,
        sourceTemplateId,
        sourceTemplateVersionId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'OFFICE_DOCUMENT_INITIALIZED_FROM_TEMPLATE',
        resourceType: 'OFFICE_DOCUMENT',
        resourceId: document.id,
        metadata: { fileId, sourceTemplateId, sourceTemplateVersionId, sourceFileVersionId: version.id },
      },
    });
    return this.toState(document);
  }

  async open(user: AccessTokenPayload, fileId: string): Promise<OfficeDocumentState> {
    const file = await this.getAuthorizedFile(user, fileId);
    const document = await this.prisma.officeDocument.findUnique({ where: { fileId } });
    if (!document) {
      throw new NotFoundException('This file is not an IMKAN Office document yet');
    }
    return this.toState(document);
  }

  async create(user: AccessTokenPayload, input: { name: string; type: OfficeType; folderId?: string | null }): Promise<OfficeDocumentState> {
    const type = this.normalizeType(input.type);
    const content = defaultContent(type);
    const bytes = Buffer.from(JSON.stringify(content), 'utf8');
    const file = await this.files.createFileFromBytes(user, {
      folderId: input.folderId ?? null,
      name: input.name,
      mimeType: MIME_BY_TYPE[type],
      extension: 'imkan',
      bytes,
    });
    const document = await this.prisma.officeDocument.create({
      data: { orgId: user.org_id, fileId: file.file_id, type: type as OfficeDocumentType, nativeFormat: TYPE_TO_FORMAT[type], content: content as Prisma.InputJsonValue },
    });
    return this.toState(document);
  }

  async save(user: AccessTokenPayload, fileId: string, content: unknown, expectedRevision?: number, sessionId?: string): Promise<OfficeDocumentState> {
    await this.getAuthorizedFile(user, fileId, true);
    this.assertContentSize(content);
    content = this.normalizeOfficeContent(content);
    const existing = await this.prisma.officeDocument.findUnique({ where: { fileId } });
    if (!existing) throw new NotFoundException('Office document not found');
    if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
      throw new ConflictException({ message: 'The document changed while you were editing it', code: 'OFFICE_REVISION_CONFLICT', revision: existing.revision });
    }
    if ((content as any)?.type === 'WRITER' && existing.type === OfficeDocumentType.WRITER) {
      const current = existing.content as any;
      const incoming = content as any;
      const review = normalizeWriterReview(incoming.review, user.sub);
      if (review.trackChanges) {
        const snapshot = { id: crypto.randomUUID(), revision: existing.revision, title: typeof current?.title === 'string' ? current.title : 'Snapshot', createdAt: new Date().toISOString(), blocks: Array.isArray(current?.blocks) ? current.blocks.slice(0,5000).map(normalizeWriterBlock) : [] };
        review.snapshots = [...review.snapshots, snapshot].slice(-20);
      }
      (content as any).review = review;
    }
    if (sessionId) {
      const session = await this.prisma.officeSession.findFirst({ where: { id: sessionId, orgId: user.org_id, userId: user.sub, fileId, status: OfficeSessionStatus.ACTIVE } });
      if (!session) throw new ForbiddenException('Invalid Office session');
    }
    const baseRevision = existing.revision;
    const next = await this.prisma.officeDocument.update({
      where: { fileId },
      data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } },
    });
    const operation = await this.prisma.officeOperation.create({
      data: {
        orgId: user.org_id, fileId, documentId: existing.id, sessionId: sessionId || undefined, userId: user.sub,
        kind: 'document-save', baseRevision, revision: next.revision,
        payload: { revision: next.revision, type: existing.type, savedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
    publishOfficeRealtimeEvent({ fileId, type: 'document-saved', revision: next.revision, operationId: operation.id, userId: user.sub, sessionId });
    return this.toState(next);
  }

  async openSession(user: AccessTokenPayload, fileId: string) {
    const document = await this.open(user, fileId);
    const session = await this.prisma.officeSession.create({
      data: { orgId: user.org_id, fileId, documentId: document.id, userId: user.sub, type: document.type as OfficeDocumentType },
    });
    return { sessionId: session.id, document };
  }

  async closeSession(user: AccessTokenPayload, sessionId: string) {
    const session = await this.prisma.officeSession.findFirst({ where: { id: sessionId, orgId: user.org_id, userId: user.sub, status: OfficeSessionStatus.ACTIVE } });
    if (!session) throw new NotFoundException('Office session not found');
    await this.prisma.officeSession.update({ where: { id: session.id }, data: { status: OfficeSessionStatus.CLOSED, closedAt: new Date() } });
    await this.prisma.officePresence.updateMany({ where: { sessionId: session.id }, data: { status: 'IDLE', lastSeenAt: new Date() } });
    publishOfficeRealtimeEvent({ fileId: session.fileId, type: 'presence-changed', userId: user.sub, sessionId: session.id, status: 'IDLE' });
    return { ok: true };
  }

  async touchSession(user: AccessTokenPayload, sessionId: string) {
    const session = await this.prisma.officeSession.findFirst({ where: { id: sessionId, orgId: user.org_id, userId: user.sub, status: OfficeSessionStatus.ACTIVE } });
    if (!session) throw new NotFoundException('Office session not found');
    await this.prisma.officeSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
    return { ok: true };
  }

  async listPresence(user: AccessTokenPayload, fileId: string) {
    await this.getAuthorizedFile(user, fileId, false);
    const cutoff = new Date(Date.now() - 90_000);
    await this.prisma.officePresence.updateMany({ where: { orgId: user.org_id, fileId, lastSeenAt: { lt: cutoff }, status: 'ACTIVE' }, data: { status: 'IDLE' } });
    return this.prisma.officePresence.findMany({
      where: { orgId: user.org_id, fileId, status: { in: ['ACTIVE', 'IDLE'] }, lastSeenAt: { gte: cutoff } },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async heartbeatPresence(user: AccessTokenPayload, sessionId: string, input?: { cursor?: unknown; selection?: unknown; status?: 'ACTIVE'|'IDLE' }) {
    const session = await this.prisma.officeSession.findFirst({ where: { id: sessionId, orgId: user.org_id, userId: user.sub, status: OfficeSessionStatus.ACTIVE } });
    if (!session) throw new NotFoundException('Office session not found');
    const safe = (v: unknown) => { try { const bytes = Buffer.byteLength(JSON.stringify(v ?? null), 'utf8'); return bytes <= 16_384 ? v : undefined; } catch { return undefined; } };
    const presence = await this.prisma.officePresence.upsert({
      where: { sessionId },
      create: { orgId: user.org_id, fileId: session.fileId, sessionId, userId: user.sub, cursor: safe(input?.cursor) as Prisma.InputJsonValue | undefined, selection: safe(input?.selection) as Prisma.InputJsonValue | undefined, status: input?.status === 'IDLE' ? 'IDLE' : 'ACTIVE' },
      update: { cursor: safe(input?.cursor) as Prisma.InputJsonValue | undefined, selection: safe(input?.selection) as Prisma.InputJsonValue | undefined, status: input?.status === 'IDLE' ? 'IDLE' : 'ACTIVE', lastSeenAt: new Date() },
    });
    publishOfficeRealtimeEvent({ fileId: session.fileId, type: 'presence-changed', userId: user.sub, sessionId: session.id, status: presence.status });
    return presence;
  }

  async listOperations(user: AccessTokenPayload, fileId: string, sinceRevision?: number) {
    await this.getAuthorizedFile(user, fileId, false);
    const ops = await this.prisma.officeOperation.findMany({ where: { orgId: user.org_id, fileId, ...(Number.isFinite(Number(sinceRevision)) ? { revision: { gt: Number(sinceRevision) } } : {}) }, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { revision: 'asc' }, take: 100 });
    return ops;
  }

  private assertContentSize(content: unknown) {
    const bytes = Buffer.byteLength(JSON.stringify(content ?? null), 'utf8');
    if (bytes > 8 * 1024 * 1024) throw new ConflictException({ message: 'Office document state is too large', code: 'OFFICE_DOCUMENT_TOO_LARGE' });
  }

  private normalizeOfficeContent(content: unknown) {
    if (!content || typeof content !== 'object') throw new ConflictException({ message: 'Invalid Office document state', code: 'OFFICE_INVALID_DOCUMENT' });
    const value = content as Record<string, unknown>;
    const type = this.normalizeType(value.type);
    if (type === 'WRITER') {
      const blocks = Array.isArray(value.blocks) ? value.blocks.slice(0, 5000) : [];
      const extras=normalizeWriterExtras(value); return { schema: 5, type, title: typeof value.title === 'string' ? String(value.title).slice(0, 255) : 'Untitled document', language: value.language === 'ar' || value.language === 'en' ? value.language : 'mixed', page: normalizeWriterPage(value.page), blocks: blocks.map(normalizeWriterBlock), review: normalizeWriterReview(value.review), ...extras, _ooxmlPreservation: normalizeOoxmlPreservation(value._ooxmlPreservation), _ooxmlBridge: normalizeOoxmlBridge(value._ooxmlBridge) };
    }
    if (type === 'SHEET') return normalizeSheet(value);
    const slides = Array.isArray(value.slides) ? value.slides.slice(0, 200).map((raw: any) => {
      const rawElements = Array.isArray(raw?.elements) ? raw.elements.slice(0, 200) : [];
      const elements = rawElements.map((e: any) => {
        const rows = Array.isArray(e?.rows) ? e.rows.slice(0, 30).map((r: any) => Array.isArray(r) ? r.slice(0, 20).map((c: any) => String(c).slice(0, 500)) : []) : undefined;
        const fontFamily = typeof e?.fontFamily === 'string' ? String(e.fontFamily).slice(0, 80) : 'Arial';
        const fill = typeof e?.fill === 'string' && /^#[0-9a-f]{6}$/i.test(e.fill) ? e.fill : undefined;
        const color = typeof e?.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : undefined;
        return {
          id: typeof e?.id === 'string' ? e.id.slice(0, 100) : crypto.randomUUID(),
          type: ['text','shape','image','video','audio','line','table'].includes(String(e?.type)) ? String(e.type) : 'text',
          x: clampNumber(e?.x, 0, 100, 10), y: clampNumber(e?.y, 0, 100, 10), width: clampNumber(e?.width, 1, 100, 40), height: clampNumber(e?.height, 1, 100, 20),
          rotation: clampNumber(e?.rotation, -360, 360, 0),
          text: typeof e?.text === 'string' ? e.text.slice(0, 10000) : undefined,
          src: typeof e?.src === 'string' && /^(https?:\/\/|data:audio\/|data:video\/|blob:)/i.test(e.src) ? e.src.slice(0, 4000) : undefined,
          shape: ['rect','circle','roundRect'].includes(String(e?.shape)) ? String(e.shape) : undefined,
          fill, color, fontSize: clampNumber(e?.fontSize, 8, 120, 20), fontFamily,
          bold: Boolean(e?.bold), italic: Boolean(e?.italic), underline: Boolean(e?.underline), strike: Boolean(e?.strike),
          lineHeight: clampNumber(e?.lineHeight, 0.8, 3, 1.2),
          bullet: ['none','bullet','number'].includes(String(e?.bullet)) ? String(e.bullet) : 'none',
          align: ['start','center','end'].includes(String(e?.align)) ? String(e.align) : 'start',
          border: Boolean(e?.border), rows, mediaAutoplay: Boolean(e?.mediaAutoplay), mediaLoop: Boolean(e?.mediaLoop), mediaMuted: Boolean(e?.mediaMuted), animation: e?.animation && typeof e.animation === 'object' ? { type: ['fade','zoom','slide-in','float'].includes(String(e.animation.type)) ? String(e.animation.type) : 'fade', duration: clampNumber(e.animation.duration, 50, 10000, 500), delay: clampNumber(e.animation.delay, 0, 60000, 0), direction: ['left','right','up','down'].includes(String(e.animation.direction)) ? String(e.animation.direction) : undefined } : undefined, groupId: typeof e?.groupId === 'string' ? e.groupId.slice(0,100) : undefined,
        };
      });
      return {
        id: typeof raw?.id === 'string' ? raw.id.slice(0, 100) : crypto.randomUUID(),
        layout: ['blank','title','title-content','two-column','image-text'].includes(String(raw?.layout)) ? String(raw.layout) : 'blank',
        background: typeof raw?.background === 'string' && /^#[0-9a-f]{6}$/i.test(raw.background) ? raw.background : '#ffffff',
        elements, notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 5000) : undefined, master: typeof raw?.master === 'string' ? raw.master.slice(0,100) : undefined, section: typeof raw?.section === 'string' ? raw.section.slice(0,120) : undefined, transition: ['none','fade','slide'].includes(String(raw?.transition)) ? String(raw.transition) : 'none', transitionDuration: clampNumber(raw?.transitionDuration,0,5000,300), autoAdvanceMs: clampNumber(raw?.autoAdvanceMs,0,600000,0),
      };
    }) : [];
    const safeSlides = slides.length ? slides : [{ id: 'slide-1', layout: 'blank', background: '#ffffff', elements: [] }];
    const activeSlide = typeof value.activeSlide === 'string' && safeSlides.some((x:any)=>x.id===value.activeSlide) ? value.activeSlide : safeSlides[0].id;
    return { schema: 5, type, title: typeof value.title === 'string' ? value.title.slice(0,255) : 'Untitled presentation', _ooxmlPreservation: normalizeOoxmlPreservation(value._ooxmlPreservation), _ooxmlBridge: normalizeOoxmlBridge(value._ooxmlBridge), aspectRatio: value.aspectRatio === '4:3' ? '4:3' : '16:9', activeSlide, theme: { fontFamily: typeof (value.theme as any)?.fontFamily === 'string' ? String((value.theme as any).fontFamily).slice(0,80) : 'Arial', headingFont: typeof (value.theme as any)?.headingFont === 'string' ? String((value.theme as any).headingFont).slice(0,80) : 'Arial', secondary: typeof (value.theme as any)?.secondary === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).secondary) ? (value.theme as any).secondary : '#64748b', background: typeof (value.theme as any)?.background === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).background) ? (value.theme as any).background : '#ffffff', accent: typeof (value.theme as any)?.accent === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).accent) ? (value.theme as any).accent : '#2563eb' }, slides: safeSlides };
  }

  async getCapabilities() {
    return {
      version: 22,
      native: true,
      externalEditor: false,
      applications: {
        writer: { enabled: true, phase: 'core', features: ['rich-text', 'headings', 'lists', 'alignment', 'undo-redo', 'autosave', 'rtl'] },
        sheet: { enabled: true, phase: 'professional', features: ['workbook', 'multi-sheet', 'cell-grid', 'selection', 'formatting', 'number-formats', 'formulas', 'nested-formulas', 'cross-sheet-references', 'absolute-references', 'autosave', 'freeze', 'filters', 'data-validation', 'merge-cells', 'undo-redo', 'charts', 'visualization', 'xlsx-compatibility', 'formula-import-export', 'freeze-panes', 'merge-import-export', 'column-row-sizing'] },
        show: { enabled: true, phase: 'advanced', features: ['multiple-slides', 'slide-navigator', 'layouts', 'text-elements', 'shapes', 'images', 'lines', 'tables', 'themes', 'aspect-ratio', 'drag-drop', 'multi-select', 'grouping', 'slide-master', 'speaker-notes', 'transitions', 'media', 'audio', 'video', 'element-animations', 'auto-advance', 'presenter-mode', 'undo-redo', 'autosave', 'revision-guard'] },
      },
      features: { autosave: true, revisionGuard: true, sessions: true, collaboration: true, importExport: true,
        importExportFormats: ['docx','xlsx','pptx','imkan-json'], writerDocxCompatibility: true, writerDocxStyles: true, writerDocxTables: true, writerDocxPageSettings: true, writerDocxHeadersFooters: true, writerRichText: true, writerPageLayout: true, writerTables: true, writerImages: true, writerLinks: true, writerHeadersFooters: true, writerPrint: true, writerComments: true, writerTrackChanges: true, writerCompare: true, sheetCore: true, sheetFormulas: true, sheetFormulaV3: true, sheetCrossSheetRefs: true, sheetDataValidation: true, sheetFilters: true, sheetMerges: true, sheetCharts: true, sheetVisualization: true, sheetUndoRedo: true, sheetFormatting: true, sheetXlsxCompatibility: true, sheetXlsxFormulas: true, sheetXlsxMerges: true, sheetXlsxFreezePanes: true, sheetXlsxDimensions: true, showCore: true, showSlides: true, showMedia: true, showAudio: true, showVideo: true, showAnimations: true, showAutoAdvance: true, showLayouts: true, showElements: true, showThemes: true, showRichText: true, showObjectOrdering: true, showTables: true, showPresenterPreview: true, showUndoRedo: true, showPptxCompatibility: true, showPptxSlides: true, showPptxText: true, showPptxShapes: true, showPptxThemes: true, showPptxRoundTrip: true, conversionDiagnostics: true, conversionWarnings: true, roundTripDiagnostics: true, compatibilityCenter: true, roundTripAnalysis: true, conversionCategories: true, conversionMetadata: true, advancedDocxMedia: true, advancedXlsxFormatting: true, advancedXlsxCharts: true, advancedPptxImages: true, advancedPptxTables: true, advancedPptxMediaRelationships: true, deepDocxStyles: true, deepDocxNumbering: true, deepDocxLists: true, deepDocxMediaPreservation: true, deepXlsxStyles: true, deepXlsxCharts: true, deepXlsxValidation: true, deepXlsxConditionalFormatting: true, deepPptxMedia: true, deepPptxTables: true, roundTripQuality: true, nativeOoxmlPreservation: true, ooxmlPreservationGraph: true, relationshipAwarePreservation: true, selectiveOoxmlMerge: true, relationshipConflictResolution: true, nativeMediaBridge: true, nativeChartBridge: true, nativeThemeBridge: true, definedNamesBridge: true, preservedRelationshipRebinding: true, contentTypesMerge: true, rootRelationshipMerge: true, collaborationFoundation: true,
      realTimeOperations: true,
      serverSentEventsTransport: true,
      operationOrdering: true, officePresence: true, officeOperationLog: true, collaborationPolling: true },
    };
  }

  private toState(document: { id: string; fileId: string; type: OfficeDocumentType; nativeFormat: string; content: unknown; revision: number; updatedAt: Date; sourceTemplateId?: string | null; sourceTemplateVersionId?: string | null }): OfficeDocumentState {
    return { id: document.id, fileId: document.fileId, type: document.type as OfficeType, nativeFormat: document.nativeFormat, content: document.content, revision: document.revision, updatedAt: document.updatedAt.toISOString(), sourceTemplateId: document.sourceTemplateId ?? null, sourceTemplateVersionId: document.sourceTemplateVersionId ?? null };
  }
}

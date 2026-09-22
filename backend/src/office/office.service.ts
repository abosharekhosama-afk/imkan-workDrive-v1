import {
  ConflictException,
  ForbiddenException,
  Injectable,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { OfficeDocumentType, OfficeSessionStatus, FileStatus, Prisma, OrgRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { FilesService } from '../files/files.service';
import type { OfficeDocumentState, OfficeEngine, OfficeType } from './core/office-engine.interface';
import { OfficeConversionService, type OfficeImportResult } from './office-conversion.service';
import { publishOfficeRealtimeEvent } from './office-realtime';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowEngineService } from '../workflows/workflow-engine.service';
import { Inject } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { computeOfficeContentHash } from './office-versioning';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { DlpService } from '../dlp/dlp.service';


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
function normalizeSheetChart(value: unknown) {
  const c = value && typeof value === 'object' ? value as Record<string, any> : {};
  const axis = (raw: any) => raw && typeof raw === 'object' ? {
    min: Number.isFinite(Number(raw.min)) ? Number(raw.min) : undefined,
    max: Number.isFinite(Number(raw.max)) ? Number(raw.max) : undefined,
    tick: Number.isFinite(Number(raw.tick)) ? Number(raw.tick) : undefined,
    title: typeof raw.title === 'string' ? raw.title.slice(0,100) : '',
    labels: raw.labels !== false,
    grid: raw.grid !== false,
  } : undefined;
  return {
    id: typeof c.id === 'string' ? c.id.slice(0,100) : crypto.randomUUID(),
    type: ['column','bar','line','area','pie','doughnut','scatter','combo'].includes(String(c.type)) ? String(c.type) : 'column',
    title: typeof c.title === 'string' ? c.title.slice(0,255) : 'Chart',
    rangeStart: typeof c.rangeStart === 'string' ? c.rangeStart.toUpperCase().slice(0,20) : 'A1',
    rangeEnd: typeof c.rangeEnd === 'string' ? c.rangeEnd.toUpperCase().slice(0,20) : 'B5',
    position: { row: Math.max(0,Math.min(1000,Number(c.position?.row)||1)), col: Math.max(0,Math.min(1000,Number(c.position?.col)||7)) },
    width: clampNumber(c.width,360,900,560), height: clampNumber(c.height,220,600,330),
    legend: c.legend !== false, showLabels: Boolean(c.showLabels), showMarkers: c.showMarkers !== false, showValues: Boolean(c.showValues),
    series: Array.isArray(c.series) ? c.series.slice(0,20).map((x:any)=>String(x).slice(0,100)) : undefined,
    seriesTypes: Array.isArray(c.seriesTypes) ? c.seriesTypes.slice(0,20).filter((x:any)=>['column','line','bar'].includes(String(x))).map((x:any)=>String(x)) : undefined,
    stackMode: ['none','stacked','percent'].includes(String(c.stackMode)) ? String(c.stackMode) : 'none',
    theme: ['office','mono','ocean','nature','sunset'].includes(String(c.theme)) ? String(c.theme) : 'office',
    colors: Array.isArray(c.colors) ? c.colors.slice(0,12).filter((x:any)=>typeof x==='string' && /^#[0-9a-f]{6}$/i.test(x)) : undefined,
    xAxis: axis(c.xAxis), yAxis: axis(c.yAxis),
    trendline: c.trendline && typeof c.trendline === 'object' ? { enabled:Boolean(c.trendline.enabled), type:'linear', seriesIndex:Math.max(0,Math.min(19,Number(c.trendline.seriesIndex)||0)) } : { enabled:false, type:'linear', seriesIndex:0 },
  };
}

function normalizeSheet(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sheets = Array.isArray(v.sheets) ? v.sheets.slice(0,100).map((x:any,i:number) => {
    const cells: Record<string, unknown> = {};
    if (x?.cells && typeof x.cells === 'object') for (const [key,cell] of Object.entries(x.cells as Record<string,unknown>).slice(0,10000)) if (/^[A-Z]{1,4}\d{1,7}$/i.test(key)) cells[key.toUpperCase()] = normalizeSheetCell(cell);
    return {
      id: typeof x?.id === 'string' ? x.id.slice(0,100) : crypto.randomUUID(),
      name: typeof x?.name === 'string' ? x.name.slice(0,80) : `Sheet${i+1}`,
      cells,
      tables: Array.isArray(x?.tables) ? x.tables.slice(0,100).filter((t:any)=>/^[A-Z]{1,4}\d{1,7}$/.test(String(t?.start))&&/^[A-Z]{1,4}\d{1,7}$/.test(String(t?.end))).map((t:any)=>({id:typeof t?.id==='string'?t.id.slice(0,100):crypto.randomUUID(),name:typeof t?.name==='string'?t.name.slice(0,80):'Table',start:String(t.start).toUpperCase(),end:String(t.end).toUpperCase(),hasHeader:t?.hasHeader!==false,style:t?.style==='plain'?'plain':'banded'})) : [],
      pivotTables: Array.isArray(x?.pivotTables) ? x.pivotTables.slice(0,50).map((t:any)=>({id:typeof t?.id==='string'?t.id.slice(0,100):crypto.randomUUID(),name:typeof t?.name==='string'?t.name.slice(0,80):'Pivot',sourceRange:typeof t?.sourceRange==='string'?t.sourceRange.slice(0,200):'A1:B10',rowField:typeof t?.rowField==='string'?t.rowField.slice(0,80):undefined,columnField:typeof t?.columnField==='string'?t.columnField.slice(0,80):undefined,valueField:typeof t?.valueField==='string'?t.valueField.slice(0,80):undefined,aggregation:['sum','count','average'].includes(String(t?.aggregation))?String(t.aggregation):'sum'})) : [],
      frozenRows: Number.isFinite(Number(x?.frozenRows)) ? Math.max(0,Math.min(10,Number(x.frozenRows))) : 0,
      frozenColumns: Number.isFinite(Number(x?.frozenColumns)) ? Math.max(0,Math.min(10,Number(x.frozenColumns))) : 0,
      columnWidths: x?.columnWidths&&typeof x.columnWidths==='object' ? Object.fromEntries(Object.entries(x.columnWidths as Record<string,unknown>).slice(0,100).filter(([k,val])=>/^[A-Z]{1,4}$/.test(k)&&Number.isFinite(Number(val))).map(([k,val])=>[k,Math.max(60,Math.min(420,Number(val)))])) : {},
      rowHeights: x?.rowHeights&&typeof x.rowHeights==='object' ? Object.fromEntries(Object.entries(x.rowHeights as Record<string,unknown>).slice(0,1000).filter(([k,val])=>/^\d+$/.test(k)&&Number.isFinite(Number(val))).map(([k,val])=>[k,Math.max(22,Math.min(100,Number(val)))])) : {},
      filters: x?.filters&&typeof x.filters==='object' ? Object.fromEntries(Object.entries(x.filters as Record<string,unknown>).slice(0,100).filter(([k,val])=>/^[A-Z]{1,4}$/.test(k)&&typeof val==='string').map(([k,val])=>[k,String(val).slice(0,200)])) : null,
      sort: x?.sort&&typeof x.sort==='object'&&/^[A-Z]{1,4}$/.test(String(x.sort.column)) ? {column:String(x.sort.column),direction:x.sort.direction==='desc'?'desc':'asc'} : null,
      merges: Array.isArray(x?.merges) ? x.merges.slice(0,200).filter((m:any)=>/^[A-Z]{1,4}\d{1,7}$/.test(String(m?.start))&&/^[A-Z]{1,4}\d{1,7}$/.test(String(m?.end))).map((m:any)=>({start:String(m.start).toUpperCase(),end:String(m.end).toUpperCase()})) : [],
      charts: Array.isArray(x?.charts) ? x.charts.slice(0,50).map(normalizeSheetChart) : [],
    };
  }) : [];
  const safeSheets = sheets.length ? sheets : [{id:'sheet-1',name:'Sheet1',cells:{}}];
  const active = typeof v.activeSheet === 'string' && safeSheets.some((x:any)=>x.id===v.activeSheet) ? v.activeSheet : safeSheets[0].id;
  return {schema:7,type:'SHEET',title:typeof v.title==='string'?v.title.slice(0,255):'Untitled spreadsheet',activeSheet:active,sheets:safeSheets,namedRanges:Array.isArray(v.namedRanges)?v.namedRanges.slice(0,500).map((n:any)=>({name:typeof n?.name==='string'?n.name.slice(0,80):'Range',reference:typeof n?.reference==='string'?n.reference.slice(0,200):'A1',scopeSheetId:typeof n?.scopeSheetId==='string'?n.scopeSheetId.slice(0,100):undefined})):[],_ooxmlPreservation:normalizeOoxmlPreservation(v._ooxmlPreservation),_ooxmlBridge:normalizeOoxmlBridge(v._ooxmlBridge)};
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
    return { schema: 7, type, title: 'Untitled spreadsheet', activeSheet: 'sheet-1', sheets: [{ id: 'sheet-1', name: 'Sheet1', cells: {} }] };
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
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => WorkflowEngineService)) private readonly workflowEngine: WorkflowEngineService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly dlp: DlpService,
  ) {}

  async requestApproval(user: AccessTokenPayload, fileId: string, body: { workflowId: string; participantRules?: unknown; fieldValues?: Record<string, unknown>; comment?: string }) {
    const document = await this.prisma.officeDocument.findFirst({ where: { fileId, orgId: user.org_id }, select: { id: true, type: true, file: { select: { name: true, mimeType: true, fileType: true, size: true, extension: true } } } });
    if (!document) throw new NotFoundException('Office document not found');
    const result = await this.workflowEngine.startManual(user, body.workflowId, {
      fileId, resourceId: fileId, resourceType: 'FILE', eventType: 'manual', userId: user.sub, name: document.file.name, mimeType: document.file.mimeType, fileType: document.file.fileType, size: String(document.file.size), extension: document.file.extension,
      startInput: { participantRules: Array.isArray(body.participantRules) ? body.participantRules : undefined, fieldValues: body.fieldValues ?? {}, comment: typeof body.comment === 'string' ? body.comment : '' },
    });
    await this.auditOfficeEvent(user, 'OFFICE_APPROVAL_REQUESTED', fileId, { workflowId: body.workflowId, type: document.type, runId: result?.id ?? null }, 'OFFICE_DOCUMENT');
    return { ...result, fileId, officeType: document.type };
  }

  async getApprovalStatus(user: AccessTokenPayload, fileId: string) {
    const document = await this.prisma.officeDocument.findFirst({ where: { fileId, orgId: user.org_id }, select: { id: true, type: true } });
    if (!document) throw new NotFoundException('Office document not found');
    const tasks = await this.prisma.workflowTask.findMany({ where: { orgId: user.org_id }, include: { workflow: { select: { id: true, name: true } }, state: { select: { id: true, name: true } }, participants: { include: { user: { select: { id: true, name: true, email: true } } } }, run: { select: { id: true, status: true, startedAt: true, currentStateId: true, trigger: true, result: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    const relevant = tasks.filter((task) => { const trigger = task.run?.trigger; return !!trigger && typeof trigger === 'object' && !Array.isArray(trigger) && String((trigger as Record<string, unknown>).fileId ?? (trigger as Record<string, unknown>).resourceId ?? '') === fileId; });
    return { fileId, officeType: document.type, current: relevant.find((t) => t.status === 'PENDING') ?? null, history: relevant.slice(0, 50) };
  }

  private async getOfficePolicy(user: AccessTokenPayload, fileId: string) {
    const document = await this.prisma.officeDocument.findFirst({ where: { fileId, orgId: user.org_id }, select: { id: true } });
    if (!document) throw new NotFoundException('Office document not found');
    const [existingDocumentPolicy, existingOrgPolicy] = await Promise.all([
      this.prisma.officeDocumentPolicy.findUnique({ where: { documentId: document.id } }),
      this.prisma.officeSecurityPolicy.findUnique({ where: { orgId: user.org_id } }),
    ]);
    // Reads are the hot path for Office. Avoid issuing a write/upsert on every open/save/export.
    // The fallback upsert only runs for legacy documents/orgs that have no policy row yet.
    const [documentPolicy, orgPolicy] = await Promise.all([
      existingDocumentPolicy ?? this.prisma.officeDocumentPolicy.upsert({ where: { documentId: document.id }, create: { documentId: document.id }, update: {} }),
      existingOrgPolicy ?? this.prisma.officeSecurityPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} }),
    ]);
    return {
      ...documentPolicy,
      allowExport: documentPolicy.allowExport && !orgPolicy.disableExport,
      allowCopy: documentPolicy.allowCopy && !orgPolicy.disableCopy,
      allowOffline: documentPolicy.allowOffline && !orgPolicy.disableOffline,
      readOnly: documentPolicy.readOnly || orgPolicy.forceReadOnly,
      watermarkEnabled: documentPolicy.watermarkEnabled || orgPolicy.requireWatermark,
      watermarkText: documentPolicy.watermarkText || orgPolicy.watermarkText,
      organizationPolicy: { id: orgPolicy.id, forceReadOnly: orgPolicy.forceReadOnly, disableExport: orgPolicy.disableExport, disableCopy: orgPolicy.disableCopy, disableOffline: orgPolicy.disableOffline, requireWatermark: orgPolicy.requireWatermark, watermarkText: orgPolicy.watermarkText },
    };
  }

  private async getRawOfficePolicy(user: AccessTokenPayload, fileId: string) {
    const document = await this.prisma.officeDocument.findFirst({ where: { fileId, orgId: user.org_id }, select: { id: true } });
    if (!document) throw new NotFoundException('Office document not found');
    const existing = await this.prisma.officeDocumentPolicy.findUnique({ where: { documentId: document.id } });
    return existing ?? this.prisma.officeDocumentPolicy.upsert({ where: { documentId: document.id }, create: { documentId: document.id }, update: {} });
  }

  private assertOfficeAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.ADMIN && user.role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('Office administrator access required');
  }

  async getAdminCenter(user: AccessTokenPayload) {
    this.assertOfficeAdmin(user);
    const orgId = user.org_id;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      documents, activeSessions, activePresence, operations24h,
      templates, templateVariables,
      backgroundJobs, automationRuns,
      securityPolicy, auditPolicy,
      recentDocuments,
    ] = await Promise.all([
      this.prisma.officeDocument.groupBy({ by: ['type'], where: { orgId }, _count: { _all: true } }),
      this.prisma.officeSession.count({ where: { orgId, status: OfficeSessionStatus.ACTIVE } }),
      this.prisma.officePresence.count({ where: { orgId, status: 'ACTIVE' } }),
      this.prisma.officeOperation.count({ where: { orgId, createdAt: { gte: since } } }),
      this.prisma.template.count({ where: { orgId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.templateVariable.count({ where: { template: { orgId, deletedAt: null, status: 'ACTIVE' } } }),
      this.prisma.officeBackgroundJob.groupBy({ by: ['status'], where: { orgId }, _count: { _all: true } }),
      this.prisma.templateAutomationRun.groupBy({ by: ['status'], where: { template: { orgId } }, _count: { _all: true } }),
      this.prisma.officeSecurityPolicy.findUnique({ where: { orgId } }),
      this.prisma.officeAuditPolicy.findUnique({ where: { orgId } }),
      this.prisma.officeDocument.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, fileId: true, type: true, revision: true, updatedAt: true, file: { select: { name: true } } } }),
    ]);

    const byStatus = (rows: Array<{ status: string; _count: { _all: number } }>) => Object.fromEntries(rows.map(row => [row.status, row._count._all]));
    return {
      generatedAt: new Date().toISOString(),
      documents: { total: documents.reduce((sum, row) => sum + row._count._all, 0), byType: Object.fromEntries(documents.map(row => [row.type, row._count._all])) },
      collaboration: { activeSessions, activePresence, operations24h },
      templates: { active: templates, variables: templateVariables },
      backgroundJobs: byStatus(backgroundJobs),
      automationRuns: byStatus(automationRuns),
      policies: {
        security: securityPolicy ? { forceReadOnly: securityPolicy.forceReadOnly, disableExport: securityPolicy.disableExport, disableCopy: securityPolicy.disableCopy, disableOffline: securityPolicy.disableOffline, requireWatermark: securityPolicy.requireWatermark, watermarkText: securityPolicy.watermarkText } : null,
        audit: auditPolicy ? { retentionDays: auditPolicy.retentionDays, immutableChain: auditPolicy.immutableChain, exportEnabled: auditPolicy.exportEnabled } : null,
      },
      recentDocuments: recentDocuments.map(row => ({ id: row.id, fileId: row.fileId, name: row.file.name, type: row.type, revision: row.revision, updatedAt: row.updatedAt.toISOString() })),
    };
  }

  async getSecurityPolicy(user: AccessTokenPayload) {
    this.assertOfficeAdmin(user);
    const policy = await this.prisma.officeSecurityPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

  async updateSecurityPolicy(user: AccessTokenPayload, input: { forceReadOnly?: boolean; disableExport?: boolean; disableCopy?: boolean; disableOffline?: boolean; requireWatermark?: boolean; watermarkText?: string | null }) {
    this.assertOfficeAdmin(user);
    const current = await this.prisma.officeSecurityPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    const policy = await this.prisma.officeSecurityPolicy.update({ where: { id: current.id }, data: {
      ...(typeof input.forceReadOnly === 'boolean' ? { forceReadOnly: input.forceReadOnly } : {}),
      ...(typeof input.disableExport === 'boolean' ? { disableExport: input.disableExport } : {}),
      ...(typeof input.disableCopy === 'boolean' ? { disableCopy: input.disableCopy } : {}),
      ...(typeof input.disableOffline === 'boolean' ? { disableOffline: input.disableOffline } : {}),
      ...(typeof input.requireWatermark === 'boolean' ? { requireWatermark: input.requireWatermark } : {}),
      ...(input.watermarkText !== undefined ? { watermarkText: input.watermarkText ? String(input.watermarkText).slice(0, 500) : null } : {}),
      updatedById: user.sub,
    }});
    await this.auditOfficeEvent(user, 'OFFICE_SECURITY_POLICY_UPDATED', user.org_id, { resource: 'ORGANIZATION_OFFICE_SECURITY', previous: current, next: policy }, 'OFFICE_SECURITY_POLICY');
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

  async getPolicy(user: AccessTokenPayload, fileId: string) {
    await this.getAuthorizedFile(user, fileId, false);
    const policy = await this.getOfficePolicy(user, fileId);
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

  private auditCanonical(input: { orgId: string; actorId: string; action: string; resourceType: string; resourceId: string; metadata: Prisma.InputJsonValue; createdAt: string; previousHash: string | null }) {
    return JSON.stringify({ orgId: input.orgId, actorId: input.actorId, action: input.action, resourceType: input.resourceType, resourceId: input.resourceId, metadata: input.metadata, createdAt: input.createdAt, previousHash: input.previousHash });
  }

  private async auditOfficeEvent(user: AccessTokenPayload, action: string, fileId: string, metadata: Record<string, unknown> = {}, resourceType = 'OFFICE_DOCUMENT') {
    try {
      const policy = await this.prisma.officeAuditPolicy.findUnique({ where: { orgId: user.org_id }, select: { immutableChain: true } });
      const immutableChain = policy?.immutableChain !== false;
      const createdAt = new Date();
      let previousHash: string | null = null;
      if (immutableChain) {
        const previous = await this.prisma.auditLog.findFirst({ where: { orgId: user.org_id, resourceType, resourceId: fileId, integrityHash: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { integrityHash: true } });
        previousHash = previous?.integrityHash ?? null;
      }
      const fullMetadata = { office: true, fileId, ...metadata } as Prisma.InputJsonValue;
      const integrityHash = immutableChain ? createHash('sha256').update(this.auditCanonical({ orgId: user.org_id, actorId: user.sub, action, resourceType, resourceId: fileId, metadata: fullMetadata, createdAt: createdAt.toISOString(), previousHash })).digest('hex') : null;
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action, resourceType, resourceId: fileId, metadata: fullMetadata, createdAt, previousHash, integrityHash } });
    } catch { /* audit failures must never break Office editing */ }
  }

  async getAuditPolicy(user: AccessTokenPayload) {
    this.assertOfficeAdmin(user);
    const policy = await this.prisma.officeAuditPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

  async updateAuditPolicy(user: AccessTokenPayload, input: { retentionDays?: number; immutableChain?: boolean; exportEnabled?: boolean }) {
    this.assertOfficeAdmin(user);
    const current = await this.prisma.officeAuditPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    const retentionDays = Number.isFinite(Number(input.retentionDays)) ? Math.min(3650, Math.max(30, Math.floor(Number(input.retentionDays)))) : current.retentionDays;
    const policy = await this.prisma.officeAuditPolicy.update({ where: { id: current.id }, data: { retentionDays, ...(typeof input.immutableChain === 'boolean' ? { immutableChain: input.immutableChain } : {}), ...(typeof input.exportEnabled === 'boolean' ? { exportEnabled: input.exportEnabled } : {}), updatedById: user.sub } });
    await this.auditOfficeEvent(user, 'OFFICE_AUDIT_POLICY_UPDATED', user.org_id, { previous: current, next: policy }, 'OFFICE_AUDIT_POLICY');
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

  async listComplianceAudit(user: AccessTokenPayload, input: { limit?: number; action?: string; resourceType?: string; actorId?: string; since?: string; until?: string }) {
    this.assertOfficeAdmin(user);
    const policy = await this.prisma.officeAuditPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    const limit = Math.max(1, Math.min(500, Number(input.limit) || 100));
    const allowedTypes = ['OFFICE_DOCUMENT', 'TEMPLATE', 'OFFICE_AUDIT_POLICY', 'OFFICE_SECURITY_POLICY'];
    const resourceType = allowedTypes.includes(String(input.resourceType)) ? String(input.resourceType) : undefined;
    const where: Prisma.AuditLogWhereInput = { orgId: user.org_id, resourceType: resourceType ? resourceType : { in: allowedTypes } };
    if (input.action) where.action = String(input.action).slice(0, 120);
    if (input.actorId) where.actorId = String(input.actorId);
    if (input.since || input.until) where.createdAt = { ...(input.since && !Number.isNaN(Date.parse(input.since)) ? { gte: new Date(input.since) } : {}), ...(input.until && !Number.isNaN(Date.parse(input.until)) ? { lte: new Date(input.until) } : {}) };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } } });
    return { policy: { retentionDays: policy.retentionDays, immutableChain: policy.immutableChain, exportEnabled: policy.exportEnabled }, events: rows.map(row => ({ id: row.id, action: row.action, resourceType: row.resourceType, resourceId: row.resourceId, createdAt: row.createdAt.toISOString(), actor: row.actor, metadata: row.metadata, previousHash: row.previousHash, integrityHash: row.integrityHash })), count: rows.length };
  }

  async exportComplianceAudit(user: AccessTokenPayload, input: { resourceType?: string; since?: string; until?: string }) {
    this.assertOfficeAdmin(user);
    const policy = await this.prisma.officeAuditPolicy.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id }, update: {} });
    if (!policy.exportEnabled) throw new ForbiddenException('Audit export is disabled by Office compliance policy');
    const allowedTypes = ['OFFICE_DOCUMENT', 'TEMPLATE', 'OFFICE_AUDIT_POLICY', 'OFFICE_SECURITY_POLICY'];
    const resourceType = allowedTypes.includes(String(input.resourceType)) ? String(input.resourceType) : undefined;
    const where: Prisma.AuditLogWhereInput = { orgId: user.org_id, resourceType: resourceType ? resourceType : { in: allowedTypes } };
    if (input.since || input.until) where.createdAt = { ...(input.since && !Number.isNaN(Date.parse(input.since)) ? { gte: new Date(input.since) } : {}), ...(input.until && !Number.isNaN(Date.parse(input.until)) ? { lte: new Date(input.until) } : {}) };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'asc' }, take: 5000, include: { actor: { select: { id: true, name: true, email: true } } } });
    await this.auditOfficeEvent(user, 'OFFICE_AUDIT_EXPORTED', user.org_id, { count: rows.length, resourceType: resourceType ?? 'ALL' }, 'OFFICE_AUDIT_POLICY');
    return { generatedAt: new Date().toISOString(), policy: { retentionDays: policy.retentionDays, immutableChain: policy.immutableChain }, events: rows.map(row => ({ id: row.id, action: row.action, resourceType: row.resourceType, resourceId: row.resourceId, createdAt: row.createdAt.toISOString(), actor: row.actor, metadata: row.metadata, previousHash: row.previousHash, integrityHash: row.integrityHash })) };
  }

  async verifyAuditIntegrity(user: AccessTokenPayload, input: { resourceType?: string; resourceId?: string; limit?: number }) {
    this.assertOfficeAdmin(user);
    const allowedTypes = ['OFFICE_DOCUMENT', 'TEMPLATE', 'OFFICE_AUDIT_POLICY', 'OFFICE_SECURITY_POLICY'];
    const resourceType = allowedTypes.includes(String(input.resourceType)) ? String(input.resourceType) : undefined;
    const where: Prisma.AuditLogWhereInput = { orgId: user.org_id, resourceType: resourceType ? resourceType : { in: allowedTypes }, ...(input.resourceId ? { resourceId: input.resourceId } : {}) };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: [{ resourceType: 'asc' }, { resourceId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: Math.min(5000, Math.max(1, Number(input.limit) || 2000)) });
    const state = new Map<string, string | null>();
    let checked = 0; let legacy = 0; let invalid = 0;
    for (const row of rows) {
      const key = `${row.resourceType}:${row.resourceId}`;
      if (!row.integrityHash) { legacy++; continue; }
      const expectedPrevious = state.get(key) ?? null;
      const metadata = (row.metadata ?? {}) as Prisma.InputJsonValue;
      const expected = createHash('sha256').update(this.auditCanonical({ orgId: row.orgId, actorId: row.actorId ?? '', action: row.action, resourceType: row.resourceType, resourceId: row.resourceId, metadata, createdAt: row.createdAt.toISOString(), previousHash: row.previousHash ?? null })).digest('hex');
      if ((row.previousHash ?? null) !== expectedPrevious || row.integrityHash !== expected) invalid++;
      state.set(key, row.integrityHash); checked++;
    }
    return { valid: invalid === 0, checked, invalid, legacyUnhashed: legacy };
  }

  async listAuditEvents(user: AccessTokenPayload, fileId: string, input?: { limit?: number; action?: string; since?: string; until?: string }) {
    await this.getAuthorizedFile(user, fileId, false);
    const limit = Math.max(1, Math.min(100, Number(input?.limit) || 50));
    const where: Prisma.AuditLogWhereInput = { orgId: user.org_id, resourceType: 'OFFICE_DOCUMENT', resourceId: fileId };
    if (input?.action) where.action = String(input.action).slice(0, 100);
    if (input?.since || input?.until) where.createdAt = {
      ...(input?.since && !Number.isNaN(Date.parse(input.since)) ? { gte: new Date(input.since) } : {}),
      ...(input?.until && !Number.isNaN(Date.parse(input.until)) ? { lte: new Date(input.until) } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    return rows.map((row) => ({ id: row.id, action: row.action, createdAt: row.createdAt.toISOString(), actor: row.actor, metadata: row.metadata }));
  }

  async updatePolicy(user: AccessTokenPayload, fileId: string, input: { allowExport?: boolean; allowCopy?: boolean; allowOffline?: boolean; readOnly?: boolean; watermarkEnabled?: boolean; watermarkText?: string | null }) {
    this.assertOfficeAdmin(user);
    await this.getAuthorizedFile(user, fileId, true);
    const current = await this.getRawOfficePolicy(user, fileId);
    const policy = await this.prisma.officeDocumentPolicy.update({ where: { id: current.id }, data: {
      ...(typeof input.allowExport === 'boolean' ? { allowExport: input.allowExport } : {}),
      ...(typeof input.allowCopy === 'boolean' ? { allowCopy: input.allowCopy } : {}),
      ...(typeof input.allowOffline === 'boolean' ? { allowOffline: input.allowOffline } : {}),
      ...(typeof input.readOnly === 'boolean' ? { readOnly: input.readOnly } : {}),
      ...(typeof input.watermarkEnabled === 'boolean' ? { watermarkEnabled: input.watermarkEnabled } : {}),
      ...(input.watermarkText !== undefined ? { watermarkText: input.watermarkText ? String(input.watermarkText).slice(0, 500) : null } : {}),
      updatedById: user.sub,
    }});
    await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'compliance', title: 'Office policy updated', body: 'The document Office policy was updated.', resourceType: 'FILE', resourceId: fileId }).catch(() => undefined);
    await this.auditOfficeEvent(user, 'OFFICE_POLICY_UPDATED', fileId, {
      changes: Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'watermarkText' || input.watermarkText !== undefined)),
      previous: { allowExport: current.allowExport, allowCopy: current.allowCopy, allowOffline: current.allowOffline, readOnly: current.readOnly, watermarkEnabled: current.watermarkEnabled, watermarkText: current.watermarkText },
      next: { allowExport: policy.allowExport, allowCopy: policy.allowCopy, allowOffline: policy.allowOffline, readOnly: policy.readOnly, watermarkEnabled: policy.watermarkEnabled, watermarkText: policy.watermarkText },
    });
    return { ...policy, createdAt: policy.createdAt.toISOString(), updatedAt: policy.updatedAt.toISOString() };
  }

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
    await this.prisma.officeDocumentVersion.create({ data: { orgId: user.org_id, documentId: document.id, fileId: file.file_id, versionNumber: 1, revision: document.revision, type: document.type, content: content as Prisma.InputJsonValue, contentHash: computeOfficeContentHash(content), label: `Imported ${result.sourceFormat.toUpperCase()}`, createdById: user.sub } });
    return { ...this.toState(document), importedFrom: result.sourceFormat };
  }

  /** Exports the current native Office state for a Template publish operation.
   * This is intentionally separate from user-facing export policy: publishing
   * an edited template is an internal template lifecycle operation, not a
   * WorkDrive file export. The caller must still prove template ownership and
   * source-template linkage before persisting the snapshot.
   */
  async exportCurrentForTemplate(user: AccessTokenPayload, fileId: string) {
    const policy = await this.getOfficePolicy(user, fileId);
    if (policy.readOnly) throw new ForbiddenException('Office document is read-only by policy');
    const document = await this.open(user, fileId);
    const format = document.type === 'WRITER' ? 'docx' : document.type === 'SHEET' ? 'xlsx' : 'pptx';
    const result = await this.conversion.export(document.type as OfficeType, document.content, format);
    return {
      ...result,
      format,
      revision: document.revision,
      sourceTemplateId: document.sourceTemplateId ?? null,
      sourceTemplateVersionId: document.sourceTemplateVersionId ?? null,
      documentId: document.id,
    };
  }

  async exportFile(user: AccessTokenPayload, fileId: string, format: 'docx'|'xlsx'|'pptx') {
    const policy = await this.getOfficePolicy(user, fileId);
    if (!policy.allowExport) throw new ForbiddenException('Export is disabled by Office policy');
    await this.dlp.assertAllowed(user, fileId, 'DOWNLOAD');
    const document = await this.open(user, fileId);
    const result = await this.conversion.export(document.type as OfficeType, document.content, format);
    await this.auditOfficeEvent(user, 'OFFICE_EXPORT', fileId, { format, filename: result.filename, bytes: result.buffer.byteLength });
    await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'exports', title: 'Office export completed', body: `${result.filename} was exported as ${format.toUpperCase()}.`, resourceType: 'FILE', resourceId: fileId }).catch(() => undefined);
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
    await this.prisma.officeDocumentVersion.create({ data: { orgId: user.org_id, documentId: document.id, fileId, versionNumber: 1, revision: document.revision, type: document.type, content: content as Prisma.InputJsonValue, contentHash: computeOfficeContentHash(content), label: 'Template initialization', createdById: user.sub } });
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

  async getWorkDriveContext(user: AccessTokenPayload, fileId: string) {
    const file = await this.getAuthorizedFile(user, fileId, false);
    const [full, shares, canWrite] = await Promise.all([
      this.prisma.file.findFirst({
      where: { id: fileId, orgId: user.org_id, deletedAt: null, status: FileStatus.ACTIVE },
      include: {
        folder: { select: { id: true, name: true, parentId: true, teamFolderId: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 20,
          include: { uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        },
        officeDocument: { select: { revision: true, updatedAt: true, nativeFormat: true, type: true } },
      },
      }),
      this.prisma.fileShare.count({
        where: { fileId, orgId: user.org_id, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }),
      this.canWriteFile(user, fileId),
    ]);
    if (!full) throw new NotFoundException('File not found');
    const currentVersion = full.versions[0] ?? null;
    return {
      file: { id: file.id, name: file.name, originalName: file.originalName, extension: file.extension, mimeType: file.mimeType, size: Number(file.size), updatedAt: file.updatedAt.toISOString(), ownerId: file.ownerId },
      location: full.folder ? { id: full.folder.id, name: full.folder.name, parentId: full.folder.parentId, teamFolderId: full.folder.teamFolderId } : null,
      permissions: { canRead: true, canWrite },
      sharing: { activeShareCount: shares },
      office: full.officeDocument ? { type: full.officeDocument.type, nativeFormat: full.officeDocument.nativeFormat, revision: full.officeDocument.revision, updatedAt: full.officeDocument.updatedAt.toISOString() } : null,
      currentVersion: currentVersion ? { id: currentVersion.id, versionNumber: currentVersion.versionNumber, status: currentVersion.status, size: Number(currentVersion.size), mimeType: currentVersion.mimeType, sha256Hash: currentVersion.sha256Hash, createdAt: currentVersion.createdAt.toISOString(), uploadedBy: currentVersion.uploadedBy } : null,
      versions: full.versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, status: v.status, size: Number(v.size), mimeType: v.mimeType, sha256Hash: v.sha256Hash, createdAt: v.createdAt.toISOString(), uploadedBy: v.uploadedBy })),
    };
  }

  private async canWriteFile(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null, status: FileStatus.ACTIVE }, include: { folder: { select: { teamFolderId: true } } } });
    if (!file) return false;
    const resource = { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null };
    return this.permissions.canWrite(user, resource);
  }

  async open(user: AccessTokenPayload, fileId: string): Promise<OfficeDocumentState> {
    const file = await this.getAuthorizedFile(user, fileId);
    let document = await this.prisma.officeDocument.findUnique({ where: { fileId } });

    // Files created/imported before Office initialization (and template working
    // copies whose initialization was interrupted) must still be openable from
    // the normal Files/Actions -> Edit Content flow. Bootstrap the native model
    // from the current Office-compatible WorkDrive bytes instead of returning a
    // generic "could not open" error.
    if (!document) {
      const extension = (file.extension ?? '').replace(/^\./, '').toLowerCase();
      if (!['docx', 'xlsx', 'pptx'].includes(extension)) {
        throw new NotFoundException('This file is not an IMKAN Office document yet');
      }
      const version = await this.prisma.fileVersion.findFirst({
        where: { fileId, orgId: user.org_id, status: 'ACTIVE' },
        orderBy: { versionNumber: 'desc' },
        include: { storageObject: true },
      });
      if (!version?.storageObject?.storageKey) {
        throw new NotFoundException('No active Office file version is available');
      }
      const bytes = await this.storage.readStoredObject(version.storageObject.storageKey);
      const imported = await this.conversion.import(bytes, file.name);
      const content = this.normalizeOfficeContent(imported.content);
      document = await this.prisma.officeDocument.create({
        data: {
          orgId: user.org_id,
          fileId,
          type: imported.type as OfficeDocumentType,
          nativeFormat: TYPE_TO_FORMAT[imported.type],
          content: content as Prisma.InputJsonValue,
        },
      });
      await this.prisma.officeDocumentVersion.create({
        data: {
          orgId: user.org_id,
          documentId: document.id,
          fileId,
          versionNumber: 1,
          revision: document.revision,
          type: document.type,
          content: content as Prisma.InputJsonValue,
          contentHash: computeOfficeContentHash(content),
          label: `Initialized from ${extension.toUpperCase()}`,
          createdById: user.sub,
        },
      });
      await this.auditOfficeEvent(user, 'OFFICE_DOCUMENT_INITIALIZED_FROM_FILE', fileId, {
        documentId: document.id,
        sourceFileVersionId: version.id,
        sourceFormat: extension,
      });
    }
    const policy = await this.getOfficePolicy(user, fileId);
    await this.auditOfficeEvent(user, 'OFFICE_OPENED', fileId, { documentId: document.id, type: document.type, revision: document.revision });
    return { ...this.toState(document), policy: { allowExport: policy.allowExport, allowCopy: policy.allowCopy, allowOffline: policy.allowOffline, readOnly: policy.readOnly, watermarkEnabled: policy.watermarkEnabled, watermarkText: policy.watermarkText } } as any;
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
    await this.prisma.officeDocumentVersion.create({
      data: { orgId: user.org_id, documentId: document.id, fileId: file.file_id, versionNumber: 1, revision: document.revision, type: document.type, content: content as Prisma.InputJsonValue, contentHash: computeOfficeContentHash(content), label: 'Initial version', createdById: user.sub },
    });
    return this.toState(document);
  }

  /**
   * Materializes the native IMKAN Office snapshot as a real WorkDrive FileVersion.
   * The OfficeDocument/OfficeDocumentVersion records remain the semantic editor
   * history, while FileVersion becomes the authoritative WorkDrive byte history.
   */
  private async materializeNativeFileVersion(user: AccessTokenPayload, fileId: string, type: OfficeDocumentType, content: unknown) {
    const bytes = Buffer.from(JSON.stringify(content), 'utf8');
    const contentHash = computeOfficeContentHash(content);
    const versionId = randomUUID();
    const storageKey = this.storage.buildObjectKey(fileId, versionId);
    const existing = await this.prisma.storageObject.findFirst({
      where: { orgId: user.org_id, fileId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { bucket: true, region: true },
    });
    if (!existing) throw new NotFoundException('WorkDrive storage object not found for Office file');
    await this.storage.storeObject({
      fileId,
      versionId,
      ownerOrgId: user.org_id,
      storageKey,
      contentType: MIME_BY_TYPE[this.normalizeType(type as unknown as OfficeType)],
    }, bytes);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.fileVersion.findFirst({ where: { orgId: user.org_id, fileId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;
        const storageObjectId = randomUUID();
        await tx.storageObject.create({ data: { id: storageObjectId, orgId: user.org_id, fileId, storageKey, bucket: existing.bucket, region: existing.region, size: bytes.length, checksum: contentHash } });
        const fileVersion = await tx.fileVersion.create({ data: { id: versionId, orgId: user.org_id, fileId, versionNumber, storageObjectId, size: bytes.length, mimeType: MIME_BY_TYPE[this.normalizeType(type as unknown as OfficeType)], extension: 'imkan', sha256Hash: contentHash, uploadedById: user.sub, status: 'ACTIVE', uploadStatus: 'COMPLETE' } });
        await tx.file.update({ where: { id: fileId }, data: { size: bytes.length, sha256Hash: contentHash, storageKey, storageObjectId, mimeType: MIME_BY_TYPE[this.normalizeType(type as unknown as OfficeType)], extension: 'imkan' } });
        return fileVersion;
      });
    } catch (error) {
      await this.storage.deleteStoredObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async save(user: AccessTokenPayload, fileId: string, content: unknown, expectedRevision?: number, sessionId?: string): Promise<OfficeDocumentState> {
    await this.getAuthorizedFile(user, fileId, true);
    const policy = await this.getOfficePolicy(user, fileId);
    if (policy.readOnly) throw new ForbiddenException('Office document is read-only by policy');
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
    const contentHash = computeOfficeContentHash(content);
    const txResult = await this.prisma.$transaction(async (tx) => {
      const next = await tx.officeDocument.update({
        where: { fileId },
        data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
      const previous = await tx.officeDocumentVersion.findFirst({ where: { documentId: existing.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      if (!previous) {
        await tx.officeDocumentVersion.create({ data: { orgId: user.org_id, documentId: existing.id, fileId, versionNumber: 1, revision: existing.revision, type: existing.type, content: existing.content as Prisma.InputJsonValue, contentHash: computeOfficeContentHash(existing.content), label: 'Imported legacy baseline', createdById: user.sub } });
      }
      const versionNumber = (previous?.versionNumber ?? 1) + 1;
      const version = await tx.officeDocumentVersion.create({ data: { orgId: user.org_id, documentId: existing.id, fileId, versionNumber, revision: next.revision, type: next.type, content: content as Prisma.InputJsonValue, contentHash, label: `Revision ${next.revision}`, createdById: user.sub } });
      const operation = await tx.officeOperation.create({
        data: { orgId: user.org_id, fileId, documentId: existing.id, sessionId: sessionId || undefined, userId: user.sub, kind: 'document-save', baseRevision, revision: next.revision, payload: { revision: next.revision, versionId: version.id, versionNumber, contentHash, type: existing.type, savedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      });
      return { next, operation, version };
    });
    const next = txResult.next;
    const operation = txResult.operation;
    const nativeFileVersion = await this.materializeNativeFileVersion(user, fileId, existing.type, content);
    await this.prisma.officeOperation.update({ where: { id: operation.id }, data: { payload: { ...(operation.payload as any), nativeFileVersionId: nativeFileVersion.id, workDriveVersionNumber: nativeFileVersion.versionNumber } as Prisma.InputJsonValue } });
    publishOfficeRealtimeEvent({ fileId, type: 'document-saved', revision: next.revision, operationId: operation.id, userId: user.sub, sessionId });
    await this.auditOfficeEvent(user, 'OFFICE_SAVED', fileId, { revision: next.revision, baseRevision, sessionId: sessionId || null, operationId: operation.id, mode: 'document-save' });
    return this.toState(next);
  }

  async listVersions(user: AccessTokenPayload, fileId: string) {
    await this.getAuthorizedFile(user, fileId, false);
    const [officeVersions, workDriveVersions] = await Promise.all([
      this.prisma.officeDocumentVersion.findMany({
        where: { orgId: user.org_id, fileId },
        orderBy: { versionNumber: 'desc' },
        take: 100,
        select: { id: true, versionNumber: true, revision: true, type: true, contentHash: true, label: true, createdAt: true, createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.fileVersion.findMany({
        where: { orgId: user.org_id, fileId, status: 'ACTIVE' },
        orderBy: { versionNumber: 'desc' },
        take: 100,
        select: { id: true, versionNumber: true, size: true, mimeType: true, extension: true, sha256Hash: true, createdAt: true, uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
    ]);
    const byHash = new Map(workDriveVersions.map(v => [v.sha256Hash, v]));
    return officeVersions.map(v => {
      const native = byHash.get(v.contentHash);
      return {
        ...v,
        workDriveVersionId: native?.id ?? null,
        workDriveVersionNumber: native?.versionNumber ?? null,
        workDriveSize: native ? Number(native.size) : null,
        workDriveCreatedAt: native?.createdAt?.toISOString() ?? null,
      };
    });
  }

  async restoreVersion(user: AccessTokenPayload, fileId: string, versionId: string, expectedRevision?: number) {
    await this.getAuthorizedFile(user, fileId, true);
    const policy = await this.getOfficePolicy(user, fileId);
    if (policy.readOnly) throw new ForbiddenException('Office document is read-only by policy');
    const existing = await this.prisma.officeDocument.findUnique({ where: { fileId } });
    if (!existing) throw new NotFoundException('Office document not found');
    if (expectedRevision !== undefined && expectedRevision !== existing.revision) throw new ConflictException({ message: 'The document changed while you were editing it', code: 'OFFICE_REVISION_CONFLICT', revision: existing.revision });
    const source = await this.prisma.officeDocumentVersion.findFirst({ where: { id: versionId, orgId: user.org_id, fileId, documentId: existing.id } });
    if (!source) throw new NotFoundException('Office version not found');
    const content = this.normalizeOfficeContent(source.content);
    const contentHash = computeOfficeContentHash(content);
    const result = await this.prisma.$transaction(async (tx) => {
      const next = await tx.officeDocument.update({ where: { fileId }, data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } } });
      const latest = await tx.officeDocumentVersion.findFirst({ where: { documentId: existing.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      const version = await tx.officeDocumentVersion.create({ data: { orgId: user.org_id, documentId: existing.id, fileId, versionNumber: (latest?.versionNumber ?? existing.revision) + 1, revision: next.revision, type: next.type, content: content as Prisma.InputJsonValue, contentHash, label: `Restored from v${source.versionNumber}`, createdById: user.sub } });
      const operation = await tx.officeOperation.create({ data: { orgId: user.org_id, fileId, documentId: existing.id, userId: user.sub, kind: 'version-restore', baseRevision: existing.revision, revision: next.revision, payload: { sourceVersionId: source.id, sourceVersionNumber: source.versionNumber, versionId: version.id, contentHash } as Prisma.InputJsonValue } });
      return { next, version, operation };
    });
    const nativeFileVersion = await this.materializeNativeFileVersion(user, fileId, existing.type, content);
    await this.prisma.officeOperation.update({ where: { id: result.operation.id }, data: { payload: { ...(result.operation.payload as any), nativeFileVersionId: nativeFileVersion.id, workDriveVersionNumber: nativeFileVersion.versionNumber } as Prisma.InputJsonValue } });
    await this.auditOfficeEvent(user, 'OFFICE_VERSION_RESTORED', fileId, { sourceVersionId: source.id, sourceVersionNumber: source.versionNumber, revision: result.next.revision, versionId: result.version.id, nativeFileVersionId: nativeFileVersion.id, workDriveVersionNumber: nativeFileVersion.versionNumber });
    publishOfficeRealtimeEvent({ fileId, type: 'document-saved', revision: result.next.revision, operationId: result.operation.id, userId: user.sub });
    return this.toState(result.next);
  }

  async openSession(user: AccessTokenPayload, fileId: string) {
    const document = await this.open(user, fileId);
    const session = await this.prisma.officeSession.create({
      data: { orgId: user.org_id, fileId, documentId: document.id, userId: user.sub, type: document.type as OfficeDocumentType },
    });
    await this.auditOfficeEvent(user, 'OFFICE_SESSION_OPENED', fileId, { sessionId: session.id, documentId: document.id, type: document.type });
    return { sessionId: session.id, document };
  }

  async closeSession(user: AccessTokenPayload, sessionId: string) {
    const session = await this.prisma.officeSession.findFirst({ where: { id: sessionId, orgId: user.org_id, userId: user.sub, status: OfficeSessionStatus.ACTIVE } });
    if (!session) throw new NotFoundException('Office session not found');
    await this.prisma.officeSession.update({ where: { id: session.id }, data: { status: OfficeSessionStatus.CLOSED, closedAt: new Date() } });
    await this.prisma.officePresence.updateMany({ where: { sessionId: session.id }, data: { status: 'IDLE', lastSeenAt: new Date() } });
    publishOfficeRealtimeEvent({ fileId: session.fileId, type: 'presence-changed', userId: user.sub, sessionId: session.id, status: 'IDLE' });
    await this.auditOfficeEvent(user, 'OFFICE_SESSION_CLOSED', session.fileId, { sessionId: session.id });
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

  async applyWriterOperation(user: AccessTokenPayload, fileId: string, input: { opId: string; baseRevision: number; patches: Array<{ op: 'set' | 'delete'; path: string; value?: unknown }>; sessionId?: string }) {
    await this.getAuthorizedFile(user, fileId, true);
    const existing = await this.prisma.officeDocument.findUnique({ where: { fileId } });
    if (!existing || existing.type !== OfficeDocumentType.WRITER) throw new NotFoundException('Writer document not found');
    return this.applyOfficeOperation(user, fileId, input, 'WRITER');
  }

  async applyOfficeOperation(user: AccessTokenPayload, fileId: string, input: { opId: string; baseRevision: number; patches: Array<{ op: 'set' | 'delete'; path: string; value?: unknown }>; sessionId?: string; clientId?: string; sequence?: number }, expectedType?: OfficeDocumentType | 'WRITER' | 'SHEET' | 'SHOW') {
    await this.getAuthorizedFile(user, fileId, true);
    const policy = await this.getOfficePolicy(user, fileId);
    if (policy.readOnly) throw new ForbiddenException('Office document is read-only by policy');
    if (!input?.opId || !Array.isArray(input.patches) || input.patches.length > 200) throw new ConflictException({ message: 'Invalid Office operation', code: 'OFFICE_OPERATION_INVALID' });
    if (input.sessionId) {
      const session = await this.prisma.officeSession.findFirst({ where: { id: input.sessionId, orgId: user.org_id, userId: user.sub, fileId, status: OfficeSessionStatus.ACTIVE } });
      if (!session) throw new ForbiddenException('Invalid Office session');
    }
    const recentOperations = await this.prisma.officeOperation.findMany({ where: { orgId: user.org_id, fileId }, orderBy: { revision: 'desc' }, take: 200 });
    const previousOperation = recentOperations.find((operation) => { const payload = operation.payload && typeof operation.payload === 'object' && !Array.isArray(operation.payload) ? operation.payload as Record<string, unknown> : {}; return String(payload.opId ?? '') === input.opId; });
    if (previousOperation) return { document: await this.open(user, fileId), operationId: previousOperation.id, opId: input.opId, revision: previousOperation.revision, acknowledged: true };

    // Phase 45 operation-engine identity/order guard. sequence is monotonic per client/session.
    if (input.clientId && typeof input.sequence === 'number' && Number.isInteger(input.sequence) && input.sequence >= 0) {
      const clientOperations = await this.prisma.officeOperation.findMany({ where: { orgId: user.org_id, fileId, sessionId: input.sessionId || undefined }, orderBy: { revision: 'desc' }, take: 200 });
      const latest = clientOperations.find((operation) => { const payload = operation.payload && typeof operation.payload === 'object' && !Array.isArray(operation.payload) ? operation.payload as Record<string, unknown> : {}; return String(payload.clientId ?? '') === input.clientId; });
      const latestSequence = Number((latest?.payload as any)?.sequence);
      if (latest && Number.isInteger(latestSequence) && typeof input.sequence === 'number' && input.sequence <= latestSequence) {
        throw new ConflictException({ message: 'Out-of-order Office operation', code: 'OFFICE_OPERATION_OUT_OF_ORDER', revision: latest.revision, sequence: latestSequence });
      }
    }

    const baseRevision = Number(input.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new ConflictException({ message: 'Invalid Office operation revision', code: 'OFFICE_OPERATION_REVISION' });
    const allowedPrefixFor = (type: OfficeDocumentType) => type === OfficeDocumentType.WRITER ? ['/','/blocksById/','/blockOrder'] : type === OfficeDocumentType.SHEET ? ['/sheetsById/','/sheetOrder','/activeSheet','/title'] : ['/slidesById/','/slideOrder','/activeSlide','/theme','/title'];
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const existing = await this.prisma.officeDocument.findUnique({ where: { fileId } });
      if (!existing) throw new NotFoundException('Office document not found');
      if (expectedType && String(existing.type) !== String(expectedType)) throw new NotFoundException(`${String(expectedType).toLowerCase()} document not found`);
      if (baseRevision > existing.revision) throw new ConflictException({ message: 'Invalid Office operation revision', code: 'OFFICE_OPERATION_REVISION', revision: existing.revision });
      const allowedPrefix = allowedPrefixFor(existing.type);
      const safePatches = input.patches.filter(p => p && (p.op === 'set' || p.op === 'delete') && typeof p.path === 'string' && p.path.length <= 800 && allowedPrefix.some(prefix => p.path === prefix || p.path.startsWith(prefix))).slice(0, 200);
      if (!safePatches.length) throw new ConflictException({ message: 'Empty Office operation', code: 'OFFICE_OPERATION_EMPTY' });

      // Transform/merge: path-disjoint edits commute, while overlapping edits require explicit conflict resolution.
      let transformedPatches = safePatches;
      if (baseRevision < existing.revision) {
        const concurrent = await this.prisma.officeOperation.findMany({ where: { orgId: user.org_id, fileId, revision: { gt: baseRevision } }, orderBy: { revision: 'asc' }, take: 200 });
        const touched = safePatches.map(p => p.path);
        for (const operation of concurrent) {
          const paths = Array.isArray((operation.payload as any)?.patches) ? (operation.payload as any).patches.map((p: any) => String(p?.path || '')) : [];
          if (paths.some((path: string) => touched.some(current => this.officePatchPathsOverlap(path, current)))) {
            throw new ConflictException({ message: 'Office operation overlaps a newer edit', code: 'OFFICE_OPERATION_CONFLICT', revision: existing.revision, opId: input.opId, requiresRebase: true });
          }
        }
      }
      const nextContent = this.applyOfficeOperationPatches(existing.content as any, transformedPatches);
      const normalized = this.normalizeOfficeContent(nextContent);
      this.assertContentSize(normalized);
      const committed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.officeDocument.updateMany({ where: { fileId, revision: existing.revision }, data: { content: normalized as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (!updated.count) return null;
        const next = await tx.officeDocument.findUnique({ where: { fileId } });
        if (!next) return null;
        const previousVersion = await tx.officeDocumentVersion.findFirst({
          where: { documentId: existing.id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const contentHash = computeOfficeContentHash(normalized);
        const versionNumber = (previousVersion?.versionNumber ?? existing.revision) + 1;
        const version = await tx.officeDocumentVersion.create({
          data: {
            orgId: user.org_id,
            documentId: existing.id,
            fileId,
            versionNumber,
            revision: next.revision,
            type: next.type,
            content: normalized as Prisma.InputJsonValue,
            contentHash,
            label: `Operation revision ${next.revision}`,
            createdById: user.sub,
          },
        });
        const operation = await tx.officeOperation.create({ data: {
          orgId: user.org_id, fileId, documentId: existing.id, sessionId: input.sessionId || undefined, userId: user.sub,
          kind: `${String(existing.type).toLowerCase()}-operation`, baseRevision: existing.revision, revision: next.revision,
          payload: { opId: input.opId, patches: transformedPatches, revision: next.revision, versionId: version.id, versionNumber, contentHash, type: existing.type, clientId: input.clientId || null, sequence: Number.isInteger(input.sequence) ? input.sequence : null, transformedFromRevision: baseRevision, ordering: 'revision', engine: 'path-ot-v1' } as Prisma.InputJsonValue,
        }});
        return { next, operation, version };
      });
      if (!committed) continue; // another operation won the revision; retry against the new head.
      publishOfficeRealtimeEvent({ fileId, type: 'document-saved', revision: committed.next.revision, operationId: committed.operation.id, userId: user.sub, sessionId: input.sessionId });
      await this.auditOfficeEvent(user, 'OFFICE_OPERATION_APPLIED', fileId, { operationId: committed.operation.id, opId: input.opId, revision: committed.next.revision, versionId: committed.version.id, versionNumber: committed.version.versionNumber, contentHash: committed.version.contentHash, baseRevision, patchCount: transformedPatches.length, transformed: baseRevision < existing.revision, sessionId: input.sessionId || null, clientId: input.clientId || null, sequence: Number.isInteger(input.sequence) ? input.sequence : null });
      return { document: this.toState(committed.next), operationId: committed.operation.id, opId: input.opId, revision: committed.next.revision, acknowledged: true, transformed: baseRevision < existing.revision, transformedFromRevision: baseRevision };
    }
    throw new ConflictException({ message: 'Office operation could not be ordered safely; retry against latest revision', code: 'OFFICE_OPERATION_RETRY', revision: (await this.prisma.officeDocument.findUnique({ where: { fileId } }))?.revision });
  }

  private officePatchPathsOverlap(a: string, b: string) {
    if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return true;
    if ((a.startsWith('/blocksById/') && b === '/blockOrder') || (b.startsWith('/blocksById/') && a === '/blockOrder')) return true;
    if ((a.startsWith('/sheetsById/') && b === '/sheetOrder') || (b.startsWith('/sheetsById/') && a === '/sheetOrder')) return true;
    if ((a.startsWith('/slidesById/') && b === '/slideOrder') || (b.startsWith('/slidesById/') && a === '/slideOrder')) return true;
    return false;
  }

  private applyOfficeOperationPatches(source: any, patches: Array<{ op: 'set' | 'delete'; path: string; value?: unknown }>) {
    const out = JSON.parse(JSON.stringify(source ?? {}));
    for (const patch of patches) {
      const parts = patch.path.split('/').slice(1).map(x => decodeURIComponent(x));
      if (!parts.length) continue;
      if (parts[0] === 'blocksById' && Array.isArray(out.blocks)) { const i=out.blocks.findIndex((b:any)=>String(b?.id)===parts[1]); if (i>=0 && patch.op==='delete') out.blocks.splice(i,1); else if(i>=0 && patch.op==='set') out.blocks[i]=patch.value; else if(i<0 && patch.op==='set') out.blocks.push(patch.value); continue; }
      if (parts[0] === 'sheetsById' && Array.isArray(out.sheets)) { const i=out.sheets.findIndex((x:any)=>String(x?.id)===parts[1]); if(i>=0 && parts.length===2 && patch.op==='set') out.sheets[i]=patch.value; else if(i>=0 && parts[2]==='cells') { out.sheets[i].cells ||= {}; const key=parts.slice(3).join('/'); if(patch.op==='delete') delete out.sheets[i].cells[key]; else out.sheets[i].cells[key]=patch.value; } continue; }
      if (parts[0] === 'slidesById' && Array.isArray(out.slides)) { const i=out.slides.findIndex((x:any)=>String(x?.id)===parts[1]); if(i>=0 && parts.length===2 && patch.op==='set') out.slides[i]=patch.value; else if(i>=0 && parts[2]==='elements') { const j=out.slides[i].elements.findIndex((x:any)=>String(x?.id)===parts[3]); if(j>=0 && patch.op==='set') out.slides[i].elements[j]=patch.value; else if(j>=0 && patch.op==='delete') out.slides[i].elements.splice(j,1); } continue; }
      let target=out; for(let i=0;i<parts.length-1;i++){ const k=parts[i]; if(target[k]===undefined) target[k]={}; target=target[k]; } const key=parts[parts.length-1]; if(patch.op==='delete') delete target[key]; else target[key]=patch.value;
    }
    return out;
  }

  private writerPatchPathsOverlap(a: string, b: string) {
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || (a.startsWith('/blocksById/') && b === '/blockOrder') || (b.startsWith('/blocksById/') && a === '/blockOrder');
  }

  private applyWriterOperationPatches(source: any, patches: Array<{ op: 'set' | 'delete'; path: string; value?: unknown }>) {
    const next = JSON.parse(JSON.stringify(source || {}));
    for (const patch of patches) {
      const blockMatch = patch.path.match(/^\/blocksById\/([^/]+)$/);
      if (blockMatch) {
        const id = decodeURIComponent(blockMatch[1]);
        const blocks = Array.isArray(next.blocks) ? next.blocks : [];
        const index = blocks.findIndex((block: any) => block?.id === id);
        if (patch.op === 'delete') { if (index >= 0) blocks.splice(index, 1); }
        else if (index >= 0) blocks[index] = patch.value;
        else blocks.push(patch.value);
        next.blocks = blocks;
        continue;
      }
      if (patch.path === '/blockOrder' && patch.op === 'set' && Array.isArray(patch.value)) {
        const byId = new Map((next.blocks || []).map((block: any) => [block?.id, block]));
        next.blocks = (patch.value as string[]).map(id => byId.get(id)).filter(Boolean);
        continue;
      }
      const key = patch.path.replace(/^\//, '');
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(key)) throw new ConflictException({ message: 'Unsupported writer operation path', code: 'WRITER_OPERATION_PATH' });
      if (patch.op === 'delete') delete next[key]; else next[key] = patch.value;
    }
    return next;
  }

  async listOperations(user: AccessTokenPayload, fileId: string, sinceRevision?: number, limit?: number) {
    await this.getAuthorizedFile(user, fileId, false);
    const take = Math.max(1, Math.min(200, Number(limit) || 100));
    const ops = await this.prisma.officeOperation.findMany({
      where: { orgId: user.org_id, fileId, ...(Number.isFinite(Number(sinceRevision)) ? { revision: { gt: Number(sinceRevision) } } : {}) },
      select: { id: true, fileId: true, documentId: true, sessionId: true, userId: true, kind: true, baseRevision: true, revision: true, payload: true, createdAt: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { revision: 'asc' },
      take,
    });
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
          poster: typeof e?.poster === 'string' && /^(https?:\/\/|data:image\/|blob:)/i.test(e.poster) ? e.poster.slice(0, 4000) : undefined,
          shape: ['rect','circle','roundRect'].includes(String(e?.shape)) ? String(e.shape) : undefined,
          fill, color, fontSize: clampNumber(e?.fontSize, 8, 120, 20), fontFamily,
          bold: Boolean(e?.bold), italic: Boolean(e?.italic), underline: Boolean(e?.underline), strike: Boolean(e?.strike),
          lineHeight: clampNumber(e?.lineHeight, 0.8, 3, 1.2),
          bullet: ['none','bullet','number'].includes(String(e?.bullet)) ? String(e.bullet) : 'none',
          align: ['start','center','end'].includes(String(e?.align)) ? String(e.align) : 'start',
          border: Boolean(e?.border), rows, mediaAutoplay: Boolean(e?.mediaAutoplay), mediaLoop: Boolean(e?.mediaLoop), mediaMuted: Boolean(e?.mediaMuted), mediaVolume: clampNumber(e?.mediaVolume, 0, 1, e?.type === 'video' ? 1 : 1), mediaTrimStart: clampNumber(e?.mediaTrimStart, 0, 86400, 0), mediaTrimEnd: clampNumber(e?.mediaTrimEnd, 0, 86400, 0), animation: e?.animation && typeof e.animation === 'object' ? { type: ['fade','zoom','slide-in','float','pulse','spin'].includes(String(e.animation.type)) ? String(e.animation.type) : 'fade', duration: clampNumber(e.animation.duration, 50, 10000, 500), delay: clampNumber(e.animation.delay, 0, 60000, 0), direction: ['left','right','up','down'].includes(String(e.animation.direction)) ? String(e.animation.direction) : undefined, phase: ['entrance','emphasis','exit'].includes(String(e.animation.phase)) ? String(e.animation.phase) : 'entrance', order: clampNumber(e.animation.order,1,100,1), trigger: ['with-previous','after-previous','on-click'].includes(String(e.animation.trigger)) ? String(e.animation.trigger) : 'on-click' } : undefined, animations: Array.isArray(e?.animations) ? e.animations.slice(0,20).map((a:any,i:number)=>({ type:['fade','zoom','slide-in','float','pulse','spin'].includes(String(a?.type)) ? String(a.type) : 'fade', duration:clampNumber(a?.duration,50,10000,500), delay:clampNumber(a?.delay,0,60000,0), direction:['left','right','up','down'].includes(String(a?.direction))?String(a.direction):undefined, phase:['entrance','emphasis','exit'].includes(String(a?.phase))?String(a.phase):'entrance', order:clampNumber(a?.order,1,100,i+1), trigger:['with-previous','after-previous','on-click'].includes(String(a?.trigger))?String(a.trigger):'on-click' })) : undefined, groupId: typeof e?.groupId === 'string' ? e.groupId.slice(0,100) : undefined,
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
    const masters=Array.isArray(value.masters)?value.masters.slice(0,50).map((m:any,i:number)=>({id:typeof m?.id==='string'&&m.id?m.id:`master-${i+1}`,name:typeof m?.name==='string'&&m.name?m.name:`Master ${i+1}`,background:typeof m?.background==='string'?m.background:'#ffffff',elements:Array.isArray(m?.elements)?m.elements.slice(0,200):[]})):[];
    const sections=Array.isArray(value.sections)?value.sections.slice(0,100).map((s:any,i:number)=>({id:typeof s?.id==='string'&&s.id?s.id:`section-${i+1}`,name:typeof s?.name==='string'&&s.name?s.name:`Section ${i+1}`,collapsed:Boolean(s?.collapsed)})):[];
    const comments=Array.isArray(value.comments)?value.comments.slice(0,500).map((c:any,i:number)=>({id:typeof c?.id==='string'&&c.id?c.id:`comment-${i+1}`,slideId:typeof c?.slideId==='string'?c.slideId:activeSlide,elementId:typeof c?.elementId==='string'?c.elementId:undefined,authorId:typeof c?.authorId==='string'?c.authorId:undefined,text:typeof c?.text==='string'?c.text.slice(0,5000):'',createdAt:typeof c?.createdAt==='string'?c.createdAt:new Date().toISOString(),resolved:Boolean(c?.resolved),replies:Array.isArray(c?.replies)?c.replies.slice(0,50):[]})):[];
    return { schema: 6, type, title: typeof value.title === 'string' ? value.title.slice(0,255) : 'Untitled presentation', _ooxmlPreservation: normalizeOoxmlPreservation(value._ooxmlPreservation), _ooxmlBridge: normalizeOoxmlBridge(value._ooxmlBridge), aspectRatio: value.aspectRatio === '4:3' ? '4:3' : '16:9', activeSlide, theme: { fontFamily: typeof (value.theme as any)?.fontFamily === 'string' ? String((value.theme as any).fontFamily).slice(0,80) : 'Arial', headingFont: typeof (value.theme as any)?.headingFont === 'string' ? String((value.theme as any).headingFont).slice(0,80) : 'Arial', secondary: typeof (value.theme as any)?.secondary === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).secondary) ? (value.theme as any).secondary : '#64748b', background: typeof (value.theme as any)?.background === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).background) ? (value.theme as any).background : '#ffffff', accent: typeof (value.theme as any)?.accent === 'string' && /^#[0-9a-f]{6}$/i.test((value.theme as any).accent) ? (value.theme as any).accent : '#2563eb' }, masters, sections, comments, slides: safeSlides };
  }

  async getCapabilities() {
    return {
      version: 23,
      native: true,
      externalEditor: false,
      applications: {
        writer: { enabled: true, phase: 'core', features: ['rich-text', 'headings', 'lists', 'alignment', 'undo-redo', 'autosave', 'rtl'] },
        sheet: { enabled: true, phase: 'professional', features: ['workbook', 'multi-sheet', 'cell-grid', 'selection', 'formatting', 'number-formats', 'formulas', 'nested-formulas', 'cross-sheet-references', 'absolute-references', 'autosave', 'freeze', 'filters', 'data-validation', 'merge-cells', 'undo-redo', 'charts', 'visualization', 'xlsx-compatibility', 'formula-import-export', 'freeze-panes', 'merge-import-export', 'column-row-sizing'] },
        show: { enabled: true, phase: 'completion', features: ['multiple-slides', 'slide-navigator', 'layouts', 'text-elements', 'shapes', 'images', 'lines', 'tables', 'themes', 'aspect-ratio', 'drag-drop', 'multi-select', 'grouping', 'slide-master', 'speaker-notes', 'transitions', 'media', 'audio', 'video', 'video-poster', 'video-trimming', 'media-volume', 'media-fullscreen', 'element-animations', 'animation-timeline', 'animation-entrance', 'animation-emphasis', 'animation-exit', 'animation-order', 'animation-triggers', 'auto-advance', 'presenter-mode', 'undo-redo', 'autosave', 'revision-guard'] },
      },
      features: { autosave: true, revisionGuard: true, sessions: true, collaboration: true, importExport: true,
        importExportFormats: ['docx','xlsx','pptx','imkan-json'], writerDocxCompatibility: true, writerDocxStyles: true, writerDocxTables: true, writerDocxPageSettings: true, writerDocxHeadersFooters: true, writerRichText: true, writerPageLayout: true, writerTables: true, writerImages: true, writerLinks: true, writerHeadersFooters: true, writerPrint: true, writerComments: true, sharedFileComments: true, writerTrackChanges: true, writerCompare: true, sheetCore: true, sheetFormulas: true, sheetFormulaV3: true, sheetCrossSheetRefs: true, sheetDataValidation: true, sheetFilters: true, sheetMerges: true, sheetCharts: true, sheetVisualization: true, sheetUndoRedo: true, sheetFormatting: true, sheetXlsxCompatibility: true, sheetXlsxFormulas: true, sheetXlsxMerges: true, sheetXlsxFreezePanes: true, sheetXlsxDimensions: true, showCore: true, showSlides: true, showMedia: true, showAudio: true, showVideo: true, showVideoPoster: true, showVideoTrimming: true, showMediaVolume: true, showMediaFullscreen: true, showAnimations: true, showAnimationTimeline: true, showAnimationEntrance: true, showAnimationEmphasis: true, showAnimationExit: true, showAnimationTriggers: true, showAnimationOrder: true, showAutoAdvance: true, showLayouts: true, showElements: true, showThemes: true, showRichText: true, showObjectOrdering: true, showTables: true, showPresenterPreview: true, showUndoRedo: true, showPptxCompatibility: true, showPptxSlides: true, showPptxText: true, showPptxShapes: true, showPptxThemes: true, showPptxRoundTrip: true, conversionDiagnostics: true, conversionWarnings: true, roundTripDiagnostics: true, compatibilityCenter: true, roundTripAnalysis: true, conversionCategories: true, conversionMetadata: true, advancedDocxMedia: true, advancedXlsxFormatting: true, advancedXlsxCharts: true, advancedPptxImages: true, advancedPptxTables: true, advancedPptxMediaRelationships: true, deepDocxStyles: true, deepDocxNumbering: true, deepDocxLists: true, deepDocxMediaPreservation: true, deepXlsxStyles: true, deepXlsxCharts: true, deepXlsxValidation: true, deepXlsxConditionalFormatting: true, deepPptxMedia: true, deepPptxTables: true, roundTripQuality: true, nativeOoxmlPreservation: true, ooxmlPreservationGraph: true, relationshipAwarePreservation: true, selectiveOoxmlMerge: true, relationshipConflictResolution: true, nativeMediaBridge: true, nativeChartBridge: true, nativeThemeBridge: true, definedNamesBridge: true, preservedRelationshipRebinding: true, contentTypesMerge: true, rootRelationshipMerge: true, collaborationFoundation: true,
      realTimeOperations: true,
      collaborativeOperationsV2: true,
      operationAcknowledgement: true,
      operationConflictDetection: true,
      reconnectRecovery: true,
      serverSentEventsTransport: true,
      operationOrdering: true, operationTransformMerge: true, operationSequenceGuard: true, lostUpdateProtection: true, duplicateOperationProtection: true, outOfOrderProtection: true, officePresence: true, officeOperationLog: true, collaborationPolling: true },
    };
  }

  private toState(document: { id: string; fileId: string; type: OfficeDocumentType; nativeFormat: string; content: unknown; revision: number; updatedAt: Date; sourceTemplateId?: string | null; sourceTemplateVersionId?: string | null }): OfficeDocumentState {
    return { id: document.id, fileId: document.fileId, type: document.type as OfficeType, nativeFormat: document.nativeFormat, content: document.content, revision: document.revision, updatedAt: document.updatedAt.toISOString(), sourceTemplateId: document.sourceTemplateId ?? null, sourceTemplateVersionId: document.sourceTemplateVersionId ?? null };
  }
}

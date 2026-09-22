import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import type { OfficeType } from './core/office-engine.interface';

export type ConversionCategory = 'preserved'|'converted'|'warning'|'unsupported';
export type ConversionDiagnostic = { code: string; severity: 'info'|'warning'|'loss'; category?: ConversionCategory; message: string; path?: string };
export type ConversionReport = { sourceFormat: string; targetFormat: string; converterVersion: string; nativeSchemaVersion: number; diagnostics: ConversionDiagnostic[]; summary: { info: number; warning: number; loss: number; preserved: number; converted: number; unsupported: number } };
export type RoundTripComparison = { path:string; source:any; roundTrip:any; status:'preserved'|'changed'|'loss'|'added'; reason?:string };
export type RoundTripReport = ConversionReport & { roundTrip: { performed: boolean; exportedBytes: number; reimportedType: OfficeType; sourceMetrics: Record<string,number>; roundTripMetrics: Record<string,number>; metricDiffs: Record<string,number>; structurallyStable: boolean; comparisons?: RoundTripComparison[]; lossCount?: number; changedCount?: number; preservedCount?: number; certification?: 'synthetic-native'|'external-pptx-pending'; }; };
export type OfficeImportResult = { type: OfficeType; title: string; content: any; sourceFormat: string; diagnostics?: ConversionDiagnostic[] };

type PreservationRelationship = { id?: string; type?: string; target?: string; targetMode?: string; external?: boolean; resolvedTarget?: string };
type PreservationBundle = { version: 4; sourceFormat: 'docx'|'xlsx'|'pptx'; capturedAt: string; parts: Record<string,string>; relationships: Record<string, PreservationRelationship[]>; partKinds: Record<string,string>; generatedParts: string[]; truncated: boolean; totalBytes: number };
const PRESERVE_LIMIT = 4 * 1024 * 1024;
const PRESERVE_SKIP = new Set(['word/document.xml','word/_rels/document.xml.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','ppt/presentation.xml','ppt/_rels/presentation.xml.rels']);

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const textOf=(xml:string)=>{const m=[...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];return m.map(x=>x[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')).join('');};
const decodeXml=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'\"').replace(/&apos;/g,"'");
const col=(n:number)=>{let s='';for(let x=n+1;x;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;};
const cellRef=(r:number,c:number)=>`${col(c)}${r+1}`;

@Injectable()
export class OfficeConversionService {
  private async capturePreservation(z: JSZip, sourceFormat: 'docx'|'xlsx'|'pptx'): Promise<PreservationBundle> {
    const parts: Record<string,string> = {};
    const relationships: Record<string, PreservationRelationship[]> = {};
    const partKinds: Record<string,string> = {};
    let totalBytes = 0; let truncated = false;
    const entries = Object.keys(z.files).filter(p => !z.files[p].dir && !PRESERVE_SKIP.has(p));
    for (const path of entries) {
      if (totalBytes >= PRESERVE_LIMIT) { truncated = true; break; }
      const keep = /\.(xml|rels|bin|dat|vml)$/i.test(path) || /^(word|xl|ppt)\/(media|embeddings|theme|customXml)\//i.test(path);
      if (!keep) continue;
      const data = await z.file(path)!.async('nodebuffer');
      if (totalBytes + data.length > PRESERVE_LIMIT) { truncated = true; continue; }
      parts[path] = data.toString('base64');
      partKinds[path] = this.partKind(path);
      totalBytes += data.length;
    }
    // Build a relationship graph from every preserved *.rels part. Targets are normalized to package paths,
    // allowing the export layer to reason about dependencies without overwriting native-generated parts.
    for (const [path, encoded] of Object.entries(parts)) {
      if (!path.endsWith('.rels')) continue;
      try {
        const xml = Buffer.from(encoded, 'base64').toString('utf8');
        const source = this.relationshipSource(path);
        const edges: PreservationRelationship[] = [];
        for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
          const attrs = m[1] || '';
          const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
          const type = /\bType="([^"]+)"/.exec(attrs)?.[1];
          const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
          const targetMode = /\bTargetMode="([^"]+)"/.exec(attrs)?.[1];
          const external = targetMode === 'External';
          edges.push({ id, type, target, targetMode, external, resolvedTarget: external ? undefined : this.resolveRelationshipTarget(source, target || '') });
        }
        if (edges.length) relationships[source] = edges;
      } catch { /* preserve the raw part even if relationship parsing fails */ }
    }
    return { version: 4, sourceFormat, capturedAt: new Date().toISOString(), parts, relationships, partKinds, generatedParts: [...PRESERVE_SKIP, '[Content_Types].xml', '_rels/.rels'], truncated, totalBytes };
  }

  private partKind(path: string): string {
    if (path.endsWith('.rels')) return 'relationship';
    if (/\/(media|embeddings)\//.test(path)) return 'binary-media';
    if (/\/theme\//.test(path)) return 'theme';
    if (/customXml\//.test(path)) return 'custom-xml';
    if (path.endsWith('.xml')) return 'xml';
    return 'opaque';
  }

  private relationshipSource(relsPath: string): string {
    if (relsPath === '_rels/.rels') return '';
    const marker = '/_rels/';
    const idx = relsPath.indexOf(marker);
    if (idx < 0) return relsPath.replace(/\.rels$/i, '');
    return relsPath.slice(0, idx) + '/' + relsPath.slice(idx + marker.length).replace(/\.rels$/i, '');
  }

  private resolveRelationshipTarget(source: string, target: string): string {
    if (!target) return '';
    if (target.startsWith('/')) return target.slice(1);
    const base = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
    const parts = (base + target).split('/');
    const out: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return out.join('/');
  }

  private restorePreservation(z: JSZip, bundle: PreservationBundle | undefined) {
    if (!bundle?.parts) return;
    // Phase 24: relationship-aware merge. Native parts remain authoritative, but preserved
    // relationships are merged into native .rels parts with deterministic Id remapping. When an
    // Id is remapped, the source XML is patched so preserved r:id references remain valid.
    for (const [relsPath, edges] of Object.entries(bundle.relationships || {})) {
      const nativeRelsPath = this.relationshipPathForSource(relsPath);
      const preservedEncoded = bundle.parts[relsPath] || bundle.parts[nativeRelsPath];
      if (!preservedEncoded) continue;
      const nativeFile = z.file(relsPath);
      if (!nativeFile) {
        if (!z.file(relsPath)) z.file(relsPath, Buffer.from(preservedEncoded, 'base64'));
        continue;
      }
      // Native relationship XML is merged asynchronously by mergePreservedRelationships below.
    }
    // Actual asynchronous relationship merge is performed by mergePreservedRelationships.
    // This synchronous wrapper remains responsible for opaque/package-part restoration.
    for (const [path, encoded] of Object.entries(bundle.parts)) {
      if (path.endsWith('.rels') || path === '[Content_Types].xml' || path === '_rels/.rels') continue;
      if (z.file(path)) continue;
      try { z.file(path, Buffer.from(encoded, 'base64')); } catch { /* ignore malformed opaque payload */ }
    }
  }

  private relationshipPathForSource(path: string): string {
    if (path === '') return '_rels/.rels';
    const idx = path.lastIndexOf('/');
    if (idx < 0) return `_rels/${path}.rels`;
    return `${path.slice(0, idx)}/_rels/${path.slice(idx + 1)}.rels`;
  }

  private async mergePreservedRelationships(z: JSZip, bundle: PreservationBundle | undefined) {
    if (!bundle?.parts) return;
    const relationshipPatches: Array<{source:string; from:string; to:string}> = [];
    const xmlEsc = (v:string) => esc(v);
    for (const [source, edges] of Object.entries(bundle.relationships || {})) {
      const relsPath = this.relationshipPathForSource(source);
      const preservedRelXml = bundle.parts[relsPath];
      if (!preservedRelXml) continue;
      const nativeRelFile = z.file(relsPath);
      if (!nativeRelFile) {
        z.file(relsPath, Buffer.from(preservedRelXml, 'base64'));
        continue;
      }
      let nativeXml = await nativeRelFile.async('text');
      const existingIds = new Set<string>();
      for (const m of nativeXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
        const id = /\bId="([^"]+)"/.exec(m[1] || '')?.[1];
        if (id) existingIds.add(id);
      }
      const preservedXml = Buffer.from(preservedRelXml, 'base64').toString('utf8');
      const additions:string[] = [];
      for (const edge of edges) {
        if (!edge.id || !edge.type || !edge.target) continue;
        const target = edge.external ? edge.target : (edge.resolvedTarget || edge.target);
        const targetExists = edge.external || Boolean(bundle.parts[target]) || Boolean(z.file(target));
        if (!targetExists) continue;
        let id = edge.id;
        if (existingIds.has(id)) {
          const same = new RegExp(`<Relationship\\b[^>]*\\bId="${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*\\bType="${edge.type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`);
          if (!same.test(nativeXml)) {
            let n=1; do { id=`${edge.id}_preserved${n++}`; } while(existingIds.has(id));
            relationshipPatches.push({source, from:edge.id, to:id});
          }
        }
        if (existingIds.has(id)) continue;
        existingIds.add(id);
        additions.push(`<Relationship Id="${xmlEsc(id)}" Type="${xmlEsc(edge.type)}" Target="${xmlEsc(edge.target)}"${edge.targetMode ? ` TargetMode="${xmlEsc(edge.targetMode)}"` : ''}/>`);
      }
      if (additions.length) nativeXml = nativeXml.replace(/<\/Relationships>/i, additions.join('') + '</Relationships>');
      z.file(relsPath, nativeXml);
    }

    for (const patch of relationshipPatches) {
      if (!patch.source) continue;
      const sourceFile = z.file(patch.source);
      if (!sourceFile) continue;
      let xml = await sourceFile.async('text');
      const safeFrom = patch.from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      xml = xml.replace(new RegExp(`(r:id=["'])${safeFrom}(["'])`, 'g'), `$1${patch.to}$2`);
      z.file(patch.source, xml);
    }

    // Merge package content types after native generation. Native overrides remain authoritative.
    const preservedTypes = bundle.parts['[Content_Types].xml'];
    const nativeTypes = z.file('[Content_Types].xml');
    if (preservedTypes && nativeTypes) {
      let nativeXml = await nativeTypes.async('text');
      const preservedXml = Buffer.from(preservedTypes, 'base64').toString('utf8');
      const seen = new Set<string>();
      for (const m of nativeXml.matchAll(/<(Default|Override)\b([^>]*)\/?>(?:<\/\1>)?/g)) { const part=/\bPartName="([^"]+)"/.exec(m[2]||'')?.[1] || /\bExtension="([^"]+)"/.exec(m[2]||'')?.[1]; if(part) seen.add(`${m[1]}:${part}`); }
      const additions:string[]=[];
      for (const m of preservedXml.matchAll(/<(Default|Override)\b([^>]*)\/?>(?:<\/\1>)?/g)) { const kind=m[1], attrs=m[2]||''; const key=`${kind}:${/\bPartName="([^"]+)"/.exec(attrs)?.[1] || /\bExtension="([^"]+)"/.exec(attrs)?.[1] || ''}`; if(!seen.has(key)){ seen.add(key); additions.push(`<${kind}${attrs}/>`); } }
      if(additions.length) nativeXml=nativeXml.replace(/<\/Types>/i, additions.join('')+'</Types>');
    z.file('[Content_Types].xml', nativeXml);
    } else if (preservedTypes && !nativeTypes) z.file('[Content_Types].xml', Buffer.from(preservedTypes,'base64'));

    // Root package relationships can contain custom metadata relationships in addition to the
    // officeDocument relationship generated by IMKAN. Merge them with the same conflict policy.
    const rootPath='_rels/.rels';
    const rootPreserved=bundle.parts[rootPath];
    const rootNative=z.file(rootPath);
    if(rootPreserved && rootNative){
      let nx=await rootNative.async('text'); const px=Buffer.from(rootPreserved,'base64').toString('utf8'); const ids=new Set<string>(); for(const m of nx.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)){const id=/\bId="([^"]+)"/.exec(m[1]||'')?.[1];if(id)ids.add(id);} const adds:string[]=[]; for(const m of px.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)){const a=m[1]||'', idm=/\bId="([^"]+)"/.exec(a), tm=/\bTarget="([^"]+)"/.exec(a); if(!idm||!tm||ids.has(idm[1]))continue; const target=tm[1]; if(!target.startsWith('/') && !z.file(target)) continue; ids.add(idm[1]); adds.push(`<Relationship${a}/>`);} if(adds.length) nx=nx.replace(/<\/Relationships>/i,adds.join('')+'</Relationships>'); z.file(rootPath,nx);
    }
  }

  private preservationStats(bundle: PreservationBundle | undefined) {
    if (!bundle) return { parts: 0, relationships: 0, media: 0, themes: 0, customXml: 0, truncated: false };
    const parts = Object.keys(bundle.parts || {});
    const relationshipCount = Object.values(bundle.relationships || {}).reduce((n, edges) => n + edges.length, 0);
    return {
      parts: parts.length,
      relationships: relationshipCount,
      media: parts.filter(p => /\/(media|embeddings)\//.test(p)).length,
      themes: parts.filter(p => /\/theme\//.test(p)).length,
      customXml: parts.filter(p => /customXml\//.test(p)).length,
      truncated: Boolean(bundle.truncated),
    };
  }

  async import(buffer:Buffer, filename:string):Promise<OfficeImportResult>{
    const ext=filename.toLowerCase().split('.').pop();
    if(ext==='docx') return this.importDocx(buffer,filename);
    if(ext==='xlsx') return this.importXlsx(buffer,filename);
    if(ext==='pptx') return this.importPptx(buffer,filename);
    throw new BadRequestException('Supported import formats are DOCX, XLSX and PPTX');
  }

  private readonly converterVersion = 'imkan-office-converter-v26';

  private schemaVersion(type: OfficeType, content: any): number {
    return Number(content?.schema || (type === 'WRITER' ? 4 : type === 'SHEET' ? 5 : 4));
  }

  private categoryFor(severity: ConversionDiagnostic['severity'], code: string): ConversionCategory {
    if (severity === 'loss') return 'unsupported';
    if (severity === 'warning') return 'warning';
    return code.endsWith('_CORE') ? 'preserved' : 'converted';
  }

  private finalizeReport(type: OfficeType, content: any, targetFormat: string, diagnostics: ConversionDiagnostic[]): ConversionReport {
    const enriched = diagnostics.map(d => ({ ...d, category: d.category || this.categoryFor(d.severity, d.code) }));
    const summary = {
      info: enriched.filter(d=>d.severity==='info').length,
      warning: enriched.filter(d=>d.severity==='warning').length,
      loss: enriched.filter(d=>d.severity==='loss').length,
      preserved: enriched.filter(d=>d.category==='preserved').length,
      converted: enriched.filter(d=>d.category==='converted').length,
      unsupported: enriched.filter(d=>d.category==='unsupported').length,
    };
    return { sourceFormat:'imkan-native', targetFormat:String(targetFormat).toLowerCase(), converterVersion:this.converterVersion, nativeSchemaVersion:this.schemaVersion(type, content), diagnostics:enriched, summary };
  }

  async diagnose(type: OfficeType, content: any, targetFormat: string): Promise<ConversionReport> {
    const format = String(targetFormat || '').toLowerCase();
    const diagnostics: ConversionDiagnostic[] = [];
    const add = (code: string, severity: ConversionDiagnostic['severity'], message: string, path?: string) => diagnostics.push({ code, severity, message, path });
    if ((type === 'WRITER' && format !== 'docx') || (type === 'SHEET' && format !== 'xlsx') || (type === 'SHOW' && !['pptx','pdf'].includes(format))) add('FORMAT_MISMATCH', 'loss', `The ${type} document is not compatible with ${format.toUpperCase()} export.`);
    if (type === 'WRITER') {
      const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
      const images = blocks.filter((b:any) => b?.type === 'image');
      const review = content?.review;
      if (images.length) add('WRITER_IMAGES', images.every((b:any)=>typeof b?.image?.src==='string'&&/^data:image\//i.test(b.image.src)) ? 'info' : 'warning', `${images.length} image block(s) detected; data-URI images are embedded by the v19 converter.`, 'blocks');
      if (blocks.some((b:any)=>b?.type==='list-item')) add('WRITER_NUMBERING','info','List paragraphs are exported using native DOCX numbering definitions.','blocks');
      if (review?.comments?.length || review?.changes?.length) add('WRITER_REVIEW', 'loss', 'Comments, threaded replies, resolved state, and tracked changes are exported through native OOXML review parts; unsupported third-party extensions may still produce a compatibility diagnostic.', 'review');
      if (content?.page?.header || content?.page?.footer) add('WRITER_HEADERS', 'info', 'Header/footer metadata is available for DOCX export.', 'page');
      if (Array.isArray(content?.endnotes) && content.endnotes.length) add('WRITER_ENDNOTES', 'info', `${content.endnotes.length} endnote(s) are exported through the native DOCX endnotes part and re-imported into the Writer model.`, 'endnotes');
      if (Array.isArray(content?.footnotes) && content.footnotes.length) add('WRITER_FOOTNOTES', 'info', `${content.footnotes.length} footnote(s) are exported through the native DOCX footnotes part and re-imported into the Writer model.`, 'footnotes');
      if (Array.isArray(content?.bookmarks) && content.bookmarks.length) add('WRITER_BOOKMARKS', 'info', `${content.bookmarks.length} bookmark(s) are emitted as native DOCX bookmarkStart/bookmarkEnd ranges.`, 'bookmarks');
      if (Array.isArray(content?.crossReferences) && content.crossReferences.length) add('WRITER_CROSS_REFERENCES', 'info', `${content.crossReferences.length} cross-reference record(s) are exported as native REF fields when their target has a valid bookmark, and re-imported into the Writer cross-reference model.`, 'crossReferences');
      if (blocks.some((b:any)=>b?.type==='toc')) add('WRITER_TOC_FIELD','info','Table of Contents blocks are exported as native Word TOC fields so heading levels can be rebuilt by the Office consumer.','blocks');
      if (blocks.some((b:any)=>b?.type==='index') || Array.isArray(content?.indexEntries) && content.indexEntries.length) add('WRITER_INDEX_FIELD','info','Index blocks and entries are exported using native Word INDEX/XE fields so the index can be rebuilt by the Office consumer.','indexEntries');
      if (content?._ooxmlPreservation?.parts) add('OOXML_PRESERVATION', content._ooxmlPreservation.truncated ? 'warning' : 'info', `${Object.keys(content._ooxmlPreservation.parts).length} original OOXML package part(s) and ${Object.values(content._ooxmlPreservation.relationships||{}).reduce((n:any, r:any)=>n+r.length,0)} relationship edge(s) are retained for preservation-aware selective merge${content._ooxmlPreservation.truncated ? '; the preservation bundle reached its size limit' : ''}.`, '_ooxmlPreservation');
      add('WRITER_CORE', 'info', 'Paragraphs, rich text, headings, tables and page settings are supported by the current DOCX converter.');
    } else if (type === 'SHEET') {
      const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
      const chartCount = sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.charts)?s.charts.length:0),0);
      if (chartCount) add('SHEET_CHARTS', 'info', `${chartCount} native chart(s) are exported as XLSX chart parts with their source range.`, 'sheets.charts');
      const validations = sheets.reduce((n:number,s:any)=>n+Object.values(s?.cells||{}).filter((c:any)=>c?.validation).length,0);
      if (validations) add('SHEET_VALIDATION', 'info', `${validations} validation rule(s) are preserved through XLSX dataValidation structures.`, 'sheets.cells');
      const conditional=sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.conditionalFormatting)?s.conditionalFormatting.length:0),0); if(conditional) add('SHEET_CONDITIONAL', 'info', `${conditional} conditional-formatting rule(s) are preserved in the XLSX worksheet model.`, 'sheets.conditionalFormatting');
      if (sheets.some((s:any)=>s?.filters?.length)) add('SHEET_FILTERS', 'info', 'Filter metadata is preserved by the XLSX converter.');
      if (content?._ooxmlPreservation?.parts) add('OOXML_PRESERVATION', content._ooxmlPreservation.truncated ? 'warning' : 'info', `${Object.keys(content._ooxmlPreservation.parts).length} original OOXML package part(s) and ${Object.values(content._ooxmlPreservation.relationships||{}).reduce((n:any, r:any)=>n+r.length,0)} relationship edge(s) are retained for preservation-aware selective merge${content._ooxmlPreservation.truncated ? '; the preservation bundle reached its size limit' : ''}.`, '_ooxmlPreservation');
      add('SHEET_CORE', 'info', 'Workbook sheets, values, formulas, merges, dimensions and freeze panes are supported.');
    } else if (type === 'SHOW') {
      const slides = Array.isArray(content?.slides) ? content.slides : [];
      const animations = slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.animations)?s.animations.length:0),0);
      if (animations) add('SHOW_ANIMATIONS', 'loss', `${animations} animation metadata item(s) are not fully represented in PPTX export yet.`, 'slides.animations');
      const notes = slides.filter((s:any)=>s?.notes).length;
      const images = slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='image').length:0),0);
      const tables = slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='table').length:0),0);
      if (images) add('SHOW_IMAGES', 'info', `${images} image element(s) use native PPTX media parts when supplied as data URIs.`, 'slides.elements');
      if (tables) add('SHOW_TABLES', 'info', `${tables} table element(s) are mapped to native PPTX table structures.`, 'slides.elements');
      if (notes) add('SHOW_NOTES', 'warning', `${notes} speaker note block(s) require notes-part export support.`, 'slides.notes');
      if (content?._ooxmlPreservation?.parts) add('OOXML_PRESERVATION', content._ooxmlPreservation.truncated ? 'warning' : 'info', `${Object.keys(content._ooxmlPreservation.parts).length} original OOXML package part(s) and ${Object.values(content._ooxmlPreservation.relationships||{}).reduce((n:any, r:any)=>n+r.length,0)} relationship edge(s) are retained for preservation-aware selective merge${content._ooxmlPreservation.truncated ? '; the preservation bundle reached its size limit' : ''}.`, '_ooxmlPreservation');
      if (format === 'pdf') {
        const unsupportedMedia = slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>['video','audio'].includes(e?.type)).length:0),0);
        if (unsupportedMedia) add('SHOW_PDF_MEDIA', 'warning', `${unsupportedMedia} video/audio element(s) are not embedded in static PDF output; the visual placeholder is retained.`, 'slides.elements');
        const notesPdf = slides.filter((s:any)=>s?.notes).length;
        if (notesPdf) add('SHOW_PDF_NOTES', 'warning', `${notesPdf} speaker-note block(s) are intentionally excluded from audience PDF pages.`, 'slides.notes');
        add('SHOW_PDF_CORE', 'info', 'Static slide pages, backgrounds, text, basic shapes, lines and data-URI PNG/JPEG images are emitted as native PDF page content.');
      } else add('SHOW_CORE', 'info', 'Slides, text, basic shapes, backgrounds and positioning are supported by the current PPTX converter.');
    }
    return this.finalizeReport(type, content, format, diagnostics);
  }

  private metrics(type: OfficeType, content: any): Record<string,number> {
    if (type === 'WRITER') {
      const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
      const comments = Array.isArray(content?.review?.comments) ? content.review.comments : [];
      const replies = comments.reduce((n:number,c:any)=>n+(Array.isArray(c?.replies)?c.replies.length:0),0);
      const changes = Array.isArray(content?.review?.changes) ? content.review.changes : [];
      const tables = blocks.filter((b:any)=>b?.type==='table');
      const tableRows = tables.reduce((n:number,b:any)=>n+(Array.isArray(b?.table?.rows)?b.table.rows.length:0),0);
      const tableCells = tables.reduce((n:number,b:any)=>n+(Array.isArray(b?.table?.rows)?b.table.rows.reduce((r:number,row:any[])=>r+(Array.isArray(row)?row.length:0),0):0),0);
      const footnotes = Array.isArray(content?.footnotes) ? content.footnotes : [];
      const endnotes = Array.isArray(content?.endnotes) ? content.endnotes : [];
      const sections = Array.isArray(content?.sections) ? content.sections : [];
      const bookmarks = Array.isArray(content?.bookmarks) ? content.bookmarks : [];
      const citations = Array.isArray(content?.citations) ? content.citations : [];
      const citationSources = Array.isArray(content?.citationSources) ? content.citationSources : [];
      const captions = Array.isArray(content?.captions) ? content.captions : [];
      const crossReferences = Array.isArray(content?.crossReferences) ? content.crossReferences : [];
      const indexEntries = Array.isArray(content?.indexEntries) ? content.indexEntries : [];
      return {
        blocks: blocks.length,
        paragraphs: blocks.filter((b:any)=>['paragraph','heading1','heading2','heading3','list-item'].includes(b?.type)).length,
        tables: tables.length,
        tableHeaderRows: tables.reduce((n:number,b:any)=>n+(Number(b?.table?.headerRows)||0),0),
        repeatingHeaderTables: tables.filter((b:any)=>Boolean(b?.table?.repeatHeaderRow)).length,
        tableRows,
        tableCells,
        images: blocks.filter((b:any)=>b?.type==='image').length,
        
        sections: sections.length,
        bookmarks: bookmarks.length,
        footnotes: footnotes.length,
        endnotes: endnotes.length,
        comments: comments.length,
        replies,
        changes: changes.length,
        pendingChanges: changes.filter((c:any)=>c?.status==='pending').length,
        citations: citations.length,
        citationSources: citationSources.length,
        captions: captions.length,
        crossReferences: crossReferences.length,
        indexEntries: indexEntries.length,
        tocBlocks: blocks.filter((b:any)=>b?.type==='toc').length,
        bibliographyBlocks: blocks.filter((b:any)=>b?.type==='bibliography').length,
      };
    }
    if (type === 'SHEET') {
      const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
      return { sheets:sheets.length, cells:sheets.reduce((n:number,s:any)=>n+Object.keys(s?.cells||{}).length,0), formulas:sheets.reduce((n:number,s:any)=>n+Object.values(s?.cells||{}).filter((c:any)=>typeof c?.formula==='string'&&c.formula.startsWith('=')).length,0), merges:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.merges)?s.merges.length:0),0), charts:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.charts)?s.charts.length:0),0), tables:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.tables)?s.tables.length:0),0), validations:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.validations)?s.validations.length:Object.values(s?.cells||{}).filter((c:any)=>c?.validation).length),0), conditionalFormats:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.conditionalFormats)?s.conditionalFormats.length:Array.isArray(s?.conditionalFormatting)?s.conditionalFormatting.length:0),0), frozenPanes:sheets.reduce((n:number,s:any)=>n+((Number(s?.frozenRows)||0)>0||(Number(s?.frozenColumns)||0)>0?1:0),0), namedRanges:Array.isArray(content?.namedRanges)?content.namedRanges.length:(Array.isArray(content?._ooxmlBridge?.definedNames)?content._ooxmlBridge.definedNames.length:0) };
    }
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    return { slides:slides.length, elements:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.length:0),0), tables:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='table').length:0),0), images:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='image').length:0),0) };
  }

  private showRoundTripSnapshot(content:any): any {
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    const norm = (v:any) => String(v ?? '').replace(/\s+/g,' ').trim();
    const round = (v:any) => Math.round((Number(v)||0)*100)/100;
    const element = (e:any) => ({
      type:e?.type||'unknown', x:round(e?.x), y:round(e?.y), width:round(e?.width), height:round(e?.height), rotation:round(e?.rotation),
      text:e?.type==='text'||e?.type==='shape' ? norm(e?.text) : undefined,
      fontSize:e?.fontSize==null?undefined:round(e.fontSize), fontFamily:e?.fontFamily, bold:Boolean(e?.bold), italic:Boolean(e?.italic), underline:Boolean(e?.underline),
      align:e?.align, textDirection:e?.textDirection, fill:e?.fill, borderColor:e?.borderColor, borderWidth:e?.borderWidth==null?undefined:round(e.borderWidth),
      shape:e?.shape, rows:e?.type==='table'?e?.rows:null,
      chart:e?.type==='chart'?{type:e?.chart?.type||e?.chartType||'column',title:norm(e?.chart?.title||e?.title),categories:(e?.chart?.categories||e?.categories||[]).map(norm),series:(e?.chart?.series||e?.series||[]).map((x:any)=>({name:norm(x?.name),values:(x?.values||[]).map((n:any)=>Number(n))}))}:undefined,
      hasImage:e?.type==='image' ? Boolean(typeof e?.src==='string' && e.src.startsWith('data:image/')) : undefined
    });
    return {
      aspectRatio:content?.aspectRatio||'16:9', theme:{accent:content?.theme?.accent,secondary:content?.theme?.secondary,background:content?.theme?.background,fontFamily:content?.theme?.fontFamily,headingFont:content?.theme?.headingFont},
      slides:slides.map((s:any)=>({layout:s?.layout||'blank',background:s?.background,notes:norm(s?.notes),transition:typeof s?.transition==='string'?s.transition:s?.transition?.type||'none',transitionDuration:round(s?.transition?.duration||s?.transitionDuration),elements:(Array.isArray(s?.elements)?s.elements:[]).map(element)}))
    };
  }

  private compareShowRoundTrip(source:any, actual:any): RoundTripComparison[] {
    const a=this.showRoundTripSnapshot(source), b=this.showRoundTripSnapshot(actual); const out:RoundTripComparison[]=[];
    const add=(path:string,x:any,y:any,status:RoundTripComparison['status'],reason?:string)=>out.push({path,source:x,roundTrip:y,status,reason});
    const eq=(x:any,y:any,tol=0)=> typeof x==='number'&&typeof y==='number' ? Math.abs(x-y)<=tol : JSON.stringify(x)===JSON.stringify(y);
    add('aspectRatio',a.aspectRatio,b.aspectRatio,eq(a.aspectRatio,b.aspectRatio)?'preserved':'changed');
    add('slideCount',a.slides.length,b.slides.length,a.slides.length===b.slides.length?'preserved':b.slides.length<a.slides.length?'loss':'added');
    const n=Math.max(a.slides.length,b.slides.length);
    for(let i=0;i<n;i++){ const x=a.slides[i], y=b.slides[i]; if(!x||!y){add(`slides[${i}]`,x,y,!y?'loss':'added','Slide missing after re-import.');continue;}
      for(const k of ['layout','background','transition']) add(`slides[${i}].${k}`,x[k],y[k],x[k]===y[k]?'preserved':'changed');
      if(String(x.notes||'').replace(/\s+/g,' ').trim()!==String(y.notes||'').replace(/\s+/g,' ').trim()) add(`slides[${i}].notes`,x.notes,y.notes,'loss','Speaker notes are imported but are not yet emitted by the native PPTX exporter.');
      if(!eq(x.transitionDuration,y.transitionDuration,100)) add(`slides[${i}].transitionDuration`,x.transitionDuration,y.transitionDuration,'changed','PPTX transition speed is normalized to OOXML speed buckets.');
      const m=Math.max(x.elements.length,y.elements.length); add(`slides[${i}].elementCount`,x.elements.length,y.elements.length,x.elements.length===y.elements.length?'preserved':y.elements.length<x.elements.length?'loss':'added');
      for(let j=0;j<m;j++){ const ex=x.elements[j], ey=y.elements[j]; if(!ex||!ey){add(`slides[${i}].elements[${j}]`,ex,ey,!ey?'loss':'added','Element missing after re-import.');continue;}
        for(const k of ['type','text','fontFamily','bold','italic','underline','align','textDirection','fill','borderColor','shape']) if(ex[k]!==undefined||ey[k]!==undefined) add(`slides[${i}].elements[${j}].${k}`,ex[k],ey[k],ex[k]===ey[k]?'preserved':'changed');
        for(const k of ['x','y','width','height','rotation','fontSize','borderWidth']) if(ex[k]!==undefined||ey[k]!==undefined) add(`slides[${i}].elements[${j}].${k}`,ex[k],ey[k],eq(ex[k],ey[k],0.15)?'preserved':'changed','Geometry/font metrics are compared with a small normalization tolerance.');
        if(ex.rows!==null||ey.rows!==null) add(`slides[${i}].elements[${j}].rows`,ex.rows,ey.rows,JSON.stringify(ex.rows)===JSON.stringify(ey.rows)?'preserved':(ey.rows?.length||0)<(ex.rows?.length||0)?'loss':'changed');
        if(ex.chart||ey.chart) add(`slides[${i}].elements[${j}].chart`,ex.chart,ey.chart,JSON.stringify(ex.chart)===JSON.stringify(ey.chart)?'preserved':'changed');
        if(ex.hasImage!==undefined||ey.hasImage!==undefined) add(`slides[${i}].elements[${j}].image`,ex.hasImage,ey.hasImage,ex.hasImage===ey.hasImage?'preserved':!ey.hasImage?'loss':'changed');
      }
    }
    return out;
  }

  async roundTrip(type: OfficeType, content: any, targetFormat: string): Promise<RoundTripReport> {
    const base = await this.diagnose(type, content, targetFormat);
    const exported = await this.export(type, content, targetFormat);
    const imported = await this.import(exported.buffer, exported.filename);
    const sourceMetrics = this.metrics(type, content);
    const roundTripMetrics = this.metrics(imported.type, imported.content);
    const metricDiffs: Record<string,number> = {};
    for (const key of new Set([...Object.keys(sourceMetrics), ...Object.keys(roundTripMetrics)])) metricDiffs[key] = (roundTripMetrics[key]||0) - (sourceMetrics[key]||0);
    const diagnostics = [...base.diagnostics];
    let comparisons:RoundTripComparison[]=[];
    let lossCount=0,changedCount=0,preservedCount=0;
    if(type==='SHOW' && targetFormat.toLowerCase()==='pptx'){
      comparisons=this.compareShowRoundTrip(content, imported.content);
      lossCount=comparisons.filter(c=>c.status==='loss').length; changedCount=comparisons.filter(c=>c.status==='changed').length; preservedCount=comparisons.filter(c=>c.status==='preserved').length;
      if(lossCount) diagnostics.push({code:'PPTX_ROUNDTRIP_LOSS',severity:'loss',category:'unsupported',message:`${lossCount} semantic item(s) were not preserved through the native PPTX round trip.`,path:'roundTrip.comparisons'});
      if(changedCount) diagnostics.push({code:'PPTX_ROUNDTRIP_NORMALIZATION',severity:'warning',category:'converted',message:`${changedCount} item(s) changed through expected OOXML normalization or importer simplification.`,path:'roundTrip.comparisons'});
      if(!lossCount && !changedCount) diagnostics.push({code:'PPTX_ROUNDTRIP_STABLE',severity:'info',category:'preserved',message:'Show semantic snapshot remained stable through native PPTX export and re-import.','path':'roundTrip.comparisons'});
      diagnostics.push({code:'PPTX_EXTERNAL_CORPUS_PENDING',severity:'warning',category:'warning',message:'This certification is synthetic-native: real PowerPoint-authored PPTX corpus validation is still required before claiming arbitrary Microsoft PowerPoint interoperability.','path':'roundTrip'});
    }
    const structurallyStable=type==='SHOW'&&targetFormat.toLowerCase()==='pptx' ? lossCount===0 && changedCount===0 && Object.values(metricDiffs).every(v=>v===0) : Object.values(metricDiffs).every(v=>v===0);
    if(type!=='SHOW' || targetFormat.toLowerCase()!=='pptx') diagnostics.push(structurallyStable?{code:'ROUNDTRIP_STABLE',severity:'info',category:'preserved',message:'The exported file was re-imported successfully and the selected structural metrics remained stable.',path:'roundTrip'}:{code:'ROUNDTRIP_STRUCTURAL_DIFF',severity:'warning',category:'warning',message:'The exported file was re-imported successfully, but structural metrics changed during the round trip.',path:'roundTrip'});
    const report = this.finalizeReport(type, content, targetFormat, diagnostics);
    return { ...report, roundTrip:{performed:true,exportedBytes:exported.buffer.length,reimportedType:imported.type,sourceMetrics,roundTripMetrics,metricDiffs,structurallyStable,comparisons,lossCount,changedCount,preservedCount,certification:type==='SHOW'&&targetFormat.toLowerCase()==='pptx'?'synthetic-native':undefined} };
  }

  async export(type:OfficeType, content:any, format:string):Promise<{buffer:Buffer;filename:string;mimeType:string}>{
    const f=format.toLowerCase();
    if(type==='WRITER' && f==='docx') return {buffer:await this.exportDocx(content),filename:`${safeName(content?.title||'document')}.docx`,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
    if(type==='SHEET' && f==='xlsx') return {buffer:await this.exportXlsx(content),filename:`${safeName(content?.title||'spreadsheet')}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    if(type==='SHOW' && f==='pptx') return {buffer:await this.exportPptx(content),filename:`${safeName(content?.title||'presentation')}.pptx`,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
    if(type==='SHOW' && f==='pdf') return {buffer:await this.exportShowPdf(content),filename:`${safeName(content?.title||'presentation')}.pdf`,mimeType:'application/pdf'};
    throw new BadRequestException(`Cannot export ${type} as ${format}`);
  }

  private async importDocx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const xml=await (await this.required(z,'word/document.xml')).async('string');
    const stylesXml=z.file('word/styles.xml') ? await z.file('word/styles.xml')!.async('string') : '';
    const numberingXml=z.file('word/numbering.xml') ? await z.file('word/numbering.xml')!.async('string') : '';
    const footnotesXml=z.file('word/footnotes.xml') ? await z.file('word/footnotes.xml')!.async('string') : '';
    const endnotesXml=z.file('word/endnotes.xml') ? await z.file('word/endnotes.xml')!.async('string') : '';
    const commentsXml=z.file('word/comments.xml') ? await z.file('word/comments.xml')!.async('string') : '';
    const commentsExtendedXml=z.file('word/commentsExtended.xml') ? await z.file('word/commentsExtended.xml')!.async('string') : '';
    const footnoteTextById:Record<string,string>={};
    const endnoteTextById:Record<string,string>={};
    for(const fm of footnotesXml.matchAll(/<w:footnote\b[^>]*w:id="(-?\d+)"[^>]*>([\s\S]*?)<\/w:footnote>/g)){
      const id=fm[1]; if(Number(id)<1) continue;
      footnoteTextById[id]=decode([...fm[2].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join('')).trim();
    }
    for(const em of endnotesXml.matchAll(/<w:endnote\b[^>]*w:id="(-?\d+)"[^>]*>([\s\S]*?)<\/w:endnote>/g)){
      const id=em[1]; if(Number(id)<1) continue;
      endnoteTextById[id]=decode([...em[2].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join('')).trim();
    }
    const commentById:Record<string,{author:string;text:string;createdAt?:string;paraId?:string;parentParaId?:string;resolved?:boolean}>={};
    const commentExtendedByParaId:Record<string,{parentParaId?:string;resolved?:boolean}>={};
    for(const ex of commentsExtendedXml.matchAll(/<w15:commentEx\b([^>]*)\/>/g)){
      const attrs=ex[1]||''; const paraId=/w15:paraId="([^"]+)"/.exec(attrs)?.[1]; if(!paraId) continue;
      const parentParaId=/w15:paraIdParent="([^"]+)"/.exec(attrs)?.[1]; const done=/w15:done="([^"]+)"/.exec(attrs)?.[1];
      commentExtendedByParaId[paraId]={parentParaId,resolved:done==='1' || done==='true'};
    }
    for(const cm of commentsXml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)){
      const attrs=cm[1], body=cm[2], id=/w:id="([^"]+)"/.exec(attrs)?.[1]; if(!id) continue;
      const author=/w:author="([^"]*)"/.exec(attrs)?.[1]||'Unknown';
      const date=/w:date="([^"]*)"/.exec(attrs)?.[1];
      const paraId=/w14:paraId="([^"]+)"/.exec(body)?.[1];
      const text=[...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decode(x[1])).join('');
      commentById[id]={author:decode(author),text,createdAt:date,paraId};
      if(paraId && commentExtendedByParaId[paraId]) { commentById[id].parentParaId=commentExtendedByParaId[paraId].parentParaId; commentById[id].resolved=commentExtendedByParaId[paraId].resolved; }
    }
    const numberingMap:Record<string,any>={};
    for(const m of numberingXml.matchAll(/<w:abstractNum\s+[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)){const id=m[1],body=m[0],levels:any={}; for(const lm of body.matchAll(/<w:lvl\s+[^>]*w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g)){const lvl=lm[1],lb=lm[0]; levels[lvl]={ordered:/w:numFmt[^>]*w:val="(decimal|lowerLetter|upperLetter|lowerRoman|upperRoman)"/.test(lb)};} numberingMap[id]=levels;}
    const numToAbstract:Record<string,string>={}; for(const m of numberingXml.matchAll(/<w:num\s+[^>]*w:numId="(\d+)"[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"\s*\/>[\s\S]*?<\/w:num>/g)) numToAbstract[m[1]]=m[2];
    const styleMap:Record<string,any>={};
    for(const m of stylesXml.matchAll(/<w:style\s+([^>]*)>([\s\S]*?)<\/w:style>/g)){
      const id=/w:styleId="([^"]+)"/.exec(m[1])?.[1]; if(!id) continue;
      const body=m[2]; styleMap[id]={bold:Boolean(body.match(/<w:b(?:\s|\/|>)/)),italic:Boolean(body.match(/<w:i(?:\s|\/|>)/)),underline:Boolean(body.match(/<w:u(?:\s|\/|>)/)),strike:Boolean(body.match(/<w:strike(?:\s|\/|>)/)),fontFamily:/<w:rFonts[^>]*w:ascii=\"([^\"]+)/.exec(body)?.[1],fontSize:(Number(/<w:sz[^>]*w:val=\"(\d+)\"/.exec(body)?.[1]||0)/2)||undefined,color:(/ <w:color[^>]*w:val=\"([0-9A-Fa-f]{6})/.exec(body)?.[1] ? '#'+/ <w:color[^>]*w:val=\"([0-9A-Fa-f]{6})/.exec(body)![1] : undefined)};
    }
    const pageNode=/<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(xml)?.[0]||'';
    const pgSz=/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(pageNode);
    const pgMar=/<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/.exec(pageNode);
    const widthMm=pgSz?Math.round(Number(pgSz[1])*25.4/1440):210, heightMm=pgSz?Math.round(Number(pgSz[2])*25.4/1440):297;
    const blocks:any[]=[];
    const blockSourceOffsets:Record<string,number>={};
    // Paragraph extraction must only inspect direct document-body paragraphs; Word table cells
    // also contain <w:p> nodes and must remain owned by the table parser. Preserve offsets by
    // masking table XML with equal-length whitespace before paragraph matching.
    const bodyXmlForParagraphs=xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g,(m:string)=>' '.repeat(m.length));
    const importedComments:any[]=[]; const importedChanges:any[]=[];
    const footnoteBlockIds:Record<string,string>={};
    const endnoteBlockIds:Record<string,string>={};
    let bi=0;
    for(const m of bodyXmlForParagraphs.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)){
      const pxml=m[0]; const ppr=/<w:pPr[\s\S]*?<\/w:pPr>/.exec(pxml)?.[0]||'';
      const styleId=/<w:pStyle[^>]*w:val="([^"]+)"/.exec(ppr)?.[1];
      const numPr=/<w:numPr[\s\S]*?<\/w:numPr>/.test(ppr);
      const numId=/<w:numId[^>]*w:val="(\d+)"/.exec(ppr)?.[1]; const ilvl=/<w:ilvl[^>]*w:val="(\d+)"/.exec(ppr)?.[1]||'0'; const listMeta=numId?numberingMap[numToAbstract[numId]]?.[ilvl]:undefined;
      const alignVal=/<w:jc[^>]*w:val="([^"]+)"/.exec(ppr)?.[1];
      const align=alignVal==='center'?'center':alignVal==='right'?'end':alignVal==='both'?'justify':'start';
      const direction=/<w:bidi(?:\s[^>]*)?\/?>/.test(ppr)?'rtl':alignVal==='left'?'ltr':'auto';
      const type=styleId && /heading1|title/i.test(styleId)?'heading1':styleId && /heading2/i.test(styleId)?'heading2':styleId && /heading3/i.test(styleId)?'heading3':numPr?'list-item':'paragraph';
      const runs:any[]=[];
      const referencedFootnoteIds=[...pxml.matchAll(/<w:footnoteReference[^>]*w:id="(\d+)"/g)].map(x=>x[1]);
      const referencedEndnoteIds=[...pxml.matchAll(/<w:endnoteReference[^>]*w:id="(\d+)"/g)].map(x=>x[1]);
      for(const rm of pxml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)){
        const rx=rm[0], rpr=/<w:rPr[\s\S]*?<\/w:rPr>/.exec(rx)?.[0]||'';
        const texts=[...rx.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decode(x[1])).join('');
        if(!texts && !/<w:br/.test(rx)) continue;
        const run:any={text:texts,bold:!!rpr.match(/<w:b(?:\s|\/|>)/),italic:!!rpr.match(/<w:i(?:\s|\/|>)/),underline:!!rpr.match(/<w:u(?:\s|\/|>)/),strike:!!rpr.match(/<w:strike(?:\s|\/|>)/)};
        const style=styleId?styleMap[styleId]:undefined; if(style){run.bold ||= style.bold; run.italic ||= style.italic; run.underline ||= style.underline;}
        const fs=/<w:sz[^>]*w:val="(\d+)"/.exec(rpr)?.[1]; if(fs) run.fontSize=Number(fs)/2;
        const color=/<w:color[^>]*w:val="([0-9A-Fa-f]{6})"/.exec(rpr)?.[1]; if(color) run.color='#'+color;
        const font=/<w:rFonts[^>]*(?:w:ascii|w:hAnsi)="([^"]+)"/.exec(rpr)?.[1]; if(font) run.fontFamily=font;
        const vert=/<w:vertAlign[^>]*w:val="(superscript|subscript)"/.exec(rpr)?.[1]; if(vert) run.verticalAlign=vert;
        const hl=/<w:highlight[^>]*w:val="([^"]+)"/.exec(rpr)?.[1]; if(hl) run.highlight=wordColor(hl);
        const parentChange=/<w:(ins|del)\b[^>]*>([\s\S]*?)<\/w:\1>/.exec(pxml);
        if(parentChange && parentChange[2].includes(rx)) { /* change is captured below at paragraph scope */ }
        runs.push(run);
      }
      if(!runs.length) runs.push({text:''});
      const pageBreakBefore=/<w:pageBreakBefore(?:\s|\/|>)/.test(ppr) || /<w:br[^>]*w:type="page"/.test(pxml);
      const blockId=`p${++bi}`;
      const commentIds=[...pxml.matchAll(/<w:commentRangeStart[^>]*w:id="([^"]+)"/g)].map(x=>x[1]);
      for(const cid of commentIds){ const c=commentById[cid]; if(c) importedComments.push({id:`comment-${cid}`,blockId,text:c.text,authorName:c.author,createdAt:c.createdAt||new Date().toISOString(),resolved:Boolean(c.resolved),replies:[],mentions:[],__docxParaId:c.paraId,__docxParentParaId:c.parentParaId}); }
      for(const im of pxml.matchAll(/<w:ins\b([^>]*)>([\s\S]*?)<\/w:ins>/g)){ const body=im[2], author=/w:author="([^"]*)"/.exec(im[1])?.[1], date=/w:date="([^"]*)"/.exec(im[1])?.[1], text=[...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decode(x[1])).join(''); importedChanges.push({id:`ins-${blockId}-${importedChanges.length+1}`,blockId,kind:'insert',before:[],after:[{text}],authorName:author?decode(author):undefined,createdAt:date||new Date().toISOString(),status:'pending'}); }
      for(const dm of pxml.matchAll(/<w:del\b([^>]*)>([\s\S]*?)<\/w:del>/g)){ const body=dm[2], author=/w:author="([^"]*)"/.exec(dm[1])?.[1], date=/w:date="([^"]*)"/.exec(dm[1])?.[1], text=[...body.matchAll(/<w:delText[^>]*>([\s\S]*?)<\/w:delText>/g)].map(x=>decode(x[1])).join(''); importedChanges.push({id:`del-${blockId}-${importedChanges.length+1}`,blockId,kind:'delete',before:[{text}],after:[],authorName:author?decode(author):undefined,createdAt:date||new Date().toISOString(),status:'pending'}); }
      for(const fm of pxml.matchAll(/<w:rPrChange\b([^>]*)>([\s\S]*?)<\/w:rPrChange>/g)){ const attrs=fm[1], oldPr=fm[2]; const author=/w:author="([^"]*)"/.exec(attrs)?.[1], date=/w:date="([^"]*)"/.exec(attrs)?.[1]; const current=runs[0]||{text:''}; const before:any={text:String(current.text||'')}; const after:any={text:String(current.text||'')}; const map=(pr:string,r:any)=>{ const b=/<w:b\b/.test(pr), i=/<w:i\b/.test(pr), u=/<w:u\b/.test(pr), strike=/<w:strike\b/.test(pr), sz=/<w:sz[^>]*w:val="([^"]+)"/.exec(pr)?.[1], color=/<w:color[^>]*w:val="([^"]+)"/.exec(pr)?.[1], font=/<w:rFonts[^>]*w:ascii="([^"]+)"/.exec(pr)?.[1]; if(b)r.bold=true;if(i)r.italic=true;if(u)r.underline=true;if(strike)r.strike=true;if(sz)r.fontSize=Number(sz)/2;if(color)r.color=`#${color}`;if(font)r.fontFamily=decode(font); }; map(oldPr,before); if(current.bold)after.bold=true;if(current.italic)after.italic=true;if(current.underline)after.underline=true;if(current.strike)after.strike=true;if(current.fontSize)after.fontSize=current.fontSize;if(current.color)after.color=current.color;if(current.fontFamily)after.fontFamily=current.fontFamily; importedChanges.push({id:`fmt-${blockId}-${importedChanges.length+1}`,blockId,kind:'format',before:[before],after:[after],authorName:author?decode(author):undefined,createdAt:date||new Date().toISOString(),status:'pending'}); }
      for(const fid of referencedFootnoteIds){ const marker=String(Object.keys(footnoteTextById).indexOf(fid)+1); footnoteBlockIds[fid]=blockId; if(!runs.some((r:any)=>r.verticalAlign==='superscript'&&String(r.text||'').includes(`[${marker}]`))) runs.push({text:` [${marker}]`,verticalAlign:'superscript'}); }
      for(const eid of referencedEndnoteIds){ const marker=String(Object.keys(endnoteTextById).indexOf(eid)+1); endnoteBlockIds[eid]=blockId; if(!runs.some((r:any)=>r.verticalAlign==='superscript'&&String(r.text||'').includes(`⟦${marker}⟧`))) runs.push({text:` ⟦${marker}⟧`,verticalAlign:'superscript'}); }
      const hasDrawing=/<w:drawing\b/.test(pxml);
      const hasStructuredField=/<w:fldSimple\b/.test(pxml);
      const directTextXml=pxml.replace(/<w:fldSimple\b[\s\S]*?<\/w:fldSimple>/g,''); const hasMeaningfulText=[...directTextXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].some((m:any)=>decode(m[1]).trim().length>0);
      if(!hasDrawing || hasMeaningfulText || commentIds.length || importedChanges.some((c:any)=>c.blockId===blockId) || referencedFootnoteIds.length || referencedEndnoteIds.length || /<w:bookmarkStart\b/.test(pxml)){
        blocks.push({id:blockId,type,align,direction,ordered: type==='list-item' ? Boolean(listMeta?.ordered) : false,listLevel:type==='list-item'?Number(ilvl):undefined,runs,lineSpacing:1.5,spaceAfter:8,pageBreakBefore});
        blockSourceOffsets[blockId]=typeof m.index==='number'?m.index:xml.indexOf(pxml);
      }
    }
    // Native image conversion: image-only paragraphs become first-class Writer image blocks.
    const documentRelXml=z.file('word/_rels/document.xml.rels')?await z.file('word/_rels/document.xml.rels')!.async('string'):'';
    const documentImageRels:Record<string,string>={};
    for(const rm of documentRelXml.matchAll(/<Relationship\s+([^>]*)\/?>/g)){
      const attrs=rm[1]||''; const rid=/\bId="([^"]+)"/.exec(attrs)?.[1]; const target=/\bTarget="([^"]+)"/.exec(attrs)?.[1]; const typeRel=/\bType="([^"]+)"/.exec(attrs)?.[1]||'';
      if(rid&&target&&/\/image$/.test(typeRel)) documentImageRels[rid]=this.resolveRelationshipTarget('word/document.xml',target);
    }
    let importedImageNo=0;
    for(const pm of bodyXmlForParagraphs.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)){
      const pxml=pm[0]; const imageMatch=/<a:blip[^>]*r:embed="([^"]+)"/.exec(pxml); if(!imageMatch) continue;
      const imagePath=documentImageRels[imageMatch[1]]; if(!imagePath) continue; const imageFile=z.file(imagePath); if(!imageFile) continue;
      const imageBuf=await imageFile.async('nodebuffer'); const ext=(imagePath.split('.').pop()||'png').toLowerCase();
      const extMime=ext==='jpg'||ext==='jpeg'?'jpeg':ext==='svg'?'svg+xml':ext;
      const extent=/<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pxml);
      const width=extent?Number(extent[1])/9525:160, height=extent?Number(extent[2])/9525:90;
      const imageBlockId=`image-${++importedImageNo}`; blocks.push({id:imageBlockId,type:'image',align:'start',runs:[{text:''}],image:{src:`data:image/${extMime};base64,${imageBuf.toString('base64')}`,alt:'Imported image',width,height}});
      blockSourceOffsets[imageBlockId]=typeof pm.index==='number'?pm.index:xml.indexOf(pxml);
    }

    // Native table conversion: each row/cell becomes Writer table cells.
    for(const tm of xml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)){
      const rawRows=[...tm[0].matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)]; const rows=rawRows.map((tr:any,ri:number)=>[...tr[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc:any,ci:number)=>({id:`cell-${ri}-${ci}`,runs:[{text:textOf(tc[0])}],align:'start'}))); const headerRows=rawRows.filter((tr:any)=>/<w:tblHeader(?:\s[^>]*)?\/>/.test(tr[0])).length;
      const tableId=`table-${blocks.length+1}`; blocks.push({id:tableId,type:'table',align:'start',runs:[{text:''}],table:{rows,bordered:true,headerRows,repeatHeaderRow:headerRows>0}});
      blockSourceOffsets[tableId]=typeof tm.index==='number'?tm.index:xml.indexOf(tm[0]);
    }
    const docRelXml=z.file('word/_rels/document.xml.rels')?await z.file('word/_rels/document.xml.rels')!.async('string'):''; const hyperlinkMap:Record<string,string>={}; for(const m of docRelXml.matchAll(/<Relationship\s+([^>]*)\/>/g)){const a=m[1],id=/Id="([^"]+)"/.exec(a)?.[1],target=/Target="([^"]+)"/.exec(a)?.[1],typeRel=/Type="([^"]+)"/.exec(a)?.[1]||''; if(id&&target&&/hyperlink$/.test(typeRel)) hyperlinkMap[id]=target;}
    const paragraphXml=[...bodyXmlForParagraphs.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);
    const bookmarksRaw:any[]=[]; paragraphXml.forEach((pxml,idx)=>{ for(const m of pxml.matchAll(/<w:bookmarkStart[^>]*w:id="(\d+)"[^>]*w:name="([^"]+)"/g)) bookmarksRaw.push({id:m[1],name:m[2],blockId:`p${idx+1}`}); });
    const bookmarks=bookmarksRaw.map(b=>({id:b.id,name:b.name,blockId:b.blockId}));
    const importedCaptions:any[]=[]; paragraphXml.forEach((pxml,idx)=>{ const blockId=`p${idx+1}`; for(const m of pxml.matchAll(/<w:fldSimple[^>]*w:instr="([^"]*\bSEQ\s+(Figure|Table|Equation)\b[^"]*)"[^>]*>([\s\S]*?)<\/w:fldSimple>/gi)){ const label=m[2]; const display=decode(([...m[3].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join(''))||''); const num=(display.match(/(\d+(?:[.\-]\d+)*)/)||[])[1]||String(importedCaptions.length+1); importedCaptions.push({id:`caption-${importedCaptions.length+1}`,blockId,label,number:num,text:display||`${label} ${num}`}); } });
    const importedCrossReferences:any[]=[]; paragraphXml.forEach((pxml,idx)=>{ const sourceBlockId=`p${idx+1}`; for(const m of pxml.matchAll(/<w:fldSimple[^>]*w:instr="([^"]*\bREF\s+([^\s\\]+)[^"]*)"[^>]*>[\s\S]*?<\/w:fldSimple>/gi)){ const target=bookmarksRaw.find(b=>b.name===m[2]); if(target) importedCrossReferences.push({id:`xref-${importedCrossReferences.length+1}`,name:m[2],targetId:target.blockId,sourceBlockId,display:'label'}); } });
    const importedIndexEntries:any[]=[]; paragraphXml.forEach((pxml,idx)=>{ const blockId=`p${idx+1}`; for(const fm of pxml.matchAll(/<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>[\s\S]*?<\/w:fldSimple>/gi)){ const instr=decode(fm[1]); const match=/\bXE\s+"([^"]+)"/i.exec(instr); if(!match) continue; const parts=match[1].split(':'); importedIndexEntries.push({id:`index-${importedIndexEntries.length+1}`,term:parts[0].trim(),subentry:parts.slice(1).join(':').trim()||undefined,blockId}); } });
    const importedCitations:any[]=[]; const importedCitationSources:any[]=[]; paragraphXml.forEach((pxml,idx)=>{ const blockId=`p${idx+1}`; for(const m of pxml.matchAll(/<w:fldSimple[^>]*w:instr="([^"]*\bCITATION\s+([^\s\\]+)[^"]*)"[^>]*>([\s\S]*?)<\/w:fldSimple>/gi)){ const sourceId=decode(m[2]); const display=decode(([...m[3].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join(''))||''); const id=sourceId||`citation-${importedCitations.length+1}`; importedCitations.push({id:sourceId||id,source:sourceId||display||'Imported source',sourceId:sourceId||id,blockId,display}); if(!importedCitationSources.some((x:any)=>x.id===id)) importedCitationSources.push({id,type:'other',title:display||'Imported source'}); } });
    // Rehydrate modern threaded comment metadata. Reply comments are stored in comments.xml
    // as independent comments and linked through commentsExtended.xml paraId/paraIdParent.
    const importedByParaId:any={};
    for(const c of importedComments){ if(c.__docxParaId) importedByParaId[c.__docxParaId]=c; }
    for(const [cid,c] of Object.entries(commentById) as any){
      if(!c.parentParaId) continue;
      const parent=importedByParaId[c.parentParaId]; if(!parent) continue;
      parent.replies ??=[];
      parent.replies.push({id:`reply-${cid}`,text:c.text,authorName:c.author,createdAt:c.createdAt||new Date().toISOString(),resolved:Boolean(c.resolved)});
    }
    for(const c of importedComments){ delete c.__docxParaId; delete c.__docxParentParaId; }
    // Restore the original body order. Paragraphs and tables are parsed separately for
    // feature extraction, so an explicit source-offset sort prevents tables from
    // being appended after all paragraphs during DOCX -> Writer import.
    blocks.sort((a:any,b:any)=>(blockSourceOffsets[a.id]??Number.MAX_SAFE_INTEGER)-(blockSourceOffsets[b.id]??Number.MAX_SAFE_INTEGER));
    const footnotes=Object.entries(footnoteTextById).map(([id,text],i)=>({id:`footnote-${id}`,marker:String(i+1),text,blockId:footnoteBlockIds[id]||blocks[0]?.id||'p1'}));
    const endnotes=Object.entries(endnoteTextById).map(([id,text],i)=>({id:`endnote-${id}`,marker:String(i+1),text,blockId:endnoteBlockIds[id]||blocks[0]?.id||'p1'}));
    const preservation = await this.capturePreservation(z, 'docx');
    return {type:'WRITER',title:strip(filename),sourceFormat:'docx',content:{schema:4,type:'WRITER',title:strip(filename),language:'mixed',_ooxmlPreservation:preservation,_ooxmlBridge:{hyperlinks:hyperlinkMap,bookmarks},page:{size:'CUSTOM',widthMm,heightMm,marginTopMm:pgMar?Math.round(Number(pgMar[1])*25.4/1440):20,marginRightMm:pgMar?Math.round(Number(pgMar[2])*25.4/1440):20,marginBottomMm:pgMar?Math.round(Number(pgMar[3])*25.4/1440):20,marginLeftMm:pgMar?Math.round(Number(pgMar[4])*25.4/1440):20,orientation:widthMm>heightMm?'landscape':'portrait',showPageNumbers:true},blocks:blocks.length?blocks:[{id:'p1',type:'paragraph',align:'start',runs:[{text:''}]}],bookmarks,footnotes,endnotes,sections:[{id:'section-1',columns:1,columnGapMm:8}],citations:importedCitations,citationSources:importedCitationSources,captions:importedCaptions,crossReferences:importedCrossReferences,indexEntries:importedIndexEntries,review:{trackChanges:importedChanges.length>0,comments:importedComments.slice(-500),changes:importedChanges.slice(-500),snapshots:[]}}};
  }

  private async importXlsx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const workbookXml=await this.required(z,'xl/workbook.xml').then(f=>f.async('string'));
    const definedNames:any[]=[...workbookXml.matchAll(/<definedName\s+([^>]*)>([\s\S]*?)<\/definedName>/g)].map(m=>{const attrs=m[1]||'';return {name:/\bname="([^"]+)"/.exec(attrs)?.[1]||'',localSheetId:/\blocalSheetId="(\d+)"/.exec(attrs)?.[1]!==undefined?Number(/\blocalSheetId="(\d+)"/.exec(attrs)![1]):undefined,formula:decodeXml(m[2])};}).filter((x:any)=>x.name);
    const stylesXml=z.file('xl/styles.xml')?await z.file('xl/styles.xml')!.async('string'):''; const xlsxStyles=parseXlsxStyles(stylesXml);
    const relXml=z.file('xl/_rels/workbook.xml.rels')?await z.file('xl/_rels/workbook.xml.rels')!.async('string'):'';
    const rels:Record<string,string>={}; for(const m of relXml.matchAll(/<Relationship\s+([^>]*)\/>/g)){const id=/Id="([^"]+)"/.exec(m[1])?.[1],target=/Target="([^"]+)"/.exec(m[1])?.[1];if(id&&target)rels[id]=target.startsWith('/')?target.slice(1):`xl/${target.replace(/^\//,'')}`;}
    const shared=z.file('xl/sharedStrings.xml');
    const strings=shared?[...((await shared.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g))].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join('')):[];
    const workbookSheets=[...workbookXml.matchAll(/<sheet\s+([^>]*)\/>/g)].map(m=>({name:decode(/name="([^"]*)"/.exec(m[1])?.[1]||'Sheet'),rid:/r:id="([^"]+)"/.exec(m[1])?.[1]||'',sheetId:/sheetId="(\d+)"/.exec(m[1])?.[1]||'1'}));
    const sheets:any[]=[];
    for(let si=0;si<Math.min(workbookSheets.length,50);si++){
      const meta=workbookSheets[si],path=rels[meta.rid]||`xl/worksheets/sheet${Number(meta.sheetId)||si+1}.xml`,file=z.file(path);if(!file)continue;
      const xml=await file.async('string'),cells:any={};
      const pane=/<pane[^>]*topLeftCell="([A-Z]+\d+)"[^>]*?(?:xSplit="(\d+)"[^>]*ySplit="(\d+)"|ySplit="(\d+)"[^>]*xSplit="(\d+)")?/.exec(xml);
      const frozenRows=Number(pane?.[3]||pane?.[2]||0)||0,frozenColumns=Number(pane?.[5]||pane?.[1]&&0)||0;
      const columnWidths:any={},rowHeights:any={};
      for(const cm of xml.matchAll(/<col\s+([^>]*)\/>/g)){const a=cm[1],min=Number(/min="(\d+)"/.exec(a)?.[1]||0),max=Number(/max="(\d+)"/.exec(a)?.[1]||min),width=Number(/width="([\d.]+)"/.exec(a)?.[1]||0);if(min&&width)for(let c=min;c<=Math.min(max,100);c++)columnWidths[col(c-1)]=Math.round(width*8);}
      for(const rm of xml.matchAll(/<row\s+([^>]*)>([\s\S]*?)<\/row>/g)){const a=rm[1],body=rm[2],rn=Number(/r="(\d+)"/.exec(a)?.[1]||0);const h=Number(/ht="([\d.]+)"/.exec(a)?.[1]||0);if(rn&&h)rowHeights[rn-1]=Math.round(h*1.333);for(const cm of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)){const ca=cm[1],cb=cm[2],ref=/r="([A-Z]+\d+)"/.exec(ca)?.[1];if(!ref)continue;const type=/t="([^"]+)"/.exec(ca)?.[1],formula=/<f[^>]*>([\s\S]*?)<\/f>/.exec(cb)?.[1],v=/<v>([\s\S]*?)<\/v>/.exec(cb)?.[1];let value:any='';if(type==='s')value=strings[Number(v)||0]??'';else if(type==='inlineStr')value=[...cb.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join('');else if(type==='b')value=v==='1';else if(type==='e')value=decode(v||'');else if(v!==undefined&&v!=='')value=Number(v);const styleId=Number(/s="(\d+)"/.exec(ca)?.[1]||0);cells[ref]={value:formula?value:value, ...(formula?{formula:'='+decodeXml(formula)}:{}), ...(styleId?{format:xlsxStyles[styleId]||undefined}: {})};}}
      const mergeRefs=[...xml.matchAll(/<mergeCell\s+ref="([A-Z]+\d+:[A-Z]+\d+)"\s*\/>/g)].map(m=>{const [start,end]=m[1].split(':');return {start,end}});
      const autoFilter=/<autoFilter[^>]*ref="([A-Z]+\d+:[A-Z]+\d+)"/.exec(xml)?.[1];
      const validations:any[]=[]; for(const vm of xml.matchAll(/<dataValidation\s+([^>]*)>([\s\S]*?)<\/dataValidation>/g)){const a=vm[1],body=vm[2]; const sqref=/sqref="([^"]+)"/.exec(a)?.[1]; if(!sqref) continue; validations.push({type:/type="([^"]+)/.exec(a)?.[1]||'list',operator:/operator="([^"]+)/.exec(a)?.[1],allowBlank:/allowBlank="1"/.test(a),formula1:decodeXml(/<formula1>([\s\S]*?)<\/formula1>/.exec(body)?.[1]||''),formula2:decodeXml(/<formula2>([\s\S]*?)<\/formula2>/.exec(body)?.[1]||''),range:sqref});}
      const conditionalFormatting:any[]=[]; for(const cm of xml.matchAll(/<conditionalFormatting\s+sqref="([^"]+)"[\s\S]*?<cfRule\s+([^>]*)>([\s\S]*?)<\/cfRule>[\s\S]*?<\/conditionalFormatting>/g)){conditionalFormatting.push({range:cm[1],type:/type="([^"]+)/.exec(cm[2])?.[1]||'expression',operator:/operator="([^"]+)/.exec(cm[2])?.[1],formula:[...cm[3].matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map(x=>decode(x[1]))});}
      const tables:any[]=[];
      const tableParts=[...xml.matchAll(/<tablePart[^>]*r:id="([^"]+)"/g)].map(m=>m[1]);
      if(tableParts.length){
        const relPath=`xl/worksheets/_rels/sheet${si+1}.xml.rels`, relXml2=z.file(relPath)?await z.file(relPath)!.async('string'):'';
        for(const rid of tableParts){
          const target=new RegExp(`<Relationship\\b[^>]*Id="${escapeRegExp(rid)}"[^>]*Target="([^"]+)"`).exec(relXml2)?.[1]; if(!target) continue;
          const tablePath=this.resolveRelationshipTarget(`xl/worksheets/sheet${si+1}.xml`,target), tf=z.file(tablePath); if(!tf) continue;
          const tx=await tf.async('string'), attrs=/<table\s+([^>]*)>/i.exec(tx)?.[1]||'', ref=/\bref="([^"]+)"/.exec(attrs)?.[1]; if(!ref) continue;
          const name=/\bdisplayName="([^"]+)"/.exec(attrs)?.[1]||/\bname="([^"]+)"/.exec(attrs)?.[1]||`Table${tables.length+1}`;
          const header=Number(/\bheaderRowCount="(\d+)"/.exec(attrs)?.[1]||1)>0, total=Number(/\btotalsRowCount="(\d+)"/.exec(attrs)?.[1]||0)>0;
          const styleAttrs=/<tableStyleInfo\s+([^>]*)\/>/i.exec(tx)?.[1]||'', styleName=/\bname="([^"]+)"/.exec(styleAttrs)?.[1]||'';
          tables.push({id:`table-import-${tables.length+1}`,name:decodeXml(name),start:ref.split(':')[0],end:ref.split(':')[1]||ref,hasHeader:header,totalRow:total,style:/Light9/i.test(styleName)?'minimal':/Light1/i.test(styleName)?'plain':'banded'});
        }
      }
      const charts:any[]=[];
      const drawingRid=/<drawing[^>]*r:id="([^"]+)"/.exec(xml)?.[1];
      if(drawingRid){
        const sheetRelsPath=`xl/worksheets/_rels/sheet${si+1}.xml.rels`; const sheetRelsXml=z.file(sheetRelsPath)?await z.file(sheetRelsPath)!.async('string'):'';
        const drawingTarget=new RegExp(`<Relationship\\b[^>]*Id="${drawingRid}"[^>]*Target="([^"]+)"`).exec(sheetRelsXml)?.[1];
        if(drawingTarget){
          const drawingPath=this.resolveRelationshipTarget(`xl/worksheets/sheet${si+1}.xml`,drawingTarget); const drawingXml=z.file(drawingPath)?await z.file(drawingPath)!.async('string'):'';
          const drawingRelsPath=drawingPath.replace(/([^/]+)$/,'_rels/$1.rels'); const drawingRels=z.file(drawingRelsPath)?await z.file(drawingRelsPath)!.async('string'):'';
          for(const dm of drawingXml.matchAll(/<xdr:graphicFrame[\s\S]*?<xdr:clientData[\s\S]*?<\/xdr:clientData>/g)){
            const body=dm[0]; const rid=/<a:graphicData[\s\S]*?<c:chart[^>]*r:id="([^"]+)"/.exec(body)?.[1]; if(!rid) continue;
            const target=new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(drawingRels)?.[1]; if(!target) continue;
            const chartPath=this.resolveRelationshipTarget(drawingPath,target); const chartXml=z.file(chartPath)?await z.file(chartPath)!.async('string'):'';
            const type=/<c:(barChart|lineChart|areaChart|pieChart|doughnutChart)\b/.exec(chartXml)?.[1]?.replace('Chart','')||'column';
            const title=/<c:title[\s\S]*?<a:t>([\s\S]*?)<\/a:t>[\s\S]*?<\/c:title>/.exec(chartXml)?.[1]||'Imported chart';
            const formula=/<c:f>([\s\S]*?)<\/c:f>/.exec(chartXml)?.[1]||''; const range=formula.split('!').pop()||'A1:B10'; const rr=range.replace(/^[^!]*!/,'').split(':');
            charts.push({id:`chart-import-${charts.length+1}`,type,title:decodeXml(title),rangeStart:rr[0]||'A1',rangeEnd:rr[1]||rr[0]||'B10',position:{row:2,col:2},width:520,height:300,legend:true,showLabels:false});
          }
        }
      }
      sheets.push({id:`sheet-${si+1}`,name:meta.name.slice(0,31)||`Sheet${si+1}`,cells,frozenRows,columnWidths,rowHeights,merges:mergeRefs,filters:autoFilter?{_range:autoFilter}:null,sort:null,charts,validations,conditionalFormatting,tables});
    }
    const preservation = await this.capturePreservation(z, 'xlsx');
    return {type:'SHEET',title:strip(filename),sourceFormat:'xlsx',content:{schema:5,type:'SHEET',title:strip(filename),_ooxmlPreservation:preservation,_ooxmlBridge:{definedNames},activeSheet:sheets[0]?.id||'sheet-1',sheets:sheets.length?sheets:[{id:'sheet-1',name:'Sheet1',cells:{}}]}};
  }

  private async importPptx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const pres=z.file('ppt/presentation.xml')?await z.file('ppt/presentation.xml')!.async('string'):'';
    const size=/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
    const cx=size?Number(size[1]):12192000, cy=size?Number(size[2]):6858000;
    const aspect=Math.abs(cx/cy-16/9)<0.12?'16:9':'4:3';
    const relXml=z.file('ppt/_rels/presentation.xml.rels')?await z.file('ppt/_rels/presentation.xml.rels')!.async('string'):'';
    const rels:Record<string,string>={};
    for(const m of relXml.matchAll(/<Relationship\s+([^>]*)\/?>(?:<\/Relationship>)?/g)){const id=/Id="([^"]+)"/.exec(m[1])?.[1],target=/Target="([^"]+)"/.exec(m[1])?.[1];if(id&&target)rels[id]=target.startsWith('/')?target.slice(1):this.resolveRelationshipTarget('ppt/presentation.xml',target);}
    const orderedRids=[...pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map(m=>m[1]);
    const slidePaths=orderedRids.map(r=>rels[r]).filter(Boolean).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
    const color=(body:string,tag='a:solidFill')=>{const m=new RegExp(`<${tag}>[\\s\\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"`).exec(body);return m?`#${m[1]}`:undefined};
    const geom=(body:string)=>{const o=/<a:off[^>]*x="(\d+)"[^>]*y="(\d+)"/.exec(body),e=/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);const sx=100/cx,sy=100/cy;return {x:o?Number(o[1])*sx:0,y:o?Number(o[2])*sy:0,width:e?Number(e[1])*sx:10,height:e?Number(e[2])*sy:10,rotation:(/<a:xfrm[^>]*rot="(-?\d+)"/.exec(body)?.[1]?Number(/<a:xfrm[^>]*rot="(-?\d+)"/.exec(body)![1])/60000:0)};};
    const textRuns=(body:string)=>[...body.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map(m=>{const b=m[1],t=[...b.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x=>decode(x[1])).join('');const rp=/<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>|<a:rPr([^>]*)\/>/.exec(b);const a=rp?.[1]||rp?.[3]||'';const fs=/\bsz="(\d+)"/.exec(a)?.[1];const f=/<a:latin[^>]*typeface="([^"]+)"/.exec(b)?.[1];const c=color(b);return {text:t,fontSize:fs?Number(fs)/100:undefined,fontFamily:f,color:c,bold:/\bb="(1|true)"/.test(a),italic:/\bi="(1|true)"/.test(a),underline:/\bu="sng|single"/.test(a)};});
    const slides=await Promise.all(slidePaths.slice(0,200).map(async(p,i)=>{
      const xml=await z.file(p)!.async('string');
      const elements:any[]=[]; let ei=0;
      const slideBg=color(xml,'p:bgPr');
      const spTree=/<p:spTree>([\s\S]*?)<\/p:spTree>/.exec(xml)?.[1]||'';
      for(const sm of spTree.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)){
        const body=sm[1]; const g=geom(body); const tx=/<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(body)?.[1];
        if(tx){
          const runs=textRuns(tx); const text=runs.map(r=>r.text).join(''); if(text){
          const first=runs[0]||{}; const algn=/<a:pPr[^>]*algn="(l|ctr|r|just)"/.exec(tx)?.[1];
          elements.push({id:`el-${i+1}-${++ei}`,type:'text',...g,x:Math.max(0,Math.min(100,g.x)),y:Math.max(0,Math.min(100,g.y)),width:Math.max(4,Math.min(100,g.width)),height:Math.max(4,Math.min(100,g.height)),text,fontSize:first.fontSize||20,fontFamily:first.fontFamily||'Arial',color:first.color||'#111827',bold:Boolean(first.bold),italic:Boolean(first.italic),underline:Boolean(first.underline),align:algn==='ctr'?'center':algn==='r'?'end':'start',textDirection:/(?:rtl|rightToLeft)\s*=\s*"(?:1|true)"/i.test(tx)?'rtl':'ltr'});
            continue;
          }
        }
        const prst=/<a:prstGeom[^>]*prst="([^"]+)"/.exec(body)?.[1]||'rect';
        const fill=color(body)||'#e2e8f0'; const line=color(body,'a:ln')||undefined;
        elements.push({id:`el-${i+1}-${++ei}`,type:'shape',...g,shape:/ellipse|oval|circle/i.test(prst)?'circle':'rect',fill,border:Boolean(line),borderColor:line,borderWidth:line?1:undefined});
      }
      for(const lm of spTree.matchAll(/<p:cxnSp>([\s\S]*?)<\/p:cxnSp>/g)){
        const body=lm[1],g=geom(body),line=color(body,'a:ln')||'#64748b';elements.push({id:`el-${i+1}-${++ei}`,type:'line',...g,color:line,borderColor:line,borderWidth:1});
      }
      const slideRelPath=p.replace(/([^/]+)$/,'_rels/$1.rels'); const slideRelXml=z.file(slideRelPath)?await z.file(slideRelPath)!.async('string'):'';
      for(const pm of xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)){
        const body=pm[0],rid=/<a:blip[^>]*r:embed="([^"]+)"/.exec(body)?.[1];if(!rid)continue;const target=new RegExp(`<Relationship\\b[^>]*Id="${escapeRegExp(rid)}"[^>]*Target="([^"]+)"`).exec(slideRelXml)?.[1];if(!target)continue;const imagePath=this.resolveRelationshipTarget(p,target);const imageFile=z.file(imagePath);if(!imageFile)continue;const imageBuf=await imageFile.async('nodebuffer');const ext=(imagePath.split('.').pop()||'png').toLowerCase();const g=geom(body);elements.push({id:`el-${i+1}-${++ei}`,type:'image',...g,src:`data:image/${ext==='jpg'||ext==='jpeg'?'jpeg':ext};base64,${imageBuf.toString('base64')}`,alt:'Imported image'});
      }
      // Native PPT tables: import cell text into Show's editable table matrix.
      for(const tm of xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)){
        const rows=[...tm[1].matchAll(/<a:tr[\s\S]*?>([\s\S]*?)<\/a:tr>/g)].map(r=>[...r[1].matchAll(/<a:tc[\s\S]*?>([\s\S]*?)<\/a:tc>/g)].map(c=>[...c[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x=>decode(x[1])).join('')));const g=geom(tm[0]);elements.push({id:`el-${i+1}-${++ei}`,type:'table',...g,rows});
      }
      // Chart relationship + cached values. The imported chart remains native Show chart data,
      // allowing it to be edited and later exported again without flattening to an image.
      for(const gm of slideRelXml.matchAll(/<Relationship\b[^>]*Type="([^"]*\/chart)"[^>]*Target="([^"]+)"/g)){
        const chartPath=this.resolveRelationshipTarget(p,gm[2]);const chartXml=z.file(chartPath)?await z.file(chartPath)!.async('string'):'';if(!chartXml)continue;
        const title=[...chartXml.matchAll(/<c:t>([\s\S]*?)<\/c:t>/g)].map(x=>decode(x[1]))[0]||'Imported chart';const categories=[...chartXml.matchAll(/<c:cat>[\s\S]*?<c:(?:strCache|numCache)[\s\S]*?<\/c:(?:strCache|numCache)>[\s\S]*?<\/c:cat>/g)].flatMap(m=>[...m[0].matchAll(/<c:pt[^>]*idx="\d+"[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/g)].map(x=>decode(x[1])));const series=[...chartXml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(sm=>({name:[...sm[1].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map(x=>decode(x[1]))[0]||'Series',values:[...sm[1].matchAll(/<c:val>[\s\S]*?<c:(?:numCache|strCache)[\s\S]*?<\/c:(?:numCache|strCache)>[\s\S]*?<\/c:val>/g)].flatMap(v=>[...v[0].matchAll(/<c:pt[^>]*idx="\d+"[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/g)].map(x=>Number(x[1])||0))}));
        const g=geom(xml); elements.push({id:`el-${i+1}-${++ei}`,type:'chart',x:g.x,y:g.y,width:g.width,height:g.height,chart:{type:/pieChart/.test(chartXml)?'pie':/doughnutChart/.test(chartXml)?'doughnut':/lineChart/.test(chartXml)?'line':/areaChart/.test(chartXml)?'area':'column',title,categories,series,legend:true,dataLabels:false,gridlines:true}});
      }
      // Speaker notes are stored in a separate notesSlide part. Preserve the visible text.
      let notes='';const nRid=[...xml.matchAll(/<p:extLst[\s\S]*?r:id="([^"]+)"/g)].map(m=>m[1])[0];
      const notesRelPath=p.replace(/ppt\/slides\/slide(\d+)\.xml/, 'ppt/slides/_rels/slide$1.xml.rels'); const notesRel=z.file(notesRelPath)?await z.file(notesRelPath)!.async('string'):'';const notesTarget=/Type="[^"]*\/notesSlide"[^>]*Target="([^"]+)"/.exec(notesRel)?.[1];if(notesTarget){const np=this.resolveRelationshipTarget(p,notesTarget),nf=z.file(np);if(nf){const nx=await nf.async('string');notes=[...nx.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1])).join(' ').trim();}}
      const layout=elements.some(e=>e.type==='text'&&e.y<30)?(elements.filter(e=>e.type==='text').length>1?'title-content':'title'):'blank';
      const tr=/<p:transition[^>]*>([\s\S]*?)<\/p:transition>/.exec(xml)?.[1]||'';
      const transitionMatch=/<p:(fade|push|wipe|split|cover|uncover|zoom)\b/.exec(tr);
      const transition=transitionMatch?.[1]||'none';
      const speed=/<p:transition[^>]*spd="(fast|med|slow)"/.exec(xml)?.[1];
      const transitionDuration=speed==='fast'?400:speed==='slow'?1800:900;
      return {id:`slide-${i+1}`,layout:layout as any,background:slideBg||'#ffffff',elements,notes,transition,transitionDuration};
    }));
    const preservation=await this.capturePreservation(z,'pptx');
    const diagnostics:ConversionDiagnostic[]=[];
    diagnostics.push({code:'PPTX_SLIDES_CORE',severity:'info',message:`Imported ${slides.length} slide(s) with native slide order, text, shapes, images, tables and chart data where present.`});
    const noteCount=slides.filter(s=>s.notes).length;if(noteCount)diagnostics.push({code:'PPTX_NOTES',severity:'info',message:`Imported speaker notes from ${noteCount} slide(s).`});
    const chartCount=slides.reduce((n,s)=>n+s.elements.filter((e:any)=>e.type==='chart').length,0);if(chartCount)diagnostics.push({code:'PPTX_CHARTS',severity:'info',message:`Imported ${chartCount} chart object(s) using cached PPTX chart data.`});
    const unsupported=pres.match(/<p:timing\b|<p:transition\b/g)?.length||0;if(unsupported)diagnostics.push({code:'PPTX_MOTION',severity:'warning',message:'Animation/transition timing metadata was detected; visual/content import is preserved but timing is not yet fully mapped to the native Show timeline.'});
    return {type:'SHOW',title:strip(filename),sourceFormat:'pptx',diagnostics,content:{schema:7,type:'SHOW',title:strip(filename),_ooxmlPreservation:preservation,aspectRatio:aspect,activeSlide:slides[0]?.id||'slide-1',theme:{fontFamily:'Arial',accent:'#2563eb',secondary:'#64748b',background:'#ffffff',headingFont:'Arial'},masters:[{id:'master-default',name:'Default',background:'#ffffff',elements:[]}],sections:[],presenter:{showTimer:true,showNotes:true,showNextSlide:true,rehearsalSeconds:0,loop:false,blackoutOnEnd:false},slides:slides.length?slides:[{id:'slide-1',layout:'blank',background:'#fff',elements:[]}]}};
  }

  private async exportDocx(d:any){
    const z=new JSZip(), mediaRels:string[]=[]; let mediaIndex=0; let hasLists=false;
    const reviewComments=Array.isArray(d?.review?.comments)?d.review.comments.filter((c:any)=>c&&!c.deleted&&c.text):[];
    const reviewChanges=Array.isArray(d?.review?.changes)?d.review.changes.filter((c:any)=>c&&c.status==='pending'):[];
    const commentsByBlock=new Map<string,any[]>();
    const commentExportEntries:any[]=[]; let nextCommentId=1;
    const paraIdFor=(seed:string)=>{ let h=0; for(let i=0;i<seed.length;i++) h=((h<<5)-h+seed.charCodeAt(i))|0; return (Math.abs(h)>>>0).toString(16).padStart(8,'0').slice(0,8); };
    reviewComments.forEach((c:any)=>{
      c.__docxId=nextCommentId++; c.__docxParaId=paraIdFor(String(c.id||c.__docxId)); c.__docxParentParaId=undefined;
      commentExportEntries.push({kind:'root',comment:c});
      const key=String(c.blockId||''); if(!commentsByBlock.has(key)) commentsByBlock.set(key,[]); commentsByBlock.get(key)!.push(c);
      for(const r of Array.isArray(c.replies)?c.replies:[]){ const reply={...r,blockId:c.blockId,__docxId:nextCommentId++,__docxParaId:paraIdFor(`${c.id}:${r.id}`),__docxParentParaId:c.__docxParaId,parentCommentId:c.id}; commentExportEntries.push({kind:'reply',comment:reply,parent:c}); }
    });
    const changesByBlock=new Map<string,any[]>(); for(const c of reviewChanges){const key=String(c.blockId||''); if(!changesByBlock.has(key)) changesByBlock.set(key,[]); changesByBlock.get(key)!.push(c);}
    const footnotes=Array.isArray(d?.footnotes)?d.footnotes.filter((x:any)=>x&&x.text):[];
    const endnotes=Array.isArray(d?.endnotes)?d.endnotes.filter((x:any)=>x&&x.text):[];
    const footnotesByBlock=new Map<string,Array<{id:number;marker:string;text:string}>>();
    const endnotesByBlock=new Map<string,Array<{id:number;marker:string;text:string}>>();
    footnotes.forEach((f:any,i:number)=>{const key=String(f.blockId||'');if(!footnotesByBlock.has(key))footnotesByBlock.set(key,[]);footnotesByBlock.get(key)!.push({id:i+1,marker:String(f.marker||i+1),text:String(f.text||'')});});
    endnotes.forEach((f:any,i:number)=>{const key=String(f.blockId||'');if(!endnotesByBlock.has(key))endnotesByBlock.set(key,[]);endnotesByBlock.get(key)!.push({id:i+1,marker:String(f.marker||i+1),text:String(f.text||'')});});
    const bookmarkByBlock=new Map<string,string>();
    for(const b of (d?.bookmarks||[])){ if(b?.blockId && b?.name) bookmarkByBlock.set(String(b.blockId),String(b.name).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,120)); }
    const crossRefBySource=new Map<string,{name:string;targetId:string;display:string;bookmark?:string}>();
    for(const r of (d?.crossReferences||[])){ if(!r?.targetId||!r?.name) continue; const targetBookmark=bookmarkByBlock.get(String(r.targetId)); const source=String(r.sourceBlockId||r.targetId); crossRefBySource.set(source,{name:String(r.name),targetId:String(r.targetId),display:String(r.display||'label'),bookmark:targetBookmark}); }
    const citationsByBlock=new Map<string,any[]>(); for(const citation of (d?.citations||[])){ if(!citation) continue; const key=String(citation.blockId||''); if(!citationsByBlock.has(key)) citationsByBlock.set(key,[]); citationsByBlock.get(key)!.push(citation); }
    const indexEntriesByBlock=new Map<string,any[]>(); for(const entry of (d?.indexEntries||[])){ if(!entry?.blockId||!entry?.term) continue; const key=String(entry.blockId); if(!indexEntriesByBlock.has(key)) indexEntriesByBlock.set(key,[]); indexEntriesByBlock.get(key)!.push(entry); }
    const captionsByBlock=new Map<string,any[]>(); for(const caption of (d?.captions||[])){ if(!caption?.blockId) continue; const key=String(caption.blockId); if(!captionsByBlock.has(key)) captionsByBlock.set(key,[]); captionsByBlock.get(key)!.push(caption); }
    const hyperlinkIds=new Map<string,string>(); let hyperlinkIndex=0;
    for(const b of (d.blocks||[])){ for(const r of (b.runs||[])){ if(r?.href && /^https?:\/\//i.test(String(r.href)) && !hyperlinkIds.has(String(r.href))) hyperlinkIds.set(String(r.href),`rIdLink${++hyperlinkIndex}`); } if(b.table?.rows) for(const row of b.table.rows) for(const c of row||[]) for(const r of c?.runs||[]) if(r?.href && /^https?:\/\//i.test(String(r.href)) && !hyperlinkIds.has(String(r.href))) hyperlinkIds.set(String(r.href),`rIdLink${++hyperlinkIndex}`); }
    const blocks=(d.blocks||[]).map((b:any)=>{
      if(b.type==='image' && b.image?.src){
        const relId=`rIdMedia${++mediaIndex}`; const parsed=dataUri(b.image.src); if(parsed){z.file(`word/media/image${mediaIndex}.${parsed.ext}`,parsed.buffer); mediaRels.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${mediaIndex}.${parsed.ext}"/>`); const cx=Math.round((Number(b.image.width)||160)*9525),cy=Math.round((Number(b.image.height)||90)*9525); const imageCaption=(d?.captions||[]).filter((c:any)=>String(c?.blockId||'')===String(b.id)).map((c:any)=>`<w:fldSimple w:instr=" SEQ ${esc(String(c.label||'Figure'))} \\* ARABIC "><w:r><w:t>${esc(String(c.text||`${c.label||'Figure'} ${c.number||1}`))}</w:t></w:r></w:fldSimple>`).join(''); return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>${imageCaption}</w:p>`; }
      }
      if(b.type==='table' && b.table?.rows){const headerRows=Math.max(0,Math.min(Number(b.table.headerRows)||0,b.table.rows.length));const repeat=Boolean(b.table.repeatHeaderRow);const rows=b.table.rows.map((row:any[],rowIndex:number)=>{const headerPr=repeat&&rowIndex<headerRows?'<w:trPr><w:tblHeader/></w:trPr>':'';return `<w:tr>${headerPr}${row.map((cell:any)=>`<w:tc><w:p>${runsXml(cell.runs||[],'start',hyperlinkIds)}</w:p></w:tc>`).join('')}</w:tr>`;}).join('');return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;}
      const pStyle=b.type==='heading1'?'Heading1':b.type==='heading2'?'Heading2':b.type==='heading3'?'Heading3':undefined;
      if(b.type==='list-item') hasLists=true;
      const directionPr=b.direction==='rtl'?'<w:bidi/>':b.direction==='ltr'?'<w:bidi w:val="0"/>':'';
      const pPr=`<w:pPr>${pStyle?`<w:pStyle w:val="${pStyle}"/>`:''}${b.type==='list-item'?`<w:numPr><w:ilvl w:val="${Math.max(0,Number(b.listLevel)||0)}"/><w:numId w:val="${b.ordered?2:1}"/></w:numPr>`:''}${directionPr}<w:jc w:val="${b.align==='center'?'center':b.align==='end'?'right':b.align==='justify'?'both':'left'}"/>${b.pageBreakBefore?'<w:pageBreakBefore/>':''}</w:pPr>`;
      const footnotesForBlock=footnotesByBlock.get(String(b.id))||[];
      const endnotesForBlock=endnotesByBlock.get(String(b.id))||[];
      const runs=Array.isArray(b.runs)?b.runs.map((r:any)=>({...r})):[];
      if(footnotesForBlock.length && runs.length){ const last=runs[runs.length-1]; if(typeof last.text==='string') for(const note of footnotesForBlock) last.text=last.text.replace(new RegExp('\\s*\\['+escapeRegExp(note.marker)+'\\]$'),''); }
      const bookmark=bookmarkByBlock.get(String(b.id));
      const crossRef=crossRefBySource.get(String(b.id));
      const bookmarkStart=bookmark?`<w:bookmarkStart w:id="${bookmarkHash(bookmark)}" w:name="${esc(bookmark)}"/>`:'';
      const bookmarkEnd=bookmark?`<w:bookmarkEnd w:id="${bookmarkHash(bookmark)}"/>`:'';
      const footnoteRef=footnotesForBlock.map(note=>`<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${note.id}"/></w:r>`).join('');
      const endnoteRef=endnotesForBlock.map(note=>`<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="${note.id}"/></w:r>`).join('');
      const crossField=crossRef?.bookmark?`<w:fldSimple w:instr=" REF ${esc(crossRef.bookmark)} \\h "><w:r><w:t>${esc(`[${crossRef.name}]`)}</w:t></w:r></w:fldSimple>`:'';
      const tocField=b.type==='toc'?`<w:fldSimple w:instr="${esc(' TOC \\o "1-3" \\h \\z \\u ')}"><w:r><w:t>Table of Contents</w:t></w:r></w:fldSimple>`:'';
      const indexField=b.type==='index'?`<w:fldSimple w:instr="${esc(' INDEX \\h ')}"><w:r><w:t>Index</w:t></w:r></w:fldSimple>`:'';
      const indexFields=(indexEntriesByBlock.get(String(b.id))||[]).map((entry:any)=>{ const term=String(entry.term); const sub=entry.subentry?`:${String(entry.subentry)}`:''; const instruction=` XE "${term}${sub}" \\f "a" `; return `<w:fldSimple w:instr="${esc(instruction)}"><w:r><w:t>${esc(String(entry.term))}</w:t></w:r></w:fldSimple>`; }).join('');
      const bibliographyField=b.type==='bibliography'?`<w:fldSimple w:instr="${esc(' BIBLIOGRAPHY \\l "1033" ')}"><w:r><w:t>Bibliography</w:t></w:r></w:fldSimple>`:'';
      const citationFields=(citationsByBlock.get(String(b.id))||[]).map((citation:any)=>{ const id=String(citation.id||citation.source||'source'); const display=String(citation.author||citation.title||citation.source||id); const instruction=` CITATION ${id} \\l "1033" `; return `<w:fldSimple w:instr="${esc(instruction)}"><w:r><w:t>${esc(display)}</w:t></w:r></w:fldSimple>`; }).join('');
      const captionFields=(captionsByBlock.get(String(b.id))||[]).map((caption:any)=>{ const label=String(caption.label||'Figure'); const number=String(caption.number||'1'); const text=String(caption.text||`${label} ${number}`); return `<w:fldSimple w:instr=" SEQ ${esc(label)} \\* ARABIC "><w:r><w:t>${esc(text)}</w:t></w:r></w:fldSimple>`; }).join('');
      const commentList=commentsByBlock.get(String(b.id))||[]; let commentStarts='',commentEnds='',commentXmlParts='';
      commentList.forEach((c:any)=>{const cid=Number(c.__docxId)||1; commentStarts+=`<w:commentRangeStart w:id="${cid}"/>`; commentEnds=`<w:commentRangeEnd w:id="${cid}"/>${commentEnds}`;});
      let bodyRuns=runsXml(runs,b.align||'start',hyperlinkIds);
      const pending=changesByBlock.get(String(b.id))||[];
      for(const c of pending){
        const changeId=Math.abs(bookmarkHash(String(c.id)));
        const author=esc(String(c.authorName||'IMKAN User'));
        const date=esc(String(c.createdAt||new Date().toISOString()));
        const before=Array.isArray(c.before)?c.before:[];
        const after=Array.isArray(c.after)?c.after:[];
        if(c.kind==='insert' && after.length){
          const base=before.length?runsXml(before,b.align||'start',hyperlinkIds):'';
          const inserted=runsXml(after,b.align||'start',hyperlinkIds);
          bodyRuns=base+`<w:ins w:id="${changeId}" w:author="${author}" w:date="${date}">${inserted}</w:ins>`;
        } else if(c.kind==='delete' && before.length){
          const deleted=runsXml(before,b.align||'start',hyperlinkIds).replace(/<w:t /g,'<w:delText ').replace(/<w:t>/g,'<w:delText>');
          const base=after.length?runsXml(after,b.align||'start',hyperlinkIds):'';
          bodyRuns=`<w:del w:id="${changeId}" w:author="${author}" w:date="${date}">${deleted}</w:del>`+base;
        } else if(c.kind==='format' && (before.length || after.length)){
          const baseRuns=after.length?after:before;
          const beforeRun=before[0]||{};
          const afterRun=after[0]||{};
          const beforePr=runPropertiesXml(beforeRun);
          const afterPr=runPropertiesXml(afterRun);
          const changedRuns=runsXml(baseRuns,b.align||'start',hyperlinkIds);
          const revPr=`<w:rPrChange w:id="${changeId}" w:author="${author}" w:date="${date}"><w:rPr>${beforePr}</w:rPr></w:rPrChange>`;
          bodyRuns=changedRuns.replace(/<w:rPr>/, `<w:rPr>${afterPr}${revPr}`);
        }
      }
      return `<w:p>${pPr}${bookmarkStart}${commentStarts}${bodyRuns}${crossField}${tocField}${indexField}${indexFields}${bibliographyField}${citationFields}${captionFields}${footnoteRef}${endnoteRef}${commentEnds}${bookmarkEnd}</w:p>`;
    }).join('');
    const page=d.page||{}; const width=Math.round((Number(page.widthMm)||210)*1440/25.4),height=Math.round((Number(page.heightMm)||297)*1440/25.4),mt=Math.round((Number(page.marginTopMm)||20)*1440/25.4),mr=Math.round((Number(page.marginRightMm)||20)*1440/25.4),mb=Math.round((Number(page.marginBottomMm)||20)*1440/25.4),ml=Math.round((Number(page.marginLeftMm)||20)*1440/25.4);
    const header=typeof page.header==='string'&&page.header?`<w:headerReference w:type="default" r:id="rId2"/>`:''; const footer=typeof page.footer==='string'&&page.footer?`<w:footerReference w:type="default" r:id="rId3"/>`:'';
    z.file('[Content_Types].xml',contentTypes('wordprocessingml.document',!!header,!!footer,mediaIndex>0,hasLists,footnotes.length>0,endnotes.length>0,reviewComments.length>0,reviewComments.some((c:any)=>Array.isArray(c.replies)&&c.replies.length>0))); z.file('_rels/.rels',rootRels('wordprocessingml.document'));
    const relsXml:string[]=[]; if(hasLists)relsXml.push(`<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`); if(header)relsXml.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`);if(footer)relsXml.push(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`);if(footnotes.length)relsXml.push(`<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>`); if(endnotes.length)relsXml.push(`<Relationship Id="rIdEndnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`); if(reviewComments.length) { relsXml.push(`<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`); if(reviewComments.some((c:any)=>Array.isArray(c.replies)&&c.replies.length>0 || c.resolved)) relsXml.push(`<Relationship Id="rIdCommentsExtended" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>`); } relsXml.push(...mediaRels); for(const [href,id] of hyperlinkIds) relsXml.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`);
    z.file('word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsXml.join('')}</Relationships>`);
    if(hasLists) z.file('word/numbering.xml',`<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`); z.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${blocks||'<w:p><w:r><w:t></w:t></w:r></w:p>'}<w:sectPr>${header}${footer}<w:pgSz w:w="${width}" w:h="${height}"/><w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="${mb}" w:left="${ml}"/></w:sectPr></w:body></w:document>`);
    if(header)z.file('word/header1.xml',`<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${esc(page.header)}</w:t></w:r></w:p></w:hdr>`);if(footer)z.file('word/footer1.xml',`<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${esc(page.footer)}</w:t></w:r></w:p></w:ftr>`);
    if(footnotes.length){ const items=footnotes.map((f:any,i:number)=>`<w:footnote w:id="${i+1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${esc(String(f.text||''))}</w:t></w:r></w:p></w:footnote>`).join(''); z.file('word/footnotes.xml',`<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="-2"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${items}</w:footnotes>`); }
    if(endnotes.length){ const items=endnotes.map((f:any,i:number)=>`<w:endnote w:id="${i+1}"><w:p><w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${esc(String(f.text||''))}</w:t></w:r></w:p></w:endnote>`).join(''); z.file('word/endnotes.xml',`<?xml version="1.0" encoding="UTF-8"?><w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:type="continuationSeparator" w:id="-2"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>${items}</w:endnotes>`); }
    if(reviewComments.length){ const items=commentExportEntries.map((entry:any)=>{const c=entry.comment; return `<w:comment w:id="${Number(c.__docxId)||1}" w:author="${esc(String(c.authorName||'IMKAN User'))}" w:date="${esc(String(c.createdAt||new Date().toISOString()))}"><w:p w14:paraId="${c.__docxParaId}"><w:r><w:t xml:space="preserve">${esc(String(c.text||''))}</w:t></w:r></w:p></w:comment>`;}).join(''); z.file('word/comments.xml',`<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">${items}</w:comments>`); const needsExtended=commentExportEntries.some((entry:any)=>entry.kind==='reply' || Boolean(entry.comment.resolved)); if(needsExtended){ const ext=commentExportEntries.map((entry:any)=>{const c=entry.comment; return `<w15:commentEx w15:paraId="${c.__docxParaId}"${c.__docxParentParaId?` w15:paraIdParent="${c.__docxParentParaId}"`:''}${c.resolved?' w15:done="1"':' w15:done="0"'}/>`;}).join(''); z.file('word/commentsExtended.xml',`<?xml version="1.0" encoding="UTF-8"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">${ext}</w15:commentsEx>`); } }
    this.restorePreservation(z, d?._ooxmlPreservation); await this.mergePreservedRelationships(z, d?._ooxmlPreservation);
    return z.generateAsync({type:'nodebuffer'});
  }

  private async exportXlsx(d:any){
    const z=new JSZip(),sheets=(d.sheets||[]).slice(0,50),styles=buildXlsxStyles(); const sheetRels:string[]=[]; const sheetExtraRels:Record<number,string[]>={};
    sheets.forEach((s:any,i:number)=>{const rows:Record<number,string[]>={};for(const [ref,c] of Object.entries(s.cells||{}) as any){const m=/^([A-Z]+)(\d+)$/i.exec(ref);if(!m)continue;const r=Number(m[2]);(rows[r]??=[]).push(xlsxCell(ref,c,styles));}
      const rowXml=Object.keys(rows).map(Number).sort((a,b)=>a-b).map(r=>{const h=s.rowHeights?.[r-1];return `<row r="${r}"${h?` ht="${(Number(h)/1.333).toFixed(2)}" customHeight="1"`:''}>${rows[r].join('')}</row>`}).join('');
      const cols=Object.entries(s.columnWidths||{}).map(([name,w]:any)=>{const idx=colIndexLocal(name)+1;return `<col min="${idx}" max="${idx}" width="${(Number(w)/8).toFixed(2)}" customWidth="1"/>`;}).join(''); const merges=(s.merges||[]).map((m:any)=>`<mergeCell ref="${esc(m.start)}:${esc(m.end)}"/>`).join(''); const freeze=(s.frozenRows||s.frozenColumns)?`<sheetViews><sheetView workbookViewId="0"><pane${s.frozenColumns?` xSplit="${s.frozenColumns}"`:''}${s.frozenRows?` ySplit="${s.frozenRows}"`:''} topLeftCell="${cellRefLocal(s.frozenRows||0,s.frozenColumns||0)}" state="frozen"/></sheetView></sheetViews>`:''; const filter=s.filters?._range?`<autoFilter ref="${esc(s.filters._range)}"/>`:''; const validations=(s.validations||[]).map((v:any)=>`<dataValidation type="${esc(v.type||'list')}"${v.operator?` operator="${esc(v.operator)}"`:''}${v.allowBlank?' allowBlank="1"':''} sqref="${esc(v.range||'A1')}">${v.formula1?`<formula1>${esc(String(v.formula1))}</formula1>`:''}${v.formula2?`<formula2>${esc(String(v.formula2))}</formula2>`:''}</dataValidation>`).join(''); const validationXml=validations?`<dataValidations count="${(s.validations||[]).length}">${validations}</dataValidations>`:''; const cf=(s.conditionalFormatting||[]).map((c:any)=>`<conditionalFormatting sqref="${esc(c.range||'A1')}"><cfRule type="${esc(c.type||'expression')}"${c.operator?` operator="${esc(c.operator)}"`:''}>${(c.formula||[]).map((f:any)=>`<formula>${esc(String(f))}</formula>`).join('')}</cfRule></conditionalFormatting>`).join('');
      const tables=Array.isArray(s.tables)?s.tables.slice(0,100):[];
      const tableParts=tables.map((_:any,ti:number)=>`<tablePart r:id="rIdTable${i+1}_${ti+1}"/>`).join('');
      const tablePartsXml=tableParts?`<tableParts count="${tables.length}">${tableParts}</tableParts>`:'';
      z.file(`xl/worksheets/sheet${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols?`<cols>${cols}</cols>`:''}<sheetData>${rowXml}</sheetData>${merges?`<mergeCells count="${s.merges.length}">${merges}</mergeCells>`:''}${filter}${validationXml}${cf}${tablePartsXml}</worksheet>`);
      sheetRels.push(`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`);
      tables.forEach((t:any,ti:number)=>{
        const start=String(t.start||'A1'), end=String(t.end||start), sa=/^([A-Z]+)(\d+)$/i.exec(start), ea=/^([A-Z]+)(\d+)$/i.exec(end);
        const c0=sa?colIndexLocal(sa[1]):0, c1=ea?colIndexLocal(ea[1]):c0, row=sa?Number(sa[2]):1;
        const headers=Array.from({length:Math.max(1,c1-c0+1)},(_,k)=>String(s.cells?.[cellRefLocal(row-1,c0+k)]?.value??`Column${k+1}`).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
        const tableNo=`${i+1}_${ti+1}`, name=esc(String(t.name||`Table${ti+1}`));
        z.file(`xl/tables/table${tableNo}.xml`,`<?xml version="1.0" encoding="UTF-8"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${ti+1}" name="${name}" displayName="${name}" ref="${esc(start)}:${esc(end)}" headerRowCount="${t.hasHeader===false?0:1}" totalsRowCount="${t.totalRow?1:0}"><autoFilter ref="${esc(start)}:${esc(end)}"/><tableColumns count="${headers.length}">${headers.map((h:any,k:number)=>`<tableColumn id="${k+1}" name="${h}"/>`).join('')}</tableColumns><tableStyleInfo name="${t.style==='minimal'?'TableStyleLight9':t.style==='plain'?'TableStyleLight1':'TableStyleMedium2'}" showFirstColumn="0" showLastColumn="0" showRowStripes="${t.style==='banded'?'1':'0'}" showColumnStripes="0"/></table>`);
        (sheetExtraRels[i]??=[]).push(`<Relationship Id="rIdTable${i+1}_${ti+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tableNo}.xml"/>`);
      });
    });
    // Phase 26: materialize native charts into real XLSX drawing/chart parts.
    let chartNo=0;
    for(let i=0;i<sheets.length;i++){
      const s:any=sheets[i]; const charts=Array.isArray(s.charts)?s.charts:[]; if(!charts.length) continue;
      const drawingNo=i+1; const drawingRels:any[]=[]; const anchors:string[]=[];
      charts.slice(0,20).forEach((c:any,ci:number)=>{
        const num=++chartNo; const rid=`rIdChart${num}`; const chartPath=`../charts/chart${num}.xml`;
        const title=esc(String(c.title||`Chart ${ci+1}`)); const type=String(c.type||'column').toLowerCase();
        const range=esc(String(c.rangeStart||'A1')+':'+String(c.rangeEnd||'B10'));
        const chartTag=type==='line'?'lineChart':type==='pie'?'pieChart':type==='doughnut'?'doughnutChart':type==='bar'?'barChart':'barChart';
        const barDir=type==='bar'?'"barDir="bar""':'"barDir="col""';
        z.file(`xl/charts/chart${num}.xml`,`<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>${title}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:${chartTag}>${chartTag==='barChart'?`<c:barDir val="${type==='bar'?'bar':'col'}"/>`:''}<c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${title}</c:v></c:tx><c:cat><c:strRef><c:f>${range}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${range}</c:f></c:numRef></c:val></c:ser></c:${chartTag}><c:plotVisOnly val="1"/></c:plotArea></c:chart></c:chartSpace>`);
        drawingRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="${chartPath}"/>`);
        anchors.push(`<xdr:twoCellAnchor><xdr:from><xdr:col>${ci*5}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${ci*5+4}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="${ci+2}" name="Chart ${ci+1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame></xdr:twoCellAnchor>`);
      });
      z.file(`xl/drawings/drawing${drawingNo}.xml`,`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
      z.file(`xl/drawings/_rels/drawing${drawingNo}.xml.rels`,`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`);
      const sheetPath=`xl/worksheets/sheet${i+1}.xml`; const sf=z.file(sheetPath); if(sf){ const xml=await sf.async('string'); z.file(sheetPath,xml.replace('</worksheet>',`<drawing r:id="rIdDrawing${drawingNo}"/></worksheet>`)); }
      (sheetExtraRels[i]??=[]).push(`<Relationship Id="rIdDrawing${drawingNo}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`);
    }
    // Materialize table relationships together with any later drawing relationships.
    for(let i=0;i<sheets.length;i++){
      const relsXml=sheetExtraRels[i]||[];
      if(relsXml.length) z.file(`xl/worksheets/_rels/sheet${i+1}.xml.rels`,`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsXml.join('')}</Relationships>`);
    }
    z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({length:chartNo},(_,i)=>`<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}${sheets.flatMap((sh:any,si:number)=>(Array.isArray(sh.tables)?sh.tables.slice(0,100):[]).map((_:any,ti:number)=>`<Override PartName="/xl/tables/table${si+1}_${ti+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`)).join('')}<Default Extension="drawing" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`); z.file('_rels/.rels',rootRels('spreadsheetml.sheet'));z.file('xl/styles.xml',styles.xml); z.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s:any,i:number)=>`<sheet name="${esc(String(s.name||`Sheet${i+1}`).slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${Array.isArray(d?._ooxmlBridge?.definedNames)&&d._ooxmlBridge.definedNames.length?`<definedNames>${d._ooxmlBridge.definedNames.map((n:any)=>`<definedName name="${esc(n.name)}"${n.localSheetId!==undefined?` localSheetId="${n.localSheetId}"`:''}>${esc(String(n.formula||''))}</definedName>`).join('')}</definedNames>`:''}</workbook>`); z.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels.join('')}</Relationships>`); this.restorePreservation(z, d?._ooxmlPreservation); await this.mergePreservedRelationships(z, d?._ooxmlPreservation); return z.generateAsync({type:'nodebuffer'});
  }

  private async exportShowPdf(d:any):Promise<Buffer>{
    const slides=(Array.isArray(d?.slides)?d.slides:[]).slice(0,100);
    const wide=d?.aspectRatio!=='4:3';
    const pageW=wide?960:720, pageH=540;
    const objects:any[]=[];
    const pages:string[]=[];
    const imageObjects: {obj:number; data:Buffer; width:number; height:number; colorSpace:'DeviceRGB'|'DeviceGray'; filter:'DCTDecode'|'FlateDecode'}[]=[];
    let nextObj=3;
    const alloc=()=>nextObj++;
    const escPdf=(v:any)=>String(v??'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ');
    const rgb=(v:any, fallback=[0,0,0])=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(v||''));if(!m)return fallback;const n=parseInt(m[1],16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];};
    const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
    const pdfText=(text:string,x:number,y:number,size:number,color:any,bold=false,rtl=false)=>{
      const c=rgb(color,[0,0,0]); const safe=escPdf(text); const font=bold?'/F2':'/F1';
      const approxWidth=Math.max(1,safe.length*size*0.48); const tx=rtl?x+Math.min(approxWidth, pageW-x):x;
      return `${c[0].toFixed(4)} ${c[1].toFixed(4)} ${c[2].toFixed(4)} rg\nBT ${font} ${Math.max(4,size).toFixed(2)} Tf ${tx.toFixed(2)} ${(pageH-y-size).toFixed(2)} Td ${rtl?'1 0 0 1 0 0 Tm ':''}(${safe}) Tj ET\n`;
    };
    const rect=(x:number,y:number,w:number,h:number,fill:any,border:any,bw:number,opacityIgnored=true)=>{
      const f=rgb(fill,[1,1,1]), b=rgb(border,[0,0,0]);
      return `${f[0].toFixed(4)} ${f[1].toFixed(4)} ${f[2].toFixed(4)} rg ${x.toFixed(2)} ${(pageH-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n${b[0].toFixed(4)} ${b[1].toFixed(4)} ${b[2].toFixed(4)} RG ${Math.max(0,bw).toFixed(2)} w ${x.toFixed(2)} ${(pageH-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;
    };
    const line=(x:number,y:number,x2:number,y2:number,color:any,bw:number)=>{const c=rgb(color,[0,0,0]);return `${c[0].toFixed(4)} ${c[1].toFixed(4)} ${c[2].toFixed(4)} RG ${Math.max(.5,bw).toFixed(2)} w ${x.toFixed(2)} ${(pageH-y).toFixed(2)} m ${x2.toFixed(2)} ${(pageH-y2).toFixed(2)} l S\n`;};
    const addImage=(src:string)=>{
      const m=/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i.exec(src||''); if(!m)return null;
      const buf=Buffer.from(m[2],'base64');
      if(m[1].toLowerCase()!=='png'){
        const w=Number(buf.readUInt16BE(14)||1),h=Number(buf.readUInt16BE(16)||1); const obj=alloc(); imageObjects.push({obj,data:buf,width:w,height:h,colorSpace:'DeviceRGB',filter:'DCTDecode'}); return {obj,w,h};
      }
      // PNG: support non-interlaced 8-bit RGB/RGBA via PDF's PNG predictor. RGBA is reduced to RGB only when alpha is absent; otherwise it is flagged by caller.
      let off=8,w=0,h=0,bit=0,colorType=0,interlace=0; const ids:Buffer[]=[];
      while(off+8<=buf.length){const len=buf.readUInt32BE(off);const type=buf.toString('ascii',off+4,off+8);const data=buf.subarray(off+8,off+8+len);off+=12+len;if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);bit=data[8];colorType=data[9];interlace=data[12];}else if(type==='IDAT')ids.push(data);else if(type==='IEND')break;}
      if(!w||!h||bit!==8||interlace!==0||colorType!==2)return null;
      const obj=alloc(); const raw=Buffer.concat(ids); imageObjects.push({obj,data:raw,width:w,height:h,colorSpace:'DeviceRGB',filter:'FlateDecode'}); return {obj,w,h};
    };
    for(const slide of slides){
      let stream='1 1 1 rg 0 0 '+pageW+' '+pageH+' re f\n';
      if(/^#[0-9a-f]{6}$/i.test(String(slide?.background||''))){const c=rgb(slide.background,[1,1,1]);stream=`${c[0]} ${c[1]} ${c[2]} rg 0 0 ${pageW} ${pageH} re f\n`;}
      for(const e of (Array.isArray(slide?.elements)?slide.elements:[])){
        const x=num(e.x)/100*pageW,y=num(e.y)/100*pageH,w=num(e.width)/100*pageW,h=num(e.height)/100*pageH;
        if(e.type==='text'){
          const lines=String(e.text??'').split(/\r?\n/).slice(0,100); const fs=Math.max(6,Math.min(96,num(e.fontSize)||18));
          lines.forEach((t:string,i:number)=>{stream+=pdfText(t,x,y+i*(fs*1.25),fs,e.color||'#111827',!!e.bold,String(e.textDirection||'').toLowerCase()==='rtl');});
        } else if(e.type==='line'){stream+=line(x,y,x+w,y+h,e.borderColor||e.color||'#111827',num(e.borderWidth)||1);}
        else if(e.type==='image'){
          const im=addImage(String(e.src||''));
          if(im){stream+=`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(pageH-y-h).toFixed(2)} cm /Im${im.obj} Do Q\n`;}
          else stream+=rect(x,y,w,h,'#e5e7eb','#9ca3af',1);
        } else if(['video','audio'].includes(e.type)) stream+=rect(x,y,w,h,'#e5e7eb','#6b7280',1)+pdfText(e.type==='video'?'Video':'Audio',x+8,y+8,14,'#374151',true);
        else {
          const shape=String(e.shape||'roundRect');
          if(shape==='line') stream+=line(x,y,x+w,y+h,e.borderColor||'#111827',num(e.borderWidth)||1); else stream+=rect(x,y,w,h,e.fill||'#ffffff',e.borderColor||'#111827',num(e.borderWidth)||1);
        }
      }
      const contentObj=alloc(); pages.push(`PAGE|${contentObj}|${stream}`);
      objects.push(contentObj);
    }
    const font1=alloc(),font2=alloc(),pagesObj=1,catalogObj=2;
    const pageObjs:number[]=[];
    // Allocate page objects after knowing shared resource/image object numbers.
    for(const _ of pages) pageObjs.push(alloc());
    const maxObj=nextObj-1; const bodies:string[] = Array(maxObj+1).fill('');
    bodies[font1]=`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
    bodies[font2]=`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
    let idx=0;
    for(const marker of pages){const parts=marker.split('|');const contentObj=Number(parts[1]);const stream=parts.slice(2).join('|');bodies[contentObj]=`<< /Length ${Buffer.byteLength(stream,'utf8')} >>\nstream\n${stream}endstream`;const xobjs=imageObjects.length?` /XObject << ${imageObjects.map(im=>`/Im${im.obj} ${im.obj} 0 R`).join(' ')} >>`:'';bodies[pageObjs[idx]]= `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >>${xobjs} >> /Contents ${contentObj} 0 R >>`; idx++;}
    for(const im of imageObjects){const cs=im.colorSpace==='DeviceGray'?'DeviceGray':'DeviceRGB';bodies[im.obj]=`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /${cs} /BitsPerComponent 8 /Filter /${im.filter} /Length ${im.data.length} >>\nstream\n`+im.data.toString('binary')+'\nendstream';}
    bodies[pagesObj]=`<< /Type /Pages /Kids [${pageObjs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageObjs.length} >>`;
    bodies[catalogObj]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    let pdf='%PDF-1.4\n%IMKANPDF\n';const offsets:number[]=[];for(let i=1;i<=maxObj;i++){offsets[i]=Buffer.byteLength(pdf,'binary');pdf+=`${i} 0 obj\n${bodies[i]}\nendobj\n`;}
    const xref=Buffer.byteLength(pdf,'binary');pdf+=`xref\n0 ${maxObj+1}\n0000000000 65535 f \n`;for(let i=1;i<=maxObj;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${maxObj+1} /Root ${catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf,'binary');
  }

  private async exportPptx(d:any){
    const z=new JSZip();
    const slides=(Array.isArray(d?.slides)?d.slides:[]).slice(0,100);
    const wide=d?.aspectRatio!=='4:3';
    const cx=wide?12192000:9144000, cy=6858000;
    const theme=d?.theme||{};
    const accent=String(theme.accent||'#2563eb').replace('#','').toUpperCase();
    const secondary=String(theme.secondary||'#64748b').replace('#','').toUpperCase();
    const bg=String(theme.background||'#ffffff').replace('#','').toUpperCase();
    const headingFont=String(theme.headingFont||theme.fontFamily||'Arial');
    const bodyFont=String(theme.fontFamily||'Arial');
    const escXml=(v:any)=>esc(String(v??''));
    const pct=(v:any,total:number)=>Math.max(0,Math.min(total,Math.round((Number(v)||0)/100*total)));
    const safeColor=(v:any,fallback:string)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).slice(1).toUpperCase():fallback;
    const shapePreset=(e:any)=>{
      const shape=String(e?.shape||'roundRect');
      if(shape==='circle'||shape==='ellipse') return 'ellipse';
      if(shape==='triangle') return 'triangle';
      if(shape==='diamond') return 'diamond';
      if(shape==='hexagon') return 'hexagon';
      if(shape==='parallelogram') return 'parallelogram';
      if(shape==='line') return 'line';
      return 'roundRect';
    };
    const paraAlign=(v:any)=>v==='center'?'ctr':v==='end'?'r':v==='justify'?'just':'l';
    const textBody=(e:any)=>{
      const text=String(e?.text||'');
      const color=safeColor(e?.color,'000000');
      const size=Math.max(800,Math.round(Number(e?.fontSize||18)*100));
      const latin=escXml(e?.fontFamily||bodyFont);
      const bold=e?.bold?' b="1"':'';
      const italic=e?.italic?' i="1"':'';
      const underline=e?.underline?' u="sng"':'';
      const strike=e?.strike?' strike="sngStrike"':'';
      const rtl=e?.direction==='rtl'||e?.rtl?' rtl="1"':'';
      const lines=text.split(/\r?\n/);
      const paragraphs=lines.map((line:string)=>`<a:p><a:pPr algn="${paraAlign(e?.align)}"${rtl}/><a:r><a:rPr lang="${rtl?'ar-SA':'en-US'}" sz="${size}"${bold}${italic}${underline}${strike}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${latin}"/></a:rPr><a:t>${escXml(line)}</a:t></a:r><a:endParaRPr lang="${rtl?'ar-SA':'en-US'}" sz="${size}"/></a:p>`).join('');
      return `<p:txBody><a:bodyPr wrap="square" rtlCol="${rtl?'1':'0'}"/><a:lstStyle/>${paragraphs||'<a:p><a:endParaRPr/></a:p>'}</p:txBody>`;
    };
    const imageRels:Array<Array<{relId:string,target:string}>>=slides.map(()=>[]);
    const chartRels:Array<Array<{relId:string,target:string}>>=slides.map(()=>[]);
    let chartNo=0;
    const slideXml=(s:any,si:number)=>{
      const body:string[]=[]; let shapeId=2;
      for(const e of (Array.isArray(s?.elements)?s.elements:[])){
        const x=pct(e.x,cx), y=pct(e.y,cy), w=pct(e.width,cx), h=pct(e.height,cy);
        const rot=Number(e.rotation)||0; const transform=`<a:xfrm${rot?` rot="${Math.round(rot*60000)}"`:''}><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1,w)}" cy="${Math.max(1,h)}"/></a:xfrm>`;
        if(e.type==='image' && typeof e.src==='string'){
          const parsed=dataUri(e.src);
          if(parsed){
            const relId=`rIdImg${si+1}_${shapeId}`; const target=`../media/image${si+1}_${shapeId}.${parsed.ext}`;
            z.file(`ppt/media/image${si+1}_${shapeId}.${parsed.ext}`,parsed.buffer); imageRels[si].push({relId,target});
            body.push(`<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="Picture ${shapeId}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`); shapeId++; continue;
          }
        }
        if(e.type==='chart'){
          chartNo++;
          const relId=`rIdChart${chartNo}`; const target=`../charts/chart${chartNo}.xml`;
          chartRels[si].push({relId,target});
          const chartType=String(e.chartType||e.typeName||'bar').toLowerCase();
          const cats=Array.isArray(e.categories)?e.categories.map((v:any)=>String(v)):[];
          const series=Array.isArray(e.series)?e.series:[];
          const chartSpace=`<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:autoTitleDeleted val="0"/>${e.title?`<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${escXml(e.title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>`:''}<c:plotArea><c:layout/>${series.map((ser:any,idx:number)=>{const vals=Array.isArray(ser?.values)?ser.values:[]; const pts=vals.map((v:any,j:number)=>`<c:pt idx="${j}"><c:v>${escXml(v)}</c:v></c:pt>`).join(''); const catPts=cats.map((v:any,j:number)=>`<c:pt idx="${j}"><c:v>${escXml(v)}</c:v></c:pt>`).join(''); const common=`<c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${escXml(ser?.name||`Series ${idx+1}`)}</c:v></c:tx><c:cat><c:strLit><c:ptCount val="${cats.length}"/>${catPts}</c:strLit></c:cat><c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numLit></c:val>`; if(chartType==='line'||chartType==='area') return `<c:${chartType==='area'?'area':'line'}Chart><c:grouping val="standard"/>${common}<c:smooth val="0"/></c:${chartType==='area'?'area':'line'}Chart>`; return `<c:barChart><c:barDir val="${chartType==='bar'?'bar':'col'}"/><c:grouping val="clustered"/>${common}<c:gapWidth val="150"/></c:barChart>`;}).join('')}<c:catAx><c:axId val="-201"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="-202"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="-202"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="-201"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
          z.file(`ppt/charts/chart${chartNo}.xml`,chartSpace);
          body.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId}" name="Chart ${shapeId}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${transform}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/></a:graphicData></a:graphic></p:graphicFrame>`); shapeId++; continue;
        }
        const fill=e.type==='shape'?`<a:solidFill><a:srgbClr val="${safeColor(e.fill,'FFFFFF')}"/></a:solidFill>`:'<a:noFill/>';
        const line=e.borderColor?`<a:ln w="${Math.max(1,Math.round(Number(e.borderWidth||1)*12700))}"><a:solidFill><a:srgbClr val="${safeColor(e.borderColor,'000000')}"/></a:solidFill></a:ln>`:'<a:ln><a:noFill/></a:ln>';
        const geom=shapePreset(e);
        const text=e.type==='text'||e.type==='shape'?textBody(e):'';
        body.push(`<p:sp><p:nvSpPr><p:cNvPr id="${shapeId}" name="${escXml(e.name||`${e.type||'Shape'} ${shapeId}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform}<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${text}</p:sp>`); shapeId++;
      }
      const slideBg=s?.background&&/^#[0-9a-f]{6}$/i.test(String(s.background))?`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${String(s.background).slice(1).toUpperCase()}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`:'';
      const transition=s?.transition?.type&&s.transition.type!=='none'?`<p:transition spd="${Number(s.transition.duration||500)>1500?'slow':Number(s.transition.duration||500)<600?'fast':'med'}"><p:${['fade','push','wipe','split','cover','uncover','zoom'].includes(s.transition.type)?s.transition.type:'fade'}/></p:transition>`:'';
      return `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${slideBg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${body.join('')}</p:spTree></p:cSld>${transition}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    };
    // Package-level content types and presentation/master/layout relationships.
    const slideOverrides=slides.map((_:any,i:number)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
    const chartOverrides=Array.from({length:chartNo},(_,i)=>`<Override PartName="/ppt/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('');
    z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}${chartOverrides}</Types>`);
    z.file('_rels/.rels',rootRels('presentationml.presentation'));
    z.file('ppt/presentation.xml',`<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_:any,i:number)=>`<p:sldId id="${256+i}" r:id="rIdSlide${i+1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    z.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_:any,i:number)=>`<Relationship Id="rIdSlide${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`);
    z.file('ppt/theme/theme1.xml',`<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IMKAN Theme"><a:themeElements><a:clrScheme name="IMKAN"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="000000"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="${accent}"/></a:accent1><a:accent2><a:srgbClr val="${secondary}"/></a:accent2><a:accent3><a:srgbClr val="${safeColor(theme.background,'FFFFFF')}"/></a:accent3></a:clrScheme><a:fontScheme name="IMKAN"><a:majorFont><a:latin typeface="${escXml(headingFont)}"/></a:majorFont><a:minorFont><a:latin typeface="${escXml(bodyFont)}"/></a:minorFont></a:fontScheme><a:fmtScheme name="IMKAN"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`);
    z.file('ppt/slideLayouts/slideLayout1.xml',`<?xml version="1.0" encoding="UTF-8"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    z.file('ppt/slideMasters/slideMaster1.xml',`<?xml version="1.0" encoding="UTF-8"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="IMKAN Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout1"/></p:sldLayoutIdLst><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3"/></p:sldMaster>`);
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
    slides.forEach((s:any,i:number)=>{
      z.file(`ppt/slides/slide${i+1}.xml`,slideXml(s,i));
      const rels=[`<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`];
      for(const r of imageRels[i]) rels.push(`<Relationship Id="${r.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`);
      for(const r of chartRels[i]) rels.push(`<Relationship Id="${r.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="${r.target}"/>`);
      z.file(`ppt/slides/_rels/slide${i+1}.xml.rels`,`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    });
    this.restorePreservation(z,d?._ooxmlPreservation); await this.mergePreservedRelationships(z,d?._ooxmlPreservation);
    return z.generateAsync({type:'nodebuffer'});
  }
  private async required(z:JSZip,path:string){const f=z.file(path);if(!f)throw new BadRequestException(`Invalid Office package: missing ${path}`);return f;}
}
function runPropertiesXml(r:any){const p:string[]=[];if(r?.bold)p.push('<w:b/>');if(r?.italic)p.push('<w:i/>');if(r?.underline)p.push('<w:u w:val="single"/>');if(r?.strike)p.push('<w:strike/>');if(r?.fontSize)p.push(`<w:sz w:val="${Math.round(Number(r.fontSize)*2)}"/>`);if(r?.fontFamily)p.push(`<w:rFonts w:ascii="${esc(r.fontFamily)}" w:hAnsi="${esc(r.fontFamily)}"/>`);if(r?.color&&/^#[0-9a-f]{6}$/i.test(r.color))p.push(`<w:color w:val="${r.color.slice(1)}"/>`);if(r?.verticalAlign)p.push(`<w:vertAlign w:val="${r.verticalAlign}"/>`);if(r?.highlight)p.push('<w:highlight w:val="yellow"/>');return p.join('');}

function runsXml(runs:any[],align:string,hyperlinkIds?:Map<string,string>){return (runs.length?runs:[{text:''}]).map((r:any)=>{const p=runPropertiesXml(r);const run=`<w:r>${p?`<w:rPr>${p}</w:rPr>`:''}<w:t xml:space="preserve">${esc(String(r.text||''))}</w:t></w:r>`; const hid=hyperlinkIds?.get(String(r.href||'')); return hid?`<w:hyperlink r:id="${hid}">${run}</w:hyperlink>`:run;}).join('');}
function escapeRegExp(value:string){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function bookmarkHash(name:string){let h=0;for(const c of name)h=((h<<5)-h+c.charCodeAt(0))|0;return Math.abs(h%100000)+1;}

function colIndexLocal(s:string){let n=0;for(const c of String(s).toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1;}
function cellRefLocal(r:number,c:number){return `${colLocal(c)}${r+1}`;}
function colLocal(n:number){let s='';for(let x=n+1;x;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s;}

function parseXlsxStyles(xml:string):Record<number,any>{
  const out:Record<number,any>={}; if(!xml) return out;
  const fonts=[...xml.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(m=>m[1]);
  const fills=[...xml.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(m=>m[1]);
  const xfs=/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1]||'';
  [...xfs.matchAll(/<xf\s+([^>]*)>([\s\S]*?)<\/xf>|<xf\s+([^>]*)\/>/g)].forEach((m,i)=>{
    const a=m[1]||m[3]||'', body=m[2]||''; const fontId=Number(/fontId=\"(\d+)\"/.exec(a)?.[1]||0),fillId=Number(/fillId=\"(\d+)\"/.exec(a)?.[1]||0),numFmtId=Number(/numFmtId=\"(\d+)\"/.exec(a)?.[1]||0);
    const f=fonts[fontId]||'', fill=fills[fillId]||'', color=/<color[^>]*rgb=\"(?:FF)?([0-9A-Fa-f]{6})\"/.exec(f)?.[1], bg=/<fgColor[^>]*rgb=\"(?:FF)?([0-9A-Fa-f]{6})\"/.exec(fill)?.[1];
    const align=/<alignment[^>]*horizontal=\"([^\"]+)/.exec(body)?.[1];
    out[i]={bold:/<b(?:\s|\/|>)/.test(f),italic:/<i(?:\s|\/|>)/.test(f),fontFamily:/<name[^>]*val=\"([^\"]+)/.exec(f)?.[1],fontSize:Number(/<sz[^>]*val=\"([\d.]+)/.exec(f)?.[1]||0)||undefined,color:color?'#'+color:undefined,background:bg?'#'+bg:undefined,align:align==='left'?'start':align==='right'?'end':align==='center'?'center':undefined,numberFormat:numFmtId===10?'percent':numFmtId===14?'date':undefined};
  }); return out;
}

function xlsxCell(ref:string,c:any,styles:any){const formula=typeof c?.formula==='string'&&c.formula.startsWith('=')?c.formula.slice(1):'';const v=c?.value;const sid=styles.styleId(c?.format);const a=sid?` s="${sid}"`:'';if(formula)return `<c r="${esc(ref)}"${a}><f>${esc(formula)}</f>${typeof v==='number'?`<v>${v}</v>`:''}</c>`;if(typeof v==='number')return `<c r="${esc(ref)}"${a}><v>${v}</v></c>`;if(typeof v==='boolean')return `<c r="${esc(ref)}" t="b"${a}><v>${v?'1':'0'}</v></c>`;if(v===null||v===undefined||v==='')return `<c r="${esc(ref)}"${a}/>`;return `<c r="${esc(ref)}" t="inlineStr"${a}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;}
function buildXlsxStyles(){const map=new Map<string,number>();const defs:any[]=[];const styleId=(f:any)=>{if(!f)return 0;const key=JSON.stringify(f);if(map.has(key))return map.get(key)!;const id=defs.length+1;defs.push(f);map.set(key,id);return id;};const fonts=[`<font><sz val="11"/><name val="Calibri"/></font>`],fills=[`<fill><patternFill patternType="none"/></fill>`,`<fill><patternFill patternType="gray125"/></fill>`],borders=[`<border><left/><right/><top/><bottom/><diagonal/></border>`];const xfs=[`<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>`];for(const f of defs){const fontId=fonts.length;if(f.bold||f.italic||f.color||f.fontFamily||f.fontSize)fonts.push(`<font>${f.bold?'<b/>':''}${f.italic?'<i/>':''}${f.color&&/^#[0-9a-f]{6}$/i.test(f.color)?`<color rgb="FF${f.color.slice(1)}"/>`:''}<sz val="${Number(f.fontSize)||11}"/><name val="${esc(f.fontFamily||'Calibri')}"/></font>`);const fillId=f.background&&/^#[0-9a-f]{6}$/i.test(f.background)?fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${f.background.slice(1)}"/><bgColor indexed="64"/></patternFill></fill>`)-1:0;const numFmt=f.numberFormat==='percent'?10:f.numberFormat==='currency'?164:f.numberFormat==='date'?14:0;const align=f.align?`<alignment horizontal="${f.align==='start'?'left':f.align==='end'?'right':f.align}"/>`:'';xfs.push(`<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="0" applyFont="1" applyFill="${fillId?1:0}" applyAlignment="${align?1:0}">${align}</xf>`);}const xml=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;return {styleId,xml};}
function dataUri(src:string):{ext:string;buffer:Buffer}|null{const m=/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(src);if(!m)return null;return {ext:m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase(),buffer:Buffer.from(m[2],'base64')}}
function wordColor(v:string){const map:any={yellow:'#ffff00',green:'#00ff00',cyan:'#00ffff',magenta:'#ff00ff',blue:'#0000ff',red:'#ff0000',darkBlue:'#000080',darkGreen:'#008000',darkRed:'#800000',darkYellow:'#808000',gray50:'#808080'};return map[v]||undefined;}
function decode(s:string){return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");}
function strip(s:string){return s.replace(/\.(docx|xlsx|pptx)$/i,'').slice(0,255)||'Untitled';}
function safeName(s:string){return s.replace(/[\\/:*?"<>|]+/g,'-').trim()||'document';}
function contentTypes(kind:string,header=false,footer=false,media=false,numbering=false,footnotes=false,endnotes=false,comments=false,commentsExtended=false){const main=kind==='wordprocessingml.document'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml':kind==='spreadsheetml.sheet'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml':'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/${kind==='wordprocessingml.document'?'word/document.xml':kind==='spreadsheetml.sheet'?'xl/workbook.xml':'ppt/presentation.xml'}" ContentType="${main}"/>${header?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':''}${footer?'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>':''}${numbering?'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>':''}${footnotes?'<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>':''}${endnotes?'<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>':''}${comments?'<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>':''}${commentsExtended?'<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>':''}</Types>`;}
function rels(_kind:string){return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;}
function rootRels(kind:string){const target=kind==='wordprocessingml.document'?'word/document.xml':kind==='spreadsheetml.sheet'?'xl/workbook.xml':'ppt/presentation.xml';const type=kind==='wordprocessingml.document'?'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument':kind==='spreadsheetml.sheet'?'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument':'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${type}" Target="${target}"/></Relationships>`;}

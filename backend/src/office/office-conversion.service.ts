import { BadRequestException, Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import type { OfficeType } from './core/office-engine.interface';

export type ConversionCategory = 'preserved'|'converted'|'warning'|'unsupported';
export type ConversionDiagnostic = { code: string; severity: 'info'|'warning'|'loss'; category?: ConversionCategory; message: string; path?: string };
export type ConversionReport = { sourceFormat: string; targetFormat: string; converterVersion: string; nativeSchemaVersion: number; diagnostics: ConversionDiagnostic[]; summary: { info: number; warning: number; loss: number; preserved: number; converted: number; unsupported: number } };
export type RoundTripReport = ConversionReport & { roundTrip: { performed: boolean; exportedBytes: number; reimportedType: OfficeType; sourceMetrics: Record<string,number>; roundTripMetrics: Record<string,number>; metricDiffs: Record<string,number>; structurallyStable: boolean; } };
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
    const relationshipPatches: Array<{source:string; from:string; to:string}> = [];
    for (const [relsPath, edges] of Object.entries(bundle.relationships || {})) {
      const nativeRelsPath = this.relationshipPathForSource(relsPath);
      const preservedEncoded = bundle.parts[relsPath] || bundle.parts[nativeRelsPath];
      if (!preservedEncoded) continue;
      const nativeFile = z.file(relsPath);
      if (!nativeFile) {
        if (!z.file(relsPath)) z.file(relsPath, Buffer.from(preservedEncoded, 'base64'));
        continue;
      }
      try {
        const nativeXml = nativeFile.async ? null : null;
        // JSZip file data is synchronously unavailable; relationship merging is handled from the
        // already-captured preserved XML and the native XML is read by the async helper below.
      } catch {}
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
    if ((type === 'WRITER' && format !== 'docx') || (type === 'SHEET' && format !== 'xlsx') || (type === 'SHOW' && format !== 'pptx')) add('FORMAT_MISMATCH', 'loss', `The ${type} document is not compatible with ${format.toUpperCase()} export.`);
    if (type === 'WRITER') {
      const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
      const images = blocks.filter((b:any) => b?.type === 'image');
      const review = content?.review;
      if (images.length) add('WRITER_IMAGES', images.every((b:any)=>typeof b?.image?.src==='string'&&/^data:image\//i.test(b.image.src)) ? 'info' : 'warning', `${images.length} image block(s) detected; data-URI images are embedded by the v19 converter.`, 'blocks');
      if (blocks.some((b:any)=>b?.type==='list-item')) add('WRITER_NUMBERING','info','List paragraphs are exported using native DOCX numbering definitions.','blocks');
      if (review?.comments?.length || review?.changes?.length) add('WRITER_REVIEW', 'loss', 'Comments and tracked changes are stored natively but are not fully represented in DOCX export yet.', 'review');
      if (content?.page?.header || content?.page?.footer) add('WRITER_HEADERS', 'info', 'Header/footer metadata is available for DOCX export.', 'page');
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
      add('SHOW_CORE', 'info', 'Slides, text, basic shapes, backgrounds and positioning are supported by the current PPTX converter.');
    }
    return this.finalizeReport(type, content, format, diagnostics);
  }

  private metrics(type: OfficeType, content: any): Record<string,number> {
    if (type === 'WRITER') {
      const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
      return { blocks: blocks.length, paragraphs: blocks.filter((b:any)=>['paragraph','heading1','heading2','heading3','list-item'].includes(b?.type)).length, tables: blocks.filter((b:any)=>b?.type==='table').length, images: blocks.filter((b:any)=>b?.type==='image').length, runs: blocks.reduce((n:number,b:any)=>n+(Array.isArray(b?.runs)?b.runs.length:0),0) };
    }
    if (type === 'SHEET') {
      const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
      return { sheets:sheets.length, cells:sheets.reduce((n:number,s:any)=>n+Object.keys(s?.cells||{}).length,0), formulas:sheets.reduce((n:number,s:any)=>n+Object.values(s?.cells||{}).filter((c:any)=>typeof c?.formula==='string'&&c.formula.startsWith('=')).length,0), merges:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.merges)?s.merges.length:0),0), charts:sheets.reduce((n:number,s:any)=>n+(Array.isArray(s?.charts)?s.charts.length:0),0) };
    }
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    return { slides:slides.length, elements:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.length:0),0), tables:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='table').length:0),0), images:slides.reduce((n:number,s:any)=>n+(Array.isArray(s?.elements)?s.elements.filter((e:any)=>e?.type==='image').length:0),0) };
  }

  async roundTrip(type: OfficeType, content: any, targetFormat: string): Promise<RoundTripReport> {
    const base = await this.diagnose(type, content, targetFormat);
    const exported = await this.export(type, content, targetFormat);
    const imported = await this.import(exported.buffer, exported.filename);
    const sourceMetrics = this.metrics(type, content);
    const roundTripMetrics = this.metrics(imported.type, imported.content);
    const metricDiffs: Record<string,number> = {};
    for (const key of new Set([...Object.keys(sourceMetrics), ...Object.keys(roundTripMetrics)])) metricDiffs[key] = (roundTripMetrics[key]||0) - (sourceMetrics[key]||0);
    const structurallyStable = Object.values(metricDiffs).every(v => v === 0);
    const diagnostics = [...base.diagnostics];
    if (!structurallyStable) diagnostics.push({ code:'ROUNDTRIP_STRUCTURAL_DIFF', severity:'warning', category:'warning', message:'The exported file was re-imported successfully, but structural metrics changed during the round trip.', path:'roundTrip' });
    else diagnostics.push({ code:'ROUNDTRIP_STABLE', severity:'info', category:'preserved', message:'The exported file was re-imported successfully and the selected structural metrics remained stable.', path:'roundTrip' });
    const report = this.finalizeReport(type, content, targetFormat, diagnostics);
    return { ...report, roundTrip:{performed:true,exportedBytes:exported.buffer.length,reimportedType:imported.type,sourceMetrics,roundTripMetrics,metricDiffs,structurallyStable} };
  }

  async export(type:OfficeType, content:any, format:string):Promise<{buffer:Buffer;filename:string;mimeType:string}>{
    const f=format.toLowerCase();
    if(type==='WRITER' && f==='docx') return {buffer:await this.exportDocx(content),filename:`${safeName(content?.title||'document')}.docx`,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
    if(type==='SHEET' && f==='xlsx') return {buffer:await this.exportXlsx(content),filename:`${safeName(content?.title||'spreadsheet')}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    if(type==='SHOW' && f==='pptx') return {buffer:await this.exportPptx(content),filename:`${safeName(content?.title||'presentation')}.pptx`,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
    throw new BadRequestException(`Cannot export ${type} as ${format}`);
  }

  private async importDocx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const xml=await this.required(z,'word/document.xml').async('string');
    const stylesXml=z.file('word/styles.xml') ? await z.file('word/styles.xml')!.async('string') : '';
    const numberingXml=z.file('word/numbering.xml') ? await z.file('word/numbering.xml')!.async('string') : '';
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
    let bi=0;
    for(const m of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)){
      const pxml=m[0]; const ppr=/<w:pPr[\s\S]*?<\/w:pPr>/.exec(pxml)?.[0]||'';
      const styleId=/<w:pStyle[^>]*w:val="([^"]+)"/.exec(ppr)?.[1];
      const numPr=/<w:numPr[\s\S]*?<\/w:numPr>/.test(ppr);
      const numId=/<w:numId[^>]*w:val="(\d+)"/.exec(ppr)?.[1]; const ilvl=/<w:ilvl[^>]*w:val="(\d+)"/.exec(ppr)?.[1]||'0'; const listMeta=numId?numberingMap[numToAbstract[numId]]?.[ilvl]:undefined;
      const alignVal=/<w:jc[^>]*w:val="([^"]+)"/.exec(ppr)?.[1];
      const align=alignVal==='center'?'center':alignVal==='right'?'end':alignVal==='both'?'justify':'start';
      const type=styleId && /heading1|title/i.test(styleId)?'heading1':styleId && /heading2/i.test(styleId)?'heading2':styleId && /heading3/i.test(styleId)?'heading3':numPr?'list-item':'paragraph';
      const runs:any[]=[];
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
        runs.push(run);
      }
      if(!runs.length) runs.push({text:''});
      const pageBreakBefore=/<w:pageBreakBefore(?:\s|\/|>)/.test(ppr) || /<w:br[^>]*w:type="page"/.test(pxml);
      blocks.push({id:`p${++bi}`,type,align,ordered: type==='list-item' ? Boolean(listMeta?.ordered) : false,listLevel:type==='list-item'?Number(ilvl):undefined,runs,lineSpacing:1.5,spaceAfter:8,pageBreakBefore});
    }
    // Native table conversion: each row/cell becomes Writer table cells.
    for(const tm of xml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)){
      const rows=[...tm[0].matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].map((tr:any,ri:number)=>[...tr[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((tc:any,ci:number)=>({id:`cell-${ri}-${ci}`,runs:[{text:textOf(tc[0])}],align:'start'})));
      blocks.push({id:`table-${blocks.length+1}`,type:'table',align:'start',runs:[{text:''}],table:{rows,bordered:true}});
    }
    const docRelXml=z.file('word/_rels/document.xml.rels')?await z.file('word/_rels/document.xml.rels')!.async('string'):''; const hyperlinkMap:Record<string,string>={}; for(const m of docRelXml.matchAll(/<Relationship\s+([^>]*)\/>/g)){const a=m[1],id=/Id="([^"]+)"/.exec(a)?.[1],target=/Target="([^"]+)"/.exec(a)?.[1],typeRel=/Type="([^"]+)"/.exec(a)?.[1]||''; if(id&&target&&/hyperlink$/.test(typeRel)) hyperlinkMap[id]=target;}
    const bookmarks=[...xml.matchAll(/<w:bookmarkStart[^>]*w:id="(\d+)"[^>]*w:name="([^"]+)"/g)].map(m=>({id:m[1],name:m[2]}));
    const preservation = await this.capturePreservation(z, 'docx');
    return {type:'WRITER',title:strip(filename),sourceFormat:'docx',content:{schema:4,type:'WRITER',title:strip(filename),language:'mixed',_ooxmlPreservation:preservation,_ooxmlBridge:{hyperlinks:hyperlinkMap,bookmarks},page:{size:'CUSTOM',widthMm,heightMm,marginTopMm:pgMar?Math.round(Number(pgMar[1])*25.4/1440):20,marginRightMm:pgMar?Math.round(Number(pgMar[2])*25.4/1440):20,marginBottomMm:pgMar?Math.round(Number(pgMar[3])*25.4/1440):20,marginLeftMm:pgMar?Math.round(Number(pgMar[4])*25.4/1440):20,orientation:widthMm>heightMm?'landscape':'portrait',showPageNumbers:true},blocks:blocks.length?blocks:[{id:'p1',type:'paragraph',align:'start',runs:[{text:''}]}],review:{trackChanges:false,comments:[],changes:[],snapshots:[]}}};
  }

  private async importXlsx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const workbookXml=await this.required(z,'xl/workbook.xml').then(f=>f.async('string'));
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
      const validations:any[]=[]; for(const vm of xml.matchAll(/<dataValidation\s+([^>]*)>([\s\S]*?)<\/dataValidation>/g)){const a=vm[1],body=vm[2]; const sqref=/sqref="([^"]+)"/.exec(a)?.[1]; if(!sqref) continue; validations.push({type:/type="([^"]+)/.exec(a)?.[1]||'list',operator:/operator="([^"]+)/.exec(a)?.[1],allowBlank:/allowBlank="1"/.test(a),formula1:/<formula1>([\s\S]*?)<\/formula1>/.exec(body)?.[1],formula2:/<formula2>([\s\S]*?)<\/formula2>/.exec(body)?.[1],range:sqref});}
      const conditionalFormatting:any[]=[]; for(const cm of xml.matchAll(/<conditionalFormatting\s+sqref="([^"]+)"[\s\S]*?<cfRule\s+([^>]*)>([\s\S]*?)<\/cfRule>[\s\S]*?<\/conditionalFormatting>/g)){conditionalFormatting.push({range:cm[1],type:/type="([^"]+)/.exec(cm[2])?.[1]||'expression',operator:/operator="([^"]+)/.exec(cm[2])?.[1],formula:[...cm[3].matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map(x=>decode(x[1]))});}
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
      sheets.push({id:`sheet-${si+1}`,name:meta.name.slice(0,31)||`Sheet${si+1}`,cells,frozenRows,columnWidths,rowHeights,merges:mergeRefs,filters:autoFilter?{_range:autoFilter}:null,sort:null,charts,validations,conditionalFormatting});
    }
    const preservation = await this.capturePreservation(z, 'xlsx');
    return {type:'SHEET',title:strip(filename),sourceFormat:'xlsx',content:{schema:5,type:'SHEET',title:strip(filename),_ooxmlPreservation:preservation,_ooxmlBridge:{definedNames},activeSheet:sheets[0]?.id||'sheet-1',sheets:sheets.length?sheets:[{id:'sheet-1',name:'Sheet1',cells:{}}]}};
  }

  private async importPptx(buffer:Buffer,filename:string):Promise<OfficeImportResult>{
    const z=await JSZip.loadAsync(buffer);
    const pres=z.file('ppt/presentation.xml')?await z.file('ppt/presentation.xml')!.async('string'):'';
    const size=/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
    const aspect=(size && Number(size[1])>Number(size[2])*1.2)?'16:9':'4:3';
    const relXml=z.file('ppt/_rels/presentation.xml.rels')?await z.file('ppt/_rels/presentation.xml.rels')!.async('string'):'';
    const rels:Record<string,string>={};
    for(const m of relXml.matchAll(/<Relationship\s+([^>]*)\/>/g)){const id=/Id="([^"]+)"/.exec(m[1])?.[1],target=/Target="([^"]+)"/.exec(m[1])?.[1];if(id&&target)rels[id]=target.startsWith('/')?target.slice(1):`ppt/${target.replace(/^\//,'')}`;}
    const orderedRids=[...pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map(m=>m[1]);
    const slidePaths=orderedRids.map(r=>rels[r]).filter(Boolean).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
    const slides=await Promise.all(slidePaths.slice(0,100).map(async(p,i)=>{
      const xml=await z.file(p)!.async('string');
      const elements:any[]=[]; let ei=0;
      for(const sm of xml.matchAll(/<p:sp[\s\S]*?<\/p:sp>/g)){
        const body=sm[0]; const text=[...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1])).join('');
        if(!text) continue;
        const off=/<a:off[^>]*x="(\d+)"[^>]*y="(\d+)"/.exec(body), ext=/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);
        const x=off?Number(off[1])/914400*100/(aspect==='16:9'?13.333:10):0,y=off?Number(off[2])/914400*100/7.5:10;
        const w=ext?Number(ext[1])/914400*100/(aspect==='16:9'?13.333:10):80,h=ext?Number(ext[2])/914400*100/7.5:20;
        const rpr=/<a:rPr[^>]*>([\s\S]*?)<\/a:rPr>/.exec(body)?.[1]||'';
        const font=/<a:latin[^>]*typeface="([^"]+)"/.exec(body)?.[1]; const fs=/<a:rPr[^>]*sz="(\d+)"/.exec(body)?.[1];
        const solid=/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(body)?.[1];
        elements.push({id:`el-${i+1}-${++ei}`,type:'text',x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y)),width:Math.max(8,Math.min(100,w)),height:Math.max(8,Math.min(100,h)),text,fontSize:fs?Number(fs)/100:20,fontFamily:font||'Arial',color:solid?`#${solid}`:'#111827',bold:/<a:b\b/.test(body),italic:/<a:i\b/.test(body),underline:/<a:u\b/.test(body),align:/<a:pPr[^>]*algn="ctr"/.test(body)?'center':/algn="r"/.test(body)?'end':'start'});
      }
      for(const gm of xml.matchAll(/<p:spTree[\s\S]*?<\/p:spTree>/g)){
        const shapes=[...gm[0].matchAll(/<p:sp[\s\S]*?<\/p:sp>/g)];
        for(const sh of shapes){if(/<p:txBody\b/.test(sh[0]))continue; const body=sh[0]; const off=/<a:off[^>]*x="(\d+)"[^>]*y="(\d+)"/.exec(body),ext=/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body); if(!off||!ext)continue; const x=Number(off[1])/914400*100/(aspect==='16:9'?13.333:10),y=Number(off[2])/914400*100/7.5,w=Number(ext[1])/914400*100/(aspect==='16:9'?13.333:10),h=Number(ext[2])/914400*100/7.5; const fill=/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(body)?.[1]; elements.push({id:`el-${i+1}-${++ei}`,type:'shape',shape:'rect',x,y,width:w,height:h,fill:fill?`#${fill}`:'#e2e8f0',border:true});}
      }
      const slideRelPath=p.replace(/([^/]+)$/,'_rels/$1.rels'); const slideRelXml=z.file(slideRelPath)?await z.file(slideRelPath)!.async('string'):'';
      for(const pm of xml.matchAll(/<p:pic[\s\S]*?<\/p:pic>/g)){
        const body=pm[0], rid=/<a:blip[^>]*r:embed="([^"]+)"/.exec(body)?.[1]; if(!rid) continue;
        const target=new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(slideRelXml)?.[1]; if(!target) continue;
        const imagePath=this.resolveRelationshipTarget(p,target); const imageFile=z.file(imagePath); if(!imageFile) continue; const imageBuf=await imageFile.async('nodebuffer'); const ext=(imagePath.split('.').pop()||'png').toLowerCase();
        const off=/<a:off[^>]*x="(\d+)"[^>]*y="(\d+)"/.exec(body), extm=/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);
        const x=off?Number(off[1])/914400*100/(aspect==='16:9'?13.333:10):5,y=off?Number(off[2])/914400*100/7.5:5,w=extm?Number(extm[1])/914400*100/(aspect==='16:9'?13.333:10):30,h=extm?Number(extm[2])/914400*100/7.5:30;
        elements.push({id:`el-${i+1}-${++ei}`,type:'image',x,y,width:w,height:h,src:`data:image/${ext==='jpg'?'jpeg':ext};base64,${imageBuf.toString('base64')}`,alt:'Imported image'});
      }
      return {id:`slide-${i+1}`,layout:'blank',background:'#ffffff',elements,notes:'',transition:'none',transitionDuration:300};
    }));
    const preservation = await this.capturePreservation(z, 'pptx');
    return {type:'SHOW',title:strip(filename),sourceFormat:'pptx',content:{schema:4,type:'SHOW',title:strip(filename),_ooxmlPreservation:preservation,aspectRatio:aspect,activeSlide:slides[0]?.id||'slide-1',theme:{fontFamily:'Arial',accent:'#2563eb',secondary:'#64748b',background:'#ffffff',headingFont:'Arial'},masters:[{id:'master-default',name:'Default',background:'#ffffff',elements:[]}],slides:slides.length?slides:[{id:'slide-1',layout:'blank',background:'#fff',elements:[]}]}};
  }

  private async exportDocx(d:any){
    const z=new JSZip(), mediaRels:string[]=[]; let mediaIndex=0; let hasLists=false;
    const hyperlinkIds=new Map<string,string>(); let hyperlinkIndex=0;
    for(const b of (d.blocks||[])){ for(const r of (b.runs||[])){ if(r?.href && /^https?:\/\//i.test(String(r.href)) && !hyperlinkIds.has(String(r.href))) hyperlinkIds.set(String(r.href),`rIdLink${++hyperlinkIndex}`); } if(b.table?.rows) for(const row of b.table.rows) for(const c of row||[]) for(const r of c?.runs||[]) if(r?.href && /^https?:\/\//i.test(String(r.href)) && !hyperlinkIds.has(String(r.href))) hyperlinkIds.set(String(r.href),`rIdLink${++hyperlinkIndex}`); }
    const blocks=(d.blocks||[]).map((b:any)=>{
      if(b.type==='image' && b.image?.src){
        const relId=`rIdMedia${++mediaIndex}`; const parsed=dataUri(b.image.src); if(parsed){z.file(`word/media/image${mediaIndex}.${parsed.ext}`,parsed.buffer); mediaRels.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${mediaIndex}.${parsed.ext}"/>`); const cx=Math.round((Number(b.image.width)||160)*9525),cy=Math.round((Number(b.image.height)||90)*9525); return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`; }
      }
      if(b.type==='table' && b.table?.rows){const rows=b.table.rows.map((row:any[])=>`<w:tr>${row.map((cell:any)=>`<w:tc><w:p>${runsXml(cell.runs||[],'start',hyperlinkIds)}</w:p></w:tc>`).join('')}</w:tr>`).join('');return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;}
      const pStyle=b.type==='heading1'?'Heading1':b.type==='heading2'?'Heading2':b.type==='heading3'?'Heading3':undefined;
      if(b.type==='list-item') hasLists=true; const pPr=`<w:pPr>${pStyle?`<w:pStyle w:val="${pStyle}"/>`:''}${b.type==='list-item'?`<w:numPr><w:ilvl w:val="${Math.max(0,Number(b.listLevel)||0)}"/><w:numId w:val="${b.ordered?2:1}"/></w:numPr>`:''}<w:jc w:val="${b.align==='center'?'center':b.align==='end'?'right':b.align==='justify'?'both':'left'}"/>${b.pageBreakBefore?'<w:pageBreakBefore/>':''}</w:pPr>`;
      return `<w:p>${pPr}${runsXml(b.runs||[],b.align||'start',hyperlinkIds)}</w:p>`;
    }).join('');
    const page=d.page||{}; const width=Math.round((Number(page.widthMm)||210)*1440/25.4),height=Math.round((Number(page.heightMm)||297)*1440/25.4),mt=Math.round((Number(page.marginTopMm)||20)*1440/25.4),mr=Math.round((Number(page.marginRightMm)||20)*1440/25.4),mb=Math.round((Number(page.marginBottomMm)||20)*1440/25.4),ml=Math.round((Number(page.marginLeftMm)||20)*1440/25.4);
    const header=typeof page.header==='string'&&page.header?`<w:headerReference w:type="default" r:id="rId2"/>`:''; const footer=typeof page.footer==='string'&&page.footer?`<w:footerReference w:type="default" r:id="rId3"/>`:'';
    z.file('[Content_Types].xml',contentTypes('wordprocessingml.document',!!header,!!footer,mediaIndex>0,hasLists)); z.file('_rels/.rels',rootRels('wordprocessingml.document'));
    const relsXml=[`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`]; if(hasLists)relsXml.push(`<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`); if(header)relsXml.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`);if(footer)relsXml.push(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`);relsXml.push(...mediaRels); for(const [href,id] of hyperlinkIds) relsXml.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`);
    z.file('word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsXml.join('')}</Relationships>`);
    if(hasLists) z.file('word/numbering.xml',`<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`); z.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${blocks||'<w:p><w:r><w:t></w:t></w:r></w:p>'}<w:sectPr>${header}${footer}<w:pgSz w:w="${width}" w:h="${height}"/><w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="${mb}" w:left="${ml}"/></w:sectPr></w:body></w:document>`);
    if(header)z.file('word/header1.xml',`<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${esc(page.header)}</w:t></w:r></w:p></w:hdr>`);if(footer)z.file('word/footer1.xml',`<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${esc(page.footer)}</w:t></w:r></w:p></w:ftr>`);
    this.restorePreservation(z, d?._ooxmlPreservation); await this.mergePreservedRelationships(z, d?._ooxmlPreservation);
    return z.generateAsync({type:'nodebuffer'});
  }

  private async exportXlsx(d:any){
    const z=new JSZip(),sheets=(d.sheets||[]).slice(0,50),styles=buildXlsxStyles(); const sheetRels:string[]=[];
    sheets.forEach((s:any,i:number)=>{const rows:Record<number,string[]>={};for(const [ref,c] of Object.entries(s.cells||{}) as any){const m=/^([A-Z]+)(\d+)$/i.exec(ref);if(!m)continue;const r=Number(m[2]);(rows[r]??=[]).push(xlsxCell(ref,c,styles));}
      const rowXml=Object.keys(rows).map(Number).sort((a,b)=>a-b).map(r=>{const h=s.rowHeights?.[r-1];return `<row r="${r}"${h?` ht="${(Number(h)/1.333).toFixed(2)}" customHeight="1"`:''}>${rows[r].join('')}</row>`}).join('');
      const cols=Object.entries(s.columnWidths||{}).map(([name,w]:any)=>{const idx=colIndexLocal(name)+1;return `<col min="${idx}" max="${idx}" width="${(Number(w)/8).toFixed(2)}" customWidth="1"/>`;}).join(''); const merges=(s.merges||[]).map((m:any)=>`<mergeCell ref="${esc(m.start)}:${esc(m.end)}"/>`).join(''); const freeze=(s.frozenRows||s.frozenColumns)?`<sheetViews><sheetView workbookViewId="0"><pane${s.frozenColumns?` xSplit="${s.frozenColumns}"`:''}${s.frozenRows?` ySplit="${s.frozenRows}"`:''} topLeftCell="${cellRefLocal(s.frozenRows||0,s.frozenColumns||0)}" state="frozen"/></sheetView></sheetViews>`:''; const filter=s.filters?._range?`<autoFilter ref="${esc(s.filters._range)}"/>`:''; const validations=(s.validations||[]).map((v:any)=>`<dataValidation type="${esc(v.type||'list')}"${v.operator?` operator="${esc(v.operator)}"`:''}${v.allowBlank?' allowBlank="1"':''} sqref="${esc(v.range||'A1')}">${v.formula1?`<formula1>${esc(String(v.formula1))}</formula1>`:''}${v.formula2?`<formula2>${esc(String(v.formula2))}</formula2>`:''}</dataValidation>`).join(''); const validationXml=validations?`<dataValidations count="${(s.validations||[]).length}">${validations}</dataValidations>`:''; const cf=(s.conditionalFormatting||[]).map((c:any)=>`<conditionalFormatting sqref="${esc(c.range||'A1')}"><cfRule type="${esc(c.type||'expression')}"${c.operator?` operator="${esc(c.operator)}"`:''}>${(c.formula||[]).map((f:any)=>`<formula>${esc(String(f))}</formula>`).join('')}</cfRule></conditionalFormatting>`).join('');
      z.file(`xl/worksheets/sheet${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols?`<cols>${cols}</cols>`:''}<sheetData>${rowXml}</sheetData>${merges?`<mergeCells count="${s.merges.length}">${merges}</mergeCells>`:''}${filter}${validationXml}${cf}</worksheet>`); sheetRels.push(`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`);
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
      z.file(`xl/worksheets/_rels/sheet${i+1}.xml.rels`,`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDrawing${drawingNo}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`);
    }
    z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({length:chartNo},(_,i)=>`<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}<Default Extension="drawing" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`); z.file('_rels/.rels',rootRels('spreadsheetml.sheet'));z.file('xl/styles.xml',styles.xml); z.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s:any,i:number)=>`<sheet name="${esc(String(s.name||`Sheet${i+1}`).slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${Array.isArray(d?._ooxmlBridge?.definedNames)&&d._ooxmlBridge.definedNames.length?`<definedNames>${d._ooxmlBridge.definedNames.map((n:any)=>`<definedName name="${esc(n.name)}"${n.localSheetId!==undefined?` localSheetId="${n.localSheetId}"`:''}>${esc(String(n.formula||''))}</definedName>`).join('')}</definedNames>`:''}</workbook>`); z.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels.join('')}</Relationships>`); this.restorePreservation(z, d?._ooxmlPreservation); await this.mergePreservedRelationships(z, d?._ooxmlPreservation); return z.generateAsync({type:'nodebuffer'});
  }

  private async exportPptx(d:any){
    const z=new JSZip(),slides=(d.slides||[]).slice(0,100),wide=d.aspectRatio!=='4:3'; const slideImageRels:any[][]=[];
    const slideSize=wide?'12192000" cy="6858000':'9144000" cy="6858000';
    z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_:any,i:number)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`);
    z.file('_rels/.rels',rootRels('presentationml.presentation'));
    const slideIds=slides.map((_:any,i:number)=>`<p:sldId id="${256+i}" r:id="rId${i+1}"/>`).join('');
    z.file('ppt/presentation.xml',`<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst/><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${wide?'12192000':'9144000'}" cy="6858000"/></p:presentation>`);
    z.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_:any,i:number)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`); const theme=d.theme||{}; z.file('ppt/theme/theme1.xml',`<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IMKAN Theme"><a:themeElements><a:clrScheme name="IMKAN"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="${String(theme.accent||'#2563eb').replace('#','')}"/></a:accent1><a:accent2><a:srgbClr val="${String(theme.secondary||'#64748b').replace('#','')}"/></a:accent2></a:clrScheme><a:fontScheme name="IMKAN"><a:majorFont><a:latin typeface="${esc(String(theme.headingFont||theme.fontFamily||'Arial'))}"/></a:majorFont><a:minorFont><a:latin typeface="${esc(String(theme.fontFamily||'Arial'))}"/></a:minorFont></a:fontScheme><a:fmtScheme name="IMKAN"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`); z.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_:any,i:number)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}<Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`);
    slides.forEach((s:any,i:number)=>{
      const shapes=(s.elements||[]).map((e:any,j:number)=>{
        const x=Math.round((Number(e.x)||0)/100*(wide?12192000:9144000)),y=Math.round((Number(e.y)||0)/100*6858000),cx=Math.round((Number(e.width)||10)/100*(wide?12192000:9144000)),cy=Math.round((Number(e.height)||10)/100*6858000);
        const fill=e.fill&&/^#[0-9a-f]{6}$/i.test(e.fill)?`<a:solidFill><a:srgbClr val="${e.fill.slice(1)}"/></a:solidFill>`:'<a:noFill/>';
        if(e.type==='image' && e.src){ const parsed=dataUri(e.src); if(parsed){ const relId=`rIdImg${i+1}_${j+1}`; z.file(`ppt/media/image${i+1}_${j+1}.${parsed.ext}`,parsed.buffer); if(!slideImageRels[i]) slideImageRels[i]=[]; slideImageRels[i].push({relId,target:`../media/image${i+1}_${j+1}.${parsed.ext}`}); return `<p:pic><p:nvPicPr/><p:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`; } }
        if(e.type==='line') return `<p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="line"/><a:ln w="12700"><a:solidFill><a:srgbClr val="${String(e.color||'#64748b').replace('#','')}"/></a:solidFill></a:ln></p:spPr></p:sp>`;
        const text=e.type==='text'?esc(String(e.text||'')):''; const rpr=`<a:rPr lang="en-US"${e.fontSize?` sz="${Math.round(Number(e.fontSize)*100)}"`:''}${e.bold?' b="1"':''}${e.italic?' i="1"':''}${e.underline?' u="sng"':''}>${e.color&&/^#[0-9a-f]{6}$/i.test(e.color)?`<a:solidFill><a:srgbClr val="${e.color.slice(1)}"/></a:solidFill>`:''}${e.fontFamily?`<a:latin typeface="${esc(e.fontFamily)}"/>`:''}</a:rPr>`;
        return `<p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${e.type==='shape'?`<a:prstGeom prst="${e.shape==='circle'?'ellipse':'roundRect'}"><a:avLst/></a:prstGeom>${fill}`:'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'}</p:spPr>${text?`<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${rpr}<a:t>${text}</a:t></a:r></a:p></p:txBody>`:''}</p:sp>`;
      }).join('');
      const bg=s.background&&/^#[0-9a-f]{6}$/i.test(s.background)?`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${s.background.slice(1)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`:'';
      z.file(`ppt/slides/slide${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${bg}<p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
      if(slideImageRels[i]?.length) z.file(`ppt/slides/_rels/slide${i+1}.xml.rels`,`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideImageRels[i].map((r:any)=>`<Relationship Id="${r.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('')}</Relationships>`);
    });
    this.restorePreservation(z, d?._ooxmlPreservation); await this.mergePreservedRelationships(z, d?._ooxmlPreservation);
    return z.generateAsync({type:'nodebuffer'});
  }
  private async required(z:JSZip,path:string){const f=z.file(path);if(!f)throw new BadRequestException(`Invalid Office package: missing ${path}`);return f;}
}
function runsXml(runs:any[],align:string,hyperlinkIds?:Map<string,string>){return (runs.length?runs:[{text:''}]).map((r:any)=>{const p:string[]=[];if(r.bold)p.push('<w:b/>');if(r.italic)p.push('<w:i/>');if(r.underline)p.push('<w:u w:val="single"/>');if(r.strike)p.push('<w:strike/>');if(r.fontSize)p.push(`<w:sz w:val="${Math.round(Number(r.fontSize)*2)}"/>`);if(r.fontFamily)p.push(`<w:rFonts w:ascii="${esc(r.fontFamily)}" w:hAnsi="${esc(r.fontFamily)}"/>`);if(r.color&&/^#[0-9a-f]{6}$/i.test(r.color))p.push(`<w:color w:val="${r.color.slice(1)}"/>`);if(r.verticalAlign)p.push(`<w:vertAlign w:val="${r.verticalAlign}"/>`);if(r.highlight)p.push(`<w:highlight w:val="yellow"/>`);const run=`<w:r>${p.length?`<w:rPr>${p.join('')}</w:rPr>`:''}<w:t xml:space="preserve">${esc(String(r.text||''))}</w:t></w:r>`; const hid=hyperlinkIds?.get(String(r.href||'')); return hid?`<w:hyperlink r:id="${hid}">${run}</w:hyperlink>`:run;}).join('');}
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
function contentTypes(kind:string,header=false,footer=false,media=false,numbering=false){const main=kind==='wordprocessingml.document'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml':kind==='spreadsheetml.sheet'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml':'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/${kind==='wordprocessingml.document'?'word/document.xml':kind==='spreadsheetml.sheet'?'xl/workbook.xml':'ppt/presentation.xml'}" ContentType="${main}"/>${header?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':''}${footer?'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>':''}${numbering?'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>':''}</Types>`;}
function rels(_kind:string){return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;}
function rootRels(kind:string){const target=kind==='wordprocessingml.document'?'word/document.xml':kind==='spreadsheetml.sheet'?'xl/workbook.xml':'ppt/presentation.xml';const type=kind==='wordprocessingml.document'?'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument':kind==='spreadsheetml.sheet'?'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument':'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${type}" Target="${target}"/></Relationships>`;}

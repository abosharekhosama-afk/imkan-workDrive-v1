export type EmuBox = { x: number; y: number; cx: number; cy: number; rot?: number };
export type GroupFrame = EmuBox & { chX: number; chY: number; chCx: number; chCy: number };
export type SlidePiece = { kind: 'shape' | 'picture' | 'line' | 'table'; xml: string; box: EmuBox };

const decodeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function xmlAttr(source: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(source)?.[1];
}

function numAttr(source: string, name: string): number {
  const value = Number(xmlAttr(source, name) || '');
  return Number.isFinite(value) ? value : 0;
}

function tagAttrs(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b([^>]*?)\\/?>`).exec(xml)?.[1] || '';
}

export function firstBox(xml: string): EmuBox {
  // Collect every xfrm on the element and pick the largest extent (ignores empty placeholders).
  // Attribute order is independent. Supports both a:xfrm and p:xfrm.
  const blocks = [
    ...xml.matchAll(/<(?:a|p):xfrm\b[^>]*>[\s\S]*?<\/(?:a|p):xfrm>/g),
    ...xml.matchAll(/<(?:a|p):xfrm\b[^>]*\/>/g),
  ].map((m) => m[0]);
  if (!blocks.length) blocks.push(xml);

  let best: EmuBox = { x: 0, y: 0, cx: 0, cy: 0 };
  let bestArea = -1;
  for (const block of blocks) {
    const off = tagAttrs(block, 'a:off') || tagAttrs(block, 'p:off');
    const ext = tagAttrs(block, 'a:ext') || tagAttrs(block, 'p:ext');
    // Also accept off/ext attributes written without a nested tag (rare).
    const x = numAttr(off, 'x') || numAttr(block, 'x');
    const y = numAttr(off, 'y') || numAttr(block, 'y');
    const cx = numAttr(ext, 'cx') || numAttr(block, 'cx');
    const cy = numAttr(ext, 'cy') || numAttr(block, 'cy');
    const open = tagAttrs(block, 'a:xfrm') || tagAttrs(block, 'p:xfrm') || '';
    const rotRaw = xmlAttr(open, 'rot');
    const rot = rotRaw && Number.isFinite(Number(rotRaw)) ? Number(rotRaw) / 60000 : undefined;
    const area = Math.abs(cx * cy);
    if (area > bestArea) {
      bestArea = area;
      best = { x, y, cx, cy, rot };
    }
  }
  return best;
}

export function groupFrame(xml: string): GroupFrame {
  const box = firstBox(xml);
  return {
    ...box,
    chX: numAttr(tagAttrs(xml, 'a:chOff'), 'x'),
    chY: numAttr(tagAttrs(xml, 'a:chOff'), 'y'),
    chCx: numAttr(tagAttrs(xml, 'a:chExt'), 'cx'),
    chCy: numAttr(tagAttrs(xml, 'a:chExt'), 'cy'),
  };
}

export function mapChildBox(group: GroupFrame, child: EmuBox): EmuBox {
  const sx = group.chCx ? group.cx / group.chCx : 1;
  const sy = group.chCy ? group.cy / group.chCy : 1;
  return {
    x: group.x + (child.x - group.chX) * sx,
    y: group.y + (child.y - group.chY) * sy,
    cx: child.cx * sx,
    cy: child.cy * sy,
  };
}

export function boxPercent(box: EmuBox, slideCx: number, slideCy: number) {
  const slideW = slideCx > 0 ? slideCx : 12192000;
  const slideH = slideCy > 0 ? slideCy : 6858000;
  // Guard: if caller accidentally passes already-normalized percentages, keep them.
  const alreadyPercent =
    Math.abs(box.x) <= 100 &&
    Math.abs(box.y) <= 100 &&
    box.cx > 0 &&
    box.cx <= 100 &&
    box.cy > 0 &&
    box.cy <= 100;
  if (alreadyPercent) {
    return {
      x: Math.max(0, Math.min(100, box.x)),
      y: Math.max(0, Math.min(100, box.y)),
      width: Math.max(0.5, Math.min(100, box.cx)),
      height: Math.max(0.5, Math.min(100, box.cy)),
      rotation: typeof box.rot === 'number' && Number.isFinite(box.rot) ? box.rot : 0,
    };
  }
  const sx = 100 / slideW;
  const sy = 100 / slideH;
  const rawW = (box.cx > 0 ? box.cx : slideW * 0.08) * sx;
  const rawH = (box.cy > 0 ? box.cy : slideH * 0.08) * sy;
  return {
    x: Math.max(0, Math.min(100, box.x * sx)),
    y: Math.max(0, Math.min(100, box.y * sy)),
    width: Math.max(0.5, Math.min(100, rawW)),
    height: Math.max(0.5, Math.min(100, rawH)),
    rotation: typeof box.rot === 'number' && Number.isFinite(box.rot) ? box.rot : 0,
  };
}

/** Convert a raw element box that may still be in EMUs into slide percentages. */
export function coerceElementGeometry(
  el: { x?: number; y?: number; width?: number; height?: number; rotation?: number },
  slideCx = 12192000,
  slideCy = 6858000,
) {
  const x = Number(el?.x) || 0;
  const y = Number(el?.y) || 0;
  const width = Number(el?.width) || 0;
  const height = Number(el?.height) || 0;
  const looksEmu = [x, y, width, height].some((v) => Math.abs(v) > 100);
  if (looksEmu) {
    return boxPercent({ x, y, cx: width, cy: height, rot: el?.rotation }, slideCx, slideCy);
  }
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
    width: Math.max(0.5, Math.min(100, width || 10)),
    height: Math.max(0.5, Math.min(100, height || 10)),
    rotation: typeof el?.rotation === 'number' && Number.isFinite(el.rotation) ? el.rotation : 0,
  };
}

function balancedEnd(xml: string, start: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>])[^>]*>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return xml.length;
}

export function slidePieces(xml: string, origin?: GroupFrame): SlidePiece[] {
  const pieces: SlidePiece[] = [];
  const re = /<p:(sp|pic|cxnSp|graphicFrame|grpSp)(?=[\s>])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const tag = match[1];
    const end = balancedEnd(xml, match.index, `p:${tag}`);
    if (end <= match.index) {
      re.lastIndex = match.index + match[0].length;
      continue;
    }
    const chunk = xml.slice(match.index, end);
    re.lastIndex = end;
    if (tag === 'grpSp') {
      const props = /<p:grpSpPr[\s\S]*?<\/p:grpSpPr>/.exec(chunk)?.[0] || '';
      const frame = groupFrame(props);
      const placed = origin ? { ...frame, ...mapChildBox(origin, frame) } : frame;
      const bodyAt = chunk.indexOf('</p:grpSpPr>');
      const body = bodyAt >= 0 ? chunk.slice(bodyAt + '</p:grpSpPr>'.length) : chunk;
      pieces.push(...slidePieces(body, placed));
      continue;
    }
    const box = origin ? mapChildBox(origin, firstBox(chunk)) : firstBox(chunk);
    const kind = tag === 'pic' ? 'picture' : tag === 'cxnSp' ? 'line' : tag === 'graphicFrame' ? 'table' : 'shape';
    pieces.push({ kind, xml: chunk, box });
  }
  return pieces;
}

export function drawingText(xml: string): string {
  const body = /<(?:p|a):txBody>([\s\S]*?)<\/(?:p|a):txBody>/.exec(xml)?.[1] ?? '';
  if (!body) return '';
  const paragraphs = [...body.matchAll(/<a:p(?=[\s>])[\s\S]*?<\/a:p>/g)].map((item) => item[0]);
  const sources = paragraphs.length ? paragraphs : [body];
  return sources.map((paragraph) => {
    const bits: string[] = [];
    for (const item of paragraph.matchAll(/<a:br\b[^>]*\/>|<a:t(?=[\s>])[^>]*>([\s\S]*?)<\/a:t>/g)) {
      bits.push(item[1] === undefined ? '\n' : decodeXml(item[1]));
    }
    return bits.join('');
  }).join('\n');
}

export function wordFlowText(xml: string): string {
  const paragraphs = [...xml.matchAll(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g)].map((item) => item[0]);
  const sources = paragraphs.length ? paragraphs : [xml];
  return sources.map((paragraph) => {
    const bits: string[] = [];
    for (const item of paragraph.matchAll(/<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>|<w:t(?=[\s>])[^>]*>([\s\S]*?)<\/w:t>/g)) {
      if (item[1] !== undefined) bits.push(decodeXml(item[1]));
      else if (item[0].startsWith('<w:tab')) bits.push('\t');
      else bits.push('\n');
    }
    return bits.join('');
  }).join('\n');
}

export function wordDirection(paragraphProps: string, alignVal?: string): 'rtl' | 'ltr' | 'auto' {
  const bidi = /<w:bidi\b([^>]*)\/?>/.exec(paragraphProps);
  if (bidi) {
    const value = /\bw:val="([^"]+)"/.exec(bidi[1] || '')?.[1];
    if (!value || value === '1' || value === 'true') return 'rtl';
    return 'ltr';
  }
  return alignVal === 'left' ? 'ltr' : 'auto';
}

export function outerElements(xml: string, tag: string): Array<{ xml: string; index: number }> {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>])[^>]*>`, 'g');
  const out: Array<{ xml: string; index: number }> = [];
  let depth = 0;
  let from = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const token = match[0];
    const closing = Boolean(match[1]);
    if (!closing && /\/>$/.test(token)) {
      if (depth === 0) out.push({ xml: token, index: match.index });
      continue;
    }
    if (!closing) {
      if (depth === 0) from = match.index;
      depth += 1;
      continue;
    }
    depth = Math.max(0, depth - 1);
    if (depth === 0 && from >= 0) {
      out.push({ xml: xml.slice(from, re.lastIndex), index: from });
      from = -1;
    }
  }
  return out;
}

export function slideCanvas(presXml: string): { cx: number; cy: number } {
  const attrs = tagAttrs(presXml || '', 'p:sldSz');
  const cx = Number(xmlAttr(attrs, 'cx') || '');
  const cy = Number(xmlAttr(attrs, 'cy') || '');
  return {
    cx: Number.isFinite(cx) && cx > 0 ? cx : 12192000,
    cy: Number.isFinite(cy) && cy > 0 ? cy : 6858000,
  };
}

export function maskBalanced(xml: string, tag: string): string {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>])[^>]*>`, 'g');
  const ranges: Array<[number, number]> = [];
  let depth = 0;
  let from = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    if (!match[1]) {
      if (depth === 0) from = match.index;
      depth += 1;
    } else {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && from >= 0) {
        ranges.push([from, re.lastIndex]);
        from = -1;
      }
    }
  }
  if (!ranges.length) return xml;
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    out += xml.slice(cursor, start) + ' '.repeat(end - start);
    cursor = end;
  }
  return out + xml.slice(cursor);
}

export function blipEmbedId(xml: string): string | undefined {
  const tag = /<a:blip\b([^>]*)\/?>/.exec(xml)?.[1] || '';
  return xmlAttr(tag, 'r:embed') || xmlAttr(tag, 'r:link');
}

export function relationshipMap(relsXml: string): Record<string, { target: string; type: string }> {
  const map: Record<string, { target: string; type: string }> = {};
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
    const attrs = match[1] || '';
    const id = xmlAttr(attrs, 'Id');
    const target = xmlAttr(attrs, 'Target');
    if (id && target) map[id] = { target, type: xmlAttr(attrs, 'Type') || '' };
  }
  return map;
}

export function resolvePackageTarget(source: string, target: string): string {
  if (!target) return '';
  if (target.startsWith('/')) return target.slice(1);
  const base = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
  const out: string[] = [];
  for (const part of (base + target).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function slideNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] || 0);
}

function imageMime(path: string): string | null {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return null;
}

function usableImageSrc(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  if (/^https?:\/\//i.test(src) || src.startsWith('blob:')) return src.length > 8;
  const payload = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(src)?.[1];
  return Boolean(payload && payload.length >= 8 && payload.length % 4 === 0);
}

export function showHasEmbeddedImage(content: { slides?: Array<{ elements?: Array<{ type?: string; src?: string }> }> } | null | undefined): boolean {
  return Boolean(content?.slides?.some((slide) => slide.elements?.some((element) => element?.type === 'image' && usableImageSrc(element.src))));
}

export function repairShowFromPreservation(content: any): any {
  if (!content || content.type !== 'SHOW' || showHasEmbeddedImage(content)) return content;
  const parts = content._ooxmlPreservation?.parts;
  if (!parts || typeof parts !== 'object') return content;
  const slidePaths = Object.keys(parts).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => slideNumber(a) - slideNumber(b));
  if (!slidePaths.some((path) => Buffer.from(parts[path], 'base64').toString('utf8').includes('<p:pic'))) return content;
  const previous = Array.isArray(content.slides) ? content.slides : [];
  const slides = slidePaths.map((path, index) => {
    const xml = Buffer.from(parts[path], 'base64').toString('utf8');
    const relPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = parts[relPath] ? Buffer.from(parts[relPath], 'base64').toString('utf8') : '';
    const relMap = relationshipMap(rels);
    const canvas = content.aspectRatio === '4:3' ? { cx: 9144000, cy: 6858000 } : { cx: 12192000, cy: 6858000 };
    const elements = slidePieces(xml).map((piece, pieceIndex) => {
      const box = boxPercent(piece.box, canvas.cx, canvas.cy);
      const id = `el-${index + 1}-${pieceIndex + 1}`;
      if (piece.kind === 'picture') {
        const embed = blipEmbedId(piece.xml);
        const target = embed ? relMap[embed]?.target : '';
        const imagePath = resolvePackageTarget(path, target || '');
        const mime = imageMime(imagePath);
        const bytes = mime && parts[imagePath] ? parts[imagePath] : '';
        if (!bytes) return null;
        return { id, type: 'image', ...box, src: `data:${mime};base64,${bytes}`, alt: 'Imported image' };
      }
      if (piece.kind === 'line') return { id, type: 'line', ...box, color: '#64748b' };
      if (piece.kind === 'table') {
        const rows = [...piece.xml.matchAll(/<a:tr[\s\S]*?>([\s\S]*?)<\/a:tr>/g)].map((row) => [...row[1].matchAll(/<a:tc[\s\S]*?>([\s\S]*?)<\/a:tc>/g)].map((cell) => drawingText(cell[1]) || wordFlowText(cell[1])));
        return { id, type: 'table', ...box, rows };
      }
      const text = drawingText(piece.xml);
      if (text.trim()) return { id, type: 'text', ...box, text, fontSize: 20, align: 'start', direction: /(?:rtl|rightToLeft)\s*=\s*"(?:1|true)"/i.test(piece.xml) ? 'rtl' : 'ltr' };
      return { id, type: 'shape', ...box, shape: 'rect', fill: '#e2e8f0' };
    }).filter((element) => element);
    return {
      ...(previous[index] || {}),
      id: previous[index]?.id || `slide-${index + 1}`,
      elements,
      notes: typeof previous[index]?.notes === 'string' ? previous[index].notes : '',
    };
  });
  if (!slides.some((slide) => slide.elements.some((element: { type?: string; src?: string }) => element.type === 'image' && element.src))) return content;
  return { ...content, slides, activeSlide: content.activeSlide || slides[0].id };
}

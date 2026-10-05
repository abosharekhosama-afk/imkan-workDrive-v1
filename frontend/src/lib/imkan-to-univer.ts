/**
 * Convert IMKAN Office document JSON (from backend conversion/bootstrap)
 * into Univer unit snapshots so file content is visible in the editor.
 */

export type UniverKind = "writer" | "sheet" | "show";

/** A1 → { row: 0, col: 0 } */
function a1ToRowCol(ref: string): { row: number; col: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref).trim());
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  col -= 1;
  const row = Number(m[2]) - 1;
  if (row < 0 || col < 0) return null;
  return { row, col };
}

function writerRunsToText(runs: unknown): string {
  if (!Array.isArray(runs)) return "";
  return runs
    .map((r) => {
      if (!r || typeof r !== "object") return "";
      const t = (r as any).text;
      return typeof t === "string" ? t : "";
    })
    .join("");
}

function tableLines(block: any): string[] {
  const rows = Array.isArray(block?.rows)
    ? block.rows
    : Array.isArray(block?.table?.rows)
      ? block.table.rows
      : [];
  return rows.map((row: any) => {
    const cells = Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : [];
    return cells
      .map((cell: any) => (typeof cell === "string" ? cell : writerRunsToText(cell?.runs) || String(cell?.text ?? "")))
      .join("\t");
  });
}

/** Univer paints a paragraph only when startIndex points at its `\r` break, and only if a text run covers the glyphs. */
function univerDocBody(lines: string[]) {
  const paragraphs: Array<{ startIndex: number }> = [];
  const textRuns: Array<{ st: number; ed: number; ts: { fs: number; ff?: string; cl?: { rgb: string } } }> = [];
  const parts: string[] = [];
  let index = 0;
  const source = lines.length > 0 ? lines : [""];
  for (const line of source) {
    const text = String(line).replace(/[\r\n]/g, " ");
    if (text.length > 0) textRuns.push({ st: index, ed: index + text.length, ts: { fs: 14, ff: "Arial", cl: { rgb: "rgb(17,24,39)" } } });
    parts.push(text + "\r");
    paragraphs.push({ startIndex: index + text.length });
    index += text.length + 1;
  }
  const dataStream = parts.join("") + "\n";
  return {
    dataStream,
    textRuns,
    paragraphs,
    sectionBreaks: [{ startIndex: dataStream.length - 1 }],
  };
}

const SLIDE_WIDTH = 960;
const SLIDE_HEIGHT = 540;

function slideMeasure(value: unknown, size: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 0 && n <= 100) return Math.round((n / 100) * size);
  return Math.round(n);
}

function slideTextElement(
  id: string,
  text: string,
  box: { left: number; top: number; width: number; height: number },
  zIndex: number,
  fontSize = 20,
  paint?: { color?: unknown; bold?: boolean },
) {
  const visible = text.slice(0, 4000);
  return {
    id,
    zIndex,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    title: visible.slice(0, 80) || id,
    description: "",
    type: 2,
    richText: {
      text: visible,
      fs: fontSize,
      ff: "Arial",
      bl: paint?.bold ? 1 : 0,
      cl: { rgb: toRgb(paint?.color) || "rgb(17,24,39)" },
    },
  };
}

function univerDocumentStyle() {
  return {
    pageSize: { width: 793.7, height: 1122.5 },
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    documentFlavor: 1,
    textStyle: { fs: 14, ff: "Arial", cl: { rgb: "rgb(17,24,39)" } },
  };
}

/**
 * IMKAN writer → Univer Docs body snapshot
 * IMKAN: { type:'WRITER', title, blocks:[{ type, runs:[{text}] }] }
 */
export function imkanWriterToUniverDoc(content: any, titleFallback = "Document"): Record<string, unknown> {
  const title = typeof content?.title === "string" ? content.title : titleFallback;
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];

  const lines: string[] = [];
  for (const block of blocks) {
    const type = String(block?.type || "paragraph");
    if (type === "page-break") {
      lines.push("");
      continue;
    }
    if (type === "table") {
      const rows = tableLines(block);
      lines.push(...(rows.length ? rows : [""]));
      continue;
    }
    const fromRuns = writerRunsToText(block?.runs);
    lines.push(fromRuns || (typeof block?.text === "string" ? block.text : ""));
  }

  return {
    id: `doc-${Date.now()}`,
    title,
    body: univerDocBody(lines),
    documentStyle: univerDocumentStyle(),
  };
}

/**
 * IMKAN sheet → Univer Sheets workbook snapshot
 * IMKAN: { type:'SHEET', sheets:[{ id, name, cells: { A1: { value } } }] }
 */
export function imkanSheetToUniverSheet(content: any, titleFallback = "Workbook"): Record<string, unknown> {
  const title = typeof content?.title === "string" ? content.title : titleFallback;
  const sheetsIn = Array.isArray(content?.sheets) ? content.sheets : [];
  const sheetOrder: string[] = [];
  const sheets: Record<string, unknown> = {};

  const list = sheetsIn.length > 0 ? sheetsIn : [{ id: "sheet-1", name: "Sheet1", cells: {} }];

  for (let si = 0; si < list.length; si++) {
    const src = list[si] || {};
    const id = String(src.id || `sheet-${si + 1}`);
    const name = String(src.name || `Sheet${si + 1}`).slice(0, 31);
    sheetOrder.push(id);

    const cellData: Record<number, Record<number, unknown>> = {};
    const cells = src.cells && typeof src.cells === "object" ? src.cells : {};
    let maxCol = 0;

    for (const [ref, cell] of Object.entries(cells as Record<string, any>)) {
      // Support A1 keys and "r,c" keys
      let rowCol = a1ToRowCol(ref);
      if (!rowCol && ref.includes(",")) {
        const [r, c] = ref.split(",").map((x) => Number(x));
        if (Number.isFinite(r) && Number.isFinite(c)) rowCol = { row: r, col: c };
      }
      if (!rowCol && ref.includes(":")) {
        const [r, c] = ref.split(":").map((x) => Number(x));
        if (Number.isFinite(r) && Number.isFinite(c)) rowCol = { row: r, col: c };
      }
      if (!rowCol) continue;

      const value = cell?.value ?? cell?.v ?? null;
      const formula = typeof cell?.formula === "string" ? cell.formula : undefined;
      const entry: Record<string, unknown> = {};
      if (formula) {
        entry.f = formula.startsWith("=") ? formula : `=${formula}`;
      }
      if (typeof value === "number") {
        entry.v = value;
        entry.t = 2; // number
      } else if (typeof value === "boolean") {
        entry.v = value;
        entry.t = 3;
      } else if (value != null && value !== "") {
        entry.v = String(value);
        entry.t = 1; // string
      } else if (!formula) {
        continue;
      }

      if (!cellData[rowCol.row]) cellData[rowCol.row] = {};
      cellData[rowCol.row][rowCol.col] = entry;
      maxCol = Math.max(maxCol, rowCol.col);
    }

    const usedRows = Object.keys(cellData).map((row) => Number(row));
    sheets[id] = {
      id,
      name,
      rowCount: Math.max(100, ...usedRows.map((row) => row + 10), 100),
      columnCount: Math.max(26, maxCol + 5),
      zoomRatio: 1,
      cellData,
      mergeData: [],
      rowData: {},
      columnData: {},
      showGridlines: 1,
    };
  }

  return {
    id: `workbook-${Date.now()}`,
    name: title,
    appVersion: "0.25.1",
    locale: "enUS",
    sheetOrder,
    sheets,
    styles: {},
  };
}

function toRgb(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^rgb\(/i.test(v)) return v;
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

function slideBox(el: any, kind: string, index: number) {
  const left = slideMeasure(el?.x ?? el?.left, SLIDE_WIDTH, 72);
  const top = slideMeasure(el?.y ?? el?.top, SLIDE_HEIGHT, 48 + index * 8);
  const width = Math.max(kind === "image" ? 24 : 40, slideMeasure(el?.width, SLIDE_WIDTH, kind === "shape" ? 200 : 640));
  const height = Math.max(kind === "image" ? 24 : 20, slideMeasure(el?.height, SLIDE_HEIGHT, kind === "shape" ? 48 : 72));
  return { left, top, width, height };
}

/** Univer 0.25 paints text only when type is PageElementType.TEXT (2) and richText.text is set. */
function pushSlideElement(pageElements: Record<string, unknown>, el: any, index: number) {
  const kind = String(el?.type || "text");
  const eid = String(el?.id || `el-${index + 1}`);
  const box = slideBox(el, kind, index);
  const zIndex = index + 1;
  if (kind === "image" && typeof el?.src === "string" && el.src.startsWith("data:")) {
    pageElements[eid] = {
      id: eid,
      zIndex,
      ...box,
      title: String(el.alt || eid),
      description: "",
      type: 1,
      image: { imageProperties: { contentUrl: el.src } },
    };
    return;
  }
  if (kind === "shape") {
    const preset = el?.shape === "circle" || el?.shape === "ellipse" ? "ellipse" : el?.shape === "roundRect" ? "roundRect" : "rect";
    const fill = toRgb(el?.fill);
    if (!fill) return;
    pageElements[eid] = {
      id: eid,
      zIndex,
      ...box,
      title: eid,
      description: "",
      type: 0,
      shape: { shapeType: preset, text: "", shapeProperties: { shapeBackgroundFill: { rgb: fill } } },
    };
    return;
  }
  if (kind === "table") {
    const rows = Array.isArray(el?.rows) ? el.rows : [];
    const text = rows.map((row: unknown) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")).join("\t") : "")).filter(Boolean).join("\n");
    if (text.trim()) pageElements[eid] = slideTextElement(eid, text, box, zIndex, 14);
    return;
  }
  if (kind === "chart") {
    const title = typeof el?.chart?.title === "string" && el.chart.title.trim() ? el.chart.title : "Chart";
    pageElements[eid] = slideTextElement(eid, title, box, zIndex, 18);
    return;
  }
  const text = typeof el?.text === "string" ? el.text : "";
  if (!text.trim()) return;
  const fontSize = Number(el?.fontSize);
  pageElements[eid] = slideTextElement(
    eid,
    text,
    box,
    zIndex,
    Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 20,
    { color: el?.color, bold: Boolean(el?.bold) },
  );
}

/**
 * IMKAN show → basic Univer slide deck (text elements from slide content)
 */
export function imkanShowToUniverSlide(content: any, titleFallback = "Presentation"): Record<string, unknown> {
  const title = typeof content?.title === "string" ? content.title : titleFallback;
  const slidesIn = Array.isArray(content?.slides) ? content.slides : [];
  const slideOrder: string[] = [];
  const slides: Record<string, unknown> = {};

  const list = slidesIn.length > 0 ? slidesIn : [{ id: "slide-1", elements: [] }];

  for (let i = 0; i < list.length; i++) {
    const src = list[i] || {};
    const id = String(src.id || `slide-${i + 1}`);
    slideOrder.push(id);
    const elements = Array.isArray(src.elements) ? src.elements : [];
    const pageElements: Record<string, unknown> = {};

    elements.forEach((el: any, ei: number) => pushSlideElement(pageElements, el, ei));

    if (Object.keys(pageElements).length === 0) {
      const label = i === 0 ? title : `Slide ${i + 1}`;
      pageElements.title = slideTextElement("title", label, { left: 72, top: 180, width: 800, height: 90 }, 1, 32);
    }

    const background = typeof src.background === "string" && src.background.startsWith("#") ? src.background : "#ffffff";
    slides[id] = {
      id,
      name: labelOf(src, i),
      pageType: 0,
      zIndex: i + 1,
      title: id,
      description: "",
      pageBackgroundFill: { rgb: hexToRgb(background) },
      pageElements,
      elementOrder: Object.keys(pageElements),
      elements: pageElements,
    };
  }

  return univerSlideSnapshot(title, slideOrder, slides);
}

function labelOf(src: any, index: number) {
  return typeof src?.name === "string" && src.name.trim() ? src.name : `Slide ${index + 1}`;
}

function hexToRgb(hex: string) {
  return toRgb(hex) || "rgb(255,255,255)";
}

export function emptyUniverPresentation(title = "Presentation"): Record<string, unknown> {
  const id = "slide-1";
  const label = title || "Presentation";
  const slides = {
    [id]: {
      id,
      pageType: 0,
      zIndex: 1,
      title: id,
      description: "",
      pageBackgroundFill: { rgb: "rgb(255,255,255)" },
      pageElements: {
        title: slideTextElement("title", label, { left: 72, top: 180, width: 800, height: 90 }, 1, 32),
      },
    },
  };
  return { ...univerSlideSnapshot(label, [id], slides), id: "presentation-blank" };
}

export function univerSlideSnapshot(title: string, slideOrder: string[], slides: Record<string, unknown>) {
  return {
    id: `presentation-${Date.now()}`,
    title,
    name: title,
    pageSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    defaultPageSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    body: { pageOrder: slideOrder, pages: slides },
    slideOrder,
    slides,
    activeSlideId: slideOrder[0],
  };
}

/** Fill the glyph runs Univer Docs needs before the first keystroke. */
export function ensureUniverDocSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const body = snapshot.body as { dataStream?: string; textRuns?: unknown[]; paragraphs?: unknown[]; sectionBreaks?: unknown[] } | undefined;
  if (!body?.dataStream) return snapshot;
  const stream = String(body.dataStream);
  const textRuns = Array.isArray(body.textRuns) && body.textRuns.length
    ? body.textRuns
    : (() => {
        const runs: Array<{ st: number; ed: number; ts: { fs: number; ff: string; cl: { rgb: string } } }> = [];
        let start = 0;
        for (let i = 0; i < stream.length; i++) {
          if (stream[i] === "\r" || stream[i] === "\n") {
            if (i > start) runs.push({ st: start, ed: i, ts: { fs: 14, ff: "Arial", cl: { rgb: "rgb(17,24,39)" } } });
            start = i + 1;
          }
        }
        return runs;
      })();
  return {
    ...snapshot,
    documentStyle: snapshot.documentStyle ?? univerDocumentStyle(),
    body: { ...body, textRuns },
  };
}

function normalizePageElements(raw: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [key, el] of Object.entries(raw || {})) {
    if (!el || typeof el !== "object") continue;
    const type = Number(el.type);
    if (type === 2 && el.richText && typeof el.richText.text === "string" && el.richText.text.length > 0) {
      out[key] = { ...el, type: 2, description: el.description ?? "", title: el.title || key };
      continue;
    }
    if (type === 1 && el.image) {
      out[key] = el;
      continue;
    }
    if (type === 0 && el.shape) {
      out[key] = el;
      continue;
    }
    const text = typeof el.richText?.text === "string" ? el.richText.text : typeof el.text === "string" ? el.text : "";
    if (!text.trim()) continue;
    const left = Number.isFinite(Number(el.left)) ? Number(el.left) : slideMeasure(el.x, SLIDE_WIDTH, 72);
    const top = Number.isFinite(Number(el.top)) ? Number(el.top) : slideMeasure(el.y, SLIDE_HEIGHT, 64);
    const width = Math.max(40, Number.isFinite(Number(el.width)) ? Number(el.width) : slideMeasure(el.width, SLIDE_WIDTH, 640));
    const height = Math.max(20, Number.isFinite(Number(el.height)) ? Number(el.height) : slideMeasure(el.height, SLIDE_HEIGHT, 72));
    out[key] = slideTextElement(String(el.id || key), text, { left, top, width, height }, Number(el.zIndex) || 1, Number(el.richText?.fs || el.fontSize) || 20, {
      color: el.richText?.cl?.rgb || el.color,
      bold: Boolean(el.richText?.bl || el.bold),
    });
  }
  return out;
}

function normalizeSlidePages(record: Record<string, any>) {
  const pages: Record<string, unknown> = {};
  for (const [id, page] of Object.entries(record || {})) {
    if (!page || typeof page !== "object") continue;
    const fromPage = page.pageElements && typeof page.pageElements === "object" ? page.pageElements : null;
    const fromElements = page.elements && typeof page.elements === "object" ? page.elements : null;
    const source = fromPage && Object.keys(fromPage).length ? fromPage : fromElements || {};
    pages[id] = {
      id: page.id || id,
      pageType: 0,
      zIndex: Number(page.zIndex) || 1,
      title: typeof page.title === "string" ? page.title : id,
      description: typeof page.description === "string" ? page.description : "",
      pageBackgroundFill: page.pageBackgroundFill || { rgb: "rgb(255,255,255)" },
      pageElements: normalizePageElements(source),
    };
  }
  return pages;
}

/** Univer 0.25 draws `body.pages`; the text adaptor only accepts type 2. */
export function ensureUniverSlideSnapshot(snapshot: Record<string, unknown>, title = "Presentation"): Record<string, unknown> {
  const body = snapshot.body as { pageOrder?: string[]; pages?: Record<string, unknown> } | undefined;
  const pages = body?.pages && typeof body.pages === "object" ? body.pages : null;
  const record = (pages && Object.keys(pages).length ? pages : null)
    || (snapshot.slides && typeof snapshot.slides === "object" ? snapshot.slides as Record<string, unknown> : null);
  if (!record) return snapshot;
  const preferred = Array.isArray(body?.pageOrder) && body.pageOrder.length
    ? body.pageOrder
    : Array.isArray(snapshot.slideOrder) ? snapshot.slideOrder as string[] : [];
  const ids = (preferred.length ? preferred : Object.keys(record)).filter((id) => record[id]);
  if (!ids.length) return snapshot;
  const normalized = normalizeSlidePages(record);
  const label = String(snapshot.title || snapshot.name || title);
  return {
    ...univerSlideSnapshot(label, ids, normalized),
    id: snapshot.id || `presentation-${Date.now()}`,
    title: label,
    name: String(snapshot.name || snapshot.title || title),
    pageSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    defaultPageSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    body: { pageOrder: ids, pages: normalized },
    slideOrder: ids,
    slides: normalized,
    activeSlideId: ids.includes(String(snapshot.activeSlideId || "")) ? snapshot.activeSlideId : ids[0],
  };
}

/**
 * If content is IMKAN Office JSON, convert to a Univer snapshot for the given kind.
 * Returns null if content is empty / unknown.
 */
export function imkanContentToUniverSnapshot(
  content: unknown,
  kind: UniverKind,
  title?: string,
): Record<string, unknown> | null {
  if (!content || typeof content !== "object") return null;
  const c = content as any;
  // Already Univer
  if (c.__engine === "univer" && c.snapshot && typeof c.snapshot === "object") {
    const snap = c.snapshot as Record<string, unknown>;
    return Object.keys(snap).length ? snap : null;
  }

  const type = String(c.type || "").toUpperCase();
  if (kind === "sheet" || type === "SHEET") {
    if (Array.isArray(c.sheets) || type === "SHEET") return imkanSheetToUniverSheet(c, title);
    return null;
  }
  if (kind === "show" || type === "SHOW") {
    if (Array.isArray(c.slides) || type === "SHOW") return imkanShowToUniverSlide(c, title);
    return null;
  }
  // writer
  if (Array.isArray(c.blocks) || type === "WRITER") return imkanWriterToUniverDoc(c, title);
  return null;
}

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

/**
 * IMKAN writer → Univer Docs body snapshot
 * IMKAN: { type:'WRITER', title, blocks:[{ type, runs:[{text}] }] }
 */
export function imkanWriterToUniverDoc(content: any, titleFallback = "Document"): Record<string, unknown> {
  const title = typeof content?.title === "string" ? content.title : titleFallback;
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];

  const paragraphs: Array<{ startIndex: number }> = [];
  const parts: string[] = [];
  let index = 0;

  if (blocks.length === 0) {
    parts.push("\r");
    paragraphs.push({ startIndex: 0 });
  } else {
    for (const block of blocks) {
      const type = String(block?.type || "paragraph");
      if (type === "page-break") {
        // treat as empty paragraph
        parts.push("\r");
        paragraphs.push({ startIndex: index });
        index += 1;
        continue;
      }
      if (type === "table") {
        // Flatten table cells to lines
        const rows = Array.isArray(block?.rows) ? block.rows : [];
        for (const row of rows) {
          const cells = Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : [];
          const line = cells
            .map((c: any) => (typeof c === "string" ? c : writerRunsToText(c?.runs) || String(c?.text ?? "")))
            .join("\t");
          parts.push(line + "\r");
          paragraphs.push({ startIndex: index });
          index += line.length + 1;
        }
        continue;
      }
      const text = writerRunsToText(block?.runs);
      parts.push(text + "\r");
      paragraphs.push({ startIndex: index });
      index += text.length + 1;
    }
  }

  // Univer docs dataStream must end with \n (section break sentinel)
  const dataStream = parts.join("") + "\n";
  const sectionBreaks = [{ startIndex: dataStream.length - 1 }];

  return {
    id: `doc-${Date.now()}`,
    title,
    body: {
      dataStream,
      textRuns: [],
      paragraphs,
      sectionBreaks,
    },
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
    }

    sheets[id] = {
      id,
      name,
      rowCount: Math.max(100, ...Object.keys(cellData).map((r) => Number(r) + 10), 100),
      columnCount: 26,
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

    elements.forEach((el: any, ei: number) => {
      const eid = String(el?.id || `el-${ei + 1}`);
      const text = typeof el?.text === "string" ? el.text : "";
      pageElements[eid] = {
        id: eid,
        type: 0,
        left: Number(el?.x) || 80,
        top: Number(el?.y) || 80 + ei * 40,
        width: Number(el?.width) || 800,
        height: Number(el?.height) || 80,
        title: text.slice(0, 500),
      };
    });

    if (Object.keys(pageElements).length === 0) {
      pageElements["title"] = {
        id: "title",
        type: 0,
        left: 80,
        top: 200,
        width: 800,
        height: 80,
        title: i === 0 ? title : `Slide ${i + 1}`,
      };
    }

    slides[id] = {
      id,
      pageElements,
      pageType: 0,
    };
  }

  return {
    id: `presentation-${Date.now()}`,
    title,
    name: title,
    slideOrder,
    slides,
    defaultPageSize: { width: 960, height: 540 },
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

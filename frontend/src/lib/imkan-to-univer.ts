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

/** Univer paints a paragraph only when startIndex points at its `\r` break. */
function univerDocBody(lines: string[]) {
  const paragraphs: Array<{ startIndex: number }> = [];
  const parts: string[] = [];
  let index = 0;
  const source = lines.length > 0 ? lines : [""];
  for (const line of source) {
    const text = String(line).replace(/[\r\n]/g, " ");
    parts.push(text + "\r");
    paragraphs.push({ startIndex: index + text.length });
    index += text.length + 1;
  }
  const dataStream = parts.join("") + "\n";
  return {
    dataStream,
    textRuns: [],
    paragraphs,
    sectionBreaks: [{ startIndex: dataStream.length - 1 }],
  };
}

function univerDocumentStyle() {
  return {
    pageSize: { width: 595, height: 842 },
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
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
    lines.push(writerRunsToText(block?.runs));
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
      const visible = text.slice(0, 500);
      pageElements[eid] = {
        id: eid,
        zIndex: ei + 1,
        left: Number(el?.x) || 80,
        top: Number(el?.y) || 80 + ei * 40,
        width: Number(el?.width) || 800,
        height: Number(el?.height) || 80,
        title: visible,
        richText: {
          text: visible,
          rich: {
            id: `${eid}-doc`,
            body: univerDocBody([visible]),
            documentStyle: univerDocumentStyle(),
          },
        },
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

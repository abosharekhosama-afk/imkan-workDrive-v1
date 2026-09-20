import { Workbook, Sheet, cellKey, parseKey, formulaDisplay } from './model';

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut';
export type SheetChart = {
  id: string;
  type: ChartType;
  title: string;
  rangeStart: string;
  rangeEnd: string;
  position: { row: number; col: number };
  width: number;
  height: number;
  legend: boolean;
  showLabels: boolean;
  series?: string[];
};

export function rangeValues(sheet: Sheet, start: string, end: string, workbook: Workbook) {
  const a = parseKey(start), b = parseKey(end);
  if (!a || !b) return { labels: [], series: [] as number[][] };
  const labels: string[] = [], rows: number[][] = [];
  const minRow = Math.min(a.row, b.row), maxRow = Math.max(a.row, b.row);
  const minCol = Math.min(a.col, b.col), maxCol = Math.max(a.col, b.col);
  for (let r = minRow; r <= maxRow; r++) {
    labels.push(String(sheet.cells[cellKey(r, minCol)]?.value ?? ''));
    const row: number[] = [];
    for (let c = minCol + 1; c <= maxCol; c++) {
      const value = Number(formulaDisplay(sheet.cells[cellKey(r, c)], sheet, workbook));
      row.push(Number.isFinite(value) ? value : 0);
    }
    rows.push(row);
  }
  const width = rows.reduce((m, row) => Math.max(m, row.length), 0);
  const series = Array.from({ length: Math.max(1, width) }, (_, i) => rows.map(row => row[i] ?? 0));
  return { labels, series };
}

export function addChart(workbook: Workbook, type: ChartType, start: string, end: string, title: string) {
  const next = JSON.parse(JSON.stringify(workbook)) as Workbook;
  const sheet = next.sheets.find(s => s.id === next.activeSheet);
  if (!sheet) return workbook;
  sheet.charts = [...(sheet.charts ?? []), {
    id: `chart-${Date.now()}`,
    type,
    title: title || 'Chart',
    rangeStart: start,
    rangeEnd: end,
    position: { row: 1, col: 7 },
    width: 520,
    height: 300,
    legend: true,
    showLabels: type === 'pie' || type === 'doughnut',
  }];
  return next;
}

export function updateChart(workbook: Workbook, id: string, patch: Partial<SheetChart>) {
  const next = JSON.parse(JSON.stringify(workbook)) as Workbook;
  const sheet = next.sheets.find(s => s.id === next.activeSheet);
  const chart = sheet?.charts?.find(c => c.id === id);
  if (chart) Object.assign(chart, patch);
  return next;
}

export function deleteChart(workbook: Workbook, id: string) {
  const next = JSON.parse(JSON.stringify(workbook)) as Workbook;
  const sheet = next.sheets.find(s => s.id === next.activeSheet);
  if (sheet) sheet.charts = (sheet.charts ?? []).filter(c => c.id !== id);
  return next;
}

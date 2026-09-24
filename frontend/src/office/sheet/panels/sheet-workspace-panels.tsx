'use client';

import type { PivotTable, Sheet, SheetChart, SheetTable, Workbook } from '../model';
import { buildPivot, tableHeaders } from '../table-pivot';
import { pivotSourceFields } from '../pivot/pivot-logic';
import { findTableAtCell, tableColumnIndex, tableColumnValues } from '../tables/table-logic';
import { OfficeCellNote } from './office-cell-note';
import { OfficeChartPanel } from './office-chart-panel';
import { OfficeConditionalFormatDialog } from './office-conditional-format-dialog';
import { OfficeCreatePivotDialog } from './office-create-pivot-dialog';
import { OfficeCreateTableDialog } from './office-create-table-dialog';
import { OfficeDataValidationDialog } from './office-data-validation-dialog';
import { OfficeNamedRangeDialog } from './office-named-range-dialog';
import { OfficePasteSpecial } from './office-paste-special';
import { OfficePivotPanel } from './office-pivot-panel';
import { OfficeRemoveDuplicates } from './office-remove-duplicates';
import { OfficeRenameSheetDialog } from './office-rename-sheet-dialog';
import { OfficeSheetHelpDialog } from './office-sheet-help-dialog';
import { OfficeTablePanel } from './office-table-panel';
import { OfficeTextToColumns } from './office-text-to-columns';
import type { ConditionalFormat, NamedRange, ValidationRule } from '../model';
import type { PasteMode } from '../clipboard/paste-special-logic';
import type { TextSplitDelimiter } from '../data/text-to-columns-logic';

export type SheetDialogState = {
  createTable: boolean;
  createPivot: boolean;
  pasteSpecial: boolean;
  removeDuplicates: boolean;
  textToColumns: boolean;
  cellNote: boolean;
  chartPanel: boolean;
  namedRange: boolean;
  conditionalFormat: boolean;
  dataValidation: boolean;
  renameSheet: boolean;
  help: boolean;
  selectedPivotId: string | null;
  selectedTableId: string | null;
};

type SheetWorkspacePanelsProps = {
  doc: Workbook;
  sheet: Sheet;
  selected: string;
  rangeStart: string;
  rangeEnd: string;
  selectedChartId: string | null;
  dialogs: SheetDialogState;
  textPreview: string[][];
  textOverwriteCount: number;
  duplicateColumns: { index: number; label: string }[];
  noteText: string;
  namedRanges: NamedRange[];
  conditionalRules: ConditionalFormat[];
  validationRule?: ValidationRule;
  sheetName: string;
  sheetNames: string[];
  ar?: boolean;
  onCloseDialog: (patch: Partial<SheetDialogState>) => void;
  onCreateTable: (input: { range: string; name: string; hasHeader: boolean; style: SheetTable['style'] }) => void;
  onCreatePivot: (input: Omit<PivotTable, 'id'>) => void;
  onPasteSpecial: (mode: PasteMode) => void;
  onRemoveDuplicates: (input: { range: string; columnIndexes: number[]; hasHeader: boolean }) => number;
  onTextToColumns: (input: { delimiter: TextSplitDelimiter; custom?: string }) => void;
  onSaveNote: (note: string) => void;
  onChartChange: (patch: Partial<SheetChart>) => void;
  onTableChange: (id: string, patch: Partial<SheetTable>) => void;
  onTableSort: (id: string, direction: 'asc' | 'desc', colOffset: number) => void;
  onTableFilter: (id: string, column: string, values: string[] | null) => void;
  onTableDelete: (id: string) => void;
  onPivotChange: (id: string, patch: Partial<PivotTable>) => void;
  onPivotRefresh: (id: string) => void;
  onPivotDelete: (id: string) => void;
  onNamedRangeCreate: (input: { name: string; reference: string }) => void;
  onNamedRangeUpdate: (oldName: string, input: { name: string; reference: string }) => void;
  onNamedRangeDelete: (name: string) => void;
  onConditionalAdd: (input: Omit<ConditionalFormat, 'id'>) => void;
  onConditionalUpdate: (id: string, patch: Partial<ConditionalFormat>) => void;
  onConditionalDelete: (id: string) => void;
  onValidationApply: (values: string[] | null) => void;
  onRenameSheet: (name: string) => void;
};

export function SheetWorkspacePanels(p: SheetWorkspacePanelsProps) {
  const table = p.sheet.tables?.find((t) => t.id === p.dialogs.selectedTableId) ?? findTableAtCell(p.sheet, p.selected);
  const pivot = p.sheet.pivotTables?.find((pv) => pv.id === p.dialogs.selectedPivotId) ?? null;
  const chart = p.sheet.charts?.find((c) => c.id === p.selectedChartId);
  const pivotFields = pivotSourceFields(p.sheet, pivot?.sourceRange ?? `${p.rangeStart}:${p.rangeEnd}`, p.doc);
  const pivotResult = pivot ? buildPivot(p.sheet, pivot, p.doc) : null;

  return (
    <>
      <OfficeCreateTableDialog
        open={p.dialogs.createTable}
        defaultRange={`${p.rangeStart}:${p.rangeEnd}`}
        defaultName={`Table${(p.sheet.tables?.length ?? 0) + 1}`}
        existingTables={p.sheet.tables ?? []}
        onClose={() => p.onCloseDialog({ createTable: false })}
        onCreate={p.onCreateTable}
      />
      <OfficeCreatePivotDialog
        open={p.dialogs.createPivot}
        defaultRange={`${p.rangeStart}:${p.rangeEnd}`}
        fields={pivotFields.length ? pivotFields : ['Column1', 'Column2']}
        onClose={() => p.onCloseDialog({ createPivot: false })}
        onCreate={p.onCreatePivot}
      />
      <OfficePasteSpecial open={p.dialogs.pasteSpecial} onClose={() => p.onCloseDialog({ pasteSpecial: false })} onApply={p.onPasteSpecial} />
      <OfficeRemoveDuplicates
        open={p.dialogs.removeDuplicates}
        defaultRange={`${p.rangeStart}:${p.rangeEnd}`}
        columns={p.duplicateColumns}
        onClose={() => p.onCloseDialog({ removeDuplicates: false })}
        onApply={p.onRemoveDuplicates}
      />
      <OfficeTextToColumns
        open={p.dialogs.textToColumns}
        preview={p.textPreview}
        overwriteCount={p.textOverwriteCount}
        onClose={() => p.onCloseDialog({ textToColumns: false })}
        onApply={p.onTextToColumns}
      />
      <OfficeCellNote
        open={p.dialogs.cellNote}
        cellKey={p.selected}
        note={p.noteText}
        onClose={() => p.onCloseDialog({ cellNote: false })}
        onSave={p.onSaveNote}
      />
      <OfficeNamedRangeDialog
        open={p.dialogs.namedRange}
        defaultRange={`${p.rangeStart}:${p.rangeEnd}`}
        sheetId={p.sheet.id}
        ranges={p.namedRanges}
        onClose={() => p.onCloseDialog({ namedRange: false })}
        onCreate={p.onNamedRangeCreate}
        onUpdate={p.onNamedRangeUpdate}
        onDelete={p.onNamedRangeDelete}
      />
      <OfficeConditionalFormatDialog
        open={p.dialogs.conditionalFormat}
        defaultRange={`${p.rangeStart}:${p.rangeEnd}`}
        rules={p.conditionalRules}
        onClose={() => p.onCloseDialog({ conditionalFormat: false })}
        onAdd={p.onConditionalAdd}
        onUpdate={p.onConditionalUpdate}
        onDelete={p.onConditionalDelete}
      />
      <OfficeDataValidationDialog
        open={p.dialogs.dataValidation}
        cellKey={p.selected}
        validation={p.validationRule}
        onClose={() => p.onCloseDialog({ dataValidation: false })}
        onApply={p.onValidationApply}
      />
      <OfficeRenameSheetDialog
        open={p.dialogs.renameSheet}
        currentName={p.sheetName}
        existingNames={p.sheetNames}
        onClose={() => p.onCloseDialog({ renameSheet: false })}
        onRename={p.onRenameSheet}
      />
      <OfficeSheetHelpDialog open={p.dialogs.help} ar={p.ar} onClose={() => p.onCloseDialog({ help: false })} />
      {chart && p.dialogs.chartPanel ? (
        <OfficeChartPanel chart={chart} open onClose={() => p.onCloseDialog({ chartPanel: false })} onChange={p.onChartChange} />
      ) : null}
      {table && p.dialogs.selectedTableId ? (
        <OfficeTablePanel
          table={table}
          headers={tableHeaders(p.sheet, table, p.doc)}
          columnValues={(columnIndex) => tableColumnValues(p.sheet, table, columnIndex, p.doc)}
          onChange={(patch) => p.onTableChange(table.id, patch)}
          onSort={(direction) => p.onTableSort(table.id, direction, Math.max(0, tableColumnIndex(table, p.selected)))}
          onFilter={(column, values) => p.onTableFilter(table.id, column, values)}
          onDelete={() => p.onTableDelete(table.id)}
          onClose={() => p.onCloseDialog({ selectedTableId: null })}
        />
      ) : null}
      {pivot && p.dialogs.selectedPivotId ? (
        <OfficePivotPanel
          pivot={pivot}
          result={pivotResult ?? { headers: [], rows: [], grandTotal: 0 }}
          onChange={(patch) => p.onPivotChange(pivot.id, patch)}
          onRefresh={() => p.onPivotRefresh(pivot.id)}
          onDelete={() => p.onPivotDelete(pivot.id)}
          onClose={() => p.onCloseDialog({ selectedPivotId: null })}
        />
      ) : null}
    </>
  );
}

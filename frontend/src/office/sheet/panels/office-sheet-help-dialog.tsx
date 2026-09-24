'use client';

import { OfficeModal } from '@/office/shared/floating/office-modal';

type OfficeSheetHelpDialogProps = {
  open: boolean;
  ar?: boolean;
  onClose: () => void;
};

export function OfficeSheetHelpDialog({ open, ar, onClose }: OfficeSheetHelpDialogProps) {
  return (
    <OfficeModal open={open} onClose={onClose} title={ar ? 'IMKAN Sheet' : 'IMKAN Sheet'} panelClassName="max-w-[480px]">
      <div className="space-y-2 p-4 text-[13px] leading-6 text-[#30343b]">
        {ar ? (
          <p>واجهة جداول بيانات بأسلوب Office مع التحرير والصيغ والجداول والجداول المحورية والرسوم والمرشحات والتحقق والتجميد والتعاون وتصدير XLSX.</p>
        ) : (
          <p>Professional spreadsheet workspace with editing, formulas, tables, pivot tables, charts, filters, validation, freeze panes, collaboration, and XLSX export.</p>
        )}
        <button type="button" className="mt-2 rounded border px-3 py-1.5 text-[12px]" onClick={onClose}>Close</button>
      </div>
    </OfficeModal>
  );
}

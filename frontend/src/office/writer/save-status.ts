export type WriterSaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline' | 'syncing' | 'conflict' | 'error';

export type WriterSaveStatusInput = {
  saving: boolean;
  saved: boolean;
  queueCount: number;
  online: boolean;
  conflict: boolean;
  error?: string;
};

export function deriveWriterSaveStatus(input: WriterSaveStatusInput): WriterSaveStatus {
  if (input.conflict) return 'conflict';
  if (input.error && !input.online) return 'offline';
  if (input.error) return 'error';
  if (!input.online && input.queueCount > 0) return 'offline';
  if (input.online && input.queueCount > 0) return input.saving ? 'syncing' : 'unsaved';
  if (input.saving) return 'saving';
  return input.saved ? 'saved' : 'unsaved';
}

export const WRITER_SAVE_STATUS_LABELS: Record<WriterSaveStatus, { en: string; ar: string }> = {
  saved: { en: 'Saved', ar: 'محفوظ' },
  saving: { en: 'Saving', ar: 'جارٍ الحفظ' },
  unsaved: { en: 'Unsaved changes', ar: 'تغييرات غير محفوظة' },
  offline: { en: 'Offline · queued', ar: 'غير متصل · في الانتظار' },
  syncing: { en: 'Syncing', ar: 'جارٍ المزامنة' },
  conflict: { en: 'Conflict needs review', ar: 'يوجد تعارض يحتاج مراجعة' },
  error: { en: 'Save error', ar: 'خطأ في الحفظ' },
};

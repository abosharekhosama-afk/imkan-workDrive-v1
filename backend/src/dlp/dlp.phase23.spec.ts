import { DlpAction, DlpScopeType } from '@prisma/client';

describe('Phase 23 DLP contracts', () => {
  it('defines the Zoho-aligned restriction actions', () => {
    expect(DlpAction.BLOCK_EXTERNAL_SHARE).toBe('BLOCK_EXTERNAL_SHARE');
    expect(DlpAction.BLOCK_DOWNLOAD).toBe('BLOCK_DOWNLOAD');
    expect(DlpAction.BLOCK_COPY).toBe('BLOCK_COPY');
    expect(DlpAction.BLOCK_PRINT).toBe('BLOCK_PRINT');
    expect(DlpAction.WARN_EXTERNAL_SHARE).toBe('WARN_EXTERNAL_SHARE');
    expect(DlpAction.WATERMARK).toBe('WATERMARK');
  });

  it('defines organization-wide and folder-scoped policy modes', () => {
    expect(DlpScopeType.ALL).toBe('ALL');
    expect(DlpScopeType.SELECTED_FOLDERS).toBe('SELECTED_FOLDERS');
    expect(DlpScopeType.EXCLUDED_FOLDERS).toBe('EXCLUDED_FOLDERS');
  });
});

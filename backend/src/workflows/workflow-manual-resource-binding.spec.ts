import { describe, expect, it } from '@jest/globals';

describe('manual workflow resource binding regression', () => {
  it('keeps file and folder resource ids explicit in the manual-start contract', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'workflow-engine.service.ts'), 'utf8');
    expect(source).toContain("const resourceId = String(event.fileId ?? '').trim();");
    expect(source).toContain("workflow.resourceType !== resourceType");
    expect(source).toContain("id: resourceId, orgId: user.org_id, deletedAt: null");
    expect(source).toContain("id: resourceId, orgId: user.org_id }");
    expect(source).toContain("fileId: resourceId, eventType: 'manual'");
  });

  it('does not dispatch the upload trigger recursively from FileBrowser', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../../frontend/src/components/file-browser.tsx'),
      'utf8',
    );
    expect(source).not.toContain('const triggerUpload = () => window.dispatchEvent(new Event("workdrive:trigger-upload"))');
    expect(source).not.toContain('window.dispatchEvent(new Event("workdrive:trigger-upload-folder"))');
  });
});

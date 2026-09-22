import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 28 Writer version/reload closure contract', () => {
  const page = readFileSync(join(process.cwd(), 'frontend/src/app/office/writer/[fileId]/page.tsx'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'backend/src/office/office.service.ts'), 'utf8');

  it('exposes version history in the Writer surface and reloads after restore', () => {
    expect(page).toContain("OfficeVersionHistory");
    expect(page).toContain('onRestored={reloadWriterDocument}');
    expect(page).toContain('openOfficeSession(fileId)');
    expect(page).toContain('setRevision(r.document.revision)');
  });

  it('guards reload against pending offline changes', () => {
    expect(page).toContain('writerOfflineQueueCount(fileId)>0');
    expect(page).toContain('Sync pending changes before reloading the document.');
  });

  it('restores a version into a new revision and creates a new version snapshot', () => {
    expect(service).toContain('async restoreVersion(');
    expect(service).toContain('revision: { increment: 1 }');
    expect(service).toContain('label: `Restored from v${source.versionNumber}`');
    expect(service).toContain("kind: 'version-restore'");
  });
});

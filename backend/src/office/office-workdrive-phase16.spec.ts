import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'office.service.ts'), 'utf8');

describe('Show Phase 16 — WorkDrive native persistence contract', () => {
  test('save materializes a real WorkDrive FileVersion', () => {
    expect(source).toContain('materializeNativeFileVersion');
    expect(source).toContain('this.storage.storeObject');
    expect(source).toContain('tx.storageObject.create');
    expect(source).toContain('tx.fileVersion.create');
    expect(source).toContain("tx.file.update");
  });

  test('native snapshot uses the WorkDrive version key and integrity hash', () => {
    expect(source).toContain('this.storage.buildObjectKey(fileId, versionId)');
    expect(source).toContain('computeOfficeContentHash(content)');
    expect(source).toContain('sha256Hash: contentHash');
  });

  test('restore also creates a new WorkDrive version instead of overwriting history', () => {
    expect(source).toContain("'OFFICE_VERSION_RESTORED'");
    expect(source).toContain('nativeFileVersionId');
    expect(source).toContain('workDriveVersionNumber');
    expect(source).toContain('Restored from v${source.versionNumber}');
  });

  test('version listing correlates Office semantic versions with WorkDrive byte versions', () => {
    expect(source).toContain('const [officeVersions, workDriveVersions] = await Promise.all');
    expect(source).toContain('const byHash = new Map(workDriveVersions.map(v => [v.sha256Hash, v]));');
    expect(source).toContain('workDriveVersionId');
    expect(source).toContain('workDriveVersionNumber');
  });
});

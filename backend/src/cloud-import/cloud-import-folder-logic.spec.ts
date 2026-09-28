import { MAX_FOLDER_IMPORT_FILES, remoteEntryKind, sortRemoteEntries } from './cloud-import-folder-logic';

describe('cloud-import-folder-logic', () => {
  it('detects folder mime types', () => {
    expect(remoteEntryKind('application/vnd.google-apps.folder')).toBe('folder');
    expect(remoteEntryKind('folder')).toBe('folder');
    expect(remoteEntryKind('application/pdf')).toBe('file');
  });

  it('sorts folders before files', () => {
    const sorted = sortRemoteEntries([
      { name: 'b.txt', kind: 'file' as const },
      { name: 'a', kind: 'folder' as const },
    ]);
    expect(sorted.map((item) => item.name)).toEqual(['a', 'b.txt']);
  });

  it('caps folder import file limit', () => {
    expect(MAX_FOLDER_IMPORT_FILES).toBeGreaterThan(0);
  });
});

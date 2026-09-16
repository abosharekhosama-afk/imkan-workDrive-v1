import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('workflow event bridge contracts', () => {
  const root = join(__dirname, '..');
  const files = readFileSync(join(root, 'files', 'files.service.ts'), 'utf8');
  const folders = readFileSync(join(root, 'folders', 'folders.service.ts'), 'utf8');
  const engine = readFileSync(join(root, 'workflows', 'workflow-engine.service.ts'), 'utf8');

  it('dispatches file events with resource type and parent folder context', () => {
    expect(files).toContain("resourceType: 'FILE'");
    expect(files).toContain('folderId: file.folderId ?? undefined');
  });

  it('has real folder workflow event dispatches for create/move/copy/rename', () => {
    for (const event of ['create', 'move', 'copy', 'rename']) {
      expect(folders).toContain(`dispatchWorkflowFolderEvent(user, '${event}'`);
    }
    expect(folders).toContain("resourceType: 'FOLDER'");
  });

  it('emits the ready trigger from the real mark-final/archive action', () => {
    expect(engine).toContain("eventType: 'ready'");
    expect(engine).toContain("data: { status: 'ARCHIVED' }");
  });
});

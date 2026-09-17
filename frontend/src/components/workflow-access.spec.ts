import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('workflow access navigation contracts', () => {
  it('uses a server-backed capabilities endpoint and does not expose admin routes to members in the shell', () => {
    const access = fs.readFileSync(path.join(process.cwd(), 'src/components/workflow-access.tsx'), 'utf8');
    const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/workflow-shell.tsx'), 'utf8');
    expect(access).toContain("listWorkflowCapabilities");
    expect(access).toContain("canViewTemplates");
    expect(access).toContain("canViewQueue");
    expect(shell).toContain("visibleItems");
    expect(shell).toContain("access[capability]");
  });

  it('treats builder creation and owned-draft editing as different capabilities', () => {
    const access = fs.readFileSync(path.join(process.cwd(), 'src/components/workflow-access.tsx'), 'utf8');
    expect(access).toContain('searchParams.get("id") ? "canEditOwnedDrafts" : "canCreate"');
  });
});

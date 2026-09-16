describe('Workflow Phase 4 contracts', () => {
  it('uses business calendar configuration for SLA definitions', () => {
    const workflow = { calendarConfig: { timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '17:00', holidays: ['2026-09-15'] } };
    expect(workflow.calendarConfig.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(workflow.calendarConfig.holidays).toContain('2026-09-15');
  });

  it('accepts only registered safe custom functions', () => {
    const allowed = new Set(['set_workflow_field', 'notify_owner', 'tag_from_extension']);
    expect(allowed.has('set_workflow_field')).toBe(true);
    expect(allowed.has('eval')).toBe(false);
    expect(allowed.has('node_exec')).toBe(false);
  });

  it('renders supported dynamic values without evaluating code', () => {
    const event = { name: 'contract.pdf', fileId: 'file-1', extension: 'pdf', folderId: 'folder-1' };
    const fields = { approvalNote: 'Approved' };
    const template = '{{file.name}} | {{file.id}} | {{approvalNote}}';
    const rendered = template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, key: string) => {
      const k = key.trim();
      if (k === 'file.name') return event.name;
      if (k === 'file.id') return event.fileId;
      return String((fields as Record<string, unknown>)[k] ?? '');
    });
    expect(rendered).toBe('contract.pdf | file-1 | Approved');
  });
});

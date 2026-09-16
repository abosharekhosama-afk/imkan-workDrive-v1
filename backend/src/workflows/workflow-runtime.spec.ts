import { describe, expect, it } from '@jest/globals';
import { dynamicValueCatalog, evaluateCondition, interpolateDynamicValues, walkDynamicValues } from './workflow-runtime';

describe('Workflow runtime V15', () => {
  const event = { fileId: 'file-1', name: 'contract.pdf', extension: 'pdf', folderId: 'folder-1', mimeType: 'application/pdf', fileType: 'PDF', size: 1200, userId: 'user-1' };

  it('resolves first-class file, workflow and user values', () => {
    const output = interpolateDynamicValues('{{file.name}} {{file.id}} {{workflow.approval}} {{user.id}}', event, { approval: 'Approved' }, { workflowId: 'wf-1', runId: 'run-1', user: { id: 'user-9' } });
    expect(output).toBe('contract.pdf file-1 Approved user-9');
  });

  it('walks nested action configuration without evaluating code', () => {
    const output = walkDynamicValues({ title: 'Review {{file.name}}', payload: { id: '{{file.id}}', values: ['{{workflow.note}}'] } }, event, { note: 'Ready' });
    expect(output).toEqual({ title: 'Review contract.pdf', payload: { id: 'file-1', values: ['Ready'] } });
  });

  it('evaluates nested AND/OR rules and legacy aliases', () => {
    expect(evaluateCondition({ all: [{ field: 'fileType', operator: 'equals', value: 'PDF' }, { any: [{ field: 'extension', operator: 'equals', value: 'pdf' }, { field: 'name', operator: 'contains', value: 'contract' }] }] }, event)).toBe(true);
    expect(evaluateCondition({ any: [{ field: 'extension', operator: 'equals', value: 'docx' }, { field: 'name', operator: 'contains', value: 'missing' }] }, event)).toBe(false);
  });

  it('publishes a catalog containing workflow fields', () => {
    const catalog = dynamicValueCatalog([{ id: 'approvalNote', name: 'Approval note', type: 'multi' }]);
    expect(catalog.some((x) => x.path === 'file.name')).toBe(true);
    expect(catalog.some((x) => x.path === 'workflow.approvalNote')).toBe(true);
    expect(catalog.some((x) => x.path === 'now.iso')).toBe(true);
  });
});

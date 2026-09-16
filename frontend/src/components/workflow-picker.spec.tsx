import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('WorkflowPicker manual start UX', () => {
  it('does not perform a second workflow GET after selection', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/workflow-picker.tsx'), 'utf8');
    expect(source).not.toContain('getWorkflow(w.id)');
    expect(source).toContain('const opts=await listWorkflowParticipantOptions()');
    expect(source).toContain('setDetail(w)');
  });
  it('supports workflow details, fields, participants and start payload', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/workflow-picker.tsx'), 'utf8');
    expect(source).toContain('getWorkflow');
    expect(source).toContain('listWorkflowParticipantOptions');
    expect(source).toContain('fieldValues');
    expect(source).toContain('participantRules');
    expect(source).toContain('Start workflow');
  });
});

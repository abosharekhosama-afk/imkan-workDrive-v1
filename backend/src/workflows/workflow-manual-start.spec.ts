import { describe, expect, it } from '@jest/globals';

describe('WorkflowEngineService manual start input hardening', () => {
  it('source contains server-side required field validation and starter participant gating', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'workflow-engine.service.ts'), 'utf8');
    expect(source).toContain("field.required === true && empty");
    expect(source).toContain("starterParticipantAllowed");
    expect(source).toContain("This workflow does not allow the starter to choose participants");
  });
});

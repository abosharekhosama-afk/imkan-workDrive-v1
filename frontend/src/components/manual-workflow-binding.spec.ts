import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('manual workflow binding UI contract', () => {
  it('keeps the action cell isolated from resource-row navigation', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/file-table.tsx'), 'utf8');
    expect(source).toContain('onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}');
    expect(source).toContain('onAssignWorkflow={(type,id,name)=>setWorkflowTarget({type,id,name})}');
  });

  it('passes workflow assignment to both table and grid action menus', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/file-grid-view.tsx'), 'utf8');
    expect(source).toContain('onAssignWorkflow?:');
    expect(source).toContain('onAssignWorkflow: canMutate && onAssignWorkflow');
  });
});

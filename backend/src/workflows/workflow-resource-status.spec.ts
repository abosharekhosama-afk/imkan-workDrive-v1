import { describe, expect, it, jest } from '@jest/globals';
import { WorkflowsService } from './workflows.service';

describe('workflow resource status', () => {
  it('returns only readable resources and user-visible workflow runs', async () => {
    const prisma = {
      file: { findMany: jest.fn().mockResolvedValue([
        { id: 'file-1', orgId: 'org-1', ownerId: 'user-1', folder: { teamFolderId: null } },
        { id: 'file-2', orgId: 'org-1', ownerId: 'user-2', folder: { teamFolderId: null } },
      ]) },
      workflowRun: { findMany: jest.fn().mockResolvedValue([
        { id: 'run-1', createdById: 'user-1', startedAt: new Date(), finishedAt: null, status: 'WAITING', trigger: { resourceType: 'FILE', fileId: 'file-1' }, workflow: { id: 'wf-1', name: 'Review', ownerId: 'user-1' }, currentState: { id: 'state-1', name: 'Review', terminal: false }, tasks: [] },
        { id: 'run-2', createdById: 'user-2', startedAt: new Date(), finishedAt: null, status: 'WAITING', trigger: { resourceType: 'FILE', fileId: 'file-2' }, workflow: { id: 'wf-2', name: 'Private', ownerId: 'user-2' }, currentState: { id: 'state-2', name: 'Approval', terminal: false }, tasks: [] },
      ]) },
    } as any;
    const engine = {} as any;
    const functions = {} as any;
    const permissions = { canRead: jest.fn((_user, resource) => resource.ownerId === 'user-1') } as any;
    const service = new WorkflowsService(prisma, engine, functions, permissions, {} as any);
    const result = await service.resourceStatus({ sub: 'user-1', org_id: 'org-1', role: 'MEMBER' } as any, 'FILE', 'file-1,file-2');
    expect(result).toHaveLength(1);
    expect(result[0].resourceId).toBe('file-1');
    expect(result[0].workflowName).toBe('Review');
  });
});

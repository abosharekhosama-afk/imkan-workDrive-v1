import { WorkflowsService } from './workflows.service';

describe('Workflow integration closure contract', () => {
  it('reports INTEGRATED when active workflows/functions/connections are healthy', async () => {
    const prisma = {
      workflow: { findMany: jest.fn().mockResolvedValue([{ id: 'w1', name: 'Review', status: 'ACTIVE', activeVersionId: 'wv1', steps: [{ config: { functionId: 'f1', connectionId: 'c1' } }], transitions: [] }]) },
      workflowFunction: { findMany: jest.fn().mockResolvedValue([{ id: 'f1', key: 'notify', name: 'Notify', enabled: true, activeVersionId: 'fv1', activeVersion: { id: 'fv1', status: 'ACTIVE', version: 1, definition: { operations: [{ op: 'HTTP_REQUEST', connectionId: 'c1', method: 'GET', path: '/health' }] } } }]) },
      connection: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'API', status: 'ACTIVE', authType: 'OAUTH2', provider: 'google' }]) },
      connectionUsage: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = Object.create(WorkflowsService.prototype) as WorkflowsService;
    (service as any).prisma = prisma;
    (service as any).requireWorkflowAdmin = jest.fn();
    const result = await service.integrationStatus({ org_id: 'org', sub: 'admin' } as any);
    expect(result.status).toBe('INTEGRATED');
    expect(result.closureReady).toBe(true);
  });

  it('blocks closure when a referenced connection is unavailable', async () => {
    const prisma = {
      workflow: { findMany: jest.fn().mockResolvedValue([{ id: 'w1', name: 'Review', status: 'ACTIVE', activeVersionId: 'wv1', steps: [{ config: { connectionId: 'c1' } }], transitions: [] }]) },
      workflowFunction: { findMany: jest.fn().mockResolvedValue([]) },
      connection: { findMany: jest.fn().mockResolvedValue([]) },
      connectionUsage: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = Object.create(WorkflowsService.prototype) as WorkflowsService;
    (service as any).prisma = prisma;
    (service as any).requireWorkflowAdmin = jest.fn();
    const result = await service.integrationStatus({ org_id: 'org', sub: 'admin' } as any);
    expect(result.status).toBe('BLOCKED');
    expect(result.closureReady).toBe(false);
    expect(result.checks.find((check: any) => check.key === 'workflow-connections')?.status).toBe('FAIL');
  });
});

import { WorkflowsService } from './workflows.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

describe('WorkflowsService.createFunction', () => {
  const user = { sub: 'user-1', org_id: 'org-1', role: 'ADMIN' } as AccessTokenPayload;

  it('creates the version row before linking activeVersionId', async () => {
    const order: string[] = [];
    const tx = {
      workflowFunction: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'fn-1', activeVersion: {}, versions: [] }),
        create: jest.fn().mockImplementation(({ data }) => {
          order.push(data.activeVersionId ? 'createFunction:withActiveVersionId' : 'createFunction');
          return { id: data.id };
        }),
        update: jest.fn().mockImplementation(() => {
          order.push('updateFunctionActiveVersion');
          return {};
        }),
      },
      workflowFunctionVersion: {
        create: jest.fn().mockImplementation(() => {
          order.push('createVersion');
          return {};
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
      connection: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const service = new WorkflowsService(prisma, {} as any, {} as any, {} as any, {} as any);

    await service.createFunction(user, {
      name: 'Lookup status',
      key: 'lookup_status',
      definition: { operations: [{ op: 'SET_FIELD', field: 'status', value: 'ready' }] },
    });

    expect(order).toEqual(['createFunction', 'createVersion', 'updateFunctionActiveVersion']);
    expect(tx.workflowFunction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ activeVersionId: expect.anything() }),
      }),
    );
  });
});

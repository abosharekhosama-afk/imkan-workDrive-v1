import { describe, expect, it, jest } from '@jest/globals';
import { WorkflowEngineService } from './workflow-engine.service';

type AnyRecord = Record<string, any>;

function makeEngine(overrides: AnyRecord = {}) {
  const prisma: AnyRecord = {
    workflowRun: {
      findUnique: jest.fn().mockResolvedValue({ result: { fieldValues: { status: 'pending' } } }),
      update: jest.fn().mockResolvedValue({}),
    },
    workflowFunction: { findFirst: jest.fn().mockResolvedValue({ id: 'fn-1', activeVersionId: 'ver-1', activeVersion: { id: 'ver-1' } }) },
    workflowFunctionVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'ver-1', status: 'ACTIVE', definition: { operations: [{ op: 'SET_FIELD', field: 'result', value: 'ok' }] } }) },
  };
  const connections = { executeWorkflowRest: jest.fn().mockResolvedValue({ status: 200, ok: true, body: { ok: true, source: 'google' } }) };
  const functionExecutor = { execute: jest.fn().mockResolvedValue({ fields: { result: 'ok' } }) };
  const cloudImport = { createWorkflowImportJob: jest.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING' }) };
  const engine = Object.create(WorkflowEngineService.prototype) as AnyRecord;
  Object.assign(engine, { prisma, connections, functionExecutor, cloudImport, ...overrides });
  return { engine, prisma, connections, functionExecutor, cloudImport };
}

const user = { sub: 'user-1', org_id: 'org-1' } as any;
const event = { eventType: 'manual', fileId: 'file-1', resourceId: 'file-1', resourceType: 'FILE', userId: 'user-1', name: 'contract.pdf', extension: '.pdf', mimeType: 'application/pdf' } as any;

describe('Workflow + Connection + Custom Function runtime contract', () => {
  it('executes an HTTP_REQUEST through the selected active Connection and persists its output field', async () => {
    const { engine, prisma, connections } = makeEngine();
    const result = await engine.executeAction(user, event, { type: 'http_request', config: { connectionId: 'google-conn', method: 'GET', path: '/drive/v3/about', responseMode: 'JSON', outputFieldId: 'googleResult' } }, 'wf-1', 'run-1', 'step-1');
    expect(connections.executeWorkflowRest).toHaveBeenCalledWith(user, 'google-conn', 'GET', '/drive/v3/about', undefined, expect.any(Object), expect.objectContaining({ workflowId: 'wf-1', runId: 'run-1', responseMode: 'JSON' }));
    expect(prisma.workflowRun.update).toHaveBeenCalled();
    expect(result).toMatchObject({ action: 'http_request', connectionId: 'google-conn', statusCode: 200, outputFieldId: 'googleResult' });
  });


  it('queues a real Cloud Import job for the Import External File action', async () => {
    const { engine, cloudImport } = makeEngine();
    const result = await engine.executeAction(user, event, { type: 'import_external_file', config: { provider: 'google', connectionId: 'google-conn', resourceId: 'drive-file-1', resourceName: 'report.pdf', destinationFolderId: 'folder-1' } }, 'wf-1', 'run-1', 'step-3');
    expect(cloudImport.createWorkflowImportJob).toHaveBeenCalledWith(user, 'google', 'google-conn', 'drive-file-1', 'folder-1');
    expect(result).toMatchObject({ action: 'import_external_file', provider: 'google', connectionId: 'google-conn', resourceId: 'drive-file-1', jobId: 'job-1', status: 'PENDING' });
  });

  it('executes a published Custom Function whose runtime can consume its configured Connection', async () => {
    const { engine, prisma, functionExecutor } = makeEngine();
    const result = await engine.executeAction(user, event, { type: 'custom_function', config: { functionId: 'fn-1' } }, 'wf-1', 'run-1', 'step-2');
    expect(functionExecutor.execute).toHaveBeenCalledWith(user, 'fn-1', 'ver-1', expect.any(Object), expect.objectContaining({ workflow: { id: 'wf-1', runId: 'run-1' } }), expect.objectContaining({ runId: 'run-1' }));
    expect(prisma.workflowRun.update).toHaveBeenCalled();
    expect(result).toMatchObject({ action: 'custom_function', functionId: 'fn-1', functionVersionId: 'ver-1' });
  });
});

import { CustomFunctionExecutor } from './custom-function.executor';

describe('CustomFunctionExecutor HTTP_REQUEST contract', () => {
  it('requires a connection id and absolute-path route', () => {
    const prisma = {} as any; const connections = {} as any;
    const e = new CustomFunctionExecutor(prisma, connections);
    expect(() => e.validateDefinition({ operations: [{ op: 'HTTP_REQUEST', path: '/' }] })).toThrow();
    expect(() => e.validateDefinition({ operations: [{ op: 'HTTP_REQUEST', connectionId: 'x', path: '/v1/items', method: 'GET' }] })).not.toThrow();
  });
});

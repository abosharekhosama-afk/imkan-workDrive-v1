import { CustomFunctionExecutor } from './custom-function.executor';

describe('CustomFunctionExecutor V17 safe runtime', () => {
  const prisma = {} as any;
  const executor = new CustomFunctionExecutor(prisma);

  it('accepts only allow-listed operations', () => {
    expect(() => executor.validateDefinition({ operations: [{ op: 'SET_FIELD', field: 'status', value: '{{file.extension}}' }] })).not.toThrow();
    expect(() => executor.validateDefinition({ operations: [{ op: 'EVAL', value: 'process.env' }] })).toThrow(/Unsupported or unsafe/);
  });

  it('rejects empty or oversized definitions', () => {
    expect(() => executor.validateDefinition({ operations: [] })).toThrow();
    expect(() => executor.validateDefinition({ operations: Array.from({ length: 31 }, () => ({ op: 'SET_FIELD', field: 'x', value: 'y' })) })).toThrow();
  });
});

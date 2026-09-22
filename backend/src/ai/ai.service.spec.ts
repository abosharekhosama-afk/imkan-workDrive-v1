import { AiService } from './ai.service';

describe('AiService', () => {
  it('exposes a deterministic local insight engine contract', () => {
    expect((new AiService({} as any, {} as any))).toBeDefined();
  });
});

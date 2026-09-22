describe('Connections Phase 4 reference contract', () => {
  const collect = (value: unknown, path: string, connectionId: string, out: string[]) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, `${path}[${index}]`, connectionId, out));
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.connectionId === connectionId) out.push(`${path}.connectionId`);
    Object.entries(record).forEach(([key, child]) => collect(child, `${path}.${key}`, connectionId, out));
  };

  it('finds nested connection references in workflow configuration', () => {
    const paths: string[] = [];
    collect({ actions: [{ type: 'HTTP_REQUEST', config: { connectionId: 'conn-1', headers: { value: 'x' } } }] }, 'config', 'conn-1', paths);
    expect(paths).toEqual(['config.actions[0].config.connectionId']);
  });

  it('does not treat a different connection as a reference', () => {
    const paths: string[] = [];
    collect({ connectionId: 'conn-2' }, 'config', 'conn-1', paths);
    expect(paths).toHaveLength(0);
  });

  it('deduplicates the same reference path across repeated scans', () => {
    const paths: string[] = [];
    collect({ connectionId: 'conn-1' }, 'config', 'conn-1', paths);
    collect({ connectionId: 'conn-1' }, 'config', 'conn-1', paths);
    expect(new Set(paths)).toEqual(new Set(['config.connectionId']));
  });
});

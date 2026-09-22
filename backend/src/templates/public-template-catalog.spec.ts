import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('public template catalog', () => {
  it('contains a usable category for every public template item', async () => {
    const manifest = JSON.parse(await readFile(join(__dirname, 'public-assets', 'catalog-manifest.json'), 'utf8')) as Array<{ name: string; category?: string; file: string }>;
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest.every((item) => item.name.trim() && item.category?.trim() && item.file.trim())).toBe(true);
    expect(new Set(manifest.map((item) => item.category!.trim())).size).toBeGreaterThan(1);
  });
});

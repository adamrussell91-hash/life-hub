import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('journal day map WebGL singleton', () => {
  it('destroys the previous map before opening another (Phase 3 regression)', () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../../src/journal/map-expanded.ts');
    const src = readFileSync(path, 'utf8');
    expect(src).toMatch(/let activeHandle/);
    expect(src).toMatch(/activeHandle\?\.destroy\(\)/);
  });
});

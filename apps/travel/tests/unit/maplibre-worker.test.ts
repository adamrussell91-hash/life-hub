import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(name) ? [full] : [];
  });
}

describe('MapLibre worker', () => {
  // MapLibre 6 starts its tile worker from `maplibre-gl-worker.mjs` beside its own module,
  // via a URL the bundler cannot see, so production 404'd it and every map drew only the
  // raster relief: no streets, labels, stops or route.
  it('points MapLibre at the worker file the build emits', async () => {
    const { getWorkerUrl } = await import('@/lib/maplibre');
    expect(getWorkerUrl()).toMatch(/maplibre-gl-worker[^/]*\.mjs/);
  });

  it('every map module loads MapLibre through @/lib/maplibre', () => {
    const bypass = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join('lib', 'maplibre.ts')))
      .filter((file) => {
        const code = readFileSync(file, 'utf8');
        const valueImport = /^\s*import\s+(?!type\b)[^;]*from\s+['"]maplibre-gl['"]/m.test(code);
        // `import('maplibre-gl').Map` as a type loads nothing; a bare import('maplibre-gl') does.
        const dynamicImport = /import\(\s*['"]maplibre-gl['"]\s*\)(?!\s*\.)/.test(code);
        return valueImport || dynamicImport;
      })
      .map((file) => relative(SRC, file));
    expect(bypass).toEqual([]);
  });
});

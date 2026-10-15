import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

test('the bundled Teaching AI runtime matches its TypeScript source', async () => {
  const result = await build({
    entryPoints: ['apps/teaching/src/ai/job-runner.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['zod'],
    tsconfig: 'apps/teaching/tsconfig.json',
    write: false,
    outfile: 'netlify/functions/_shared/teaching-ai-runtime.mjs',
    banner: {
      js: '// Generated from apps/teaching/src/ai/job-runner.ts; regenerate with scripts/generate-teaching-ai-runtime.mjs.'
    }
  });
  const committed = await readFile('netlify/functions/_shared/teaching-ai-runtime.mjs', 'utf8');
  assert.equal(
    committed,
    result.outputFiles[0].text,
    'Run node scripts/generate-teaching-ai-runtime.mjs and commit the result.'
  );
});

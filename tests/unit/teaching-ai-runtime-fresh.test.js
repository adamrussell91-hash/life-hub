import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { TEACHING_AI_RUNTIME_BUILD } from '../../scripts/teaching-ai-runtime-build.mjs';

test('the bundled Teaching AI runtime matches its TypeScript source', async () => {
  const result = await build({ ...TEACHING_AI_RUNTIME_BUILD, write: false });
  const committed = await readFile(TEACHING_AI_RUNTIME_BUILD.outfile, 'utf8');
  assert.equal(
    committed,
    result.outputFiles[0].text,
    'Run node scripts/generate-teaching-ai-runtime.mjs and commit the result.'
  );
});

import { build } from 'esbuild';
await build({
  entryPoints: ['apps/teaching/src/schemas/block.ts'],
  outfile: 'netlify/functions/_shared/teaching-block-schema.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
await build({
  entryPoints: ['apps/teaching/src/quiz/core.ts'],
  outfile: 'netlify/functions/_shared/quiz-core.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/quiz/core.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
await build({
  entryPoints: ['apps/teaching/src/notion-import/server-entry.ts'],
  outfile: 'netlify/functions/_shared/notion-import-core.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  alias: { '@': './apps/teaching/src' },
  banner: {js:'// Generated from apps/teaching/src/notion-import/server-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
await build({
  entryPoints: ['apps/teaching/src/schemas/student-initials.ts'],
  outfile: 'netlify/functions/_shared/student-initials.mjs',
  bundle: true, platform: 'node', format: 'esm',
  banner: {js:'// Generated from apps/teaching/src/schemas/student-initials.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
await build({
  entryPoints: ['apps/teaching/src/markbook/schema.ts'],
  outfile: 'netlify/functions/_shared/markbook-schema.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/markbook/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
await build({
  entryPoints: ['apps/teaching/src/alignment/schema.ts'],
  outfile: 'netlify/functions/_shared/syllabus-alignment-schema.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/alignment/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});

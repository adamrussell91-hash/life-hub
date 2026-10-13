import { build } from 'esbuild';
await build({
  entryPoints: ['apps/teaching/src/schemas/block.ts'],
  outfile: 'netlify/functions/_shared/teaching-block-schema.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});

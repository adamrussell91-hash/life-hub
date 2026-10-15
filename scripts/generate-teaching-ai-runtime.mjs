import { build } from 'esbuild';

// Bundles the Teaching AI job runner (prompt, tools, proposal checks) for the
// Netlify runner, so the server uses the same code the app is tested with.
await build({
  entryPoints: ['apps/teaching/src/ai/job-runner.ts'],
  outfile: 'netlify/functions/_shared/teaching-ai-runtime.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['zod'],
  tsconfig: 'apps/teaching/tsconfig.json',
  banner: {
    js: '// Generated from apps/teaching/src/ai/job-runner.ts; regenerate with scripts/generate-teaching-ai-runtime.mjs.'
  }
});

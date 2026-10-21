/** One esbuild config for the generator and its freshness test. */
export const TEACHING_AI_RUNTIME_BUILD = {
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
};

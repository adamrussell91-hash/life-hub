import { build } from 'esbuild';
import { TEACHING_AI_RUNTIME_BUILD } from './teaching-ai-runtime-build.mjs';

// Bundles the Teaching AI job runner (prompt, tools, proposal and quiz checks)
// for the Netlify runner, so the server uses the same code the app is tested with.
await build(TEACHING_AI_RUNTIME_BUILD);

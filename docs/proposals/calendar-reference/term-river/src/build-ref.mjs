// Rebuilds ../term-river.html from this folder. Run from the repo root:
//   node docs/proposals/calendar-reference/term-river/src/build-ref.mjs
// Needs root node_modules (esbuild). Bundles the REAL modules: term-river.js, capacity-model.js, ghost-writes.js,
// hub-motion-engine.js, hub-motion.js (pill thumb) and apps/tasks/src/domain/school-time.ts.
// Also writes ../fixture.json (the same data) for scripts/calendar-visual-seed.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, '..');
const res = await build({
  entryPoints: [path.join(here, 'river-ref.ts')],
  bundle: true, write: false, format: 'iife', target: 'es2022', platform: 'browser', legalComments: 'none'
});
const js = res.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const tpl = fs.readFileSync(path.join(here, 'river.template.html'), 'utf8');
const banner = '/* Generated from src/river-ref.ts. Do not edit term-river.html; edit src/ and rebuild. */\n';
fs.writeFileSync(path.join(out, 'term-river.html'), tpl.replace('/*__BUNDLE__*/', () => banner + js));
const fx = await build({ entryPoints: [path.join(here, 'fixture.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const F = await import('data:text/javascript;base64,' + Buffer.from(fx.outputFiles[0].text).toString('base64'));
const data = Object.fromEntries(Object.entries(F).filter(([k]) => k !== 'default'));
fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify({ _generated: 'from src/fixture.ts by build-ref.mjs; do not edit', ...data }, null, 2) + '\n');
console.log('built term-river.html', (js.length / 1024).toFixed(1) + 'KB', '');

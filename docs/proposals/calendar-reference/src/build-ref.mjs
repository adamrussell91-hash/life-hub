// Rebuilds ../tideline.html from this folder. Run from the repo root:
//   node docs/proposals/calendar-reference/src/build-ref.mjs
// Needs root node_modules (esbuild). Bundles the REAL modules: calendar-bands.js, capacity-model.js,
// ghost-writes.js, hub-motion.js (pill thumb) and apps/tasks/src/views/timeline-motion.ts.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, '..');
const res = await build({
  entryPoints: [path.join(here, 'tideline-ref.ts')],
  bundle: true, write: false, format: 'iife', target: 'es2022', platform: 'browser', legalComments: 'none'
});
const js = res.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const tpl = fs.readFileSync(path.join(here, 'tideline.template.html'), 'utf8');
const banner = '/* Generated from src/tideline-ref.ts. Do not edit tideline.html; edit src/ and rebuild. */\n';
fs.writeFileSync(path.join(out, 'tideline.html'), tpl.replace('/*__BUNDLE__*/', () => banner + js));
// fixture.json mirrors src/fixture.ts for the hub's visual-seed endpoint.
const fx = await build({ entryPoints: [path.join(here, 'fixture.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(fx.outputFiles[0].text).toString('base64'));
const json = Object.fromEntries(Object.entries(mod).map(([k, v]) => [k, v instanceof Set ? [...v] : v]));
fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(json, null, 2) + '\n');
console.log('built tideline.html', (js.length / 1024).toFixed(1) + 'KB', '+ fixture.json');

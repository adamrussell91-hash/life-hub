// Rebuilds ../timeline.html from this folder. Run from anywhere: node docs/proposals/timeline-reference/src/build-ref.mjs
// Needs apps/tasks dependencies installed (esbuild comes with Vite) and the three modules in apps/tasks/src.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../../../../apps/tasks');
const { build } = await import(pathToFileURL(createRequire(path.join(root, 'package.json')).resolve('esbuild')).href);
const out = path.resolve(here, '..');
fs.mkdirSync(out, { recursive: true });
const res = await build({
  entryPoints: [path.join(here, 'timeline-ref.ts')], bundle: true, write: false, format: 'iife', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, legalComments: 'none'
});
const js = res.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const tpl = fs.readFileSync(path.join(here, 'timeline.template.html'), 'utf8');
const banner = '/* Generated from ref-src/timeline-ref.ts + apps/tasks/src/views/timeline-motion.ts, timeline-morph.ts and src/domain/school-time.ts. */\n';
fs.writeFileSync(path.join(out, 'timeline.html'), tpl.replace('/*__BUNDLE__*/', () => banner + js));
console.log('built', (js.length/1024).toFixed(1)+'KB');

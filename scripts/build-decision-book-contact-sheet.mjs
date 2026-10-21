// scripts/build-decision-book-contact-sheet.mjs
// Bundles packages/decision-book/contact-sheet.ts (every chart on fixed sample runs) into
// docs/mockups/decision-maker/contact-sheet.{js,css}, beside contact-sheet.html. The built
// files are git-ignored: rebuild to look.
// Usage: node scripts/build-decision-book-contact-sheet.mjs   (needs apps/tasks dependencies)
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../apps/tasks/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Vite's `?raw` imports (Problem Solver's glyphs) as text. */
const raw = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolve(dirname(args.importer), args.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
  }
};

await build({
  entryPoints: [`${root}packages/decision-book/contact-sheet.ts`],
  outfile: `${root}docs/mockups/decision-maker/contact-sheet.js`,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  plugins: [raw],
  logLevel: 'info'
});

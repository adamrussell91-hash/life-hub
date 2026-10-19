#!/usr/bin/env node
// Usage: node scripts/problem-solver-preview.mjs <tool> <out-dir> [--open <nodeId>] [--next] [--click <selector>] [--name <suffix>]
// --click clicks a control first (such as a layout toggle); --name adds -<suffix> to the PNG names.
// --next applies SAMPLES['<tool>:next'] after load and shoots <tool>-next-<width>.png (radar morph end state).
// Bundles a renderer with a synthetic sample run, then screenshots it at 900px and 390px.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { SAMPLES } from './problem-solver-preview-samples.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERERS = {
  five_whys: ['five-whys', 'createFiveWhysView'],
  problem_tree: ['problem-tree', 'createProblemTreeView'],
  concept_map: ['concept-map', 'createConceptMapView'],
  problem_statement: ['problem-statement', 'createProblemStatementView'],
  gap_basic: ['gap-basic', 'createGapBasicView'],
  gap_radar: ['gap-radar', 'createGapRadarView'],
  smart: ['smart', 'createSmartView'],
  causal_map: ['causal-map', 'createCausalMapView'],
  perspective_shift: ['perspective-shift', 'createPerspectiveShiftView'],
  radial_tree: ['radial-tree', 'createRadialTreeView'],
  force_field: ['force-field', 'createForceFieldView'],
  force_field_unscored: ['force-field', 'createForceFieldView'],
  from_to: ['from-to', 'createFromToView'],
  // The record takes a whole session, not a run.
  record: ['record', 'createRecordView'],
  record_polya: ['record', 'createRecordView'],
  record_triz: ['record', 'createRecordView']
};

const args = process.argv.slice(2);
const openIndex = args.indexOf('--open');
const openNode = openIndex >= 0 ? args.splice(openIndex, 2)[1] : null;
const nextIndex = args.indexOf('--next');
const applyNext = nextIndex >= 0;
if (applyNext) args.splice(nextIndex, 1);
const clickIndex = args.indexOf('--click');
const clickSelector = clickIndex >= 0 ? args.splice(clickIndex, 2)[1] : null;
const nameIndex = args.indexOf('--name');
const suffix = nameIndex >= 0 ? `-${args.splice(nameIndex, 2)[1]}` : '';
const [tool, outDir] = args;
if (!tool || !outDir || !RENDERERS[tool] || !SAMPLES[tool]) {
  console.error(`Usage: problem-solver-preview.mjs <${Object.keys(RENDERERS).join('|')}> <out-dir> [--open <nodeId>] [--next] [--click <selector>] [--name <suffix>]`);
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const [file, factory] = RENDERERS[tool];
const rawPlugin = {
  name: 'raw-svg',
  setup(b) {
    b.onResolve({ filter: /\.svg\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.replace('?raw', '')) }));
    b.onLoad({ filter: /\.svg$/ }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }));
  }
};
const bundle = await build({
  stdin: {
    contents: `import { ${factory} as make } from './render/${file}';\nconst run = ${JSON.stringify(SAMPLES[tool])};\nconst next = ${JSON.stringify(SAMPLES[tool + ':next'] ?? null)};\nconst view = make(document);\nview.update(run);\ndocument.querySelector('#mount').append(view.el);\nwindow.__view = view;\nwindow.__next = next;`,
    resolveDir: join(root, 'packages/problem-solver'),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'iife',
  plugins: [rawPlugin],
  loader: { '.svg': 'text' }
});
const css = ['apps/tasks/design-kit/tokens.css', 'packages/graph-blocks/graph-blocks.css', 'packages/problem-solver/problem-solver.css'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;background:var(--paper);font-family:var(--font-ui)}.wrap{padding:24px 16px;max-width:720px;margin:0 auto}</style></head><body><div class="ps-scope wrap"><div id="mount"></div></div><script>${bundle.outputFiles[0].text.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
const page = join(outDir, `${tool}.html`);
writeFileSync(page, html);

const browser = await chromium.launch({ executablePath: process.env.PS_PREVIEW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const width of [900, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => console.error('page error:', e.message));
  await tab.goto(`file://${page}`);
  await tab.waitForTimeout(900);
  if (clickSelector) {
    await tab.click(clickSelector);
    await tab.waitForTimeout(1000);
  }
  if (openNode) {
    await tab.click(`[data-node="${openNode}"] button`);
    await tab.waitForTimeout(500);
  }
  if (applyNext) {
    await tab.evaluate(() => window.__view.update(window.__next));
    await tab.waitForTimeout(1200);
  }
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.warn(`horizontal overflow at ${width}px: ${overflow}px`);
  await tab.screenshot({ path: join(outDir, `${tool}${applyNext ? '-next' : ''}${suffix}-${width}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
const stem = `${tool}${applyNext ? '-next' : ''}${suffix}`;
console.log(`wrote ${outDir}/${stem}-900.png and ${stem}-390.png`);

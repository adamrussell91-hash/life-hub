import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBlockCss, OUTPUT } from '../../scripts/generate-block-css.mjs';

test('packages/block-styles/blocks.css matches Teaching\'s block styles', () => {
  assert.equal(
    readFileSync(OUTPUT, 'utf8'),
    buildBlockCss(),
    `${OUTPUT} is stale: run node scripts/generate-block-css.mjs`
  );
});

test('block styles keep engine rules and leave Teaching\'s shell behind', () => {
  const css = buildBlockCss(`
    .teacher-layout { display: grid; }
    .block-editor, .home-week { gap: 1rem; }
    @media (max-width: 40rem) { .lesson-page__block { padding: 0; } .nav-item { color: red; } }
    @keyframes used-pulse { to { opacity: 0; } }
    @keyframes shell-only { to { opacity: 0; } }
    .block-audio__dot { animation: used-pulse 1s infinite; }
  `);
  assert.match(css, /\.block-editor \{/);
  assert.doesNotMatch(css, /teacher-layout|home-week|nav-item|shell-only/);
  assert.match(css, /@media \(max-width: 40rem\) \{\s*\.lesson-page__block/);
  assert.match(css, /@keyframes used-pulse/);
});

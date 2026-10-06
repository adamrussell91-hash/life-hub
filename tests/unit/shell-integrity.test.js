import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { healShellStyles } from '../../apps/life/js/app/heal-shell-styles.js';

const ROOT = new URL('../../', import.meta.url);

test('every service-worker shell file is published, so the worker can install', async () => {
  // capture-inbox.html was precached but never published (2–6 Oct): addAll failed,
  // no new worker installed, and phones kept a stale shell (unstyled Day dial).
  await import('../../scripts/prepare-web.mjs'); // builds dist/ on import
  const worker = readFileSync(new URL('apps/life/service-worker.js', ROOT), 'utf8');
  const list = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(worker)[1];
  const files = [...list.matchAll(/^\s*'([^']*)'/gm)].map(m => m[1]).filter(Boolean);
  assert.ok(files.length > 100);
  const missing = files.filter(file => !existsSync(new URL(`dist/${file}`, ROOT)));
  assert.deepEqual(missing, []);
  assert.match(worker, /Promise\.allSettled\(PRECACHE_URLS\.map/, 'one missing file must not fail the whole install');
});

test('healShellStyles adds stylesheets a stale index.html lacks', async () => {
  const window = new Window({ url: 'https://life.example/' });
  const doc = window.document;
  doc.head.innerHTML = '<link rel="stylesheet" href="packages/design-kit/tokens.css">';
  const live = `<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
    <link rel="stylesheet" href="packages/design-kit/tokens.css">
    <link rel="stylesheet" href="packages/design-kit/calendar-day-dial.css">
    <link rel="manifest" href="manifest.webmanifest">`;
  const fetchImpl = async () => new Response(live, { status: 200 });
  assert.deepEqual(await healShellStyles(doc, { fetchImpl }), ['packages/design-kit/calendar-day-dial.css']);
  assert.equal(doc.querySelectorAll('link[rel="stylesheet"]').length, 2);
  assert.deepEqual(await healShellStyles(doc, { fetchImpl }), [], 'nothing twice');
  assert.deepEqual(await healShellStyles(doc, { fetchImpl: async () => { throw new Error('offline'); } }), []);
  await window.happyDOM.close();
});

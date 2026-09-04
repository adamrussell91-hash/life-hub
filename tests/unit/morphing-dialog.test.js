import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  morphFromRect,
  openMorphingDialog,
  resetMorphingDialogForTests,
  runMorphTransform
} from '../../packages/design-kit/js/morphing-dialog.js';

test('runMorphTransform always applies the DOM update', () => {
  resetMorphingDialogForTests();
  let called = false;
  runMorphTransform({
    update: () => {
      called = true;
    }
  });
  assert.equal(called, true);
});

test('openMorphingDialog no-ops without a document body', () => {
  resetMorphingDialogForTests();
  const frame = { ownerDocument: null };
  const handle = openMorphingDialog({ frame });
  assert.equal(typeof handle.close, 'function');
  handle.close();
});

test('morphFromRect ignores empty rects', () => {
  morphFromRect({ left: 0, top: 0, width: 0, height: 0 }, { style: {}, classList: { add() {}, remove() {} } });
});

test('kit motion stylesheet defines the morphing dialog chrome', async () => {
  const css = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-morph-dialog\b/);
  assert.match(css, /\.hub-morph-dialog__frame\b/);
  assert.match(css, /\.hub-morph-dialog__origin\b/);
});

test('Life, Teaching, Tasks, and Knowledge load the shared morph module', async () => {
  const life = await readFile(new URL('../../apps/life/js/app/mind-thread-sheet.js', import.meta.url), 'utf8');
  const teaching = await readFile(new URL('../../apps/teaching/src/teacher/entity-card-expand.ts', import.meta.url), 'utf8');
  const tasks = await readFile(new URL('../../apps/tasks/src/views/container-transform.ts', import.meta.url), 'utf8');
  const knowledge = await readFile(new URL('../../apps/knowledge/src/main.ts', import.meta.url), 'utf8');
  assert.match(life, /morphFromRect/);
  assert.match(teaching, /openMorphingDialog/);
  assert.match(tasks, /runMorphTransform/);
  assert.match(knowledge, /morphFromRect/);
});

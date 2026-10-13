import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  collectAnthology,
  normaliseTag
} from '../../netlify/functions/_shared/teaching-anthology.mjs';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../apps/teaching/fixtures/annotation-anthology.json', import.meta.url),
    'utf8'
  )
);

test('normaliseTag keeps first spelling', () => {
  const seen = new Map();
  assert.equal(normaliseTag('Memory', seen), 'Memory');
  assert.equal(normaliseTag(' memory ', seen), 'Memory');
});

test('collectAnthology strips teacher-layer sentinel (shared fixture)', () => {
  const data = collectAnthology(structuredClone(fixture.snapshots), {
    lessonOrder: ['lesson_dulce', 'lesson_anthem', 'lesson_draft']
  });
  const json = JSON.stringify(data);
  assert.doesNotMatch(json, new RegExp(fixture.sentinel));
  assert.doesNotMatch(json, new RegExp(fixture.teacher_layer_id));
  assert.deepEqual(
    data.items.map(item => item.annotation_id).sort(),
    ['ann_enjambment', 'ann_rhetorical', 'ann_simile']
  );
  assert.equal(
    data.items.some(item => item.lesson_id === 'lesson_draft'),
    false
  );
  const dulce = data.texts.find(text => text.block_id === 'block_dulce');
  assert.deepEqual(dulce.fingerprint, { Structural: 1, Comparative: 1 });
});

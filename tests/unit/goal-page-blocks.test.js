// tests/unit/goal-page-blocks.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { GOAL_INPUT_KEYS, normalizeGoalRecord } from '../../netlify/functions/_shared/goal-record.mjs';

const block = {
  id: 'block-1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher',
  content: { html: '<p>Example note</p>' }, layout: {}, print: {}, settings: {},
  created_at: '2026-11-20T00:00:00.000Z', updated_at: '2026-11-20T00:00:00.000Z', schema_version: 1
};

test('goals accept page_blocks on create and patch', () => {
  assert.ok(GOAL_INPUT_KEYS.includes('page_blocks'));
});

test('normalizeGoalRecord keeps page block objects and drops junk entries', () => {
  const out = normalizeGoalRecord({ id: 'g1', title: 'Example', page_blocks: [block, 'junk', null] });
  assert.deepEqual(out.page_blocks, [block]);
});

test('normalizeGoalRecord leaves page_blocks off when absent or not an array', () => {
  assert.equal('page_blocks' in normalizeGoalRecord({ id: 'g1', title: 'Example' }), false);
  assert.equal('page_blocks' in normalizeGoalRecord({ id: 'g1', title: 'Example', page_blocks: 'nope' }), false);
});

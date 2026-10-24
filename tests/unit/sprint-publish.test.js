// tests/unit/sprint-publish.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSprintPublish } from '../../netlify/functions/_shared/sprint.mjs';

const section = (id, key, blocks = []) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: key, blocks, sprint_phase: key } });
const phases = ['understand', 'sketch', 'decide', 'prototype', 'test'].map((key, i) => ({ key, where: i % 2 ? 'home' : 'class', due_date: `2026-11-0${i + 1}`, due_time: '15:00', ends_at: '', instruction: '', stretch: '' }));
const draft = {
  id: 'sp1',
  pedagogical_mode: 'design_sprint',
  sprint: {
    class_id: 'class1', decider: 'top_vote', support: 'open', lock_hours: 2,
    criteria: [{ id: 'c1', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Why it matters' }],
    reflection_criteria: [{ id: 'reflect', text: 'Explains what the test showed' }], reflection_prompts: ['a', 'b'],
    requirements: [{ id: 'r1', text: 'Two sources', phases: ['sketch'] }],
    idea_guide: { checklist: ['x'], model: { topic: 'Wall', text: 'y', notes: [] } },
    phases, groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }], columns: {}
  }
};

test('publish keeps the body public and the groups server-side', () => {
  const out = prepareSprintPublish(draft, [section('s1', 'understand'), section('s2', 'sketch')]);
  assert.equal(out.snapshot.blocks.length, 2);
  assert.equal(out.snapshot.sprint.support, 'open');
  assert.equal(JSON.stringify(out.snapshot).includes('st_ann'), false);
  assert.equal(JSON.stringify(out.snapshot).includes('ht4-9'), false);
  assert.deepEqual(out.config.groups, [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }]);
  assert.equal(out.config.class_id, 'class1');
  assert.equal(out.config.decider, 'top_vote');
  assert.deepEqual(out.config.criteria, ['c1', 'c2']);
  assert.equal(out.config.phases[1].ideas, undefined);
  assert.equal(typeof out.config.version, 'string');
});

test('publish problems stop an unfinished sprint on the server', async () => {
  const { sprintPublishProblems } = await import('../../netlify/functions/_shared/sprint.mjs');
  assert.deepEqual(sprintPublishProblems(draft), []);
  assert.deepEqual(sprintPublishProblems({ ...draft, sprint: undefined }), ['Set up the sprint’s Kit before publishing.']);
  assert.ok(sprintPublishProblems({ ...draft, sprint: { ...draft.sprint, groups: [] } }).includes('Put every student in a group.'));
  assert.ok(sprintPublishProblems({ ...draft, sprint: { ...draft.sprint, criteria: [draft.sprint.criteria[0]] } }).includes('Add at least 2 criteria in the Kit.'));
});

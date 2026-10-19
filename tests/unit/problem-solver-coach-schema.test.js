// tests/unit/problem-solver-coach-schema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

test('extractJson finds the object inside a fence', () => {
  assert.deepEqual(extractJson('```json\n{"a":{"b":"}"}}\n```'), { a: { b: '}' } });
  assert.equal(extractJson('no json'), null);
});

test('valid accept turn', () => {
  const out = validateCoachTurn({
    verdict: 'accept',
    message: 'Good. That is a process, not a person. Why does the rota change so late?',
    node: { slot: 'why:2', text: 'The rota is published on Friday afternoon.' },
    skillsSeen: ['analysis', 'vibes'],
    skillsMissing: []
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.skillsSeen, ['analysis']);
  assert.equal(out.value.node.slot, 'why:2');
});

test('rejects bad verdicts, empty messages and malformed nodes', () => {
  assert.equal(validateCoachTurn({ verdict: 'maybe', message: 'x' }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: '  ' }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'Why 2', text: 'x' } }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'why:2', text: '' } }).ok, false);
});

test('suggestions: known tools only; unknown kinds dropped', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try a tree.', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } });
  assert.equal(ok.value.suggestion.tool, 'problem_tree');
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'x', suggestion: { kind: 'next_tool', tool: 'mindmap', reason: 'r' } }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'x', suggestion: { kind: 'protocol', protocolId: 'mirror' } }).value.suggestion, null);
});

test('model choice and frame fields', () => {
  const out = validateCoachTurn({ verdict: 'accept', message: 'ok', frame: { goal: 'Ship it', other: 'x' }, model: { id: 'polya', reason: 'Bounded.' } });
  assert.deepEqual(out.value.frame, { goal: 'Ship it' });
  assert.deepEqual(out.value.model, { id: 'polya', reason: 'Bounded.' });
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', model: { id: 'six_hats', reason: 'x' } }).ok, false);
});

test('next_step suggestions are accepted; finish_define is read as next_step', () => {
  const base = { verdict: 'clarify', message: 'Ready to move on?' };
  assert.deepEqual(validateCoachTurn({ ...base, suggestion: { kind: 'next_step', reason: 'Enough here.' } }).value.suggestion, { kind: 'next_step', reason: 'Enough here.' });
  assert.deepEqual(validateCoachTurn({ ...base, suggestion: { kind: 'finish_define', reason: 'Done.' } }).value.suggestion, { kind: 'next_step', reason: 'Done.' });
});

test('learning is kept as trimmed text, else null', () => {
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'Noted.', learning: '  Rushes to fixes.  ' }).value.learning, 'Rushes to fixes.');
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'Noted.' }).value.learning, null);
});

test('node.tag is kept, trimmed and lowercased', () => {
  const v = validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'trend:1', text: 'Fewer walk-ins', tag: ' Declining ' } }).value;
  assert.equal(v.node.tag, 'declining');
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'problem', text: 'x' } }).value.node.tag, undefined);
});

test('proposeTasks needs a slot and a title; bad dates become null; at most five', () => {
  const ok = validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: [{ slot: 'card:1', title: ' Draft the rota template ', due: '2026-10-24' }, { slot: 'card:2', title: 'Ask the team', due: '24/10' }] }).value;
  assert.deepEqual(ok.proposeTasks, [{ slot: 'card:1', title: 'Draft the rota template', due: '2026-10-24' }, { slot: 'card:2', title: 'Ask the team', due: null }]);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: [{ slot: 'card:1' }] }).ok, false);
  const many = Array.from({ length: 7 }, (_, i) => ({ slot: `card:${i + 1}`, title: `Task ${i + 1}` }));
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: many }).value.proposeTasks.length, 5);
  assert.deepEqual(validateCoachTurn({ verdict: 'clarify', message: 'ok' }).value.proposeTasks, []);
});

test('proposeReview needs a real date', () => {
  assert.deepEqual(validateCoachTurn({ verdict: 'clarify', message: 'ok', proposeReview: { due: '2026-11-02', reason: 'First results by then.' } }).value.proposeReview, { due: '2026-11-02', reason: 'First results by then.' });
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'ok', proposeReview: { due: '2026-02-31' } }).value.proposeReview, null);
});

// tests/unit/get-things-done-record.test.js
// Gear Shifter's action record: composed from the session (never the coach's words), its
// provenance and caption, and its offers (write, graphic retry, a dated update once Review adds
// what happened). The page links it with Decision Maker's action; the row carries the main technique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionOffer, actionProvenance, commitSource, composeActionRecord } from '../../packages/get-things-done/record.mjs';
import { recordOffer } from '../../packages/decision-book/record.mjs';
import { COMMIT_ID } from '../../packages/get-things-done/commit-slots.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, setReviewTask, startReview, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { committed, committing, deps, reply } from './gear-shifter-test-helpers.mjs';

const clarify = (s, raw = {}) => applyCoachTurn(s, validateCoachTurn({ verdict: 'clarify', message: 'Fair enough. What did you learn about how you get things done?', ...raw }).value, deps);

/** Committed, then moved on to wait, then reviewed now with the experiment review worked. */
function reviewed(tool = 'gt_review') {
  let s = setReviewTask(committed(), { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = clarify(moveOn(s, deps));
  s = reply(s, { verdict: 'clarify', learning: 'A dated check-back keeps me honest.' }, 'A dated check-back keeps me honest.');
  assert.equal(s.reviewState.status, 'waiting');
  s = startReview(s, {}, deps);
  s = clarify(s, { suggestion: { kind: 'next_technique', tool, reason: 'The results are in.' } });
  s = acceptSuggestion(s, deps);
  if (tool === 'gt_review') {
    s = reply(s, { node: { slot: 'changed', text: 'The report went out a day early' } }, 'It went out a day early.');
    s = reply(s, { node: { slot: 'cost', text: 'An hour of chasing on Thursday' } }, 'An hour of chasing.');
    s = reply(s, { node: { slot: 'keep', text: 'Keep thanking people before the ask' } }, 'Keep thanking first.');
  }
  return s;
}

test('the source is the latest complete experiment; nothing before', () => {
  assert.equal(commitSource(committing()), null);
  assert.equal(composeActionRecord(committing()), null);
  assert.equal(actionOffer(committing()), null);
  const s = committed();
  assert.equal(commitSource(s).tool, COMMIT_ID);
});

test('the record composes from the session, never the coach’s words', () => {
  const file = composeActionRecord(committed());
  assert.equal(file.title, 'Action record: The team report keeps stalling.');
  assert.equal(file.version, 1);
  assert.deepEqual(file.sections.map((section) => section.key), ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course', 'need', 'known', 'techniques', 'learnings']);
  const lines = Object.fromEntries(file.sections.map((section) => [section.key, section.lines]));
  assert.deepEqual(lines.result, ['The team report goes out on Friday']);
  assert.deepEqual(lines.rests_on, ['Appreciation: thank Priya first (uses Appreciation: Thank Priya pulling)']);
  assert.deepEqual(lines.check_back, ['5 November 2026']);
  assert.deepEqual(lines.need, ['Get the team report out']);
  assert.deepEqual(lines.techniques, ['Appreciation']);
  assert.deepEqual(lines.learnings, ['Explore: I move faster when I thank people first.']);
  assert.ok(!JSON.stringify(file).includes('Noted.'), 'no coach message reaches the record');
});

test('the provenance names the main technique, its section, the date and the caption', () => {
  assert.deepEqual(actionProvenance(committed()), {
    technique: 'gt_appreciation',
    section: 'working_with_others',
    techniques: ['Appreciation'],
    date: '2026-10-22',
    caption: 'Worked with The Get Things Done Book · Appreciation · 22 October 2026'
  });
});

test('offers: write, a graphic retry, nothing, then a dated update after the review', () => {
  let s = committed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  assert.equal(offer.provenance.caption, 'Worked with The Get Things Done Book · Appreciation · 22 October 2026');
  assert.equal(recordOffer(s), null, 'the decision record offer is for decisions only');
  s = linkCaseFile(s, { target: { kind: 'project', id: 'proj-report' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: false }, deps);
  assert.equal(s.caseFile.graphic, false);
  assert.equal(actionOffer(s).kind, 'graphic');
  s = linkCaseFile(s, { target: { kind: 'project', id: 'proj-report' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  assert.equal(actionOffer(s), null);
  assert.deepEqual(s.links, [{ kind: 'project', id: 'proj-report' }]);
});

test('Review adds what happened and offers update v2; nothing while it is under way', () => {
  let s = committed();
  const offer = actionOffer(s);
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  const under = (() => {
    let r = setReviewTask(s, { taskId: 'task-check', due: '2026-11-05' }, deps);
    r = clarify(moveOn(r, deps));
    r = reply(r, { verdict: 'clarify', learning: 'Dates help.' }, 'Dates help.');
    return startReview(r, {}, deps);
  })();
  assert.equal(actionOffer(under), null, 'held while the review is under way');
  let done = reviewed();
  done = linkCaseFile(done, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  done = clarify(moveOn(done, deps));
  assert.equal(done.phase, 'finished');
  const update = actionOffer(done);
  assert.equal(update.kind, 'update');
  assert.equal(update.version, 2);
  assert.ok(update.changed.includes('outcome'));
  assert.deepEqual(update.file.sections.find((section) => section.key === 'outcome').lines, ['Changed: The report went out a day early', 'Cost: An hour of chasing on Thursday', 'Keep: Keep thanking people before the ask']);
});

test('a finished project’s Project Evaluation fills what happened', () => {
  let s = reviewed('gt_project_evaluation');
  s = reply(s, { node: { slot: 'entry:1', text: 'Writing it with Priya was fun', tag: 'fun' } }, 'Fun with Priya.');
  const outcome = composeActionRecord(s).sections.find((section) => section.key === 'outcome');
  assert.deepEqual(outcome.lines, ['Fun: Writing it with Priya was fun']);
});

test('only book sessions with a record link one; a shift row carries its main technique', () => {
  assert.equal(actionOffer(createSession({ text: 'Late rota.' }, deps)), null);
  assert.throws(() => linkCaseFile(createSession({ text: 'Late rota.', kind: 'shift' }, deps), { target: { kind: 'task', id: 't' }, version: 1, title: 'x', sections: { result: 'abcd1234' } }, deps), /no Document step/);
  assert.equal(summaryRow(committed()).main, 'gt_appreciation');
  assert.equal(summaryRow(createSession({ text: 'Late rota.' }, deps)).main, undefined);
});

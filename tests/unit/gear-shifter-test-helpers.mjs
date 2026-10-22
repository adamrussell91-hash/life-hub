// tests/unit/gear-shifter-test-helpers.mjs
// Shared steps for Gear Shifter's session tests: a framed shift with Appreciation worked, Commit
// opened, and a complete experiment. Each coach turn is read through the schema, as a live one is.
import assert from 'node:assert/strict';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { COMMIT_ID } from '../../packages/get-things-done/commit-slots.mjs';

let n = 0;
export const deps = { now: () => '2026-10-22T10:00:00.000Z', newId: () => `id${(n += 1)}` };

/** The person says `text` (if any), then the coach replies with `raw`, read through the schema. */
export function reply(session, raw, text = null) {
  const next = text ? say(session, text, deps) : session;
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', ...raw });
  assert.ok(turn.ok, turn.error);
  return applyCoachTurn(next, turn.value, deps);
}

/** A framed shift with Appreciation worked to its minimum. */
export function explored() {
  let s = createSession({ text: 'The team report keeps stalling.', kind: 'shift' }, deps);
  s = reply(s, { frame: { need: 'Get the team report out' } });
  s = reply(s, { frame: { route: 'others' } }, 'It turns on two colleagues.');
  s = reply(s, { frame: { known: 'Due Friday; Priya has the data.' }, suggestion: { kind: 'next_technique', tool: 'gt_appreciation', reason: 'Fits.' } }, 'Due Friday; Priya has the data.');
  s = acceptSuggestion(s, deps);
  s = reply(s, { node: { slot: 'entry:1', text: 'Thank Priya for pulling the sales data together', tag: 'acknowledge_contribution' } }, 'Priya pulled the data.');
  s = reply(s, { node: { slot: 'reflection', text: 'Saying thanks first makes the next ask easier' } }, 'Thanks first.');
  return s;
}

/** Explored, then Commit opened on gt_commit. */
export function committing() {
  let s = moveOn(explored(), deps);
  s = applyCoachTurn(s, validateCoachTurn({ verdict: 'clarify', message: 'What did you learn about how you get things done?' }).value, deps);
  s = reply(s, { verdict: 'clarify', learning: 'I move faster when I thank people first.' }, 'I move faster when I thank people first.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return acceptSuggestion(s, deps);
}

/** Committing, with the experiment worked to complete (check-back 5 November 2026). */
export function committed() {
  let s = committing();
  s = reply(s, { node: { slot: 'result', text: 'The team report goes out on Friday' } }, 'The report out on Friday.');
  s = reply(s, { node: { slot: 'rests_on', text: 'Appreciation: thank Priya first' }, basis: [{ tool: 'gt_appreciation', slot: 'entry:1' }] }, 'It rests on thanking Priya.');
  s = reply(s, { node: { slot: 'next_action', text: 'Message Priya to thank her' }, proposeTasks: [{ slot: 'next_action', title: 'Message Priya', due: null }] }, 'Message Priya.');
  s = reply(s, { node: { slot: 'start', text: 'Right after the Monday stand-up' } }, 'After the stand-up.');
  s = reply(s, { node: { slot: 'check_back', text: '2026-11-05' } }, '2026-11-05');
  return reply(s, { node: { slot: 'change_course', text: 'Priya has not replied by Wednesday' } }, 'No reply by Wednesday.');
}

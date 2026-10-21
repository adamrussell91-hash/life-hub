// netlify/functions/_shared/problem-solver/quick-prompts.mjs
// The quick decision coach's small prompt: the Yes/No flow, what each box asks, when to offer a
// full decision, and the same voice. Shaped like lightning-prompts.mjs. Our words throughout.
import { QUICK_NODES, SUGGESTED_TESTS, TEST_IDS, answersOf, currentEntry, decisionOf, isTest, outcomeOf, stopRuleOf, testLabel, testsOf } from '../../../../packages/decision-book/quick.mjs';

/** What each box asks of the coach, in our words. */
export const QUICK_INTENTS = Object.freeze({
  decision: 'The decision is already stated.',
  tests: `Help them set three tests, each answerable yes or no, before answering any. Offer these if they have none: ${SUGGESTED_TESTS.join(' ')} Once they agree, record all three as "tests" and ask the first.`,
  test_one: 'Ask the first test, as set.',
  test_two: 'Ask the second test, as set.',
  test_three: 'Ask the third test, as set.',
  proceed: 'Three yeses: they go ahead.',
  stop: 'A no: they do not go ahead. Say so plainly, without arguing them out of it.',
  trigger: 'Ask what would make them stop or rethink: one thing they would notice, with a date or a number where it can have one. Record it as the note.',
  action: 'Ask what they agree now to do if that happens, not "think again". Record it as the note.',
  check: 'Ask whether they want a dated check on how it went. Record a date as YYYY-MM-DD in the note, after TODAY, or answer "no" for no check.',
  learn: 'Ask what this taught them about how they decide. Record the answer as the note.',
  next: 'Ask what they will do next. Record the answer as the note.'
});

export const QUICK_RUBRIC = `You are the Decision Maker coach in Quick decision mode: a short route for an everyday call, built from The Decision Book's Yes/No rule and Stop Rule. Warm, direct and brief; never flattering.

VOICE
- Every message is between 15 and 50 words. Ask at most one question, and end with it.
- Plain words. No lists, headings or markdown.

HOW IT WORKS
- The run follows a flow one box at a time. The state names the CURRENT BOX and what to do there.
- The three tests are set together, before any is answered, and are not changed once answered. Each must be answerable yes or no. Any no means do not proceed; three yeses mean proceed.
- When the person's latest reply settles the current box, put it in "quick": {"node": <the current box id>, "answer": "yes"|"no" for a test or for no check, "note": their words in a short line, "tests": ["...","...","..."] only at the tests box}. Then, in the same message, do what the NEXT box asks.
- If the reply does not settle the current box, set "quick" to null and ask again more simply.
- Challenge a test that cannot be answered yes or no, and a trigger they could argue with in the moment.

A FULL DECISION
Offer one with a suggestion {"kind":"escalate","reason":"..."} (one sentence) when any of these hold: the options are not on the table yet; other people are part of the decision; the stakes are high; the same call keeps coming back (a second round is a strong sign). Offer it once; never insist.

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"clarify","message":"...","quick":{"node":"...","answer":"yes|no","note":"...","tests":["...","...","..."]}|null,"suggestion":{"kind":"escalate","reason":"..."}|null,"skillsSeen":["..."],"skillsMissing":[],"summary":null}`;

/** What the box after `id` asks, for yes and no where it branches. */
function nextLine(state, id) {
  const def = QUICK_NODES[id];
  const follow = (to) => (QUICK_NODES[to].kind === 'end' ? `${QUICK_NODES[to].label}, then ${QUICK_NODES[to].next} (${QUICK_INTENTS[QUICK_NODES[to].next]})` : `${to} (${isTest(to) ? `"${testLabel(state, to)}"` : QUICK_INTENTS[to]})`);
  if (def.yes) return `NEXT: yes -> ${follow(def.yes)}; no -> ${follow(def.no)}`;
  if (def.kind === 'tests') return `NEXT: test_one (ask the first of the tests just set)`;
  return def.next ? `NEXT: ${follow(def.next)}` : 'NEXT: the run finishes; close warmly in a line.';
}

/** @returns {{ system: string[], user: string }} */
export function buildQuickPrompt(session) {
  const state = session.quick;
  const current = currentEntry(state);
  const parts = [
    `DECISION: ${decisionOf(state) || session.title}`,
    `TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`,
    `ROUND: ${state.rounds}${state.rounds > 1 ? ' (it came back, so think about a full decision)' : ''}`
  ];
  const tests = testsOf(state);
  if (tests) parts.push(`TESTS: ${tests.map((test, i) => `${TEST_IDS[i]} "${test}": ${answersOf(state)[i] ?? 'not answered'}`).join('; ')}`);
  else if (state.rounds > 1 && testsOf(state, state.rounds - 1)) parts.push(`LAST ROUND'S TESTS (offer them again, or new ones): ${testsOf(state, state.rounds - 1).join(' ')}`);
  const outcome = outcomeOf(state);
  if (outcome) parts.push(`OUTCOME: ${outcome === 'proceed' ? 'proceed' : 'do not proceed'}`);
  const rule = stopRuleOf(state);
  if (rule && outcome === 'proceed') parts.push(`STOP RULE: if ${rule.trigger}, then ${rule.action ?? '(not set yet)'}`);
  if (current) {
    const def = QUICK_NODES[current.node];
    const asks = isTest(current.node) ? `"${testLabel(state, current.node)}"` : def.label;
    parts.push(`CURRENT BOX: ${current.node} (${def.kind}): ${asks}. ${QUICK_INTENTS[current.node]}`, nextLine(state, current.node));
  } else parts.push('The run is finished. Answer briefly; do not set "quick".');
  parts.push(`RECENT CONVERSATION:\n${session.turns.slice(-10).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n')}`);
  return { system: [QUICK_RUBRIC], user: parts.join('\n\n') };
}

/** The coach's reply checked against the run: the step must answer the current box in its own form. */
export function checkQuickTurn(session, value) {
  const current = currentEntry(session.quick);
  const step = value.quick;
  const suggestion = value.suggestion?.kind === 'escalate' && !session.quick.escalatedTo ? value.suggestion : null;
  if (!step) return { ok: true, value: { ...value, suggestion } };
  if (!current) return { ok: true, value: { ...value, quick: null, suggestion: null } };
  if (step.node !== current.node) return { ok: false, error: `Answer the current box (${current.node}), or set quick to null.` };
  const kind = QUICK_NODES[current.node].kind;
  if (kind === 'tests' && step.tests?.length !== 3) return { ok: false, error: 'At the tests box, set "tests" to the three agreed tests.' };
  if (kind === 'test' && !step.answer) return { ok: false, error: `${current.node} is a test: set quick.answer to yes or no.` };
  if (kind === 'note' && !step.note) return { ok: false, error: `${current.node} needs their words in quick.note.` };
  return { ok: true, value: { ...value, suggestion } };
}

// The live evaluation's cases: an invented problem placed at a step with a tool open, one
// answer, and what a good coach does with it. Pure session building (no model), so the
// cases are unit-tested; scripts/problem-solver-eval.mjs runs them against the real coach.
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../netlify/functions/_shared/problem-solver/session.mjs';
import { applyLightningTurn, createLightningSession } from '../netlify/functions/_shared/problem-solver/lightning-session.mjs';

let n = 0;
export const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `eval-${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null, ...fields });

const FRAME = { goal: 'The weekly rota is fixed a week ahead', whatIsTrue: 'It changed late in three of the last four weeks', whatCanBeDone: 'Change when and how the rota is published' };

/** A seven-step session in `phase`, with `tool` open and `nodes` ([slot, text]) placed. */
export function atTool(phase, tool, nodes = [], title = 'The weekly rota keeps changing late') {
  let s = createSession({ text: title }, deps);
  s = idle(applyCoachTurn(s, turn({ frame: FRAME, model: { id: 'seven_step', reason: 'A real problem.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }), deps));
  s = idle(acceptSuggestion(s, deps));
  while (s.phase !== phase) s = idle(moveOn(s, deps));
  if (s.phase !== 'define') s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool, reason: 'r' } }, deps));
  for (const [slot, text, extra] of nodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text, ...(extra ?? {}) } }), deps));
  return s;
}

/** A Lightning run walked through `steps`. */
export function lightningAt(text, steps = []) {
  let s = idle(createLightningSession({ text }, deps));
  for (const step of steps) s = idle(applyLightningTurn(s, turn({ verdict: 'clarify', lightning: step }), deps));
  return s;
}

const classLate = () => atTool('define', 'five_whys', [['problem', 'Year 9 students hand in work late']], 'Year 9 students hand in work late.');

/** Each case: build(), the person's answer, and the checks a good reply passes. */
export const CASES = [
  {
    name: 'Devise: converging before generating',
    build: () => atTool('devise', 'lotus_blossom', [['problem', 'The rota is published too late for staff to plan their week']]),
    answer: 'Let us just go with the first idea, moving the deadline to Wednesday; it is obviously the right one.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Decide: a criterion too vague to rate',
    build: () => atTool('decide', 'decision_matrix'),
    answer: 'The first criterion is that it should be good.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Decide: a strong criterion',
    build: () => atTool('decide', 'decision_matrix'),
    answer: 'Hours of notice staff get before their shifts, more is better, counted from the date the rota is published.',
    expect: { verdict: 'accept' }
  },
  {
    name: 'Implement: status quo left unexamined',
    build: () => atTool('implement', 'kanban'),
    answer: 'Leave it as it is; we have always published the rota on Friday and changing it would upset people.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Improve: blaming a person',
    build: () => atTool('improve', 'after_action_review', [['intended', 'Publish the rota a full week ahead every week'], ['achieved', 'Published on time in three weeks out of four']]),
    answer: 'It went wrong because the new manager is careless and never checks anything.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Improve: a process-focused difference',
    build: () => atTool('improve', 'after_action_review', [['intended', 'Publish the rota a full week ahead every week'], ['achieved', 'Published on time in three weeks out of four']]),
    answer: 'In the fourth week the only person allowed to sign off was off sick, and nobody else had the authority to publish.',
    expect: { verdict: 'accept' }
  },
  {
    name: 'Document: a name only the person would understand',
    build: () => atTool('document', 'five_cs', [['contextualise', 'So next term starts without the same scramble'], ['categorise', 'On the rota project page, open to all managers'], ['condense:1', 'Publish the rota on Wednesday, signed off by either of two people'], ['correct', 'Nothing in the record needs correcting at this point']]),
    answer: 'KR stuff 20261020 v1 Final',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Final words: discouraged',
    build: () => atTool('define', 'five_whys', [['problem', 'The weekly rota changes late in most weeks']]),
    answer: 'Honestly I am useless at this. I will never sort it out.',
    expect: { verdictNot: 'accept', message: /skill|practi|persist|keep going|curio|learn|normal|stuck/i }
  },
  {
    name: 'Lightning: should offer the full process',
    build: () => lightningAt('The shared printer jams for the whole department', [
      { node: 'start', answer: 'no' }, { node: 'goal', note: 'Print without jams' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' },
      { node: 'diagram', answer: 'no', note: 'Sketched the paper path' }, { node: 'work_backwards', answer: 'no' }, { node: 'make_list', answer: 'no' }
    ]),
    answer: 'No, a break did not help either. It affects four teams and their managers keep arguing about who should fix it.',
    lightning: true,
    expect: { suggestion: 'escalate' }
  },
  {
    name: 'Lightning: stays quick',
    build: () => lightningAt('My desk chair squeaks a little when I lean back'),
    answer: 'Yes, honestly I can live with it; it only squeaks when I lean right back.',
    lightning: true,
    expect: { suggestionNot: 'escalate', lightning: { node: 'start', answer: 'yes' } }
  },
  // The four v1 Define cases.
  { name: 'Define: vague cause', build: classLate, answer: 'Because students are lazy.', expect: { verdict: 'challenge' } },
  { name: 'Define: perception as fact', build: classLate, answer: 'Everyone knows the deadlines are unfair.', expect: { verdict: 'challenge' } },
  { name: 'Define: premature solution', build: classLate, answer: 'We should just add a reminder app.', expect: { verdict: 'challenge' } },
  { name: 'Define: strong answer', build: classLate, answer: 'Half the class missed the last two deadlines for the Year 9 essay, set on a Friday and due the following Monday.', expect: { verdict: 'accept' } }
];

/** The session the coach sees: the case's session with the answer said. */
export function prepare(testCase) {
  return say(testCase.build(), testCase.answer, deps);
}

/** Why a coach reply fails the case's checks, or null. */
export function judge(testCase, reply) {
  const words = String(reply.message ?? '').trim().split(/\s+/).filter(Boolean).length;
  const [min, max] = testCase.lightning ? [10, 50] : [15, 60];
  const e = testCase.expect;
  if (words < min || words > max) return `message is ${words} words (want ${min}-${max})`;
  if (e.verdict && reply.verdict !== e.verdict) return `verdict ${reply.verdict}, want ${e.verdict}`;
  if (e.verdictNot && reply.verdict === e.verdictNot) return `verdict should not be ${e.verdictNot}`;
  if (e.message && !e.message.test(reply.message)) return 'message makes no Final-words move';
  if (e.suggestion && reply.suggestion?.kind !== e.suggestion) return `suggestion ${reply.suggestion?.kind ?? 'none'}, want ${e.suggestion}`;
  if (e.suggestionNot && reply.suggestion?.kind === e.suggestionNot) return `should not suggest ${e.suggestionNot}`;
  if (e.lightning && (reply.lightning?.node !== e.lightning.node || reply.lightning?.answer !== e.lightning.answer)) return `lightning step ${JSON.stringify(reply.lightning)}, want ${JSON.stringify(e.lightning)}`;
  return null;
}

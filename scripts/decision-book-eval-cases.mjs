// The Decision Maker live evaluation's cases: an invented decision placed at a point in a session
// (framing, the record in Decide, or a quick run), one answer, and what a good coach does with it.
// Pure session building (no model), so the cases are unit-tested; scripts/decision-book-eval.mjs
// runs them against the real coach. Every decision here is invented.
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../netlify/functions/_shared/problem-solver/session.mjs';
import { applyQuickTurn, createQuickSession } from '../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { CATALOGUE } from '../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../packages/decision-book/record-slots.mjs';

let n = 0;
export const deps = { now: () => '2026-10-21T09:00:00.000Z', newId: () => `dm-eval-${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null, basis: [], ...fields });
const FRAME_KEYS = ['decision', 'compass', 'known'];

/** A decision with its frame answered up to `answers` (decision, then compass, then known). */
export function framed(text, answers = []) {
  let s = idle(createSession({ text, kind: 'decision' }, deps));
  answers.forEach((answer, i) => {
    s = idle(applyCoachTurn(s, turn({ frame: { [FRAME_KEYS[i]]: answer }, message: 'Noted.' }), deps));
  });
  return s;
}

/** A framed decision that worked one model, now in Decide with the record open and `nodes` ([slot, text]) placed. */
export function atRecord(text, frame, model, modelNodes, nodes = []) {
  let s = framed(text, frame);
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: model, reason: 'r' } }, deps));
  for (const [slot, value] of modelNodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text: value } }), deps));
  s = { ...idle(moveOn(s, deps)), pendingLearning: null };
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: RECORD_ID, reason: 'r' } }, deps));
  for (const [slot, value] of nodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text: value } }), deps));
  return s;
}

/** A quick run walked through `steps`. */
export function quickAt(text, steps = []) {
  let s = idle(createQuickSession({ text }, deps));
  for (const step of steps) s = idle(applyQuickTurn(s, turn({ verdict: 'clarify', quick: step }), deps));
  return s;
}

const JOB = 'Whether to take the Sydney job offer';
const JOB_FRAME = ['Whether to accept the Sydney offer by Friday, or stay in my Melbourne role another year', 'self_understand'];
const EISENHOWER = [['item:1', 'Reply to the Sydney offer letter'], ['item:2', 'Talk the move over with my partner']];
const COURSE = 'Whether to finish my part-time law degree';
const COURSE_RECORD = [['decision', 'I will leave the law degree at the end of this term']];

/** Each case: build(), the person's answer, and the checks a good reply passes. */
export const CASES = [
  {
    name: 'Frame: a strong decision, accepted without flattery',
    build: () => framed('Work stuff, the job thing'),
    answer: 'Whether to accept the Sydney offer by Friday or stay in my Melbourne role for another year.',
    expect: { verdict: 'accept', noFlattery: true }
  },
  {
    name: 'Frame: a single option dressed up as a choice',
    build: () => framed(JOB, JOB_FRAME),
    answer: 'There is only one real option, I am taking the job. I just want to feel sure about it before I sign.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Discern, understand yourself: a model and a sibling',
    build: () => framed(JOB, JOB_FRAME),
    answer: 'The offer pays fifteen percent more, rent there is double, my partner can work remotely, and I must reply by Friday.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, improve yourself: a model and a sibling',
    build: () => framed('Too much on this term', ['What to drop this term: I have marking, a course, coaching and the house move', 'self_improve']),
    answer: 'Marking is due weekly, the course ends in March, coaching is twice a week and the move is in five weeks.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, understand others: a model and a sibling',
    build: () => framed('The supplier keeps missing dates', ['Whether to keep the catering supplier who missed three of the last five dates', 'others_understand']),
    answer: 'They are the cheapest by a fifth, they blame their drivers, two other caterers have quoted, and the contract renews in December.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, improve others: a model and a sibling',
    build: () => framed('My team is stuck', ['How to get my four-person team delivering again after a reshuffle', 'others_improve']),
    answer: 'Two are new, one wanted my job, meetings go round in circles, and the first release is due in eight weeks.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Decide: a sunk-cost reason',
    build: () => atRecord(COURSE, ['Whether to finish my part-time law degree or leave at the end of term', 'self_improve', 'Two years done, two to go, it costs eight thousand a year and I no longer want to practise'], 'dm_eisenhower', [['item:1', 'Tell the faculty by the census date'], ['item:2', 'Look at teaching courses for next year']], COURSE_RECORD),
    answer: 'I have already put two years and sixteen thousand dollars into it, so I should not waste that by stopping now.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Decide: a trigger nobody can check',
    build: () => atRecord(COURSE, ['Whether to finish my part-time law degree or leave at the end of term', 'self_improve', 'Two years done, two to go, it costs eight thousand a year and I no longer want to practise'], 'dm_eisenhower', [['item:1', 'Tell the faculty by the census date'], ['item:2', 'Look at teaching courses for next year']], [...COURSE_RECORD, ['reason:1', 'I no longer want to practise law, and the census date makes it urgent']]),
    answer: 'If it stops feeling right.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Quick: stays quick and sets the tests',
    build: () => quickAt('Should I buy the bigger tent for the summer trip?'),
    answer: 'Those three work for me: do I want it, can I store it, and will I use it at least twice a year.',
    quick: true,
    expect: { suggestionNot: 'escalate', quickNode: 'tests' }
  },
  {
    name: 'Quick: a test that cannot be answered yes or no',
    build: () => quickAt('Should I sign up for the evening pottery class?'),
    answer: 'My first test is how much I would enjoy it, and the others can wait.',
    quick: true,
    expect: { quickNot: 'tests' }
  },
  {
    name: 'Quick: should go deeper',
    build: () => quickAt('Should we move interstate for the job?', [{ node: 'tests', tests: ['Do we want it?', 'Can we afford it?', 'Is it worth it?'] }]),
    answer: 'Honestly it is not a quick one: it means selling the house, both kids changing schools, and my partner leaving a job they love.',
    quick: true,
    expect: { suggestion: 'escalate' }
  }
];

/** The session the coach sees: the case's session with the answer said. */
export function prepare(testCase) {
  return say(testCase.build(), testCase.answer, deps);
}

const FLATTERY = /\b(great|excellent|fantastic|brilliant|amazing|wonderful|perfect|love (that|this|it))\b/i;
/** A model's name as a coach might say it: lower case, without a leading "the" (and, in the check, a trailing "model"). */
const plain = (name) => name.toLowerCase().replace(/^the /, '').replace(/[’']/g, "'");

/** Why a coach reply fails the case's checks, or null. */
export function judge(testCase, reply) {
  const words = String(reply.message ?? '').trim().split(/\s+/).filter(Boolean).length;
  const [min, max] = testCase.quick ? [10, 50] : [15, 60];
  const e = testCase.expect;
  if (words < min || words > max) return `message is ${words} words (want ${min}-${max})`;
  if (e.verdict && reply.verdict !== e.verdict) return `verdict ${reply.verdict}, want ${e.verdict}`;
  if (e.verdictNot && reply.verdict === e.verdictNot) return `verdict should not be ${e.verdictNot}`;
  if (e.noFlattery && FLATTERY.test(reply.message)) return 'message flatters';
  if (e.suggestion && reply.suggestion?.kind !== e.suggestion) return `suggestion ${reply.suggestion?.kind ?? 'none'}, want ${e.suggestion}`;
  if (e.suggestionNot && reply.suggestion?.kind === e.suggestionNot) return `should not suggest ${e.suggestionNot}`;
  if (e.model && !(reply.suggestion?.kind === 'next_tool' && String(reply.suggestion.tool).startsWith('dm_'))) return `suggestion ${JSON.stringify(reply.suggestion)}, want a Decision Book model`;
  if (e.sibling) {
    const others = CATALOGUE.filter((entry) => entry.id !== reply.suggestion?.tool).map((entry) => plain(entry.title).replace(/ model$/, ''));
    const text = plain(reply.message);
    if (!others.some((name) => text.includes(name))) return 'message names no sibling model';
  }
  if (e.quickNode && reply.quick?.node !== e.quickNode) return `quick step ${JSON.stringify(reply.quick ?? null)}, want ${e.quickNode}`;
  if (e.quickNode === 'tests' && reply.quick?.tests?.length !== 3) return 'quick step sets no three tests';
  if (e.quickNot && reply.quick?.node === e.quickNot) return `should not settle ${e.quickNot}`;
  return null;
}

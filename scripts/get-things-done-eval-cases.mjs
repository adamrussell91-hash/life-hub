// The Gear Shifter live evaluation's cases: an invented piece of work placed at a point in a
// session (framing, Commit, or a Quick start), one answer, and what a good coach does with it.
// One discernment case per section of the book, in route order. Pure session building (no
// model), so the cases are unit-tested; scripts/get-things-done-eval.mjs runs them against the
// coach. Every situation here is invented.
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { applyStartTurn, createStartSession } from '../netlify/functions/_shared/problem-solver/start-session.mjs';
import { CATALOGUE } from '../packages/get-things-done/catalogue.mjs';

let n = 0;
export const deps = { now: () => '2026-10-22T09:00:00.000Z', newId: () => `gt-eval-${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });

/** The person says `text` (if any), then a coach turn `raw` lands, read through the schema as a live one is. */
function reply(session, raw, text = null) {
  const next = text ? say(session, text, deps) : session;
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', ...raw });
  if (!turn.ok) throw new Error(turn.error);
  return idle(applyCoachTurn(next, turn.value, deps));
}

/** How a person might place their work on the route, in their own words. */
const ROUTE_WORDS = {
  before: 'I have not really started it yet.',
  doing: 'I am in the middle of it and it has stalled.',
  others: 'It depends on other people doing their part.',
  differently: 'The way we do it needs to change.',
  after: 'It is finished and I want to look back on it.'
};

/** A shift with its frame answered up to `answers` (need, then route, then known). */
export function framed(text, answers = []) {
  let s = idle(createSession({ text, kind: 'shift' }, deps));
  ['need', 'route', 'known'].slice(0, answers.length).forEach((key, i) => {
    s = reply(s, { frame: { [key]: answers[i] } }, i === 0 ? null : key === 'route' ? ROUTE_WORDS[answers[i]] ?? answers[i] : answers[i]);
  });
  return s;
}

/** A framed shift that worked Appreciation, now in Commit with the experiment open and `nodes` ([slot, text]) placed. */
export function atCommit(nodes = []) {
  let s = framed('The volunteer roster keeps slipping', ['Get the volunteer roster for December filled', 'others']);
  s = reply(s, { frame: { known: 'Twelve shifts, four filled, the same three people always say yes.' }, suggestion: { kind: 'next_technique', tool: 'gt_appreciation', reason: 'r' } }, 'Twelve shifts, four filled.');
  s = idle(acceptSuggestion(s, deps));
  s = reply(s, { node: { slot: 'entry:1', text: 'Thank the three regulars by name at the next meeting', tag: 'acknowledge_contribution' } }, 'Thank the regulars.');
  s = reply(s, { node: { slot: 'reflection', text: 'People sign up more readily once they feel noticed' } }, 'Noticed people sign up.');
  s = idle(moveOn(s, deps));
  s = reply(s, { verdict: 'clarify', message: 'What did you learn about how you get things done?' });
  s = reply(s, { verdict: 'clarify', learning: 'I ask better once I have said thank you.' }, 'I ask better once I have said thank you.');
  s = idle(acceptSuggestion(s, deps));
  for (const [slot, text, extra = {}] of nodes) s = reply(s, { node: { slot, text }, ...extra }, text);
  return s;
}

const step = (quick) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, quick });

/** A Quick start walked through `steps`. */
export function startAt(text, steps = []) {
  let s = idle(createStartSession({ text }, deps));
  for (const item of steps) s = idle(applyStartTurn(s, step(item), deps));
  return s;
}

const COMMIT_BASE = [
  ['result', 'Every December shift has a named volunteer by the 30th'],
  ['rests_on', 'Thank the regulars by name before asking for more', { basis: [{ tool: 'gt_appreciation', slot: 'entry:1' }] }]
];

/** Each case: build(), the person's answer, and the checks a good reply passes. */
export const CASES = [
  {
    name: 'Frame: a vague need is challenged, not accepted',
    build: () => framed('Work stuff'),
    answer: 'Just everything really, it all feels stuck at the moment.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Discern, before you start: a technique and a sibling',
    build: () => framed('The garden funding bid', ['Start writing the community garden funding bid', 'before']),
    answer: 'It is due on 30 November, I have the council form but no budget yet, and I keep making lists instead of writing.',
    expect: { verdict: 'accept', technique: true, sibling: true }
  },
  {
    name: 'Discern, doing it: a technique and a sibling',
    build: () => framed('The cabinet repaint', ['Finish repainting the kitchen cabinets I started in August', 'doing']),
    answer: 'Two doors of twelve are done, I only paint when I feel like it, the sanding takes ages and the weekends vanish.',
    expect: { verdict: 'accept', technique: true, sibling: true }
  },
  {
    name: 'Discern, with others: a technique and a sibling',
    build: () => framed('The newsletter sections', ['Get the three volunteers to send their newsletter sections', 'others']),
    answer: 'The deadline is Friday, two of them have gone quiet, one was late last time too, and I am not their manager.',
    expect: { verdict: 'accept', technique: true, sibling: true }
  },
  {
    name: 'Discern, changing course: a technique and a sibling',
    build: () => framed('Our weekly planning', ['Change how our small team runs its weekly planning meeting', 'differently']),
    answer: 'It runs ninety minutes, half the team dreads it, we tried a new agenda once and slid back within a month.',
    expect: { verdict: 'accept', technique: true, sibling: true }
  },
  {
    name: 'Discern, after it is done: a technique and a sibling',
    build: () => framed('The school fair', ['Look back on the school fair we ran last weekend', 'after']),
    answer: 'It raised four thousand dollars, the setup was chaos, two parents did most of the work, and I am worn out.',
    expect: { verdict: 'accept', technique: true, sibling: true }
  },
  {
    name: 'Commit: a next action too big for today',
    build: () => atCommit(COMMIT_BASE),
    answer: 'Fill the whole roster and get every volunteer to confirm their shifts in writing.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Commit: a check-back with no date',
    build: () => atCommit([...COMMIT_BASE, ['next_action', 'Text the three regulars a thank-you tonight'], ['start', 'Straight after dinner, phone in hand']]),
    answer: 'I will check back on it at some point.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Quick: records the first action and asks how it starts',
    build: () => startAt('Do my tax return'),
    answer: 'Open the tax folder and find last year’s summary sheet.',
    quick: true,
    expect: { quickNode: 'action', suggestionNot: 'escalate' }
  },
  {
    name: 'Quick: a timer from the app is not a way to start',
    build: () => startAt('Do my tax return', [{ node: 'action', note: 'Open the tax folder and find last year’s summary sheet' }]),
    answer: 'Can you just set a timer for me and buzz me when it is time?',
    quick: true,
    expect: { quickNot: 'how' }
  },
  {
    name: 'Quick: a whole project goes deeper',
    build: () => startAt('Get the renovation going'),
    answer: 'Honestly it is the whole renovation: builders, council permits, the budget, and my partner and I disagree on all of it.',
    quick: true,
    expect: { suggestion: 'escalate' }
  },
  {
    name: 'Quick: the route is not the book’s',
    build: () => startAt('Do my tax return', [{ node: 'action', note: 'Open the tax folder and find last year’s summary sheet' }]),
    answer: 'Before I pick: is this little route straight out of the Get Things Done book?',
    quick: true,
    expect: { ownRoute: true }
  }
];

/** The session the coach sees: the case's session with the answer said. */
export function prepare(testCase) {
  return say(testCase.build(), testCase.answer, deps);
}

const FLATTERY = /\b(great|excellent|fantastic|brilliant|amazing|wonderful|perfect|love (that|this|it))\b/i;
/** A technique's name as a coach might say it: lower case, without a leading "the" (and, in the check, a trailing "technique" or "model"). */
const plain = (name) => name.toLowerCase().replace(/^the /, '').replace(/[’']/g, "'");

/** Long titles a coach shortens in speech. */
const SHORT_NAMES = { gt_kotter_change: 'kotter' };

/** Why a coach reply fails the case's checks, or null. */
export function judge(testCase, reply) {
  const words = String(reply.message ?? '').trim().split(/\s+/).filter(Boolean).length;
  const [min, max] = testCase.quick ? [10, 50] : [15, 60];
  const e = testCase.expect;
  if (words < min || words > max) return `message is ${words} words (want ${min}-${max})`;
  if (FLATTERY.test(reply.message)) return 'message flatters';
  if (e.verdict && reply.verdict !== e.verdict) return `verdict ${reply.verdict}, want ${e.verdict}`;
  if (e.verdictNot && reply.verdict === e.verdictNot) return `verdict should not be ${e.verdictNot}`;
  if (e.suggestion && reply.suggestion?.kind !== e.suggestion) return `suggestion ${reply.suggestion?.kind ?? 'none'}, want ${e.suggestion}`;
  if (e.suggestionNot && reply.suggestion?.kind === e.suggestionNot) return `should not suggest ${e.suggestionNot}`;
  if (e.technique && !(reply.suggestion?.kind === 'next_tool' && String(reply.suggestion.tool).startsWith('gt_'))) return `suggestion ${JSON.stringify(reply.suggestion)}, want a Gear Shifter technique`;
  if (e.sibling) {
    // A coach may drop a trailing "technique", "rule" or "model" ("Pomodoro" for The Pomodoro Technique).
    const others = CATALOGUE.filter((entry) => entry.id !== reply.suggestion?.tool).map((entry) => SHORT_NAMES[entry.id] ?? plain(entry.title).replace(/ (technique|model)$/, ''));
    const text = plain(reply.message);
    if (!others.some((name) => text.includes(name))) return 'message names no sibling technique';
  }
  if (e.quickNode && reply.quick?.node !== e.quickNode) return `quick step ${JSON.stringify(reply.quick ?? null)}, want ${e.quickNode}`;
  if (e.quickNot && reply.quick?.node === e.quickNot) return `should not settle ${e.quickNot}`;
  if (e.ownRoute) {
    if (reply.quick) return 'should answer the question, not settle a box';
    if (!/\b(own|our|not (in|from|out of|straight (from|out of)) the book|isn['’]t in the book|is not in the book|not the book['’]s)\b/i.test(reply.message)) return 'message does not say the route is Gear Shifter’s own';
  }
  return null;
}

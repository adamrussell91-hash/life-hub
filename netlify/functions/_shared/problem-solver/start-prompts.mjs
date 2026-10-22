// netlify/functions/_shared/problem-solver/start-prompts.mjs
// Gear Shifter's Quick start coach: a small prompt for one stalled task, walked one box at a
// time (packages/get-things-done/quick.mjs), with when to offer a full session and the same
// voice. Shaped like quick-prompts.mjs. Our words throughout; the route is our design.
import { START_NODES, START_WAYS, checkPointOf, cueLabel, currentEntry, latestNote, taskOf, wayOf } from '../../../../packages/get-things-done/quick.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';

const after = (way) => TOOLS[START_WAYS[way].after]?.name ?? START_WAYS[way].after;

/** What each box asks of the coach, in our words. */
export const START_INTENTS = Object.freeze({
  task: 'The task is already stated.',
  action: 'Help them name the first small, safe action: something they could start today, that does no harm if it goes nowhere, and that someone watching could see. Shrink anything bigger. Record it as the note.',
  how: 'Ask how it will start: a countdown cue or one protected interval. Record "countdown" or "interval" as the answer.',
  cue: 'For a countdown: the exact moment they count down from five and move. For an interval: when it starts, how long it runs and what is kept out of it. Record their words as the note.',
  check: 'Ask when they will check back on how it went. Record a date as YYYY-MM-DD in the note (today or later), or their words for a point in the day ("after lunch"). A check-back is needed; do not skip it.',
  happened: 'Ask what happened when they tried it. Record their answer as the note.',
  next: 'Ask what they will do next. Record the answer as the note.'
});

export const START_RUBRIC = `You are the Gear Shifter coach in Quick start mode: a short route for one stalled task. Warm, direct and brief; never flattering.

VOICE
- Every message is between 15 and 50 words. Ask at most one question, and end with it.
- Plain words. No lists, headings or markdown.

WHERE THIS ROUTE COMES FROM
- Quick start is Gear Shifter's own short route. It borrows two ideas from The Get Things Done Book: ${after('countdown')} (a countdown cue) and ${after('interval')} (one protected interval). The route itself is not in the book. Never say or suggest that the book sets out these steps; if asked, say it is Gear Shifter's own route built from those two techniques.

HOW IT WORKS
- The run follows a flow one box at a time: the task, the first small and safe action, how it starts, the cue or the interval, the check-back, then what happened and what next. The state names the CURRENT BOX and what to do there.
- The two ways to start: a countdown cue (${START_WAYS.countdown.line}) or one protected interval (${START_WAYS.interval.line}). The person picks; you may say which suits, in one sentence.
- Nothing here runs a timer, a reminder or an alarm, and you never offer one. The start is words they agree now.
- When the person's latest reply settles the current box, put it in "quick": {"node": <the current box id>, "answer": "countdown"|"interval" only at how, "note": their words in a short line}. Then, in the same message, do what the NEXT box asks.
- If the reply does not settle the current box, set "quick" to null and ask again more simply.

TRAPS TO CHALLENGE
- A first action too big to start today, or one that is really planning. Ask for the smallest visible piece.
- A cue nobody could notice ("when I feel ready"), or an interval with no start or end.
- Asking the app to run a timer or remind them: say it will not, and ask what they will use or notice instead.
- No check-back, or "sometime". A check-back that never comes is how stalled work stays stalled.

A FULL SESSION
Offer one with a suggestion {"kind":"escalate","reason":"..."} (one sentence) when any of these hold: it is a whole project, not one task; it depends on other people; the stakes are high; it keeps stalling (a second round is a strong sign); or no first action small enough can be found. Offer it once; never insist.

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"clarify","message":"...","quick":{"node":"...","answer":"countdown|interval","note":"..."}|null,"suggestion":{"kind":"escalate","reason":"..."}|null,"skillsSeen":["..."],"skillsMissing":[],"summary":null}`;

/** What the box after `id` asks. */
function nextLine(id) {
  const next = START_NODES[id].next;
  return next ? `NEXT: ${next} (${START_INTENTS[next]})` : 'NEXT: the run finishes; close warmly in a line and say It came back is there if it stalls again.';
}

/** @returns {{ system: string[], user: string }} */
export function buildStartPrompt(session) {
  const state = session.start;
  const current = currentEntry(state);
  const parts = [
    `TASK: ${taskOf(state) || session.title}`,
    `TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`,
    `ROUND: ${state.rounds}${state.rounds > 1 ? ' (it came back, so think about a full session)' : ''}`
  ];
  const action = latestNote(state, 'action');
  if (action) parts.push(`FIRST ACTION: ${action}`);
  else if (state.rounds > 1 && latestNote(state, 'action', state.rounds - 1)) {
    const last = state.rounds - 1;
    parts.push(`LAST ROUND (offer to try it again, smaller, or a new one): action "${latestNote(state, 'action', last)}"; ${wayOf(state, last) ? `started with a ${START_WAYS[wayOf(state, last)].label.toLowerCase()}` : 'no start picked'}; what happened: ${latestNote(state, 'happened', last) ?? 'not said'}`);
  }
  const way = wayOf(state);
  if (way) parts.push(`HOW IT STARTS: ${START_WAYS[way].label.toLowerCase()}${latestNote(state, 'cue') ? `: ${latestNote(state, 'cue')}` : ''}`);
  if (checkPointOf(state)) parts.push(`CHECK BACK: ${checkPointOf(state)}`);
  if (current) {
    const def = START_NODES[current.node];
    const asks = current.node === 'cue' ? cueLabel(state) : def.label;
    parts.push(`CURRENT BOX: ${current.node} (${def.kind}): ${asks}. ${START_INTENTS[current.node]}`, nextLine(current.node));
  } else parts.push(`The run is ${state.escalatedTo ? 'gone deeper to a full session' : 'finished'}. Answer briefly; do not set "quick".`);
  parts.push(`RECENT CONVERSATION:\n${session.turns.slice(-10).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n')}`);
  return { system: [START_RUBRIC], user: parts.join('\n\n') };
}

/** The coach's reply checked against the run: the step must answer the current box in its own form. */
export function checkStartTurn(session, value) {
  const current = currentEntry(session.start);
  const step = value.quick;
  const suggestion = value.suggestion?.kind === 'escalate' && !session.start.escalatedTo ? value.suggestion : null;
  if (!step) return { ok: true, value: { ...value, suggestion } };
  if (!current) return { ok: true, value: { ...value, quick: null, suggestion: null } };
  if (step.node !== current.node) return { ok: false, error: `Answer the current box (${current.node}), or set quick to null.` };
  const kind = START_NODES[current.node].kind;
  if (kind === 'choice' && !step.answer) return { ok: false, error: 'At how, set quick.answer to countdown or interval.' };
  if (kind !== 'choice' && !step.note) return { ok: false, error: `${current.node} needs their words in quick.note.` };
  return { ok: true, value: { ...value, suggestion } };
}

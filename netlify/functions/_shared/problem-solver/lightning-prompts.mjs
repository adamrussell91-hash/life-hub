// netlify/functions/_shared/problem-solver/lightning-prompts.mjs
// The Lightning coach's smaller prompt: the flowchart, each strategy's intent, the four
// questions, when to offer the full process, and the same voice. Our words throughout.
import { currentEntry, isQuestion, LIGHTNING_NODES, passes, strategiesTried } from '../../../../packages/problem-solver/lightning.mjs';

/** What each box asks of the coach, in our words. */
export const LIGHTNING_INTENTS = Object.freeze({
  start: 'Ask whether this really needs solving, or whether they could accept or work around things as they are.',
  goal: 'Ask what result they want, in one short line. Record it as the note.',
  subtract: 'Ask whether removing something (a step, a habit, an item, a commitment) could solve it before adding anything.',
  one_step: 'Ask whether one small action could solve it.',
  via_negativa: 'Apply it: name one thing to stop, drop or remove that could solve this snag, in one or two sentences.',
  guess_check: 'Apply it: suggest one quick guess to try now, and how they will know if it worked.',
  diagram: 'Apply it: suggest a quick sketch of the snag (what leads to what, or where things sit) to show what was missed.',
  solved_1: 'Ask whether it is solved now.',
  work_backwards: 'Apply it: start from the result they want and trace the steps back to now.',
  solved_2: 'Ask whether it is solved now.',
  make_list: 'Apply it: list two or three options not yet tried and ask them to work through the first.',
  solved_3: 'Ask whether it is solved now.',
  take_break: 'Apply it: suggest stepping away for a while and coming back fresh; ask them to tell you when they are back.',
  solved_4: 'Ask whether it is solved now.',
  analogy: 'Apply it: name a similar problem that has been solved, or someone who has solved one, and what to borrow.',
  solved_5: 'Ask whether it is solved now.',
  reframing: 'Ask whether the constraints, the problem itself or the resources could change. Yes goes back to defining the goal.',
  cannot: 'Say kindly that it cannot be solved as things stand; suggest putting it down, trying another problem or taking a walk.',
  relax: 'It is solved or accepted: say so in a line.',
  learn: 'Ask what they can learn from the snag and from trying to solve it. Record the answer as the note.',
  next: 'Ask what they will do to stop it happening again, or to be ready if it does. Record the answer as the note.'
});

export const LIGHTNING_RUBRIC = `You are the Problem Solver coach in Lightning mode: a quick route through an everyday snag. Warm, direct and brief; never flattering.

VOICE
- Every message is between 15 and 50 words. Ask at most one question, and end with it.
- Plain words. No lists, headings or markdown.

HOW IT WORKS
- The run follows a flowchart one box at a time. The state names the CURRENT BOX and what to do there.
- When the person's latest reply answers the current box, put it in "lightning": {"node": <the current box id>, "answer": "yes"|"no" for a yes/no box, "note": what they said or tried, in a short line}. Then, in the same message, do what the NEXT box asks (it is given for yes and for no).
- At a strategy box, apply the strategy to their snag in one or two sentences, then ask whether it worked. When they reply, answer the strategy box with "answer" set to whether it worked: yes means solved.
- If the reply does not answer the current box, set "lightning" to null and ask again more simply.
- The four questions frame the run: Can I fix this? What can I do? What can I learn? What next?

THE FULL PROCESS
Offer it with a suggestion {"kind":"escalate","reason":"..."} (one sentence) when any of these hold: several people or stakeholders are involved; the problem keeps recurring (a second round is a strong sign); the stakes are high; three or more strategies have failed. Offer it once; never insist.

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"clarify","message":"...","lightning":{"node":"...","answer":"yes|no","note":"..."}|null,"suggestion":{"kind":"escalate","reason":"..."}|null,"skillsSeen":["..."],"skillsMissing":[],"summary":null}`;

const yesNo = (def) => `yes -> ${def.yes} (${LIGHTNING_INTENTS[def.yes]}); no -> ${def.no} (${LIGHTNING_INTENTS[def.no]})`;

/** @returns {{ system: string[], user: string }} */
export function buildLightningPrompt(session) {
  const state = session.lightning;
  const current = currentEntry(state);
  const parts = [`SNAG: ${session.title}`, `ROUND: ${state.rounds}${state.rounds > 1 ? ' (it came back, so think about the full process)' : ''}`];
  if (current) {
    const def = LIGHTNING_NODES[current.node];
    parts.push(`CURRENT BOX: ${current.node} (${def.kind}): ${def.label}. ${LIGHTNING_INTENTS[current.node]}`);
    if (isQuestion(current.node)) parts.push(`NEXT: ${yesNo(def)}`);
    else if (def.kind === 'strategy' && isQuestion(def.next)) parts.push(`NEXT: after it is tried, ${yesNo(LIGHTNING_NODES[def.next])}`);
    else if (def.next) parts.push(`NEXT: ${def.next} (${LIGHTNING_INTENTS[def.next]})`);
    else parts.push('NEXT: the run finishes; close warmly in a line.');
  } else parts.push('The run is finished. Answer briefly; do not set "lightning".');
  const tried = strategiesTried(state);
  if (tried.length) parts.push(`TRIED SO FAR: ${tried.map((t) => `${t.label}${t.note ? ` (${t.note})` : ''}: ${t.outcome ?? 'pending'}`).join('; ')}`);
  if (passes(state) > 1) parts.push(`REFRAMED: the goal has been defined ${passes(state)} times this round.`);
  const goal = state.path.filter((e) => e.node === 'goal' && e.note).at(-1)?.note;
  if (goal) parts.push(`GOAL: ${goal}`);
  parts.push(`RECENT CONVERSATION:\n${session.turns.slice(-10).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n')}`);
  return { system: [LIGHTNING_RUBRIC], user: parts.join('\n\n') };
}

/** The coach's reply checked against the run: the step must answer the current box, with yes/no where it asks. */
export function checkLightningTurn(session, value) {
  const current = currentEntry(session.lightning);
  const step = value.lightning;
  const suggestion = value.suggestion?.kind === 'escalate' && !session.lightning.escalatedTo ? value.suggestion : null;
  if (!step) return { ok: true, value: { ...value, suggestion } };
  if (!current) return { ok: true, value: { ...value, lightning: null, suggestion: null } };
  if (step.node !== current.node) return { ok: false, error: `Answer the current box (${current.node}), or set lightning to null.` };
  if (isQuestion(current.node) && !step.answer) return { ok: false, error: `${current.node} is a yes/no box: set lightning.answer to yes or no.` };
  return { ok: true, value: { ...value, suggestion } };
}

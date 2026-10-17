// netlify/functions/_shared/problem-solver/scripted-coach.mjs
import { nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { activeRun } from './session.mjs';

/**
 * Deterministic coach for local dev and tests. Short answers (under six words) are challenged.
 * An answer starting `switch:` suggests switching to Problem tree (the browser walk uses it).
 */
const FRAME = [
  ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
  ['whatIsTrue', 'Good, that is a clear aim. Now, what is actually true here? Separate the facts and data from what you believe or feel.'],
  ['whatCanBeDone', 'That is evidence, not opinion. What can be done: can this be solved as it stands, or should we reframe it to something more achievable?']
];

const base = { node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null };

export async function scriptedCoach(session) {
  const latest = session.turns.at(-1);
  const last = latest?.role === 'user' ? latest.text : '';
  if (session.runner?.mode === 'closing') {
    return { ...base, verdict: 'clarify', message: 'Fair enough, that is your call. You have a clear problem on the page; keep the open questions in mind when you come back to analyse it.' };
  }
  if (session.phase === 'frame') {
    if (session.turns.length === 1) return { ...base, verdict: 'clarify', message: FRAME[0][1] };
    const missing = FRAME.filter(([key]) => !session.frame[key]);
    const [key] = missing[0];
    const frame = { [key]: last };
    if (missing.length === 1) {
      return { ...base, verdict: 'accept', frame, message: 'Clear enough to work with. I suggest the problem solving process, starting with 5 Whys, because there is one symptom here with a likely single chain of cause.', model: { id: 'seven_step', reason: 'A real problem that will need analysis and a decision.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom, likely one chain.' }, skillsSeen: ['analysis'] };
    }
    return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  }
  const run = activeRun(session);
  if (!run) return { ...base, verdict: 'clarify', message: 'Pick a tool to start defining this problem, and we will work through it one step at a time together.' };
  if (!last) {
    const first = TOOLS[run.tool].steps[0];
    return { ...base, verdict: 'clarify', message: `Let's start the ${TOOLS[run.tool].name}. ${first.title}: ${first.prompt}` };
  }
  if (/^switch:/i.test(last) && run.tool !== 'problem_tree') {
    return { ...base, verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: last.replace(/^switch:\s*/i, '') || 'The causes branch.' }, message: 'Then a single chain will not hold it. A problem tree lets the causes branch; shall we switch?' };
  }
  const slot = nextSlots(run).find((s) => s !== 'root') ?? 'root';
  if (last.split(/\s+/).filter(Boolean).length < 6) {
    return { ...base, verdict: 'challenge', node: { slot, text: last }, skillsMissing: ['analysis'], message: 'That is too thin to stand on yet. It reads like a symptom rather than a cause. Can you say what specifically happens, and when?' };
  }
  return { ...base, verdict: 'accept', node: { slot, text: last }, skillsSeen: ['analysis'], message: 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.' };
}

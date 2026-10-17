// scripts/problem-solver-eval.mjs
// Usage: ANTHROPIC_API_KEY=... node scripts/problem-solver-eval.mjs
import { anthropicModel, createModelCoach, wordCount } from '../netlify/functions/_shared/problem-solver/coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, say } from '../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => new Date().toISOString(), newId: () => `eval-${(n += 1)}` };
const coach = createModelCoach(anthropicModel(process.env));

async function inFiveWhys(problem) {
  let s = createSession({ text: problem }, deps);
  s = applyCoachTurn(s, { verdict: 'accept', message: 'x', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'Work handed in on time', whatIsTrue: 'Half the class missed the last two deadlines', whatCanBeDone: 'Change how deadlines are set and checked' }, model: { id: 'seven_step', reason: 'Default.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom.' }, summary: null, exitObjection: null }, deps);
  s = acceptSuggestion(s, deps);
  s = applyCoachTurn(s, await coach(s), deps);
  return s;
}

const CASES = [
  { name: 'vague cause', answer: 'Because students are lazy.', expect: 'challenge' },
  { name: 'perception as fact', answer: 'Everyone knows the deadlines are unfair.', expect: 'challenge' },
  { name: 'premature solution', answer: 'We should just add a reminder app.', expect: 'challenge' },
  { name: 'strong answer', answer: 'Half the class missed the last two deadlines for the Year 9 essay, set on a Friday and due the following Monday.', expect: 'accept' }
];

let failures = 0;
for (const testCase of CASES) {
  let s = await inFiveWhys('Year 9 students hand in work late.');
  s = say(s, testCase.answer, deps);
  const turn = await coach(s);
  const words = wordCount(turn.message);
  const ok = turn.verdict === testCase.expect && words >= 15 && words <= 60;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}: ${turn.verdict} (${words} words) ${turn.skillsMissing.join(',')}\n  ${turn.message}`);
}
process.exitCode = failures ? 1 : 0;

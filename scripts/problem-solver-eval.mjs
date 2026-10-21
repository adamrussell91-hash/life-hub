// Runs the live evaluation cases (scripts/problem-solver-eval-cases.mjs) against the real coach.
// Usage: ANTHROPIC_API_KEY=... node scripts/problem-solver-eval.mjs [name filter]
// Check the runner without a key: PS_EVAL_STUB=1 node scripts/problem-solver-eval.mjs
//   swaps the model coach for a stub that always returns the same clarify reply, so the
//   run prints a line per case and exits 1 because the stub fails most cases.
import { anthropicModel, createModelCoach, wordCount } from '../netlify/functions/_shared/problem-solver/coach.mjs';
import { CASES, judge, prepare } from './problem-solver-eval-cases.mjs';

const STUB_REPLY = {
  verdict: 'clarify',
  message: 'Thanks for that. Could you tell me a little more about what you mean, with one concrete example from the last few weeks?',
  node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null
};

const coach = process.env.PS_EVAL_STUB ? async () => STUB_REPLY : createModelCoach(anthropicModel(process.env));
const filter = process.argv[2]?.toLowerCase();
const cases = filter ? CASES.filter((c) => c.name.toLowerCase().includes(filter)) : CASES;

let failures = 0;
for (const testCase of cases) {
  const reply = await coach(prepare(testCase));
  const reason = judge(testCase, reply);
  if (reason) failures += 1;
  const suggestion = reply.suggestion?.kind ?? 'none';
  console.log(`${reason ? `FAIL ${testCase.name}: ${reason}` : `PASS ${testCase.name}`}\n  verdict ${reply.verdict}, ${wordCount(reply.message)} words, suggestion ${suggestion}\n  ${reply.message}`);
}
console.log(`${cases.length - failures}/${cases.length} passed`);
process.exitCode = failures ? 1 : 0;

// Runs the Gear Shifter live evaluation cases (scripts/get-things-done-eval-cases.mjs) through the
// coach. Not part of CI: each case is one coach call (two with a repair).
// Usage: ANTHROPIC_API_KEY=... node scripts/get-things-done-eval.mjs [name filter]
// Check the runner without a key: GT_EVAL_STUB=1 node scripts/get-things-done-eval.mjs
//   swaps the model for a stub that always returns the same clarify reply, so the run prints a
//   line per case and exits 1 because the stub fails most cases.
// Other ways to run it:
//   GT_EVAL_PROMPTS=<dir> writes each case's prompt (system layers, then the turn) to <dir>/<n>.txt
//   and exits, for a reply made elsewhere;
//   GT_EVAL_REPLIES=<file.json> replays raw replies ({ "<case name>": "<raw reply text>" }) through
//   the real reply pipeline (parse, checks and the word limit); a reply that fails its checks is
//   repaired from the same text once, so it fails as "lost the thread".
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropicModel, createModelCoach, wordCount } from '../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildGearPrompt } from '../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs';
import { buildStartPrompt } from '../netlify/functions/_shared/problem-solver/start-prompts.mjs';
import { CASES, judge, prepare } from './get-things-done-eval-cases.mjs';

const STUB_REPLY = JSON.stringify({ verdict: 'clarify', message: 'Thanks for that. Could you tell me a little more about what you mean, with one concrete example from the last few weeks?', quick: null, suggestion: null });

const filter = process.argv[2]?.toLowerCase();
const cases = filter ? CASES.filter((c) => c.name.toLowerCase().includes(filter)) : CASES;

if (process.env.GT_EVAL_PROMPTS) {
  const dir = process.env.GT_EVAL_PROMPTS;
  mkdirSync(dir, { recursive: true });
  cases.forEach((testCase, i) => {
    const session = prepare(testCase);
    const prompt = session.kind === 'start' ? buildStartPrompt(session) : buildGearPrompt(session);
    writeFileSync(join(dir, `${String(i + 1).padStart(2, '0')}.txt`), `CASE: ${testCase.name}\n\n${prompt.system.map((layer, n) => `=== SYSTEM LAYER ${n + 1} ===\n${layer}`).join('\n\n')}\n\n=== USER ===\n${prompt.user}\n`);
  });
  console.log(`Wrote ${cases.length} prompts to ${dir}`);
  process.exit(0);
}

const replies = process.env.GT_EVAL_REPLIES ? JSON.parse(readFileSync(process.env.GT_EVAL_REPLIES, 'utf8')) : null;
const modelFor = (testCase) => (process.env.GT_EVAL_STUB ? async () => STUB_REPLY : replies ? async () => String(replies[testCase.name] ?? '') : anthropicModel(process.env));

let failures = 0;
for (const testCase of cases) {
  let reply;
  let reason;
  try {
    reply = await createModelCoach(modelFor(testCase))(prepare(testCase));
    reason = judge(testCase, reply);
  } catch (error) {
    reply = { verdict: 'none', message: '', suggestion: null };
    reason = error.message;
  }
  if (reason) failures += 1;
  const suggestion = reply.suggestion ? `${reply.suggestion.kind}${reply.suggestion.tool ? ` ${reply.suggestion.tool}` : ''}` : 'none';
  console.log(`${reason ? `FAIL ${testCase.name}: ${reason}` : `PASS ${testCase.name}`}\n  verdict ${reply.verdict}, ${wordCount(reply.message)} words, suggestion ${suggestion}${reply.quick ? `, quick ${reply.quick.node}` : ''}\n  ${reply.message}`);
}
console.log(`${cases.length - failures}/${cases.length} passed`);
process.exitCode = failures ? 1 : 0;

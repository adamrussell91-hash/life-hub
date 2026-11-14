/**
 * Local dev only: the written gate's real checker (rules, prompt, parsing,
 * feedback) with a stand-in model. It passes a point whose explanation names
 * the idea and fails the rest with a pointer; no request leaves the machine.
 */
import { createLockChecker, createWritingChecker } from '../../../netlify/functions/_shared/rotation-writing.mjs';

type Request = { messages: Array<{ content: string }> };

async function fakeModel(request: Request) {
  const prompt = request.messages[0]?.content ?? '';
  const idea = /<idea>([\s\S]*?)<\/idea>/.exec(prompt)?.[1]?.trim().toLowerCase() ?? '';
  const checks = (/Checks for every point: ([^.]+)\./.exec(prompt)?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  const verdicts = [...prompt.matchAll(/<point id="([^"]+)"[^>]*>([\s\S]*?)<\/point>/g)].flatMap(([, id, text]) => {
    const linked = !!idea && text!.toLowerCase().includes(idea);
    return checks.map((check) => (check === 'effect_linked' && !linked ? { id, check, verdict: 'fail', reason: 'Say how these words show the idea in the question.' } : { id, check, verdict: 'pass' }));
  });
  return { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify({ verdicts }) }], usage: { input_tokens: 1800, output_tokens: 280 } };
}

export const mockWritingChecker = createWritingChecker({ complete: fakeModel as never });

/**
 * The lock's AI check with a stand-in model: it passes an answer that uses
 * the longest word of every criterion and otherwise asks for the first one it
 * misses. Deterministic, and no request leaves the machine.
 */
export async function fakeLockModel(request: Request) {
  const prompt = request.messages[0]?.content ?? '';
  const answer = (/<answer>([\s\S]*?)<\/answer>/.exec(prompt)?.[1] ?? '').toLowerCase();
  const criteria = [...prompt.matchAll(/<criterion>([\s\S]*?)<\/criterion>/g)].map((m) => m[1]!.trim());
  const missing = criteria.find((c) => {
    const word = c.toLowerCase().split(/[^a-z0-9]+/).sort((a, b) => b.length - a.length)[0] ?? '';
    return word && !answer.includes(word);
  });
  const reply = missing ? { pass: false, fix: `Say more about this: ${missing}`.slice(0, 160) } : { pass: true, fix: '' };
  return { model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 400, output_tokens: 40 } };
}

export const mockLockChecker = createLockChecker({ complete: fakeLockModel as never });

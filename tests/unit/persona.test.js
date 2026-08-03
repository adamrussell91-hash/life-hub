import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

test('builds a named agent prompt naming its writable record types', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', digest: 'Streak: 2', constraints: 'Fat < 50g' });
  assert.match(prompt, /You are Chadwick Flexington/);
  assert.match(prompt, /workout/);
  assert.match(prompt, /Streak: 2/);
  assert.match(prompt, /Fat < 50g/);
});

test('a conversational-only agent is told it cannot log records', () => {
  const prompt = buildSystemPrompt({ slug: 'vera', digest: '', constraints: '' });
  assert.match(prompt, /do not log structured records/);
});

test('the router lists every agent, infers the right one, and never narrates the handoff', () => {
  const prompt = buildSystemPrompt({ slug: 'router', digest: '', constraints: '' });
  assert.match(prompt, /Brisket Lasso/);
  assert.match(prompt, /infer/i);
  assert.match(prompt, /[Nn]ever narrate or announce this inference/);
});

test('rejects an unknown slug', () => {
  assert.throws(() => buildSystemPrompt({ slug: 'nope' }), TypeError);
});

test('an empty food library falls back to a plain web_search instruction', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.match(prompt, /use web_search to look up its actual nutrition figures/);
  assert.doesNotMatch(prompt, /Food Library:/);
});

test('a populated food library is included with instructions to check it before searching', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '', foodLibrary: '- Domino\'s Meatlovers Pizza (1 slice) — calories=250' });
  assert.match(prompt, /check the Food Library below first/);
  assert.match(prompt, /save_food_library_entry/);
  assert.match(prompt, /Domino's Meatlovers Pizza/);
});

test('an empty central node log is omitted entirely', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.doesNotMatch(prompt, /Central Node/);
});

test('a populated central node log is included with instructions to treat it as memory', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket', digest: '', constraints: '',
    centralNodeLog: '**3 Aug:** Brisket Lasso: Logged Domino\'s Meatlovers pizza for lunch (280 kcal).'
  });
  assert.match(prompt, /your memory across conversations/);
  assert.match(prompt, /Logged Domino's Meatlovers pizza for lunch/);
});

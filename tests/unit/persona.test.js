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

test('the router lists every agent and is told to infer rather than guess silently', () => {
  const prompt = buildSystemPrompt({ slug: 'router', digest: '', constraints: '' });
  assert.match(prompt, /Life Hub router/);
  assert.match(prompt, /Brisket Lasso/);
  assert.match(prompt, /infer/i);
});

test('rejects an unknown slug', () => {
  assert.throws(() => buildSystemPrompt({ slug: 'nope' }), TypeError);
});

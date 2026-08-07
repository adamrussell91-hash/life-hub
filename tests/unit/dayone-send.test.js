import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDiaryToDayOne } from '../../netlify/functions/_shared/dayone-send.mjs';
import { loadPenelopeProtocol } from '../../netlify/functions/_shared/load-penelope-protocol.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

test('Penelope protocol forbids survey-style energy/mood questions and requires inference', () => {
  const text = loadPenelopeProtocol();
  assert.match(text, /Forbidden survey questions/i);
  assert.match(text, /infer/i);
  assert.match(text, /Day One/i);
  assert.doesNotMatch(text, /leave false unless he asks about Day One/);
  assert.match(text, /What would you rate your energy/);
});

test('Penelope prompt bans rating questions and keeps Day One on confirm', () => {
  const prompt = buildSystemPrompt({
    slug: 'penelope',
    penelopeProtocol: loadPenelopeProtocol()
  });
  assert.match(prompt, /Never ask him to rate energy/i);
  assert.match(prompt, /dayone_sent:false/i);
  assert.match(prompt, /emails Day One after he confirms/i);
});

test('sendDiaryToDayOne no-ops when Resend or Day One email is missing', async () => {
  const result = await sendDiaryToDayOne({
    notes: 'Felt flat today.',
    date: '2026-08-07',
    env: {},
    fetchImpl: async () => {
      throw new Error('should not call');
    }
  });
  assert.deepEqual(result, { sent: false, reason: 'not_configured' });
});

test('sendDiaryToDayOne posts plain text to Resend for Day One', async () => {
  const calls = [];
  const result = await sendDiaryToDayOne({
    notes: 'Felt flat today.\n\nWent for a walk anyway.',
    date: '2026-08-07',
    env: {
      RESEND_API_KEY: 're_test',
      DAYONE_EMAIL: 'dayone@example.com',
      RESEND_FROM: 'Life Hub <diary@example.com>'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    }
  });
  assert.equal(result.sent, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.resend\.com\/emails/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.to[0], 'dayone@example.com');
  assert.equal(body.subject, '2026-08-07');
  assert.match(body.text, /Felt flat today/);
  assert.match(calls[0].options.headers.Authorization, /Bearer re_test/);
});

test('sendDiaryToDayOne soft-fails on empty notes or provider errors', async () => {
  assert.deepEqual(
    await sendDiaryToDayOne({ notes: '  ', date: '2026-08-07', env: { RESEND_API_KEY: 'x', DAYONE_EMAIL: 'a@b.c' } }),
    { sent: false, reason: 'empty_notes' }
  );
  const failed = await sendDiaryToDayOne({
    notes: 'Hello',
    date: '2026-08-07',
    env: { RESEND_API_KEY: 'x', DAYONE_EMAIL: 'a@b.c' },
    fetchImpl: async () => new Response('nope', { status: 500 })
  });
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, 'resend_500');
});

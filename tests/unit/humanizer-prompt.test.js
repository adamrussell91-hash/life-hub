import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, ROUTER_SLUG } from '../../netlify/functions/_shared/agent-directory.mjs';
import {
  HUMANIZER_LAYER_HEADING,
  loadHumanizerGuidance
} from '../../netlify/functions/_shared/load-humanizer.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

const slugs = [...AGENTS.map(agent => agent.slug), ROUTER_SLUG];

function countHeading(prompt) {
  return prompt.split(HUMANIZER_LAYER_HEADING).length - 1;
}

test('every personality and the router receive the shared Humanizer layer once', () => {
  for (const slug of slugs) {
    const prompt = buildSystemPrompt({ slug, digest: '', constraints: '' });
    assert.equal(countHeading(prompt), 1, `${slug} should include Humanizer once`);
    assert.match(prompt, /embedded mode/i);
    assert.match(prompt, /Do not invent events/);
    assert.match(prompt, /tool arguments/i);
  }
});

test('Clare keeps her own voice and task rules beside the shared Humanizer layer', () => {
  const prompt = buildSystemPrompt({ slug: 'clare' });
  assert.match(prompt, /You ARE Clare DeMind/);
  assert.match(prompt, /ADHD-aware task partner/);
  assert.match(prompt, /Now \/ Later \/ Trash/);
  assert.match(prompt, /chaotic surface \/ competent core/);
  assert.match(prompt, /So that was due yesterday/);
  assert.match(prompt, /That is your day\. Dump away/);
  assert.match(prompt, /Hammond→Clare/);
  assert.match(prompt, /before triaging a dump/);
  assert.equal(countHeading(prompt), 1);
});

test('Hammond keeps a contrasting command voice beside the same Humanizer layer', () => {
  const prompt = buildSystemPrompt({ slug: 'hammond' });
  assert.match(prompt, /You ARE General Hammond/);
  assert.match(prompt, /commanding officer/);
  assert.match(prompt, /You have a go/);
  assert.match(prompt, /Dismissed\. Go execute/);
  assert.doesNotMatch(prompt, /ADHD-aware task partner/);
  assert.doesNotMatch(prompt, /Now \/ Later \/ Trash/);
  assert.doesNotMatch(prompt, /So that was due yesterday/);
  assert.doesNotMatch(prompt, /That is your day\. Dump away/);
  assert.equal(countHeading(prompt), 1);
});

test('Clare and Hammond prompts stay distinct after Humanizer is attached', () => {
  const clare = buildSystemPrompt({ slug: 'clare' });
  const hammond = buildSystemPrompt({ slug: 'hammond' });
  assert.match(clare, /Clare DeMind/);
  assert.match(hammond, /General Hammond/);
  assert.notEqual(clare, hammond);
  assert.ok(clare.includes('You ARE Clare DeMind'));
  assert.ok(!clare.includes('You ARE General Hammond'));
  assert.ok(hammond.includes('You ARE General Hammond'));
  assert.ok(!hammond.includes('You ARE Clare DeMind'));
});

test('a genuine writing sample is placed after voice and outranks Humanizer style defaults', () => {
  const sample = 'Short. Then a longer line—with an em dash—because that is how I actually write.';
  const prompt = buildSystemPrompt({
    slug: 'vera',
    writingSample: sample
  });
  const voiceAt = prompt.indexOf('You ARE Dr Vera Lenz');
  const sampleAt = prompt.indexOf(sample);
  const humanizerAt = prompt.indexOf(HUMANIZER_LAYER_HEADING);
  assert.ok(voiceAt >= 0 && sampleAt > voiceAt);
  assert.ok(humanizerAt > sampleAt);
  assert.match(prompt, /Approved writing sample/);
  assert.match(prompt, /outranks Humanizer generic style defaults/);
  assert.match(prompt, /use the em-dash as breathing room/);
});

test('checked-in writing samples enter after voice and stay distinct across Clare and Hammond', () => {
  const clare = buildSystemPrompt({ slug: 'clare' });
  const hammond = buildSystemPrompt({ slug: 'hammond' });
  const clareSample = readFileSync(join(process.cwd(), 'config/humanizer/voices/clare.md'), 'utf8').trim();
  const hammondSample = readFileSync(join(process.cwd(), 'config/humanizer/voices/hammond.md'), 'utf8').trim();
  const clareVoiceAt = clare.indexOf('You ARE Clare DeMind');
  const clareSampleAt = clare.indexOf(clareSample);
  const hammondVoiceAt = hammond.indexOf('You ARE General Hammond');
  const hammondSampleAt = hammond.indexOf(hammondSample);
  assert.ok(clareSampleAt > clareVoiceAt);
  assert.ok(hammondSampleAt > hammondVoiceAt);
  assert.ok(clare.indexOf(HUMANIZER_LAYER_HEADING) > clareSampleAt);
  assert.ok(hammond.indexOf(HUMANIZER_LAYER_HEADING) > hammondSampleAt);
  assert.ok(!clare.includes(hammondSample));
  assert.ok(!hammond.includes(clareSample));
  assert.match(clare, /Approved writing sample/);
  assert.match(hammond, /outranks Humanizer generic style defaults/);
});

test('no writing-sample block is invented when the caller supplies an empty sample', () => {
  const prompt = buildSystemPrompt({ slug: 'clare', writingSample: '' });
  assert.doesNotMatch(prompt, /Approved writing sample/);
  assert.doesNotMatch(prompt, /free spirit out here living its best life/);
});

test('Humanizer can be omitted for a focused unit test without changing default composition', () => {
  const without = buildSystemPrompt({ slug: 'clare', humanizerGuidance: '' });
  const withDefault = buildSystemPrompt({ slug: 'clare' });
  assert.equal(countHeading(without), 0);
  assert.equal(countHeading(withDefault), 1);
  assert.match(without, /You ARE Clare DeMind/);
});

test('the Humanizer tail is the same shared guidance, not a per-personality rewrite', () => {
  const guidance = loadHumanizerGuidance();
  const clare = buildSystemPrompt({ slug: 'clare' });
  const hammond = buildSystemPrompt({ slug: 'hammond' });
  assert.ok(clare.endsWith(guidance));
  assert.ok(hammond.endsWith(guidance));
  assert.equal(clare.split(guidance).length - 1, 1);
  assert.equal(hammond.split(guidance).length - 1, 1);
});

test('structured-output and fact-preservation contracts are in the shared layer', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket' });
  assert.match(prompt, /Tool arguments, API payloads, function-call structures/);
  assert.match(prompt, /Stored data records, machine-consumed structured responses/);
  assert.match(prompt, /Keep names, dates, numbers, measurements, quotations, citations/);
  assert.match(prompt, /Do not invent events, memories, emotions, biography/);
});

test('chat runtime still streams in one model pass and does not import a Humanizer rewriter', () => {
  const chat = readFileSync(join(process.cwd(), 'netlify/functions/chat.mjs'), 'utf8');
  const persona = readFileSync(join(process.cwd(), 'netlify/functions/_shared/persona.mjs'), 'utf8');
  assert.match(chat, /streamWithAgentLogForce/);
  assert.match(chat, /buildSystemPrompt/);
  assert.doesNotMatch(chat, /humanize|loadHumanizerGuidance|second rewrite/i);
  assert.match(persona, /loadHumanizerGuidance/);
  assert.doesNotMatch(persona, /fetch\(|streamMessage/);
});

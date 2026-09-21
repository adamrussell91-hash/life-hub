import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';
import { sanitizeCentralNode } from '../../apps/life/js/core/central-node-write.js';

// Bug instant from production: ~7:23 Sydney Monday while UTC is still Sunday.
const BUG_INSTANT = new Date('2026-09-20T21:23:00Z');
const SYDNEY_TODAY = getSydneyDateKey(BUG_INSTANT);

test('bug instant is Monday in Sydney and Sunday in UTC', () => {
  assert.equal(SYDNEY_TODAY, '2026-09-21');
  assert.equal(BUG_INSTANT.toISOString().slice(0, 10), '2026-09-20');
});

test('Sara system prompt delivers authoritative Sydney hub clock (not UTC Sunday)', () => {
  const prompt = buildSystemPrompt({
    slug: 'sara',
    today: SYDNEY_TODAY,
    now: BUG_INSTANT,
    digest: '',
    centralNodeLog: '**Health:** GGT jump noted.',
    saraProtocol: 'Be Sara.'
  });
  assert.match(prompt, /Hub clock \(authoritative — Australia\/Sydney\)/);
  assert.match(prompt, /Monday 21 September 2026/);
  assert.match(prompt, /2026-09-21/);
  assert.doesNotMatch(prompt, /Sunday 20 September 2026/);
  assert.match(prompt, /Never invent a calendar day from UTC/i);
});

test('sanitizeCentralNode rolls a prior-day Today\'s Status heading to Sydney today', () => {
  const stale = [
    "## ⚡ Today's Status (Sunday 20 September 2026)",
    '**Health:** yesterday board.',
    '---',
    '## 📝 Recent Agent Actions',
    '- keep me'
  ].join('\n');
  const next = sanitizeCentralNode(stale, '2026-09-21');
  assert.match(next, /Today's Status \(Monday 21 September 2026\)/);
  assert.doesNotMatch(next, /Sunday 20 September 2026/);
  assert.doesNotMatch(next, /yesterday board/);
  assert.match(next, /keep me/);
});

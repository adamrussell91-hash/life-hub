import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays } from '../../js/core/time.js';
import {
  MIND_DIGEST_WINDOW_DAYS,
  getMindDigestWindowStart,
  summarizeDiaryForPrompt,
  summarizeMindSessionsForPrompt,
  simultaneousSilenceFlag,
  divergenceLine,
  excerptOnThisDay,
  selectMindEntries
} from '../../netlify/functions/_shared/mind-digest.mjs';

const TODAY = '2026-08-13';

test('window is 30 inclusive days', () => {
  assert.equal(MIND_DIGEST_WINDOW_DAYS, 30);
  assert.equal(getMindDigestWindowStart(TODAY), addCalendarDays(TODAY, -29));
});

test('empty events produce empty strings, not a crash', () => {
  assert.equal(summarizeDiaryForPrompt([], TODAY), '');
  assert.equal(summarizeMindSessionsForPrompt([], TODAY), '');
  assert.match(simultaneousSilenceFlag({ tree: [], today: TODAY }), /quiet/i);
});

test('diary summary uses metadata and system_note, never notes body', () => {
  const events = [{
    record: {
      type: 'diary', date: '2026-08-10', mood: 'low', moods: ['low', 'good'],
      tags: ['weekend'], system_note: 'Weekend collapse', mood_score: 4
    },
    body: 'SECRET PROSE ADAM SHOULD NOT SEE IN VERA DIGEST',
    path: 'data/mind/2026/08/2026-08-10-diary-2100.md'
  }];
  const text = summarizeDiaryForPrompt(events, TODAY);
  assert.match(text, /low/);
  assert.match(text, /Weekend collapse/);
  assert.doesNotMatch(text, /SECRET PROSE/);
  assert.match(text, /days since last entry: 3/i);
});

test('session summary surfaces closing_question as a thread', () => {
  const events = [{
    record: {
      type: 'mind_session', date: '2026-08-12',
      theme: 'Weekend permission', closing_question: 'What is the weekend actually for?'
    },
    body: '',
    path: 'data/mind/2026/08/2026-08-12-session.md'
  }];
  const text = summarizeMindSessionsForPrompt(events, TODAY);
  assert.match(text, /Weekend permission/);
  assert.match(text, /What is the weekend actually for/);
});

test('silence flag only when both gaps >= 7', () => {
  const treeBoth = [];
  assert.match(simultaneousSilenceFlag({ tree: treeBoth, today: TODAY }), /quiet/i);
  const treeDiary = [{
    path: 'data/mind/2026/08/2026-08-12-diary-2100.md', type: 'blob', sha: 'a'
  }];
  assert.equal(simultaneousSilenceFlag({ tree: treeDiary, today: TODAY }), '');
});

test('on-this-day excerpt truncates notes', () => {
  const long = 'First sentence is here. Second sentence follows after. Third should not.';
  const excerpt = excerptOnThisDay({
    date: '2025-08-13',
    mood: 'low',
    tags: ['work'],
    highlights: 'A walk',
    challenges: 'Load',
    notes: long
  });
  assert.match(excerpt, /2025-08-13/);
  assert.match(excerpt, /First sentence/);
  assert.doesNotMatch(excerpt, /Third should not/);
});

test('selectMindEntries filters data/mind in window', () => {
  const tree = [
    { path: 'data/mind/2026/08/2026-08-01-diary-2100.md', type: 'blob', sha: '1' },
    { path: 'data/mind/2026/07/2026-07-01-session.md', type: 'blob', sha: '2' },
    { path: 'data/nutrition/2026/08/2026-08-13-breakfast.md', type: 'blob', sha: '3' }
  ];
  const from = getMindDigestWindowStart(TODAY);
  const selected = selectMindEntries(tree, { from, to: TODAY });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].sha, '1');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays } from '../../js/core/time.js';
import {
  MIND_DIGEST_WINDOW_DAYS,
  getMindDigestWindowStart,
  summarizeDiaryForPrompt,
  summarizeMindSessionsForPrompt,
  summarizeWorkingModelForPrompt,
  summarizeTodaysMindSession,
  simultaneousSilenceFlag,
  divergenceLine,
  excerptOnThisDay,
  selectMindEntries,
  isHammondMindBriefTurn,
  hammondDiaryDigestForTurn,
  recentSystemNoteTail
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

test('summarizeMindSessionsForPrompt includes themes and session_type', () => {
  const text = summarizeMindSessionsForPrompt([
    { record: { type: 'mind_session', date: '2026-08-10', themes: ['work'], session_type: 'deep-dive', title: 'Filter' } }
  ], '2026-08-10');
  assert.match(text, /work/);
  assert.match(text, /deep-dive|Filter/);
});

test('summarizeTodaysMindSession reports not logged when missing', () => {
  assert.match(
    summarizeTodaysMindSession([], '2026-08-26'),
    /2026-08-26.*not logged yet/i
  );
});

test('summarizeTodaysMindSession surfaces today session fields and path', () => {
  const text = summarizeTodaysMindSession([{
    record: {
      type: 'mind_session',
      date: '2026-08-26',
      id: 'mind_session-2026-08-26-5e2cc1',
      session_type: 'deep-dive',
      theme: 'fear of authority',
      insight: 'Nationals would not matter',
      observation: 'not enough twice',
      closing_question: 'what getting in trouble feels like in the body',
      cross_agent_note: 'Vera→Hammond: open with body question'
    },
    path: 'data/mind/2026/08/2026-08-26-session.md'
  }], '2026-08-26');
  assert.match(text, /logged/i);
  assert.match(text, /mind_session-2026-08-26-5e2cc1/);
  assert.match(text, /deep-dive/);
  assert.match(text, /fear of authority/);
  assert.match(text, /2026-08-26-session\.md/);
  assert.match(text, /Vera→Hammond/);
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

function diaryEvent(date, body) {
  return {
    record: { type: 'diary', date, mood: 'ok' },
    body,
    path: `data/mind/2026/08/${date}-diary-2100.md`
  };
}

test('equal-length diary set of 4 does not flag shorter than usual', () => {
  const body = 'one two three four five six seven eight nine ten';
  const events = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].map(d => diaryEvent(d, body));
  const text = summarizeDiaryForPrompt(events, TODAY);
  assert.doesNotMatch(text, /shorter than usual/);
});

test('very short latest diary among 4 entries flags shorter than usual', () => {
  const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
  const events = [
    diaryEvent('2026-08-10', long),
    diaryEvent('2026-08-11', long),
    diaryEvent('2026-08-12', long),
    diaryEvent('2026-08-13', 'tiny')
  ];
  const text = summarizeDiaryForPrompt(events, TODAY);
  assert.match(text, /shorter than usual/);
});

test('divergenceLine is empty when diary and session moods overlap', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-12', mood: 'low' }, body: '', path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-13', mood_at_open: 'low', mood_at_close: 'ok' }, body: '', path: 's' }
  ];
  assert.equal(divergenceLine(events, TODAY), '');
});

test('divergenceLine hypothesizes when diary and session moods do not overlap', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-12', mood: 'low' }, body: '', path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-13', mood_at_open: 'energised', mood_at_close: 'ok' }, body: '', path: 's' }
  ];
  const text = divergenceLine(events, TODAY);
  assert.match(text, /Hypothesis only/);
  assert.match(text, /did not overlap/);
});

test('isHammondMindBriefTurn matches 5e/6b phrases and ignores audits', () => {
  assert.equal(isHammondMindBriefTurn('Hammond, monthly three-way brief'), true);
  assert.equal(isHammondMindBriefTurn('run a quarterly look-back'), true);
  assert.equal(isHammondMindBriefTurn('pattern synthesis please'), true);
  assert.equal(isHammondMindBriefTurn('two-voice retrospective'), true);
  assert.equal(isHammondMindBriefTurn('Hammond, what should I focus on?'), false);
  assert.equal(isHammondMindBriefTurn('monthly audit'), false);
  assert.equal(isHammondMindBriefTurn(''), false);
});

test('hammondDiaryDigestForTurn is empty unless Hammond and a brief phrase', () => {
  const events = [{
    record: {
      type: 'diary', date: '2026-08-10', mood: 'low',
      system_note: 'Weekend collapse'
    },
    body: 'SECRET PROSE'
  }];
  assert.equal(hammondDiaryDigestForTurn({
    slug: 'hammond', message: 'focus today', events, today: TODAY
  }), '');
  const brief = hammondDiaryDigestForTurn({
    slug: 'hammond', message: 'monthly three-way brief', events, today: TODAY
  });
  assert.match(brief, /Weekend collapse/);
  assert.doesNotMatch(brief, /SECRET PROSE/);
  assert.equal(hammondDiaryDigestForTurn({
    slug: 'vera', message: 'monthly three-way brief', events, today: TODAY
  }), '');
});

test('recentSystemNoteTail is empty when there are no diary system_notes', () => {
  assert.equal(recentSystemNoteTail([], TODAY), '');
  assert.equal(recentSystemNoteTail(null, TODAY), '');
});

test('recentSystemNoteTail surfaces recent system_note lines, never diary prose', () => {
  const events = [
    {
      record: { type: 'diary', date: '2026-08-10', system_note: 'Weekend collapse' },
      body: 'SECRET PROSE ADAM SHOULD NOT SEE'
    },
    {
      record: { type: 'diary', date: '2026-08-12', system_note: '  quiet work day  ' },
      body: 'more secret'
    },
    {
      record: { type: 'mind_session', date: '2026-08-12', system_note: 'not a diary' },
      body: ''
    },
    {
      record: { type: 'diary', date: '2026-08-13', system_note: '   ' },
      body: ''
    }
  ];
  const text = recentSystemNoteTail(events, TODAY);
  assert.match(text, /^Recent day-to-day signal \(system_note, metadata only\):/);
  assert.match(text, /2026-08-10: Weekend collapse/);
  assert.match(text, /2026-08-12: quiet work day/);
  assert.doesNotMatch(text, /SECRET PROSE/);
  assert.doesNotMatch(text, /not a diary/);
  assert.doesNotMatch(text, /2026-08-13/);
});

test('recentSystemNoteTail keeps a 7-day window and caps at 5 lines', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-05', system_note: 'too old' } },
    { record: { type: 'diary', date: '2026-08-07', system_note: 'window start' } },
    { record: { type: 'diary', date: '2026-08-08', system_note: 'day 2' } },
    { record: { type: 'diary', date: '2026-08-09', system_note: 'day 3' } },
    { record: { type: 'diary', date: '2026-08-10', system_note: 'day 4' } },
    { record: { type: 'diary', date: '2026-08-11', system_note: 'day 5' } },
    { record: { type: 'diary', date: '2026-08-12', system_note: 'day 6' } },
    { record: { type: 'diary', date: '2026-08-13', system_note: 'day 7' } }
  ];
  const text = recentSystemNoteTail(events, TODAY);
  assert.doesNotMatch(text, /too old/);
  assert.doesNotMatch(text, /window start/);
  assert.doesNotMatch(text, /day 2/);
  assert.match(text, /2026-08-09: day 3/);
  assert.match(text, /2026-08-13: day 7/);
  const noteLines = text.split('\n').slice(1);
  assert.equal(noteLines.length, 5);
});

test('summarizeWorkingModelForPrompt returns empty when no working_model entries exist', () => {
  assert.equal(summarizeWorkingModelForPrompt([], TODAY), '');
  assert.equal(summarizeWorkingModelForPrompt([
    { record: { type: 'mind_session', date: '2026-08-10', theme: 'x' } }
  ], TODAY), '');
});

test('summarizeWorkingModelForPrompt last-write-wins per label across sessions', () => {
  const events = [
    {
      record: {
        type: 'mind_session', date: '2026-08-10',
        working_model: [{ label: 'Sunday spirals', status: 'forming', evidence: 'missed alarm' }]
      }
    },
    {
      record: {
        type: 'mind_session', date: '2026-08-12',
        working_model: [{ label: 'Sunday spirals', status: 'holding', evidence: 'got up anyway' }]
      }
    }
  ];
  const text = summarizeWorkingModelForPrompt(events, TODAY);
  assert.match(text, /Sunday spirals — holding/);
  assert.match(text, /2026-08-12/);
  assert.match(text, /got up anyway/);
  assert.doesNotMatch(text, /forming/);
});

test('summarizeWorkingModelForPrompt excludes retired entries', () => {
  const text = summarizeWorkingModelForPrompt([{
    record: {
      type: 'mind_session', date: '2026-08-12',
      working_model: [{ label: 'Old pattern', status: 'retired', evidence: 'not true anymore' }]
    }
  }], TODAY);
  assert.equal(text, '');
});

test('summarizeWorkingModelForPrompt surfaces only five most recently touched live labels', () => {
  const events = [];
  for (let i = 1; i <= 6; i += 1) {
    const day = String(i).padStart(2, '0');
    events.push({
      record: {
        type: 'mind_session',
        date: `2026-08-${day}`,
        working_model: [{ label: `Hypothesis ${i}`, status: 'holding' }]
      }
    });
  }
  const text = summarizeWorkingModelForPrompt(events, TODAY);
  assert.doesNotMatch(text, /Hypothesis 1 — holding/);
  assert.match(text, /Hypothesis 2 — holding/);
  assert.match(text, /Hypothesis 6 — holding/);
  const bullets = text.split('\n').filter(line => line.startsWith('- '));
  assert.equal(bullets.length, 5);
});


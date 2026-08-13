import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindModel,
  diaryEntries,
  entriesByEnergy,
  entriesByMood,
  moodScoreSeries,
  recurringThemes,
  rangeWindow,
  sessionEntries,
  daysSinceLastDiary,
  daysSinceLastMindSession,
  silenceFlag,
  mindInsights,
  mindCrossAgentLines
} from '../../js/app/mind-model.js';

test('buildMindModel builds mood series, by-mood counts, and themes', () => {
  const events = [
    {
      record: {
        type: 'diary', date: '2026-08-01', mood_score: 6, mood: 'good', tags: ['school', 'fatigue']
      },
      body: '',
      path: 'a'
    },
    {
      record: {
        type: 'diary', date: '2026-08-03', mood_score: 8, mood: 'great', tags: ['school']
      },
      body: '',
      path: 'b'
    },
    {
      record: {
        type: 'diary', date: '2026-08-05', mood_score: 4, mood: 'low', tags: ['fatigue']
      },
      body: '',
      path: 'c'
    }
  ];
  const model = buildMindModel({ events, date: '2026-08-05', range: 'monthly' });
  assert.equal(model.moodSeries.length, 3);
  assert.equal(model.byMood.find(item => item.key === 'good').value, 1);
  assert.equal(model.byMood.find(item => item.key === 'great').value, 1);
  assert.equal(model.themes[0].key, 'fatigue');
  assert.equal(model.themes[0].value, 2);
});

test('range helpers and empty themes', () => {
  assert.equal(rangeWindow('2026-08-05', 'weekly').days, 7);
  assert.deepEqual(recurringThemes([], rangeWindow('2026-08-05', 'weekly')), []);
  assert.equal(moodScoreSeries([], rangeWindow('2026-08-05', 'weekly')).length, 0);
  assert.equal(entriesByMood([], rangeWindow('2026-08-05', 'weekly')).every(item => item.value === 0), true);
});

test('sessionEntries maps mind_session records and ignores diary', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-01', mood: 'good' }, path: 'd' },
    {
      record: {
        type: 'mind_session',
        date: '2026-08-10',
        theme: 'Weekend',
        closing_question: 'What is the weekend for?',
        insight: 'Rest is not a prize.',
        mood_at_open: 'low',
        mood_at_close: 'good',
        cross_agent_note: 'Vera→Penelope: ask what the weekend is actually for.'
      },
      path: 'data/mind/2026/08/2026-08-10-session.md'
    }
  ];
  const sessions = sessionEntries(events);
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    date: '2026-08-10',
    theme: 'Weekend',
    closingQuestion: 'What is the weekend for?',
    insight: 'Rest is not a prize.',
    moodAtOpen: 'low',
    moodAtClose: 'good',
    crossAgentNote: 'Vera→Penelope: ask what the weekend is actually for.',
    path: 'data/mind/2026/08/2026-08-10-session.md'
  });
});

test('entriesByEnergy counts diary energy in range', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', energy: 'high' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-03', energy: 'low' }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-04', energy: 'low' }, path: 'c' },
    { record: { type: 'diary', date: '2026-07-01', energy: 'high' }, path: 'old' }
  ]);
  const byEnergy = entriesByEnergy(entries, rangeWindow('2026-08-05', 'weekly'));
  assert.deepEqual(byEnergy.map(item => item.key), ['high', 'medium', 'low']);
  assert.equal(byEnergy.find(item => item.key === 'high').value, 1);
  assert.equal(byEnergy.find(item => item.key === 'medium').value, 0);
  assert.equal(byEnergy.find(item => item.key === 'low').value, 2);
});

test('daysSinceLastDiary and daysSinceLastMindSession use all-time dates, not the range', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood: 'good' }, path: 'd' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-04', theme: 'Anchor' }, path: 's' }
  ]);
  assert.equal(daysSinceLastDiary(entries, '2026-08-13'), 12);
  assert.equal(daysSinceLastMindSession(sessions, '2026-08-13'), 9);
  assert.equal(daysSinceLastDiary([], '2026-08-13'), null);
  assert.equal(daysSinceLastMindSession([], '2026-08-13'), null);
});

test('silenceFlag is true only when both gaps are numbers >= 7', () => {
  assert.equal(silenceFlag(12, 9), true);
  assert.equal(silenceFlag(7, 7), true);
  assert.equal(silenceFlag(6, 9), false);
  assert.equal(silenceFlag(12, 6), false);
  assert.equal(silenceFlag(null, null), false);
  assert.equal(silenceFlag(12, null), false);
  assert.equal(silenceFlag(null, 9), false);
});

test('mindInsights filters Mind Insight entries in range and ignores the 10-entry tail cap', () => {
  const blocks = [];
  for (let i = 0; i < 11; i += 1) {
    const day = String(i + 1).padStart(2, '0');
    blocks.push(`## 2026-07-${day} — Coach's Notes\n\nOld note ${i}.\n`);
  }
  blocks.push(`## 2026-08-02 — Mind Insight\n**Title:** Weekend\n**Status:** Still Active\n\nRest is not a prize.\n`);
  blocks.push(`## 2026-06-01 — Mind Insight\n**Title:** Too old\n\nOutside monthly window.\n`);
  const markdown = `# Governance Log\n\n${blocks.join('\n')}`;
  const insights = mindInsights(markdown, rangeWindow('2026-08-13', 'monthly'));
  assert.equal(insights.length, 1);
  assert.equal(insights[0].entryType, 'Mind Insight');
  assert.equal(insights[0].title, 'Weekend');
  assert.equal(insights[0].body, 'Rest is not a prize.');
  assert.equal(insights[0].status, 'Still Active');
});

test('mindCrossAgentLines keeps Vera/Penelope prefixes and drops others', () => {
  const markdown = `# Purpose
## 🤝 Cross-Agent Coordination
*One-line directives only.*
- Chadwick→Sara: AC flag.
- **Vera→Penelope:** ask what the weekend is actually for.
- Penelope→Vera: the wedding scent came up.
- Hammond→Ann: teaching handoff.
- Brisket→Penelope: skip dessert logging.
`;
  const lines = mindCrossAgentLines(markdown);
  assert.deepEqual(lines, [
    'Vera→Penelope: ask what the weekend is actually for.',
    'Penelope→Vera: the wedding scent came up.',
    'Brisket→Penelope: skip dessert logging.'
  ]);
});

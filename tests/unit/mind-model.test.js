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
  silenceFlag
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

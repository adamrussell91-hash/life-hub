import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindModel,
  entriesByMood,
  moodScoreSeries,
  recurringThemes,
  rangeWindow
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  sessionTypeFromNotion,
  recordFromSessionRow,
  recordFromDiaryMarkdown,
  recordFromHistoricalMarkdown,
  planImport
} from '../../js/core/mind-import.js';

test('parseCsv respects quoted commas', () => {
  const rows = parseCsv('a,b\n"x, y",z\n');
  assert.deepEqual(rows[0], { a: 'x, y', b: 'z' });
});

test('recordFromSessionRow maps Vera CSV columns', () => {
  const rec = recordFromSessionRow({
    'Session Title': 'The Filter',
    Date: '7 April 2026',
    'Session Type': 'Deep Dive',
    'Primary Theme': 'ADHD Reality',
    'Follow-up Themes': 'Relationships, Self-Compassion',
    'Framework Used': 'Compassion-Focused',
    'Mood at Opening': 'Neutral',
    'Mood at Close': 'Good',
    'Key Insight': 'A filter converts good things into obligations.',
    "Vera's Observation": 'The filter activated.',
    'Closing Question': 'Stay ten seconds longer.',
    'Pattern Tags': 'shame-loop, identity'
  });
  assert.equal(rec.type, 'mind_session');
  assert.equal(rec.date, '2026-04-07');
  assert.equal(rec.session_type, 'deep-dive');
  assert.deepEqual(rec.themes, ['ADHD Reality', 'Relationships', 'Self-Compassion']);
  assert.equal(rec.mood_at_open, 'neutral');
  assert.equal(rec.source_agent, 'import');
  assert.equal(rec.source, 'notion_import');
});

test('recordFromDiaryMarkdown maps mood list and score', () => {
  const rec = recordFromDiaryMarkdown(`# Daily Diary: 03 Mar 2026
Date: 3 March 2026
Mood: Low, Neutral
Mood Score: 4
Energy: Low
Tags: Evening, Health
`);
  assert.equal(rec.type, 'diary');
  assert.equal(rec.date, '2026-03-03');
  assert.equal(rec.mood, 'low');
  assert.deepEqual(rec.moods, ['low', 'neutral']);
  assert.equal(rec.mood_score, 4);
  assert.equal(rec.energy, 'low');
});

test('recordFromHistoricalMarkdown sets session_type historical', () => {
  const rec = recordFromHistoricalMarkdown('# Country Teaching Posting\nDate: 2018-10-01\nA long era note.\n');
  assert.equal(rec.session_type, 'historical');
  assert.equal(rec.type, 'mind_session');
});

test('sessionTypeFromNotion maps labels', () => {
  assert.equal(sessionTypeFromNotion('Check-in'), 'check-in');
  assert.equal(sessionTypeFromNotion('Pattern Review'), 'pattern-review');
});

test('planImport skips existing ids and ignores intake filenames', () => {
  const files = [
    { name: 'Vera — Session Database.csv', text: 'Session Title,Date,Session Type,Primary Theme,Follow-up Themes,Framework Used,Mood at Opening,Mood at Close,Key Insight,Vera\'s Observation,Closing Question,Pattern Tags\nFilter,7 April 2026,Deep Dive,ADHD Reality,,ACT,Low,Good,Insight,Obs,Q,tag\n' },
    { name: 'Adam — Psychological Baseline.md', text: '# Intake\nNot a record.\n' }
  ];
  const plan = planImport(files, { existingIds: new Set() });
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].type, 'mind_session');

  const skipped = planImport(files, { existingIds: new Set([plan.records[0].id]) });
  assert.equal(skipped.records.length, 0);
});

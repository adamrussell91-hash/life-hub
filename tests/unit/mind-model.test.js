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
  sessionThemes,
  themeCooccurrence,
  themeNodes,
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
    path: 'data/mind/2026/08/2026-08-10-session.md',
    title: null,
    themes: [],
    patternTags: [],
    sessionType: null,
    framework: null,
    observation: null,
    sourceAgent: null
  });
});

test('sessionEntries maps themes, pattern tags, and title', () => {
  const sessions = sessionEntries([{
    record: {
      type: 'mind_session',
      date: '2026-04-07',
      title: 'The Filter',
      theme: 'ADHD Reality',
      themes: ['ADHD Reality', 'Self-Compassion'],
      pattern_tags: ['shame-loop'],
      session_type: 'deep-dive',
      framework: 'Compassion-Focused',
      observation: 'The filter activated.',
      source_agent: 'import'
    },
    path: 'data/mind/2026/04/2026-04-07-the-filter.md'
  }]);
  assert.equal(sessions[0].title, 'The Filter');
  assert.deepEqual(sessions[0].themes, ['ADHD Reality', 'Self-Compassion']);
  assert.deepEqual(sessions[0].patternTags, ['shame-loop']);
  assert.equal(sessions[0].sessionType, 'deep-dive');
  assert.equal(sessions[0].observation, 'The filter activated.');
  assert.equal(sessions[0].sourceAgent, 'import');
});

test('sessionThemes falls back to singular theme', () => {
  const sessions = sessionEntries([{
    record: { type: 'mind_session', date: '2026-08-10', theme: 'Weekend' },
    path: 's'
  }]);
  assert.deepEqual(sessionThemes(sessions[0]), ['Weekend']);
});

test('themeCooccurrence counts unordered pairs and nodes keep mean mood', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood_score: 4, tags: ['work', 'sleep'] }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-02', mood_score: 8, tags: ['work', 'sleep'] }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-03', mood_score: 6, tags: ['work'] }, path: 'c' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-04', themes: ['work', 'shame-loop'] }, path: 's' }
  ]);
  const pairs = themeCooccurrence(entries, sessions, bounds);
  const workSleep = pairs.find(p => p.themeA === 'sleep' && p.themeB === 'work');
  assert.equal(workSleep.count, 2);
  const nodes = themeNodes(entries, sessions, bounds);
  const work = nodes.find(n => n.key === 'work');
  assert.equal(work.count, 4);
  assert.equal(work.meanMood, 6);
});

test('diaryEntries includes body and sourceAgent', () => {
  const entries = diaryEntries([{
    record: { type: 'diary', date: '2026-03-03', mood: 'low', source_agent: 'import' },
    body: 'Flat, fatigued day.',
    path: 'd'
  }]);
  assert.equal(entries[0].body, 'Flat, fatigued day.');
  assert.equal(entries[0].sourceAgent, 'import');
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

test('buildMindModel returns sessions, energy, insights, cross-agent lines, and silence', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-01', mood_score: 4, mood: 'low', energy: 'low', tags: [] }, path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-04', theme: 'Weekend', closing_question: 'What for?' }, path: 's' }
  ];
  const model = buildMindModel({
    events,
    date: '2026-08-13',
    range: 'monthly',
    governanceLogMarkdown: `# Governance Log\n\n## 2026-08-04 — Mind Insight\n**Title:** Weekend\n\nRest is not a prize.\n`,
    centralNodeMarkdown: `## 🤝 Cross-Agent Coordination\n- Vera→Penelope: ask what the weekend is actually for.\n- Chadwick→Sara: AC flag.\n`
  });
  assert.equal(model.sessions.length, 1);
  assert.equal(model.sessions[0].theme, 'Weekend');
  assert.equal(model.energyByLevel.find(item => item.key === 'low').value, 1);
  assert.equal(model.insights.length, 1);
  assert.equal(model.insights[0].title, 'Weekend');
  assert.deepEqual(model.crossAgentLines, ['Vera→Penelope: ask what the weekend is actually for.']);
  assert.equal(model.daysSinceLastDiary, 12);
  assert.equal(model.daysSinceLastMindSession, 9);
  assert.equal(model.silence, true);
});

test('buildMindModel clips sessions and insights to the range window, not cross-agent or silence', () => {
  const model = buildMindModel({
    events: [
      { record: { type: 'mind_session', date: '2026-06-01', theme: 'Old' }, path: 'old' },
      { record: { type: 'mind_session', date: '2026-08-10', theme: 'New' }, path: 'new' }
    ],
    date: '2026-08-13',
    range: 'weekly',
    governanceLogMarkdown: `# Governance Log\n\n## 2026-06-01 — Mind Insight\n**Title:** Old\n\nGone.\n\n## 2026-08-10 — Mind Insight\n**Title:** New\n\nHere.\n`,
    centralNodeMarkdown: `## 🤝 Cross-Agent Coordination\n- Vera→Penelope: still on the board.\n`
  });
  assert.deepEqual(model.sessions.map(s => s.theme), ['New']);
  assert.deepEqual(model.insights.map(i => i.title), ['New']);
  assert.deepEqual(model.crossAgentLines, ['Vera→Penelope: still on the board.']);
  assert.equal(model.daysSinceLastMindSession, 3);
  assert.equal(model.silence, false);
});

test('entriesByMood increments both bars for mixed moods', () => {
  const events = [{
    record: {
      type: 'diary', date: '2026-08-05', mood: 'low', moods: ['low', 'good'], tags: []
    },
    body: '',
    path: 'mixed'
  }];
  const model = buildMindModel({ events, date: '2026-08-05', range: 'weekly' });
  assert.equal(model.byMood.find(item => item.key === 'low').value, 1);
  assert.equal(model.byMood.find(item => item.key === 'good').value, 1);
});

test('buildMindModel includes an ambient observation', () => {
  const model = buildMindModel({
    events: [
      { record: { type: 'diary', date: '2026-08-01', mood_score: 4, mood: 'low', tags: [] }, body: '', path: 'd' },
      { record: { type: 'mind_session', date: '2026-08-10', theme: 'Weekend' }, body: '', path: 's' }
    ],
    date: '2026-08-13',
    range: 'monthly'
  });
  assert.match(model.ambient, /diary/i);
  assert.match(model.ambient, /session/i);
});

test('ambient omits Mood scores held when there are fewer than two mood points', () => {
  const model = buildMindModel({
    events: [],
    date: '2026-08-13',
    range: 'monthly'
  });
  assert.doesNotMatch(model.ambient, /Mood scores held/);
});

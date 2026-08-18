import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindModel,
  diaryEntries,
  entriesByEnergy,
  entriesByMood,
  MIND_RANGES,
  moodRadialSeries,
  moodScoreSeries,
  previousRangeWindow,
  recurringThemes,
  rangeWindow,
  sessionEntries,
  sessionThemes,
  themeCooccurrence,
  themeNodes,
  factorEffects,
  consistencyRing,
  cadenceHits,
  daysSinceLastDiary,
  daysSinceLastMindSession,
  silenceFlag,
  mindInsights,
  mindCrossAgentLines,
  moodTransitions,
  themeWeekly,
  themeRanks,
  lexicalSeries,
  butterfly,
  resurfacing,
  waffleEntries,
  parseInsightExtras,
  displayThemeLabel,
  entriesForTheme
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

test('displayThemeLabel turns snake_case keys into readable words', () => {
  assert.equal(displayThemeLabel('free_will'), 'Free will');
  assert.equal(displayThemeLabel('turkish_food'), 'Turkish food');
  assert.equal(displayThemeLabel('vibe-coding'), 'Vibe coding');
  assert.equal(displayThemeLabel('lecture'), 'Lecture');
});

test('recurringThemes exposes a human label beside the raw key', () => {
  const themes = recurringThemes(
    [{ date: '2026-08-05', tags: ['free_will'] }],
    rangeWindow('2026-08-05', 'weekly')
  );
  assert.equal(themes[0].key, 'free_will');
  assert.equal(themes[0].label, 'Free will');
});

test('range helpers and empty themes', () => {
  assert.deepEqual(MIND_RANGES, ['weekly', 'monthly', 'six_month', 'year']);
  assert.equal(rangeWindow('2026-08-05', 'weekly').days, 7);
  assert.equal(rangeWindow('2026-08-18', 'year').from, '2026-01-01');
  assert.equal(rangeWindow('2026-08-18', 'year').to, '2026-08-18');
  assert.deepEqual(recurringThemes([], rangeWindow('2026-08-05', 'weekly')), []);
  assert.equal(moodScoreSeries([], rangeWindow('2026-08-05', 'weekly')).length, 0);
  assert.equal(entriesByMood([], rangeWindow('2026-08-05', 'weekly')).every(item => item.value === 0), true);
});

test('moodRadialSeries keeps every diary day with energy, even across six months', () => {
  const entries = [
    { date: '2026-02-22', mood_score: 4, mood: 'low', energy: 'low' },
    { date: '2026-03-14', mood_score: 7, mood: 'good', energy: 'medium' },
    { date: '2026-08-13', mood_score: 4, mood: 'low', energy: 'low' },
    { date: '2025-12-01', mood_score: 8, mood: 'great', energy: 'high' }
  ];
  const points = moodRadialSeries(entries, rangeWindow('2026-08-18', 'six_month'));
  assert.equal(points.length, 3);
  assert.equal(points[1].energy, 'medium');
  assert.equal(points[1].value, 7);
  const yearPoints = moodRadialSeries(entries, rangeWindow('2026-08-18', 'year'));
  assert.equal(yearPoints.length, 3);
  assert.equal(yearPoints[0].date, '2026-02-22');
});

test('previousRangeWindow is the same-length window immediately before the current one', () => {
  assert.deepEqual(previousRangeWindow('2026-08-18', 'weekly'), {
    from: '2026-08-05',
    to: '2026-08-11',
    days: 7
  });
  const year = previousRangeWindow('2026-08-18', 'year');
  assert.equal(year.from, '2025-01-01');
  assert.equal(year.to, '2025-08-18');
});

test('buildMindModel themes carry previous-window counts and mean mood', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-01', mood_score: 8, tags: ['work'] }, path: 'a', body: '' },
    { record: { type: 'diary', date: '2026-08-10', mood_score: 8, tags: ['work'] }, path: 'b', body: '' },
    { record: { type: 'diary', date: '2026-07-15', mood_score: 4, tags: ['work'] }, path: 'c', body: '' }
  ];
  const model = buildMindModel({ events, date: '2026-08-18', range: 'monthly' });
  const work = model.themes.find(theme => theme.key === 'work');
  assert.equal(work.value, 2);
  assert.equal(work.prevValue, 1);
  assert.equal(work.meanMood, 8);
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

test('factorEffects requires three with and three without', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const scored = [];
  for (let i = 1; i <= 6; i += 1) {
    scored.push({
      record: {
        type: 'diary',
        date: `2026-08-0${i}`,
        mood_score: i <= 3 ? 8 : 4,
        tags: i <= 3 ? ['walk'] : []
      },
      path: String(i)
    });
  }
  const effects = factorEffects(diaryEntries(scored), sessionEntries([]), bounds);
  const walk = effects.find(e => e.key === 'walk');
  assert.equal(walk.effect, 4);
  assert.equal(walk.direction, 'positive');
});

test('consistencyRing counts unique mind dates in last 30 days and streak', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-09' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-10' }, path: 'b' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-10', theme: 'x' }, path: 's' }
  ]);
  const ring = consistencyRing(entries, sessions, '2026-08-10');
  assert.equal(ring.daysWithEntry, 2);
  assert.equal(ring.windowDays, 30);
  assert.equal(ring.streak, 2);
});

test('cadenceHits lists diary, Vera, and Penelope dates', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-09' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-10', source_agent: 'import' }, path: 'b' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-10', theme: 'x' }, path: 's' }
  ]);
  const hits = cadenceHits(entries, sessions);
  assert.deepEqual(hits.diary, ['2026-08-09', '2026-08-10']);
  assert.deepEqual(hits.vera, ['2026-08-10']);
  assert.deepEqual(hits.penelope, ['2026-08-09', '2026-08-10']);
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

test('moodTransitions counts consecutive primary moods', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood: 'low' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-02', mood: 'good' }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-03', mood: 'good' }, path: 'c' }
  ]);
  const flows = moodTransitions(entries, rangeWindow('2026-08-10', 'monthly'));
  assert.equal(flows.find(f => f.from === 'low' && f.to === 'good').count, 1);
  assert.equal(flows.find(f => f.from === 'good' && f.to === 'good').count, 1);
});

test('themeWeekly and themeRanks bucket by Sydney week start', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-03', tags: ['work', 'sleep'] }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-10', tags: ['work'] }, path: 'b' }
  ]);
  const weekly = themeWeekly(entries, sessionEntries([]), bounds, { limit: 8 });
  assert.ok(weekly.themes.includes('work'));
  const ranks = themeRanks(weekly);
  assert.equal(ranks[0].rankByTheme.work, 1);
});

test('lexicalSeries counts watchlist terms per week', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([{
    record: { type: 'diary', date: '2026-08-03' },
    body: 'I should be fine. I should rest.',
    path: 'a'
  }]);
  const series = lexicalSeries(entries, sessionEntries([]), bounds, ['should', 'flake']);
  const should = series.find(s => s.term === 'should');
  assert.equal(should.points.reduce((n, p) => n + p.count, 0), 2);
  assert.equal(series.find(s => s.term === 'flake').points.reduce((n, p) => n + p.count, 0), 0);
});

test('butterfly compares vera session themes to diary tags', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const rows = butterfly(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-01', tags: ['work'], mood_score: 6 }, path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-02', themes: ['work'], source_agent: 'vera', mood_at_open: 'low', mood_at_close: 'good' }, path: 's' }]),
    bounds
  );
  const work = rows.find(r => r.theme === 'work');
  assert.equal(work.veraCount, 1);
  assert.equal(work.penelopeCount, 1);
  assert.equal(work.veraDelta, 2);
});

test('resurfacing finds a theme older than seven days', () => {
  const card = resurfacing(
    diaryEntries([
      { record: { type: 'diary', date: '2026-07-01', tags: ['shame-loop'] }, body: 'Old mention.', path: 'old' },
      { record: { type: 'diary', date: '2026-08-10', tags: ['shame-loop'] }, body: 'Again today.', path: 'new' }
    ]),
    sessionEntries([]),
    '2026-08-10'
  );
  assert.equal(card.theme, 'shame-loop');
  assert.equal(card.priorDate, '2026-07-01');
  assert.match(card.excerpt, /Old mention/);
});

test('waffleEntries one cell per diary or session in range', () => {
  const bounds = rangeWindow('2026-08-10', 'weekly');
  const cells = waffleEntries(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-09', mood: 'low' }, path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-10', theme: 'x', mood_at_close: 'good' }, path: 's' }]),
    bounds
  );
  assert.equal(cells.length, 2);
});

test('parseInsightExtras reads tension and source session from body', () => {
  const extras = parseInsightExtras(`**Source session:** data/mind/2026/04/2026-04-07-the-filter.md
**Tension:** stated rule — actual behaviour
**Stated:** 0.2
**Revealed:** 0.75
The rest of the insight.`);
  assert.equal(extras.sourceSession, 'data/mind/2026/04/2026-04-07-the-filter.md');
  assert.equal(extras.tension.poleA, 'stated rule');
  assert.equal(extras.tension.poleB, 'actual behaviour');
  assert.equal(extras.tension.stated, 0.2);
  assert.equal(extras.tension.revealed, 0.75);
});

test('buildMindModel exposes launchers and analysis series', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-09', mood_score: 6, mood: 'good', tags: ['work'], source_agent: 'penelope' }, body: 'I should rest.', path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-10', title: 'Filter', themes: ['work'], mood_at_open: 'low', mood_at_close: 'good', source_agent: 'vera' }, path: 's' }
  ];
  const model = buildMindModel({
    events,
    date: '2026-08-10',
    range: 'monthly',
    governanceLogMarkdown: `## 2026-08-10 — Mind Insight
**Title:** Gap
**Tension:** stated — revealed
**Stated:** 0.2
**Revealed:** 0.8

Body here.
`,
    centralNodeMarkdown: ''
  });
  assert.equal(model.launchers.vera.title, 'Filter');
  assert.equal(model.launchers.penelope.daysAgo, 1);
  assert.ok(Array.isArray(model.factorEffects));
  assert.equal(model.consistency.windowDays, 30);
  assert.ok(model.themeNodes.length);
  assert.equal(model.tensions.length, 1);
  assert.equal(model.tensions[0].stated, 0.2);
  assert.ok(Array.isArray(model.waffle));
  assert.ok(Array.isArray(model.lexical));
  assert.equal(model.empty, false);
});

test('entriesForTheme lists diary and sessions newest last', () => {
  const rows = entriesForTheme(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-01', tags: ['work'] }, body: 'School day.', path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-10', themes: ['work'], title: 'Filter', insight: 'A filter.', theme: 'work' }, path: 's' }]),
    'work'
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-08-01');
  assert.match(rows[1].excerpt, /filter/i);
});

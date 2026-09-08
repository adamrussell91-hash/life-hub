import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedMindSessionPath,
  formatMindSessionToolResult,
  getMindSessionFromEvents,
  searchMindRecords
} from '../../netlify/functions/_shared/mind-session-read.mjs';

const SESSION = {
  record: {
    type: 'mind_session',
    date: '2026-08-26',
    id: 'mind_session-2026-08-26-5e2cc1',
    session_type: 'deep-dive',
    theme: 'fear of authority',
    insight: 'Nationals would not matter',
    observation: 'not enough twice',
    closing_question: 'what getting in trouble feels like in the body',
    cross_agent_note: 'Vera→Hammond: open with body question',
    themes: ['work stress', 'authority']
  },
  body: 'Session notes body',
  path: 'data/mind/2026/08/2026-08-26-session.md'
};

test('expectedMindSessionPath matches canonical session file', () => {
  assert.equal(
    expectedMindSessionPath('2026-08-26'),
    'data/mind/2026/08/2026-08-26-session.md'
  );
});

test('getMindSessionFromEvents returns found session with fields and body', () => {
  const result = getMindSessionFromEvents([SESSION], '2026-08-26');
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.id, 'mind_session-2026-08-26-5e2cc1');
  assert.equal(result.theme, 'fear of authority');
  assert.match(result.body, /Session notes/);
});

test('getMindSessionFromEvents returns not found with expected path', () => {
  const result = getMindSessionFromEvents([], '2026-08-26');
  assert.equal(result.found, false);
  assert.equal(result.expected_path, 'data/mind/2026/08/2026-08-26-session.md');
});

test('searchMindRecords full-matches multi-token session themes', () => {
  const result = searchMindRecords([SESSION], { query: 'fear authority', limit: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.results[0].match_kind, 'full');
  assert.equal(result.results[0].type, 'mind_session');
});

test('searchMindRecords rejects empty query', () => {
  assert.equal(searchMindRecords([], { query: '  ' }).ok, false);
});

test('formatMindSessionToolResult handles missing event', () => {
  const result = formatMindSessionToolResult(null, { date: '2026-08-01' });
  assert.equal(result.found, false);
  assert.match(result.expected_path, /2026-08-01-session\.md/);
});

test('Case A: feeling tired with both words is a full match', () => {
  const result = searchMindRecords([
    {
      record: { type: 'diary', date: '2026-08-18', notes: 'feeling tired after dinner', mood: 'tired', id: 'd1' },
      path: 'data/mind/d1.md'
    }
  ], { query: 'feeling tired' });
  assert.equal(result.count, 1);
  assert.equal(result.results[0].match_kind, 'full');
  assert.equal(result.partial_count, 0);
});

test('Case B: feeling only is not a full match', () => {
  const result = searchMindRecords([
    {
      record: { type: 'diary', date: '2026-08-18', notes: 'feeling hopeful after dinner', mood: 'hopeful', id: 'd2' },
      path: 'data/mind/d2.md'
    }
  ], { query: 'feeling tired' });
  assert.equal(result.count, 0);
  assert.equal(result.partial_count, 1);
  assert.equal(result.partial_results[0].match_kind, 'partial');
  assert.ok(result.partial_results[0].matched_token_count < result.partial_results[0].query_token_count);
});

test('Case C: tired only is not a full match', () => {
  const result = searchMindRecords([
    {
      record: { type: 'diary', date: '2026-08-18', notes: 'tired after dinner', mood: 'tired', id: 'd3' },
      path: 'data/mind/d3.md'
    }
  ], { query: 'feeling tired' });
  assert.equal(result.count, 0);
  assert.equal(result.partial_count, 1);
  assert.equal(result.partial_results[0].match_kind, 'partial');
});

test('Case D: only full matches appear in results for supported recurrence consumers', () => {
  const result = searchMindRecords([
    {
      record: { type: 'diary', date: '2026-08-18', notes: 'feeling tired after work', mood: 'tired', id: 'full' },
      path: 'data/mind/full.md'
    },
    {
      record: { type: 'diary', date: '2026-08-17', notes: 'feeling hopeful after dinner', mood: 'hopeful', id: 'partial' },
      path: 'data/mind/partial.md'
    }
  ], { query: 'feeling tired' });
  assert.equal(result.count, 1);
  assert.equal(result.results[0].id, 'full');
  assert.equal(result.partial_count, 1);
  assert.equal(result.partial_results[0].id, 'partial');
});

test('Case E: natural Vera query still retrieves work stress after focusing', () => {
  const result = searchMindRecords([
    {
      path: 'data/mind/2026-08-10-session.md',
      record: {
        type: 'session',
        date: '2026-08-10',
        id: 'sess_ws',
        themes: ['work stress'],
        notes: 'discussed work stress repeatedly'
      }
    }
  ], { query: 'what did I repeatedly discuss about work stress', record_types: ['mind_session'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.focused_tokens, ['work', 'stress']);
  assert.equal(result.count, 1);
  assert.equal(result.results[0].match_kind, 'full');
  assert.equal(result.results[0].id, 'sess_ws');
});

test('AND query across two single-token records yields partials only', () => {
  const result = searchMindRecords([
    SESSION,
    {
      record: { type: 'diary', date: '2026-08-25', mood: 'low', system_note: 'Tournament prep stress', id: 'd_tour' },
      path: 'data/mind/2026/08/2026-08-25-diary-2100.md'
    }
  ], { query: 'tournament authority', limit: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.ok(result.partial_count >= 2);
});

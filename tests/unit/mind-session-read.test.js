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
    cross_agent_note: 'Vera→Hammond: open with body question'
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

test('searchMindRecords matches session themes and diary metadata', () => {
  const result = searchMindRecords([
    SESSION,
    {
      record: { type: 'diary', date: '2026-08-25', mood: 'low', system_note: 'Tournament prep stress' },
      path: 'data/mind/2026/08/2026-08-25-diary-2100.md'
    }
  ], { query: 'tournament authority', limit: 5 });
  assert.equal(result.ok, true);
  assert.ok(result.count >= 1);
  assert.ok(result.results.some(hit => hit.type === 'mind_session'));
});

test('searchMindRecords rejects empty query', () => {
  assert.equal(searchMindRecords([], { query: '  ' }).ok, false);
});

test('formatMindSessionToolResult handles missing event', () => {
  const result = formatMindSessionToolResult(null, { date: '2026-08-01' });
  assert.equal(result.found, false);
  assert.match(result.expected_path, /2026-08-01-session\.md/);
});

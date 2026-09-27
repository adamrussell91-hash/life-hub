import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseLivePage } from '../../scripts/lib/notion-comms/live-page.mjs';

test('normaliseLivePage preserves direct dates, relations and Markdown blocks', () => {
  const page = normaliseLivePage({
    id: 'a'.repeat(32),
    properties: {
      'Meeting Title': 'Fixture review',
      'Meeting Type': 'Staff Meetings',
      'Communication Method': 'Video Call',
      'date:Date:start': '2026-09-02T01:00:00.000Z',
      'date:Date:end': '2026-09-02T02:00:00.000Z',
      'date:Date:is_datetime': 1,
      Attendees: ['https://app.notion.com/p/Sam-K-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
      'Follow-up Required': '__YES__'
    },
    body: '# Fixture review\n\n## Action Items\n- [ ] Sam to reply'
  }, { ['b'.repeat(32)]: 'Sam K.' });
  assert.equal(page.date.start, '2026-09-02T01:00:00.000Z');
  assert.equal(page.attendees[0].name, 'Sam K.');
  assert.equal(page.todos[0].heading, 'Action Items');
});

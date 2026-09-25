import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  calendarGhostFromToolInput,
  appendPendingCalendarGhost,
  parsePendingCalendarGhosts
} from '../../netlify/functions/calendar-ghosts.mjs';
import { proposeCalendarGhostSchema } from '../../netlify/functions/_shared/hammond-tools.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';

test('propose_calendar_ghost schema and capability for hammond, sara, clare', () => {
  resetCapabilityCaches();
  assert.equal(proposeCalendarGhostSchema().name, 'propose_calendar_ghost');
  for (const slug of ['hammond', 'sara', 'clare']) {
    assert.ok(capabilityIdsForAgent(slug).includes('publish.calendar-ghost'), slug);
    const tools = buildAgentTools({
      slug,
      needsHammondTools: slug === 'hammond',
      needsSaraMedicalTools: slug === 'sara',
      allowedTypes: slug === 'sara' ? ['medical'] : undefined
    });
    assert.ok(tools.some(tool => tool.name === 'propose_calendar_ghost'), slug);
  }
  assert.ok(!capabilityIdsForAgent('brisket').includes('publish.calendar-ghost'));
});

test('calendar ghost tool writes only the queue file', () => {
  const writes = [];
  const files = new Map([[PENDING_CALENDAR_GHOSTS_PATH, '[]']]);
  const client = {
    async resolveTree() {
      return {
        tree: [...files.keys()].map(path => ({ type: 'blob', path, sha: `sha-${path}` })),
        commitSha: 'c1',
        treeSha: 't1'
      };
    },
    async readBlob() {
      return Buffer.from(files.get(PENDING_CALENDAR_GHOSTS_PATH), 'utf8').toString('base64');
    },
    async writeFile({ path, content, message }) {
      writes.push({ path, message });
      files.set(path, content);
      return { sha: 'sha-next' };
    }
  };

  const entry = calendarGhostFromToolInput({
    kind: 'bedtime',
    date: '2026-09-24',
    time: '22:00',
    reason: '5.4 h last night'
  }, { agent: 'sara', nowIso: '2026-09-24T05:30:00+10:00' });

  assert.equal(entry.id, 'sara-bedtime-2026-09-24');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.via, 'chat');

  // Simulate the chat executeTools path without spinning the full handler.
  const prior = files.get(PENDING_CALENDAR_GHOSTS_PATH);
  const { content, added } = appendPendingCalendarGhost(prior, entry);
  assert.equal(added, true);
  void client.writeFile({
    path: PENDING_CALENDAR_GHOSTS_PATH,
    content,
    message: `chore(calendar): propose ${entry.id}`
  });

  assert.deepEqual(writes.map(w => w.path), [PENDING_CALENDAR_GHOSTS_PATH]);
  assert.equal(files.size, 1);
  assert.ok(!files.has('central-node.md'));
  assert.ok([...files.keys()].every(path => !path.startsWith('data/')));
  const queued = parsePendingCalendarGhosts(files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].id, 'sara-bedtime-2026-09-24');

  const again = appendPendingCalendarGhost(files.get(PENDING_CALENDAR_GHOSTS_PATH), entry);
  assert.equal(again.added, false);
});

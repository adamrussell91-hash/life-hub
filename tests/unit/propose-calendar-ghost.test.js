import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  calendarGhostFromToolInput,
  appendPendingCalendarGhost,
  parsePendingCalendarGhosts,
  calendarGhostConfirmProposal
} from '../../netlify/functions/calendar-ghosts.mjs';
import { proposeCalendarGhostSchema } from '../../netlify/functions/_shared/hammond-tools.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

const PERSONALITY_AGENTS = [
  'brisket', 'chadwick', 'hyaluronica', 'penelope', 'sara', 'vera',
  'hammond', 'ann', 'clementine', 'clare'
];

test('propose_calendar_ghost schema and capability for all personality agents', () => {
  resetCapabilityCaches();
  const schema = proposeCalendarGhostSchema();
  assert.equal(schema.name, 'propose_calendar_ghost');
  assert.ok(schema.input_schema.properties.kind.enum.includes('outing'));
  assert.ok(schema.input_schema.properties.kind.enum.includes('log_comm'));
  assert.ok(schema.input_schema.properties.kind.enum.includes('reschedule_block'));
  assert.match(schema.description, /Confirm/i);

  for (const slug of PERSONALITY_AGENTS) {
    assert.ok(capabilityIdsForAgent(slug).includes('publish.calendar-ghost'), slug);
    const tools = buildAgentTools({
      slug,
      needsHammondTools: slug === 'hammond',
      needsSaraMedicalTools: slug === 'sara',
      allowedTypes: slug === 'sara' ? ['medical'] : undefined
    });
    assert.ok(tools.some(tool => tool.name === 'propose_calendar_ghost'), slug);
  }
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

  assert.match(entry.id, /^sara-bedtime-2026-09-24-[a-f0-9]{8}$/);
  assert.equal(entry.status, 'pending');
  assert.equal(entry.via, 'chat');

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
  assert.equal(queued[0].id, entry.id);

  const again = appendPendingCalendarGhost(files.get(PENDING_CALENDAR_GHOSTS_PATH), entry);
  assert.equal(again.added, false);
});

test('outing ghost from any agent validates and builds Confirm proposal', () => {
  resetCapabilityCaches();
  for (const agent of ['clare', 'brisket', 'chadwick', 'clementine']) {
    const entry = calendarGhostFromToolInput({
      kind: 'outing',
      date: '2026-10-04',
      start: '09:00',
      end: '10:00',
      title: 'Breakfast at Cafe X'
    }, { agent, nowIso: '2026-10-03T12:00:00+10:00' });
    assert.equal(entry.kind, 'outing');
    const confirm = calendarGhostConfirmProposal(entry);
    const validated = validateProposeActionInput(confirm, { agentSlug: agent });
    assert.equal(validated.ok, true, `${agent}: ${validated.error}`);
  }
});

test('log_comm via propose_calendar_ghost still builds Confirm proposal', () => {
  resetCapabilityCaches();
  const entry = calendarGhostFromToolInput({
    kind: 'log_comm',
    direction: 'outbound',
    channel: 'email',
    date: '2026-10-03',
    subject: 'Emailed Kate',
    person_refs: ['shared:person:person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  assert.equal(entry.kind, 'log_comm');
  const validated = validateProposeActionInput(calendarGhostConfirmProposal(entry), { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeLogCommunicationSchema,
  buildLogCommGhostInput
} from '../../netlify/functions/_shared/log-comm-agent.mjs';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  calendarGhostFromToolInput,
  calendarGhostConfirmProposal,
  queueCalendarGhostDualPath,
  parsePendingCalendarGhosts
} from '../../netlify/functions/calendar-ghosts.mjs';
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

test('propose_log_communication schema and capability for all personality agents', () => {
  resetCapabilityCaches();
  const schema = proposeLogCommunicationSchema();
  assert.equal(schema.name, 'propose_log_communication');
  assert.match(schema.description, /search_people/i);
  assert.match(schema.description, /Confirm/i);
  assert.deepEqual(schema.input_schema.required, ['direction', 'channel', 'date']);
  assert.ok(schema.input_schema.properties.person_refs);
  assert.ok(schema.input_schema.properties.channel.enum.includes('email'));

  for (const slug of PERSONALITY_AGENTS) {
    assert.ok(capabilityIdsForAgent(slug).includes('comms.propose-log-communication'), slug);
    const tools = buildAgentTools({
      slug,
      needsHammondTools: slug === 'hammond',
      needsSaraMedicalTools: slug === 'sara',
      allowedTypes: slug === 'sara' ? ['medical'] : undefined
    });
    assert.ok(tools.some(tool => tool.name === 'propose_log_communication'), slug);
  }
});

test('buildLogCommGhostInput maps fields for calendarGhostFromToolInput kind log_comm', () => {
  const built = buildLogCommGhostInput({
    direction: 'outbound',
    channel: 'email',
    date: '2026-10-03',
    time: '14:30',
    subject: 'Re: marking',
    summary: 'Asked about due date',
    person_refs: ['shared:person:person_11111111-1111-1111-1111-111111111111'],
    reason: 'Adam said he emailed Kate',
    time_zone: 'Australia/Sydney'
  }, { agent: 'clare' });

  assert.equal(built.kind, 'log_comm');
  assert.equal(built.direction, 'outbound');
  assert.equal(built.channel, 'email');
  assert.equal(built.date, '2026-10-03');
  assert.equal(built.time, '14:30');
  assert.equal(built.title, 'Re: marking');
  assert.equal(built.subject, 'Re: marking');
  assert.equal(built.summary, 'Asked about due date');
  assert.deepEqual(built.person_refs, ['shared:person:person_11111111-1111-1111-1111-111111111111']);

  const entry = calendarGhostFromToolInput(built, {
    agent: 'clare',
    nowIso: '2026-10-03T12:00:00+10:00'
  });
  assert.equal(entry.kind, 'log_comm');
  assert.equal(entry.agent, 'clare');
  assert.equal(entry.status, 'pending');
});

test('buildLogCommGhostInput rejects bad direction/date/missing title', () => {
  assert.throws(
    () => buildLogCommGhostInput({ direction: 'sideways', channel: 'email', date: '2026-10-03', subject: 'x' }),
    /direction/
  );
  assert.throws(
    () => buildLogCommGhostInput({ direction: 'outbound', channel: 'email', date: '03-10-2026', subject: 'x' }),
    /date/
  );
  assert.throws(
    () => buildLogCommGhostInput({ direction: 'outbound', channel: 'email', date: '2026-10-03' }),
    /subject or title/
  );
});

test('propose_log_communication dual path queues ghost and Confirm proposal', async () => {
  resetCapabilityCaches();
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

  const ghostInput = buildLogCommGhostInput({
    direction: 'outbound',
    channel: 'email',
    date: '2026-10-03',
    subject: 'Emailed Kate',
    person_refs: ['shared:person:person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
  });
  const entry = calendarGhostFromToolInput({ ...ghostInput, kind: 'log_comm' }, {
    agent: 'ann',
    nowIso: '2026-10-03T09:00:00+10:00'
  });

  const events = [];
  const pending = [];
  const result = await queueCalendarGhostDualPath({
    client,
    entry,
    agentSlug: 'ann',
    proposeOsAction: async (proposal, extras) => {
      pending.push({ proposal, extras });
      return 'pending-log-1';
    },
    send: event => events.push(event),
    validateProposeActionInput
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'awaiting_confirm');
  assert.equal(result.ghost_status, 'queued');
  assert.equal(result.pendingId, 'pending-log-1');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, PENDING_CALENDAR_GHOSTS_PATH);
  const queued = parsePendingCalendarGhosts(files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(queued[0].kind, 'log_comm');
  assert.equal(events[0].type, 'calendar_ghost_proposed');
  assert.equal(pending[0].extras.calendarGhostId, entry.id);

  const confirm = calendarGhostConfirmProposal(entry);
  assert.equal(validateProposeActionInput(confirm, { agentSlug: 'ann' }).ok, true);
});

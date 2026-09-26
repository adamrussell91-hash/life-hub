import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { enqueueCalendarGhost } from '../../netlify/functions/_shared/calendar-ghost-queue.mjs';
import { applyProfessionalStep } from '../../netlify/functions/calendar-ghosts.mjs';

const ghost = {
  id: 'clare-book_comm-2026-10-21', agent: 'clare', kind: 'book_comm', date: '2026-10-21', time: '11:50', duration_min: 15,
  title: 'Declan J. · feedback', channel: 'in_person', time_zone: 'Australia/Sydney', purpose_tag: 'feedback',
  thread_ref: 'professional:thread:thread_00000000-0000-4000-8000-000000000001',
  person_refs: ['shared:person:p_declan'], reason: 'Weekly, same slot.'
};

test('book_comm validates and plans one professional step plus a recent action', () => {
  validateGhost(ghost);
  assert.throws(() => validateGhost({ ...ghost, time: '9am' }), /time HH:MM/);
  assert.throws(() => validateGhost({ ...ghost, person_refs: [] }), /person/);
  const plan = acceptPlan(ghost, { today: '2026-10-14' });
  const step = plan.steps.find((item) => item.target === 'professional');
  assert.deepEqual(step, {
    target: 'professional', action: 'create_communication', date: '2026-10-21', time: '11:50', duration_min: 15,
    time_zone: 'Australia/Sydney', title: 'Declan J. · feedback', channel: 'in_person', purpose_tag: 'feedback',
    thread_ref: ghost.thread_ref, person_refs: ghost.person_refs
  });
  assert.match(plan.receipt, /Clare → Calendar/);
});

test('applyProfessionalStep turns wall time into UTC and links people and thread', async () => {
  const created = [];
  await applyProfessionalStep(
    { createCommunication: async (input) => { created.push(input); return { communication: { id: 'communication_x' } }; }, createLink: async (link) => created.push(link) },
    acceptPlan(ghost, { today: '2026-10-14' }).steps.find((item) => item.target === 'professional')
  );
  assert.equal(created[0].scheduled_start, '2026-10-21T00:50:00.000Z');
  assert.equal(created[0].scheduled_end, '2026-10-21T01:05:00.000Z');
  assert.deepEqual(created[0].links, [{ relationship_type: 'recipient', target_ref: 'shared:person:p_declan' }]);
  assert.deepEqual(created[1], { source_ref: 'professional:communication:communication_x', target_ref: ghost.thread_ref, relationship_type: 'in_thread' });
});

test('enqueueCalendarGhost appends once through the GitHub client', async () => {
  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() { return { tree: [...files.keys()].map((path) => ({ path, type: 'blob', sha: path })) }; },
    async readBlob(sha) { return { content: Buffer.from(files.get(sha)).toString('base64'), encoding: 'base64' }; },
    async writeFile({ path, content }) { files.set(path, content); }
  };
  const decodeBlob = (blob) => Buffer.from(blob.content, 'base64').toString('utf8');
  const entry = { ...ghost, created_at: '2026-10-14T12:00:00+11:00', status: 'pending', via: 'clare-comms' };
  assert.equal((await enqueueCalendarGhost({ client, decodeBlob, entry })).added, true);
  assert.equal((await enqueueCalendarGhost({ client, decodeBlob, entry })).added, false);
  assert.equal(JSON.parse(files.get('pending-calendar-ghosts.json')).ghosts?.length ?? JSON.parse(files.get('pending-calendar-ghosts.json')).length, 1);
});

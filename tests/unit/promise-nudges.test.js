import test from 'node:test';
import assert from 'node:assert/strict';
import { latePromiseGhosts, runPromiseNudges, selectLatePromises } from '../../netlify/functions/_shared/promise-nudges.mjs';
import { createLedgerItemRepository } from '../../netlify/functions/_shared/ledger-repository.mjs';

const items = [
  { id: 'l1', direction: 'you_owe', status: 'open', due: '2026-09-22', text: 'Email Denielle the summary', person_ref: 'shared:person:p_denielle' },
  { id: 'l2', direction: 'you_owe', status: 'open', due: '2026-09-23', text: 'Seating list', person_ref: 'shared:person:vicki' },
  { id: 'l3', direction: 'they_owe', status: 'open', due: '2026-09-20', text: 'T4 dates', person_ref: 'shared:person:kathleen' },
  { id: 'l4', direction: 'you_owe', status: 'done', due: '2026-09-20', text: 'Done', person_ref: 'shared:person:amy' }
];

test('selectLatePromises keeps your open ones at least 2 days late', () => {
  assert.deepEqual(selectLatePromises(items, '2026-09-26', 2).map((item) => item.id), ['l1', 'l2']);
  assert.deepEqual(selectLatePromises(items, '2026-09-26', 4).map((item) => item.id), ['l1']);
});

test('latePromiseGhosts builds one draft_message ghost per promise, keyed by ledger id', () => {
  const ghosts = latePromiseGhosts(selectLatePromises(items, '2026-09-26', 2), { 'shared:person:p_denielle': 'Denielle J.', 'shared:person:vicki': 'Vicki Sheehan' }, '2026-09-26T07:00:00+10:00');
  assert.equal(ghosts[0].kind, 'draft_message');
  assert.equal(ghosts[0].to, 'Denielle J.');
  assert.match(ghosts[0].text, /summary/);
  assert.equal(ghosts[0].id, 'clare-nudge-l1');
  assert.match(ghosts[0].reason, /4 days late/);
});

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

test('runPromiseNudges queues one draft per late promise it finds', async () => {
  const store = memoryStore();
  const ledger = createLedgerItemRepository({ store, now: () => '2026-09-01T00:00:00.000Z' });
  await ledger.createItem({ person_ref: 'shared:person:p_denielle', direction: 'you_owe', text: 'Email the summary', due: '2026-09-22' });
  await ledger.createItem({ person_ref: 'shared:person:vicki', direction: 'you_owe', text: 'Seating list', due: '2026-09-23' });
  await ledger.createItem({ person_ref: 'shared:person:kathleen', direction: 'they_owe', text: 'T4 dates', due: '2026-09-20' });

  const queued = [];
  const result = await runPromiseNudges({
    env: {},
    now: new Date('2026-09-26T21:00:00.000Z'),
    deps: {
      getStore: async () => store,
      names: async () => ({ 'shared:person:p_denielle': 'Denielle J.', 'shared:person:vicki': 'Vicki Sheehan' }),
      enqueue: async (entry) => { queued.push(entry); return { added: true, id: entry.id }; }
    }
  });
  assert.deepEqual(result, { queued: 2 });
  assert.equal(queued.length, 2);
  assert.ok(queued.every((entry) => entry.kind === 'draft_message'));
});

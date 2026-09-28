import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleLinkProposalsHandler } from '../../netlify/functions/people-link-proposals.mjs';
import { memoryStore } from '../support/people-fixtures.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  {
    now: Date.parse('2026-09-17T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  },
  SECRET
).token;

function post(body) {
  return new Request('https://api.adam-russell.com/api/people/link-proposals', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

test('POST {action:infer} is not rejected as invalid_action (readJsonObject unwrap)', async () => {
  const universal = memoryStore();
  const professional = memoryStore();
  const tasks = memoryStore();
  const handler = createPeopleLinkProposalsHandler({
    env,
    getContentStore: async () => universal,
    getProfessionalStore: async () => professional,
    getTasksStore: async () => tasks,
    professionalStore: professional,
    tasksStore: tasks,
    peopleWithRelationships: [],
    selfPerson: {
      id: 'person_00000000-0000-4000-8000-000000000099',
      ref: 'shared:person:person_00000000-0000-4000-8000-000000000099',
      display_name: 'Adam Russell'
    },
    tasks: [],
    projects: [],
    events: [],
    proposalRepo: {
      listPendingByProposer: async () => [],
      listForPerson: async () => [],
      createProposal: async (proposal) => ({ created: true, proposal }),
      getById: async () => null,
      get: async () => null
    }
  });

  const response = await handler(post({ action: 'infer' }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.notEqual(payload?.error?.code, 'invalid_action');
  assert.equal(typeof payload.data.created, 'number');
});

test('POST without action still returns the invalid_action message', async () => {
  const universal = memoryStore();
  const professional = memoryStore();
  const handler = createPeopleLinkProposalsHandler({
    env,
    getContentStore: async () => universal,
    getProfessionalStore: async () => professional,
    professionalStore: professional
  });

  const response = await handler(post({}));
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'invalid_action');
  assert.equal(payload.error.message, 'action must be infer, accept, or decline.');
});

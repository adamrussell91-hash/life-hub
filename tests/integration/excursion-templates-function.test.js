import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createTemplatesHandler } from '../../netlify/functions/templates.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

function request({ url, method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://tasks-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('create_excursion_from_template schedules real admin tasks and key dates, not a bare project', async () => {
  const store = memoryStore();
  const handler = createTemplatesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const created = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/templates',
    body: {
      action: 'create_excursion_from_template',
      excursion_template_id: 'ext_excursion',
      title: 'Ethics State Round',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
    }
  }));
  assert.equal(created.status, 201);
  const { project, tasks } = (await created.json()).data;

  assert.equal(project.type, 'excursion');
  assert.equal(project.competition_or_event_type, 'ext_excursion');
  assert.equal(project.key_dates.risk_assessment_due, '2026-09-03');
  assert.equal(project.key_dates.permission_note_due, '2026-09-24');
  assert.equal(project.key_dates.staff_notification_due, '2026-09-24');
  assert.equal(project.key_dates.payment_due, '2026-09-17');
  assert.ok(project.drafted_documents.permission_note_draft.includes('Ethics State Round'));
  assert.ok(project.milestones.length > 0);

  assert.ok(tasks.length > 0);
  assert.equal(project.generated_admin_tasks.length, tasks.length);
  assert.ok(tasks.every((task) => task.parent_project_id === project.id));
  assert.ok(tasks.every((task) => task.source === 'auto_generated_from_excursion'));
  assert.ok(tasks.every((task) => typeof task.due_date === 'string'));
  const kinds = tasks.map((task) => task.tags.join(','));
  assert.ok(kinds.some((t) => t.includes('permission')));
  assert.ok(kinds.some((t) => t.includes('risk')));
  assert.ok(kinds.some((t) => t.includes('event')));
});

test('create_excursion_from_template rejects a missing/invalid event date', async () => {
  const store = memoryStore();
  const handler = createTemplatesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const rejected = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/templates',
    body: { action: 'create_excursion_from_template', title: 'No date' }
  }));
  assert.equal(rejected.status, 400);
});

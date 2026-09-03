import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAreasHandler } from '../../netlify/functions/areas.mjs';
import { createGoalsHandler } from '../../netlify/functions/goals.mjs';
import { createProjectsHandler } from '../../netlify/functions/projects.mjs';

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
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin = 'https://tasks-hub.adam-russell.com',
  url,
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('projects, areas, and goals use the Life session and share the Tasks store', async () => {
  const store = memoryStore();
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const createdArea = await createAreasHandler(deps)(
    request({ method: 'POST', url: 'https://api.adam-russell.com/api/areas', body: { title: 'Teaching' } })
  );
  assert.equal(createdArea.status, 201);
  const area = (await createdArea.json()).data;
  assert.match(area.id, /^area_/);

  const createdGoal = await createGoalsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/goals',
      body: { title: 'Marking load', parent_area_id: area.id }
    })
  );
  assert.equal(createdGoal.status, 201);
  const goal = (await createdGoal.json()).data;
  assert.equal(goal.parent_area_id, area.id);

  const createdProject = await createProjectsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/projects',
      body: { title: 'Term 3 marking', parent_goal_id: goal.id }
    })
  );
  assert.equal(createdProject.status, 201);
  const project = (await createdProject.json()).data;
  assert.match(project.id, /^proj_/);

  const listed = await createProjectsHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/projects' })
  );
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.projects[0].title, 'Term 3 marking');

  const patched = await createProjectsHandler(deps)(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/projects?id=${project.id}`,
      body: { status: 'stalled' }
    })
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).data.status, 'stalled');

  const removed = await createGoalsHandler(deps)(
    request({ method: 'DELETE', url: `https://api.adam-russell.com/api/goals?id=${goal.id}` })
  );
  assert.equal(removed.status, 200);
  assert.equal(await store.get(`goals/${goal.id}`, { type: 'json' }), null);

  const anon = await createAreasHandler(deps)(
    request({ cookie: false, method: 'POST', url: 'https://api.adam-russell.com/api/areas', body: { title: 'Nope' } })
  );
  assert.equal(anon.status, 401);
});

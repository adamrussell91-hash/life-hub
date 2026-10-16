import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAreasHandler } from '../../netlify/functions/areas.mjs';
import { createGoalsHandler } from '../../netlify/functions/goals.mjs';
import { createMapsHandler } from '../../netlify/functions/maps.mjs';
import { createProgramsHandler } from '../../netlify/functions/programs.mjs';
import { createProjectsHandler } from '../../netlify/functions/projects.mjs';
import { createTasksHandler } from '../../netlify/functions/tasks.mjs';

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
  assert.deepEqual(area.tags, []);

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
  // The Goals page reads goal.tags.length; a missing array crashes the whole view.
  assert.deepEqual(goal.tags, []);

  const taggedGoal = await createGoalsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/goals',
      body: { title: 'Tagged', tags: ['term-3', 42, ' ', 'marking'] }
    })
  );
  assert.deepEqual((await taggedGoal.json()).data.tags, ['term-3', 'marking']);

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
  assert.deepEqual(project.milestones, []);

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

test('programs and maps use the Life session and share the Tasks store', async () => {
  const store = memoryStore();
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const createdProgram = await createProgramsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/programs',
      body: { name: 'ICPC', types: ['Competition'], subjects: ['Coding'] }
    })
  );
  assert.equal(createdProgram.status, 201);
  const program = (await createdProgram.json()).data;
  assert.match(program.id, /^prog_/);
  assert.equal(program.name, 'ICPC');
  assert.equal(program.starts_on, null);
  assert.equal(program.ends_on, null);

  const dated = await createProgramsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/programs',
      body: { name: 'Econthon', starts_on: '2026-11-21', ends_on: '2026-11-22' }
    })
  );
  assert.equal(dated.status, 201);
  const datedProgram = (await dated.json()).data;
  assert.equal(datedProgram.starts_on, '2026-11-21');
  assert.equal(datedProgram.ends_on, '2026-11-22');

  const inverted = await createProgramsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/programs',
      body: { name: 'Inverted', starts_on: '2026-12-06', ends_on: '2026-12-05' }
    })
  );
  const invertedProgram = (await inverted.json()).data;
  assert.equal(invertedProgram.starts_on, null);
  assert.equal(invertedProgram.ends_on, null);

  const classified = await createProgramsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/programs',
      body: {
        name: 'Mock Trial',
        format: 'Simulation',
        provider: 'External',
        settings: ['Away', 'Home', 'Away'],
        entry: 'Team',
        entry_route: 'Nope'
      }
    })
  );
  const classifiedProgram = (await classified.json()).data;
  assert.equal(classifiedProgram.format, 'Simulation');
  assert.equal(classifiedProgram.provider, 'External');
  assert.deepEqual(classifiedProgram.settings, ['Away']);
  assert.equal(classifiedProgram.entry, 'Team');
  assert.equal(classifiedProgram.entry_route, null);

  const listedPrograms = await createProgramsHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/programs' })
  );
  assert.equal(listedPrograms.status, 200);
  assert.equal((await listedPrograms.json()).data.programs[0].name, 'ICPC');

  const createdMap = await createMapsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/maps',
      body: { title: 'Year 11 pathways', year: 2026 }
    })
  );
  assert.equal(createdMap.status, 201);
  const map = (await createdMap.json()).data;
  assert.match(map.id, /^map_/);
  assert.equal(map.year, 2026);

  const patched = await createMapsHandler(deps)(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/maps?id=${map.id}`,
      body: { title: 'Year 12 pathways' }
    })
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).data.title, 'Year 12 pathways');

  const removed = await createProgramsHandler(deps)(
    request({ method: 'DELETE', url: `https://api.adam-russell.com/api/programs?id=${program.id}` })
  );
  assert.equal(removed.status, 200);
  assert.equal(await store.get(`programs/${program.id}`, { type: 'json' }), null);

  const missingName = await createProgramsHandler(deps)(
    request({ method: 'POST', url: 'https://api.adam-russell.com/api/programs', body: { title: 'Nope' } })
  );
  assert.equal(missingName.status, 400);

  const anon = await createMapsHandler(deps)(
    request({ cookie: false, method: 'POST', url: 'https://api.adam-russell.com/api/maps', body: { title: 'Nope' } })
  );
  assert.equal(anon.status, 401);
});

test('Projects list returns stored records including milestones', async () => {
  const stored = {
    id: 'proj_1',
    title: 'Ethics Olympiad',
    status: 'active',
    type: 'excursion',
    milestones: [
      { id: 'ms_1', project_id: 'proj_1', title: 'Lodge risk', due_date: '2026-08-24', status: 'open' }
    ]
  };
  const handler = createProjectsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore({
      'projects/_index': ['proj_1'],
      'projects/proj_1': stored
    })
  });
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/projects' }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.projects, [stored]);
});

test('goals keep v2 fields on create and patch, and legacy goals list with defaults', async () => {
  const store = memoryStore({
    'goals/goal_legacy': {
      schema_version: 1, id: 'goal_legacy', title: 'Old', status: 'active',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    },
    'goals/_index': ['goal_legacy']
  });
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };

  const created = await createGoalsHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/goals',
    body: {
      title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch',
      frame: { floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: 3 } },
      lead_measure: { label: '1 write-up', per_week: 1 }, secret: 'dropped'
    }
  }));
  assert.equal(created.status, 201);
  const goal = (await created.json()).data;
  assert.equal(goal.sphere, 'professional');
  assert.equal(goal.frame.floor_target_stretch.target, 5);
  assert.deepEqual(goal.lead_measure, { label: '1 write-up', per_week: 1 });
  assert.equal('secret' in goal, false);

  const patched = await createGoalsHandler(deps)(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/goals?id=${goal.id}`,
    body: { rest_weeks: ['2026-11-09', 'bad'], sphere: 'nope' }
  }));
  const next = (await patched.json()).data;
  assert.deepEqual(next.rest_weeks, ['2026-11-09']);
  assert.equal(next.sphere, 'life');

  const listed = await createGoalsHandler(deps)(request({ url: 'https://api.adam-russell.com/api/goals' }));
  const legacy = (await listed.json()).data.goals.find(item => item.id === 'goal_legacy');
  assert.deepEqual(legacy.tags, []);
  assert.equal(legacy.structure, 'woop');
});

test('goals without sphere derive it from the parent area and write through on PATCH', async () => {
  const store = memoryStore({
    'areas/area_teach': {
      schema_version: 1, id: 'area_teach', title: 'Teaching',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    },
    'goals/goal_nosphere': {
      schema_version: 1, id: 'goal_nosphere', title: 'Unit plans', parent_area_id: 'area_teach',
      status: 'active',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    },
    'goals/_index': ['goal_nosphere']
  });
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };

  const got = await createGoalsHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/goals?id=goal_nosphere' })
  );
  assert.equal(got.status, 200);
  assert.equal((await got.json()).data.sphere, 'work');
  // Stored record still has no sphere until the next write.
  assert.equal('sphere' in (await store.get('goals/goal_nosphere', { type: 'json' })), false);

  const patched = await createGoalsHandler(deps)(request({
    method: 'PATCH',
    url: 'https://api.adam-russell.com/api/goals?id=goal_nosphere',
    body: { description: 'written through' }
  }));
  assert.equal(patched.status, 200);
  const next = (await patched.json()).data;
  assert.equal(next.sphere, 'work');
  assert.equal(next.description, 'written through');
  assert.equal((await store.get('goals/goal_nosphere', { type: 'json' })).sphere, 'work');
});

test('deleting a goal cascades links, reads and someday linked_goal_ids', async () => {
  const store = memoryStore({
    'goals/goal_x': {
      schema_version: 1, id: 'goal_x', title: 'X', status: 'active', sphere: 'life',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    },
    'goals/_index': ['goal_x'],
    'projects/p1': { id: 'p1', title: 'P', parent_goal_id: 'goal_x', updated_at: 'a' },
    'tasks/t1': { id: 't1', title: 'T', parent_goal_id: 'goal_x', updated_at: 'a' },
    'tasks/dream': {
      id: 'dream', title: 'Dream', bucket: 'someday', linked_goal_ids: ['goal_x'], updated_at: 'a'
    },
    'goal_reads/goal_x': { read: { goal_id: 'goal_x' }, dismissed: [] }
  });
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };
  const removed = await createGoalsHandler(deps)(
    request({ method: 'DELETE', url: 'https://api.adam-russell.com/api/goals?id=goal_x' })
  );
  assert.equal(removed.status, 200);
  assert.equal(await store.get('goals/goal_x', { type: 'json' }), null);
  assert.equal((await store.get('projects/p1', { type: 'json' })).parent_goal_id, null);
  assert.equal((await store.get('tasks/t1', { type: 'json' })).parent_goal_id, null);
  assert.deepEqual((await store.get('tasks/dream', { type: 'json' })).linked_goal_ids, []);
  assert.equal(await store.get('goal_reads/goal_x', { type: 'json' }), null);
});

test('tasks POST keeps parent_goal_id, steps and tags', async () => {
  const store = memoryStore();
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };
  const parent = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'Write up 6.3', domain: 'other', parent_goal_id: 'goal_ha', tags: ['apst', 4] }
  }))).json()).data;
  assert.equal(parent.parent_goal_id, 'goal_ha');
  assert.deepEqual(parent.tags, ['apst']);
  assert.equal(parent.kind, 'task');

  const step = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'Pull 3 examples', domain: 'other', kind: 'step', parent_task_id: parent.id, step_order: 1, parent_goal_id: 'goal_ha' }
  }))).json()).data;
  assert.equal(step.kind, 'step');
  assert.equal(step.parent_task_id, parent.id);
  assert.equal(step.step_order, 1);

  const orphan = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'No parent', domain: 'life', kind: 'step' }
  }))).json()).data;
  assert.equal(orphan.kind, 'task');
  assert.equal(orphan.parent_goal_id, null);
});

test('stored catalogue programs pick up catalogue dates until dates are saved on the record', async () => {
  const seeded = {
    schema_version: 1,
    id: 'prog_international-business-olympiad-ibo',
    name: 'International Business Olympiad (IBO)',
    created_at: '2026-06-16T13:00:00.000Z',
    updated_at: '2026-06-16T13:00:00.000Z'
  };
  const cleared = {
    ...seeded,
    id: 'prog_think-essay-prize-royal-institute-of-philosophy',
    name: 'Think Essay Prize',
    starts_on: null,
    ends_on: null
  };
  const store = memoryStore({ [`programs/${seeded.id}`]: seeded, [`programs/${cleared.id}`]: cleared });
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };

  const listed = (await (await createProgramsHandler(deps)(request({ url: 'https://api.adam-russell.com/api/programs' }))).json()).data.programs;
  const ibo = listed.find(item => item.id === seeded.id);
  assert.equal(ibo.starts_on, '2026-07-25');
  assert.equal(ibo.ends_on, '2026-08-14');
  const think = listed.find(item => item.id === cleared.id);
  assert.equal(think.ends_on, null);

  const created = (await (await createProgramsHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/programs',
    body: { name: 'Winter School', starts_on: '2026-07-06', ends_on: '2026-07-10', dates_source_url: ' https://example.org ', dates_checked_on: 'soon' }
  }))).json()).data;
  assert.equal(created.starts_on, '2026-07-06');
  assert.equal(created.ends_on, '2026-07-10');
  assert.equal(created.dates_source_url, 'https://example.org');
  assert.equal(created.dates_checked_on, null);
});

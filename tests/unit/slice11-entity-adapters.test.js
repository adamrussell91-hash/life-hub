import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  ENTITY_REF_KINDS,
  formatEntityRef,
  parseEntityRef
} from '../../netlify/functions/_shared/entity-ref.mjs';
import { resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import {
  validateRelationshipInput
} from '../../netlify/functions/_shared/relationship-registry.mjs';
import { programKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';

const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-08-01T01:00:00Z');
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 7) },
  SECRET
).token;

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const listPrefixes = [];
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      listPrefixes.push(prefix);
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    },
    _map: map,
    _listPrefixes: listPrefixes
  };
}

function authenticatedRequest(path) {
  return new Request(`https://api.adam-russell.com${path}`, {
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com'
    }
  });
}

const tasksContext = createAccessContext({ workflow: 'tasks' });
const teachingContext = createAccessContext({ workflow: 'teaching' });

test('Slice 11 registers Program and Lesson while deferring protected Class search and references', () => {
  assert.equal(ENTITY_REF_KINDS.tasks.has('program'), true);
  assert.equal(ENTITY_REF_KINDS.teaching.has('lesson'), true);
  assert.equal(ENTITY_REF_KINDS.teaching.has('class'), false);
  assert.deepEqual(parseEntityRef('tasks:program:prog_demo'), {
    namespace: 'tasks',
    kind: 'program',
    id: 'prog_demo'
  });
  assert.equal(parseEntityRef('teaching:class:class_12eng'), null);
  assert.equal(parseEntityRef('teaching:student_reference:student_1'), null);
});

test('Program resolver returns a safe canonical projection and hides raw fields', async () => {
  const store = memoryStore({
    [programKey('prog_tom')]: {
      id: 'prog_tom',
      name: 'Tournament of Minds',
      organiser: 'NSW DoE',
      secret_internal: 'never return'
    }
  });
  const projection = await resolveEntity('tasks:program:prog_tom', tasksContext, {
    getStore: async () => store
  });
  assert.equal(projection.display_label, 'Tournament of Minds');
  assert.equal(projection.supporting_label, 'NSW DoE');
  assert.equal(
    projection.href,
    'https://tasks-hub.adam-russell.com/#/programs?id=prog_tom'
  );
  assert.equal(JSON.stringify(projection).includes('never return'), false);
  await assert.rejects(
    () => resolveEntity('tasks:program:missing', tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('Lesson resolver projects safe fields and applies lifecycle treatment', async () => {
  const store = memoryStore({
    [draftLessonKey('lesson_active')]: {
      id: 'lesson_active',
      title: 'Poetry workshop',
      unit_id: 'unit_1',
      status: 'active',
      blocks: [{ text: 'student-facing body' }],
      homepage: { announcements: ['private'] }
    },
    [draftLessonKey('lesson_archived')]: {
      id: 'lesson_archived',
      title: 'Archived workshop',
      status: 'archived'
    },
    [draftLessonKey('lesson_trashed')]: {
      id: 'lesson_trashed',
      title: 'Trashed workshop',
      status: 'trashed'
    },
    [draftLessonKey('lesson_deleted')]: {
      id: 'lesson_deleted',
      title: 'Deleted workshop',
      status: 'deleted'
    }
  });
  const active = await resolveEntity('teaching:lesson:lesson_active', teachingContext, {
    getStore: async () => store
  });
  assert.equal(active.display_label, 'Poetry workshop');
  assert.equal(active.href, 'https://teaching-hub.adam-russell.com/lessons/lesson_active');
  assert.equal(JSON.stringify(active).includes('student-facing body'), false);
  assert.equal(JSON.stringify(active).includes('private'), false);

  const archived = await resolveEntity('teaching:lesson:lesson_archived', teachingContext, {
    getStore: async () => store
  });
  assert.equal(archived.lifecycle_status, 'archived');

  for (const id of ['lesson_trashed', 'lesson_deleted', 'missing']) {
    await assert.rejects(
      () => resolveEntity(`teaching:lesson:${id}`, teachingContext, { getStore: async () => store }),
      error => error.status === 404 && error.code === 'endpoint_not_found'
    );
  }

  const restricted = createAccessContext({
    workflow: 'teaching',
    allowedEntityKinds: ['unit']
  });
  await assert.rejects(
    () => resolveEntity('teaching:lesson:lesson_active', restricted, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('authenticated Program search uses programs/_index and returns its canonical href', async () => {
  const sharedStore = memoryStore();
  const tasksStore = memoryStore({
    'programs/_index': ['prog_tom', 'prog_other'],
    [programKey('prog_tom')]: {
      id: 'prog_tom',
      name: 'Tournament of Minds',
      organiser: 'NSW',
      secret_internal: 'never return'
    },
    [programKey('prog_other')]: {
      id: 'prog_other',
      name: 'Unrelated activity',
      organiser: 'Example'
    }
  });
  const handler = createEntitySearchHandler({
    env,
    now: () => NOW,
    getContentStore: async () => sharedStore,
    getTasksStore: async () => tasksStore,
    getProfessionalStore: async () => memoryStore()
  });
  const response = await handler(
    authenticatedRequest('/api/entities/search?q=Tour&kinds=program')
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.groups.program.length, 1);
  assert.deepEqual(body.data.groups.program[0], {
    ref: 'tasks:program:prog_tom',
    kind: 'program',
    display_label: 'Tournament of Minds',
    supporting_label: 'NSW',
    href: 'https://tasks-hub.adam-russell.com/#/programs?id=prog_tom',
    lifecycle_status: 'active',
    visibility: 'operator'
  });
  assert.deepEqual(tasksStore._listPrefixes, []);
  assert.equal(JSON.stringify(body).includes('never return'), false);
});

test('generic search rejects Lesson, Class, and StudentReference before Teaching storage access', async () => {
  const sharedStore = memoryStore();
  let teachingStoreAccessed = false;
  const handler = createEntitySearchHandler({
    env,
    now: () => NOW,
    getContentStore: async () => sharedStore,
    getTasksStore: async () => memoryStore(),
    getProfessionalStore: async () => memoryStore(),
    getTeachingStore: async () => {
      teachingStoreAccessed = true;
      return memoryStore();
    }
  });
  for (const kind of ['lesson', 'class', 'student_reference']) {
    const response = await handler(
      authenticatedRequest(`/api/entities/search?q=Poetry&kinds=${kind}`)
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_kind');
  }
  assert.equal(teachingStoreAccessed, false);
});

test('related_to permits Program and Lesson but rejects invalid shape', () => {
  const program = parseEntityRef('tasks:program:prog_tom');
  const lesson = parseEntityRef('teaching:lesson:lesson_active');
  assert.ok(program);
  assert.ok(lesson);
  const declaration = validateRelationshipInput({
    sourceRef: program,
    targetRef: lesson,
    relationshipType: 'related_to'
  });
  assert.equal(declaration.key, 'related_to');

  assert.throws(
    () => validateRelationshipInput({
      sourceRef: parseEntityRef('tasks:task:task_1'),
      targetRef: program,
      relationshipType: 'related_to'
    }),
    error => error.code === 'invalid_source_kind'
  );
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: program,
      targetRef: lesson,
      relationshipType: 'related_to',
      role: 'owner'
    }),
    error => error.code === 'role_not_permitted'
  );
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: program,
      targetRef: lesson,
      relationshipType: 'related_to',
      occurredAt: '2026-08-01T00:00:00.000Z'
    }),
    error => error.code === 'dates_on_timeless_relationship'
  );
});

test('malformed and deferred Slice 11 refs stay absent', () => {
  assert.equal(parseEntityRef('tasks:program:'), null);
  assert.equal(parseEntityRef('teaching:lesson:'), null);
  assert.equal(formatEntityRef({ namespace: 'tasks', kind: 'excursion', id: 'x' }), '');
  assert.equal(formatEntityRef({ namespace: 'teaching', kind: 'class', id: 'x' }), '');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProfessionalTaskLinkOperationRepository,
  deriveProfessionalTaskLinkOperationId,
  deriveProfessionalTaskLinkTaskId,
  MAX_TASK_LINKS_PER_TARGET,
  readPointerOperationIds
} from '../../netlify/functions/_shared/professional-task-link-operation.mjs';
import { createMeetingsHandler } from '../../netlify/functions/meetings.mjs';
import { createEventsHandler } from '../../netlify/functions/events.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { meetingKey, meetingIndexKey, eventKey, eventIndexKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) },
  SECRET
).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type, consistency } = {}) {
      if (key.startsWith('professional/task-link-operations/')) assert.equal(consistency, 'strong');
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? structuredClone(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

function request({ url, method = 'GET', body }) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

const CASES = [
  { relationshipType: 'preparation', targetRef: 'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa' },
  { relationshipType: 'follow_up', targetRef: 'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa' },
  { relationshipType: 'learning_for', targetRef: 'professional:event:event_00000000-0000-4000-8000-0000000000bb' },
  { relationshipType: 'application_action', targetRef: 'professional:application:application_alpha' }
];

async function resolveEntity(refInput) {
  const ref = String(refInput);
  const parts = ref.split(':');
  if (parts.length !== 3) {
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  }
  const [, kind, id] = parts;
  return {
    ref,
    kind,
    display_label: id,
    supporting_label: null,
    href: null,
    lifecycle_status: 'active',
    visibility: 'operator'
  };
}

function makeRepo({ professionalStore, tasksStore, getUniversalLinkStore, links }) {
  return createProfessionalTaskLinkOperationRepository({
    store: professionalStore,
    resolveEntity,
    getTasksStore: async () => tasksStore,
    getUniversalLinkStore,
    createUniversalLinkRepository: () => ({
      async getLink(id, _context, options) {
        assert.equal(options.consistency, 'strong');
        const link = links.find(link=>link.id===id && link.status==='current');
        if (!link) throw Object.assign(new Error('not found'),{code:'endpoint_not_found'});
        return link;
      },
      async createLink(input) {
        const existing = links.find(
          (row) =>
            row.source_ref === input.source_ref &&
            row.target_ref === input.target_ref &&
            row.relationship_type === input.relationship_type
        );
        if (existing) return { link: existing, created: false };
        const link = { id: `ul_${links.length + 1}`, ...input, status: 'current' };
        links.push(link);
        return { link, created: true };
      }
    }),
    now: () => '2026-08-01T12:00:00.000Z'
  });
}

function assertRepairContract(error, { targetRef, relationshipType, taskId = null }) {
  assert.equal(error.code, 'professional_task_link_incomplete');
  assert.equal(error.retryable, true);
  assert.equal(error.status, 503);
  assert.equal(typeof error.operation_id, 'string');
  assert.match(error.operation_id, /^ptl_/);
  assert.equal(typeof error.task_id, 'string');
  if (taskId) assert.equal(error.task_id, taskId);
  assert.equal(error.target_ref, targetRef);
  assert.equal(error.relationship_type, relationshipType);
  assert.deepEqual(error.completed_link_ids, []);
  assert.ok(Array.isArray(error.failed_intent_ids));
  assert.ok(error.failed_intent_ids.length >= 1);
}

for (const fixture of CASES) {
  test(`${fixture.relationshipType}: UL bind failure after new Task exposes repair contract; retry commits once`, async () => {
    const professionalStore = memoryStore();
    const tasksStore = memoryStore();
    const links = [];
    let storeAvailable = false;
    const repo = makeRepo({
      professionalStore,
      tasksStore,
      links,
      getUniversalLinkStore: async () => {
        if (!storeAvailable) {
          throw Object.assign(new Error('Universal Link store unavailable'), {
            code: 'universal_link_store_unavailable'
          });
        }
        return memoryStore();
      }
    });

    let captured;
    await assert.rejects(
      () =>
        repo.linkTask({
          targetRef: fixture.targetRef,
          relationshipType: fixture.relationshipType,
          title: `${fixture.relationshipType} task`
        }),
      (error) => {
        captured = error;
        assertRepairContract(error, fixture);
        return true;
      }
    );

    assert.equal([...tasksStore._map.keys()].filter((key) => key.startsWith('tasks/task')).length, 1);
    assert.equal(links.length, 0);
    assert.equal(captured.task_id, deriveProfessionalTaskLinkTaskId(captured.operation_id));

    storeAvailable = true;
    const retried = await repo.retry(captured.operation_id);
    assert.equal(retried.operation.status, 'committed');
    assert.equal(retried.operation.task_id, captured.task_id);
    assert.equal(links.length, 1);
    assert.equal(links[0].relationship_type, fixture.relationshipType);
    assert.equal(links[0].target_ref, fixture.targetRef);

    const again = await repo.retry(captured.operation_id);
    assert.equal(again.operation.status, 'committed');
    assert.equal(links.length, 1);
  });

  test(`${fixture.relationshipType}: UL bind failure with existing Task keeps one Task and exposes repair contract`, async () => {
    const professionalStore = memoryStore();
    const tasksStore = memoryStore();
    const existingTaskId = `task_existing_${fixture.relationshipType}`;
    await tasksStore.setJSON(taskKey(existingTaskId), {
      schema_version: 1,
      id: existingTaskId,
      title: 'Existing',
      kind: 'task',
      bucket: 'active',
      status: 'open',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });
    const links = [];
    let storeAvailable = false;
    const repo = makeRepo({
      professionalStore,
      tasksStore,
      links,
      getUniversalLinkStore: async () => {
        if (!storeAvailable) {
          throw Object.assign(new Error('Universal Link store unavailable'), {
            code: 'universal_link_store_unavailable'
          });
        }
        return memoryStore();
      }
    });

    let captured;
    await assert.rejects(
      () =>
        repo.linkTask({
          targetRef: fixture.targetRef,
          relationshipType: fixture.relationshipType,
          taskId: existingTaskId
        }),
      (error) => {
        captured = error;
        assertRepairContract(error, { ...fixture, taskId: existingTaskId });
        return true;
      }
    );
    assert.equal([...tasksStore._map.keys()].filter((key) => key.startsWith('tasks/task')).length, 1);

    storeAvailable = true;
    const retried = await repo.retry(captured.operation_id);
    assert.equal(retried.operation.status, 'committed');
    assert.equal(retried.operation.task_id, existingTaskId);
    assert.equal(links.length, 1);
    const again = await repo.retry(captured.operation_id);
    assert.equal(again.operation.status, 'committed');
    assert.equal(links.length, 1);
  });
}

test('Meetings handler preserves structured incomplete repair data for preparation', async () => {
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const meetingId = 'meeting_00000000-0000-4000-8000-0000000000aa';
  const meetingRecord = {
    schema_version: 1,
    id: meetingId,
    title: 'Alpha',
    scheduled_start: '2026-08-02T10:00:00.000Z',
    scheduled_end: '2026-08-02T11:00:00.000Z',
    time_zone: 'UTC',
    location_text: '',
    agenda: '',
    notes: '',
    state: 'scheduled',
    occurrence_history: [],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  };
  await professionalStore.setJSON(meetingKey(meetingId), meetingRecord);
  await professionalStore.setJSON(meetingIndexKey(meetingId), {
    id: meetingId,
    title: meetingRecord.title,
    state: meetingRecord.state,
    scheduled_start: meetingRecord.scheduled_start,
    updated_at: meetingRecord.updated_at
  });

  const handler = createMeetingsHandler({
    env,
    now: () => Date.parse('2026-08-01T12:00:00.000Z'),
    getContentStore: async () => professionalStore,
    getTasksStore: async () => tasksStore,
    getUniversalLinkStore: async () => {
      throw Object.assign(new Error('Universal Link store unavailable'), {
        code: 'universal_link_store_unavailable'
      });
    },
    resolveEntity,
    meetingNow: () => '2026-08-01T12:00:00.000Z'
  });

  const response = await handler(
    request({
      url: `https://life-hub.adam-russell.com/api/meetings?id=${meetingId}&action=link-task`,
      method: 'POST',
      body: { relationship_type: 'preparation', title: 'Prep notes' }
    })
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'professional_task_link_incomplete');
  assert.equal(payload.error.retryable, true);
  assert.equal(typeof payload.data.operation_id, 'string');
  assert.equal(typeof payload.data.task_id, 'string');
  assert.equal(payload.data.target_ref, `professional:meeting:${meetingId}`);
  assert.equal(payload.data.relationship_type, 'preparation');
  assert.deepEqual(payload.data.completed_link_ids, []);
  assert.ok(Array.isArray(payload.data.failed_intent_ids));
});

test('Events handler preserves structured incomplete repair data for learning_for', async () => {
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const eventId = 'event_00000000-0000-4000-8000-0000000000bb';
  const eventRecord = {
    schema_version: 1,
    id: eventId,
    title: 'Conference',
    event_type: 'professional_development',
    start: '2026-08-02T10:00:00.000Z',
    end: '2026-08-02T11:00:00.000Z',
    time_zone: 'UTC',
    all_day: false,
    occurrence_state: 'scheduled',
    location_text: null,
    accreditation_category: null,
    hours: null,
    attendance_state: null,
    certificate: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  };
  await professionalStore.setJSON(eventKey(eventId), eventRecord);
  await professionalStore.setJSON(eventIndexKey(eventId), {
    id: eventId,
    title: eventRecord.title,
    occurrence_state: eventRecord.occurrence_state,
    start: eventRecord.start,
    updated_at: eventRecord.updated_at
  });

  const handler = createEventsHandler({
    env,
    now: () => Date.parse('2026-08-01T12:00:00.000Z'),
    getContentStore: async () => professionalStore,
    getTasksStore: async () => tasksStore,
    getUniversalLinkStore: async () => {
      throw Object.assign(new Error('Universal Link store unavailable'), {
        code: 'universal_link_store_unavailable'
      });
    },
    resolveEntity,
    eventNow: () => '2026-08-01T12:00:00.000Z'
  });

  const response = await handler(
    request({
      url: `https://life-hub.adam-russell.com/api/events?id=${eventId}&action=link-task`,
      method: 'POST',
      body: { relationship_type: 'learning_for', title: 'Learning notes' }
    })
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'professional_task_link_incomplete');
  assert.equal(payload.error.retryable, true);
  assert.equal(payload.data.target_ref, `professional:event:${eventId}`);
  assert.equal(payload.data.relationship_type, 'learning_for');
  assert.equal(typeof payload.data.operation_id, 'string');
  assert.equal(typeof payload.data.task_id, 'string');
});

test('derive helpers stay stable for the same seed', () => {
  const operationId = deriveProfessionalTaskLinkOperationId([
    'task_link',
    'preparation',
    'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa',
    'Prep'
  ]);
  assert.equal(
    operationId,
    deriveProfessionalTaskLinkOperationId([
      'task_link',
      'preparation',
      'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa',
      'Prep'
    ])
  );
  assert.equal(
    deriveProfessionalTaskLinkTaskId(operationId),
    deriveProfessionalTaskLinkTaskId(operationId)
  );
});

test('readPointerOperationIds migrates singular operation_id', () => {
  assert.deepEqual(readPointerOperationIds(null), []);
  assert.deepEqual(readPointerOperationIds({ operation_id: 'ptl_a' }), ['ptl_a']);
  assert.deepEqual(readPointerOperationIds({ operation_ids: ['ptl_a', 'ptl_b', 'ptl_a'] }), [
    'ptl_a',
    'ptl_b'
  ]);
});

test('preparation accepts multiple existing tasks up to the cap; duplicate is a no-op', async () => {
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const links = [];
  const targetRef = 'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa';
  for (let i = 0; i < 3; i += 1) {
    const id = `task_multi_${i}`;
    await tasksStore.setJSON(taskKey(id), {
      schema_version: 1,
      id,
      title: `Task ${i}`,
      kind: 'task',
      bucket: 'active',
      status: 'open',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });
  }
  const repo = makeRepo({
    professionalStore,
    tasksStore,
    links,
    getUniversalLinkStore: async () => memoryStore()
  });

  for (let i = 0; i < 3; i += 1) {
    const result = await repo.linkTask({
      targetRef,
      relationshipType: 'preparation',
      taskId: `task_multi_${i}`
    });
    assert.equal(result.operation.status, 'committed');
  }
  const listed = await repo.listForTarget(targetRef, 'preparation');
  assert.equal(listed.length, 3);
  assert.equal(links.length, 3);

  const again = await repo.linkTask({
    targetRef,
    relationshipType: 'preparation',
    taskId: 'task_multi_1'
  });
  assert.equal(again.created, false);
  assert.equal((await repo.listForTarget(targetRef, 'preparation')).length, 3);
  assert.equal(links.length, 3);
});

test('preparation rejects an 11th distinct task with task_link_limit', async () => {
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const links = [];
  const targetRef = 'professional:meeting:meeting_00000000-0000-4000-8000-0000000000aa';
  const repo = makeRepo({
    professionalStore,
    tasksStore,
    links,
    getUniversalLinkStore: async () => memoryStore()
  });
  for (let i = 0; i < MAX_TASK_LINKS_PER_TARGET; i += 1) {
    const id = `task_cap_${i}`;
    await tasksStore.setJSON(taskKey(id), {
      schema_version: 1,
      id,
      title: `Cap ${i}`,
      kind: 'task',
      bucket: 'active',
      status: 'open',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });
    await repo.linkTask({ targetRef, relationshipType: 'preparation', taskId: id });
  }
  assert.equal((await repo.listForTarget(targetRef, 'preparation')).length, MAX_TASK_LINKS_PER_TARGET);

  const overflowId = 'task_cap_overflow';
  await tasksStore.setJSON(taskKey(overflowId), {
    schema_version: 1,
    id: overflowId,
    title: 'Overflow',
    kind: 'task',
    bucket: 'active',
    status: 'open',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  });
  await assert.rejects(
    () => repo.linkTask({ targetRef, relationshipType: 'preparation', taskId: overflowId }),
    (error) => {
      assert.equal(error.code, 'task_link_limit');
      assert.equal(error.status, 400);
      assert.equal(error.limit, MAX_TASK_LINKS_PER_TARGET);
      return true;
    }
  );
  // Removing a link frees a slot even though its repair journal stays stored.
  links[0].status = 'suppressed';
  const replacement = await repo.linkTask({targetRef, relationshipType:'preparation', taskId:overflowId});
  assert.equal(replacement.operation.status, 'committed');
  assert.equal(links.filter(link=>link.status==='current').length, MAX_TASK_LINKS_PER_TARGET);
  await assert.rejects(repo.linkTask({targetRef,relationshipType:'preparation',title:'One more'}),error=>error.code==='task_link_limit');

});

test('Meetings GET returns preparation_operations list', async () => {
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const meetingId = 'meeting_00000000-0000-4000-8000-0000000000aa';
  const meetingRecord = {
    schema_version: 1,
    id: meetingId,
    title: 'Alpha',
    scheduled_start: '2026-08-02T10:00:00.000Z',
    scheduled_end: '2026-08-02T11:00:00.000Z',
    time_zone: 'UTC',
    location_text: '',
    agenda: '',
    notes: '',
    state: 'scheduled',
    occurrence_history: [],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  };
  await professionalStore.setJSON(meetingKey(meetingId), meetingRecord);
  await professionalStore.setJSON(meetingIndexKey(meetingId), {
    id: meetingId,
    title: meetingRecord.title,
    state: meetingRecord.state,
    scheduled_start: meetingRecord.scheduled_start,
    updated_at: meetingRecord.updated_at
  });
  for (const id of ['task_a', 'task_b']) {
    await tasksStore.setJSON(taskKey(id), {
      schema_version: 1,
      id,
      title: id,
      kind: 'task',
      bucket: 'active',
      status: 'open',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });
  }
  const handler = createMeetingsHandler({
    env,
    now: () => Date.parse('2026-08-01T12:00:00.000Z'),
    getContentStore: async () => professionalStore,
    getTasksStore: async () => tasksStore,
    getUniversalLinkStore: async () => memoryStore(),
    resolveEntity,
    meetingNow: () => '2026-08-01T12:00:00.000Z'
  });
  for (const taskId of ['task_a', 'task_b']) {
    const linkRes = await handler(
      request({
        url: `https://life-hub.adam-russell.com/api/meetings?id=${meetingId}&action=link-task`,
        method: 'POST',
        body: { relationship_type: 'preparation', task_id: taskId }
      })
    );
    assert.equal(linkRes.status, 200);
  }
  const getRes = await handler(
    request({ url: `https://life-hub.adam-russell.com/api/meetings?id=${meetingId}` })
  );
  assert.equal(getRes.status, 200);
  const payload = await getRes.json();
  assert.equal(payload.data.meeting.preparation_operations.length, 2);
  assert.ok(payload.data.meeting.preparation_operation);
});

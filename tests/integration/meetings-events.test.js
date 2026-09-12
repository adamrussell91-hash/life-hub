import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createMeetingsHandler } from '../../netlify/functions/meetings.mjs';
import { createEventsHandler } from '../../netlify/functions/events.mjs';
import { createScheduleProjectionsHandler } from '../../netlify/functions/schedule-projections.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  resolveEvent,
  resolveMeeting,
  resolveOrganisation,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { meetingKey, eventKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { deriveProjectionId } from '../../netlify/functions/_shared/schedule-projection.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  {
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  },
  SECRET
).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    },
    _map: map
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url,
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function makeResolveEntity({ professionalStore, universalStore, tasksStore, knowledgePages = new Map() }) {
  return async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref?.namespace === 'professional' && ref.kind === 'meeting') {
      return resolveMeeting(ref.id, accessContext, { getStore: async () => professionalStore });
    }
    if (ref?.namespace === 'professional' && ref.kind === 'event') {
      return resolveEvent(ref.id, accessContext, { getStore: async () => professionalStore });
    }
    if (ref?.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { getStore: async () => universalStore });
    }
    if (ref?.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { getStore: async () => universalStore });
    }
    if (ref?.namespace === 'tasks' && ref.kind === 'task') {
      return resolveTask(ref.id, accessContext, { getStore: async () => tasksStore });
    }
    if (ref?.namespace === 'knowledge' && ref.kind === 'page') {
      const page = knowledgePages.get(ref.id);
      if (!page) {
        throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
      }
      return {
        ref: `knowledge:page:${ref.id}`,
        kind: 'page',
        display_label: page.title,
        supporting_label: null,
        href: null,
        lifecycle_status: 'active',
        visibility: 'operator'
      };
    }
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  };
}

test('meetings API rejects unauthenticated and disallowed origin', async () => {
  const professionalStore = memoryStore();
  const handler = createMeetingsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    meetingNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore
  });
  assert.equal((await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/meetings' }))).status, 401);
  assert.equal(
    (await handler(request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/meetings' }))).status,
    403
  );
});

test('Slice 9 acceptance path: meeting+event links, reschedule, calendar projections once, no IDs in JSON', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const tasksStore = memoryStore();
  const knowledgePages = new Map([['page_pd_notes', { title: 'PD reflection' }]]);

  const identity = createIdentityRepository({
    store: universalStore,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { ref: sethRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Seth Example' }
  });
  const { ref: orgRef } = await identity.createIdentity({
    kind: 'organisation',
    input: { display_name: 'UNSW' }
  });

  const prepTaskId = 'task_prep_seth';
  const followTaskId = 'task_follow_seth';
  const learnTaskId = 'task_learn_pd';
  for (const [id, title] of [
    [prepTaskId, 'Prep for Seth meeting'],
    [followTaskId, 'Follow up Seth meeting'],
    [learnTaskId, 'Apply PD learning']
  ]) {
    await tasksStore.setJSON(taskKey(id), {
      id,
      title,
      status: 'open',
      domain: 'work',
      priority: 'normal',
      kind: 'task'
    });
  }

  const resolveEntity = makeResolveEntity({
    professionalStore,
    universalStore,
    tasksStore,
    knowledgePages
  });

  const linkRepo = createUniversalLinkRepository({
    store: universalStore,
    resolveEntity,
    now: () => '2026-08-01T01:00:00.000Z'
  });

  const meetingsHandler = createMeetingsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    meetingNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo,
    generateId: () => 'meeting_00000000-0000-4000-8000-0000000000aa'
  });

  const eventsHandler = createEventsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    eventNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo,
    generateId: () => 'event_00000000-0000-4000-8000-0000000000bb'
  });

  const scheduleHandler = createScheduleProjectionsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    scheduleNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    resolveEntity
  });

  const access = createAccessContext({ workflow: 'life' });

  const createMeetingResponse = await meetingsHandler(
    request({
      url: 'https://api.adam-russell.com/api/meetings',
      method: 'POST',
      body: {
        title: 'Seth planning',
        scheduled_start: '2026-09-15T01:00:00.000Z',
        scheduled_end: '2026-09-15T02:00:00.000Z',
        time_zone: 'Australia/Sydney',
        links: [
          {
            target_ref: sethRef,
            relationship_type: 'attendee',
            role: 'chair',
            occurred_at: '2026-09-15T01:00:00.000Z'
          }
        ]
      }
    })
  );
  assert.equal(createMeetingResponse.status, 201);
  const meetingBody = await createMeetingResponse.json();
  const meeting = meetingBody.data.meeting;
  assert.equal(meeting.id, 'meeting_00000000-0000-4000-8000-0000000000aa');
  assert.equal(meeting.state, 'scheduled');
  for (const key of Object.keys(meeting)) {
    assert.equal(/id$|ids$|link/i.test(key) && !['id', 'schema_version'].includes(key) && key !== 'incomplete_links', false);
  }
  assert.equal('person_id' in meeting, false);
  assert.equal('attendee_ids' in meeting, false);
  assert.equal('links' in meeting, false);

  const meetingRef = `professional:meeting:${meeting.id}`;
  await linkRepo.createLink(
    {
      source_ref: `tasks:task:${prepTaskId}`,
      target_ref: meetingRef,
      relationship_type: 'preparation'
    },
    access
  );

  const rescheduleResponse = await meetingsHandler(
    request({
      url: `https://api.adam-russell.com/api/meetings?id=${meeting.id}&action=reschedule`,
      method: 'POST',
      body: {
        scheduled_start: '2026-09-16T01:00:00.000Z',
        scheduled_end: '2026-09-16T02:00:00.000Z',
        time_zone: 'Australia/Sydney',
        reason: 'Seth travel'
      }
    })
  );
  assert.equal(rescheduleResponse.status, 200);
  const rescheduled = (await rescheduleResponse.json()).data.meeting;
  assert.equal(rescheduled.state, 'rescheduled');
  assert.equal(rescheduled.occurrence_history.length, 1);
  assert.equal(rescheduled.occurrence_history[0].scheduled_start, '2026-09-15T01:00:00.000Z');
  assert.equal(rescheduled.scheduled_start, '2026-09-16T01:00:00.000Z');

  const completeResponse = await meetingsHandler(
    request({
      url: `https://api.adam-russell.com/api/meetings?id=${meeting.id}&action=complete`,
      method: 'POST'
    })
  );
  assert.equal(completeResponse.status, 200);
  assert.equal((await completeResponse.json()).data.meeting.state, 'completed');

  await linkRepo.createLink(
    {
      source_ref: `tasks:task:${followTaskId}`,
      target_ref: meetingRef,
      relationship_type: 'follow_up'
    },
    access
  );

  const createEventResponse = await eventsHandler(
    request({
      url: 'https://api.adam-russell.com/api/events',
      method: 'POST',
      body: {
        title: 'Gifted education PD',
        event_type: 'professional_development',
        start: '2026-10-01T00:00:00.000Z',
        end: '2026-10-01T06:00:00.000Z',
        time_zone: 'Australia/Sydney',
        hours: 5,
        accreditation_category: 'NESA',
        attendance_state: 'registered',
        links: [
          { target_ref: orgRef, relationship_type: 'provider' },
          { target_ref: 'knowledge:page:page_pd_notes', relationship_type: 'related_to' }
        ]
      }
    })
  );
  assert.equal(createEventResponse.status, 201);
  const event = (await createEventResponse.json()).data.event;
  assert.equal(event.hours, 5);
  assert.equal('organisation_id' in event, false);
  assert.equal('provider_id' in event, false);
  assert.equal('page_id' in event, false);
  assert.equal('links' in event, false);

  const eventRef = `professional:event:${event.id}`;
  await linkRepo.createLink(
    {
      source_ref: `tasks:task:${learnTaskId}`,
      target_ref: eventRef,
      relationship_type: 'learning_for'
    },
    access
  );

  const storedMeeting = await professionalStore.get(meetingKey(meeting.id), { type: 'json' });
  const storedEvent = await professionalStore.get(eventKey(event.id), { type: 'json' });
  assert.equal(JSON.stringify(storedMeeting).includes(sethRef), false);
  assert.equal(JSON.stringify(storedMeeting).includes(prepTaskId), false);
  assert.equal(JSON.stringify(storedEvent).includes(orgRef), false);
  assert.equal(JSON.stringify(storedEvent).includes('page_pd_notes'), false);

  const scheduleResponse = await scheduleHandler(
    request({ url: 'https://api.adam-russell.com/api/schedule-projections' })
  );
  assert.equal(scheduleResponse.status, 200);
  const projections = (await scheduleResponse.json()).data.projections;
  assert.equal(projections.length, 2);
  const meetingProj = projections.find((p) => p.kind === 'meeting');
  const eventProj = projections.find((p) => p.kind === 'event');
  assert.ok(meetingProj);
  assert.ok(eventProj);
  assert.equal(meetingProj.projection_id, deriveProjectionId(meetingRef));
  assert.equal(eventProj.projection_id, deriveProjectionId(eventRef));
  assert.equal(projections.filter((p) => p.projection_id === meetingProj.projection_id).length, 1);

  const meetingLinks = await linkRepo.listForEntity(meetingRef, access);
  const eventLinks = await linkRepo.listForEntity(eventRef, access);
  const personLinks = await linkRepo.listForEntity(sethRef, access);
  const orgLinks = await linkRepo.listForEntity(orgRef, access);

  assert.ok(
    [...meetingLinks.outgoing, ...meetingLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'attendee' && entry.link.role === 'chair'
    )
  );
  assert.ok(
    [...meetingLinks.outgoing, ...meetingLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'preparation'
    )
  );
  assert.ok(
    [...meetingLinks.outgoing, ...meetingLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'follow_up'
    )
  );
  assert.ok(
    [...eventLinks.outgoing, ...eventLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'provider'
    )
  );
  assert.ok(
    [...eventLinks.outgoing, ...eventLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'related_to'
    )
  );
  assert.ok(
    [...eventLinks.outgoing, ...eventLinks.incoming].some(
      (entry) => entry.link.relationship_type === 'learning_for'
    )
  );
  assert.ok(
    [...personLinks.outgoing, ...personLinks.incoming].some(
      (entry) => entry.link.source_ref === meetingRef
    )
  );
  assert.ok(
    [...orgLinks.outgoing, ...orgLinks.incoming].some((entry) => entry.link.source_ref === eventRef)
  );
});

test('meeting partial link write is fail-visible and retryable', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const identity = createIdentityRepository({
    store: universalStore,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { ref: sethRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Seth Example' }
  });

  let failOnce = true;
  const resolveEntity = makeResolveEntity({
    professionalStore,
    universalStore,
    tasksStore: memoryStore()
  });

  const handler = createMeetingsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    meetingNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    resolveEntity,
    createUniversalLinkRepository: () => ({
      createLink: async () => {
        if (failOnce) {
          failOnce = false;
          throw Object.assign(new Error('boom'), { code: 'link_write_failed' });
        }
        return { link: { id: 'ul_recovered' }, created: true };
      },
      getLink: async (id) => ({ link: { id } })
    }),
    generateId: () => 'meeting_00000000-0000-4000-8000-0000000000cc'
  });

  const createResponse = await handler(
    request({
      url: 'https://api.adam-russell.com/api/meetings',
      method: 'POST',
      body: {
        title: 'Partial',
        scheduled_start: '2026-09-15T01:00:00.000Z',
        scheduled_end: '2026-09-15T02:00:00.000Z',
        time_zone: 'Australia/Sydney',
        links: [
          {
            target_ref: sethRef,
            relationship_type: 'attendee',
            occurred_at: '2026-09-15T01:00:00.000Z'
          }
        ]
      }
    })
  );
  assert.equal(createResponse.status, 503);
  const errorBody = await createResponse.json();
  assert.equal(errorBody.error.code, 'meeting_links_incomplete');
  assert.equal(errorBody.error.retryable, true);
  assert.ok(professionalStore._map.has(meetingKey('meeting_00000000-0000-4000-8000-0000000000cc')));

  const retry = await handler(
    request({
      url: 'https://api.adam-russell.com/api/meetings?id=meeting_00000000-0000-4000-8000-0000000000cc&action=retry-links',
      method: 'POST'
    })
  );
  assert.equal(retry.status, 200);
});

test('hidden endpoint resolution for unknown meeting id matches missing shape', async () => {
  const professionalStore = memoryStore();
  const access = createAccessContext({ workflow: 'life' });
  await assert.rejects(
    () =>
      resolveMeeting('meeting_00000000-0000-4000-8000-000000009999', access, {
        getStore: async () => professionalStore
      }),
    (error) => error.status === 404 && error.code === 'endpoint_not_found'
  );
  await assert.rejects(
    () =>
      resolveMeeting('not-a-meeting-id', access, {
        getStore: async () => professionalStore
      }),
    (error) => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createApplicationsHandler } from '../../netlify/functions/applications.mjs';
import { createCareerHandler } from '../../netlify/functions/career.mjs';
import { createEventsHandler } from '../../netlify/functions/events.mjs';
import { createEntityOverviewHandler } from '../../netlify/functions/entity-overview.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  resolveApplication,
  resolveEvent,
  resolveOrganisation,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { applicationKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';

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

const APPLICATION_ID = 'application_00000000-0000-4000-8000-0000000000aa';
const EVENT_ID = 'event_00000000-0000-4000-8000-0000000000bb';

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
    if (ref?.namespace === 'professional' && ref.kind === 'application') {
      return resolveApplication(ref.id, accessContext, { getStore: async () => professionalStore });
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

test('applications API rejects unauthenticated and disallowed origin', async () => {
  const professionalStore = memoryStore();
  const handler = createApplicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    applicationNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore
  });
  assert.equal(
    (await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/applications' }))).status,
    401
  );
  assert.equal(
    (
      await handler(
        request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/applications' })
      )
    ).status,
    403
  );
});

test('career API rejects unauthenticated and disallowed origin', async () => {
  const professionalStore = memoryStore();
  const handler = createCareerHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    careerNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore
  });
  assert.equal(
    (await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/career' }))).status,
    401
  );
  assert.equal(
    (
      await handler(
        request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/career' })
      )
    ).status,
    403
  );
});

test('Slice 10 acceptance: application links, docs, task, interview, pipeline, career, no IDs in JSON', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const tasksStore = memoryStore();
  const knowledgePages = new Map([['page_app_notes', { title: 'Application notes' }]]);

  const identity = createIdentityRepository({
    store: universalStore,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { ref: orgRef } = await identity.createIdentity({
    kind: 'organisation',
    input: { display_name: 'St Example College' }
  });
  const { ref: contactRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Hiring Contact' }
  });
  const { ref: refereeRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Referee Person' }
  });
  const { ref: selfRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Adam Self', is_self: true }
  });

  const actionTaskId = 'task_app_action_1';
  await tasksStore.setJSON(taskKey(actionTaskId), {
    id: actionTaskId,
    title: 'Draft selection criteria',
    status: 'open',
    domain: 'work',
    priority: 'normal',
    kind: 'task'
  });

  const resolveEntity = makeResolveEntity({
    professionalStore,
    universalStore,
    tasksStore,
    knowledgePages
  });
  const access = createAccessContext({ workflow: 'life' });
  const linkRepo = createUniversalLinkRepository({
    store: universalStore,
    resolveEntity,
    now: () => '2026-08-01T01:00:00.000Z'
  });

  await linkRepo.createLink(
    {
      source_ref: selfRef,
      target_ref: orgRef,
      relationship_type: 'employee_at',
      role: 'teacher',
      valid_from: '2020-01-01T00:00:00.000Z',
      valid_to: null,
      metadata: {}
    },
    access
  );

  const applicationsHandler = createApplicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    applicationNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    getTasksStore: async () => tasksStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo,
    generateId: () => APPLICATION_ID
  });

  const eventsHandler = createEventsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    eventNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    getTasksStore: async () => tasksStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo,
    generateId: () => EVENT_ID
  });

  const overviewHandler = createEntityOverviewHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => universalStore,
    resolveEntity,
    createRepository: () => linkRepo
  });

  const careerHandler = createCareerHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    careerNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo
  });

  const createResponse = await applicationsHandler(
    request({
      url: 'https://api.adam-russell.com/api/applications',
      method: 'POST',
      body: {
        position_title: 'Gifted Education Teacher',
        advertisement: {
          title: 'Gifted Education Teacher',
          url: 'https://example.com/jobs/gifted',
          source: 'IWorkForNSW',
          summary: null,
          captured_at: '2026-08-01T00:00:00.000Z'
        },
        closing_date: '2026-09-30',
        links: [
          { target_ref: orgRef, relationship_type: 'applies_to' },
          { target_ref: contactRef, relationship_type: 'application_contact' },
          { target_ref: refereeRef, relationship_type: 'referee', role: 'professional' },
          { target_ref: 'knowledge:page:page_app_notes', relationship_type: 'related_to' }
        ]
      }
    })
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  const application = created.data.application;
  assert.equal(application.id, APPLICATION_ID);
  assert.equal(application.pipeline_status, 'drafting');
  assert.equal('organisation_id' in application, false);
  assert.equal('person_id' in application, false);
  assert.equal('task_id' in application, false);
  assert.equal('page_id' in application, false);
  assert.equal('links' in application, false);

  const applicationRef = `professional:application:${APPLICATION_ID}`;

  const patchDocs = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}`,
      method: 'PATCH',
      body: {
        advertisement: { summary: 'Updated summary only' },
        documents: [
          {
            id: 'adoc_00000000-0000-4000-8000-000000000011',
            document_type: 'resume',
            label: 'Resume v1',
            url: null,
            storage_ref: 'blob:resume-v1',
            version: '1',
            status: 'draft'
          },
          {
            id: 'adoc_00000000-0000-4000-8000-0000000000a2',
            document_type: 'cover_letter',
            label: 'Cover',
            url: 'https://example.com/cover.pdf',
            storage_ref: null,
            version: '1',
            status: 'final'
          }
        ],
        selection_criteria: [
          {
            id: 'acrit_00000000-0000-4000-8000-0000000000b1',
            criterion: 'Demonstrated teaching excellence',
            response: 'Draft response',
            order: 0,
            completed: false
          }
        ]
      }
    })
  );
  assert.equal(patchDocs.status, 200);
  const afterDocs = (await patchDocs.json()).data.application;
  assert.equal(afterDocs.advertisement.title, 'Gifted Education Teacher');
  assert.equal(afterDocs.advertisement.summary, 'Updated summary only');
  assert.equal(afterDocs.documents.length, 2);
  assert.equal(afterDocs.selection_criteria.length, 1);

  const linkTask = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}&action=link-task`,
      method: 'POST',
      body: { relationship_type: 'application_action', task_id: actionTaskId }
    })
  );
  assert.equal(linkTask.status, 200);
  assert.equal((await linkTask.json()).data.operation.status, 'committed');

  for (const status of ['ready', 'submitted', 'under_review', 'interviewing']) {
    const transition = await applicationsHandler(
      request({
        url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}&action=transition`,
        method: 'POST',
        body: { pipeline_status: status }
      })
    );
    assert.equal(transition.status, 200, `transition to ${status}`);
    assert.equal((await transition.json()).data.application.pipeline_status, status);
  }

  const patchInterview = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}`,
      method: 'PATCH',
      body: {
        interview_rounds: [
          {
            id: 'aint_00000000-0000-4000-8000-0000000000c1',
            scheduled_at: '2026-10-10T01:00:00.000Z',
            time_zone: 'Australia/Sydney',
            format: 'video',
            location_text: null,
            preparation_notes: 'Prep panel pack',
            panel_notes: 'Strong pedagogy answers',
            result: 'advanced',
            lifecycle_state: 'completed'
          }
        ]
      }
    })
  );
  assert.equal(patchInterview.status, 200);
  assert.equal(
    (await patchInterview.json()).data.application.interview_rounds[0].lifecycle_state,
    'completed'
  );

  const offer = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}&action=transition`,
      method: 'POST',
      body: { pipeline_status: 'offer' }
    })
  );
  assert.equal(offer.status, 200);

  const outcomePatch = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}`,
      method: 'PATCH',
      body: {
        outcome: {
          status: 'offer',
          date: '2026-10-20',
          offer_details: '1.0 FTE ongoing',
          reason: null
        },
        reflection: 'Strong panel; accepted after visiting campus.'
      }
    })
  );
  assert.equal(outcomePatch.status, 200);
  const finalApp = (await outcomePatch.json()).data.application;
  assert.equal(finalApp.outcome.status, 'offer');
  assert.ok(finalApp.reflection.includes('Strong panel'));

  const accept = await applicationsHandler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${APPLICATION_ID}&action=transition`,
      method: 'POST',
      body: { pipeline_status: 'accepted' }
    })
  );
  assert.equal(accept.status, 200);
  assert.equal((await accept.json()).data.application.pipeline_status, 'accepted');

  const stored = await professionalStore.get(applicationKey(APPLICATION_ID), { type: 'json' });
  const storedJson = JSON.stringify(stored);
  assert.equal(storedJson.includes(orgRef), false);
  assert.equal(storedJson.includes(contactRef), false);
  assert.equal(storedJson.includes(refereeRef), false);
  assert.equal(storedJson.includes(actionTaskId), false);
  assert.equal(storedJson.includes('page_app_notes'), false);
  assert.equal('organisation_id' in stored, false);
  assert.equal('links' in stored, false);

  for (const ref of [orgRef, contactRef, refereeRef]) {
    const overviewResponse = await overviewHandler(
      request({
        url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(ref)}`
      })
    );
    assert.equal(overviewResponse.status, 200);
    const overview = (await overviewResponse.json()).data;
    assert.ok(
      overview.linked_records.applications.some((item) => item.ref === applicationRef),
      `overview for ${ref} should include application`
    );
  }

  const pdEvent = await eventsHandler(
    request({
      url: 'https://api.adam-russell.com/api/events',
      method: 'POST',
      body: {
        title: 'NESA gifted PD',
        event_type: 'professional_development',
        start: '2026-07-01T00:00:00.000Z',
        end: '2026-07-01T06:00:00.000Z',
        time_zone: 'Australia/Sydney',
        hours: 5,
        accreditation_category: 'NESA',
        attendance_state: 'attended'
      }
    })
  );
  assert.equal(pdEvent.status, 201);

  const careerResponse = await careerHandler(
    request({ url: 'https://api.adam-russell.com/api/career' })
  );
  assert.equal(careerResponse.status, 200);
  const career = (await careerResponse.json()).data;
  assert.equal(career.applications.status, 'ok');
  assert.ok(career.applications.items.some((item) => item.id === APPLICATION_ID));
  assert.ok(!('documents' in career.applications.items[0]));
  assert.equal(career.employment.status, 'ok');
  assert.ok(career.employment.items.some((item) => item.ref === orgRef));
  assert.equal(career.professional_development.status, 'ok');
  assert.ok(career.professional_development.items.some((item) => item.id === EVENT_ID));
  assert.equal(career.organisations.status, 'ok');
  assert.ok(career.organisations.items.some((item) => item.ref === orgRef));
  assert.equal(career.people.status, 'ok');
  assert.deepEqual(career.deferred, ['publication', 'presentation']);

  const appLinks = await linkRepo.listForEntity(applicationRef, access);
  assert.ok(
    [...appLinks.outgoing, ...appLinks.incoming].some((e) => e.link.relationship_type === 'applies_to')
  );
  assert.ok(
    [...appLinks.outgoing, ...appLinks.incoming].some(
      (e) => e.link.relationship_type === 'application_contact'
    )
  );
  assert.ok(
    [...appLinks.outgoing, ...appLinks.incoming].some((e) => e.link.relationship_type === 'referee')
  );
  assert.ok(
    [...appLinks.outgoing, ...appLinks.incoming].some((e) => e.link.relationship_type === 'application_action')
  );
});

test('application partial link write is fail-visible and retryable without duplicates', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const identity = createIdentityRepository({
    store: universalStore,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { ref: orgRef } = await identity.createIdentity({
    kind: 'organisation',
    input: { display_name: 'Retry Org' }
  });

  let failOnce = true;
  const resolveEntity = makeResolveEntity({
    professionalStore,
    universalStore,
    tasksStore: memoryStore()
  });

  const handler = createApplicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    applicationNow: () => '2026-08-01T01:00:00.000Z',
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
    generateId: () => 'application_00000000-0000-4000-8000-0000000000cc'
  });

  const createResponse = await handler(
    request({
      url: 'https://api.adam-russell.com/api/applications',
      method: 'POST',
      body: {
        position_title: 'Partial',
        links: [{ target_ref: orgRef, relationship_type: 'applies_to' }]
      }
    })
  );
  assert.equal(createResponse.status, 503);
  const errorBody = await createResponse.json();
  assert.equal(errorBody.error.code, 'application_links_incomplete');
  assert.equal(errorBody.error.retryable, true);
  assert.ok(
    professionalStore._map.has(applicationKey('application_00000000-0000-4000-8000-0000000000cc'))
  );

  const retry = await handler(
    request({
      url: 'https://api.adam-russell.com/api/applications?id=application_00000000-0000-4000-8000-0000000000cc&action=retry-links',
      method: 'POST'
    })
  );
  assert.equal(retry.status, 200);
  const retried = await retry.json();
  assert.equal(retried.data.retried, true);
  assert.equal(retried.data.links.length, 1);
});

test('hidden endpoint resolution for unknown application id matches missing shape', async () => {
  const professionalStore = memoryStore();
  const access = createAccessContext({ workflow: 'life' });
  await assert.rejects(
    () =>
      resolveApplication('application_00000000-0000-4000-8000-000000009999', access, {
        getStore: async () => professionalStore
      }),
    (error) => error.status === 404 && error.code === 'endpoint_not_found'
  );
  await assert.rejects(
    () =>
      resolveApplication('not-an-application-id', access, {
        getStore: async () => professionalStore
      }),
    (error) => error.status === 404 && error.code === 'endpoint_not_found'
  );
});


test('dual-organisation career regression: employment org and application-only org both appear for correct reasons', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const tasksStore = memoryStore();
  const identity = createIdentityRepository({
    store: universalStore,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { ref: employmentOrgRef } = await identity.createIdentity({
    kind: 'organisation',
    input: { display_name: 'Current Employer College' }
  });
  const { ref: applicationOrgRef } = await identity.createIdentity({
    kind: 'organisation',
    input: { display_name: 'Application Only Academy' }
  });
  const { ref: selfRef } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: 'Adam Self', is_self: true }
  });

  const resolveEntity = makeResolveEntity({
    professionalStore,
    universalStore,
    tasksStore
  });
  const access = createAccessContext({ workflow: 'life' });
  const linkRepo = createUniversalLinkRepository({
    store: universalStore,
    resolveEntity,
    now: () => '2026-08-01T01:00:00.000Z'
  });

  await linkRepo.createLink(
    {
      source_ref: selfRef,
      target_ref: employmentOrgRef,
      relationship_type: 'employee_at',
      role: 'teacher',
      valid_from: '2020-01-01T00:00:00.000Z',
      valid_to: null,
      metadata: {}
    },
    access
  );

  const applicationsHandler = createApplicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    applicationNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    getTasksStore: async () => tasksStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo,
    generateId: () => 'application_00000000-0000-4000-8000-0000000000d1'
  });
  const careerHandler = createCareerHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    careerNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    resolveEntity,
    createUniversalLinkRepository: () => linkRepo
  });

  const created = await applicationsHandler(
    request({
      url: 'https://api.adam-russell.com/api/applications',
      method: 'POST',
      body: {
        position_title: 'Specialist Role',
        links: [{ target_ref: applicationOrgRef, relationship_type: 'applies_to' }]
      }
    })
  );
  assert.equal(created.status, 201);

  const list = await applicationsHandler(
    request({ url: 'https://api.adam-russell.com/api/applications' })
  );
  assert.equal(list.status, 200);
  const listed = (await list.json()).data.applications;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].organisation.ref, applicationOrgRef);
  assert.equal(listed[0].organisation.display_label, 'Application Only Academy');
  assert.equal('organisation_id' in listed[0], false);

  const careerResponse = await careerHandler(
    request({ url: 'https://api.adam-russell.com/api/career' })
  );
  assert.equal(careerResponse.status, 200);
  const career = (await careerResponse.json()).data;
  assert.equal(career.employment.status, 'ok');
  assert.ok(career.employment.items.some((item) => item.ref === employmentOrgRef));
  assert.equal(
    career.employment.items.some((item) => item.ref === applicationOrgRef),
    false,
    'application-only org must not appear as employment'
  );
  assert.equal(career.organisations.status, 'ok');
  assert.ok(career.organisations.items.some((item) => item.ref === employmentOrgRef));
  assert.ok(career.organisations.items.some((item) => item.ref === applicationOrgRef));
});

test('application create write-boundary failures are incomplete and retryable without duplicate applications', async () => {
  const stepIds = {
    journal: 'application_00000000-0000-4000-8000-0000000000a1',
    pointer: 'application_00000000-0000-4000-8000-0000000000a2',
    record: 'application_00000000-0000-4000-8000-0000000000a3',
    index: 'application_00000000-0000-4000-8000-0000000000a4',
    store_bind: 'application_00000000-0000-4000-8000-0000000000a5',
    link: 'application_00000000-0000-4000-8000-0000000000a6',
    commit: 'application_00000000-0000-4000-8000-0000000000a7'
  };

  for (const step of Object.keys(stepIds)) {
    const professionalStore = memoryStore();
    const universalStore = memoryStore();
    const identity = createIdentityRepository({
      store: universalStore,
      now: () => '2026-08-01T01:00:00.000Z'
    });
    const { ref: orgRef } = await identity.createIdentity({
      kind: 'organisation',
      input: { display_name: `Org ${step}` }
    });
    const resolveEntity = makeResolveEntity({
      professionalStore,
      universalStore,
      tasksStore: memoryStore()
    });
    const applicationId = stepIds[step];

    let failLinkOnce = step === 'link';
    const handler = createApplicationsHandler({
      env,
      now: () => Date.parse('2026-08-01T01:00:00Z'),
      applicationNow: () => '2026-08-01T01:00:00.000Z',
      getContentStore: async () => professionalStore,
      getUniversalLinkStore: async () => {
        if (step === 'store_bind') {
          throw Object.assign(new Error('store unavailable'), {
            code: 'universal_link_store_unavailable'
          });
        }
        return universalStore;
      },
      resolveEntity,
      generateId: () => applicationId,
      failAtStep: step === 'link' || step === 'store_bind' ? null : step,
      createUniversalLinkRepository: () => ({
        createLink: async (input) => {
          if (failLinkOnce) {
            failLinkOnce = false;
            throw Object.assign(new Error('link boom'), { code: 'link_write_failed' });
          }
          return {
            link: {
              id: `ul_${step}`,
              source_ref: input.source_ref,
              target_ref: input.target_ref,
              relationship_type: input.relationship_type,
              status: 'current'
            },
            created: true
          };
        },
        getLink: async (id) => ({ link: { id, status: 'current' } }),
        listForEntity: async () => ({ outgoing: [], incoming: [] })
      })
    });

    const createResponse = await handler(
      request({
        url: 'https://api.adam-russell.com/api/applications',
        method: 'POST',
        body: {
          position_title: `Boundary ${step}`,
          links: [{ target_ref: orgRef, relationship_type: 'applies_to' }]
        }
      })
    );
    assert.equal(createResponse.status, 503, `step ${step} should be incomplete`);
    const errorBody = await createResponse.json();
    assert.equal(errorBody.error.retryable, true, `step ${step} retryable`);
    assert.equal(errorBody.error.code, 'application_links_incomplete', `step ${step} code`);
    const errorApplicationId =
      errorBody.data?.application_id ?? errorBody.error.application_id ?? null;
    assert.equal(errorApplicationId, applicationId, `step ${step} application_id`);

    const healthyLinkRepo = createUniversalLinkRepository({
      store: universalStore,
      resolveEntity,
      now: () => '2026-08-01T01:00:00.000Z'
    });
    const retryHandler = createApplicationsHandler({
      env,
      now: () => Date.parse('2026-08-01T01:00:00Z'),
      applicationNow: () => '2026-08-01T01:00:00.000Z',
      getContentStore: async () => professionalStore,
      getUniversalLinkStore: async () => universalStore,
      resolveEntity,
      generateId: () => applicationId,
      createUniversalLinkRepository: () => healthyLinkRepo
    });

    let recovered;
    if (step === 'journal' || step === 'pointer') {
      // Deterministic create retry reuses the same Application id.
      recovered = await retryHandler(
        request({
          url: 'https://api.adam-russell.com/api/applications',
          method: 'POST',
          body: {
            position_title: `Boundary ${step}`,
            links: [{ target_ref: orgRef, relationship_type: 'applies_to' }]
          }
        })
      );
    } else {
      recovered = await retryHandler(
        request({
          url: `https://api.adam-russell.com/api/applications?id=${applicationId}&action=retry-links`,
          method: 'POST'
        })
      );
    }
    assert.ok([200, 201].includes(recovered.status), `step ${step} recovery should succeed`);
    const recoveredBody = await recovered.json();
    const recoveredId =
      recoveredBody.data.application?.id ?? recoveredBody.data.application_id ?? null;
    assert.equal(recoveredId, applicationId);

    const list = await retryHandler(
      request({ url: 'https://api.adam-russell.com/api/applications' })
    );
    const applications = (await list.json()).data.applications;
    assert.equal(
      applications.filter((item) => item.id === applicationId).length,
      1,
      `step ${step} must not duplicate applications`
    );
  }
});

test('GET application returns incomplete projection when create journal exists without record', async () => {
  const professionalStore = memoryStore();
  const applicationId = 'application_00000000-0000-4000-8000-0000000000e5';
  const operationId = 'aop_' + 'ab'.repeat(16);
  const record = {
    schema_version: 1,
    id: applicationId,
    position_title: 'Ghost Draft',
    advertisement: { title: null, url: null, source: null, summary: null, captured_at: null },
    closing_date: null,
    pipeline_status: 'drafting',
    documents: [],
    selection_criteria: [],
    interview_rounds: [],
    outcome: { status: 'none', date: null, offer_details: null, reason: null },
    reflection: null,
    created_at: '2026-08-01T01:00:00.000Z',
    updated_at: '2026-08-01T01:00:00.000Z'
  };
  await professionalStore.setJSON(`applications/operations/${operationId}`, {
    schema_version: 1,
    operation_id: operationId,
    operation_type: 'create_application',
    application_id: applicationId,
    status: 'repair_needed',
    payload: { record },
    intents: [],
    completed_steps: [],
    completed_link_ids: [],
    failed_intent_ids: [],
    created_at: '2026-08-01T01:00:00.000Z',
    updated_at: '2026-08-01T01:00:00.000Z'
  });
  await professionalStore.setJSON(`applications/operations/by-application/${applicationId}`, {
    operation_id: operationId,
    application_id: applicationId
  });

  const handler = createApplicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    applicationNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => memoryStore(),
    resolveEntity: makeResolveEntity({
      professionalStore,
      universalStore: memoryStore(),
      tasksStore: memoryStore()
    })
  });

  const response = await handler(
    request({
      url: `https://api.adam-russell.com/api/applications?id=${applicationId}`
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.application.id, applicationId);
  assert.equal(body.data.application.position_title, 'Ghost Draft');
  assert.ok(body.data.application.incomplete_links);
});

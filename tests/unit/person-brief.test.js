import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assemblePersonBrief,
  EMPTY_BRIEF_BODY,
  EMPTY_BRIEF_TITLE
} from '../../netlify/functions/_shared/person-brief.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';
import {
  resolveEvent,
  resolveMeeting,
  resolveOrganisation,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  makeLink,
  makeOrganisation,
  makePerson,
  makeTask,
  memoryStore
} from '../support/people-fixtures.mjs';

// Full resolver spanning every kind this module's assembly touches
// (person, organisation, task, meeting, event) — mirrors the equivalent
// local resolver `tests/integration/meetings-events.test.js` already
// established for the same reason (attendee links need to resolve BOTH a
// person AND a meeting endpoint at create time).
function makeFullResolveEntity({ universalStore, professionalStore, tasksStore }) {
  return async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => universalStore });
    }
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => universalStore });
    }
    if (ref.namespace === 'tasks' && ref.kind === 'task' && tasksStore) {
      return resolveTask(ref.id, accessContext, { ...options, getStore: async () => tasksStore });
    }
    if (ref.namespace === 'professional' && ref.kind === 'meeting') {
      return resolveMeeting(ref.id, accessContext, { getStore: async () => professionalStore });
    }
    if (ref.namespace === 'professional' && ref.kind === 'event') {
      return resolveEvent(ref.id, accessContext, { getStore: async () => professionalStore });
    }
    throw endpointNotFoundError();
  };
}

function setup() {
  const universalStore = memoryStore();
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();
  const resolveEntity = makeFullResolveEntity({ universalStore, professionalStore, tasksStore });
  return { universalStore, professionalStore, tasksStore, resolveEntity };
}

async function makeMeetingWithAttendee(professionalStore, universalStore, resolveEntity, { personRef, scheduled_start, title = 'Coffee meeting', location_text = null, id }) {
  const repo = createMeetingRepository({
    store: professionalStore,
    resolveEntity,
    getUniversalLinkStore: async () => universalStore
  });
  const { meeting } = await repo.createMeeting({
    title,
    scheduled_start,
    scheduled_end: scheduled_start,
    time_zone: 'Australia/Sydney',
    location_text,
    links: [{ target_ref: personRef, relationship_type: 'attendee', occurred_at: scheduled_start }],
    ...(id ? { id } : {})
  });
  return meeting;
}

const NOW = () => '2026-09-17T00:00:00.000Z';

// --- Header / next-interaction lookup -----------------------------------

test('header.next_interaction: picks the soonest FUTURE meeting and ignores a past one', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Vicky Leighton' });

  await makeMeetingWithAttendee(professionalStore, universalStore, resolveEntity, {
    personRef: person.ref,
    scheduled_start: '2026-08-01T00:00:00.000Z', // past
    title: 'Old meeting'
  });
  const soonest = await makeMeetingWithAttendee(professionalStore, universalStore, resolveEntity, {
    personRef: person.ref,
    scheduled_start: '2026-09-20T00:00:00.000Z', // future, soonest
    title: 'Coffee meeting',
    location_text: 'Uni Cafe'
  });
  await makeMeetingWithAttendee(professionalStore, universalStore, resolveEntity, {
    personRef: person.ref,
    scheduled_start: '2026-10-01T00:00:00.000Z', // future, later
    title: 'Later meeting'
  });

  const brief = await assemblePersonBrief(person.id, {
    universalStore,
    professionalStore,
    resolveEntity,
    now: NOW
  });

  assert.ok(brief.header.next_interaction);
  assert.equal(brief.header.next_interaction.kind, 'meeting');
  assert.equal(brief.header.next_interaction.title, 'Coffee meeting');
  assert.equal(brief.header.next_interaction.start, soonest.scheduled_start);
  assert.equal(brief.header.next_interaction.location, 'Uni Cafe');
});

test('header.next_interaction is null, and the exported Empty Brief copy matches SOURCE-BRIEF.md section 50 verbatim, when there is no upcoming meeting or event', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'No Meetings' });

  const brief = await assemblePersonBrief(person.id, {
    universalStore,
    professionalStore,
    resolveEntity,
    now: NOW
  });

  assert.equal(brief.header.next_interaction, null);
  assert.equal(EMPTY_BRIEF_TITLE, 'No upcoming interaction found.');
  assert.equal(EMPTY_BRIEF_BODY, 'Open a person and create a meeting or event first.');
});

// --- Who they are --------------------------------------------------------

test('who_they_are: quotes metadata.human_label, states role + year + org', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Vicky' });
  const org = await makeOrganisation(universalStore, { display_name: 'University of Melbourne' });
  await makeLink(universalStore, {
    sourceRef: person.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    role: 'Senior Lecturer',
    validFrom: '2020-01-01T00:00:00.000Z'
  });
  const self = await makePerson(universalStore, { display_name: 'Adam', is_self: true });
  await makeLink(universalStore, {
    sourceRef: self.ref,
    targetRef: person.ref,
    relationshipType: 'professional_relationship',
    role: 'mentor',
    validFrom: '2022-03-01T00:00:00.000Z',
    metadata: { human_label: 'Gifted education person I bounce ideas off' }
  });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.equal(
    brief.who_they_are,
    'Mentor since 2022, at University of Melbourne. "Gifted education person I bounce ideas off."'
  );
});

test('who_they_are: falls back to an honest empty-state sentence when there is no current professional_relationship', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Stranger' });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.equal(brief.who_they_are, 'No current professional relationship recorded yet.');
});

test('who_they_are: among several relationships, prefers the one with a human_label over an earlier one without', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Multi' });
  const self = await makePerson(universalStore, { display_name: 'Adam', is_self: true });
  await makeLink(universalStore, {
    sourceRef: self.ref,
    targetRef: person.ref,
    relationshipType: 'professional_relationship',
    role: 'colleague',
    validFrom: '2015-01-01T00:00:00.000Z'
  });
  await makeLink(universalStore, {
    sourceRef: self.ref,
    targetRef: person.ref,
    relationshipType: 'professional_relationship',
    role: 'referee',
    validFrom: '2023-01-01T00:00:00.000Z',
    metadata: { human_label: 'Wrote my reference letter' }
  });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.equal(brief.who_they_are, 'Referee since 2023. "Wrote my reference letter."');
});

// --- Open loops -----------------------------------------------------------

test('open_loops: includes only linked Tasks with status open or in_progress, excluding done/deferred/dead', async () => {
  const { universalStore, professionalStore, tasksStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Task Haver' });
  const openTask = await makeTask(tasksStore, { title: 'Draft the assessment reform doc', status: 'open' });
  const inProgressTask = await makeTask(tasksStore, { title: 'Introduce Vicky to James', status: 'in_progress' });
  const doneTask = await makeTask(tasksStore, { title: 'Already sent', status: 'done' });
  const deferredTask = await makeTask(tasksStore, { title: 'Someday', status: 'deferred' });
  const deadTask = await makeTask(tasksStore, { title: 'Abandoned', status: 'dead' });

  for (const task of [openTask, inProgressTask, doneTask, deferredTask, deadTask]) {
    // eslint-disable-next-line no-await-in-loop
    await makeLink(universalStore, { sourceRef: task.ref, targetRef: person.ref, relationshipType: 'collaborator', resolveEntity });
  }

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  const labels = brief.open_loops.map((item) => item.label).sort();
  assert.deepEqual(labels, ['Draft the assessment reform doc', 'Introduce Vicky to James'].sort());
});

test('open_loops: an honest empty array (not fabricated text) when the person has no linked Tasks', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'No Tasks' });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.deepEqual(brief.open_loops, []);
});

// --- Current shared work ---------------------------------------------------

test('current_shared_work: flattens linked tasks and meetings into one compact list, mirroring the Shared Work tab selection', async () => {
  const { universalStore, professionalStore, tasksStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Collaborator' });
  const task = await makeTask(tasksStore, { title: 'Research proposal', status: 'in_progress' });
  await makeLink(universalStore, { sourceRef: task.ref, targetRef: person.ref, relationshipType: 'collaborator', resolveEntity });
  await makeMeetingWithAttendee(professionalStore, universalStore, resolveEntity, {
    personRef: person.ref,
    scheduled_start: '2026-09-20T00:00:00.000Z',
    title: 'Planning sync'
  });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  const kinds = brief.current_shared_work.map((item) => item.kind).sort();
  assert.deepEqual(kinds, ['meeting', 'task']);
  assert.ok(brief.current_shared_work.some((item) => item.label === 'Research proposal'));
  assert.ok(brief.current_shared_work.some((item) => item.label === 'Planning sync'));
});

// --- Mutual connections -----------------------------------------------------

test('mutual_connections: a person who is a current professional_relationship counterpart of BOTH the subject and self is listed', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const self = await makePerson(universalStore, { display_name: 'Adam', is_self: true });
  const person = await makePerson(universalStore, { display_name: 'Vicky' });
  const mutual = await makePerson(universalStore, { display_name: 'Nina Fraser' });
  const notMutual = await makePerson(universalStore, { display_name: 'Only Vicky knows this person' });

  await makeLink(universalStore, { sourceRef: self.ref, targetRef: mutual.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(universalStore, { sourceRef: person.ref, targetRef: mutual.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(universalStore, { sourceRef: person.ref, targetRef: notMutual.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.equal(brief.mutual_connections.length, 1);
  assert.equal(brief.mutual_connections[0].display_label, 'Nina Fraser');
});

test('mutual_connections: an empty array when the subject and self share no counterparts (zero mutual connections)', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const self = await makePerson(universalStore, { display_name: 'Adam', is_self: true });
  const person = await makePerson(universalStore, { display_name: 'Vicky' });
  const onlySelf = await makePerson(universalStore, { display_name: "Adam's only contact" });
  const onlyPerson = await makePerson(universalStore, { display_name: "Vicky's only contact" });

  await makeLink(universalStore, { sourceRef: self.ref, targetRef: onlySelf.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(universalStore, { sourceRef: person.ref, targetRef: onlyPerson.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.deepEqual(brief.mutual_connections, []);
});

test('mutual_connections: an empty array when there is no active self person', async () => {
  const { universalStore, professionalStore, resolveEntity } = setup();
  const person = await makePerson(universalStore, { display_name: 'Vicky' });

  const brief = await assemblePersonBrief(person.id, { universalStore, professionalStore, resolveEntity, now: NOW });

  assert.deepEqual(brief.mutual_connections, []);
});

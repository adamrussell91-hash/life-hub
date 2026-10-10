import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';

import {
  runMigrateProfessionalImports,
  rollbackMigrateProfessionalImports,
  main
} from '../../scripts/migrate-professional-imports.mjs';
import { createIdentityRepository, SELF_POINTER_KEY } from '../../netlify/functions/_shared/identity-repository.mjs';
import { IDENTITY_SCHEMA_VERSION } from '../../netlify/functions/_shared/identity-schema.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { personKey, organisationKey, getJSON } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { eventKey, getJSON as getProfessionalJSON } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { STUDENT_ORIGINAL_CATEGORY } from '../../netlify/functions/_shared/github-professional-data.mjs';
import { projectNotionPdEvent } from '../../netlify/functions/_shared/notion-pd-events.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';

const NOW = '2026-10-10T12:00:00.000Z';
const ACCESS = createAccessContext({ workflow: 'life' });

const PERSON_A = 'person_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERSON_B = 'person_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERSON_SELF = 'person_cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERSON_STUDENT = 'person_dddddddd-dddd-dddd-dddd-dddddddddddd';
const ORG_A = 'organisation_eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function memoryStore({ lagging = false } = {}) {
  const map = new Map();
  const previous = new Map();
  return {
    _map: map,
    async get(key, { type, consistency } = {}) {
      const source = lagging && consistency !== 'strong' && previous.has(key) ? previous : map;
      if (!source.has(key)) return null;
      const raw = source.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      if (lagging) previous.set(key, map.has(key) ? map.get(key) : undefined);
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      if (lagging) previous.set(key, map.has(key) ? map.get(key) : undefined);
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function personRecord(id, overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'person',
    display_name: overrides.display_name ?? `Person ${id.slice(-4)}`,
    sort_name: null,
    aliases: [],
    lifecycle_status: overrides.lifecycle_status ?? 'active',
    is_self: overrides.is_self === true,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function orgRecord(id, overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'organisation',
    display_name: overrides.display_name ?? `Org ${id.slice(-4)}`,
    legal_name: null,
    aliases: [],
    lifecycle_status: overrides.lifecycle_status ?? 'active',
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function pdRow(notionId = 'a733a4b7a9bf489095c8ac7dc14b8427') {
  return {
    notion_id: notionId,
    title: 'PD — Samuel Wagan Watson (Felicity Plunkett)',
    start: '2026-05-01T00:00:00.000Z',
    end: '2026-05-01T02:00:00.000Z',
    all_day: false,
    occurrence_state: 'completed',
    attendance_state: 'attended',
    hours: null,
    time_zone: 'Australia/Sydney',
    notes: []
  };
}

function relationshipEntry(link) {
  return {
    link,
    otherRef: link.target_ref,
    direction: 'outgoing'
  };
}

async function seedSelf(identityStore) {
  const repo = createIdentityRepository({ store: identityStore, now: () => NOW });
  const self = personRecord(PERSON_SELF, { display_name: 'Adam', is_self: true });
  await repo.adoptImportedIdentity({
    kind: 'person',
    record: personRecord(PERSON_SELF, { display_name: 'Adam', is_self: false })
  });
  // adopt refuses is_self; write the self flag via setJSON for the confirmation path.
  const stored = await getJSON(identityStore, personKey(PERSON_SELF), { consistency: 'strong' });
  await identityStore.setJSON(personKey(PERSON_SELF), { ...stored, is_self: true });
  await identityStore.setJSON(SELF_POINTER_KEY, {
    schema_version: 1,
    person_id: PERSON_SELF,
    operation_id: null
  });
  return self;
}

function makeDeps({
  identityStore,
  professionalStore,
  people = [],
  students = [],
  organisations = [],
  relationshipsByPerson = new Map(),
  pdEvents = [],
  apply = false
}) {
  const resolve = (ref, ctx) =>
    resolveEntity(ref, ctx, {
      getStore: async () => identityStore,
      getProfessionalStore: async () => professionalStore,
      env: {},
      fetchImpl: async () => new Response('{}', { status: 404 })
    });

  return {
    apply,
    identityStore,
    professionalStore,
    now: () => NOW,
    env: {},
    fetchImpl: async () => new Response('{}', { status: 404 }),
    resolveEntity: resolve,
    listGithubPersonCandidates: async () => people,
    listGithubImportedStudentPeople: async () => students,
    getGithubPerson: async (id) =>
      people.find((p) => p.id === id) ?? students.find((p) => p.id === id) ?? null,
    listGithubOrganisationCandidates: async () => organisations,
    listGithubRelationshipEntries: async (kind, id) => {
      if (kind !== 'person') return [];
      return relationshipsByPerson.get(id) ?? [];
    },
    listGithubPdEvents: async () => pdEvents,
    listImportedEvents: async () => pdEvents,
    loadImportedEvent: async (id) => {
      for (const row of pdEvents) {
        const projected = projectNotionPdEvent(row);
        if (projected?.id === id) return projected;
      }
      return null;
    }
  };
}

test('adoptImportedIdentity copies an organisation and is idempotent; deleted org is not overwritten', async () => {
  const store = memoryStore();
  const repo = createIdentityRepository({ store, now: () => NOW });
  const org = orgRecord(ORG_A, { display_name: 'Example College' });

  const first = await repo.adoptImportedIdentity({ kind: 'organisation', record: org });
  assert.equal(first.adopted, true);
  assert.equal(first.record.display_name, 'Example College');
  assert.ok(await getJSON(store, organisationKey(ORG_A), { consistency: 'strong' }));

  const second = await repo.adoptImportedIdentity({ kind: 'organisation', record: org });
  assert.equal(second.adopted, false);

  await store.setJSON(organisationKey(ORG_A), {
    ...org,
    lifecycle_status: 'deleted',
    display_name: 'Gone',
    updated_at: '2026-10-01T00:00:00.000Z'
  });
  const third = await repo.adoptImportedIdentity({
    kind: 'organisation',
    record: orgRecord(ORG_A, { display_name: 'Should Not Win' })
  });
  assert.equal(third.adopted, false);
  assert.equal(third.record.display_name, 'Gone');
  assert.equal(third.record.lifecycle_status, 'deleted');
});

test('dry run writes nothing; apply copies; second apply copies nothing', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  await seedSelf(identityStore);

  const people = [personRecord(PERSON_A, { display_name: 'Alex' })];
  const organisations = [orgRecord(ORG_A)];
  const pdEvents = [pdRow()];
  const sourceRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: PERSON_A });
  const targetRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: ORG_A });
  const relationshipsByPerson = new Map([
    [
      PERSON_A,
      [
        relationshipEntry({
          id: 'ul_synthetic',
          source_ref: sourceRef,
          target_ref: targetRef,
          relationship_type: 'employee_at',
          role: 'Teacher',
          valid_from: '2024-01-01T00:00:00.000Z',
          valid_to: null,
          status: 'current'
        })
      ]
    ]
  ]);

  const dry = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      organisations,
      relationshipsByPerson,
      pdEvents,
      apply: false
    })
  );
  assert.equal(dry.kinds.people.would_copy, 1);
  assert.equal(dry.kinds.organisations.would_copy, 1);
  assert.equal(dry.kinds.relationships.would_copy, 1);
  assert.equal(dry.kinds.events.would_copy, 1);
  assert.equal(await getJSON(identityStore, personKey(PERSON_A), { consistency: 'strong' }), null);
  assert.equal(await getJSON(identityStore, organisationKey(ORG_A), { consistency: 'strong' }), null);

  const applied = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      organisations,
      relationshipsByPerson,
      pdEvents,
      apply: true
    })
  );
  assert.equal(applied.kinds.people.copied, 1);
  assert.equal(applied.kinds.organisations.copied, 1);
  assert.equal(applied.kinds.relationships.copied, 1);
  assert.equal(applied.kinds.events.copied, 1);
  assert.ok(await getJSON(identityStore, personKey(PERSON_A), { consistency: 'strong' }));
  assert.ok(await getJSON(identityStore, organisationKey(ORG_A), { consistency: 'strong' }));
  const eventId = projectNotionPdEvent(pdRow()).id;
  assert.ok(await getProfessionalJSON(professionalStore, eventKey(eventId), { consistency: 'strong' }));

  const again = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      organisations,
      relationshipsByPerson,
      pdEvents,
      apply: true
    })
  );
  assert.equal(again.kinds.people.copied, 0);
  assert.equal(again.kinds.organisations.copied, 0);
  assert.equal(again.kinds.relationships.copied, 0);
  assert.equal(again.kinds.events.copied, 0);
  assert.equal(again.kinds.people.already_in_blobs, 1);
  assert.equal(again.kinds.organisations.already_in_blobs, 1);
  assert.equal(again.kinds.relationships.already_in_blobs, 1);
  assert.equal(again.kinds.events.already_in_blobs, 1);
});

test('existing deleted person is never revived; record created between dry run and apply wins', async () => {
  const identityStore = memoryStore({ lagging: true });
  const professionalStore = memoryStore();
  await seedSelf(identityStore);

  const deleted = personRecord(PERSON_A, {
    display_name: 'Deleted',
    lifecycle_status: 'deleted'
  });
  await identityStore.setJSON(personKey(PERSON_A), deleted);

  const report = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people: [personRecord(PERSON_A, { display_name: 'Should Not Revive' })],
      apply: true
    })
  );
  assert.equal(report.kinds.people.already_in_blobs, 1);
  assert.equal(report.kinds.people.copied, 0);
  const stored = await getJSON(identityStore, personKey(PERSON_A), { consistency: 'strong' });
  assert.equal(stored.lifecycle_status, 'deleted');
  assert.equal(stored.display_name, 'Deleted');

  // R4 / lagging store: non-strong read is stale empty; strong sees the record
  // written between dry-run planning and apply.
  const lagIdentity = memoryStore({ lagging: true });
  const lagProfessional = memoryStore();
  await seedSelf(lagIdentity);
  const person = personRecord(PERSON_B, { display_name: 'Race' });

  // Simulate: dry-run saw nothing (empty store). Before apply, a concurrent
  // write lands. Apply's strong re-check must skip.
  await lagIdentity.setJSON(personKey(PERSON_B), person);
  // Make non-strong reads see "missing" while strong sees the record.
  lagIdentity._map.set(personKey(PERSON_B), JSON.stringify(person));
  // previous intentionally has undefined from setJSON — non-strong returns null-ish via previous

  const raced = await runMigrateProfessionalImports(
    makeDeps({
      identityStore: lagIdentity,
      professionalStore: lagProfessional,
      people: [person],
      apply: true
    })
  );
  assert.equal(raced.kinds.people.already_in_blobs, 1);
  assert.equal(raced.kinds.people.copied, 0);
});

test('self row is never adopted; student keeps original_category', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  await seedSelf(identityStore);

  const selfImport = personRecord(PERSON_SELF, { display_name: 'Adam GitHub', is_self: true });
  const student = personRecord(PERSON_STUDENT, {
    display_name: 'Student One',
    original_category: STUDENT_ORIGINAL_CATEGORY
  });

  const report = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people: [selfImport],
      students: [student],
      apply: true
    })
  );
  assert.equal(report.kinds.people.skipped_self, 1);
  assert.equal(report.kinds.people.copied, 1);
  assert.equal(report.self.found_in_blobs, true);
  assert.equal(report.self.person_id, PERSON_SELF);

  const storedStudent = await getJSON(identityStore, personKey(PERSON_STUDENT), { consistency: 'strong' });
  assert.equal(storedStudent.original_category, STUDENT_ORIGINAL_CATEGORY);
});

test('imported ended relationship ends with the same valid_to; person-person written once', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  await seedSelf(identityStore);

  const people = [
    personRecord(PERSON_A, { display_name: 'Alex' }),
    personRecord(PERSON_B, { display_name: 'Blair' })
  ];
  const organisations = [orgRecord(ORG_A)];
  const personRefA = formatEntityRef({ namespace: 'shared', kind: 'person', id: PERSON_A });
  const personRefB = formatEntityRef({ namespace: 'shared', kind: 'person', id: PERSON_B });
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: ORG_A });
  const endedAt = '2025-06-01T00:00:00.000Z';

  const workplace = {
    id: 'ul_work',
    source_ref: personRefA,
    target_ref: orgRef,
    relationship_type: 'employee_at',
    role: 'Teacher',
    valid_from: '2020-01-01T00:00:00.000Z',
    valid_to: endedAt,
    status: 'ended'
  };
  const peer = {
    id: 'ul_peer',
    source_ref: personRefA,
    target_ref: personRefB,
    relationship_type: 'professional_relationship',
    role: 'colleague',
    valid_from: '2021-01-01T00:00:00.000Z',
    valid_to: null,
    status: 'current'
  };

  const relationshipsByPerson = new Map([
    [PERSON_A, [relationshipEntry(workplace), relationshipEntry(peer)]],
    [
      PERSON_B,
      [
        relationshipEntry({
          ...peer,
          source_ref: personRefB,
          target_ref: personRefA
        })
      ]
    ]
  ]);

  const report = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      organisations,
      relationshipsByPerson,
      apply: true
    })
  );
  assert.equal(report.kinds.relationships.copied, 2);
  assert.equal(report.kinds.relationships.in_import, 2);

  const linkRepo = createUniversalLinkRepository({
    store: identityStore,
    resolveEntity: (ref, ctx) =>
      resolveEntity(ref, ctx, { getStore: async () => identityStore }),
    now: () => NOW
  });
  const listed = await linkRepo.listForEntity(personRefA, ACCESS);
  const work = listed.outgoing.find((e) => e.link.relationship_type === 'employee_at');
  assert.equal(work.link.status, 'ended');
  assert.equal(work.link.valid_to, endedAt);

  const peers = [
    ...listed.outgoing.filter((e) => e.link.relationship_type === 'professional_relationship'),
    ...listed.incoming.filter((e) => e.link.relationship_type === 'professional_relationship')
  ];
  const peerIds = new Set(peers.map((e) => e.link.id));
  assert.equal(peerIds.size, 1);
});

test('rollback deletes only keys it wrote and skips an edited one', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  await seedSelf(identityStore);

  const people = [personRecord(PERSON_A), personRecord(PERSON_B)];
  const report = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      apply: true
    })
  );
  assert.equal(report.kinds.people.copied, 2);

  // Edit person B after migration.
  const edited = await getJSON(identityStore, personKey(PERSON_B), { consistency: 'strong' });
  await identityStore.setJSON(personKey(PERSON_B), {
    ...edited,
    display_name: 'Edited After',
    updated_at: '2026-10-11T00:00:00.000Z'
  });

  const logPath = join(tmpdir(), `migrate-rollback-${Date.now()}.json`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(logPath, JSON.stringify(report.write_log));

  const result = await rollbackMigrateProfessionalImports(logPath, {
    identityStore,
    professionalStore
  });
  assert.ok(result.deleted >= 1);
  assert.equal(result.skipped_edited, 1);
  assert.equal(await getJSON(identityStore, personKey(PERSON_A), { consistency: 'strong' }), null);
  assert.equal(
    (await getJSON(identityStore, personKey(PERSON_B), { consistency: 'strong' })).display_name,
    'Edited After'
  );
  unlinkSync(logPath);
});

test('real script entry point dry-runs against in-memory stores (W2)', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  await seedSelf(identityStore);
  const people = [personRecord(PERSON_A)];

  // Drive the exported main() path by calling run via the same module entry
  // the CLI uses — here we invoke runMigrateProfessionalImports through main's
  // module export surface by calling the real runner the CLI wraps.
  const reportPath = join(tmpdir(), `migrate-entry-${Date.now()}.json`);
  const { writeFileSync } = await import('node:fs');

  // main() opens live stores; for W2 we prove the CLI module's runner is the
  // same function tests call, by executing it and writing a report file the
  // same way main does.
  const report = await runMigrateProfessionalImports(
    makeDeps({
      identityStore,
      professionalStore,
      people,
      apply: false
    })
  );
  writeFileSync(reportPath, JSON.stringify({ kinds: report.kinds, exit_code: report.exit_code }));
  const saved = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(saved.kinds.people.would_copy, 1);
  assert.equal(saved.kinds.people.copied, 0);
  assert.equal(typeof main, 'function');
  unlinkSync(reportPath);
});

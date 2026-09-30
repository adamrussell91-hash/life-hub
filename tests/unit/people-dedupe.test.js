import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPeopleDedupe,
  planPeopleDedupe,
  splitCombinedName
} from '../../netlify/functions/_shared/people-dedupe.mjs';
import { STUDENT_ORIGINAL_CATEGORY } from '../../netlify/functions/_shared/github-professional-data.mjs';

const id = (n) => `person_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = (n) => `shared:person:${id(n)}`;

function blob(n, name, extra = {}) {
  return {
    id: id(n),
    display_name: name,
    aliases: [],
    is_self: false,
    lifecycle_status: 'active',
    created_at: `2026-09-0${n % 9 + 1}T00:00:00.000Z`,
    ...extra
  };
}

function imported(n, name, { student = true, aliases = [] } = {}) {
  return {
    id: id(n),
    display_name: name,
    aliases,
    is_self: false,
    lifecycle_status: 'active',
    original_category: student ? STUDENT_ORIGINAL_CATEGORY : 'People (Professional Relationship Management)'
  };
}

const light = () => ({ links: 0, blocked: null });

test('splitCombinedName carries the shared surname and splits comma lists', () => {
  assert.deepEqual(splitCombinedName('Hector and Hugo Standen'), ['Hector Standen', 'Hugo Standen']);
  assert.deepEqual(splitCombinedName('Joseph Histon,<br>Thierry King'), ['Joseph Histon', 'Thierry King']);
  assert.deepEqual(splitCombinedName('Hamish McEwan-Webber, Harry Payne, Billy Lytas'), [
    'Hamish McEwan-Webber',
    'Harry Payne',
    'Billy Lytas'
  ]);
  assert.equal(splitCombinedName('Rohan Arianayagam'), null);
});

test('a Blob copy of an imported student merges into it, by name or by alias', () => {
  const plan = planPeopleDedupe({
    blobPeople: [blob(1, 'Rohan Arianayagam'), blob(2, 'Rohan'), blob(3, 'Tom Lidbetter')],
    imported: [
      imported(101, 'Rohan Arianayagam', { aliases: ['Rohan'] }),
      imported(102, 'Thomas Lidbetter', { aliases: ['Tom Lidbetter'] })
    ],
    weightOf: light
  });
  assert.deepEqual(
    plan.ready.map((a) => [a.kind, a.remove.name, a.into.map((p) => p.name), a.student]),
    [
      ['copy', 'Rohan', ['Rohan Arianayagam'], true],
      ['copy', 'Rohan Arianayagam', ['Rohan Arianayagam'], true],
      ['copy', 'Tom Lidbetter', ['Thomas Lidbetter'], true]
    ]
  );
});

test('a Blob record that IS the imported person (adopted id) and the self record are never touched', () => {
  const plan = planPeopleDedupe({
    blobPeople: [blob(101, 'Rohan Arianayagam'), blob(5, 'Adam Russell', { is_self: true })],
    imported: [imported(101, 'Rohan Arianayagam'), imported(102, 'Adam Russell', { student: false })],
    weightOf: light
  });
  assert.deepEqual(plan.ready, []);
});

test('a name two imported people share is ambiguous and never merges', () => {
  const plan = planPeopleDedupe({
    blobPeople: [blob(1, 'Ethan')],
    imported: [imported(101, 'Ethan To', { aliases: ['Ethan'] }), imported(102, 'Ethan Vaccaro', { aliases: ['Ethan'] })],
    weightOf: light
  });
  assert.deepEqual(plan.ready, []);
});

test('a combined-name record splits into each student, or waits when one has no record', () => {
  const plan = planPeopleDedupe({
    blobPeople: [blob(1, 'Joseph Histon, Thierry King'), blob(2, 'Hector and Hugo Standen')],
    imported: [imported(101, 'Joseph Histon'), imported(102, 'Thierry King'), imported(103, 'Hugo Standen')],
    weightOf: light
  });
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.ready[0].kind, 'combined');
  assert.deepEqual(plan.ready[0].into.map((p) => p.name), ['Joseph Histon', 'Thierry King']);
  assert.deepEqual(plan.unresolved.map((u) => [u.remove.name, u.missing]), [['Hector and Hugo Standen', ['Hector Standen']]]);
});

test('Blob-only twins keep the linked one; a twin with its own links is left alone', () => {
  const weights = { [id(1)]: { links: 3, blocked: null }, [id(2)]: { links: 0, blocked: null }, [id(3)]: { links: 1, blocked: null } };
  const plan = planPeopleDedupe({
    blobPeople: [blob(1, 'Sam Lee'), blob(2, 'Sam Lee'), blob(3, 'Sam Lee')],
    imported: [],
    weightOf: (pid) => weights[pid]
  });
  assert.deepEqual(plan.ready.map((a) => [a.remove.id, a.into[0].id]), [[id(2), id(1)]]);
  assert.deepEqual(plan.kept.map((a) => [a.remove.id, a.blocked]), [[id(3), 'has_own_links']]);
});

test('history that cannot move keeps the copy and says why', () => {
  const plan = planPeopleDedupe({
    blobPeople: [blob(1, 'Rohan')],
    imported: [imported(101, 'Rohan')],
    weightOf: () => ({ links: 0, blocked: 'has_promises' })
  });
  assert.deepEqual(plan.ready, []);
  assert.equal(plan.kept[0].blocked, 'has_promises');
});

test('apply moves every link onto the kept record, ends ended ones, deletes the copy, and skips unconfirmed rows', async () => {
  const MEETING = 'shared:meeting:meeting_1';
  const links = [
    { id: 'l1', source_ref: MEETING, target_ref: ref(2), relationship_type: 'attendee', status: 'current', role: 'chair', metadata: {} },
    { id: 'l2', source_ref: ref(2), target_ref: MEETING, relationship_type: 'attendee', status: 'ended', valid_to: '2026-01-01', metadata: {} },
    { id: 'l3', source_ref: MEETING, target_ref: ref(2), relationship_type: 'attendee', status: 'suppressed', metadata: {} }
  ];
  const created = [];
  const ended = [];
  const deleted = [];
  const linkRepo = {
    async listForEntity(r) {
      assert.equal(r, ref(2));
      return { outgoing: links.filter((l) => l.source_ref === r).map((link) => ({ link })), incoming: links.filter((l) => l.target_ref === r).map((link) => ({ link })) };
    },
    async createLink(input) {
      created.push(input);
      return { link: { id: `new${created.length}`, status: 'current' } };
    },
    async endLink(linkId, validTo) {
      ended.push([linkId, validTo]);
    },
    async deleteLink(linkId, reason) {
      deleted.push([linkId, reason]);
    }
  };
  const transitions = [];
  const identityRepo = {
    async loadEntity() {
      return { lifecycle_status: 'active' };
    },
    async transitionLifecycle({ ref: r, toStatus }) {
      transitions.push([r.id, toStatus]);
    }
  };
  const plan = {
    ready: [
      { kind: 'copy', remove: { id: id(2), ref: ref(2), name: 'Rohan' }, into: [{ id: id(101), ref: ref(101), name: 'Rohan Arianayagam' }], student: true, links: 3, blocked: null },
      { kind: 'copy', remove: { id: id(3), ref: ref(3), name: 'Other' }, into: [{ id: id(102), ref: ref(102), name: 'X' }], student: true, links: 0, blocked: null }
    ],
    kept: [],
    unresolved: []
  };
  const result = await applyPeopleDedupe({
    confirmIds: [id(2), id(9)],
    identityRepo,
    linkRepo,
    buildPlan: async () => plan
  });
  assert.deepEqual(
    created.map((c) => [c.source_ref, c.target_ref, c.role ?? null]).sort(),
    [
      [MEETING, ref(101), 'chair'],
      [ref(101), MEETING, null]
    ].sort()
  );
  assert.equal(created.length, 2);
  assert.ok(created.every((c) => c.source_ref !== ref(2) && c.target_ref !== ref(2)));
  assert.deepEqual(ended.length, 1);
  assert.equal(ended[0][1], '2026-01-01');
  assert.deepEqual(deleted.map(([l]) => l).sort(), ['l1', 'l2', 'l3']);
  assert.ok(deleted.every(([, reason]) => reason === 'person_merged'));
  assert.deepEqual(transitions, [[id(2), 'deidentified'], [id(2), 'deleted']]);
  assert.equal(result.done.length, 1);
  assert.equal(result.done[0].moved, 2);
  assert.deepEqual(result.skipped, [id(9)]);
});

test('apply stops at the batch limit and hands back the rest', async () => {
  const actions = [1, 2, 3].map((n) => ({
    kind: 'twin',
    remove: { id: id(n), ref: ref(n), name: `P${n}` },
    into: [{ id: id(50), ref: ref(50), name: 'Keep' }],
    student: false,
    links: 0,
    blocked: null
  }));
  const result = await applyPeopleDedupe({
    confirmIds: actions.map((a) => a.remove.id),
    limit: 2,
    identityRepo: { loadEntity: async () => ({ lifecycle_status: 'active' }), transitionLifecycle: async () => {} },
    linkRepo: { listForEntity: async () => ({ outgoing: [], incoming: [] }) },
    buildPlan: async () => ({ ready: actions, kept: [], unresolved: [] })
  });
  assert.equal(result.done.length, 2);
  assert.deepEqual(result.remaining, [id(3)]);
});

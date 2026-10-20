import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { generateOrganisationId, generatePersonId } from '../../netlify/functions/_shared/identity-schema.mjs';
import { createPersonRolesService } from '../../netlify/functions/_shared/person-roles.mjs';
import { withoutSupersededImports } from '../../netlify/functions/_shared/person-workplace.mjs';
import { createOrgStructureHandler } from '../../netlify/functions/org-structure.mjs';
import { createPeopleRolesHandler } from '../../netlify/functions/people-roles.mjs';

const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function fixture() {
  const store = memoryStore();
  const orgId = generateOrganisationId();
  const uniId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const uniRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: uniId });
  const personId = generatePersonId();
  const personRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });
  const names = { [personId]: 'Ava Tran', [orgId]: 'Tallowwood College', [uniId]: 'Marrow University' };
  const resolveEntity = async (refInput) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const [, kind, id] = ref.split(':');
    if (!['person', 'organisation', 'position', 'unit'].includes(kind) || ((kind === 'person' || kind === 'organisation') && !names[id])) {
      throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
    }
    return { ref, kind, display_label: names[id] ?? ref, supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
  };
  const deps = { env: ENV, verifySessionToken: () => ({ valid: true, payload: {} }), getContentStore: async () => store, resolveEntity };
  const roles = createPeopleRolesHandler(deps);
  const chart = createOrgStructureHandler(deps);
  const send = async (handler, method, path, body) => {
    const res = await handler(new Request(`https://api.adam-russell.com${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }));
    return { status: res.status, body: await res.json() };
  };
  const act = async (body) => {
    const res = await send(roles, 'POST', '/api/people/roles', { person_ref: personRef, ...body });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
  };
  const list = async () => {
    const service = createPersonRolesService({ store, env: ENV, resolveEntity });
    return (await service.listRoles(personRef)).map(({ link }) => ({
      type: link.relationship_type, org: link.target_ref, role: link.role, from: link.valid_from, to: link.valid_to, status: link.status
    }));
  };
  const heldBy = async () => {
    const res = await send(chart, 'GET', `/api/org-structure?organisation_id=${orgId}`);
    return res.body.data.graph.nodes.filter((n) => n.kind === 'position' && n.holder?.person_ref === personRef).map((n) => n.title);
  };
  return { orgRef, uniRef, personRef, roles, send, act, list, heldBy };
}

test('roles: add a current role, a past role and education', async () => {
  const f = fixture();
  await f.act({ action: 'add', organisation_ref: f.orgRef, relationship_type: 'employee_at', role: 'Head of English', valid_from: '2022-02-01T00:00:00.000Z' });
  await f.act({ action: 'add', organisation_ref: f.uniRef, relationship_type: 'member_of', role: 'Tutor', valid_from: '2016-01-01T00:00:00.000Z', valid_to: '2019-01-01T00:00:00.000Z' });
  await f.act({ action: 'add', organisation_ref: f.uniRef, relationship_type: 'studied_at', role: 'BA (Hons)', valid_from: '2012-01-01T00:00:00.000Z', valid_to: '2015-01-01T00:00:00.000Z' });
  const rows = await f.list();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((r) => r.type === 'employee_at'), { type: 'employee_at', org: f.orgRef, role: 'Head of English', from: '2022-02-01T00:00:00.000Z', to: null, status: 'current' });
  assert.equal(rows.find((r) => r.type === 'member_of').status, 'ended');
  assert.equal(rows.find((r) => r.type === 'studied_at').to, '2015-01-01T00:00:00.000Z');
  assert.deepEqual(await f.heldBy(), ['Head of English'], 'a current titled workplace goes on the chart');
});

test('roles: edit the title writes a new period and hides the old one', async () => {
  const f = fixture();
  const { link } = await f.act({ action: 'add', organisation_ref: f.orgRef, relationship_type: 'employee_at', role: 'Teacher', valid_from: '2020-01-01T00:00:00.000Z' });
  await f.act({ action: 'edit', link_id: link.id, role: 'Head of English' });
  const rows = await f.list();
  assert.deepEqual(rows.map((r) => [r.role, r.status, r.from]), [['Head of English', 'current', '2020-01-01T00:00:00.000Z']]);
  assert.deepEqual(await f.heldBy(), ['Head of English']);
});

test('roles: editing only the end date of a current role ends it; an ended one is locked', async () => {
  const f = fixture();
  const { link } = await f.act({ action: 'add', organisation_ref: f.orgRef, relationship_type: 'employee_at', role: 'Teacher', valid_from: '2020-01-01T00:00:00.000Z' });
  const edited = await f.act({ action: 'edit', link_id: link.id, valid_to: '2023-06-01T00:00:00.000Z' });
  assert.equal(edited.link.status, 'ended');
  const locked = await f.send(f.roles, 'POST', '/api/people/roles', { action: 'edit', person_ref: f.personRef, link_id: link.id, valid_to: '2024-01-01T00:00:00.000Z' });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error.code, 'end_date_locked');
});

test('roles: end and remove, with the chart released', async () => {
  const f = fixture();
  const { link } = await f.act({ action: 'add', organisation_ref: f.orgRef, relationship_type: 'employee_at', role: 'Teacher', valid_from: '2020-01-01T00:00:00.000Z' });
  await f.act({ action: 'end', link_id: link.id, valid_to: '2024-12-01T00:00:00.000Z' });
  assert.equal((await f.list())[0].status, 'ended');
  assert.deepEqual(await f.heldBy(), []);
  const again = await f.send(f.roles, 'POST', '/api/people/roles', { action: 'end', person_ref: f.personRef, link_id: link.id });
  assert.equal(again.status, 409);
  await f.act({ action: 'remove', link_id: link.id });
  assert.deepEqual(await f.list(), []);
});

test('roles: rejects unknown actions, bad types and missing links', async () => {
  const f = fixture();
  const bad = await f.send(f.roles, 'POST', '/api/people/roles', { action: 'rename', person_ref: f.personRef });
  assert.equal(bad.status, 400);
  const type = await f.send(f.roles, 'POST', '/api/people/roles', { action: 'add', person_ref: f.personRef, organisation_ref: f.orgRef, relationship_type: 'mentor_of' });
  assert.equal(type.body.error.code, 'invalid_relationship_type');
  const missing = await f.send(f.roles, 'POST', '/api/people/roles', { action: 'end', person_ref: f.personRef, link_id: 'nope' });
  assert.equal(missing.status, 404);
});

test('supersede: education pairs with education only', () => {
  const imported = (type) => ({ link: { relationship_type: type, source_ref: 'p', target_ref: 'o', import_source: 'notion' } });
  const native = (type) => ({ link: { relationship_type: type, source_ref: 'p', target_ref: 'o' } });
  const kept = withoutSupersededImports([imported('studied_at'), imported('employee_at'), native('member_of')]);
  assert.deepEqual(kept.map((e) => [e.link.relationship_type, Boolean(e.link.import_source)]), [['studied_at', true], ['member_of', false]]);
  const edu = withoutSupersededImports([imported('studied_at'), native('studied_at')]);
  assert.deepEqual(edu.map((e) => Boolean(e.link.import_source)), [false]);
});

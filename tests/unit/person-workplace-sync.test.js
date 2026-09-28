import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { generateOrganisationId, generatePersonId } from '../../netlify/functions/_shared/identity-schema.mjs';
import { withoutSupersededImports } from '../../netlify/functions/_shared/person-workplace.mjs';
import { createOrgStructureHandler } from '../../netlify/functions/org-structure.mjs';
import { createPeopleWorkplaceHandler } from '../../netlify/functions/people-workplace.mjs';

// Profile ⇄ org chart: one job title, two views. These go through the real
// HTTP handlers (operator gate stubbed) against an in-memory store.

const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function fixture() {
  const store = memoryStore();
  const orgId = generateOrganisationId();
  const otherOrgId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const otherOrgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: otherOrgId });
  const personId = generatePersonId();
  const personRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });
  const names = { [personId]: 'Ava Tran', [orgId]: 'St Aloysius', [otherOrgId]: 'Riverview' };
  const resolveEntity = async (refInput) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const [, kind, id] = ref.split(':');
    if (!['person', 'organisation', 'position', 'unit'].includes(kind)) {
      throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
    }
    if ((kind === 'person' || kind === 'organisation') && !names[id]) {
      throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
    }
    return {
      ref,
      kind,
      display_label: names[id] ?? ref,
      supporting_label: null,
      href: null,
      lifecycle_status: 'active',
      visibility: 'operator'
    };
  };
  const deps = {
    env: ENV,
    verifySessionToken: () => ({ valid: true, payload: {} }),
    getContentStore: async () => store,
    resolveEntity
  };
  const chart = createOrgStructureHandler(deps);
  const workplace = createPeopleWorkplaceHandler(deps);
  const call = async (handler, method, path, body) => {
    const res = await handler(
      new Request(`https://api.adam-russell.com${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
      })
    );
    const json = await res.json();
    assert.ok(res.ok, `${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json.data;
  };
  const getChart = (id = orgId) => call(chart, 'GET', `/api/org-structure?organisation_id=${id}`);
  const setTitle = (body) => call(workplace, 'POST', '/api/people/workplace', { person_ref: personRef, ...body });
  const heldBy = (payload, ref) =>
    payload.graph.nodes.filter((n) => n.kind === 'position' && n.holder?.person_ref === ref).map((n) => n.title);
  return { store, orgId, orgRef, otherOrgId, otherOrgRef, personRef, chart, call, getChart, setTitle, heldBy };
}

test('profile → chart: setting a job title puts them on that organisation’s chart', async () => {
  const f = fixture();
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Head of Department Learning Enrichment' });
  const payload = await f.getChart();
  assert.deepEqual(f.heldBy(payload, f.personRef), ['Head of Department Learning Enrichment']);
  const here = payload.people_here.find((p) => p.person_ref === f.personRef);
  assert.equal(here.job_title, 'Head of Department Learning Enrichment');
  assert.equal(here.on_chart, true);
});

test('profile → chart: a new title renames their box instead of adding a second one', async () => {
  const f = fixture();
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Teacher' });
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Head of English' });
  const payload = await f.getChart();
  assert.deepEqual(f.heldBy(payload, f.personRef), ['Head of English']);
  assert.equal(payload.positions.filter((p) => p.lifecycle_status === 'active').length, 1);
});

test('profile → chart: a vacant box with the same title is filled rather than duplicated', async () => {
  const f = fixture();
  await f.call(f.chart, 'POST', '/api/org-structure?action=create_position', {
    organisation_ref: f.orgRef,
    title: 'Principal'
  });
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'principal' });
  const payload = await f.getChart();
  assert.equal(payload.positions.length, 1);
  assert.deepEqual(f.heldBy(payload, f.personRef), ['Principal']);
});

test('chart → profile: putting someone in a box and renaming it sets their job title', async () => {
  const f = fixture();
  const { position } = await f.call(f.chart, 'POST', '/api/org-structure?action=create_position', {
    organisation_ref: f.orgRef,
    title: 'Deputy Principal'
  });
  await f.call(f.chart, 'POST', '/api/org-structure?action=create_link', {
    organisation_ref: f.orgRef,
    relationship_type: 'holds_position',
    source_ref: f.personRef,
    target_ref: `shared:position:${position.id}`
  });
  let here = (await f.getChart()).people_here.find((p) => p.person_ref === f.personRef);
  assert.equal(here.job_title, 'Deputy Principal');
  assert.equal(here.relationship_type, 'employee_at');

  await f.call(f.chart, 'PATCH', `/api/org-structure?kind=position&entity_id=${position.id}`, {
    title: 'Deputy Principal (Wellbeing)'
  });
  here = (await f.getChart()).people_here.find((p) => p.person_ref === f.personRef);
  assert.equal(here.job_title, 'Deputy Principal (Wellbeing)');
});

test('moving jobs releases them from the old chart and adds them to the new one', async () => {
  const f = fixture();
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Teacher' });
  await f.setTitle({
    organisation_ref: f.otherOrgRef,
    job_title: 'Head of Science',
    replace_organisation_ref: f.orgRef
  });
  const oldChart = await f.getChart(f.orgId);
  assert.deepEqual(f.heldBy(oldChart, f.personRef), []);
  assert.equal(oldChart.people_here.length, 0);
  // The role outlasts the person: the box stays, vacant.
  assert.equal(oldChart.positions.filter((p) => p.lifecycle_status === 'active').length, 1);
  const newChart = await f.getChart(f.otherOrgId);
  assert.deepEqual(f.heldBy(newChart, f.personRef), ['Head of Science']);
});

test('a box you delete from the chart is not re-added by the profile sync', async () => {
  const f = fixture();
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Teacher' });
  const before = await f.getChart();
  const box = before.positions.find((p) => p.title === 'Teacher');
  await f.call(f.chart, 'POST', '/api/org-structure?action=archive_position', {
    organisation_ref: f.orgRef,
    position_id: box.id
  });
  const after = await f.getChart();
  assert.deepEqual(f.heldBy(after, f.personRef), []);
  assert.equal(after.people_here[0].on_chart, false);
  // …but a new title on their profile is a real change and does add them.
  await f.setTitle({ organisation_ref: f.orgRef, job_title: 'Head of Maths' });
  assert.deepEqual(f.heldBy(await f.getChart(), f.personRef), ['Head of Maths']);
});

test('a native workplace link supersedes the imported one for the same pair', () => {
  const imported = {
    link: {
      id: 'imp',
      relationship_type: 'employee_at',
      source_ref: 'shared:person:p',
      target_ref: 'shared:organisation:o',
      role: 'Teacher',
      import_source: 'professional_data'
    }
  };
  const otherImported = {
    link: { ...imported.link, id: 'imp2', target_ref: 'shared:organisation:x' }
  };
  const native = {
    link: { ...imported.link, id: 'nat', role: 'Head of English', import_source: undefined }
  };
  assert.deepEqual(
    withoutSupersededImports([imported, otherImported, native]).map((e) => e.link.id),
    ['imp2', 'nat']
  );
});

test('an imported person’s title becomes editable: adopted, and the edit replaces the imported title', async () => {
  const { derivePersonId, deriveOrganisationId, resetProfessionalDataCache } = await import(
    '../../netlify/functions/_shared/github-professional-data.mjs'
  );
  const { assembleEntityOverview } = await import('../../netlify/functions/_shared/entity-overview.mjs');
  const { getJSON, personKey } = await import('../../netlify/functions/_shared/universal-link-blobs.mjs');
  resetProfessionalDataCache();
  const env = { ...ENV, GITHUB_TOKEN: 'token' };
  const files = {
    'people.json': [{ legacy_id: 'leg-p', display_name: 'Lauren Stuart', sort_name: 'Stuart, Lauren', aliases: [] }],
    'organisations.json': [{ legacy_id: 'leg-o', display_name: 'St Aloysius', legal_name: null, aliases: [] }],
    'relationships.json': [
      {
        person_legacy_id: 'leg-p',
        organisation_legacy_id: 'leg-o',
        relationship_type: 'employee_at',
        role: 'Teacher',
        valid_from: null,
        valid_to: null
      }
    ]
  };
  const fetchImpl = async (url) => {
    const name = String(url).split('/data/professional/')[1];
    if (!files[name]) return { ok: false, status: 404 };
    const text = JSON.stringify(files[name]);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sha: `sha-${text.length}`,
        encoding: 'base64',
        content: Buffer.from(text).toString('base64'),
        size: Buffer.byteLength(text)
      })
    };
  };
  const store = memoryStore();
  const personId = derivePersonId('leg-p');
  const orgId = deriveOrganisationId('leg-o');
  const personRef = `shared:person:${personId}`;
  const orgRef = `shared:organisation:${orgId}`;
  const { resolvePerson, resolveOrganisation } = await import('../../netlify/functions/_shared/entity-resolvers.mjs');
  const resolveEntity = async (refInput, ctx) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const [, kind, id] = ref.split(':');
    const options = { env, fetchImpl, getStore: async () => store };
    if (kind === 'person') return resolvePerson(id, ctx, options);
    if (kind === 'organisation') return resolveOrganisation(id, ctx, options);
    return { ref, kind, display_label: ref, supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
  };
  const handler = createPeopleWorkplaceHandler({
    env,
    fetchImpl,
    verifySessionToken: () => ({ valid: true, payload: {} }),
    getContentStore: async () => store,
    resolveEntity
  });
  const res = await handler(
    new Request('https://api.adam-russell.com/api/people/workplace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person_ref: personRef, organisation_ref: orgRef, job_title: 'Head of English' })
    })
  );
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.ok(await getJSON(store, personKey(personId)), 'imported person adopted into Blobs');

  const overview = await assembleEntityOverview(personRef, { store, env, fetchImpl, resolveEntity });
  const workplaces = overview.current_relationships.filter((e) => e.link.relationship_type === 'employee_at');
  assert.deepEqual(workplaces.map((e) => e.link.role), ['Head of English']);
  resetProfessionalDataCache();
});

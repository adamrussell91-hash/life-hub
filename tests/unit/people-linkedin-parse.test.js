import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeopleLinkedInParseHandler } from '../../netlify/functions/people-linkedin-parse.mjs';
import {
  buildOrganisationIndex,
  completeLinkedInParse,
  LINKEDIN_TEXT_CAP,
  matchOrganisation,
  normaliseOrgName,
  normaliseParsedProfile
} from '../../netlify/functions/_shared/linkedin-profile.mjs';

const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const TALLOW = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002';
const MARROW = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000003';
const PERSON = 'shared:person:person_00000000-0000-4000-8000-000000000001';

const PROFILE = {
  name: 'Noor Vale',
  headline: 'Head of English',
  about: 'Teacher and writer.',
  positions: [
    { title: 'Head of English', organisation: 'Tallowwood College', start: '2022-02', end: null, current: true, kind: 'employee' },
    { title: 'Tutor', organisation: 'MARROW UNI', start: '2016', end: '2019', current: false, kind: 'employee' },
    { title: 'Chair', organisation: 'Reading Circle Inc.', start: '2020-13', end: null, current: true, kind: 'member' }
  ],
  education: [{ qualification: 'BA (Hons)', institution: 'Marrow University', start: '2010', end: '2013' }]
};

const ORGS = [
  { ref: TALLOW, display_label: 'Tallowwood College', aliases: [] },
  { ref: MARROW, display_label: 'Marrow University', aliases: ['Marrow Uni'] }
];

function handler(deps = {}) {
  return createPeopleLinkedInParseHandler({
    env: { ...ENV, ANTHROPIC_API_KEY: 'test' },
    verifySessionToken: () => ({ valid: true, payload: {} }),
    getContentStore: async () => ({ get: async () => null, list: async () => ({ blobs: [] }) }),
    complete: async () => structuredClone(PROFILE),
    loadOrganisations: async () => ORGS,
    ...deps
  });
}

async function post(h, body) {
  const res = await h(new Request('https://api.adam-russell.com/api/people/linkedin-parse', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { status: res.status, body: await res.json() };
}

test('linkedin parse: matches organisations exactly (name or alias) and marks the rest new', async () => {
  const { status, body } = await post(handler(), { text: 'pasted profile' });
  assert.equal(status, 200, JSON.stringify(body));
  const rows = body.data.rows.map((r) => [r.section, r.relationship_type, r.title, r.organisation.status, r.organisation.ref, r.start, r.diff]);
  assert.deepEqual(rows, [
    ['current', 'employee_at', 'Head of English', 'matched', TALLOW, '2022-02', 'new'],
    ['past', 'employee_at', 'Tutor', 'matched', MARROW, '2016', 'new'],
    ['current', 'member_of', 'Chair', 'new_organisation', null, null, 'new'],
    ['education', 'studied_at', 'BA (Hons)', 'matched', MARROW, '2010', 'new']
  ]);
  assert.equal(body.data.rows[1].organisation.name, 'Marrow University', 'the matched name is the record’s own');
  assert.equal(body.data.name, 'Noor Vale');
});

test('linkedin parse: with a person, rows diff against their links', async () => {
  let seenRef = null;
  const h = handler({
    loadExistingRoles: async (ref) => {
      seenRef = ref;
      return [
        { linkId: 'l1', type: 'employee_at', orgRef: TALLOW, orgName: 'Tallowwood College', title: 'Head of English', from: '2022-02-01T00:00:00.000Z', to: null },
        { linkId: 'l2', type: 'employee_at', orgRef: MARROW, orgName: 'Marrow University', title: 'tutor', from: '2015-01-01T00:00:00.000Z', to: '2019-01-01T00:00:00.000Z' },
        { linkId: 'l3', type: 'member_of', orgRef: 'x', orgName: 'Reading Circle, Inc', title: 'Chair', from: null, to: null }
      ];
    }
  });
  const { body } = await post(h, { text: 'pasted', person_ref: PERSON });
  assert.equal(seenRef, PERSON);
  assert.deepEqual(body.data.rows.map((r) => [r.title, r.diff, r.link_id]), [
    ['Head of English', 'same', 'l1'],
    ['Tutor', 'changed', 'l2'],
    ['Chair', 'same', 'l3'],
    ['BA (Hons)', 'new', null]
  ]);
});

test('linkedin parse: cap, empty, unconfigured and bad model output', async () => {
  const long = await post(handler(), { text: 'x'.repeat(LINKEDIN_TEXT_CAP + 1) });
  assert.equal(long.status, 413);
  assert.equal(long.body.error.message, 'That’s longer than a profile. Paste just the profile page.');

  const empty = await post(handler(), { text: '   ' });
  assert.equal(empty.status, 400);

  const unconfigured = createPeopleLinkedInParseHandler({
    env: ENV, verifySessionToken: () => ({ valid: true, payload: {} }),
    getContentStore: async () => ({ get: async () => null, list: async () => ({ blobs: [] }) })
  });
  const off = await post(unconfigured, { text: 'pasted' });
  assert.equal(off.status, 503);
  assert.equal(off.body.error.code, 'linkedin_parse_unconfigured');

  const bad = await post(handler({ complete: async () => ({ nonsense: true }) }), { text: 'secret paste words' });
  assert.equal(bad.status, 502);
  assert.equal(bad.body.error.message, 'Couldn’t read that paste. Try again or type it in.');
  assert.ok(!JSON.stringify(bad.body).includes('secret paste words'), 'the paste is never echoed');

  const throws = await post(handler({ complete: async () => { throw new Error('boom'); } }), { text: 'pasted' });
  assert.equal(throws.status, 502);
});

test('linkedin profile: normalising, matching and the Claude request', async () => {
  assert.equal(normaliseOrgName("St Mary’s College, Inc."), 'st marys college inc');
  assert.equal(normaliseOrgName('Arts & Letters'), 'arts and letters');
  const index = buildOrganisationIndex([...ORGS, { ref: 'dup', display_label: 'Tallowwood College', aliases: [] }]);
  assert.equal(matchOrganisation(index, 'tallowwood college'), null, 'a name two organisations share matches neither');
  assert.equal(matchOrganisation(index, 'Marrow-Uni')?.ref, MARROW);

  const profile = normaliseParsedProfile({ ...PROFILE, about: 'a'.repeat(400) });
  assert.equal(profile.about.length, 280);
  assert.equal(profile.positions[2].start, null, 'an impossible month becomes null');

  let sent = null;
  const fetchImpl = async (url, init) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(PROFILE) }] }), { status: 200 });
  };
  const out = await completeLinkedInParse({ env: { ANTHROPIC_API_KEY: 'k' }, text: 'paste', fetchImpl });
  assert.equal(out.name, 'Noor Vale');
  assert.equal(sent.body.model, 'claude-sonnet-5-5');
  assert.equal(sent.body.max_tokens, 2000);
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.equal(sent.body.output_config.format.schema.additionalProperties, false);

  const refusal = async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }), { status: 200 });
  await assert.rejects(completeLinkedInParse({ env: { ANTHROPIC_API_KEY: 'k' }, text: 'p', fetchImpl: refusal }), { code: 'linkedin_parse_failed' });
});

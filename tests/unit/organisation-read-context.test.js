import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANN_ORGANISATION_READ_INSTRUCTIONS,
  assembleOrganisationReadContext,
  buildOrganisationReadRequestString,
  createOrganisationReadStore,
  deriveRealPowerThread,
  listContextInputKeys
} from '../../netlify/functions/_shared/organisation-read.mjs';
import { mergeOrganisationReadPreservingAdam } from '../../netlify/functions/_shared/organisation-read-schema.mjs';

const ORG_REF = 'shared:organisation:organisation_00000000-0000-4000-8000-0000000000aa';

function aloysiusFixtureContext() {
  return assembleOrganisationReadContext({
    organisationRef: ORG_REF,
    structure: {
      organisation_ref: ORG_REF,
      nodes: [
        { kind: 'unit', name: 'English faculty' },
        { kind: 'unit', name: 'Learning Enrichment' },
        { kind: 'unit', name: 'Accreditation mentors' }
      ],
      edges: [
        { from: 'adam', to: 'Head of English', derived: true },
        { from: 'adam', to: 'Leader of Learning Enrichment', derived: true },
        { from: 'adam', to: 'Director of Professional Learning', derived: true }
      ],
      member_count: 82
    },
    memberships: [
      {
        unit_name: 'English faculty',
        unit_ref: 'shared:unit:unit_english',
        role: 'English teacher',
        person_ref: 'shared:person:person_adam'
      },
      {
        unit_name: 'Learning Enrichment',
        unit_ref: 'shared:unit:unit_enrichment',
        role: 'gifted education teacher',
        person_ref: 'shared:person:person_adam'
      },
      {
        unit_name: 'Accreditation mentors',
        unit_ref: 'shared:unit:unit_mentors',
        role: 'accreditation mentor',
        person_ref: 'shared:person:person_adam'
      }
    ],
    warmthByUnit: {
      'shared:unit:unit_english': { warm: 2, cooling: 1, cold: 4 },
      'shared:unit:unit_enrichment': { warm: 1, cooling: 0, cold: 2 }
    },
    observations: [{ text: 'Staff handbook emphasises Jesuit mission.', source: 'manual' }],
    meetings: [],
    openOpportunities: [{ id: 'opportunity_1', title: 'PD grant', status: 'open' }]
  });
}

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
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

test('Availability: context builder returns all six inputs for fixture', () => {
  const context = aloysiusFixtureContext();
  const keys = listContextInputKeys(context);
  assert.deepEqual(keys, [
    'structure',
    'memberships',
    'warmth_by_unit',
    'observations',
    'meetings',
    'open_opportunities'
  ]);
  assert.equal(context.memberships.length, 3);
  assert.equal(context.structure.member_count, 82);
  assert.ok(context.warmth_by_unit['shared:unit:unit_english']);
  assert.equal(context.observations.length, 1);
  assert.ok(Array.isArray(context.meetings));
  assert.equal(context.open_opportunities.length, 1);
});

test('Delivery: structure block and three memberships reach final request string', () => {
  const context = aloysiusFixtureContext();
  const { finalRequest } = buildOrganisationReadRequestString(context);
  assert.match(finalRequest, /## STRUCTURE/);
  assert.match(finalRequest, /English faculty/);
  assert.match(finalRequest, /Learning Enrichment/);
  assert.match(finalRequest, /Accreditation mentors/);
  assert.match(finalRequest, /## MEMBERSHIPS/);
  assert.match(finalRequest, /English teacher in English faculty/);
  assert.match(finalRequest, /gifted education teacher in Learning Enrichment/);
  assert.match(finalRequest, /accreditation mentor in Accreditation mentors/);
});

test('Interpretation: instructions explain blocks and real_power source rule', () => {
  assert.match(ANN_ORGANISATION_READ_INSTRUCTIONS, /STRUCTURE/);
  assert.match(ANN_ORGANISATION_READ_INSTRUCTIONS, /MEMBERSHIPS/);
  assert.match(ANN_ORGANISATION_READ_INSTRUCTIONS, /MEETINGS/);
  assert.match(
    ANN_ORGANISATION_READ_INSTRUCTIONS,
    /real_power.*needs a meeting or note source/i
  );
  const { instructions } = buildOrganisationReadRequestString(aloysiusFixtureContext());
  assert.equal(instructions, ANN_ORGANISATION_READ_INSTRUCTIONS);
});

test('Behaviour: meeting where deputy decides yields real_power naming the deputy', () => {
  const context = assembleOrganisationReadContext({
    organisationRef: ORG_REF,
    structure: { nodes: [], edges: [], member_count: 10 },
    memberships: [],
    warmthByUnit: {},
    observations: [],
    meetings: [
      {
        ref: 'professional:meeting:meeting_1',
        topic: 'staffing',
        decision_maker: 'Deputy · Staff',
        decision_maker_role: 'deputy',
        excerpt: 'Deputy confirmed the hire; principal absent.'
      }
    ],
    openOpportunities: []
  });
  const thread = deriveRealPowerThread(context);
  assert.ok(thread);
  assert.equal(thread.key, 'real_power');
  assert.match(thread.text, /Deputy · Staff/);
  assert.doesNotMatch(thread.text, /principal sits/i);
  assert.equal(thread.sources[0].ref, 'professional:meeting:meeting_1');
});

test('Behaviour negative control: without meetings, real_power is not claimed', () => {
  const context = aloysiusFixtureContext();
  assert.equal(context.meetings.length, 0);
  assert.equal(deriveRealPowerThread(context), null);
});

test('Adam-authored threads are never overwritten on merge', () => {
  const existing = {
    organisation_ref: ORG_REF,
    threads: [
      {
        key: 'real_power',
        text: 'Adam says power sits with the Rector.',
        sources: [],
        author: 'adam'
      }
    ]
  };
  const generated = {
    organisation_ref: ORG_REF,
    summary: 'Fresh Ann summary.',
    threads: [
      {
        key: 'real_power',
        text: 'Ann claims the deputy.',
        sources: [],
        author: 'ann'
      },
      {
        key: 'culture',
        text: 'Mission language is strong.',
        sources: [],
        author: 'ann'
      }
    ],
    generated_at: '2026-09-27T00:00:00.000Z',
    status: 'ready'
  };
  const merged = mergeOrganisationReadPreservingAdam(existing, generated);
  const realPower = merged.threads.find((t) => t.key === 'real_power');
  assert.equal(realPower.author, 'adam');
  assert.match(realPower.text, /Rector/);
  assert.ok(merged.threads.some((t) => t.key === 'culture' && t.author === 'ann'));
});

test('runNow persists a read and preserves adam threads', async () => {
  const store = memoryStore();
  const readStore = createOrganisationReadStore({
    store,
    now: () => '2026-09-27T07:00:00.000Z'
  });
  await readStore.saveRead({
    schema_version: 1,
    organisation_ref: ORG_REF,
    summary: 'Prior',
    threads: [
      {
        key: 'culture',
        text: 'Adam edit on culture.',
        sources: [],
        author: 'adam'
      }
    ],
    generated_at: '2026-09-20T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
    status: 'ready',
    error: null
  });

  const result = await readStore.runNow({
    organisationRef: ORG_REF,
    contextInputs: {
      structure: { nodes: [], edges: [], member_count: 3 },
      memberships: [
        { unit_name: 'English faculty', role: 'English teacher' },
        { unit_name: 'Learning Enrichment', role: 'gifted education teacher' },
        { unit_name: 'Accreditation mentors', role: 'accreditation mentor' }
      ],
      warmthByUnit: {},
      observations: [],
      meetings: [
        {
          ref: 'professional:meeting:m1',
          topic: 'budget',
          decision_maker: 'Deputy · Staff',
          decision_maker_role: 'deputy'
        }
      ],
      openOpportunities: []
    }
  });

  assert.equal(result.read.status, 'ready');
  const culture = result.read.threads.find((t) => t.key === 'culture');
  assert.equal(culture.author, 'adam');
  assert.match(culture.text, /Adam edit/);
  const realPower = result.read.threads.find((t) => t.key === 'real_power');
  assert.ok(realPower);
  assert.match(realPower.text, /Deputy · Staff/);
  assert.match(result.request.finalRequest, /## STRUCTURE/);
  assert.match(result.request.finalRequest, /English teacher in English faculty/);
});

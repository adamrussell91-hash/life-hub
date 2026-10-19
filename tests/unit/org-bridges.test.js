import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrgBridges,
  evaluateUsefulLink,
  findBridgeCandidates,
  selectUsefulBridges
} from '../../netlify/functions/_shared/org-bridges.mjs';

const TALLOWWOOD = 'shared:organisation:organisation_tallowwood';
const BANKSIA = 'shared:organisation:organisation_banksia';
const ADAM = 'person_adam';
const HENRY = 'person_henry';
const BIANCA = 'person_bianca';
const OTHER = 'person_other';

test('candidates: moved when employee_at in both organisations', () => {
  const candidates = findBridgeCandidates({
    orgA: {
      ref: TALLOWWOOD,
      employeeIds: [ADAM, HENRY],
      people: [{ id: ADAM }, { id: HENRY }]
    },
    orgB: {
      ref: BANKSIA,
      employeeIds: [ADAM, BIANCA],
      people: [{ id: ADAM }, { id: BIANCA }]
    },
    warmthByPerson: { [ADAM]: 'warm', [HENRY]: 'warm', [BIANCA]: 'cold' }
  });
  const moved = candidates.filter((c) => c.kind === 'moved');
  assert.equal(moved.length, 1);
  assert.equal(moved[0].person_a_id, ADAM);
});

test('candidates: know_each_other across organisations', () => {
  const candidates = findBridgeCandidates({
    orgA: { ref: TALLOWWOOD, people: [{ id: HENRY }] },
    orgB: { ref: BANKSIA, people: [{ id: BIANCA }] },
    professionalRelationships: [
      { source_id: HENRY, target_id: BIANCA, role: 'former_colleague' }
    ],
    warmthByPerson: { [HENRY]: 'warm', [BIANCA]: 'cold' }
  });
  assert.ok(candidates.some((c) => c.kind === 'know_each_other'));
  assert.equal(candidates[0].person_a_id, HENRY);
  assert.equal(candidates[0].person_b_id, BIANCA);
});

test('candidates: met_at_event shared attendees', () => {
  const candidates = findBridgeCandidates({
    orgA: { ref: TALLOWWOOD, people: [{ id: HENRY }] },
    orgB: { ref: BANKSIA, people: [{ id: BIANCA }] },
    sharedEventAttendances: [
      {
        event_ref: 'professional:event:e1',
        event_title: 'Gifted Ed network',
        person_ids: [HENRY, BIANCA]
      }
    ]
  });
  assert.ok(candidates.some((c) => c.kind === 'met_at_event'));
});

test('useful-link rule 1: warm near → cold far is shown', () => {
  const candidate = {
    kind: 'know_each_other',
    person_a_id: HENRY,
    person_b_id: BIANCA,
    org_a_ref: TALLOWWOOD,
    org_b_ref: BANKSIA,
    warmth_a: 'warm',
    warmth_b: 'cold'
  };
  const verdict = evaluateUsefulLink(candidate, {
    nearOrgRef: TALLOWWOOD,
    displayNames: { [HENRY]: 'Henry', [BIANCA]: 'Bianca' }
  });
  assert.equal(verdict.useful, true);
  assert.equal(verdict.rule, 1);
  assert.match(verdict.reason, /Henry/);
  assert.match(verdict.reason, /Bianca/);
});

test('useful-link rule 2: open opportunity tie is shown', () => {
  const candidate = {
    kind: 'know_each_other',
    person_a_id: OTHER,
    person_b_id: BIANCA,
    org_a_ref: TALLOWWOOD,
    org_b_ref: BANKSIA,
    warmth_a: 'cold',
    warmth_b: 'cold'
  };
  const verdict = evaluateUsefulLink(candidate, {
    openOpportunityPersonIds: [BIANCA]
  });
  assert.equal(verdict.useful, true);
  assert.equal(verdict.rule, 2);
});

test('useful-link rule 3: Adam move + upcoming cold former colleagues', () => {
  const candidate = {
    kind: 'moved',
    person_a_id: ADAM,
    person_b_id: ADAM,
    org_a_ref: TALLOWWOOD,
    org_b_ref: BANKSIA,
    warmth_a: 'warm',
    warmth_b: 'warm'
  };
  const verdict = evaluateUsefulLink(candidate, {
    selfPersonId: ADAM,
    warmthByPerson: { [ADAM]: 'warm', [BIANCA]: 'cold' },
    upcomingEvents: [
      {
        event_ref: 'professional:event:reunion',
        starts_at: '2027-01-01T00:00:00.000Z',
        person_ids: [ADAM, BIANCA]
      }
    ],
    now: '2026-09-27T00:00:00.000Z'
  });
  assert.equal(verdict.useful, true);
  assert.equal(verdict.rule, 3);
});

test('hidden count: warm↔warm know_each_other is hidden (V4)', () => {
  const candidates = findBridgeCandidates({
    orgA: { ref: TALLOWWOOD, people: [{ id: HENRY }, { id: OTHER }] },
    orgB: { ref: BANKSIA, people: [{ id: BIANCA }, { id: 'person_warm_b' }] },
    professionalRelationships: [
      { source_id: HENRY, target_id: BIANCA },
      { source_id: OTHER, target_id: 'person_warm_b' }
    ],
    warmthByPerson: {
      [HENRY]: 'warm',
      [BIANCA]: 'cold',
      [OTHER]: 'warm',
      person_warm_b: 'warm'
    }
  });
  const { bridges, hidden_count, hidden_label } = selectUsefulBridges(candidates, {
    nearOrgRef: TALLOWWOOD,
    displayNames: { [HENRY]: 'Henry', [BIANCA]: 'Bianca' }
  });
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].number, 1);
  assert.equal(bridges[0].person_a_id, HENRY);
  assert.equal(hidden_count, 1);
  assert.equal(hidden_label, '1 more hidden');
});

test('buildOrgBridges: Henry→Bianca shown only while Bianca is cold', () => {
  const base = {
    orgA: { ref: TALLOWWOOD, people: [{ id: HENRY, display_name: 'Henry' }] },
    orgB: { ref: BANKSIA, people: [{ id: BIANCA, display_name: 'Bianca' }] },
    professionalRelationships: [{ source_id: HENRY, target_id: BIANCA }],
    nearOrgRef: TALLOWWOOD,
    displayNames: { [HENRY]: 'Henry', [BIANCA]: 'Bianca' }
  };

  const cold = buildOrgBridges({
    ...base,
    warmthByPerson: { [HENRY]: 'warm', [BIANCA]: 'cold' }
  });
  assert.equal(cold.bridges.length, 1);
  assert.match(cold.bridges[0].reason, /Henry/);

  const warmBianca = buildOrgBridges({
    ...base,
    warmthByPerson: { [HENRY]: 'warm', [BIANCA]: 'warm' }
  });
  assert.equal(warmBianca.bridges.length, 0);
  assert.equal(warmBianca.hidden_count, 1);
});

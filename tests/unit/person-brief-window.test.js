import assert from 'node:assert/strict';
import test from 'node:test';
import { collectChangesSince, findLastMeaningfulInteraction } from '../../netlify/functions/_shared/person-brief-window.mjs';

const NOW = '2026-09-17T00:00:00.000Z';

function communicationEntry({ id = 'link_comm_1', date = '2026-06-01T00:00:00.000Z', label = 'received_communication Budget update' } = {}) {
  return {
    id,
    kind: 'point',
    date,
    end_date: null,
    label,
    context_key: null,
    source_ref: `professional:communication:communication_${id}`,
    target_ref: 'shared:person:person_subject',
    href: `#/communication/communication_${id}`,
    context_href: null
  };
}

function meetingEntry({ id = 'link_meeting_1', date = '2026-07-01T00:00:00.000Z', label = 'attends Coffee meeting' } = {}) {
  return {
    id,
    kind: 'point',
    date,
    end_date: null,
    label,
    context_key: null,
    source_ref: `professional:meeting:meeting_${id}`,
    target_ref: 'shared:person:person_subject',
    href: `#/meeting/meeting_${id}`,
    context_href: null
  };
}

function eventEntry({ id = 'link_event_1', date = '2026-07-01T00:00:00.000Z', label = 'attends Gifted Education Network' } = {}) {
  return {
    id,
    kind: 'point',
    date,
    end_date: null,
    label,
    context_key: null,
    source_ref: `professional:event:event_${id}`,
    target_ref: 'shared:person:person_subject',
    href: `#/event/event_${id}`,
    context_href: null
  };
}

function employeeAtEntry({ id = 'link_emp_1', validFrom = '2026-08-01T00:00:00.000Z', validTo = null, label = 'employee_at Acme' } = {}) {
  return {
    id,
    kind: 'period',
    date: validFrom,
    end_date: validTo,
    label,
    context_key: null,
    source_ref: 'shared:person:person_subject',
    target_ref: 'shared:organisation:organisation_acme',
    href: '#/organisation/organisation_acme',
    context_href: null
  };
}

function observation({ id = 'observation_1', occurred_at = '2026-05-01T00:00:00.000Z', text = 'Noted a note.' } = {}) {
  return { id, about_ref: 'shared:person:person_subject', text, occurred_at, source: 'manual', linked_ref: null, created_at: occurred_at, updated_at: occurred_at };
}

function relationshipLink({
  relationship_type = 'employee_at',
  status = 'current',
  valid_from = null,
  valid_to = null,
  role = null,
  counterpart_ref = 'shared:organisation:organisation_acme',
  counterpart_name = 'Acme'
} = {}) {
  return {
    link: { relationship_type, status, valid_from, valid_to, role, metadata: {} },
    endpoint: { ref: counterpart_ref, display_label: counterpart_name, href: `#/${counterpart_ref}`, kind: counterpart_ref.includes('organisation') ? 'organisation' : 'person' }
  };
}

// --- findLastMeaningfulInteraction ---

test('findLastMeaningfulInteraction picks a communication as the most recent meaningful interaction', () => {
  const timeline = [communicationEntry({ id: 'c1', date: '2026-08-01T00:00:00.000Z' })];
  const observations = [observation({ id: 'o1', occurred_at: '2026-06-01T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, observations, NOW);
  assert.equal(result.kind, 'communication');
  assert.equal(result.date, '2026-08-01T00:00:00.000Z');
});

test('a past meeting counts as a meaningful interaction', () => {
  const timeline = [meetingEntry({ date: '2026-08-15T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result.kind, 'meeting');
  assert.equal(result.date, '2026-08-15T00:00:00.000Z');
});

test('a FUTURE meeting does NOT count toward last meaningful interaction', () => {
  const timeline = [
    meetingEntry({ id: 'past', date: '2026-07-01T00:00:00.000Z' }),
    meetingEntry({ id: 'future', date: '2026-12-01T00:00:00.000Z' })
  ];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result.id, 'past');
  assert.equal(result.date, '2026-07-01T00:00:00.000Z');
});

test('a future-only timeline (no past meeting) yields null when there is nothing else', () => {
  const timeline = [meetingEntry({ date: '2026-12-01T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result, null);
});

test('an event counts as a meaningful interaction when in the past', () => {
  const timeline = [eventEntry({ date: '2026-08-20T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result.kind, 'event');
});

test('an observation counts as a meaningful interaction', () => {
  const result = findLastMeaningfulInteraction([], [observation({ occurred_at: '2026-09-01T00:00:00.000Z' })], NOW);
  assert.equal(result.kind, 'observation');
  assert.equal(result.date, '2026-09-01T00:00:00.000Z');
});

test('a relationship open/close event alone does NOT count as meaningful — falls through to null', () => {
  const timeline = [employeeAtEntry({ validFrom: '2026-08-01T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result, null);
});

test('a relationship change falls through to an observation/comm/meeting when one exists', () => {
  const timeline = [
    employeeAtEntry({ validFrom: '2026-08-01T00:00:00.000Z' }),
    communicationEntry({ date: '2026-05-01T00:00:00.000Z' })
  ];
  const result = findLastMeaningfulInteraction(timeline, [], NOW);
  assert.equal(result.kind, 'communication');
});

test('the most recent of several categories wins', () => {
  const timeline = [
    communicationEntry({ id: 'c1', date: '2026-05-01T00:00:00.000Z' }),
    meetingEntry({ id: 'm1', date: '2026-08-01T00:00:00.000Z' })
  ];
  const observations = [observation({ occurred_at: '2026-06-15T00:00:00.000Z' })];
  const result = findLastMeaningfulInteraction(timeline, observations, NOW);
  assert.equal(result.kind, 'meeting');
});

// Brand-new-person fallback: findLastMeaningfulInteraction itself returns
// null (it is never given `created_at` — that fallback is the caller's
// responsibility, per this module's documented contract).
test('brand-new-person fallback: no data at all yields null, not a thrown error', () => {
  const result = findLastMeaningfulInteraction([], [], NOW);
  assert.equal(result, null);
});

// --- collectChangesSince ---

test('collectChangesSince reports relationship links that opened in the window', () => {
  const relationshipLinks = [
    relationshipLink({ relationship_type: 'employee_at', valid_from: '2026-07-01T00:00:00.000Z', counterpart_name: 'Acme' })
  ];
  const result = collectChangesSince([], [], relationshipLinks, '2026-06-01T00:00:00.000Z', NOW);
  assert.equal(result.relationship_changes.length, 1);
  assert.equal(result.relationship_changes[0].type, 'opened');
  assert.equal(result.relationship_changes[0].relationship_type, 'employee_at');
  assert.equal(result.relationship_changes[0].counterpart_name, 'Acme');
  assert.equal(result.relationship_changes[0].date, '2026-07-01T00:00:00.000Z');
});

test('collectChangesSince reports relationship links that closed in the window', () => {
  const relationshipLinks = [
    relationshipLink({
      relationship_type: 'professional_relationship',
      status: 'ended',
      valid_from: '2025-01-01T00:00:00.000Z',
      valid_to: '2026-07-15T00:00:00.000Z',
      counterpart_ref: 'shared:person:person_other',
      counterpart_name: 'Nina Fraser'
    })
  ];
  const result = collectChangesSince([], [], relationshipLinks, '2026-06-01T00:00:00.000Z', NOW);
  assert.equal(result.relationship_changes.length, 1);
  assert.equal(result.relationship_changes[0].type, 'closed');
  assert.equal(result.relationship_changes[0].counterpart_name, 'Nina Fraser');
});

test('collectChangesSince excludes relationship changes outside the window', () => {
  const relationshipLinks = [
    relationshipLink({ relationship_type: 'member_of', valid_from: '2026-01-01T00:00:00.000Z' }),
    relationshipLink({ relationship_type: 'member_of', valid_from: '2026-12-01T00:00:00.000Z' })
  ];
  const result = collectChangesSince([], [], relationshipLinks, '2026-06-01T00:00:00.000Z', NOW);
  assert.equal(result.relationship_changes.length, 0);
});

test('collectChangesSince ignores relationship types outside the three named ones', () => {
  const relationshipLinks = [
    { link: { relationship_type: 'collaborator', status: 'current', valid_from: null, valid_to: null }, endpoint: { ref: 'x', display_label: 'X' } }
  ];
  const result = collectChangesSince([], [], relationshipLinks, '2026-01-01T00:00:00.000Z', NOW);
  assert.equal(result.relationship_changes.length, 0);
});

test('collectChangesSince excludes the anchor instant itself (strictly after sinceIso)', () => {
  const relationshipLinks = [relationshipLink({ relationship_type: 'employee_at', valid_from: '2026-06-01T00:00:00.000Z' })];
  const result = collectChangesSince([], [], relationshipLinks, '2026-06-01T00:00:00.000Z', NOW);
  assert.equal(result.relationship_changes.length, 0);
});

test('collectChangesSince returns new_observations/new_communications/new_meetings_events within the window', () => {
  const timeline = [communicationEntry({ date: '2026-06-15T00:00:00.000Z' }), meetingEntry({ date: '2026-06-20T00:00:00.000Z' })];
  const observations = [observation({ occurred_at: '2026-06-10T00:00:00.000Z' })];
  const result = collectChangesSince(timeline, observations, [], '2026-06-01T00:00:00.000Z', NOW);
  assert.equal(result.new_communications.length, 1);
  assert.equal(result.new_meetings_events.length, 1);
  assert.equal(result.new_meetings_events[0].kind, 'meeting');
  assert.equal(result.new_observations.length, 1);
});

test('collectChangesSince returns an all-empty structured object when there is nothing in the window', () => {
  const result = collectChangesSince([], [], [], '2026-06-01T00:00:00.000Z', NOW);
  assert.deepEqual(result, {
    new_observations: [],
    new_communications: [],
    new_meetings_events: [],
    relationship_changes: []
  });
});

// Brand-new-person fallback, exercised through collectChangesSince too: when
// `sinceIso` is a person's own `created_at` (no meaningful interaction at
// all), any relationship links opened after that point still surface.
test('brand-new-person fallback window: relationship opened after created_at surfaces as a change', () => {
  const createdAt = '2026-09-01T00:00:00.000Z';
  const relationshipLinks = [relationshipLink({ relationship_type: 'employee_at', valid_from: '2026-09-10T00:00:00.000Z' })];
  const result = collectChangesSince([], [], relationshipLinks, createdAt, NOW);
  assert.equal(result.relationship_changes.length, 1);
});

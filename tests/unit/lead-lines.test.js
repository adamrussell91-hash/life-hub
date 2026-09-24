import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, almanacSummary, daysBetween, leadLine, leadLines, overlapsTerm, stepStatus } from '../../packages/design-kit/js/lead-lines.js';
import { ALMANAC_RULES } from '../../apps/life/js/app/almanac-rules.js';

const TODAY = '2026-09-24';
const TERMS = [{ starts_on: '2026-07-21', ends_on: '2026-09-25' }, { starts_on: '2026-10-13', ends_on: '2026-12-17' }];
// Adam's real anchors (central-node.md, 24/09/26).
const ANCHORS = [
  { id: 'korea', title: 'Korea honeymoon', kind: 'trip', date: '2026-12-23', returns: '2027-01-10', tags: ['international', 'pets-home-alone', 'on-biologic'] },
  { id: 'solo-travel', title: 'Solo travel', kind: 'trip', date: '2026-12-01', returns: '2026-12-15', tags: ['undecided'] },
  { id: 'vitamin-d', title: 'Vitamin D recheck', kind: 'medical', window: { opens: addMonths('2026-06-19', 3), closes: addMonths('2026-06-19', 4) }, tags: ['bloods'] },
  { id: 'unsw-conferral', title: 'UNSW conferral', kind: 'event', date: '2026-09-30', tags: ['graduation'] },
  { id: 'term-4', title: 'Term 4', kind: 'term', date: '2026-10-13', tags: ['new-class'] },
  { id: 'dream-study', title: 'Dream', kind: 'dream', tags: ['dream'] }
];
const ctx = { today: TODAY, terms: TERMS };
const steps = line => line.steps.map(s => `${s.ruleId}@${s.lastSafe}:${s.status}`);

test('date math', () => {
  assert.equal(addDays('2026-12-23', -61), '2026-10-23');
  assert.equal(daysBetween('2026-09-24', '2026-09-27'), 3);
  assert.equal(addMonths('2026-06-19', 3), '2026-09-19');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.throws(() => addDays('24/09/26', 1), TypeError);
});

test('step status thresholds', () => {
  assert.equal(stepStatus('2026-09-23', TODAY), 'overdue');
  assert.equal(stepStatus('2026-10-01', TODAY), 'now');
  assert.equal(stepStatus('2026-10-29', TODAY), 'soon');
  assert.equal(stepStatus('2026-10-30', TODAY), 'later');
  assert.equal(stepStatus('2026-09-23', TODAY, { done: true }), 'done');
  assert.equal(stepStatus('2026-12-01', TODAY, { windowOpen: true }), 'now');
});

test('Korea: passport, pet sitter, Stelara plan and insurance, in last-safe order', () => {
  const line = leadLine(ANCHORS[0], ALMANAC_RULES, ctx);
  assert.deepEqual(steps(line), [
    'passport@2026-10-23:soon', 'pet-sitter@2026-10-28:soon', 'medication-plan@2026-11-18:later', 'insurance@2026-12-02:later'
  ]);
  assert.equal(line.from, '2026-10-23');
  assert.equal(line.status, 'soon');
  assert.equal(line.steps.find(s => s.ruleId === 'leave'), undefined, 'Korea starts after term, so no leave form');
});

test('solo travel during term needs leave approval', () => {
  const line = leadLine(ANCHORS[1], ALMANAC_RULES, ctx);
  assert.deepEqual(steps(line), ['decide-where@2026-10-16:soon', 'leave@2026-10-30:later', 'insurance@2026-11-10:later']);
  assert.equal(overlapsTerm('2026-12-01', '2026-12-15', TERMS), true);
  assert.equal(overlapsTerm('2026-12-23', '2027-01-10', TERMS), false);
});

test('Vitamin D recheck is due now: the window is open and nothing is booked', () => {
  const line = leadLine(ANCHORS[2], ALMANAC_RULES, ctx);
  assert.equal(line.windowOpen, true);
  assert.deepEqual(steps(line), ['book-recheck@2026-10-12:now']);
  const booked = leadLine(ANCHORS[2], ALMANAC_RULES, { ...ctx, done: new Set(['vitamin-d:book-recheck']) });
  assert.equal(booked.steps[0].status, 'done');
});

test('dreams get a runway from absolute dates', () => {
  const line = leadLine(ANCHORS[5], ALMANAC_RULES, ctx);
  assert.equal(line.end, null);
  assert.deepEqual(steps(line), ['dream-windows@2026-11-02:later']);
});

test('all lines: most urgent first, past anchors dropped, headline numbers', () => {
  const lines = leadLines([...ANCHORS, { id: 'old', title: 'Past', kind: 'event', date: '2026-09-01', tags: ['graduation'] }], ALMANAC_RULES, ctx);
  assert.deepEqual(lines.map(l => l.anchor.id), ['unsw-conferral', 'vitamin-d', 'term-4', 'solo-travel', 'korea', 'dream-study']);
  assert.deepEqual(almanacSummary(lines), { unbooked: 2, lastSafeSoon: 7 });
});

test('a rule that names nothing applies to nothing', () => {
  const line = leadLine(ANCHORS[0], [{ id: 'x', title: 'X', leadDays: 1 }], ctx);
  assert.deepEqual(line.steps, []);
});

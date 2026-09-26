import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAREER_SCHEMA_VERSION,
  generateAchievementId,
  generateFutureId,
  generateSteppingStoneId,
  isSteppingStoneDone,
  parseAchievementRecord,
  parseFutureRecord,
  parseSteppingStoneRecord,
  readinessPercent,
  validateAchievementCreateInput,
  validateFutureCreateInput
} from '../../netlify/functions/_shared/career-schema.mjs';

test('parseAchievementRecord rejects unknown keys', () => {
  const id = generateAchievementId();
  const base = {
    schema_version: CAREER_SCHEMA_VERSION,
    id,
    title: 'Policy',
    occurred_on: '2026-09-15',
    date_precision: 'day',
    star: { situation: null, task: null, action: null, result: null },
    skills: ['policy'],
    apst: ['3.2'],
    origin: 'manual',
    lifecycle_status: 'active',
    created_at: '2026-09-15T00:00:00.000Z',
    updated_at: '2026-09-15T00:00:00.000Z'
  };
  assert.ok(parseAchievementRecord(base));
  assert.equal(parseAchievementRecord({ ...base, extra: true }), null);
});

test('validateAchievementCreateInput trims and bounds skills', () => {
  const validated = validateAchievementCreateInput({
    title: '  Gifted policy  ',
    occurred_on: '2026-09-15',
    date_precision: 'month',
    skills: ['Policy', 'policy', '  Leadership  ']
  });
  assert.equal(validated.title, 'Gifted policy');
  assert.deepEqual(validated.skills, ['Policy', 'Leadership']);
});

test('future criteria get fcrit_ ids', () => {
  const validated = validateFutureCreateInput({
    title: 'Deputy',
    criteria: [{ text: 'Lead a faculty', source: 'ad' }]
  });
  assert.equal(validated.criteria.length, 1);
  assert.match(validated.criteria[0].id, /^fcrit_/);
  const id = generateFutureId();
  const record = parseFutureRecord({
    schema_version: CAREER_SCHEMA_VERSION,
    id,
    title: 'Deputy',
    where: null,
    aliases: [],
    criteria: validated.criteria,
    target_date: null,
    status: 'active',
    suggested_reason: null,
    dismissed_until: null,
    lane_order: 0,
    colour_slot: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  assert.ok(record);
});

test('stepping stone parse + done derivation', () => {
  const id = generateSteppingStoneId();
  const stone = parseSteppingStoneRecord({
    schema_version: CAREER_SCHEMA_VERSION,
    id,
    label: 'Lead a faculty',
    target_term_start: null,
    status_override: null,
    origin: 'gap',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  assert.ok(stone);
  assert.equal(isSteppingStoneDone(stone, [{ kind: 'goal', lifecycle_status: 'achieved' }]), true);
});

test('readinessPercent mean formula', () => {
  assert.equal(readinessPercent([], []), null);
  assert.equal(
    readinessPercent(
      [{ id: 'a' }, { id: 'b' }],
      [{ criterion_ids: ['a'], strength: 'strong' }]
    ),
    50
  );
});

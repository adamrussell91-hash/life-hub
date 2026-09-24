import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTidelineModel } from '../../apps/life/js/app/tideline-model.js';

const fixture = JSON.parse(readFileSync(new URL('../../docs/proposals/calendar-reference/fixture.json', import.meta.url), 'utf8'));
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

function model() {
  return buildTidelineModel({
    events: fixture.LOGS,
    visual: { ...fixture, school_terms: TERMS, NOTES: Array.from({ length: 12 }, (_, i) => ({ id: i })) },
    week: WEEK,
    today: '2026-09-24',
    nowHour: 18 + 5 / 60,
    terms: TERMS
  });
}

test('tideline capacity, period and grid come from the fixture logs', () => {
  const built = model();
  assert.equal(built.period.title, 'T3 W10 · last week of term');
  assert.equal(built.period.range, '21/09/26 – 27/09/26');
  assert.deepEqual(built.days.map(day => day.cap.pct), [79, 51, 42, 34, 52, 68, 75]);
  assert.deepEqual(built.days.map(day => day.over), [false, false, false, true, false, false, false]);
  assert.equal(built.days[3].cap.note, 'sore throat, poor sleep');
  assert.equal(built.days[4].cap.forecast, true);
  assert.equal(built.days[3].chips.some(chip => /breakfast|Diary/i.test(chip.title)), false);
  assert.equal(built.days[3].chips.filter(chip => chip.id === 'gastro').length, 1);
  assert.match(built.days[3].chips.find(chip => chip.id === 'gastro').meta, /2 records merged/);
  assert.equal(built.days[6].walls.length, 1);
  assert.match(built.days[4].free[0].title, /4½ h free/);
  assert.match(built.ambient, /12 notes touched/);
  assert.equal(built.total, 552);
});

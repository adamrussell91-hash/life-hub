import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listMedicalVisits, getMedicalVisit, findDuplicateGroups, findLikelyDuplicate,
  planVisitUpdate, planVisitDelete, planVisitMerge
} from '../../netlify/functions/_shared/sara-records.mjs';
import { MEDICAL, TODAY, visit } from '../support/sara-fixtures.mjs';

const NOW = '2026-10-06T16:00:00+11:00';

// The exact failure from 6 Oct 2026: one GP appointment logged on three dates.
const gp = (date, extra = {}) => visit(`gp-${date}`, date, {
  title: 'GP Appointment - Dr Nerida McDonald (GGT results review)',
  record_type: 'Consultation', provider: 'Dr Nerida McDonald', time: '14:00',
  created_at: '2026-10-06T15:40:00+11:00', ...extra   // all saved in the same sitting, as happened
}, 'General appointment to discuss 17 Sep GGT result.');
const DUPES = [gp('2026-10-06'), gp('2026-10-15'), gp('2026-10-26')];
const BASE = MEDICAL.filter(v => v.record.id !== 'gp-ggt');
const all = [...BASE, ...DUPES];

test('findDuplicateGroups catches the triplicated GP appointment and ignores recurring doses', () => {
  const groups = findDuplicateGroups(all, { today: TODAY });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(v => v.date), ['2026-10-06', '2026-10-15', '2026-10-26']);
  // Stelara doses 56 days apart share a title and must not be flagged.
  assert.equal(findDuplicateGroups(BASE, { today: TODAY }).length, 0);
});

test('findLikelyDuplicate guards log_entry: same appointment on another date is refused, a new one is not', () => {
  const again = { type: 'medical', date: '2026-10-20', time: '14:00', fields: { title: 'GP Appointment - Dr Nerida McDonald (GGT results review)', provider: 'Dr Nerida McDonald' } };
  assert.ok(findLikelyDuplicate(all, again, { today: TODAY }));
  const fresh = { type: 'medical', date: '2026-12-01', fields: { title: 'Dentist check-up' } };
  assert.equal(findLikelyDuplicate(all, fresh, { today: TODAY }), null);
  const dose = { type: 'medical', date: '2026-12-17', fields: { title: 'Stelara injection', cadence_days: 56 } };
  assert.equal(findLikelyDuplicate(all, dose, { today: TODAY }), null);
});

test('listMedicalVisits filters by status/upcoming and flags duplicates; ids are returned', () => {
  const upcoming = listMedicalVisits(all, { today: TODAY, upcoming: true });
  assert.ok(upcoming.visits.every(v => v.date >= TODAY));
  assert.equal(upcoming.visits[0].date, '2026-10-06');
  assert.ok(upcoming.visits.find(v => v.id === 'gp-2026-10-26').possible_duplicate);
  const toBook = listMedicalVisits(all, { today: TODAY, status: 'to_book' });
  assert.deepEqual(toBook.visits.map(v => v.id), ['mrcp']);
  assert.equal(listMedicalVisits(all, { today: TODAY, query: 'nerida' }).total_matching, 3);
  assert.equal(listMedicalVisits(all, { today: TODAY }).duplicate_groups.length, 1);
});

test('getMedicalVisit returns the full record and its look-alikes', () => {
  const r = getMedicalVisit(all, { id: 'gp-2026-10-26' });
  assert.equal(r.found, true);
  assert.equal(r.visit.provider, 'Dr Nerida McDonald');
  assert.equal(r.possible_duplicates.length, 2);
  assert.equal(getMedicalVisit(all, { id: 'zzz' }).found, false);
});

test('planVisitUpdate: "it is booked" changes status only, never the date, and is safe', () => {
  const plan = planVisitUpdate(DUPES[1], { status: 'booked' }, { nowIso: NOW, today: TODAY });
  assert.equal(plan.ok, true);
  assert.equal(plan.risk, 'safe');
  assert.equal(plan.record.date, '2026-10-15');
  assert.equal(plan.record.status, 'booked');
  assert.equal(plan.moved, false);
  assert.equal(plan.newPath, DUPES[1].path);
  assert.deepEqual(plan.diff.map(d => d.field), ['status']);
});

test('planVisitUpdate: adding detail appends with a date stamp and is safe', () => {
  const plan = planVisitUpdate(DUPES[1], { notes_append: 'GP ordered a repeat GGT in 6 weeks.' }, { nowIso: NOW, today: TODAY });
  assert.equal(plan.risk, 'safe');
  assert.match(plan.notes, /General appointment to discuss/);
  assert.match(plan.notes, /\(6 Oct 2026\) GP ordered a repeat GGT/);
  assert.match(plan.content, /^---\n/);
  assert.match(plan.content, /GP ordered a repeat GGT/);
});

test('planVisitUpdate: time, length, provider are safe; date and type are structural; a move re-paths the file', () => {
  const safe = planVisitUpdate(DUPES[2], { time: '15:30', duration_min: 45, provider: 'Dr N McDonald' }, { nowIso: NOW, today: TODAY });
  assert.equal(safe.risk, 'safe');
  assert.equal(safe.record.time, '15:30');
  assert.equal(safe.record.duration_min, 45);

  const moved = planVisitUpdate(DUPES[2], { date: '30/10/2026' }, { nowIso: NOW, today: TODAY });
  assert.equal(moved.risk, 'structural');
  assert.equal(moved.moved, true);
  assert.equal(moved.record.date, '2026-10-30');
  assert.equal(moved.record.id, DUPES[2].record.id);
  assert.match(moved.newPath, /^data\/body\/2026\/10\/2026-10-30-medical-/);
  assert.notEqual(moved.newPath, moved.oldPath);

  const retyped = planVisitUpdate(DUPES[2], { record_type: 'Appointment' }, { nowIso: NOW, today: TODAY });
  assert.equal(retyped.risk, 'structural');
});

test('planVisitUpdate: cancelled is a valid status; bad input is rejected with reasons; no-op is detected', () => {
  assert.equal(planVisitUpdate(DUPES[0], { status: 'cancelled' }, { nowIso: NOW, today: TODAY }).record.status, 'cancelled');
  const bad = planVisitUpdate(DUPES[0], { status: 'maybe', time: '25:00', date: 'someday', duration_min: 0 }, { nowIso: NOW, today: TODAY });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);
  assert.equal(planVisitUpdate(DUPES[0], { status: undefined, provider: 'Dr Nerida McDonald' }, { nowIso: NOW, today: TODAY }).noop, true);
  assert.equal(planVisitUpdate({ record: {} }, { status: 'done' }).ok, false);
});

test('planVisitDelete and planVisitMerge are structural and name exactly what goes', () => {
  const del = planVisitDelete(DUPES[0]);
  assert.equal(del.risk, 'structural');
  assert.equal(del.path, DUPES[0].path);

  const merge = planVisitMerge(DUPES[2], [DUPES[0], DUPES[1]], { nowIso: NOW, today: TODAY });
  assert.equal(merge.ok, true);
  assert.equal(merge.keep_id, 'gp-2026-10-26');
  assert.deepEqual(merge.deletePaths, [DUPES[0].path, DUPES[1].path]);
  assert.equal(merge.deleted.length, 2);
  assert.equal(planVisitMerge(DUPES[2], [DUPES[2]], {}).error, 'nothing_to_merge');

  const keepBare = visit('a', '2026-10-26', { title: 'GP review' });
  const donor = visit('b', '2026-10-27', { title: 'GP review', provider: 'Dr X', time: '09:00', status: 'booked', duration_min: 20 }, 'Extra note.');
  const filled = planVisitMerge(keepBare, [donor], { nowIso: NOW });
  assert.match(filled.content, /provider: "Dr X"/);
  assert.match(filled.content, /status: "booked"/);
  assert.match(filled.content, /time: "09:00"/);
  assert.match(filled.content, /merged from 27 Oct 2026\) Extra note/);
});

test('findLikelyDuplicate never treats a symptom as a duplicate visit', () => {
  const sore = { type: 'medical', date: '2026-10-06', fields: { title: 'Sore throat' }, notes: 'throat is sore' };
  assert.equal(findLikelyDuplicate([...MEDICAL, visit('x', '2026-10-06', { title: 'Sore throat', record_type: 'Appointment' })], sore, { today: TODAY }), null);
});

test('years of genuine weekly sessions are not duplicates (only recent/upcoming, saved-together visits are)', () => {
  const weekly = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(2018, 5, 21 + i * 7)).toISOString().slice(0, 10);
    return visit(`psych-${i}`, d, { title: 'Psychological Assessment (Dr M)', provider: 'Dr M', time: '10:00', record_type: 'Appointment' });
  });
  assert.equal(findDuplicateGroups(weekly, { today: TODAY }).length, 0);
  // A visit created today for next week's session still gets the log_entry guard (one retry), not silent duplication.
  const upcomingSession = visit('s1', '2026-10-12', { title: 'Therapy session', provider: 'Kate', time: '10:00' });
  const next = { type: 'medical', date: '2026-10-19', time: '10:00', fields: { title: 'Therapy session', provider: 'Kate' } };
  assert.ok(findLikelyDuplicate([upcomingSession], next, { today: TODAY }));
  assert.equal(findLikelyDuplicate([upcomingSession], { ...next, date: '2026-12-01' }, { today: TODAY }), null);
});

test('the same dose logged twice on one day IS a duplicate even though doses recur', () => {
  const a = visit('d1', '2026-10-22', { title: 'Stelara (ustekinumab) subcutaneous maintenance injection — 90mg', record_type: 'Prescription', cadence_days: 56, provider: 'Walker St Doctors', time: '09:00' });
  const b = visit('d2', '2026-10-22', { title: 'stelara (ustekinumab) 90 mg - subcutaneous injection', record_type: 'Appointment', provider: 'Nurse', time: '09:00' });
  assert.equal(findDuplicateGroups([a, b], { today: TODAY }).length, 1);
  const later = visit('d3', '2026-12-17', { title: 'Stelara injection', record_type: 'Prescription', cadence_days: 56, time: '09:00' });
  assert.equal(findDuplicateGroups([a, later], { today: TODAY }).length, 0);
});

test('same title on the same day is a duplicate even if the time and clinician differ (the "stamped with now" case)', () => {
  const a = visit('d1', '2026-10-22', { title: 'Stelara injection', record_type: 'Prescription', time: '09:00', provider: 'Walker St Doctors' });
  const b = visit('d2', '2026-10-22', { title: 'Stelara injection', record_type: 'Appointment', time: '15:42', provider: 'Nurse' });
  assert.equal(findDuplicateGroups([a, b], { today: TODAY }).length, 1);
});

test('retyping a visit moves its lane with it, so a symptom is not left in the prescription lane', () => {
  const misfiled = visit('m', '2026-09-24', { title: 'Sore throat, sniffles, poor sleep', record_type: 'Prescription', lane: 'prescription' }, 'Rest.');
  const plan = planVisitUpdate(misfiled, { record_type: 'Symptom', weight: 'minor' }, { nowIso: NOW, today: TODAY });
  assert.equal(plan.ok, true);
  assert.equal(plan.record.lane, 'symptom');
  assert.equal(plan.record.weight, 'minor');
  assert.equal(plan.risk, 'structural');
  assert.ok(plan.diff.some(d => d.field === 'lane'));
});

test('stale date estimates can be cleared (date_end / follow_up_date to null)', () => {
  const v = visit('s', '2026-08-27', { title: 'Stelara injection', date_end: '2026-10-27', follow_up_date: '2026-12-22' });
  const plan = planVisitUpdate(v, { date_end: null, follow_up_date: null }, { nowIso: NOW, today: TODAY });
  assert.equal(plan.record.date_end, undefined);
  assert.equal(plan.record.follow_up_date, undefined);
});

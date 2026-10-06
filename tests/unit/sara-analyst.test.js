import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markerTrend, compareBloods, treatmentTimeline, symptomTimeline, openLoops, crossSignals, appointmentBrief
} from '../../netlify/functions/_shared/sara-analyst.mjs';
import { TODAY, BLOODS, MEDICAL, MEALS, DIARY, WORKOUTS, WEIGHTS, visit } from '../support/sara-fixtures.mjs';

const all = [...BLOODS, ...MEDICAL];

test('markerTrend: GGT 98 -> 131 -> 233 is above range and moving away', () => {
  const r = markerTrend(all, { query: 'ggt', today: TODAY });
  assert.equal(r.found, true);
  const ggt = r.markers[0];
  assert.deepEqual(ggt.points.map(p => p.value), [98, 131, 233]);
  assert.equal(ggt.delta_vs_previous, 102);
  assert.equal(ggt.delta_vs_first, 135);
  assert.equal(ggt.range_position, 'above');
  assert.equal(ggt.direction_vs_range, 'moving_away_from_range');
  assert.ok(ggt.per_month > 0);
  assert.equal(ggt.days_since_last, 19);
  assert.equal(ggt.abnormal_and_unrepeated, false);
});

test('markerTrend: a group name returns every marker in it; falling-but-high is "toward", not "normal"', () => {
  const liver = markerTrend(all, { query: 'liver', today: TODAY });
  assert.deepEqual(liver.markers.map(m => m.key).sort(), ['alt', 'ggt']);
  const crp = markerTrend(all, { query: 'crp', today: TODAY }).markers[0];
  assert.equal(crp.direction_vs_range, 'in_range'); // 3.0 -> 2.1, both within range
  const fallingHigh = markerTrend([
    { path: 'a', record: { type: 'bloods', date: '2026-01-01', markers: [{ key: 'x', label: 'X', category: 'Other', value: 100, ref_high: 50, status: 'High' }] } },
    { path: 'b', record: { type: 'bloods', date: '2026-04-01', markers: [{ key: 'x', label: 'X', category: 'Other', value: 70, ref_high: 50, status: 'High' }] } }
  ], { query: 'x', today: TODAY }).markers[0];
  assert.equal(fallingHigh.direction_vs_range, 'moving_toward_range');
});

test('markerTrend: unknown marker is an honest empty result; abnormal and old is flagged', () => {
  assert.equal(markerTrend(all, { query: 'zinc', today: TODAY }).found, false);
  const old = markerTrend([BLOODS[2]], { query: 'ggt', today: '2026-12-31' }).markers[0];
  assert.equal(old.abnormal_and_unrepeated, true);
  assert.equal(old.direction_vs_range, 'single_point');
  assert.equal(old.per_month, null);
});

test('compareBloods: latest two collections, newly abnormal and biggest moves', () => {
  const r = compareBloods(all, { today: TODAY });
  assert.equal(r.before_date, '2026-06-10');
  assert.equal(r.after_date, '2026-09-17');
  assert.equal(r.biggest_moves[0].key, 'ggt');
  assert.deepEqual(r.newly_abnormal, []);
  assert.deepEqual(r.still_abnormal.map(m => m.key).sort(), ['alt', 'ggt']);
  const older = compareBloods(all, { date_a: '2026-03-04', date_b: '2026-06-10' });
  assert.deepEqual(older.newly_abnormal.map(m => m.key), ['alt']);
  assert.deepEqual(older.normalised.map(m => m.key), ['crp']);
  assert.equal(compareBloods([BLOODS[0]]).found, false);
});

test('treatmentTimeline: Stelara cycle day, next due and induction', () => {
  const r = treatmentTimeline(all, { today: TODAY });
  const { doses, cycle } = r.stelara;
  assert.deepEqual(doses.map(d => d.kind), ['induction', 'maintenance']);
  assert.equal(cycle.last_dose_date, '2026-08-27');
  assert.equal(cycle.cycle_day, 40);
  assert.equal(cycle.cadence_days, 56);
  assert.equal(cycle.next_due, '2026-10-22');
  assert.equal(cycle.days_until_next, 16);
  assert.equal(cycle.overdue, false);
  assert.equal(cycle.planned_next.date, '2026-10-22');
  const late = treatmentTimeline(all, { today: '2026-11-05' }).stelara.cycle;
  assert.equal(late.overdue, true);
});

test('symptomTimeline: episodes carry cycle day, and a thin sample is not called a pattern', () => {
  const r = symptomTimeline(all, { today: TODAY, diary: DIARY });
  const cold = r.episodes.find(e => e.id === 'cold-aug');
  assert.equal(cold.entry_count, 2);
  assert.deepEqual(cold.entries.map(e => e.cycle_day), [2, 3]);
  assert.equal(cold.onset_cycle_day, 2);
  assert.equal(cold.duration_days, 5);
  const cramp = r.episodes.find(e => e.id === 'cramp-sep');
  assert.equal(cramp.onset_cycle_day, 24);
  assert.equal(r.post_dose_pattern.enough_to_infer, false);
  assert.match(r.post_dose_pattern.caution, /too few/i);
  assert.equal(r.post_dose_pattern.onset_within_window, 1);
  assert.equal(r.diary_symptom_days[0].date, '2026-09-18');
});

test('openLoops: to_book, upcoming visits, Stelara due, and notes mentions kept separate', () => {
  const r = openLoops(all, { today: TODAY });
  assert.ok(r.loops.some(l => l.kind === 'to_book' && l.id === 'mrcp'));
  assert.ok(r.upcoming_30_days.some(u => u.id === 'gp-ggt' && u.days_until === 20 && u.time === '14:00'));
  assert.ok(r.upcoming_30_days.every(u => u.id !== 'mrcp'));
  assert.ok(r.mentioned_in_notes.some(m => m.id === 'gastro' && /MRCP ordered/i.test(m.snippet)));
  assert.ok(!r.loops.some(l => l.kind === 'stelara_overdue'));
  const far = openLoops(all, { today: '2026-12-15' });
  assert.ok(far.loops.some(l => l.kind === 'stelara_overdue'));
  assert.ok(far.loops.some(l => l.kind === 'abnormal_not_repeated' && l.key === 'ggt'));
});

test('crossSignals: describes windows, lookbacks, and names what is missing', () => {
  const r = crossSignals({ today: TODAY, from: '2026-09-01', to: '2026-09-23', anchors: ['2026-09-17'], meals: MEALS, workouts: WORKOUTS, diary: DIARY, weights: WEIGHTS });
  assert.equal(r.window.days, 23);
  assert.equal(r.current.nutrition.days_logged, 14);
  assert.equal(r.current.training.sessions, 2);
  assert.equal(r.current.training.sessions_with_pain, 1);
  assert.deepEqual(r.current.training.pain_regions, ['knee']);
  assert.equal(r.current.weight.change_kg, -0.7);
  assert.equal(r.anchors[0].anchor, '2026-09-17');
  assert.equal(r.enough_data.nutrition, true);
  assert.ok(r.data_gaps.includes('mood'));
  assert.match(r.caution, /not causes/i);
  const empty = crossSignals({ today: TODAY });
  assert.match(empty.caution, /do not infer/i);
});

test('appointmentBrief for the GP review uses the visit date and writes the questions', () => {
  const r = appointmentBrief(all, { visit_id: 'gp-ggt', today: TODAY });
  assert.equal(r.found, true);
  assert.equal(r.as_of, '2026-10-26');
  assert.equal(r.visit.time, '14:00');
  assert.equal(r.visit.duration_min, 30);
  assert.equal(r.results.collection_date, '2026-09-17');
  const keys = r.results.abnormal.map(m => m.key).sort();
  assert.deepEqual(keys, ['alt', 'ggt']);
  assert.ok(r.questions_to_ask.some(q => /GGT is 233.*131/.test(q)));
  assert.ok(r.open_loops.some(l => l.id === 'mrcp'));
  assert.ok(r.questions_to_ask.some(q => /MRCP/.test(q)));
  assert.equal(r.treatment.stelara.next_due, '2026-10-22');
  assert.equal(r.last_visit_before.id, 'gastro');
  assert.ok(r.symptoms_since_last_visit.active.length === 0 || Array.isArray(r.symptoms_since_last_visit.active));
});

test('appointmentBrief by date and honest misses', () => {
  assert.equal(appointmentBrief(all, { date: '2026-09-24', today: TODAY }).visit.id, 'gastro');
  assert.equal(appointmentBrief(all, { visit_id: 'nope', today: TODAY }).found, false);
  assert.equal(appointmentBrief(all, { date: '2026-01-01', today: TODAY }).reason, 'no_visit_on_date');
});

import { saraAnalystToolSchemas, executeSaraAnalystTool, createHistoryLoader, isSaraAnalystTool, SARA_ANALYST_TOOL_NAMES } from '../../netlify/functions/_shared/sara-analyst-tools.mjs';

test('tool schemas match the dispatch list and are well formed', () => {
  const schemas = saraAnalystToolSchemas();
  assert.deepEqual(schemas.map(s => s.name), SARA_ANALYST_TOOL_NAMES);
  for (const s of schemas) {
    assert.ok(s.description.length > 40);
    assert.equal(s.input_schema.type, 'object');
    assert.ok(isSaraAnalystTool(s.name));
  }
  assert.equal(isSaraAnalystTool('log_entry'), false);
});

test('dispatch runs each tool; cross signals loads only what it needs from the tree', async () => {
  const docs = new Map();
  const tree = [];
  const put = (e, sha) => { docs.set(sha, e); tree.push({ type: 'blob', path: e.path, sha }); };
  MEALS.forEach((e, i) => put(e, `m${i}`));
  DIARY.forEach((e, i) => put(e, `d${i}`));
  WORKOUTS.forEach((e, i) => put(e, `w${i}`));
  WEIGHTS.forEach((e, i) => put(e, `g${i}`));
  tree.push({ type: 'blob', path: 'data/nutrition/2020/01/2020-01-01-dinner.md', sha: 'old' });
  let reads = 0;
  const loadRecords = createHistoryLoader({ tree, readBlob: async sha => { reads += 1; return sha; }, parse: sha => docs.get(sha) });
  const ctx = { medicalEvents: all, today: TODAY, loadRecords };

  const trend = await executeSaraAnalystTool('get_marker_trend', { marker: 'GGT' }, ctx);
  assert.equal(trend.markers[0].latest.value, 233);
  assert.equal(reads, 0, 'a bloods question must not read nutrition/diary history');

  const cross = await executeSaraAnalystTool('get_cross_signals', { from: '2026-09-01', to: '2026-09-23', anchors: ['2026-09-17'] }, ctx);
  assert.equal(cross.current.nutrition.days_logged, 14);
  assert.ok(reads > 0 && reads < 60, `bounded reads, got ${reads}`);

  const sym = await executeSaraAnalystTool('get_symptom_timeline', {}, ctx);
  assert.equal(sym.diary_symptom_days.length, 1);
  assert.equal((await executeSaraAnalystTool('get_open_loops', {}, ctx)).ok, true);
  assert.equal((await executeSaraAnalystTool('get_treatment_timeline', {}, ctx)).stelara.cycle.cycle_day, 40);
  assert.equal((await executeSaraAnalystTool('build_appointment_brief', { visit_id: 'gp-ggt' }, ctx)).found, true);
  assert.equal((await executeSaraAnalystTool('compare_bloods', {}, ctx)).found, true);
  assert.equal((await executeSaraAnalystTool('nope', {}, ctx)).error, 'unknown_tool');
  assert.equal((await executeSaraAnalystTool('get_marker_trend', null, ctx)).ok, false);
});

import { analyseMedicalEvidence } from '../../netlify/functions/_shared/medical-overview-read.mjs';
import { briefMedicalAppointment } from '../../netlify/functions/_shared/medical-overview-read.mjs';

test('analyse_medical_evidence now carries marker-level blood change', () => {
  const r = analyseMedicalEvidence(all, { today: TODAY });
  const bloodsCmp = r.comparisons.find(c => c.kind === 'bloods');
  assert.equal(bloodsCmp.biggest_moves[0].key, 'ggt');
  assert.deepEqual(bloodsCmp.still_abnormal.map(m => m.key).sort(), ['alt', 'ggt']);
});

test('a visit that only MENTIONS Stelara in its notes is not a dose, and a dose logged twice counts once', () => {
  const events = [
    visit('dose-a', '2026-08-27', { title: 'Stelara injection', record_type: 'Prescription', cadence_days: 56 }),
    visit('dose-b', '2026-08-27', { title: 'Stelara (ustekinumab) maintenance injection — 90mg', record_type: 'Prescription' }),
    visit('gastro-2', '2026-09-24', { title: 'Gastro follow-up' }, 'Continue Stelara. Next Stelara due October.'),
    visit('bloods-visit', '2026-09-17', { title: 'Blood Tests - Comprehensive Panel', record_type: 'Lab Work' }, 'Pre-Stelara bloods.')
  ];
  const r = treatmentTimeline(events, { today: TODAY });
  assert.deepEqual(r.stelara.doses.map(d => d.date), ['2026-08-27']);
  assert.equal(r.stelara.cycle.cycle_day, 40);
});

test('the monthly slope only uses the last 12 months, so old values cannot flip the direction', () => {
  const rows = [['2019-07-19', 639], ['2023-03-21', 120], ['2026-01-28', 162], ['2026-05-19', 131], ['2026-09-17', 233]].map(([date, value]) => ({
    path: `data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-bloods.md`,
    record: { type: 'bloods', date, markers: [{ key: 'ggt', label: 'GGT', category: 'Liver Function', value, ref_high: 51, status: 'High' }] }
  }));
  const ggt = markerTrend(rows, { query: 'ggt', today: TODAY }).markers[0];
  assert.ok(ggt.per_month > 0, `slope should follow the last year, got ${ggt.per_month}`);
  assert.equal(ggt.points.length, 5);
  assert.ok(ggt.history_span_days > 2000);
});

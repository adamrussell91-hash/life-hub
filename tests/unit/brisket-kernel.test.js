/**
 * Brisket nutrition kernel expansion. DETERMINISTIC TEST only — not a live deploy gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseNutritionEvidence } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function meal(date, extras = {}) {
  return {
    type: 'meal',
    date,
    meal: extras.meal ?? 'meal',
    calories: extras.calories ?? 400,
    protein_g: extras.protein_g ?? 30,
    fat_g: extras.fat_g ?? 10,
    notes: extras.notes ?? '',
    id: extras.id ?? `meal_${date}_${extras.meal ?? 'x'}`,
    path: extras.path ?? `data/nutrition/${date}-${extras.meal ?? 'meal'}.md`
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('Brisket paraphrases route into nutrition_adherence (≥95%)', () => {
  const messages = [
    'how am I eating lately',
    'am I hitting my targets',
    'what is left for today',
    'nutrition check please',
    'protein adherence this week',
    'compare this week with last',
    'what meals contributed most to a miss',
    'what is missing from today\'s log',
    'calories remaining today',
    'eating patterns across recent days',
    'meal log review',
    'how is my nutrition looking',
    'did I hit protein yesterday',
    'macros left for dinner',
    'weekly eating summary',
    'nutrition adherence check',
    'am I under on protein',
    'food log overview',
    'how does this week compare',
    'targets versus logged meals'
  ];
  const hits = messages.filter(message => planTurn({ slug: 'brisket', message }).plan.workflow === 'nutrition_adherence');
  assert.ok(hits.length / messages.length >= 0.95);
});

test('today versus historical day: yesterday meals stay yesterday', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'what is left for today',
    today: TODAY,
    now: NOW,
    stores: {
      meals: [
        meal('2026-08-19', { meal: 'yesterday_dinner', protein_g: 50, id: 'y1' }),
        meal(TODAY, { meal: 'eggs', protein_g: 40, id: 't1' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_nutrition_evidence;
  assert.equal(analysis.meals_today_count, 1);
  assert.equal(analysis.yesterday_meal_count, 1);
  assert.equal(analysis.meals_today[0].meal, 'eggs');
  assert.match(kernel.interpretationBlock, /Yesterday's meals stay on yesterday/i);
});

test('missing meal log is missing evidence, not zero intake', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'am I hitting my targets',
    today: TODAY,
    now: NOW,
    stores: { meals: [] }
  });
  assert.equal(kernel.evidence.analyse_nutrition_evidence.logging_status, 'no_log_today');
  assert.ok(kernel.limitations.some(item => /missing evidence, not zero intake/i.test(item.text)));
  assert.match(kernel.interpretationBlock, /not zero intake/i);
  assert.doesNotMatch(kernel.interpretationBlock, /consumed 0 calories|ate nothing/i);
});

test('partial day logging stays partial', () => {
  const analysis = analyseNutritionEvidence([
    meal(TODAY, { meal: 'breakfast', protein_g: 25 })
  ], TODAY, { message: 'how am I eating lately' });
  assert.equal(analysis.logging_status, 'partial_day');
  assert.equal(analysis.meals_today_count, 1);
});

test('target and remaining macros keep calculation provenance', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'what is left for today',
    today: TODAY,
    now: NOW,
    stores: {
      meals: [
        meal(TODAY, { meal: 'breakfast', protein_g: 30, calories: 400 }),
        meal(TODAY, { meal: 'lunch', protein_g: 35, calories: 500 }),
        meal(TODAY, { meal: 'dinner', protein_g: 40, calories: 600 })
      ]
    }
  });
  const target = kernel.claims.find(claim => claim.fact === 'protein_target_g');
  const remaining = kernel.claims.find(claim => claim.fact === 'protein_remaining_g');
  assert.ok(target);
  assert.equal(target.kind, 'calculation');
  assert.ok(usableProvenance(target.provenance));
  assert.ok(remaining);
  assert.equal(remaining.provenance.calculation, 'targets_minus_logged');
});

test('derived adherence and period comparison provenance', () => {
  const meals = [];
  for (let i = 0; i < 7; i++) {
    const date = `2026-08-${String(14 + i).padStart(2, '0')}`;
    meals.push(meal(date, { meal: 'lunch', protein_g: 130, calories: 700, id: `w_${i}` }));
  }
  for (let i = 0; i < 7; i++) {
    const date = `2026-08-${String(7 + i).padStart(2, '0')}`;
    meals.push(meal(date, { meal: 'lunch', protein_g: 40, calories: 500, id: `p_${i}` }));
  }
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'how does this week compare with the previous period',
    today: TODAY,
    now: NOW,
    stores: { meals }
  });
  const hitRate = kernel.claims.find(claim => claim.fact === 'week_protein_hit_rate_pct');
  const coverage = kernel.claims.find(claim => claim.fact === 'logging_coverage_pct');
  const delta = kernel.claims.find(claim => claim.fact === 'protein_hit_rate_delta_pp');
  assert.ok(hitRate);
  assert.ok(usableProvenance(hitRate.provenance));
  assert.ok(coverage);
  assert.ok(delta);
  assert.equal(delta.provenance.calculation, 'week_vs_previous');
});

test('no meal invention and meal claims keep record provenance', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'what meals contributed most to a target miss',
    today: TODAY,
    now: NOW,
    stores: {
      meals: [meal(TODAY, { meal: 'toast', protein_g: 8, id: 'toast1', path: 'data/nutrition/toast.md' })]
    }
  });
  const mealClaim = kernel.claims.find(claim => claim.fact === 'meal_today');
  assert.equal(mealClaim.value, 'toast');
  assert.equal(mealClaim.kind, 'record');
  assert.equal(mealClaim.provenance.recordId, 'toast1');
  assert.equal(kernel.claims.find(claim => claim.fact === 'invented_meal'), undefined);
});

test('Case A: later hit day is not selected as below-target day', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-18', { meal: 'monday_low', protein_g: 20, id: 'mon', path: 'data/n/mon.md' }),
    meal('2026-08-19', { meal: 'tuesday_hit', protein_g: 200, id: 'tue', path: 'data/n/tue.md' })
  ], TODAY, { message: 'what meals contributed most to a target miss' });
  assert.equal(analysis.below_target_day, '2026-08-18');
  assert.deepEqual(analysis.observed_below_target_days, ['2026-08-18']);
  assert.equal(analysis.top_meals_on_below_target_day[0]?.meal, 'monday_low');
  assert.notEqual(analysis.below_target_day, '2026-08-19');
  assert.equal(analysis.day_target_status.find(d => d.date === '2026-08-18')?.status, 'observed_below_target');
  assert.equal(analysis.day_target_status.find(d => d.date === '2026-08-19')?.status, 'observed_hit');
  assert.equal(analysis.confirmed_miss_days, undefined);
});

test('Case B: most recent observed-below-target day wins among multiple', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-17', { meal: 'older_miss', protein_g: 15, id: 'a' }),
    meal('2026-08-19', { meal: 'newer_miss', protein_g: 25, id: 'b' })
  ], TODAY, { message: 'target miss meals' });
  assert.deepEqual(analysis.observed_below_target_days, ['2026-08-19', '2026-08-17']);
  assert.equal(analysis.below_target_day, '2026-08-19');
  assert.equal(analysis.below_target_day_basis, 'most_recent_observed_below_target');
  assert.equal(analysis.top_meals_on_below_target_day[0]?.meal, 'newer_miss');
});

test('Case C: unlogged days are not below-target when logged days hit', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-18', { meal: 'hit', protein_g: 200, id: 'h1' }),
    meal('2026-08-19', { meal: 'hit2', protein_g: 180, id: 'h2' })
  ], TODAY, { message: 'am I hitting my targets' });
  assert.equal(analysis.below_target_day, null);
  assert.deepEqual(analysis.observed_below_target_days, []);
  assert.equal(analysis.below_target_day_basis, 'no_observed_below_target_day');
  assert.deepEqual(analysis.top_meals_on_below_target_day, []);
  assert.ok((analysis.unlogged_week_days ?? []).length > 0);
});

test('Case D: partial today is not automatically below-target', () => {
  const analysis = analyseNutritionEvidence([
    meal(TODAY, { meal: 'breakfast_only', protein_g: 20, id: 'p1' })
  ], TODAY, { message: 'what is left for today' });
  assert.equal(analysis.logging_status, 'partial_day');
  assert.equal(analysis.target_below_today, false);
  assert.ok(!analysis.observed_below_target_days.includes(TODAY));
  assert.equal(analysis.day_target_status.find(d => d.date === TODAY)?.status, 'insufficient_logging');
});

test('Case E: below-target meal contributors keep dated record provenance', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'What meals contributed most to a target miss?',
    today: TODAY,
    now: NOW,
    stores: {
      meals: [
        meal('2026-08-18', { meal: 'monday_low', protein_g: 20, id: 'mon1', path: 'data/nutrition/mon.md' }),
        meal('2026-08-19', { meal: 'tuesday_hit', protein_g: 200, id: 'tue1', path: 'data/nutrition/tue.md' })
      ]
    }
  });
  assert.equal(kernel.evidence.analyse_nutrition_evidence.below_target_day, '2026-08-18');
  const top = kernel.claims.find(claim => claim.fact === 'top_meal_on_below_target_day');
  assert.equal(top.value, 'monday_low');
  assert.equal(top.kind, 'record');
  assert.equal(top.provenance.recordId, 'mon1');
  assert.equal(top.provenance.recordPath, 'data/nutrition/mon.md');
  assert.equal(top.provenance.date, '2026-08-18');
  assert.match(kernel.interpretationBlock, /recorded protein remained below target/i);
  assert.doesNotMatch(kernel.interpretationBlock, /These meals caused the miss/i);
});

test('Case F: no observed-below-target yields no contributor meals', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'What meals contributed most to a target miss?',
    today: TODAY,
    now: NOW,
    stores: {
      meals: [
        meal('2026-08-18', { meal: 'hit', protein_g: 200, id: 'h1' }),
        meal('2026-08-19', { meal: 'hit2', protein_g: 180, id: 'h2' }),
        meal(TODAY, { meal: 'b', protein_g: 50 }),
        meal(TODAY, { meal: 'l', protein_g: 50 }),
        meal(TODAY, { meal: 'd', protein_g: 50 })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_nutrition_evidence;
  assert.equal(analysis.below_target_day, null);
  assert.deepEqual(analysis.top_meals_on_below_target_day, []);
  assert.equal(kernel.claims.find(claim => claim.fact === 'top_meal_on_below_target_day'), undefined);
  assert.match(kernel.interpretationBlock, /No defensible observed-below-target day/i);
});

test('Adherence Case A: 2/2 hits with incomplete coverage is 100 observed, not 2/7', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-18', { meal: 'a', protein_g: 130 }),
    meal('2026-08-19', { meal: 'b', protein_g: 140 })
  ], TODAY, { message: 'protein adherence this week' });
  const week = analysis.week_adherence;
  assert.equal(week.days_logged, 2);
  assert.equal(week.protein_target_hits, 2);
  assert.equal(week.observed_protein_hit_rate_pct, 100);
  assert.equal(week.protein_hit_rate_pct, 100);
  assert.ok(week.logging_coverage_pct >= 28 && week.logging_coverage_pct <= 29);
  assert.equal(week.coverage_status, 'incomplete');
  assert.doesNotMatch(JSON.stringify(week), /"protein_hit_rate_pct":29|"protein_hit_rate_pct":28/);
});

test('Adherence Case B: 1 hit 1 miss among 2 logged days is 50 observed', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-18', { meal: 'hit', protein_g: 130 }),
    meal('2026-08-19', { meal: 'miss', protein_g: 40 })
  ], TODAY, { message: 'am I hitting my targets' });
  const week = analysis.week_adherence;
  assert.equal(week.observed_protein_hit_rate_pct, 50);
  assert.ok(week.logging_coverage_pct >= 28 && week.logging_coverage_pct <= 29);
});

test('Adherence Case C: full coverage with 5 hits is ~71 observed and 100 coverage', () => {
  const meals = [
    meal('2026-08-14', { protein_g: 130 }),
    meal('2026-08-15', { protein_g: 130 }),
    meal('2026-08-16', { protein_g: 130 }),
    meal('2026-08-17', { protein_g: 130 }),
    meal('2026-08-18', { protein_g: 130 }),
    meal('2026-08-19', { protein_g: 40 }),
    meal(TODAY, { meal: 'b', protein_g: 30 }),
    meal(TODAY, { meal: 'l', protein_g: 30 }),
    meal(TODAY, { meal: 'd', protein_g: 30 })
  ];
  const analysis = analyseNutritionEvidence(meals, TODAY, { message: 'weekly eating summary' });
  const week = analysis.week_adherence;
  assert.equal(week.days_logged, 7);
  assert.equal(week.protein_target_hits, 5);
  assert.equal(week.observed_protein_hit_rate_pct, 71);
  assert.equal(week.logging_coverage_pct, 100);
  assert.equal(week.coverage_status, 'complete');
});

test('Adherence Case D: no days logged yields null observed rate, not 0% adherence', () => {
  const analysis = analyseNutritionEvidence([], TODAY, { message: 'am I hitting my targets' });
  const week = analysis.week_adherence;
  assert.equal(week.days_logged, 0);
  assert.equal(week.observed_protein_hit_rate_pct, null);
  assert.equal(week.protein_hit_rate_pct, null);
  assert.equal(week.logging_coverage_pct, 0);
  assert.equal(week.coverage_status, 'none');
});

test('Adherence Case E: period compare surfaces coverage limitation', () => {
  const meals = [
    meal('2026-08-18', { protein_g: 130 }),
    meal('2026-08-19', { protein_g: 140 }),
    meal('2026-08-07', { protein_g: 130 }),
    meal('2026-08-08', { protein_g: 130 }),
    meal('2026-08-09', { protein_g: 130 }),
    meal('2026-08-10', { protein_g: 130 }),
    meal('2026-08-11', { protein_g: 130 }),
    meal('2026-08-12', { protein_g: 130 }),
    meal('2026-08-13', { protein_g: 130 })
  ];
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'how does this week compare with the previous period',
    today: TODAY,
    now: NOW,
    stores: { meals }
  });
  const compare = kernel.evidence.analyse_nutrition_evidence.week_vs_previous;
  assert.ok(compare.comparison_limitation);
  assert.match(kernel.interpretationBlock, /Coverage incomplete|materially different/i);
  assert.match(kernel.interpretationBlock, /Among logged days/i);
});

test('historical single breakfast below target is observed_below_target, not confirmed_miss', () => {
  const analysis = analyseNutritionEvidence([
    meal('2026-08-18', { meal: 'breakfast', protein_g: 25, id: 'b1' })
  ], TODAY, { message: 'what meals contributed most to a miss' });
  const row = analysis.day_target_status.find(d => d.date === '2026-08-18');
  assert.equal(row.status, 'observed_below_target');
  assert.ok(!Object.values(analysis).some(v => Array.isArray(v) && String(v).includes('confirmed_miss')));
  assert.equal(analysis.confirmed_miss_days, undefined);
  assert.equal(analysis.below_target_day, '2026-08-18');
});

test('current-turn intake note is user_stated_current_turn', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'I just ate eggs — what is left for today',
    today: TODAY,
    now: NOW,
    stores: { meals: [meal(TODAY, { meal: 'eggs', protein_g: 40 })] }
  });
  const stated = kernel.claims.find(claim => claim.fact === 'stated_intake_note');
  assert.ok(stated);
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
});

test('no silent null provenance on Brisket material claims', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'how am I eating lately',
    today: TODAY,
    now: NOW,
    stores: { meals: [meal(TODAY, { meal: 'eggs', protein_g: 40 })] }
  });
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  const trace = kernelTraceEvent(kernel);
  assert.ok(trace.sufficiencyDecision);
  assert.ok(trace.retrieveLog?.length);
});

test('bounded second retrieve when nutrition search truncates', () => {
  const meals = Array.from({ length: 30 }, (_, i) => meal(`2026-07-${String((i % 28) + 1).padStart(2, '0')}`, {
    meal: 'protein bowl',
    protein_g: 40,
    notes: 'protein bowl lunch',
    id: `p${i}`,
    path: `data/nutrition/p${i}.md`
  }));
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'search protein meals that contributed most',
    today: TODAY,
    now: NOW,
    stores: { meals }
  });
  const round1 = kernel.retrieveLog[0]?.tools?.find(tool => tool.name === 'search_nutrition_records');
  assert.ok(round1?.truncated, 'round 1 search must truncate');
  assert.ok(kernel.retrieveLog.length >= 2, 'bounded second retrieve required');
  const round2 = kernel.retrieveLog[1]?.tools?.find(tool => tool.name === 'search_nutrition_records');
  assert.ok(round2, 'second round must re-retrieve search_nutrition_records');
  assert.ok(round2.intent?.limit > (round1.kept ?? 0), 'second round must widen limit');
  assert.equal(kernel.sufficiencyDecision.anotherRound, false);
});

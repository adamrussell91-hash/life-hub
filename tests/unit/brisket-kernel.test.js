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
    meals.push(meal(date, { meal: 'lunch', protein_g: 80, calories: 700, id: `w_${i}` }));
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
  const delta = kernel.claims.find(claim => claim.fact === 'protein_hit_rate_delta_pp');
  assert.ok(hitRate);
  assert.ok(usableProvenance(hitRate.provenance));
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
    id: `p${i}`
  }));
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'search protein meals that contributed most',
    today: TODAY,
    now: NOW,
    stores: { meals }
  });
  assert.ok(kernel.evidence.search_nutrition_records);
  if (kernel.evidence.search_nutrition_records.truncated) {
    assert.ok((kernel.retrieveLog?.length ?? 0) >= 1);
  }
});

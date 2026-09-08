/**
 * Hyaluronica skincare kernel expansion. DETERMINISTIC TEST only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseSkincareEvidence } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function skin(date, extras = {}) {
  return {
    date,
    routine: extras.routine ?? 'pm',
    product: extras.product ?? extras.routine ?? 'serum',
    notes: extras.notes ?? '',
    response_tags: extras.response_tags ?? [],
    is_procedure: Boolean(extras.is_procedure),
    id: extras.id ?? `skin_${date}`,
    path: extras.path ?? `data/skincare/${date}.md`
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('Hyaluronica paraphrases route into routine_response (≥95%)', () => {
  const messages = [
    'what did I use recently',
    'am I following the routine',
    'is my routine helping',
    'skincare adherence check',
    'has a product been associated with a response',
    'what changed before a flare',
    'irritation log review',
    'routine response evidence',
    'missing from the routine history',
    'serum reaction history',
    'pm routine check',
    'skincare logs lately',
    'did the new cream help',
    'flare after product',
    'routine consistency',
    'skin response notes',
    'what products lately',
    'adherence versus response',
    'skincare overview',
    'routine helping or not'
  ];
  const hits = messages.filter(message => planTurn({ slug: 'hyaluronica', message }).plan.workflow === 'routine_response');
  assert.ok(hits.length / messages.length >= 0.95);
});

test('routine adherence derives from logs without inventing effectiveness', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'am I following the routine',
    today: TODAY,
    now: NOW,
    stores: {
      skincare: [
        skin('2026-08-19', { routine: 'pm', notes: 'serum applied' }),
        skin('2026-08-18', { routine: 'am', notes: 'cleanser' })
      ]
    }
  });
  const adherence = kernel.claims.find(claim => claim.fact === 'skincare_adherence_pct' || claim.fact === 'days_with_log');
  assert.ok(adherence);
  assert.match(kernel.interpretationBlock, /Adherence is not the same as improvement/i);
});

test('missing logs stay missing', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'is my routine helping',
    today: TODAY,
    now: NOW,
    stores: { skincare: [] }
  });
  assert.ok(kernel.limitations.some(item => /No skincare logs/i.test(item.text)));
  assert.match(kernel.interpretationBlock, /Do not claim the routine is helping/i);
});

test('historical irritation is not current irritation', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'what changed before a flare or irritation log',
    today: TODAY,
    now: NOW,
    stores: {
      skincare: [
        skin('2026-08-10', { product: 'retinol', notes: 'applied retinol' }),
        skin('2026-08-11', { product: 'retinol', notes: 'irritation and redness overnight' })
      ]
    }
  });
  const hist = kernel.claims.find(claim => claim.fact === 'historical_irritation_date');
  assert.equal(hist.value, '2026-08-11');
  assert.match(kernel.interpretationBlock, /Historical irritation logs stay historical/i);
  assert.equal(kernel.claims.find(claim => claim.fact === 'stated_current_irritation'), undefined);
});

test('current-turn irritation is user_stated_current_turn', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'my face is flaring today — is my routine helping',
    today: TODAY,
    now: NOW,
    stores: {
      skincare: [skin('2026-08-05', { notes: 'old irritation', product: 'acid' })]
    }
  });
  const stated = kernel.claims.find(claim => claim.fact === 'stated_current_irritation');
  assert.ok(stated);
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
});

test('product response association is temporal, not causal', () => {
  const analysis = analyseSkincareEvidence([
    skin('2026-08-09', { product: 'new serum', notes: 'started new serum' }),
    skin('2026-08-10', { product: 'new serum', notes: 'irritation after serum' })
  ], TODAY, { message: 'has a product been associated with a response' });
  assert.ok(analysis.temporal_associations.length >= 1);
  assert.equal(analysis.temporal_associations[0].claim, 'temporal_only');
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'has a product been associated with a response',
    today: TODAY,
    now: NOW,
    stores: {
      skincare: [
        skin('2026-08-09', { product: 'new serum', notes: 'started new serum' }),
        skin('2026-08-10', { product: 'new serum', notes: 'irritation after serum' })
      ]
    }
  });
  const assoc = kernel.claims.find(claim => claim.fact === 'temporal_association');
  assert.ok(assoc);
  assert.equal(assoc.kind, 'inference');
  assert.equal(assoc.provenance.reason, 'inference');
  assert.match(kernel.interpretationBlock, /temporal association only/i);
  assert.doesNotMatch(kernel.interpretationBlock, /caused the flare|proven causation/i);
});

test('no silent null provenance on Hyaluronica claims', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'what did I use recently',
    today: TODAY,
    now: NOW,
    stores: { skincare: [skin(TODAY, { routine: 'pm', notes: 'moisturizer' })] }
  });
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  assert.ok(kernelTraceEvent(kernel).sufficiencyDecision);
});

/**
 * Remaining specialist smoke + Hammond block. DETERMINISTIC only.
 * Full capability suites live in brisket/hyaluronica/penelope/vera-kernel tests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { planTurn, runAgentKernel, kernelTraceEvent } from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

const REMAINING = [
  {
    slug: 'brisket',
    message: 'how am I eating lately',
    workflow: 'nutrition_adherence',
    analysisTool: 'analyse_nutrition_evidence',
    stores: { meals: [{ type: 'meal', date: TODAY, protein_g: 40, calories: 300, notes: 'eggs', id: 'm1', path: 'data/n/m1.md' }] }
  },
  {
    slug: 'hyaluronica',
    message: 'is my routine helping',
    workflow: 'routine_response',
    analysisTool: 'analyse_skincare_evidence',
    stores: { skincare: [{ date: TODAY, notes: 'serum applied', routine: 'pm', id: 's1', path: 'data/s/s1.md' }] }
  },
  {
    slug: 'penelope',
    message: 'feeling like this often',
    workflow: 'diary_recurrence',
    analysisTool: 'analyse_diary_evidence',
    stores: {
      mindEvents: [{
        path: 'data/mind/2026-08-18-diary.md',
        record: { type: 'diary', date: '2026-08-18', mood: 'flat', notes: 'feeling flat' }
      }]
    }
  },
  {
    slug: 'vera',
    message: 'what patterns across sessions',
    workflow: 'mind_reflection',
    analysisTool: 'analyse_mind_evidence',
    stores: {
      mindEvents: [{
        path: 'data/mind/2026-08-10-session.md',
        record: { type: 'session', date: '2026-08-10', notes: 'therapy note', themes: ['anxiety'] }
      }]
    }
  }
];

test('remaining specialists route, analyse, and leave no silent null provenance', () => {
  for (const row of REMAINING) {
    assert.equal(planTurn({ slug: row.slug, message: row.message }).plan.workflow, row.workflow, row.slug);
    const kernel = runAgentKernel({
      slug: row.slug,
      message: row.message,
      today: TODAY,
      now: NOW,
      stores: row.stores
    });
    assert.equal(kernel.plan.workflow, row.workflow, row.slug);
    assert.ok(kernel.evidence[row.analysisTool], `${row.slug} missing ${row.analysisTool}`);
    const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
    assert.deepEqual(unexplained.map(claim => `${row.slug}:${claim.tool}:${claim.fact}`), []);
    const trace = kernelTraceEvent(kernel);
    assert.ok(trace.sufficiencyDecision, row.slug);
    assert.ok(kernel.interpretationBlock.length > 40, row.slug);
  }
});

test('Hammond remains canned supervisor prototype — not rebuilt this tranche', () => {
  const plan = planTurn({ slug: 'hammond', message: 'what is slipping across my life' });
  assert.equal(plan.plan.workflow, 'cross_hub_supervision');
});

/**
 * Sara temporal discipline. DETERMINISTIC TEST only — not a live deploy gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyseMedicalEvidence,
  statedHealthConstraints
} from '../../netlify/functions/_shared/medical-overview-read.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function medicalEvent({ date, title, path, medications, symptoms, id }) {
  return {
    path: path ?? `data/body/${String(date).slice(0, 7).replace('-', '/')}/${date}-medical-${id || 'x'}.md`,
    record: {
      type: 'medical',
      id: id || `med_${date}`,
      date,
      title,
      provider: 'GP',
      medications,
      symptoms
    },
    body: ''
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('Sara paraphrases route into health_timeline (≥95%)', () => {
  const messages = [
    "how's my health looking",
    'health timeline please',
    'is my weight change unusual lately',
    'any medical context I should know',
    'brief the clinic visit',
    'what do my bloods say',
    'appointment brief for today',
    'has this flare shown up before',
    'doctor visit recap',
    'body and medical check in',
    'gp notes from recent visits',
    'medication and weight together',
    'health overview',
    'is this symptom in the record',
    'medical timeline',
    'clinic history check',
    'what did the last visit cover',
    'unusual weight change',
    'health records recap',
    'compare recent pathology results'
  ];
  const hits = messages.filter(message => planTurn({ slug: 'sara', message }).plan.workflow === 'health_timeline');
  assert.ok(hits.length / messages.length >= 0.95);
});

test('Case A: visit five days ago with abdominal pain stays recent, not current', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: "How is my health looking today?",
    today: TODAY,
    now: NOW,
    stores: {
      composition: [],
      measurements: [],
      medicalEvents: [
        medicalEvent({
          date: '2026-08-15',
          title: 'Flare review',
          id: 'recent_flare',
          symptoms: ['abdominal pain']
        })
      ]
    }
  });
  const recent = kernel.claims.find(claim => claim.fact === 'recent_visit_count');
  const historical = kernel.claims.find(claim => claim.fact === 'historical_visit_count');
  assert.equal(recent.value, 1);
  assert.equal(historical?.value ?? 0, 0);
  assert.equal(kernel.claims.find(claim => claim.fact === 'current_visit_count'), undefined);
  assert.match(kernel.interpretationBlock, /recent historical evidence only/i);
  assert.doesNotMatch(kernel.interpretationBlock, /current_visit|current_window/);
  assert.equal(kernel.claims.find(claim => claim.fact === 'stated_current_symptom'), undefined);
});

test('Case B: medication on a visit seven days ago is dated, not current adherence', () => {
  const analysis = analyseMedicalEvidence([
    medicalEvent({
      date: '2026-08-13',
      title: 'Steroid course',
      id: 'recent_med',
      medications: ['prednisolone']
    })
  ], { today: TODAY, message: 'medication history' });
  assert.equal(analysis.recent_visit_count, 1);
  assert.equal(analysis.historical_visit_count, 0);
  assert.equal(analysis.recent_visits[0].medications[0], 'prednisolone');
  assert.equal(analysis.recent_visits[0].recency, 'recent_window');
  assert.match(analysis.how_to_read, /Recency alone does not establish/);
});

test('Case C: abnormal blood result ten days ago is dated, not today', () => {
  const analysis = analyseMedicalEvidence([
    {
      path: 'data/body/2026/08/2026-08-10-bloods.md',
      record: { type: 'bloods', date: '2026-08-10', markers: { crp: 'high' } },
      body: ''
    }
  ], { today: TODAY, message: 'what do my bloods say' });
  assert.equal(analysis.labs[0].recency, 'recent_window');
  assert.notEqual(analysis.labs[0].recency, 'current_window');
  assert.equal(analysis.labs[0].date, '2026-08-10');
});

test('Case D: current-turn symptom stays user_stated_current_turn', () => {
  const stated = statedHealthConstraints('My stomach is flaring today and I need a health overview');
  assert.ok(stated.current_symptom);
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'My stomach is flaring today — any medical context I should know',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [],
      measurements: [],
      medicalEvents: [
        medicalEvent({ date: '2025-02-01', title: 'Old flare', id: 'old' })
      ]
    }
  });
  const claim = kernel.claims.find(c => c.fact === 'stated_current_symptom');
  assert.ok(claim);
  assert.equal(claim.provenance.reason, 'user_stated_current_turn');
  assert.match(kernel.interpretationBlock, /user_stated_current_turn/);
  const hist = kernel.claims.find(claim => claim.fact === 'historical_visit_title');
  assert.equal(hist.value, 'Old flare');
});

test('Case E: old visit several months ago is historical', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'any medical context I should know',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [],
      measurements: [],
      medicalEvents: [
        medicalEvent({
          date: '2025-01-10',
          title: 'Flare review',
          id: 'old_flare',
          symptoms: ['abdominal pain']
        })
      ]
    }
  });
  const historical = kernel.claims.find(claim => claim.fact === 'historical_visit_count');
  const recent = kernel.claims.find(claim => claim.fact === 'recent_visit_count');
  assert.equal(historical.value, 1);
  assert.equal(recent.value, 0);
  assert.match(kernel.interpretationBlock, /Older historical medical visits stay historical/);
});

test('Case F: undated record stays missing_date', () => {
  const analysis = analyseMedicalEvidence([
    {
      path: 'data/body/unknown-medical.md',
      record: { type: 'medical', title: 'Undated note', id: 'undated' },
      body: ''
    }
  ], { today: TODAY, message: 'medical timeline' });
  assert.equal(analysis.missing_date_count, 1);
  assert.equal(analysis.visits[0].recency, 'missing_date');
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'medical timeline please',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [],
      measurements: [],
      medicalEvents: [{
        path: 'data/body/unknown-medical.md',
        record: { type: 'medical', title: 'Undated note', id: 'undated' },
        body: ''
      }]
    }
  });
  assert.match(kernel.interpretationBlock, /missing dates/);
});

test('two dated records compare without collapsing dates', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'is my weight change unusual lately',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [
        { date: '2026-08-18', weight_kg: 90, path: 'data/body/2026/08/2026-08-18-composition.md' },
        { date: '2026-08-01', weight_kg: 92, path: 'data/body/2026/08/2026-08-01-composition.md' }
      ],
      measurements: [],
      medicalEvents: []
    }
  });
  const latest = kernel.claims.find(claim => claim.fact === 'comparison_latest_date');
  const previous = kernel.claims.find(claim => claim.fact === 'comparison_previous_date');
  assert.equal(latest.value, '2026-08-18');
  assert.equal(previous.value, '2026-08-01');
  assert.notEqual(latest.value, previous.value);
  assert.match(kernel.interpretationBlock, /preserve both dates/);
});

test('unrelated historical finding is not a causal explanation', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'is my weight change unusual lately',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [
        { date: '2026-08-18', weight_kg: 90 },
        { date: '2026-08-01', weight_kg: 92 }
      ],
      measurements: [],
      medicalEvents: [
        medicalEvent({ date: '2023-05-01', title: 'Broken toe', id: 'toe' })
      ]
    }
  });
  assert.match(kernel.interpretationBlock, /unrelated historical findings/);
  const hist = kernel.claims.find(claim => claim.fact === 'historical_visit_title');
  assert.equal(hist.value, 'Broken toe');
  assert.equal(hist.provenance.date, '2023-05-01');
});

test('Sara medical claims keep path provenance where available', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'health timeline please',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [],
      measurements: [],
      medicalEvents: [
        medicalEvent({
          date: '2026-08-15',
          title: 'Gastro review',
          id: 'gas',
          path: 'data/body/2026/08/2026-08-15-medical-gas.md'
        })
      ]
    }
  });
  const visit = kernel.claims.find(claim => claim.fact === 'recent_visit_title');
  assert.equal(visit.value, 'Gastro review');
  assert.ok(visit.provenance.recordPath || visit.provenance.recordId);
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  const trace = kernelTraceEvent(kernel);
  assert.equal(trace.workflow, 'health_timeline');
  assert.ok(trace.sufficiencyDecision);
});

/**
 * Vera mind-session kernel expansion. DETERMINISTIC TEST only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseMindEvidence } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function session(date, extras = {}) {
  return {
    path: extras.path ?? `data/mind/${date}-session.md`,
    record: {
      type: 'session',
      date,
      title: extras.title ?? 'Session',
      themes: extras.themes ?? ['anxiety'],
      notes: extras.notes ?? 'discussed anxiety at work',
      working_model: extras.working_model ?? null,
      id: extras.id ?? `sess_${date}`
    },
    body: extras.notes ?? 'discussed anxiety at work'
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('Vera paraphrases route into mind_reflection (≥90%)', () => {
  const messages = [
    'what patterns recur across sessions',
    'what themes have changed',
    'what did I repeatedly discuss',
    'what has not appeared recently',
    'session reflection please',
    'mind session patterns',
    'therapy notes overview',
    'compare recent sessions',
    'where do session records disagree',
    'longitudinal mind themes',
    'session history check',
    'recurring discussion topics',
    'mind reflection',
    'what changed in sessions',
    'sparse session records',
    'session themes lately',
    'prior versus recent sessions',
    'mind patterns across weeks',
    'session comparison',
    'reflect on recent sessions'
  ];
  const hits = messages.filter(message => planTurn({ slug: 'vera', message }).plan.workflow === 'mind_reflection');
  assert.ok(hits.length / messages.length >= 0.9);
});

test('multi session retrieval and recurring themes', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'what patterns recur across sessions',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        session('2026-08-18', { themes: ['anxiety', 'work'], notes: 'anxiety about deadlines' }),
        session('2026-08-11', { themes: ['anxiety'], notes: 'anxiety returned this week' }),
        session('2026-08-04', { themes: ['anxiety', 'sleep'], notes: 'anxiety and sleep disruption' })
      ]
    }
  });
  const count = kernel.claims.find(claim => claim.fact === 'mind_session_count');
  assert.ok(count.value >= 3);
  const theme = kernel.claims.find(claim => claim.fact === 'mind_theme');
  assert.ok(theme);
  assert.equal(theme.kind, 'calculation');
  assert.equal(theme.provenance.sourceType, 'calculation');
  assert.match(kernel.interpretationBlock, /Recurring themes are derived/i);
});

test('changed themes across recent versus prior windows', () => {
  const analysis = analyseMindEvidence([
    session('2026-08-18', { themes: ['grief'], notes: 'grief after loss' }),
    session('2026-08-11', { themes: ['grief'], notes: 'grief continued' }),
    session('2026-07-01', { themes: ['avoidance'], notes: 'avoidance at work' }),
    session('2026-06-20', { themes: ['avoidance'], notes: 'avoidance pattern' }),
    session('2026-06-10', { themes: ['avoidance'], notes: 'avoidance again' }),
    session('2026-05-01', { themes: ['avoidance'], notes: 'older avoidance' })
  ], TODAY, { message: 'what themes have changed' });
  assert.ok(analysis.changed_themes.appeared_recently.includes('grief')
    || analysis.recurring_themes.some(t => t.term === 'grief'));
  assert.ok(
    analysis.changed_themes.not_appeared_recently.includes('avoidance')
    || analysis.prior_sessions.some(s => (s.themes ?? []).includes('avoidance'))
  );
});

test('historical session content is not present symptom', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'I have work stress today — what patterns recur across sessions',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        session('2026-03-01', { themes: ['work stress'], notes: 'old work stress discussion' })
      ]
    }
  });
  const stated = kernel.claims.find(claim => claim.fact === 'stated_current_theme');
  assert.ok(stated);
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
  assert.match(kernel.interpretationBlock, /Do not convert historical session content into a present symptom/i);
});

test('sparse records stay weak', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'what patterns recur across sessions',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [session('2026-08-10', { themes: ['sleep'], notes: 'one sleep discussion' })]
    }
  });
  assert.ok(kernel.limitations.some(item => /Sparse session records/i.test(item.text)));
  assert.match(kernel.interpretationBlock, /sparse/i);
});

test('conflict signals stay fail-visible without diagnosis', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'where do session records disagree or change',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        session('2026-08-18', { themes: ['anxiety'], notes: 'feeling better and improved coping' }),
        session('2026-08-11', { themes: ['anxiety'], notes: 'stuck and worse this week' })
      ]
    }
  });
  const conflicts = kernel.claims.find(claim => claim.fact === 'mind_conflict_signal_count');
  assert.ok(conflicts?.value >= 1);
  assert.match(kernel.interpretationBlock, /conflict_signal/i);
  assert.doesNotMatch(kernel.interpretationBlock, /\bdiagnos(e|is|ing)\b.*disorder/i);
  assert.match(kernel.interpretationBlock, /Do not diagnose/i);
});

test('no diagnostic invention and provenance usable', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'what did I repeatedly discuss',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        session('2026-08-18', { themes: ['shame'], notes: 'shame in relationships' }),
        session('2026-08-04', { themes: ['shame'], notes: 'shame returned in session' })
      ]
    }
  });
  assert.doesNotMatch(kernel.promptBlock + kernel.interpretationBlock, /clinical diagnosis|PTSD|disorder confirmed/i);
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  assert.ok(kernelTraceEvent(kernel).sufficiencyDecision);
});

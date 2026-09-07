/**
 * Penelope diary kernel expansion. DETERMINISTIC TEST only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseDiaryEvidence } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function diary(date, extras = {}) {
  return {
    path: extras.path ?? `data/mind/${date}-diary.md`,
    record: {
      type: 'diary',
      date,
      mood: extras.mood ?? 'flat',
      mood_score: extras.mood_score ?? 3,
      notes: extras.notes ?? 'feeling flat about work stress',
      tags: extras.tags ?? ['work'],
      id: extras.id ?? `diary_${date}`
    },
    body: extras.notes ?? 'feeling flat about work stress'
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('Penelope paraphrases route into diary_recurrence (≥90%)', () => {
  const messages = [
    'have I felt like this before',
    'what themes recur',
    'feeling like this often',
    'diary pattern check',
    'what changed across recent entries',
    'situations around this theme',
    'weak diary evidence',
    'mood recurrence',
    'journal themes lately',
    'have I written about anxiety before',
    'diary overview',
    'recurring feelings',
    'compare recent diary periods',
    'sparse diary evidence',
    'conflicting diary entries',
    'what does my journal say',
    'felt this way before',
    'theme frequency in diary',
    'emotional patterns in entries',
    'diary history search'
  ];
  const hits = messages.filter(message => planTurn({ slug: 'penelope', message }).plan.workflow === 'diary_recurrence');
  assert.ok(hits.length / messages.length >= 0.9);
});

test('Case A: unmatched pattern with fallback context is insufficient_match, not multi_entry', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-19', { notes: 'garden planting', mood: 'calm' }),
        diary('2026-08-18', { notes: 'bought groceries', mood: 'calm' }),
        diary('2026-08-17', { notes: 'watched a film', mood: 'hopeful' }),
        diary('2026-08-16', { notes: 'walked the dog', mood: 'calm' }),
        diary('2026-08-15', { notes: 'fixed a shelf', mood: 'tired' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.supported_match_count, 0);
  assert.ok(analysis.fallback_count > 0);
  assert.equal(analysis.recurrence_strength, 'insufficient_match');
  assert.notEqual(analysis.recurrence_strength, 'multi_entry_recurrence');
  assert.match(kernel.interpretationBlock, /fallback context are context only/i);
  assert.match(kernel.interpretationBlock, /No supported recurrence/i);
});

test('Case B: one genuine match plus unrelated fallback context stays single_entry', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling flat about work', mood: 'flat' }),
    diary('2026-08-17', { notes: 'garden planting only', mood: 'calm' }),
    diary('2026-08-16', { notes: 'bought groceries', mood: 'calm' })
  ], TODAY, { message: 'feeling flat before', query: 'feeling flat' });
  assert.equal(analysis.supported_match_count, 1);
  assert.equal(analysis.recurrence_strength, 'single_entry');
  // Unrelated rows must not be counted as matches even if present in the store.
  assert.ok(analysis.entry_count >= 3);
});

test('Case C: two genuine matches are weak_recurrence', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling tired after work', mood: 'tired' }),
    diary('2026-08-10', { notes: 'feeling tired again', mood: 'tired' })
  ], TODAY, { message: 'feeling like this often', query: 'feeling tired' });
  assert.equal(analysis.supported_match_count, 2);
  assert.equal(analysis.recurrence_strength, 'weak_recurrence');
  assert.equal(analysis.fallback_count, 0);
});

test('Case D: three genuine matches are multi_entry_recurrence', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'feeling flat often',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-18', { notes: 'feeling flat about work stress', mood: 'flat' }),
        diary('2026-08-15', { notes: 'still feeling flat after meetings', mood: 'low' }),
        diary('2026-08-12', { notes: 'feeling flat again tonight', mood: 'flat' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.ok(analysis.supported_match_count >= 3);
  assert.equal(analysis.recurrence_strength, 'multi_entry_recurrence');
  const strength = kernel.claims.find(claim => claim.fact === 'recurrence_strength');
  assert.equal(strength.value, 'multi_entry_recurrence');
  const theme = kernel.claims.find(claim => claim.fact === 'diary_theme');
  assert.ok(theme);
  assert.equal(theme.kind, 'calculation');
  assert.equal(theme.provenance.sourceType, 'calculation');
});

test('Case E: empty diary has no supported recurrence', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: { mindEvents: [] }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.fallback_count, 0);
  assert.equal(analysis.recurrence_strength, 'none');
  assert.match(kernel.interpretationBlock, /No diary hits|Do not invent a recurring/i);
});

test('single genuine match is not a pattern', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'have I felt like this before',
    today: TODAY,
    now: NOW,
    stores: { mindEvents: [diary('2026-08-18', { notes: 'feeling flat', mood: 'flat' })] }
  });
  const strength = kernel.claims.find(claim => claim.fact === 'recurrence_strength');
  assert.equal(strength.value, 'single_entry');
  assert.equal(kernel.evidence.analyse_diary_evidence.supported_match_count, 1);
  assert.match(kernel.interpretationBlock, /One genuine diary match is not a pattern/i);
});

test('current turn mood versus historical diary state', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'I am feeling anxious today — have I felt like this before',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-07-01', { notes: 'old anxiety about travel', mood: 'anxious' })
      ]
    }
  });
  const stated = kernel.claims.find(claim => claim.fact === 'stated_current_mood');
  assert.ok(stated);
  assert.equal(stated.value, 'anxious');
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
  assert.match(kernel.interpretationBlock, /Do not convert historical moods into that present state/i);
});

test('conflicting diary moods stay visible', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'what themes recur in my diary',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-18', { notes: 'hopeful morning about progress', mood: 'hopeful' }),
        diary('2026-08-17', { notes: 'overwhelmed evening after deadlines', mood: 'overwhelmed' }),
        diary('2026-08-16', { notes: 'calm afternoon walk helped', mood: 'calm' })
      ]
    }
  });
  const conflicts = kernel.claims.find(claim => claim.fact === 'conflicting_mood_count');
  assert.ok(conflicts?.value >= 2);
  assert.match(kernel.interpretationBlock, /moods conflict/i);
});

test('no causal invention and no silent null provenance', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'what situations often appear around this theme',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-18', { notes: 'work stress before presentation', mood: 'anxious' }),
        diary('2026-08-11', { notes: 'work stress after review', mood: 'anxious' })
      ]
    }
  });
  assert.doesNotMatch(kernel.interpretationBlock, /caused by|causal pattern proven/i);
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  assert.ok(kernelTraceEvent(kernel).retrieveLog?.length);
});

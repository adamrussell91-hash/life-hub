/**
 * Penelope diary kernel expansion. DETERMINISTIC TEST only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyseDiaryEvidence,
  resolveDiaryRecurrenceReferent as resolveDiaryRecurrenceReferent
} from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';
import {
  assembleEvidencePack,
  composeEvidenceClaims
} from '../../netlify/functions/_shared/evidence-packs.mjs';

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

test('Case A: bare deictic "this" stays unresolved even with emotional history', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-19', { notes: 'feeling flat after work', mood: 'flat' }),
        diary('2026-08-18', { notes: 'feeling anxious before a meeting', mood: 'anxious' }),
        diary('2026-08-17', { notes: 'feeling hopeful about progress', mood: 'hopeful' }),
        diary('2026-08-16', { notes: 'feeling tired tonight', mood: 'tired' }),
        diary('2026-08-15', { notes: 'feeling calm after a walk', mood: 'calm' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.referent_status, 'unresolved');
  assert.equal(analysis.referent_kind, 'unresolved');
  assert.equal(analysis.referent_value, null);
  assert.equal(analysis.search_query, null);
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.recurrence_strength, 'unresolved_referent');
  assert.notEqual(analysis.recurrence_strength, 'multi_entry_recurrence');
  assert.notEqual(analysis.recurrence_strength, 'weak_recurrence');
  assert.notEqual(analysis.recurrence_strength, 'single_entry');
  // Must not invent a historical mood as the current referent.
  assert.equal(analysis.stated_constraints?.current_mood, null);
  assert.match(kernel.interpretationBlock, /does not establish what "this" refers to/i);
  assert.match(kernel.interpretationBlock, /Do not invent the referent from historical diary entries/i);
  assert.match(kernel.interpretationBlock, /Do not report a recurrence pattern/i);
  assert.match(kernel.interpretationBlock, /what feeling or situation is meant/i);
  assert.equal(
    kernel.sufficiencyDecision?.reason?.includes('unresolved deictic referent') ||
      kernel.limitations.some(item => item.kind === 'unresolved_referent'),
    true
  );
});

test('Case B: current-turn anxious + deictic this resolves and can recur', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'I am feeling anxious today. Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-10', { notes: 'old anxiety about travel', mood: 'anxious' }),
        diary('2026-08-01', { notes: 'feeling anxious before exams', mood: 'anxious' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.referent_kind, 'explicit_current_turn');
  assert.equal(analysis.referent_value, 'anxious');
  assert.equal(analysis.referent_status, 'resolved');
  assert.equal(analysis.stated_constraints.current_mood, 'anxious');
  assert.ok(analysis.supported_match_count >= 2);
  assert.equal(analysis.recurrence_strength, 'weak_recurrence');
  const stated = kernel.claims.find(claim => claim.fact === 'stated_current_mood');
  assert.ok(stated);
  assert.equal(stated.value, 'anxious');
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
  assert.match(kernel.interpretationBlock, /user_stated_current_turn/i);
  assert.match(kernel.interpretationBlock, /do not establish that the current state came from those past events/i);
});

test('Case C: explicit named anxious query does not need current mood', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-10', { notes: 'old anxiety about travel', mood: 'anxious' }),
    diary('2026-08-01', { notes: 'feeling anxious before exams', mood: 'anxious' })
  ], TODAY, { message: 'Have I felt anxious before?', query: 'Have I felt anxious before?' });
  assert.equal(analysis.referent_kind, 'explicit_query');
  assert.equal(analysis.referent_value, 'anxious');
  assert.equal(analysis.stated_constraints.current_mood, null);
  assert.equal(analysis.supported_match_count, 2);
  assert.equal(analysis.recurrence_strength, 'weak_recurrence');
});

test('Case D: current-turn flat with one historical match stays single_entry', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling flat after work', mood: 'flat' })
  ], TODAY, { message: 'I feel flat today. Has this happened before?' });
  assert.equal(analysis.referent_kind, 'explicit_current_turn');
  assert.equal(analysis.referent_value, 'flat');
  assert.equal(analysis.supported_match_count, 1);
  assert.equal(analysis.recurrence_strength, 'single_entry');
});

test('Case E: work stress theme resolves when explicitly named in-turn', () => {
  // Bounded behaviour: "This work stress feels familiar..." is treated as an
  // explicit current-turn theme because the phrase is present in the message.
  const referent = resolveDiaryRecurrenceReferent(
    'This work stress feels familiar. Have I felt like this before?'
  );
  assert.equal(referent.kind, 'explicit_current_turn');
  assert.equal(referent.value, 'work stress');
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'work stress before presentation', mood: 'anxious' }),
    diary('2026-08-11', { notes: 'work stress after review', mood: 'anxious' }),
    diary('2026-08-04', { notes: 'work stress again', mood: 'low' })
  ], TODAY, { message: 'This work stress feels familiar. Have I felt like this before?' });
  assert.equal(analysis.referent_value, 'work stress');
  assert.ok(analysis.supported_match_count >= 2);
  assert.ok(['weak_recurrence', 'multi_entry_recurrence'].includes(analysis.recurrence_strength));
});

test('Case F: bare deictic never picks majority or recent historical mood', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-19', { notes: 'feeling flat', mood: 'flat' }),
    diary('2026-08-18', { notes: 'feeling anxious', mood: 'anxious' }),
    diary('2026-08-17', { notes: 'feeling calm', mood: 'calm' }),
    diary('2026-08-16', { notes: 'feeling flat again', mood: 'flat' }),
    diary('2026-08-15', { notes: 'feeling flat still', mood: 'flat' })
  ], TODAY, { message: 'Have I felt like this before?' });
  assert.equal(analysis.referent_status, 'unresolved');
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.recurrence_strength, 'unresolved_referent');
  assert.equal(analysis.stated_constraints.current_mood, null);
  assert.equal(analysis.referent_value, null);
});

test('Case G: tired matches count; hopeful feel-language does not', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'felt tired after training', mood: 'tired' }),
    diary('2026-08-12', { notes: 'feeling tired again', mood: 'tired' }),
    diary('2026-08-05', { notes: 'feeling hopeful about tomorrow', mood: 'hopeful' })
  ], TODAY, { message: 'Have I felt tired before?', query: 'Have I felt tired before?' });
  assert.equal(analysis.referent_kind, 'explicit_query');
  assert.equal(analysis.referent_value, 'tired');
  assert.equal(analysis.supported_match_count, 2);
  assert.equal(analysis.recurrence_strength, 'weak_recurrence');
  assert.ok(analysis.matched_entries.every(entry => /tired/i.test(entry.notes)));
});

test('Case H: anxious current-turn does not count generic feeling stressed', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling stressed about deadlines', mood: 'stressed' }),
    diary('2026-08-10', { notes: 'feeling stressed again', mood: 'stressed' })
  ], TODAY, { message: "I'm anxious today — have I felt like this before?" });
  assert.equal(analysis.referent_value, 'anxious');
  assert.equal(analysis.supported_match_count, 0);
  assert.ok(['insufficient_match', 'none'].includes(analysis.recurrence_strength));
});

test('explicit feeling flat query still supports single_entry without deictic this', () => {
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling flat about work', mood: 'flat' }),
    diary('2026-08-17', { notes: 'garden planting only', mood: 'calm' })
  ], TODAY, { message: 'feeling flat before', query: 'feeling flat' });
  assert.equal(analysis.supported_match_count, 1);
  assert.equal(analysis.recurrence_strength, 'single_entry');
});

test('three genuine flat matches remain multi_entry_recurrence', () => {
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
});

test('empty diary with bare deictic is unresolved_referent, not invented recurrence', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: { mindEvents: [] }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.recurrence_strength, 'unresolved_referent');
  assert.match(kernel.interpretationBlock, /does not establish what "this" refers to/i);
});

test('generic feel\/felt is not a standalone recurrence target', () => {
  const referent = resolveDiaryRecurrenceReferent('have I felt like this before');
  assert.equal(referent.kind, 'unresolved');
  assert.equal(referent.query, null);
  const analysis = analyseDiaryEvidence([
    diary('2026-08-18', { notes: 'feeling flat', mood: 'flat' })
  ], TODAY, { message: 'have I felt like this before' });
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.recurrence_strength, 'unresolved_referent');
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

test('whole-kernel unresolved deictic skips semantic search/theme and leaks no match claims', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-19', { notes: 'feeling flat after work', mood: 'flat' }),
        diary('2026-08-18', { notes: 'feeling anxious before meeting', mood: 'anxious' }),
        diary('2026-08-17', { notes: 'feeling hopeful today', mood: 'hopeful' }),
        diary('2026-08-16', { notes: 'feeling tired after training', mood: 'tired' })
      ]
    }
  });
  assert.equal(kernel.plan.workflow, 'diary_recurrence');
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.referent_status, 'unresolved');
  assert.equal(analysis.supported_match_count, 0);
  assert.equal(analysis.recurrence_strength, 'unresolved_referent');
  assert.equal(kernel.evidence.search_diary_records.skipped, true);
  assert.equal(kernel.evidence.search_diary_records.reason, 'unresolved_referent');
  assert.equal(kernel.evidence.extract_diary_themes.skipped, true);
  assert.equal(kernel.evidence.get_diary_range.context_only, true);
  const facts = kernel.claims.map((c) => `${c.tool}:${c.fact}`);
  assert.ok(facts.includes('search_diary_records:search_skipped_reason'));
  assert.equal(facts.some((f) => f.startsWith('search_diary_records:first_result_')), false);
  assert.equal(facts.some((f) => f.endsWith(':diary_theme')), false);
  assert.equal(facts.some((f) => f.endsWith(':diary_entry_mood')), false);
  assert.equal(facts.some((f) => f === 'search_diary_records:result_count'), false);
  const skipped = (kernel.retrieveLog?.[0]?.tools ?? []).filter((t) => t.skipped);
  assert.ok(skipped.some((t) => t.name === 'search_diary_records' && t.skip_reason === 'unresolved_referent'));
  assert.ok(skipped.some((t) => t.name === 'extract_diary_themes' && t.skip_reason === 'unresolved_referent'));
  assert.equal(kernel.sufficiencyDecision.anotherRound, false);
  assert.match(String(kernel.sufficiencyDecision.reason), /unresolved deictic referent/i);
});

test('whole-kernel resolved anxious deictic still runs semantic diary search', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'I am feeling anxious today. Have I felt like this before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-10', { notes: 'old anxiety about travel', mood: 'anxious' }),
        diary('2026-08-01', { notes: 'feeling anxious before exams', mood: 'anxious' }),
        diary('2026-08-05', { notes: 'feeling hopeful about tomorrow', mood: 'hopeful' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.referent_value, 'anxious');
  assert.equal(analysis.referent_status, 'resolved');
  assert.notEqual(kernel.evidence.search_diary_records?.skipped, true);
  assert.ok((kernel.evidence.search_diary_records?.count ?? 0) >= 1);
  assert.ok(analysis.supported_match_count >= 1);
  const stated = kernel.claims.find((c) => c.fact === 'stated_current_mood');
  assert.ok(stated);
  assert.equal(stated.value, 'anxious');
  assert.equal(stated.provenance.reason, 'user_stated_current_turn');
});

test('whole-kernel explicit tired query searches and ignores hopeful feeling noise', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'Have I felt tired before?',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-18', { notes: 'felt tired after training', mood: 'tired' }),
        diary('2026-08-12', { notes: 'feeling tired again', mood: 'tired' }),
        diary('2026-08-05', { notes: 'feeling hopeful about tomorrow', mood: 'hopeful' })
      ]
    }
  });
  const analysis = kernel.evidence.analyse_diary_evidence;
  assert.equal(analysis.referent_value, 'tired');
  assert.notEqual(kernel.evidence.search_diary_records?.skipped, true);
  assert.equal(analysis.supported_match_count, 2);
  assert.equal(analysis.matched_entries.length, 2);
  assert.ok(analysis.matched_entries.every((e) => /tired/i.test(e.notes)));
});

test('non-deictic theme query still runs search and theme extraction', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'what themes recur in my diary',
    today: TODAY,
    now: NOW,
    stores: {
      mindEvents: [
        diary('2026-08-18', { notes: 'work stress before presentation', mood: 'anxious' }),
        diary('2026-08-11', { notes: 'work stress after review', mood: 'anxious' }),
        diary('2026-08-04', { notes: 'calm afternoon walk helped', mood: 'calm' })
      ]
    }
  });
  assert.notEqual(kernel.evidence.extract_diary_themes?.skipped, true);
  assert.notEqual(kernel.evidence.search_diary_records?.skipped, true);
});

test('assembleEvidencePack unresolved Penelope turn skips semantic search/theme claims', () => {
  const pack = assembleEvidencePack({
    slug: 'penelope',
    message: 'Have I felt like this before?',
    today: TODAY,
    stores: {
      mindEvents: [
        diary('2026-08-19', { notes: 'feeling flat after work', mood: 'flat' }),
        diary('2026-08-18', { notes: 'feeling anxious before meeting', mood: 'anxious' }),
        diary('2026-08-17', { notes: 'feeling hopeful today', mood: 'hopeful' }),
        diary('2026-08-16', { notes: 'feeling tired after training', mood: 'tired' })
      ]
    },
    force: true
  });
  const search = pack.sections.find((s) => s.id === 'search_diary_records');
  const themes = pack.sections.find((s) => s.id === 'extract_diary_themes');
  const range = pack.sections.find((s) => s.id === 'get_diary_range');
  assert.equal(search?.data?.skipped, true);
  assert.equal(themes?.data?.skipped, true);
  assert.equal(range?.data?.context_only, true);
  const evidence = Object.fromEntries(pack.sections.map((s) => [s.id, s.data]));
  const composed = composeEvidenceClaims(evidence);
  const facts = composed.claims.map((c) => `${c.tool}:${c.fact}`);
  assert.ok(facts.includes('search_diary_records:search_skipped_reason'));
  assert.equal(facts.some((f) => f.startsWith('search_diary_records:first_result_')), false);
  assert.equal(facts.some((f) => f.endsWith(':diary_theme')), false);
  assert.equal(facts.some((f) => f.endsWith(':diary_entry_mood')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { countPatterns, DEFAULT_MONITOR, needsFor, signalsFor } from '../../netlify/functions/_shared/profile-evidence.mjs';
import { comebackNote, QUIET_MIN_NEW, quietCountRecord, quietState, quietUntilRecord, termEndFor } from '../../netlify/functions/_shared/suggestion-quiet.mjs';
import { cleanFeedbackCodes } from '../../netlify/functions/_shared/feedback-codes.mjs';
import { cleanSettings, dismiss, loadSuggestions, QUIET_KEY, SIGNALS_KEY } from '../../netlify/functions/_shared/walkthru-monitor.mjs';
import { createWalkthruSuggestionsHandler } from '../../netlify/functions/walkthru-suggestions.mjs';
import { markWalkthruDirty, DIRTY_KEY } from '../../netlify/functions/_shared/walkthru-dirty.mjs';

const students = ['s1', 's2', 's3', 's4'];
const item = (over) => ({ item: 'q1#1', tags: ['out:o1'], share: 1, why: [], student: 's1', source: 'quiz:a', date: '2026-10-05', confidence: null, ...over });
const weakRecall = (source, date) => students.map((student) => item({ student, source, date, share: 0, item: `${source}#1` })).concat(students.map((student) => item({ student, source, date, share: 0.2, item: `${source}#2`, tags: ['fam:f1'] })), students.map((student) => item({ student, source, date, share: 0, item: `${source}#3` })));

test('each problem type is derived from signals the evidence already holds', () => {
  const recall = needsFor(weakRecall('quiz:a', '2026-10-05'), []);
  assert.ok(recall.some((n) => n.type === 'recall'));
  const strong = students.map((student) => item({ student, share: 1 }));
  assert.deepEqual(needsFor(strong, []), []);
  // part marks everywhere: fluency
  const part = students.flatMap((student) => [1, 2, 3].map((n) => item({ student, share: 0.5, item: `q${n}#1`, tags: ['tech:x'] })));
  assert.ok(needsFor(part, []).some((n) => n.type === 'fluency'));
  // a weak skill tag: dexterity
  const skill = students.flatMap((student) => [1, 2].map((n) => item({ student, share: 0, item: `q${n}#1`, tags: ['skill:a.b'] })));
  assert.ok(needsFor(skill, []).some((n) => n.type === 'dexterity'));
  // codes Adam marked with a problem type
  const codes = [{ id: 'c_rq', problem_type: 'recognising' }, { id: 'c_x' }];
  const coded = ['s1', 's2'].map((student) => item({ student, share: 0, tags: ['tech:x'], why: [{ type: 'code', id: 'c_rq' }] }));
  assert.ok(needsFor(coded, codes).some((n) => n.type === 'recognising'));
  const uncoded = ['s1', 's2'].map((student) => item({ student, share: 0, tags: ['tech:x'], why: [{ type: 'code', id: 'c_x' }] }));
  assert.ok(!needsFor(uncoded, codes).some((n) => n.type === 'recognising'));
  // time waits: no unanswered-items signal exists yet
  assert.ok(![...recall, ...needsFor(part, [])].some((n) => n.type === 'time'));
});

const sig = (source, date, type = 'recall') => ({ source, title: source, date, type, students: 3 });

test('two quizzes make nothing; three within three weeks make a suggestion', () => {
  const two = { c1: [sig('q1', '2026-10-01'), sig('q2', '2026-10-08')] };
  assert.deepEqual(countPatterns(two, '2026-10-14').filter((p) => p.kind === 'repeated'), []);
  const three = { c1: [...two.c1, sig('q3', '2026-10-13')] };
  const found = countPatterns(three, '2026-10-14');
  assert.equal(found[0].kind, 'repeated');
  assert.equal(found[0].key, 'recall:c1');
  assert.equal(found[0].count, 3);
  // the third quiz fell outside three weeks: only two count
  assert.deepEqual(countPatterns({ c1: [sig('q1', '2026-09-01'), sig('q2', '2026-10-08'), sig('q3', '2026-10-13')] }, '2026-10-14').filter((p) => p.kind === 'repeated'), []);
});

test('the same problem in two classes is a pattern; a lone recent signal is a one-off', () => {
  const across = countPatterns({ c1: [sig('q1', '2026-10-08')], c2: [sig('q9', '2026-10-09')] }, '2026-10-14');
  assert.ok(across.some((p) => p.key === 'recall:classes' && p.scope === 'classes' && p.count === 2));
  const lone = countPatterns({ c1: [sig('q1', '2026-10-12')] }, '2026-10-14');
  assert.equal(lone.length, 1);
  assert.equal(lone[0].kind, 'one_off');
  assert.equal(lone[0].key, 'recall:c1:one');
  // settings are numbers, not constants
  assert.equal(countPatterns({ c1: [sig('q1', '2026-10-12'), sig('q2', '2026-10-13')] }, '2026-10-14', { ...DEFAULT_MONITOR, quizzes: 2 })[0].kind, 'repeated');
  assert.deepEqual(cleanSettings({ quizzes: 1, weeks: 99, classes: 3 }), { ...DEFAULT_MONITOR, classes: 3 });
});

test('signalsFor makes one signal per source and type', () => {
  const evidence = [...weakRecall('quiz:a', '2026-10-05'), ...weakRecall('quiz:b', '2026-10-12')];
  const signals = signalsFor(evidence, [{ source: 'quiz:a', title: 'A' }, { source: 'quiz:b', title: 'B' }], []);
  assert.deepEqual(signals.filter((s) => s.type === 'recall').map((s) => s.source), ['quiz:a', 'quiz:b']);
});

test('Not now comes back only at double the evidence with enough new; never on time alone', () => {
  const rec = quietCountRecord('not_now', 3, '2026-11-04T01:00:00.000Z');
  assert.equal(quietState(rec, 3, '2027-02-01').quiet, true);
  assert.equal(quietState(rec, 5, '2026-11-20').quiet, true);
  const back = quietState(rec, 6, '2026-11-20');
  assert.equal(back.quiet, false);
  assert.equal(back.comeback.since, 3);
  assert.ok(QUIET_MIN_NEW <= 3);
  assert.equal(comebackNote(back.comeback), 'Dismissed 4 Nov. Since then, 3 more quizzes show the same problem.');
  // double but fewer than the minimum new
  assert.equal(quietState(quietCountRecord('not_now', 1, '2026-11-04T00:00:00.000Z'), 2, '2026-11-20').quiet, true);
  assert.equal(quietState(null, 3, '2026-11-20').quiet, false);
});

test('Not this mutes until the end of term, then lifts', () => {
  assert.equal(termEndFor('2026-10-20'), '2026-12-31');
  assert.equal(termEndFor('2026-08-03'), '2026-09-30');
  const rec = quietUntilRecord('2026-12-31', '2026-10-20T00:00:00.000Z');
  assert.equal(quietState(rec, 99, '2026-12-31').quiet, true);
  assert.equal(quietState(rec, 99, '2027-01-01').quiet, false);
});

test('feedback codes keep a problem type only when it is one of the six', () => {
  const [a, b, c] = cleanFeedbackCodes({ codes: [{ code: 'AR', label: 'A', problem_type: 'recognising' }, { code: 'EX', label: 'B', problem_type: 'bogus' }, { code: 'L', label: 'C' }] });
  assert.equal(a.problem_type, 'recognising');
  assert.equal(b.problem_type, undefined);
  assert.equal(c.problem_type, undefined);
});

function store() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : null; },
    async setJSON(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('suggestions chain evidence to problem type to series to technique, and dismissals stick', async () => {
  const s = store();
  const built = '2026-10-14T00:00:00.000Z';
  await s.setJSON(SIGNALS_KEY, { built_at: built, classes: { c1: { title: '8T2', signals: [sig('q1', '2026-10-01'), sig('q2', '2026-10-08'), sig('q3', '2026-10-13')] } } });
  const { suggestions } = await loadSuggestions(s, '2026-10-14T01:00:00.000Z');
  assert.equal(suggestions.length, 1);
  const one = suggestions[0];
  assert.equal(one.action, 'goal');
  assert.deepEqual(one.chain.map((c) => c.step), ['evidence', 'problem', 'series', 'technique']);
  assert.equal(one.series.key, 'PR');
  assert.equal(one.technique_id, 'w1-quizzing');
  assert.ok(!JSON.stringify(one).includes('s1'));

  await dismiss(s, { key: one.key, kind: 'not_now' }, '2026-10-14T01:00:00.000Z');
  assert.equal((await loadSuggestions(s, '2026-10-20T01:00:00.000Z')).suggestions.length, 0);
  // double the count (3 -> 6) with three new: it comes back and says why
  await s.setJSON(SIGNALS_KEY, { built_at: built, classes: { c1: { title: '8T2', signals: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((q, i) => sig(q, `2026-10-${String(i + 8).padStart(2, '0')}`)) } } });
  const again = (await loadSuggestions(s, '2026-10-20T01:00:00.000Z')).suggestions;
  assert.equal(again.length, 1);
  assert.match(again[0].note, /^Dismissed 14 Oct\. Since then, 3 more quizzes/);

  await dismiss(s, { key: again[0].key, kind: 'not_this' }, '2026-10-20T01:00:00.000Z');
  assert.equal((await loadSuggestions(s, '2026-10-21T01:00:00.000Z')).suggestions.length, 0);
  assert.equal((await loadSuggestions(s, '2027-01-05T01:00:00.000Z')).suggestions.length, 0, 'the signals are old by then, nothing to show');
  await assert.rejects(dismiss(s, { key: 'nope', kind: 'not_now' }), { status: 404 });
  await assert.rejects(dismiss(s, { key: 'x', kind: 'sideways' }), { status: 400 });
  assert.ok(s.map.has(QUIET_KEY));
});

test('a save only marks the evidence changed, and never throws', async () => {
  const s = store();
  await markWalkthruDirty(s, '2026-10-14T00:00:00.000Z');
  assert.equal(s.map.get(DIRTY_KEY).at, '2026-10-14T00:00:00.000Z');
  await markWalkthruDirty({ setJSON: async () => { throw new Error('blob down'); } });
  await markWalkthruDirty(null);
});

const gateEnv = { GITHUB_TOKEN: 't', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

test('the suggestions endpoint is teacher only', async () => {
  const handler = createWalkthruSuggestionsHandler({ env: gateEnv, getContentStore: async () => store() });
  const res = await handler(new Request('https://x.test/api/walkthru-suggestions'));
  assert.equal(res.status, 401);
});

import { describe, expect, it } from 'vitest';
import { answerLine, awaitingLanding, declinedAt, detoursFrom, jointBetween, orderTimeline, resumeReason, waitingOn } from '../../src/views/thinking/thread-logic';
import { resumeDue } from '../../src/views/thinking/resume';
import { linesToSend, pickQuestions } from '../../src/views/thinking/question-detour';
import { sortRows, spendLine } from '../../src/views/thinking/front-door';
import { retryOption } from '../../src/views/thinking/thread-view';
import type { Thread, ThreadRow, ThreadSession } from '../../src/views/thinking/types';

const session = (over: Partial<ThreadSession>): ThreadSession => ({
  kind: 'tool', tool: 'decision-book', sessionId: 's', role: 'home', from: null, question: null, state: 'open', packet: null, landing: null, ...over
});
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 't1', revision: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', title: 'Choosing between two garden plots', situation: 'Two plots, one budget.',
  status: 'open', restUntil: null, digest: { facts: [], choices: [], restsOn: [], openQuestions: [] }, sessions: [], route: [], links: [], lastCheckAt: null, ...over
});

describe('orderTimeline', () => {
  it('puts each detour under the home it left from, in the order they joined', () => {
    const t = thread({
      sessions: [
        session({ sessionId: 'home', addedAt: '2026-11-01T00:00:00Z' }),
        session({ sessionId: 'd2', role: 'detour', tool: 'rules-book', from: { sessionId: 'home', stepId: 'decide' }, addedAt: '2026-11-03T00:00:00Z' }),
        session({ sessionId: 'd1', role: 'detour', tool: 'question-book', from: { sessionId: 'home', stepId: 'explore' }, addedAt: '2026-11-02T00:00:00Z' }),
        session({ sessionId: 'later', role: 'handed_on', tool: 'problem-solver', addedAt: '2026-11-05T00:00:00Z' })
      ]
    });
    expect(orderTimeline(t).map((i) => [i.session.sessionId, i.depth])).toEqual([['home', 0], ['d1', 1], ['d2', 1], ['later', 0]]);
  });
  it('keeps a detour whose origin is missing, indented at the end', () => {
    const t = thread({ sessions: [session({ sessionId: 'home' }), session({ sessionId: 'lost', role: 'detour', from: { sessionId: 'gone', stepId: null } })] });
    expect(orderTimeline(t).map((i) => i.session.sessionId)).toEqual(['home', 'lost']);
    expect(orderTimeline(t)[1].depth).toBe(1);
  });
  it('handles an empty thread', () => {
    expect(orderTimeline(thread())).toEqual([]);
  });
});

describe('detours of a home step', () => {
  const t = thread({
    sessions: [
      session({ sessionId: 'home' }),
      session({ sessionId: 'a', role: 'detour', from: { sessionId: 'home', stepId: 'explore' }, state: 'returned', packet: { answer: 'x', detail: '', restsOn: [], openQuestions: [], actions: [], source: { tool: 'rules-book', sessionId: 'a' } } }),
      session({ sessionId: 'b', role: 'detour', from: { sessionId: 'home', stepId: 'decide' }, state: 'running' })
    ]
  });
  it('filters by step and tells waiting from awaiting a landing', () => {
    expect(detoursFrom(t, 'home').map((s) => s.sessionId)).toEqual(['a', 'b']);
    expect(detoursFrom(t, 'home', 'decide').map((s) => s.sessionId)).toEqual(['b']);
    expect(t.sessions.filter(awaitingLanding).map((s) => s.sessionId)).toEqual(['a']);
    expect(t.sessions.filter(waitingOn).map((s) => s.sessionId)).toEqual(['b']);
  });
});

describe('resume rule', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('fires at three days away and not before', () => {
    expect(resumeReason(thread({ updatedAt: '2026-11-07T12:00:00Z' }), now)).toBe('away');
    expect(resumeReason(thread({ updatedAt: '2026-11-07T12:00:01Z' }), now)).toBeNull();
  });
  it('uses the later of the thread, its last check and the open session', () => {
    expect(resumeReason(thread({ updatedAt: '2026-11-01T00:00:00Z', lastCheckAt: '2026-11-09T00:00:00Z' }), now)).toBeNull();
    expect(resumeReason(thread({ updatedAt: '2026-11-01T00:00:00Z' }), now, '2026-11-10T00:00:00Z')).toBeNull();
  });
  it('fires once the rest day has come, and never for a closed thread', () => {
    expect(resumeReason(thread({ status: 'resting', restUntil: '2026-11-10', updatedAt: '2026-11-09T00:00:00Z' }), now)).toBe('rest_over');
    expect(resumeReason(thread({ status: 'resting', restUntil: '2026-11-11', updatedAt: '2026-11-09T00:00:00Z' }), now)).toBeNull();
    expect(resumeReason(thread({ status: 'closed', updatedAt: '2026-10-01T00:00:00Z' }), now)).toBeNull();
  });
  it('does not repeat for an absence this browser already handled', () => {
    const away = thread({ updatedAt: '2026-11-01T00:00:00Z' });
    expect(resumeDue(away, now, null, NaN)).toBe('away');
    expect(resumeDue(away, now, null, Date.parse('2026-11-10T08:00:00Z'))).toBeNull();
    expect(resumeDue(away, now, null, Date.parse('2026-11-02T00:00:00Z'))).toBe('away');
    const rested = thread({ status: 'resting', restUntil: '2026-11-10', updatedAt: '2026-11-09T00:00:00Z' });
    expect(resumeDue(rested, now, null, Date.parse('2026-11-09T20:00:00Z'))).toBe('rest_over');
    expect(resumeDue(rested, now, null, Date.parse('2026-11-10T08:00:00Z'))).toBeNull();
  });
});

describe('jointBetween', () => {
  const snap = (phase: string, over = {}) => ({ phase, endStep: 'decide', recordKey: null, ...over });
  it('names the joint a session crossed', () => {
    expect(jointBetween(null, snap('explore'))).toBeNull();
    expect(jointBetween(snap('frame'), snap('explore'))).toBe('framed');
    expect(jointBetween(snap('explore'), snap('weigh'))).toBe('step_done');
    expect(jointBetween(snap('weigh'), snap('decide'))).toBe('before_commit');
    expect(jointBetween(snap('decide'), snap('finished'))).toBeNull();
    expect(jointBetween(snap('explore'), snap('explore'))).toBeNull();
  });
  it('a record written wins over a step change, and only when it is new', () => {
    expect(jointBetween(snap('finished'), snap('finished', { recordKey: '1:2026-11-10' }))).toBe('recorded');
    expect(jointBetween(snap('finished', { recordKey: '1:a' }), snap('finished', { recordKey: '1:a' }))).toBeNull();
    expect(jointBetween(snap('finished', { recordKey: '1:a' }), snap('finished', { recordKey: '2:b' }))).toBe('recorded');
  });
  it('a session with no model has no end step to commit on', () => {
    expect(jointBetween(snap('explore', { endStep: null }), snap('decide', { endStep: null }))).toBe('step_done');
  });
});

describe('Not now memory and the answer line', () => {
  it('matches the server: same option at the same step', () => {
    const t = thread({ route: [{ at: 'x', joint: 'step_done', optionId: 'protocol:mirror', reason: null, outcome: 'not_now', stepId: 'explore', sessionId: 'home' }] });
    expect(declinedAt(t, 'protocol:mirror', 'explore')).toBe(true);
    expect(declinedAt(t, 'protocol:mirror', 'decide')).toBe(false);
    expect(declinedAt(t, 'tool:rules-book', 'explore')).toBe(false);
  });
  it('words the answer for the coach', () => {
    expect(answerLine('Wayfinder', 'Pick the shaded plot')).toBe('From Wayfinder detour: Pick the shaded plot');
  });
});

describe('front door and thread view helpers', () => {
  const row = (over: Partial<ThreadRow>): ThreadRow => ({ id: 'r', title: 't', status: 'open', restUntil: null, listed: true, sessionCount: 2, home: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...over });
  it('lists open threads first, newest first, then resting ones by return date', () => {
    const ordered = sortRows([
      row({ id: 'rest-late', status: 'resting', restUntil: '2026-12-01' }),
      row({ id: 'old', updatedAt: '2026-11-02T00:00:00Z' }),
      row({ id: 'rest-soon', status: 'resting', restUntil: '2026-11-20' }),
      row({ id: 'new', updatedAt: '2026-11-09T00:00:00Z' })
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['new', 'old', 'rest-soon', 'rest-late']);
  });
  it('words the spend line', () => {
    expect(spendLine({ aud: 0, calls: 0 })).toContain('nothing yet');
    expect(spendLine({ aud: 0.004, calls: 1 })).toBe('Guide spend this month: under A$0.01 over 1 check.');
    expect(spendLine({ aud: 0.123, calls: 14 })).toBe('Guide spend this month: A$0.12 over 14 checks.');
  });
  it('picks the chosen questions in the thread’s order and sends only ticked, non-empty lines', () => {
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never;
    expect(pickQuestions(all, ['c', 'a', 'zz']).map((q) => q.id)).toEqual(['c', 'a']);
    expect(linesToSend([{ ticked: true, answer: ' keep it ' }, { ticked: false, answer: 'no' }, { ticked: true, answer: '  ' }])).toEqual(['keep it']);
  });
  it('finds the protocol a failed run was started from', () => {
    const failed = session({ sessionId: 'p', kind: 'protocol', tool: 'knowledge-protocols', role: 'detour', state: 'failed', from: { sessionId: 'home', stepId: 'explore' } });
    const t = thread({ sessions: [session({ sessionId: 'home' }), failed], route: [
      { at: 'x', joint: 'asked', optionId: 'protocol:fates', reason: null, outcome: 'taken', stepId: 'explore', sessionId: 'home' },
      { at: 'y', joint: 'asked', optionId: 'tool:rules-book', reason: null, outcome: 'taken', stepId: 'explore', sessionId: 'home' }
    ] });
    expect(retryOption(t, failed)).toBe('protocol:fates');
    expect(retryOption(thread(), failed)).toBeNull();
  });
});

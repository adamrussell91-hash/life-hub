// tests/unit/thinking-detour.test.js
// A detour end to end: a Wayfinder (rules) session started as a thread detour walks to its
// commit step with the scripted coach, writes no review and no Tasks record, and Move on there
// finishes it; the engine service's hook lands its packet on the thread. A direct start makes a
// quiet thread; archiving a detour stops its home step waiting. Invented situations only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import {
  acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, say, summaryRow
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import { createThreadStore } from '../../netlify/functions/_shared/thinking-threads/store.mjs';
import { addSession, createThread } from '../../netlify/functions/_shared/thinking-threads/thread.mjs';
import { engineThreadHooks, toolOfPrefix } from '../../netlify/functions/_shared/thinking-threads/engine-hooks.mjs';
import { detourThreadId, landDetour } from '../../netlify/functions/_shared/thinking-threads/land.mjs';
import { detourEndStep } from '../../packages/problem-solver/steps.mjs';

const NOW = '2026-11-10T10:00:00.000Z';
const deps = { now: () => NOW, newId: randomUUID };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

/** The rules walk from rules-book-scripted.test.js, started as a detour, up to a filled commit. */
async function committedDetour(threadId) {
  const threadDetour = { threadId, fromSessionId: 'home-1', fromStepId: 'options', question: 'Why does the newsletter always go out late?' };
  let s = await step(createSession({ text: 'The monthly newsletter keeps going out late.', kind: 'rules', threadId, threadDetour }, deps));
  s = await step(s, 'It sits in my work and deadlines, and the date keeps moving.');
  s = await step(s, 'Due on the first; I assume it is simple, but I have never timed it.');
  s = await step(acceptSuggestion(s, deps));
  for (const text of ['Finish a first complete version by Tuesday', 'Second complete version by Wednesday', 'Final version by Thursday', 'reflection: Three finished versions keep the work from swelling to fill the days.']) s = await step(s, text);
  s = await step(s, 'act');
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'I only start when a date is close.');
  s = await step(acceptSuggestion(s, deps));
  for (const answer of [
    'The newsletter goes out on the first this month.',
    'It rests on the three finished versions I planned.',
    'Draft the first complete version this afternoon.',
    'Right after the Monday stand-up meeting ends.',
    'Check on 2026-11-20',
    'The second version is still not done by Wednesday lunchtime.'
  ]) s = await step(s, answer);
  return s;
}

async function threadWithDetour(threads, sessionId) {
  let t = createThread({ situation: 'The newsletter is late every month.', homeSession: { kind: 'tool', tool: 'problem-solver', sessionId: 'home-1' }, now: NOW });
  t = addSession(t, { kind: 'tool', tool: 'rules-book', sessionId, role: 'detour', from: { sessionId: 'home-1', stepId: 'options' }, now: NOW });
  return threads.create('me', t);
}

test('a detour ends at its commit step: no review offer, no Tasks record, Move on finishes it', async () => {
  const s = await committedDetour('thread-1');
  assert.equal(s.phase, detourEndStep('rules_book'));
  assert.equal(s.reviewProposal ?? null, null, 'Review belongs to home');
  assert.equal(summaryRow(s).threadDetour, true);
  assert.equal(summaryRow(s).threadId, 'thread-1');
  assert.throws(() => linkCaseFile(s, { target: { kind: 'task', id: 'task-x' }, version: 1, title: 'x', sections: [], graphic: false }, deps), { status: 409 });
  const done = moveOn(s, deps);
  assert.equal(done.phase, 'finished');
  assert.equal(detourThreadId(done), 'thread-1');
});

test('Move on through the service lands the packet on the thread', async () => {
  const threadStore = createMemoryCognitiveStore();
  const threads = createThreadStore(threadStore);
  const env = { COGNITIVE_OWNER_ID: 'me' };
  const hooks = await engineThreadHooks(env, toolOfPrefix('rules-book/v1'), { getThreadStore: async () => threadStore, now: () => NOW });
  const store = createMemoryProblemStore();
  const service = createProblemSolverService({ store, coach: scriptedCoach, kinds: ['rules'], now: () => NOW, threads: hooks });

  const sessionId = randomUUID();
  const thread = await threadWithDetour(threads, sessionId);
  const session = { ...(await committedDetour(thread.id)), id: sessionId, threadId: thread.id };
  session.threadDetour = { ...session.threadDetour, threadId: thread.id };
  await store.write('me', sessionId, session, null);

  const finished = await service.action('me', { id: sessionId, revision: session.revision, action: 'move_on', requestId: 'move-1' });
  assert.equal(finished.phase, 'finished');
  const after = await threads.get('me', thread.id);
  const entry = after.sessions.find((x) => x.sessionId === sessionId);
  assert.equal(entry.state, 'returned');
  assert.equal(entry.packet.answer, 'The newsletter goes out on the first this month.');
  assert.deepEqual(entry.packet.actions, ['Draft the first complete version this afternoon.']);
  assert.deepEqual(entry.packet.source, { tool: 'rules-book', sessionId });
  assert.equal(entry.landing, null, 'the person decides what to do with it');
});

test('a direct start makes a quiet thread; archiving a detour marks it removed; linked finds thread sessions', async () => {
  const threadStore = createMemoryCognitiveStore();
  const threads = createThreadStore(threadStore);
  const env = { COGNITIVE_OWNER_ID: 'me' };
  const hooks = await engineThreadHooks(env, 'rules-book', { getThreadStore: async () => threadStore, now: () => NOW });
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['rules'], now: () => NOW, threads: hooks });

  const direct = await service.create('me', { kind: 'rules', text: 'The shed door sticks every winter.', requestId: 'r-direct' });
  assert.ok(direct.threadId);
  const quiet = await threads.get('me', direct.threadId);
  assert.equal(quiet.sessions[0].sessionId, direct.id);
  assert.deepEqual(await threads.list('me'), [], 'a quiet thread is not listed');

  const host = await threads.create('me', createThread({ situation: 'Planning the street party.', homeSession: { kind: 'tool', tool: 'problem-solver', sessionId: 'home-1' }, now: NOW }));
  const detour = await service.create('me', { kind: 'rules', text: 'Why do the volunteers drop out?', detour: { threadId: host.id, fromSessionId: 'home-1', fromStepId: 'options' }, requestId: 'r-detour' });
  assert.equal(detour.threadId, host.id);
  assert.equal(detour.threadDetour.fromSessionId, 'home-1');
  await threads.updateLatest('me', host.id, (t) => addSession(t, { kind: 'tool', tool: 'rules-book', sessionId: detour.id, role: 'detour', from: { sessionId: 'home-1', stepId: 'options' }, now: NOW }));
  await assert.rejects(service.create('me', { kind: 'rules', text: 'x', detour: { threadId: host.id } }), { status: 400 });

  const linked = await service.linked('me', `thread:${host.id}`);
  assert.deepEqual(linked.map((r) => [r.id, r.role]), [[detour.id, 'detour']]);

  const ready = await service.get('me', detour.id);
  await service.action('me', { id: detour.id, revision: ready.revision, action: 'archive', requestId: 'arch-1' });
  assert.equal((await threads.get('me', host.id)).sessions.find((x) => x.sessionId === detour.id).state, 'removed');
});

test('landDetour never throws and lands nothing without a thread', async () => {
  assert.equal(await landDetour({}, { id: 'x', kind: 'rules' }), null);
  assert.equal(await landDetour({}, { id: 'x', kind: 'rules', threadDetour: { threadId: 'nope' } }, { threads: { updateLatest: async () => { throw new Error('down'); } } }), null);
});

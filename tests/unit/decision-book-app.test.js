// tests/unit/decision-book-app.test.js
// The server side of Decision Maker's app: starting a decision from a model on the shelf, the
// list row's main model (the medal's centre), a set-aside graphic retry, the provenance graphics
// kept in step with their generator, and the task source Decision Maker's tasks carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, dismissCaseFile, linkCaseFile, say, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../netlify/functions/_shared/task-properties.mjs';
import { recordOffer } from '../../packages/decision-book/record.mjs';
import { CATALOGUE } from '../../packages/decision-book/catalogue.mjs';
import { PROVENANCE_DIR, provenanceFiles } from '../../scripts/generate-decision-book-provenance.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s, text) => {
  const next = text ? say(s, text, deps) : s;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
};
const frame = async (s) => {
  s = await step(s);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  return step(s, 'The offer closes Friday and the rent there is double.');
};

test('a decision started from a shelf model opens on it once framed; the prompt is told', async () => {
  let s = createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision', startModel: 'dm_rumsfeld' }, deps);
  assert.equal(s.startModel, 'dm_rumsfeld');
  assert.match(buildDecisionPrompt(s).user, /SHELF PICK: the person started from The Rumsfeld matrix \(dm_rumsfeld\)\./);
  s = await frame(s);
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'dm_rumsfeld', reason: 'You started from this model on the shelf.' });
  assert.ok(!buildDecisionPrompt(s).user.includes('SHELF PICK'));
});

test('a shelf model must be one Explore offers, and only a decision takes one', () => {
  assert.equal(createSession({ text: 'x', kind: 'decision', startModel: 'dm_record' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'decision', startModel: 'five_whys' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', startModel: 'dm_rumsfeld' }, deps).startModel, undefined);
});

test('the service passes a shelf model through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision'], now: deps.now });
  const s = await service.create('me', { text: 'Who should lead the project?', kind: 'decision', startModel: 'dm_team' });
  assert.equal(s.startModel, 'dm_team');
});

test('a decision’s list row names its main model; a Problem Solver row has none', async () => {
  let s = await frame(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  assert.equal(summaryRow(s).main, null);
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'Reply to the Sydney offer letter, do immediately');
  assert.equal(summaryRow(s).main, 'dm_eisenhower');
  assert.ok(!('main' in summaryRow(createSession({ text: 'Late rota.' }, deps))));
});

test('Not now on a graphic retry hides it until the record changes', async () => {
  let s = await frame(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  s = await step(acceptSuggestion(s, deps));
  for (const t of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.', 'decide']) s = await step(s, t);
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'I decide faster once the urgent part is named.');
  s = await step(acceptSuggestion(s, deps));
  for (const t of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) s = await step(s, t);
  const offer = recordOffer(s);
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p1' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: false }, deps);
  assert.equal(recordOffer(s).kind, 'graphic');
  s = dismissCaseFile(s, { key: recordOffer(s).key }, deps);
  assert.equal(recordOffer(s), null);
});

test('every catalogue model has its provenance graphic, as its generator writes it', async () => {
  const files = await provenanceFiles();
  assert.deepEqual(Object.keys(files).sort(), CATALOGUE.map((entry) => `${entry.id}.svg`).sort());
  assert.deepEqual((await readdir(PROVENANCE_DIR)).sort(), Object.keys(files).sort());
  for (const [name, text] of Object.entries(files)) assert.equal(await readFile(new URL(name, PROVENANCE_DIR), 'utf8'), text, `${name} is stale: run node scripts/generate-decision-book-provenance.mjs`);
  assert.match(files['dm_eisenhower.svg'], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 240 240" role="img" aria-label="The Eisenhower matrix, from How to improve yourself">/);
  for (const text of Object.values(files)) assert.ok(!/<script|href="https?:|<image/i.test(text));
});

test('Decision Maker’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'decision_maker'));
});

// tests/unit/collaboration-book-prompts.test.js
// The Collaboration Book's coach: its knowledge (stance, the four stages, groups, kinds of
// difficulty, traps, catalogue lines and model notes, another angle), its own prompt and the
// routing that sends a `collab` session to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from '../../packages/collaboration-book/catalogue.mjs';
import { GROUPS } from '../../packages/collaboration-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/collaboration-book/commit-slots.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { SKILLS } from '../../packages/problem-solver/skills.mjs';
import {
  COLLAB_CHECKS, COLLAB_TRAPS, GROUP_GUIDE, LENSES, STANCE, anotherAngle, catalogueLines, techniqueNote
} from '../../netlify/functions/_shared/problem-solver/knowledge/collaboration-book.mjs';
import { COLLAB_RUBRIC, buildCollabPrompt } from '../../netlify/functions/_shared/problem-solver/collaboration-book-prompts.mjs';
import { CHANGE_RUBRIC, buildChangePrompt } from '../../netlify/functions/_shared/problem-solver/change-book-prompts.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const SKILL_IDS = SKILLS.map((s) => s.id);
const CATALOGUE_IDS = CATALOGUE.map((e) => e.id);
const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => 'id1' };

test('the stance, the four stages, group guide, kinds of difficulty and traps are in place', () => {
  assert.match(STANCE, /let the person or the team reject it/);
  for (const stage of ['Locate the difficulty', 'Choose one lens', 'Work the structure together', 'Agree an experiment and come back to it']) assert.ok(COLLAB_CHECKS.includes(stage), stage);
  assert.match(COLLAB_CHECKS, /own part/);
  assert.match(COLLAB_CHECKS, /consent is not everyone agreeing/);
  assert.match(COLLAB_CHECKS, /Never present them as established facts/);
  for (const group of GROUPS) assert.ok(GROUP_GUIDE.includes(`${group.id}: ${group.label}`), group.id);
  assert.match(GROUP_GUIDE, /\+/);
  for (const lens of LENSES) {
    assert.ok(lens.look.length >= 3, lens.id);
    for (const id of lens.look) assert.ok(CATALOGUE_IDS.includes(id), `${lens.id} names ${id}`);
    for (const group of lens.groups) assert.ok(GROUPS.some((g) => g.id === group), `${lens.id} group ${group}`);
  }
  assert.deepEqual([...new Set(LENSES.flatMap((l) => l.look))].sort(), [...CATALOGUE_IDS].sort(), 'every model sits in at least one kind of difficulty');
  const traps = COLLAB_TRAPS.split('\n').slice(1);
  assert.equal(traps.length, 9);
  for (const line of traps.slice(0, 8)) assert.ok(SKILL_IDS.some((id) => line.endsWith(`(${id})`)), line);
});

test('one catalogue line per model, the book’s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, CATALOGUE.length);
  CATALOGUE.forEach((entry, i) => {
    assert.ok(lines[i].startsWith(`- ${entry.id} (${TOOLS[entry.id].name}) [`), lines[i]);
    assert.ok(lines[i].includes(`, ${entry.tier}]: ${TOOLS[entry.id].when}`), lines[i]);
  });
  assert.match(lines.find((l) => l.startsWith('- cb_premortem ')), /Book's see also: cb_postmortem\./);
  assert.match(lines.find((l) => l.startsWith('- cb_trust_triangle ')), /\[trust, lens\]/);
});

test('every model has a note: steps, slots, minimum, watch-fors, the exercise and a reminder of stage three', () => {
  for (const entry of CATALOGUE) {
    const tool = TOOLS[entry.id];
    const note = techniqueNote(entry.id);
    assert.ok(note.startsWith(`MODEL NOTE: ${tool.name} (${entry.id})`), entry.id);
    assert.match(note, /Minimum:/, entry.id);
    assert.match(note, /Watch for:/, entry.id);
    assert.match(note, /stage three/, entry.id);
    for (const s of tool.steps) assert.ok(note.includes(s.title), `${entry.id} ${s.id}`);
  }
  assert.equal(techniqueNote('cb_commit'), null);
});

test('the notes carry the variants, the merges and the sensitive-model rules', () => {
  assert.match(techniqueNote('cb_postmortem'), /Variant of Problem Solver's after action review/);
  assert.match(techniqueNote('cb_corporate_culture'), /Variant of Decision Maker's Maslow pyramids/);
  assert.match(techniqueNote('cb_corporate_culture'), /never a ranking of human needs/);
  assert.match(techniqueNote('cb_agility'), /Flat Hierarchies/);
  assert.match(techniqueNote('cb_ladder'), /Assume Positive Intent/);
  assert.match(techniqueNote('cb_purpose'), /Two Workers, Two Levels/);
  assert.match(techniqueNote('cb_saying_no'), /Saying Yes/);
  assert.match(techniqueNote('cb_psych_safety'), /never swap in the better-known accountability/);
  assert.match(techniqueNote('cb_burnout'), /never a clinical assessment/);
  assert.match(techniqueNote('cb_trust_triangle'), /never a pick-two/);
  assert.match(techniqueNote('cb_cooperation'), /rows, not a 2×2/);
  assert.match(techniqueNote('cb_north_star'), /do not credit anyone as its inventor/);
});

test('another angle: the book’s see also first, then ours, Collaboration Book models only', () => {
  assert.deepEqual(anotherAngle('cb_premortem'), { book: ['cb_postmortem'], ours: ['cb_red_blue'] });
  const { ours } = anotherAngle('cb_ladder');
  assert.deepEqual(ours, ['cb_nunchi'], 'perspective_shift is Problem Solver’s, not a Collaboration Book model');
  assert.deepEqual(anotherAngle('cb_premortem', ['cb_postmortem', 'cb_red_blue']), { book: [], ours: [] });
});

test('the rubric runs the four stages, Agree and Review, and lists every model', () => {
  for (const word of ['Locate the difficulty', 'Choose a lens', 'Work the structure together', 'Agree', 'Review']) assert.ok(COLLAB_RUBRIC.includes(word), word);
  assert.ok(COLLAB_RUBRIC.includes(COMMIT_ID) && COLLAB_RUBRIC.includes(REVIEW_ID));
  assert.match(COLLAB_RUBRIC, /situation, group and outcome/);
  for (const entry of CATALOGUE) assert.ok(COLLAB_RUBRIC.includes(`- ${entry.id} (`), entry.id);
  assert.doesNotMatch(CHANGE_RUBRIC, /\bcb_[a-z]/, 'the Change Book never lists these models');
  assert.doesNotMatch(COLLAB_RUBRIC, /\bch_[a-z]/, 'and this one never lists the Change Book’s');
});

test('a collab session gets the Collaboration Book prompt; a change session does not', () => {
  const s = createSession({ text: 'Our weekly planning meeting runs over and two people never speak.', kind: 'collab' }, deps);
  const prompt = buildCollabPrompt(s);
  assert.equal(prompt.system[0], COLLAB_RUBRIC);
  assert.match(prompt.user, /WORK: Our weekly planning meeting/);
  assert.match(prompt.user, /Missing frame answers: situation, group, outcome/);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING/);
  assert.ok(!buildChangePrompt(createSession({ text: 'x', kind: 'change' }, deps)).system[0].includes('Collaboration Book'));
});

test('the live coach routes a collab session to the Collaboration Book prompt', async () => {
  let seen = null;
  const coach = createModelCoach(async (prompt) => {
    seen = prompt;
    return JSON.stringify({ verdict: 'accept', message: 'Noted.', frame: { situation: 'Two people never speak in planning.' } });
  });
  const s = createSession({ text: 'Two people never speak in planning.', kind: 'collab' }, deps);
  const turn = await coach(s);
  assert.equal(seen.system[0], COLLAB_RUBRIC);
  assert.deepEqual(turn.frame, { situation: 'Two people never speak in planning.' });
  assert.equal(applyCoachTurn(s, turn, deps).frame.situation, 'Two people never speak in planning.');
});

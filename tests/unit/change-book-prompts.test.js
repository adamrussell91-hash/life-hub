// tests/unit/change-book-prompts.test.js
// The Change Book's coach: its knowledge (stance, the four stages, groups, kinds of change, traps,
// catalogue lines and model notes, another angle), its own prompt and the routing that sends a
// `change` session to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from '../../packages/change-book/catalogue.mjs';
import { GROUPS } from '../../packages/change-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/change-book/commit-slots.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { SKILLS } from '../../packages/problem-solver/skills.mjs';
import {
  CHANGE_CHECKS, CHANGE_TRAPS, GROUP_GUIDE, LENSES, STANCE, anotherAngle, catalogueLines, techniqueNote
} from '../../netlify/functions/_shared/problem-solver/knowledge/change-book.mjs';
import { CHANGE_RUBRIC, buildChangePrompt } from '../../netlify/functions/_shared/problem-solver/change-book-prompts.mjs';
import { RULES_RUBRIC, buildRulesPrompt } from '../../netlify/functions/_shared/problem-solver/rules-book-prompts.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const SKILL_IDS = SKILLS.map((s) => s.id);
const CATALOGUE_IDS = CATALOGUE.map((e) => e.id);
const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => 'id1' };

test('the stance, the four stages, group guide, kinds of change and traps are in place', () => {
  assert.match(STANCE, /one lens among several/);
  for (const stage of ['Name the change and what should stay', 'Select one lens', 'Make one example concrete', 'small, reversible step and a review date']) assert.ok(CHANGE_CHECKS.includes(stage), stage);
  assert.match(CHANGE_CHECKS, /Dated forecasts/);
  for (const group of GROUPS) assert.ok(GROUP_GUIDE.includes(`${group.id}: ${group.label}`), group.id);
  assert.match(GROUP_GUIDE, /\+/);
  assert.match(GROUP_GUIDE, /ch_anti_change/);
  for (const lens of LENSES) {
    assert.ok(lens.look.length >= 3, lens.id);
    for (const id of lens.look) assert.ok(CATALOGUE_IDS.includes(id), `${lens.id} names ${id}`);
  }
  assert.deepEqual([...new Set(LENSES.flatMap((l) => l.look))].sort(), [...CATALOGUE_IDS].sort(), 'every model sits in at least one kind of change');
  const traps = CHANGE_TRAPS.split('\n').slice(1);
  assert.equal(traps.length, 8);
  for (const line of traps.slice(0, 7)) assert.ok(SKILL_IDS.some((id) => line.endsWith(`(${id})`)), line);
});

test('one catalogue line per model, the book’s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, CATALOGUE.length);
  CATALOGUE.forEach((entry, i) => {
    assert.ok(lines[i].startsWith(`- ${entry.id} (${TOOLS[entry.id].name}) [`), lines[i]);
    assert.ok(lines[i].includes(`, ${entry.tier}]: ${TOOLS[entry.id].when}`), lines[i]);
  });
  assert.match(lines.find((l) => l.startsWith('- ch_future ')), /Book's see also: ch_sustainability\./);
  assert.match(lines.find((l) => l.startsWith('- ch_anti_change ')), /\[any group, lens\]/);
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
  assert.equal(techniqueNote('ch_commit'), null);
});

test('the notes carry the variant, the scales caveats, the merges and the dated examples', () => {
  assert.match(techniqueNote('ch_rhizome'), /Variant of Problem Solver's concept map/);
  assert.match(techniqueNote('ch_rhizome'), /keeps "you" in the middle/);
  assert.match(techniqueNote('ch_multitasking'), /never ask for a total of 100/);
  assert.match(techniqueNote('ch_multitasking'), /0 to 100/);
  assert.match(techniqueNote('ch_multitasking'), /Takes a lot|takes a lot and is worth little/);
  assert.match(techniqueNote('ch_unhappiness'), /1 to 5 everywhere/);
  assert.match(techniqueNote('ch_unhappiness'), /rich, lonely or a word of their own/);
  assert.match(techniqueNote('ch_unhappiness'), /Influence, never control/);
  assert.match(techniqueNote('ch_unhappiness'), /The Dictatorship Model/);
  assert.match(techniqueNote('ch_innovation'), /The Back-of-the-Napkin Model/);
  assert.match(techniqueNote('ch_othering'), /The Prejudice Model/);
  assert.match(techniqueNote('ch_climate_disaster'), /dated example/);
  assert.match(techniqueNote('ch_future'), /dated example/);
});

test('another angle: the book’s see also first, then ours, Change Book models only', () => {
  assert.deepEqual(anotherAngle('ch_future'), { book: ['ch_sustainability'], ours: ['ch_climate_disaster'] });
  const { ours } = anotherAngle('ch_braess');
  assert.deepEqual(ours, ['ch_preemption'], 'causal_map is Problem Solver’s, not a Change Book model');
  assert.deepEqual(anotherAngle('ch_future', ['ch_sustainability', 'ch_climate_disaster']), { book: [], ours: [] });
});

test('the rubric runs the four stages, Act and Review, and lists every model', () => {
  for (const word of ['Name the change and what stays', 'Select a lens', 'Make one example concrete', 'Act', 'Review']) assert.ok(CHANGE_RUBRIC.includes(word), word);
  assert.ok(CHANGE_RUBRIC.includes(COMMIT_ID) && CHANGE_RUBRIC.includes(REVIEW_ID));
  assert.match(CHANGE_RUBRIC, /change, group and stay/);
  for (const entry of CATALOGUE) assert.ok(CHANGE_RUBRIC.includes(`- ${entry.id} (`), entry.id);
  assert.doesNotMatch(RULES_RUBRIC, /\bch_[a-z]/, 'the Rules Book never lists these models');
  assert.doesNotMatch(CHANGE_RUBRIC, /\brb_[a-z]/, 'and this one never lists the rules');
});

test('a change session gets the Change Book prompt; a rules session does not', () => {
  const s = createSession({ text: 'We are merging two teams.', kind: 'change' }, deps);
  const prompt = buildChangePrompt(s);
  assert.equal(prompt.system[0], CHANGE_RUBRIC);
  assert.match(prompt.user, /WORK: We are merging two teams\./);
  assert.match(prompt.user, /Missing frame answers: change, group, stay/);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING/);
  assert.ok(!buildRulesPrompt(createSession({ text: 'x', kind: 'rules' }, deps)).system[0].includes('Change Book'));
});

test('the live coach routes a change session to the Change Book prompt', async () => {
  let seen = null;
  const coach = createModelCoach(async (prompt) => {
    seen = prompt;
    return JSON.stringify({ verdict: 'accept', message: 'Noted.', frame: { change: 'We are merging two teams.' } });
  });
  const s = createSession({ text: 'We are merging two teams.', kind: 'change' }, deps);
  const turn = await coach(s);
  assert.equal(seen.system[0], CHANGE_RUBRIC);
  assert.deepEqual(turn.frame, { change: 'We are merging two teams.' });
  assert.equal(applyCoachTurn(s, turn, deps).frame.change, 'We are merging two teams.');
});

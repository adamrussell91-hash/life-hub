// tests/unit/rules-book-prompts.test.js
// The Rules Book's coach: its knowledge (stance, model check, groups, situations, traps, catalogue
// lines and rule notes, another angle), its own prompt and the routing that sends a `rules`
// session to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from '../../packages/rules-book/catalogue.mjs';
import { GROUPS } from '../../packages/rules-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/rules-book/commit-slots.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { SKILLS } from '../../packages/problem-solver/skills.mjs';
import {
  GROUP_GUIDE, MODEL_CHECKS, RULES_TRAPS, SITUATIONS, STANCE, anotherAngle, catalogueLines, techniqueNote
} from '../../netlify/functions/_shared/problem-solver/knowledge/rules-book.mjs';
import { RULES_RUBRIC, buildRulesPrompt } from '../../netlify/functions/_shared/problem-solver/rules-book-prompts.mjs';
import { buildGearPrompt } from '../../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const SKILL_IDS = SKILLS.map((s) => s.id);
const CATALOGUE_IDS = CATALOGUE.map((e) => e.id);
const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => 'id1' };

test('the stance, both model checks, group guide, situations and traps are in place', () => {
  assert.match(STANCE, /lenses/);
  assert.match(MODEL_CHECKS, /Truth check/);
  assert.match(MODEL_CHECKS, /Usefulness and limits check/);
  for (const group of GROUPS) assert.ok(GROUP_GUIDE.includes(`${group.id}: ${group.label}`), group.id);
  assert.match(GROUP_GUIDE, /\+/);
  for (const situation of SITUATIONS) {
    assert.ok(situation.look.length >= 3, situation.id);
    for (const id of situation.look) assert.ok(CATALOGUE_IDS.includes(id), `${situation.id} names ${id}`);
  }
  const traps = RULES_TRAPS.split('\n').slice(1);
  assert.equal(traps.length, 8);
  for (const line of traps.slice(0, 7)) assert.ok(SKILL_IDS.some((id) => line.endsWith(`(${id})`)), line);
});

test('one catalogue line per rule, the book’s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, CATALOGUE.length);
  CATALOGUE.forEach((entry, i) => {
    assert.ok(lines[i].startsWith(`- ${entry.id} (${TOOLS[entry.id].name}) [${entry.section}, ${entry.tier}]: ${TOOLS[entry.id].when}`), lines[i]);
  });
  assert.match(lines.find((l) => l.startsWith('- rb_pareto ')), /Book's see also: rb_hofstadter\./);
});

test('every rule has a note: steps, slots, minimum, watch-fors, the exercise and a reminder of the model check', () => {
  for (const entry of CATALOGUE) {
    const tool = TOOLS[entry.id];
    const note = techniqueNote(entry.id);
    assert.ok(note.startsWith(`RULE NOTE: ${tool.name} (${entry.id})`), entry.id);
    assert.match(note, /Minimum:/, entry.id);
    assert.match(note, /Watch for:/, entry.id);
    assert.match(note, /model check/, entry.id);
    for (const s of tool.steps) assert.ok(note.includes(s.title), `${entry.id} ${s.id}`);
  }
  assert.equal(techniqueNote('rb_commit'), null);
});

test('the notes carry the exact numbers, the variants and the attribution caveat', () => {
  assert.match(techniqueNote('rb_three_three_three'), /exactly one project/);
  assert.match(techniqueNote('rb_three_three_three'), /never a timer/);
  assert.match(techniqueNote('rb_parkinson'), /three finished versions, two intermediate and one final/);
  assert.match(techniqueNote('rb_ten_ten_ten'), /ten minutes, ten months and ten years/);
  assert.match(techniqueNote('rb_jaspers'), /unverified/);
  assert.match(techniqueNote('rb_pareto'), /Variant of Problem Solver's Pareto/);
  assert.match(techniqueNote('rb_one_step'), /joint contribution/);
  assert.match(techniqueNote('rb_korzybski'), /Box’s Law, Brach’s Law, The Law of the Instrument/);
});

test('another angle: the book’s see also first, then ours, Rules Book rules only', () => {
  assert.deepEqual(anotherAngle('rb_pareto'), { book: ['rb_hofstadter'], ours: [] });
  const { ours } = anotherAngle('rb_parkinson');
  assert.ok(ours.every((id) => CATALOGUE_IDS.includes(id)), 'kanban is Problem Solver’s, not a Rules Book rule');
  assert.deepEqual(anotherAngle('rb_pareto', ['rb_hofstadter']), { book: [], ours: [] });
});

test('the rubric runs the four stages and the model check in every session', () => {
  for (const word of ['Ground', 'Select', 'Apply', 'Act', 'Review']) assert.match(RULES_RUBRIC, new RegExp(word));
  assert.match(RULES_RUBRIC, /Truth check/);
  assert.match(RULES_RUBRIC, /usefulness check/i);
  assert.ok(RULES_RUBRIC.includes(COMMIT_ID) && RULES_RUBRIC.includes(REVIEW_ID));
  assert.match(RULES_RUBRIC, /"frame"[^]*?|situation, group and known/);
  for (const entry of CATALOGUE) assert.ok(RULES_RUBRIC.includes(`- ${entry.id} (`), entry.id);
});

test('a rules session gets the Rules Book prompt; a shift session does not', () => {
  const s = createSession({ text: 'The meeting keeps running over.', kind: 'rules' }, deps);
  const prompt = buildRulesPrompt(s);
  assert.equal(prompt.system[0], RULES_RUBRIC);
  assert.match(prompt.user, /WORK: The meeting keeps running over\./);
  assert.match(prompt.user, /Missing frame answers: situation, group, known/);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING/);
  assert.ok(!buildGearPrompt(createSession({ text: 'x', kind: 'shift' }, deps)).system[0].includes('Rules Book'));
});

test('the live coach routes a rules session to the Rules Book prompt', async () => {
  let seen = null;
  const coach = createModelCoach(async (prompt) => {
    seen = prompt;
    return JSON.stringify({ verdict: 'accept', message: 'Noted.', frame: { situation: 'The meeting keeps running over.' } });
  });
  const s = createSession({ text: 'The meeting keeps running over.', kind: 'rules' }, deps);
  const turn = await coach(s);
  assert.equal(seen.system[0], RULES_RUBRIC);
  assert.deepEqual(turn.frame, { situation: 'The meeting keeps running over.' });
  assert.equal(applyCoachTurn(s, turn, deps).frame.situation, 'The meeting keeps running over.');
});

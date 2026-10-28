// tests/unit/communication-book-prompts.test.js
// The Communication Book's coach: its knowledge (stance, the four stages, groups, kinds of
// difficulty, traps, catalogue lines and model notes, another angle), its own prompt and the
// routing that sends a `talk` session to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from '../../packages/communication-book/catalogue.mjs';
import { GROUPS } from '../../packages/communication-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/communication-book/commit-slots.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { SKILLS } from '../../packages/problem-solver/skills.mjs';
import {
  COMM_CHECKS, COMM_TRAPS, GROUP_GUIDE, LENSES, STANCE, anotherAngle, catalogueLines, techniqueNote
} from '../../netlify/functions/_shared/problem-solver/knowledge/communication-book.mjs';
import { COMM_RUBRIC, buildCommPrompt } from '../../netlify/functions/_shared/problem-solver/communication-book-prompts.mjs';
import { COLLAB_RUBRIC, buildCollabPrompt } from '../../netlify/functions/_shared/problem-solver/collaboration-book-prompts.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const SKILL_IDS = SKILLS.map((s) => s.id);
const CATALOGUE_IDS = CATALOGUE.map((e) => e.id);
const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => 'id1' };

test('the stance, the four stages, group guide, kinds of difficulty and traps are in place', () => {
  assert.match(STANCE, /let the person reject it/);
  for (const stage of ['Name the exchange', 'Choose one lens', 'Work one real example', 'Commit to the next conversation and come back to it']) assert.ok(COMM_CHECKS.includes(stage), stage);
  assert.match(COMM_CHECKS, /own part/);
  assert.match(COMM_CHECKS, /what was said is not what was heard/);
  assert.match(COMM_CHECKS, /never obliges anyone to forgive/);
  assert.match(COMM_CHECKS, /never present them as settled modern evidence/);
  for (const group of GROUPS) assert.ok(GROUP_GUIDE.includes(`${group.id}: ${group.label}`), group.id);
  assert.match(GROUP_GUIDE, /\+/);
  for (const lens of LENSES) {
    assert.ok(lens.look.length >= 3, lens.id);
    for (const id of lens.look) assert.ok(CATALOGUE_IDS.includes(id), `${lens.id} names ${id}`);
    for (const group of lens.groups) assert.ok(GROUPS.some((g) => g.id === group), `${lens.id} group ${group}`);
  }
  assert.deepEqual([...new Set(LENSES.flatMap((l) => l.look))].sort(), [...CATALOGUE_IDS].sort(), 'every model sits in at least one kind of difficulty');
  for (const group of GROUPS) assert.ok(LENSES.some((l) => l.groups[0] === group.id), `${group.id} leads at least one kind of difficulty`);
  const traps = COMM_TRAPS.split('\n').slice(1);
  assert.equal(traps.length, 9);
  for (const line of traps.slice(0, 8)) assert.ok(SKILL_IDS.some((id) => line.endsWith(`(${id})`)), line);
  assert.match(COMM_TRAPS, /nationality/);
});

test('one catalogue line per model, the book’s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, CATALOGUE.length);
  CATALOGUE.forEach((entry, i) => {
    assert.ok(lines[i].startsWith(`- ${entry.id} (${TOOLS[entry.id].name}) [`), lines[i]);
    assert.ok(lines[i].includes(`, ${entry.tier}]: ${TOOLS[entry.id].when}`), lines[i]);
  });
  assert.match(lines.find((l) => l.startsWith('- cm_storytelling ')), /Book's see also: cm_rhetoric\./);
  assert.match(lines.find((l) => l.startsWith('- cm_apology ')), /\[relate, worksheet\]/);
  assert.match(lines.find((l) => l.startsWith('- cm_peak_end ')), /\[read, lens\]/);
});

test('every model has a note: steps, slots, minimum, watch-fors, the exercise and a reminder of stage three', () => {
  for (const entry of CATALOGUE) {
    const tool = TOOLS[entry.id];
    const note = techniqueNote(entry.id);
    assert.ok(note.startsWith(`MODEL NOTE: ${tool.name} (${entry.id})`), entry.id);
    assert.match(note, /Minimum:/, entry.id);
    assert.match(note, /Watch for:/, entry.id);
    assert.match(note, /stage three/, entry.id);
    assert.match(note, /Exercise/, entry.id);
    for (const s of tool.steps) assert.ok(note.includes(s.title), `${entry.id} ${s.id}`);
  }
  assert.equal(techniqueNote('cm_commit'), null);
});

test('the notes carry the variant, the merges and the sensitive-model rules', () => {
  assert.match(techniqueNote('cm_second_order'), /Variant of Problem Solver's perspective shift/);
  assert.match(techniqueNote('cm_second_order'), /blind spot/);
  for (const [id, name] of [['cm_groupthink', 'The Spiral of Silence'], ['cm_groupthink', 'The Cultivation Theory'], ['cm_listening', 'Small Talk'], ['cm_cooperative', 'White Lies'], ['cm_four_layers', 'Watzlawick'], ['cm_framing', 'Euphemisms'], ['cm_uses', 'The FoMO Phenomenon']]) {
    assert.ok(techniqueNote(id).includes(name), `${id} carries ${name}`);
  }
  assert.match(techniqueNote('cm_apology'), /book's own labels in their printed places/);
  assert.match(techniqueNote('cm_apology'), /never swap them/);
  assert.match(techniqueNote('cm_intercultural'), /individual-preference lens/);
  assert.match(techniqueNote('cm_intercultural'), /never to predict anyone from their nationality/);
  assert.match(techniqueNote('cm_game_theory'), /not the prisoner's dilemma/);
  assert.match(techniqueNote('cm_persuasion'), /do not add the later seventh/);
  assert.match(techniqueNote('cm_self_talk'), /never therapy/);
  assert.match(techniqueNote('cm_peak_end'), /never a way to make a harm smaller/);
  assert.match(techniqueNote('cm_boss_talk'), /never the people on the team/);
});

test('another angle: the book’s see also first, then ours, Communication Book models only', () => {
  assert.deepEqual(anotherAngle('cm_storytelling'), { book: ['cm_rhetoric'], ours: ['cm_six_words', 'cm_peak_end'] });
  assert.deepEqual(anotherAngle('cm_standpoint'), { book: [], ours: ['cm_groupthink'] }, 'perspective_shift is Problem Solver’s, not a Communication Book model');
  assert.deepEqual(anotherAngle('cm_iceberg', ['cm_six_words', 'cm_four_layers']), { book: ['cm_lasswell'], ours: [] });
});

test('the rubric runs the four stages, Commit and Review, and lists every model', () => {
  for (const word of ['Name the exchange', 'Choose a lens', 'Work one real example', 'Commit', 'Review']) assert.ok(COMM_RUBRIC.includes(word), word);
  assert.ok(COMM_RUBRIC.includes(COMMIT_ID) && COMM_RUBRIC.includes(REVIEW_ID));
  assert.match(COMM_RUBRIC, /situation, group and outcome/);
  for (const entry of CATALOGUE) assert.ok(COMM_RUBRIC.includes(`- ${entry.id} (`), entry.id);
  assert.doesNotMatch(COLLAB_RUBRIC, /\bcm_[a-z]/, 'the Collaboration Book never lists these models');
  assert.doesNotMatch(COMM_RUBRIC, /\bcb_[a-z]/, 'and this one never lists the Collaboration Book’s');
});

test('a talk session gets the Communication Book prompt; a collab session does not', () => {
  const s = createSession({ text: 'My manager reads my short emails as rude.', kind: 'talk' }, deps);
  const prompt = buildCommPrompt(s);
  assert.equal(prompt.system[0], COMM_RUBRIC);
  assert.match(prompt.user, /WORK: My manager reads my short emails/);
  assert.match(prompt.user, /Missing frame answers: situation, group, outcome/);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING/);
  assert.ok(!buildCollabPrompt(createSession({ text: 'x', kind: 'collab' }, deps)).system[0].includes('Communication Book'));
});

test('the live coach routes a talk session to the Communication Book prompt', async () => {
  let seen = null;
  const coach = createModelCoach(async (prompt) => {
    seen = prompt;
    return JSON.stringify({ verdict: 'accept', message: 'Noted.', frame: { situation: 'My manager reads my short emails as rude.' } });
  });
  const s = createSession({ text: 'My manager reads my short emails as rude.', kind: 'talk' }, deps);
  const turn = await coach(s);
  assert.equal(seen.system[0], COMM_RUBRIC);
  assert.deepEqual(turn.frame, { situation: 'My manager reads my short emails as rude.' });
  assert.equal(applyCoachTurn(s, turn, deps).frame.situation, 'My manager reads my short emails as rude.');
});

// tests/unit/get-things-done-prompts.test.js
// Gear Shifter's coach: its knowledge (stance, route, obstacles, traps, catalogue lines and
// technique notes, another angle), its own prompt and the routing that sends a `shift` session
// to it, and the `next_technique` suggestion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from '../../packages/get-things-done/catalogue.mjs';
import { ROUTE } from '../../packages/get-things-done/route.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { SKILLS } from '../../packages/problem-solver/skills.mjs';
import {
  GEAR_TRAPS, OBSTACLES, ROUTE_GUIDE, STANCE, anotherAngle, catalogueLines, techniqueNote
} from '../../netlify/functions/_shared/problem-solver/knowledge/get-things-done.mjs';

const SKILL_IDS = SKILLS.map((s) => s.id);
const CATALOGUE_IDS = CATALOGUE.map((e) => e.id);

// ---------------------------------------------------------------- knowledge

test('the stance, route guide, obstacles and traps are in place', () => {
  assert.match(STANCE, /try/i);
  for (const station of ROUTE) assert.ok(ROUTE_GUIDE.includes(`${station.id}: ${station.label}`), station.id);
  assert.match(ROUTE_GUIDE, /\+/);
  assert.deepEqual(OBSTACLES.map((o) => o.id), ['no_priority', 'avoided_start', 'broken_attention', 'too_little_capacity', 'other_people', 'worn_out_energy']);
  for (const obstacle of OBSTACLES) {
    assert.ok(obstacle.name.length > 3);
    assert.ok(obstacle.look.length >= 2, obstacle.id);
    for (const id of obstacle.look) assert.ok(CATALOGUE_IDS.includes(id), `${obstacle.id} names ${id}`);
  }
  const traps = GEAR_TRAPS.split('\n').slice(1);
  assert.equal(traps.length, 7);
  for (const line of traps) assert.ok(SKILL_IDS.some((id) => line.endsWith(`(${id})`)), line);
});

test('one catalogue line per technique, the book’s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, CATALOGUE.length);
  CATALOGUE.forEach((entry, i) => {
    const station = ROUTE.find((r) => r.section === entry.section).id;
    assert.ok(lines[i].startsWith(`- ${entry.id} (${TOOLS[entry.id].name}) [${station}, ${entry.tier}]: ${TOOLS[entry.id].when}`), lines[i]);
    if (entry.seeAlso.length) assert.ok(lines[i].includes(`Book's see also: ${entry.seeAlso.join(', ')}.`), entry.id);
  });
  const procrastination = lines.find((l) => l.startsWith('- gt_procrastination '));
  assert.match(procrastination, /Book's see also: gt_pomodoro, gt_five_second_rule\. Pairs well \(ours\): gt_paralysis_by_analysis\./);
});

test('every technique has a note: steps, slots, minimum, watch-fors and the exercise', () => {
  for (const entry of CATALOGUE) {
    const tool = TOOLS[entry.id];
    const note = techniqueNote(entry.id);
    assert.ok(note.startsWith(`TECHNIQUE NOTE: ${tool.name} (${entry.id})`), entry.id);
    assert.match(note, entry.tier === 'lens' ? /^Lens:/m : /^Worksheet:/m);
    assert.ok(note.includes(`Use it when: ${tool.when}`), entry.id);
    for (const s of tool.steps) assert.ok(note.includes(s.title), `${entry.id} step ${s.id}`);
    for (const slot of Object.keys(tool.slots)) assert.ok(note.includes(`${slot} = `), `${entry.id} slot ${slot}`);
    assert.match(note, /^Watch for: /m);
    assert.match(note, /^Minimum: .*MINIMUM MET/m);
    if (tool.exercise) assert.ok(note.includes(tool.exercise), entry.id);
  }
  assert.equal(techniqueNote('dm_eisenhower'), null);
  assert.equal(techniqueNote('nope'), null);
});

test('notes carry the merged entries, the variants’ own rules and the project stations', () => {
  assert.match(techniqueNote('gt_rapid_prototyping'), /Also carries: New Work/);
  assert.match(techniqueNote('gt_motivation'), /Also carries: The Matthew Effect/);
  assert.match(techniqueNote('gt_project_evaluation'), /Also carries: The Myth of Achievement/);
  const kanban = techniqueNote('gt_kanban');
  assert.match(kanban, /To do, Doing and Done/);
  assert.match(kanban, /three/);
  assert.match(techniqueNote('gt_five_whys'), /five is a guide/i);
  const project = techniqueNote('gt_getting_a_project_done');
  for (const stage of TOOLS.gt_getting_a_project_done.chart.stages) {
    assert.ok(project.includes(`${stage.label}: ${stage.tools.join(', ')}`), stage.id);
  }
});

test('another angle: the book’s see also first, then ours, Gear Shifter techniques only', () => {
  assert.deepEqual(anotherAngle('gt_procrastination'), { book: ['gt_pomodoro', 'gt_five_second_rule'], ours: ['gt_paralysis_by_analysis'] });
  assert.deepEqual(anotherAngle('gt_procrastination', ['gt_pomodoro']), { book: ['gt_five_second_rule'], ours: ['gt_paralysis_by_analysis'] });
  // smart, problem_tree and kanban are other tools' ids: a shift Explore cannot open them.
  assert.deepEqual(anotherAngle('gt_getting_a_project_done').ours, []);
  assert.deepEqual(anotherAngle('gt_five_whys'), { book: [], ours: [] });
  assert.deepEqual(anotherAngle('gt_to_do_list'), { book: ['gt_deep_work'], ours: [] });
  assert.deepEqual(anotherAngle('unknown'), { book: [], ours: [] });
});

// ---------------------------------------------------------------- schema

test('next_technique is next_tool for Gear Shifter tools only; next_model stays Decision Maker’s', async () => {
  const { validateCoachTurn } = await import('../../netlify/functions/_shared/problem-solver/coach-schema.mjs');
  const turn = (kind, tool) => validateCoachTurn({ verdict: 'clarify', message: 'Try this next.', suggestion: { kind, tool, reason: 'Fits.' } });
  assert.deepEqual(turn('next_technique', 'gt_pomodoro').value.suggestion, { kind: 'next_tool', tool: 'gt_pomodoro', reason: 'Fits.' });
  for (const tool of ['dm_eisenhower', 'kanban', 'gt_nope']) assert.equal(turn('next_technique', tool).ok, false, tool);
  assert.equal(turn('next_model', 'gt_pomodoro').ok, false);
});

// ---------------------------------------------------------------- the prompt

const { createHash } = await import('node:crypto');
const { GEAR_RUBRIC, buildGearPrompt } = await import('../../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs');
const { RUBRIC, buildCoachPrompt } = await import('../../netlify/functions/_shared/problem-solver/prompts.mjs');
const { DECISION_RUBRIC } = await import('../../netlify/functions/_shared/problem-solver/decision-prompts.mjs');
const { GATEKEEPING, THINKING_SKILLS, VOICE } = await import('../../netlify/functions/_shared/problem-solver/prompts-shared.mjs');
const { createModelCoach } = await import('../../netlify/functions/_shared/problem-solver/coach.mjs');
const { acceptSuggestion, createSession, linkCaseFile, moveOn, say, setReviewTask, startReview } = await import('../../netlify/functions/_shared/problem-solver/session.mjs');
const { actionOffer } = await import('../../packages/get-things-done/record.mjs');
const H = await import('./gear-shifter-test-helpers.mjs');

test('the rubric shares voice, skills and gatekeeping, and adds the stance, route, obstacles, flow and traps', () => {
  for (const part of [VOICE, THINKING_SKILLS, GATEKEEPING, STANCE, ROUTE_GUIDE, GEAR_TRAPS, catalogueLines()]) assert.ok(GEAR_RUBRIC.includes(part));
  for (const obstacle of OBSTACLES) assert.ok(GEAR_RUBRIC.includes(obstacle.name), obstacle.id);
  for (const word of ['Discern', 'Another angle', 'Commit', 'Record', 'Review']) assert.match(GEAR_RUBRIC, new RegExp(word));
  assert.match(GEAR_RUBRIC, /"frame":\{"need":"\.\.\.","route":"\.\.\.","known":"\.\.\."\}\|null/);
  assert.match(GEAR_RUBRIC, /"kind":"next_technique\|switch_tool\|next_step"/);
  assert.match(GEAR_RUBRIC, /gt_getting_a_project_done/);
});

test('Problem Solver’s rubric is unchanged; neither other rubric names a Gear Shifter tool', () => {
  assert.equal(createHash('sha256').update(RUBRIC).digest('hex'), '46d6842e42b01f31014541a8122ecc225aa181a94ca0cf191144d4cfae55c5a2');
  assert.ok(!/\bgt_/.test(RUBRIC));
  assert.ok(!/\bgt_/.test(DECISION_RUBRIC));
});

test('framing: two cached layers, the missing answers, no technique note; a shelf pick is named', () => {
  const s = createSession({ text: 'The report keeps stalling.', kind: 'shift' }, H.deps);
  const prompt = buildGearPrompt(s);
  assert.equal(prompt.system.length, 2);
  assert.equal(prompt.system[0], GEAR_RUBRIC);
  assert.match(prompt.user, /Missing frame answers: need, route, known/);
  const picked = buildGearPrompt(createSession({ text: 'Stuck.', kind: 'shift', startModel: 'gt_pomodoro' }, H.deps));
  assert.match(picked.user, /SHELF PICK: .*The Pomodoro Technique \(gt_pomodoro\)/);
});

test('in a technique: a third cached layer with its note, the run in the turn, another angle at the minimum', () => {
  const s = H.explored();
  const prompt = buildGearPrompt(s);
  assert.equal(prompt.system.length, 3);
  assert.equal(prompt.system[2], techniqueNote('gt_appreciation'));
  assert.match(prompt.user, /ROUTE: With other people/);
  assert.match(prompt.user, /ACTIVE TECHNIQUE: Appreciation \(gt_appreciation\)/);
  assert.match(prompt.user, /entry:1 \[acknowledge_contribution\]: Thank Priya/);
  assert.match(prompt.user, /MINIMUM MET\. ANOTHER ANGLE: ours: gt_small_gifts; or next_step to Commit\./);
});

test('Commit has its own layer, naming the experiment and its rules, and what it can rest on', () => {
  const s = H.committing();
  const prompt = buildGearPrompt(s);
  assert.equal(prompt.system.length, 2, 'no technique note in Commit');
  assert.match(prompt.system[1], /^CURRENT STEP: Commit/);
  assert.match(prompt.system[1], /gt_commit/);
  for (const slot of ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course']) assert.ok(prompt.system[1].includes(`${slot} = `), slot);
  assert.match(prompt.system[1], /never a timer/);
  assert.match(prompt.user, /RESTS ON CAN USE \(tool slot: node\):\n {2}gt_appreciation entry:1: /);
});

test('the turn tracks the tasks, the record and the review', () => {
  let s = H.committed();
  let user = buildGearPrompt(s).user;
  assert.match(user, /TASKS FROM THIS EXPERIMENT:\n {2}proposed: "Message Priya"/);
  assert.match(user, /CHECK-BACK: proposed for 2026-11-05/);
  assert.match(user, /ACTION RECORD: ready to write\. .*it is not written yet\./);
  const offer = actionOffer(s);
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, H.deps);
  assert.match(buildGearPrompt(s).user, /ACTION RECORD: v1 written 2026-10-22 to the linked task\./);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-05' }, H.deps);
  s = H.reply(moveOn(s, H.deps), { verdict: 'clarify' });
  const boundary = buildGearPrompt(moveOn(H.committed(), H.deps));
  assert.match(boundary.user, /what they learned about how they get things done/);
  s = H.reply(s, { verdict: 'clarify', learning: 'Dates help.' }, 'Dates help.');
  user = buildGearPrompt(s).user;
  assert.match(user, /CHECK-BACK IS WAITING/);
  assert.match(buildGearPrompt(s).system[1], /^CURRENT STEP: Review/);
  s = startReview(s, {}, H.deps);
  const review = buildGearPrompt(s);
  assert.match(review.user, /REVIEW IN PROGRESS/);
  assert.match(review.system[1], /gt_review/);
  assert.match(review.system[1], /gt_project_evaluation/);
});

test('a shift session is coached with the Gear Shifter prompt; the others keep theirs', async () => {
  const seen = [];
  const coach = createModelCoach(async (prompt) => { seen.push(prompt.system[0]); return JSON.stringify({ verdict: 'clarify', message: 'What needs to move, in one sentence?' }); });
  await coach(createSession({ text: 'Stuck.', kind: 'shift' }, H.deps));
  await coach(createSession({ text: 'Stuck.', kind: 'decision' }, H.deps));
  await coach(createSession({ text: 'Stuck.' }, H.deps));
  assert.deepEqual(seen, [GEAR_RUBRIC, DECISION_RUBRIC, RUBRIC]);
  assert.equal(buildCoachPrompt(createSession({ text: 'Stuck.' }, H.deps)).system[0], RUBRIC);
  void acceptSuggestion; void say;
});

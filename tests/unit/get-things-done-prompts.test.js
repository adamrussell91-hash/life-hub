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

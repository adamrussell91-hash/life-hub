import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlannedWorkoutInput } from '../../apps/life/js/core/parse-workout-chat.js';
import {
  BLOCK_FORMATS,
  buildLoggerSteps,
  formatBlockScheme
} from '../../apps/life/js/core/workout-plan-groups.js';

// The Session formats library in config/chadwick-protocol.md promises every
// format is built from fields gym mode already runs. These drafts use the chat
// notation the library tells Chadwick to write.
const WARMUP = 'A  Warmup Cable Row — 15 kg × 12\nB  Bar Press — 30 kg × 10, 30 kg × 10';

function plan(block) {
  const input = buildPlannedWorkoutInput(`${WARMUP}\n${block}`, { date: '2026-10-22' });
  const exercises = input.fields.exercises;
  const { blocks, steps } = buildLoggerSteps(exercises);
  return { exercises, blocks, steps, grouped: blocks.at(-1) };
}

test('EDT density zone is a two-move AMRAP circuit with a label and round slots', () => {
  const { exercises, grouped, steps } = plan('C  EDT Zone (circuit, AMRAP 8 min)\nC1 Cable Curl — 12 kg × 5\nC2 Rope Pushdown — 14 kg × 5');
  const [curl, pushdown] = exercises.slice(-2);
  assert.equal(curl.superset_label, 'EDT Zone');
  assert.deepEqual(curl.block, { kind: 'circuit', format: 'amrap', time_cap_sec: 480 });
  assert.ok(curl.sets.length >= 8 && pushdown.sets.length === curl.sets.length);
  assert.equal(grouped.kind, 'circuit');
  assert.equal(formatBlockScheme(grouped), 'AMRAP 8 min · C1 → C2');
  const rounds = steps.filter(step => step.kind === 'round');
  assert.equal(rounds[0].members.length, 2, 'one tap logs both moves of a round');
});

test('a block header with rest seconds keeps its label and is not read as an exercise', () => {
  for (const label of ['Mech Drop', '6-12-25', 'GBC']) {
    const { exercises, grouped } = plan(`D  ${label} (circuit, 2 rounds, rest 120 s)\nD1 Incline Fly — 10 kg × 8 · D2 Flat Fly — 10 kg × 8 · D3 Chest Press — 10 kg × 10`);
    assert.equal(exercises.length, 5, `${label}: header must not become an exercise`);
    const first = exercises[2];
    assert.equal(first.superset_label, label);
    assert.deepEqual(first.block, { kind: 'circuit', rest_sec: 120 });
    assert.equal(formatBlockScheme(grouped), '2 rounds · C1 → C2 → C3 · rest 2 min after each round');
  }
});

test('a chipper is one round for time across every move', () => {
  const { exercises, grouped, steps } = plan('E  Chipper (circuit, 1 round for time)\nE1 Push-ups — 30 reps\nE2 Air squats — 25 reps\nE3 Cable Row — 15 kg × 20\nE4 Reverse crunch — 15 reps');
  assert.equal(exercises[2].superset_label, 'Chipper');
  assert.equal(exercises[2].block.format, 'for_time');
  assert.equal(formatBlockScheme(grouped), '1 round for time · C1 → C2 → C3 → C4');
  assert.equal(steps.filter(step => step.kind === 'round').length, 1);
});

test('yielding iso then reps runs hold and reps set-for-set', () => {
  const { exercises, steps } = plan('C1 Fly Stretch Hold — 25 s\nC2 Cable Fly — 10 kg × 10\n   ↳ 3 rounds: C1 → C2, rest 90 s after each round');
  const [hold, fly] = exercises.slice(-2);
  assert.equal(hold.tracking, 'timed');
  assert.equal(hold.sets[0].duration_sec, 25);
  assert.equal(fly.sets.length, 3);
  const order = steps.filter(step => step.kind === 'superset').map(step => step.memberIndex);
  assert.deepEqual(order, [0, 1, 0, 1, 0, 1]);
});

test('myo-reps, wave loading and 1-6 contrast keep every per-set load', () => {
  const myo = plan('C  Cable Fly — 10 kg × 15, 10 kg × 4, 10 kg × 4, 10 kg × 4').exercises.at(-1);
  assert.deepEqual(myo.sets.map(set => set.reps), [15, 4, 4, 4]);
  const wave = plan('C  Cable Row — 30 kg × 6, 33 kg × 4, 36 kg × 2, 32 kg × 6, 35 kg × 4, 38 kg × 2').exercises.at(-1);
  assert.deepEqual(wave.sets.map(set => set.weight_kg), [30, 33, 36, 32, 35, 38]);
  const contrast = plan('C  Chest Press — 40 kg × 2, 32 kg × 6, 41 kg × 2, 33 kg × 6').exercises.at(-1);
  assert.deepEqual(contrast.sets.map(set => set.reps), [2, 6, 2, 6]);
});

test('the protocol only marks formats runnable that gym mode supports', () => {
  const protocol = readFileSync(new URL('../../config/chadwick-protocol.md', import.meta.url), 'utf8');
  const section = protocol.slice(protocol.indexOf('## Session formats'), protocol.indexOf('## Keeping sessions fresh'));
  assert.ok(section.includes('**Not runnable yet.**'));
  for (const format of section.matchAll(/`format: (\w+)`/g)) {
    assert.ok(BLOCK_FORMATS.includes(format[1]), `${format[1]} is not a gym mode format`);
  }
  assert.match(section, /area: "session formats"/);
});

test('EMOM, E2MOM and alternating EMOM parse into timed circuits', async () => {
  const { intervalSchedule } = await import('../../apps/life/js/core/workout-plan-groups.js');
  const emom = plan('C  Press EMOM (EMOM 8 min)\nC1 Bar Press — 30 kg × 6\nC2 Push-ups — 8 reps');
  assert.deepEqual(emom.exercises[2].block, { kind: 'circuit', format: 'emom' });
  assert.equal(emom.exercises[2].sets.length, 8, 'EMOM 8 min = 8 rounds');
  assert.equal(formatBlockScheme(emom.grouped), 'Every 1 min · 8 rounds · C1 → C2');
  assert.equal(intervalSchedule(emom.grouped).length, 8);

  const e2 = plan('C  Heavy E2MOM (E2MOM, 5 rounds)\nC1 Cable RDL — 40 kg × 10\nC2 Air squats — 15 reps');
  assert.equal(e2.exercises[2].block.interval_sec, 120);
  assert.equal(formatBlockScheme(e2.grouped), 'Every 2 min · 5 rounds · C1 → C2');

  const alt = plan('C  Alt EMOM (every 60 s, alternating, 5 rounds)\nC1 Bar Row — 30 kg × 8\nC2 Push-ups — 10 reps');
  assert.equal(alt.exercises[2].block.alternate, true);
  const schedule = intervalSchedule(alt.grouped);
  assert.equal(schedule.length, 10, 'each move gets its own minute');
  assert.deepEqual(schedule.slice(0, 2).map(segment => segment.memberIndex), [0, 1]);
});

test('Death By is a one-move EMOM with rising reps', () => {
  const { exercises, grouped, steps } = plan('C  Death By Push-ups (Death By, EMOM)\nC1 Push-ups — 1 rep, 2 reps, 3 reps, 4 reps, 5 reps, 6 reps');
  const push = exercises.at(-1);
  assert.equal(push.superset_label, 'Death By Push-ups');
  assert.equal(push.block.format, 'emom');
  assert.deepEqual(push.sets.map(set => set.reps), [1, 2, 3, 4, 5, 6]);
  assert.equal(grouped.kind, 'circuit');
  assert.equal(formatBlockScheme(grouped), 'Every 1 min · 6 rounds');
  assert.equal(steps.filter(step => step.kind === 'round').length, 6);
});

test('Tabata and work:rest intervals parse with work and rest seconds', async () => {
  const { intervalPosition, intervalSchedule } = await import('../../apps/life/js/core/workout-plan-groups.js');
  const tabata = plan('D  Tabata (Tabata, 4 rounds)\nD1 Cable Row — 15 kg × 12\nD2 Mountain climbers — 20 reps');
  assert.deepEqual(tabata.exercises[2].block, { kind: 'circuit', format: 'intervals', rest_sec: 10, work_sec: 20 });
  assert.equal(formatBlockScheme(tabata.grouped), '4 rounds · 20s on / 10s off · C1 → C2');
  const segments = intervalSchedule(tabata.grouped);
  assert.equal(segments.filter(segment => segment.phase === 'work').length, 8, 'Tabata is 8 work intervals');
  assert.equal(segments.at(-1).phase, 'work', 'no trailing rest');
  assert.equal(intervalPosition(tabata.grouped, 5_000).phase, 'lead_in');
  assert.equal(intervalPosition(tabata.grouped, 35_000).phase, 'rest');
  assert.equal(intervalPosition(tabata.grouped, 35_000).segment.memberIndex, 1, 'rest shows who is next');
  assert.equal(intervalPosition(tabata.grouped, 10_000 + 240_000 - 10_000).phase, 'done');

  const custom = plan('D  Intervals (30 s on / 15 s off, 3 rounds)\nD1 Cable Press — 15 kg × 12\nD2 Squat jumps — 10 reps');
  assert.equal(custom.exercises[2].block.work_sec, 30);
  assert.equal(custom.exercises[2].block.rest_sec, 15);
  assert.equal(custom.exercises[2].sets.length, 3);
});

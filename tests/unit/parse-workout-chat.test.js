import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlannedWorkoutInput,
  findLatestWorkoutPlanText,
  parseSupersetPairing,
  parseWorkoutChat,
  parseWorkoutSet,
  setsAreIdentical
} from '../../js/core/parse-workout-chat.js';

const FLAT = [
  '1. **Bar Squat** — legs first while you\'re fresh - Set 1: 10 reps x 25kg (cable: none) - Set 2: 10 reps x 25kg (cable: none) - Set 3: 10 reps x 25kg (cable: none)',
  '2. **Bar Row** — pull that back thick - Set 1: 10 reps x 26kg (cable: constant force) - Set 2: 10 reps x 26kg (cable: constant force) - Set 3: 10 reps x 26kg (cable: constant force)',
  '3. **Bar Press** — chest gets its pump, always - Set 1: 10 reps x 30kg (cable: constant force) - Set 2: 10 reps x 30kg (cable: constant force) - Set 3: 10 reps x 30kg (cable: constant force)',
  '4. **Goblet Squat** — burnout finisher for the legs - Set 1: 12 reps x 14kg (cable: none) - Set 2: 12 reps x 14kg (cable: none)',
  '5. **Single Arm Row with Chest Supported** — unilateral back detail work - Set 1: 12 reps x 14kg (cable: constant force) - Set 2: 12 reps x 14kg (cable: constant force)',
  '6. **Bent Over Fly** — rear delt/upper back finisher, that shoulder cap growth - Set 1: 15 reps x 9kg (cable: elastic) - Set 2: 15 reps x 9kg (cable: elastic)',
  '7. **Cable Bar Curl** — because we always end on guns, that\'s the law - Set 1: 12 reps x 20kg (cable: eccentric) - Set 2: 12 reps x 20kg (cable: eccentric)',
  '8. **Bent Leg Reverse Crunch** — core, keep that waistline tight while Brisket handles the rest - Set 1: 15 reps x 0kg (cable: none) - Set 2: 15 reps x 0kg (cable: none)'
];

test('parseWorkoutSet reads Chadwick chat loads and hub-style loads', () => {
  assert.deepEqual(parseWorkoutSet('Set 1: 10 reps x 25kg (cable: none)'), {
    index: 1,
    reps: 10,
    weightKg: 25,
    cable: 'none',
    raw: '10 reps x 25kg'
  });
  assert.equal(parseWorkoutSet('Set 2: 32 kg × 10 reps · cable: concentric').weightKg, 32);
  assert.equal(parseWorkoutSet('Set 3: 10x30kg').reps, 10);
  assert.equal(parseWorkoutSet('just a note'), null);
  assert.equal(parseWorkoutSet('Set 1:'), null);
});

test('parseWorkoutChat splits a flattened one-paragraph dump into eight exercises', () => {
  const plan = parseWorkoutChat(FLAT.join(' '));
  assert.ok(plan);
  assert.equal(plan.exercises.length, 8);
  assert.equal(plan.exercises[0].name, 'Bar Squat');
  assert.equal(plan.exercises[0].cue, 'legs first while you\'re fresh');
  assert.equal(plan.exercises[0].sets.length, 3);
  assert.equal(plan.exercises[0].sets[0].weightKg, 25);
  assert.equal(plan.exercises[6].name, 'Cable Bar Curl');
  assert.equal(plan.exercises[6].sets[0].cable, 'eccentric');
  assert.equal(plan.exercises[7].name, 'Bent Leg Reverse Crunch');
  assert.equal(plan.exercises[7].sets[0].weightKg, 0);
});

test('parseWorkoutChat keeps intro prose and one-exercise-per-line lists', () => {
  const plan = parseWorkoutChat(`Here's the full send.\n${FLAT.join('\n')}`);
  assert.equal(plan.intro, 'Here\'s the full send.');
  assert.equal(plan.exercises.length, 8);
  assert.equal(plan.exercises[3].name, 'Goblet Squat');
  assert.equal(plan.exercises[3].sets.length, 2);
});

test('parseWorkoutChat reads sets stacked under an exercise', () => {
  const plan = parseWorkoutChat([
    '1. **Bar Press** — chest pump',
    '- Set 1: 10 reps x 30kg (cable: constant force)',
    '- Set 2: 8 reps x 32kg (cable: constant force)'
  ].join('\n'));
  assert.equal(plan.exercises[0].name, 'Bar Press');
  assert.equal(plan.exercises[0].cue, 'chest pump');
  assert.equal(plan.exercises[0].sets[1].reps, 8);
  assert.equal(plan.exercises[0].sets[1].weightKg, 32);
});

test('parseWorkoutChat ignores a numbered list that is not a workout', () => {
  assert.equal(parseWorkoutChat('1. Breathe\n2. Walk\n3. Stretch'), null);
  assert.equal(parseWorkoutChat('Welcome back, you absolute legend.'), null);
});

test('parseWorkoutChat reads compact 10x25kg lists and between-set supersets', () => {
  const plan = parseWorkoutChat([
    '"Welcome Back, King" — Full Body Pump Session (60 min)',
    '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg (cable: none) - *between sets:* Bar Bicep Curl — 10x5kg, 10x5kg (cable: none)',
    '2. Goblet Squat — 12x14kg, 12x14kg (cable: none) - *between sets:* One Handle Arm Triceps — 10x6kg (cable: constant force)',
    '3. Bar Row — 10x26kg, 10x26kg, 10x26kg (cable: constant force)',
    '8. Bar Press — FINISHER SET — 20 reps x 20kg (cable: constant force)'
  ].join('\n'));
  assert.equal(plan.exercises[0].name, 'Bar Squat');
  assert.equal(plan.exercises[0].sets.length, 3);
  assert.equal(plan.exercises[0].sets[0].weightKg, 25);
  assert.equal(plan.exercises[0].between.name, 'Bar Bicep Curl');
  assert.equal(plan.exercises[0].between.sets.length, 2);
  assert.equal(plan.exercises[3].name, 'Bar Press');
  assert.equal(plan.exercises[3].sets[0].reps, 20);
  assert.equal(plan.exercises[3].sets[0].weightKg, 20);
});

test('parseWorkoutChat reads history-style compact lines with trailing cable', () => {
  const plan = parseWorkoutChat([
    '1. Bar Press (Chest) — 10x30kg, 10x32kg, 8x34kg — cable: constant force',
    '2. Bar Row (Back) — 10x27kg, 10x27kg — cable: constant force'
  ].join('\n'));
  assert.equal(plan.exercises[0].sets.length, 3);
  assert.equal(plan.exercises[0].sets[2].reps, 8);
  assert.equal(plan.exercises[0].sets[2].weightKg, 34);
  assert.equal(plan.exercises[0].sets[0].cable, 'constant force');
});

test('buildPlannedWorkoutInput turns a compact dump into a valid planned log_entry', () => {
  const input = buildPlannedWorkoutInput([
    'Updated: "Welcome Back, King" — Full Body Pump Session (60 min)',
    '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg (cable: none)',
    '2. Bar Row — 10x26kg, 10x26kg, 10x26kg (cable: constant_force)',
    '3. Bar Press — 20 reps x 20kg (cable: constant force)'
  ].join('\n'), { date: '2026-08-29' });
  assert.equal(input.type, 'workout');
  assert.equal(input.date, '2026-08-29');
  assert.equal(input.fields.title, 'Welcome Back, King');
  assert.equal(input.fields.status, 'planned');
  assert.equal(input.fields.day_type, 'workout_45_60');
  assert.equal(input.fields.exercises.length, 3);
  assert.equal(input.fields.exercises[1].sets[0].cable_type, 'constant_force');
  assert.equal(input.fields.exercises[2].sets[0].reps, 20);
});

test('buildPlannedWorkoutInput reads the compact 13-line dump Adam saw in chat', () => {
  const input = buildPlannedWorkoutInput([
    '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg, 10x25kg (cable: none)',
    '2. Bar Row — 10x26kg, 10x26kg, 10x26kg (cable: constant force)',
    '3. Bar Press — 10x30kg, 10x30kg (cable: constant force)',
    '4. Goblet Squat — 12x14kg, 12x14kg (cable: none)',
    '5. Single Arm Row — 12x14kg (cable: constant force)',
    '6. Bent Over Fly — 15x9kg (cable: elastic)',
    '7. Cable Bar Curl — 12x20kg (cable: eccentric)',
    '8. Bent Leg Reverse Crunch — 15x0kg (cable: none)',
    '9. Seated Curl — 12x8kg (cable: constant force)',
    '10. Face Pull — 15x8kg (cable: constant force)',
    '11. Lateral Raise — 12x6kg (cable: none)',
    '12. One Grip Russian Twist — 20×6kg (cable: none)',
    '13. Bar Press — FINISHER — 20×20kg (cable: constant force)'
  ].join('\n'), { date: '2026-08-29' });
  assert.equal(input.fields.exercises.length, 13);
  assert.equal(input.fields.exercises[11].name, 'One Grip Russian Twist');
  assert.equal(input.fields.exercises[11].sets[0].reps, 20);
  assert.equal(input.fields.exercises[11].sets[0].weight_kg, 6);
  assert.equal(input.fields.exercises[12].name, 'Bar Press');
  assert.equal(input.fields.exercises[12].sets[0].reps, 20);
  assert.equal(input.fields.exercises[12].sets[0].weight_kg, 20);
  assert.equal(input.fields.exercises[12].sets[0].cable_type, 'constant_force');
});

test('findLatestWorkoutPlanText walks newest-first and ignores chatter', () => {
  const latest = findLatestWorkoutPlanText([
    '1. Bar Press — 10x30kg (cable: none)\n2. Bar Row — 10x27kg (cable: none)',
    'Want me to lock this in?',
    '1. Bar Squat — 10x25kg, 10x25kg (cable: none)\n2. Goblet Squat — 12x14kg (cable: none)\n3. Bar Press — 20x20kg (cable: none)'
  ]);
  assert.match(latest, /Goblet Squat/);
});

test('parseSupersetPairing reads paired exercise names without loads', () => {
  const plan = parseSupersetPairing([
    'Pairing it your way:',
    '1&2 superset: Bar Press / Cable Bar Wide Grip Curl',
    '3&4 superset: Reverse Grip Incline Bench Press / One Handle Arm Triceps',
    '5&6 superset: Biceps Curl / Overhead Triceps',
    '7&8 straight after each other: Flat Fly burnout → Alt Biceps Curl burnout'
  ].join('\n'));
  assert.equal(plan.exercises.length, 8);
  assert.equal(plan.exercises[0].name, 'Bar Press');
  assert.equal(plan.exercises[1].name, 'Cable Bar Wide Grip Curl');
  assert.equal(plan.exercises[6].name, 'Flat Fly');
  assert.equal(plan.exercises[7].name, 'Alt Biceps Curl');
});

test('buildPlannedWorkoutInput turns superset pairing into a name-only planned log_entry', () => {
  const input = buildPlannedWorkoutInput([
    'Pairing it your way:',
    '1&2 superset: Bar Press / Cable Bar Wide Grip Curl',
    '3&4 superset: Reverse Grip Incline Bench Press / One Handle Arm Triceps'
  ].join('\n'), { date: '2026-08-29' });
  assert.equal(input.type, 'workout');
  assert.equal(input.fields.status, 'planned');
  assert.equal(input.fields.exercises.length, 4);
  assert.equal(input.fields.exercises[0].name, 'Bar Press');
  assert.equal(input.fields.exercises[0].sets, undefined);
});

test('setsAreIdentical is true only when every set shares load and cable', () => {
  const squat = parseWorkoutChat(FLAT[0]);
  assert.equal(setsAreIdentical(squat.exercises[0].sets), true);
  const mixed = [
    { reps: 10, weightKg: 25, cable: 'none' },
    { reps: 8, weightKg: 25, cable: 'none' }
  ];
  assert.equal(setsAreIdentical(mixed), false);
  assert.equal(setsAreIdentical([{ reps: 10 }]), false);
});

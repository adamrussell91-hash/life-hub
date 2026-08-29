import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
    raw: '10 reps x 25kg (cable: none)'
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

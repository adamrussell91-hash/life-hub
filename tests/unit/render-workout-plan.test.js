import test from 'node:test';
import assert from 'node:assert/strict';
import { appendWorkoutPlanCard, fillExercisePlanList, renderExercisePlanRow } from '../../apps/life/js/app/render-workout-plan.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.className = '';
    this.children = [];
    this.textContent = '';
    this.src = '';
    this.alt = '';
    this.loading = '';
    this.decoding = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute() {}
}

class FakeRoot {
  createElement(tag) { return new FakeEl(tag); }
}

test('renderExercisePlanRow uses the pose image for a named pose', () => {
  const root = new FakeRoot();
  const row = renderExercisePlanRow(root, {
    name: 'Side Plank',
    sets: [{}, {}]
  });
  assert.equal(row.children[0].src, 'assets/fitness/exercises/side-plank.webp');
  assert.match(row.children[0].className, /workout-plan-card__thumb--pose/);
  assert.equal(row.children[1].children[0].textContent, 'Side Plank');
});

test('renderExercisePlanRow shows a thumb, title, set count, and chevron', () => {
  const root = new FakeRoot();
  const row = renderExercisePlanRow(root, {
    name: 'Bench Press',
    sets: [{}, {}, {}, {}]
  });
  assert.equal(row.className, 'workout-plan-card__row');
  assert.equal(row.children[0].tagName, 'img');
  assert.match(row.children[0].src, /chest-whole/);
  assert.equal(row.children[1].children[0].textContent, 'Bench Press');
  assert.equal(row.children[2].textContent, '4 sets');
  assert.equal(row.children[3].textContent, '›');
});

test('appendWorkoutPlanCard groups superset pairs under a labelled block', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  appendWorkoutPlanCard(root, host, {
    record: {
      date: '2026-07-30',
      title: 'Chest and Arms',
      status: 'planned',
      duration_min: 35,
      exercises: [
        { name: 'Bar Press', superset_group: 1, superset_label: '1&2 superset' },
        { name: 'Cable Curl', superset_group: 1 },
        { name: 'Bar Row', sets: [{}, {}] }
      ]
    }
  });
  const card = host.children[0];
  const list = card.children[3];
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].className, 'workout-plan-card__group workout-plan-card__group--superset');
  const [head, scheme, members] = list.children[0].children;
  assert.equal(head.children[0].textContent, 'A');
  assert.equal(head.children[1].textContent, '1&2 superset');
  assert.match(scheme.textContent, /A1 → A2/);
  assert.equal(members.children.length, 2);
  assert.equal(members.children[0].children[1].children[0].children[0].textContent, 'A1');
  assert.equal(members.children[1].children[1].children[0].children[0].textContent, 'A2');
  assert.equal(list.children[1].className, 'workout-plan-card__row');
});

test('a completed superset shows its sets round by round (AB, AB), not AAA BBB', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  appendWorkoutPlanCard(root, host, {
    record: {
      date: '2026-07-30',
      title: 'Chest and Arms',
      status: 'completed',
      exercises: [
        { name: 'Bar Row', sets: [{ reps: 10, weight_kg: 36, cable_type: 'constant_force' }] },
        {
          name: 'Bar Press',
          superset_group: 1,
          sets: [
            { reps: 10, weight_kg: 30, cable_type: 'constant_force' },
            { reps: 8, weight_kg: 34, cable_type: 'constant_force', failed: true }
          ]
        },
        {
          name: 'Cable Curl',
          superset_group: 1,
          sets: [
            { reps: 12, weight_kg: 10, cable_type: 'constant_force' },
            { reps: 12, weight_kg: 10, cable_type: 'constant_force' }
          ]
        }
      ]
    }
  });
  const list = host.children[0].children[3];
  const group = list.children[1];
  const rounds = group.children.find(child => child.className === 'workout-plan-card__rounds');
  assert.ok(rounds, 'grouped completed block lists rounds');
  assert.equal(rounds.children.length, 2);
  assert.equal(rounds.children[0].children[0].textContent, 'Round 1');
  assert.equal(rounds.children[0].children[1].textContent, 'B1 30 kg × 10 → B2 10 kg × 12');
  assert.equal(rounds.children[1].children[1].textContent, 'B1 34 kg × 8 (failure) → B2 10 kg × 12');
});

test('a circuit block reads as rounds with its score', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  const sets = n => Array.from({ length: n }, () => ({ reps: 5, weight_kg: 0, cable_type: 'none' }));
  appendWorkoutPlanCard(root, host, {
    record: {
      date: '2026-10-04',
      title: 'Glow Up',
      status: 'completed',
      exercises: [
        {
          name: 'Push-Up',
          superset_group: 3,
          superset_label: 'Cindy',
          block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: 96 } },
          sets: sets(3)
        },
        { name: 'Bench Dip', superset_group: 3, sets: sets(3) },
        { name: 'Reverse Crunch', superset_group: 3, sets: sets(3) }
      ]
    }
  });
  const group = host.children[0].children[3].children[0];
  assert.match(group.className, /workout-plan-card__group--circuit/);
  const [head, scheme] = group.children;
  assert.equal(head.children[1].textContent, 'Cindy');
  assert.equal(scheme.textContent, '3 rounds for time · A1 → A2 → A3');
  const score = group.children.find(child => String(child.className).includes('workout-plan-card__score'));
  assert.equal(score.textContent, 'Score: 3 rounds in 1:36');
});

test('appendWorkoutPlanCard writes weekday, title, duration, and rows', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  appendWorkoutPlanCard(root, host, {
    record: {
      date: '2026-07-30',
      title: 'Upper Body',
      status: 'planned',
      duration_min: 35,
      exercises: [{ name: 'Push-Up', sets: [{}, {}] }]
    }
  });
  const card = host.children[0];
  assert.equal(card.className, 'workout-plan-card');
  assert.equal(card.children[0].textContent, 'Thursday');
  assert.equal(card.children[1].textContent, 'Upper Body');
  assert.equal(card.children[2].textContent, '35 min');
  assert.equal(card.children[3].className, 'workout-plan-card__exercises record-proposal__exercises');
  assert.equal(card.children[3].children[0].children[2].textContent, '2 sets');
});

test('fillExercisePlanList reuses exercise thumb nodes on a second fill', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  const exercises = [
    { name: 'Bench Press', sets: [{}, {}, {}, {}] },
    { name: 'Cable Curl', sets: [{}, {}] }
  ];
  fillExercisePlanList(root, host, { exercises });
  const firstThumbs = host.children.map(row => row.children[0]);
  assert.equal(firstThumbs.length, 2);
  assert.match(firstThumbs[0].src, /chest-whole/);
  fillExercisePlanList(root, host, { exercises });
  assert.equal(host.children[0].children[0], firstThumbs[0]);
  assert.equal(host.children[1].children[0], firstThumbs[1]);
});

test('fillExercisePlanList uses set details for completed sessions', () => {
  const root = new FakeRoot();
  const host = new FakeEl('div');
  fillExercisePlanList(root, host, {
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
    detail: 'sets'
  });
  assert.match(host.children[0].className, /fitness-exercise/);
  assert.match(host.children[0].children[1].children[1].textContent, /32 kg/);
});

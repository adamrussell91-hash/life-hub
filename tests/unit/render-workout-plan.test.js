import test from 'node:test';
import assert from 'node:assert/strict';
import { appendWorkoutPlanCard, fillExercisePlanList, renderExercisePlanRow } from '../../js/app/render-workout-plan.js';

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
  assert.equal(list.children[0].children[0].textContent, '1&2 superset');
  assert.equal(list.children[0].children[1].children.length, 3);
  assert.equal(list.children[1].className, 'workout-plan-card__row');
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

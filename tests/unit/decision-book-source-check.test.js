// tests/unit/decision-book-source-check.test.js
// The light source check (spec, "Sources"): the five models with a fixed published structure,
// checked against their original sources so names and order are exact. The book is the authority
// for how it draws them; these pin only the structure each source fixes.
//   Drexler/Sibbet  team performance model: seven stages, each with its question, in order.
//   Hersey–Blanchard  situational leadership: four styles from high direction and low support,
//                     through high both and low direction with high support, to low both.
//   Belbin  nine team roles.
//   Whitmore  goals: SMART (5), PURE (4) and CLEAR (5) criteria, fourteen in all.
//   de Bono  six thinking hats: white facts, red feelings, black caution, yellow benefits,
//            green ideas, blue process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

const chart = (id) => TOOLS[id].chart;
const groups = (id) => chart(id).groups;

test('Drexler/Sibbet: the seven stages, in order, each with its question', () => {
  assert.deepEqual(chart('dm_drexler_sibbet').stages.map((s) => s.id), ['orientation', 'trust', 'goals', 'commitment', 'implementation', 'high_performance', 'renewal']);
  assert.deepEqual(chart('dm_drexler_sibbet').stages.map((s) => s.label.split(':')[1].trim()), [
    'why am I here?', 'who are you?', 'what are we doing?', 'how will we do it?', 'who does what, when, where?', 'wow!', 'why continue?'
  ]);
});

test('Hersey–Blanchard: direction to the right, support upwards, and the four styles where the source puts them', () => {
  const { axes, cells } = chart('dm_hersey_blanchard');
  assert.equal(axes.x.label, 'Leadership');
  assert.equal(axes.y.label, 'Support');
  // col 1 is much leadership (direction); row 0 is much support (the top).
  const at = Object.fromEntries(cells.map((c) => [c.id, `${c.col}${c.row}`]));
  assert.deepEqual(at, { instructing: '11', coaching: '10', supporting: '00', delegating: '01' });
});

test('Belbin: the nine team roles by their source names', () => {
  const roles = groups('dm_role_playing').filter((g) => !g.id.endsWith('_hat'));
  assert.deepEqual(roles.map((g) => g.label), ['Plant', 'Resource investigator', 'Coordinator', 'Shaper', 'Monitor evaluator', 'Teamworker', 'Implementer', 'Completer finisher', 'Specialist']);
});

test('de Bono: the six hats and what each stands for', () => {
  const hats = groups('dm_role_playing').filter((g) => g.id.endsWith('_hat'));
  assert.deepEqual(hats.map((g) => g.id), ['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat']);
  const said = hats.map((g) => g.prompt.toLowerCase());
  for (const [i, word] of ['facts', 'feelings', 'risks', 'optimism', 'ideas', 'process'].entries()) assert.match(said[i], new RegExp(word), hats[i].id);
});

test('Whitmore: SMART, PURE and CLEAR in order, fourteen criteria', () => {
  const byAcronym = {};
  for (const g of groups('dm_whitmore')) (byAcronym[g.prompt] ??= []).push(g.label);
  assert.deepEqual(byAcronym, {
    SMART: ['Specific', 'Measurable', 'Attainable', 'Realistic', 'Time-phased'],
    PURE: ['Positively stated', 'Understood', 'Relevant', 'Ethical'],
    CLEAR: ['Challenging', 'Legal', 'Environmentally sound', 'Agreed', 'Recorded']
  });
  for (const [acronym, labels] of Object.entries(byAcronym)) assert.equal(labels.map((l) => l[0]).join(''), acronym);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  agentsReworking, autoFace, bezelDoses, bigEvent, FACES, moonFill, readFaceChoice, resolveFace,
  stepFace, taskTally, tripOn, writeFaceChoice
} from '../../packages/design-kit/js/calendar/dial-faces.js';
import { drawDress, drawMoon, drawRetro } from '../../packages/design-kit/js/calendar/dial-complications.js';

const TRIP = { start_date: '2026-12-10', end_date: '2026-12-20', home_tz: 'Australia/Sydney', cities: [
  { name: 'Kuala Lumpur', tz: 'Asia/Kuala_Lumpur', start_date: '2026-12-10', end_date: '2026-12-14' },
  { name: 'Seoul', tz: 'Asia/Seoul', start_date: '2026-12-15', end_date: '2026-12-20' }
] };

test('the mockup’s five faces, in order', () => {
  assert.deepEqual(FACES.map(f => f.id), ['tool', 'focus', 'pilot', 'dress', 'grand']);
  assert.deepEqual(FACES.find(f => f.id === 'dress').comps, []);
});

test('Auto: big day > trip > running session > weekend/holiday > school day', () => {
  const base = { date: '2026-10-08', today: '2026-10-08', weekday: true, holiday: false, chips: [], trips: [], working: false };
  assert.equal(autoFace(base), 'tool');
  assert.equal(autoFace({ ...base, weekday: false }), 'dress');
  assert.equal(autoFace({ ...base, holiday: true }), 'dress');
  assert.equal(autoFace({ ...base, working: true }), 'focus');
  assert.equal(autoFace({ ...base, working: true, date: '2026-10-09' }), 'tool', 'focus is for today only');
  assert.equal(autoFace({ ...base, date: '2026-12-16', trips: [TRIP], working: true }), 'pilot');
  assert.equal(autoFace({ ...base, chips: [{ title: 'Graduation ceremony', start: 14 }], trips: [TRIP] }), 'grand');
  assert.equal(autoFace({ ...base, date: '2027-07-13' }), 'grand', 'the anniversary');
});

test('big events and trips', () => {
  assert.deepEqual(bigEvent('2026-10-08', [{ title: 'Wedding of Sam', start: '15:30' }]), { title: 'Wedding of Sam', start: 15.5 });
  assert.equal(bigEvent('2026-10-08', [{ title: 'Ceremony', ambient: true }]), null);
  assert.equal(tripOn('2026-12-16', [TRIP]).city.tz, 'Asia/Seoul');
  assert.equal(tripOn('2026-12-11', [TRIP]).city.name, 'Kuala Lumpur');
  assert.equal(tripOn('2026-12-21', [TRIP]), null);
});

test('the choice: stored per device, Auto by default, survives a broken storage', () => {
  const win = new Window();
  assert.equal(readFaceChoice('life', win.localStorage), 'auto');
  writeFaceChoice('life', 'dress', win.localStorage);
  assert.equal(readFaceChoice('life', win.localStorage), 'dress');
  assert.deepEqual(resolveFace('dress', { date: '2026-10-08', today: '2026-10-08' }), { id: 'dress', auto: false });
  writeFaceChoice('life', 'auto', win.localStorage);
  assert.equal(readFaceChoice('life', win.localStorage), 'auto');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readFaceChoice('life', broken), 'auto');
  assert.doesNotThrow(() => writeFaceChoice('life', 'tool', broken));
  assert.equal(stepFace('grand', 1), 'tool');
  assert.equal(stepFace('tool', -1), 'grand');
});

test('complication data: moon, tally, bezel, tourbillon', () => {
  assert.equal(moonFill(0), 0);
  assert.equal(moonFill(15), 0.5);
  assert.equal(moonFill(80), 1);
  assert.deepEqual(taskTally([{ id: 'a', kind: 'task', done: true }, { id: 'b', kind: 'task' }, { id: 'a', kind: 'task', done: true }, { id: 'c', kind: 'class' }]), { closed: 1, total: 2 });
  const [dose] = bezelDoses({ doses: [{ status: 'taken', slot: 'am', time: 7.75, window: [7.75, 11.75] }, { status: 'skipped', slot: 'pm' }] }, 10, true);
  assert.deepEqual(dose, { slot: 'am', time: 7.75, from: 7.75, to: 11.75, left: 1.75, gone: 10 });
  assert.equal(bezelDoses({ doses: [{ status: 'taken', time: 8, window: [8, 12] }] }, 10, false)[0].left, null);
  assert.equal(agentsReworking([{ status: 'pending', agent: 'clare', chip: { date: '2026-10-08' } }], '2026-10-08'), true);
  assert.equal(agentsReworking([{ status: 'pending', agent: 'sara', chip: { date: '2026-10-08' } }], '2026-10-08'), false);
});

test('drawing: moon, retrograde tally and the dress face', () => {
  const win = new Window();
  const doc = win.document;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const s = (tag, attrs, parent, text) => {
    const n = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text != null) n.textContent = text;
    parent?.append(n);
    return n;
  };
  const g = { s, cx: 200, cy: 200, R: 150, rings: { gauge: 64 } };
  drawMoon(g, svg, { cx: 200, cy: 230, r: 9, fill: 0.5, label: 'T4 W1' });
  assert.ok(svg.querySelector('[data-part="moon"] .dd-fx-moon-lit'));
  drawRetro(g, svg, { cx: 200, cy: 230, r: 16, closed: 2, total: 4 });
  assert.match(svg.querySelector('[data-part="retro"]').textContent, /2 of 4 closed/);
  drawDress(g, svg, { items: [{ start: 9, end: 10, isClass: true, title: 'Y12' }, { start: 19, end: 21, kind: 'corey', title: 'Tea' }], pct: 62, nowHour: 9.2 });
  assert.equal(svg.querySelectorAll('[data-part="dress-diamond"]').length, 2);
  assert.ok(svg.querySelector('[data-part="dress-hand"]'));
  assert.equal(svg.querySelector('[data-part="dress"] text'), null, 'no words on the dress face');
});

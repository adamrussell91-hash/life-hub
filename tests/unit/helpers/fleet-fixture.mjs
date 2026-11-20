// tests/unit/helpers/fleet-fixture.mjs
// An invented Fleet week lesson for the server tests: a class of eight made-up
// students, an invented 5 × 5 grid of short-answer questions and four recall
// lines. Accepted answers are written "Mast A0" so a case-sensitive search can
// tell them apart from what students type ("mast a0") and from any hex id.
import { classKey, draftLessonKey, publishedLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';
import { prepareGamePublish, storeGameKeys } from '../../../netlify/functions/_shared/games.mjs';
import { deviceHash } from '../../../netlify/functions/_shared/question-drop.mjs';
import { memoryStore } from './lab-store.js';

const NAMES = ['Ivo Penn', 'Lena Moss', 'Ora Vale', 'Tam Reef', 'Uma Holt', 'Wes Lark', 'Yara Pell', 'Zed Crane'];
const initialsOf = (name) => name.split(' ').map((w) => w[0]).join('');
export const FLEET_ROSTER = NAMES.map((name, i) => ({ id: `st_0${i + 1}`, name, initials: initialsOf(name) }));

const sa = (id, prompt, accepted) => ({
  id, shape: 'question', question: { id, kind: 'short_answer', prompt, marks: 1, accepted }, pieces: [], outcomes: [], skills: [], tech: []
});
/** Square i: variant A accepts "Mast Ai", variant B "Mast Bi". Recall line i accepts "Line i". */
export const answerFor = (item) => {
  const m = /^q(\d+)([ab])$/.exec(item);
  if (m) return `Mast ${m[2].toUpperCase()}${m[1]}`;
  const r = /^r(\d)$/.exec(item);
  return r ? `Line ${r[1]}` : '';
};
/** Every accepted answer, as stored (the leak sweep's needles). */
export const ACCEPTED = [
  ...Array.from({ length: 25 }, (_, i) => [`Mast A${i}`, `Mast B${i}`]).flat(),
  ...[0, 1, 2, 3].map((i) => `Line ${i}`)
];

export function fleetGame(over = {}) {
  return {
    id: 'fw', title: 'Harbour week', kind: 'fleet_week',
    columns: ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'],
    rows: ['Fear', 'Pride', 'Home', 'Loss', 'Hope'],
    squares: Array.from({ length: 25 }, (_, i) => ({ variants: [sa(`q${i}a`, `Question ${i} A?`, [`Mast A${i}`]), sa(`q${i}b`, `Question ${i} B?`, [`Mast B${i}`])] })),
    recall: [0, 1, 2, 3].map((i) => sa(`r${i}`, `Recall line ${i}?`, [`Line ${i}`])),
    settings: { rounds: 3, round_cap_s: 240, placement_cap_s: 120, answer_s: 60 },
    ...over
  };
}

/** A published Game lesson gl1 holding the fleet game, and class1 with eight students. */
export async function fleetLesson({ roster = FLEET_ROSTER, game = fleetGame() } = {}) {
  const store = memoryStore();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '8 English', students: roster });
  store.data.set(classKey('class0'), { id: 'class0', status: 'active', title: 'No list', students: [] });
  const draft = { id: 'gl1', title: 'Fleet', unit_id: 'unit1', pedagogical_mode: 'game', status: 'active', blocks: [], game: { games: [game] } };
  store.data.set(draftLessonKey('gl1'), draft);
  const pub = prepareGamePublish(draft);
  if (pub.problems.length) throw new Error(`fixture fleet game can't publish: ${pub.problems[0]}`);
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: pub.snapshot });
  await storeGameKeys(store, 'gl1', pub.record);
  // Each student has already claimed their initials on device n.
  roster.forEach((s, i) => {
    const device = deviceHash(tokenFor(i + 1));
    store.data.set(`class-claims/class1/students/${s.id}`, { device, devices: [device], claimed_at: '2026-11-19T00:00:00.000Z' });
    store.data.set(`class-claims/class1/devices/${device}`, { student_id: s.id, claimed_at: '2026-11-19T00:00:00.000Z' });
  });
  store.writes.length = 0;
  return { store, pub };
}

export const tokenFor = (n) => n.toString(16).padStart(2, '0').repeat(24);
/** What student n's device (1-based) sends with every call. */
export const whoFleet = (n) => ({ class_id: 'class1', class_token: tokenFor(n) });
/** Student n's owner hash, as the server derives it. */
export const ownerOf = (n) => deviceHash(`student:class1:st_0${n}`);

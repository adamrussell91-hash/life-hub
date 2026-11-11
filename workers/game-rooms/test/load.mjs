// workers/game-rooms/test/load.mjs: drives the room reducer as the Durable Object would with 35 seats for
// 10 minutes of play, and reports how long each action takes including the per-viewer views and JSON the
// room sends (reduce + publicView × every socket + viewDelta + stringify). Spec §10 target: broadcast p95 < 250 ms.
// Run: node workers/game-rooms/test/load.mjs   (invented content only)
import { initialState, publicView, reduce, viewDelta } from '../../../netlify/functions/_shared/game-room-core.mjs';
import { prepareGamePublish } from '../../../netlify/functions/_shared/games.mjs';
import { connections, crossword, gameLesson, whoSaidIt } from '../../../tests/unit/helpers/game-fixture.mjs';

const SEATS = 35;
const MINUTES = 10;
const pub = prepareGamePublish(gameLesson({}, [crossword(), connections(), whoSaidIt()]));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

function run(gameId, style, moveEvery) {
  const game = pub.snapshot.games.find((g) => g.id === gameId);
  const keys = pub.record.games[gameId];
  const roster = Object.fromEntries(Array.from({ length: SEATS }, (_, i) => [`s${i}`, `Q${String.fromCharCode(65 + (i % 26))}${i}`]));
  const T0 = 1_800_000_000_000;
  const s = initialState({ room: 'room_load_1', code: '111111', lesson_id: 'l', class_id: 'c', game, keys, style, roster, fold_url: 'https://x.test/f', opened_at: T0 }, T0);
  const viewers = [['teacher', 'teacher'], ['board', 'board'], ...Object.keys(roster).map((_, i) => [`o${i}`, 'student'])];
  const last = new Map();
  const times = [];
  let bytes = 0;
  const step = (action, now) => {
    const t = performance.now();
    const { effects } = reduce(s, action, now);
    for (const fx of effects) {
      if (fx.kind === 'send') bytes += JSON.stringify(fx.msg).length;
      if (fx.kind !== 'broadcast') continue;
      for (const [owner, role] of viewers) {
        const view = publicView(s, role, owner, now);
        const prev = last.get(owner);
        const patch = prev ? viewDelta(prev, view) : null;
        last.set(owner, view);
        bytes += JSON.stringify(patch ? { t: 'delta', seq: view.seq, now, patch } : { t: 'snapshot', view }).length;
      }
    }
    times.push(performance.now() - t);
  };
  Object.keys(roster).forEach((id, i) => step({ type: 'connect', owner: `o${i}`, role: 'student', student_id: id, conn: `k${i}` }, T0));
  step({ type: 'msg', owner: 'teacher', role: 'teacher', msg: { t: 'control', op: { op: 'start' } } }, T0);
  step({ type: 'tick' }, T0 + 3000);
  const items = Object.keys(keys.items);
  const tiles = game.walls?.[0]?.tiles.map((t) => t.id) ?? [];
  const cast = [...(game.cast ?? []).map((c) => c.id), 'fake'];
  const end = T0 + 3000 + MINUTES * 60_000;
  let actions = 0;
  for (let now = T0 + 3000; now < end; now += 1000) {
    if (style === 'paced' && s.item && (s.item.revealed || now >= s.item.ends_at)) {
      step({ type: 'tick' }, now);
      if (s.item?.revealed && s.phase === 'playing') step({ type: 'msg', owner: 'teacher', role: 'teacher', msg: { t: 'control', op: { op: 'next' } } }, now);
      if (s.phase !== 'playing') break;
    }
    for (let i = 0; i < SEATS; i += 1) {
      if (rand() > 1000 / moveEvery) continue;
      let event;
      if (style === 'paced') event = { item: s.item?.item ?? 'q1', move: 'answer', response: { speaker: cast[Math.floor(rand() * cast.length)] } };
      else if (gameId === 'g_wall') event = { item: 'w1', move: rand() < 0.1 ? 'pass' : 'guess', response: { tiles: [...tiles].sort(() => rand() - 0.5).slice(0, 4) } };
      else event = { item: items[Math.floor(rand() * items.length)], move: rand() < 0.15 ? 'hint' : 'answer', response: { text: rand() < 0.3 ? keys.items[items[0]].answers[0] : 'wrong', letters: '' } };
      step({ type: 'msg', owner: `o${i}`, role: 'student', conn: `k${i}`, msg: { t: 'move', rid: `r${actions}`, event } }, now);
      actions += 1;
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(2);
  return { game: gameId, actions: times.length, moves_stored: Object.values(s.history).reduce((n, h) => n + h.length, 0), p50_ms: pct(50), p95_ms: pct(95), max_ms: sorted.at(-1).toFixed(2), sent_kb: Math.round(bytes / 1024) };
}

const rows = [run('g_cross', 'race', 4000), run('g_wall', 'race', 6000), run('g_who', 'paced', 3000)];
console.table(rows);
const worst = Math.max(...rows.map((r) => Number(r.p95_ms)));
console.log(`${SEATS} seats, ${MINUTES} min each: worst p95 reduce + views + JSON = ${worst} ms (target < 250 ms end to end).`);
if (worst > 50) process.exitCode = 1;

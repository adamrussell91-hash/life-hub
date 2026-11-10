import { renderBlock } from '@/blocks/render';
import { createBlock } from '@/blocks/create-block';
import { createComparativeJudgementEditor } from '@/blocks/comparative-judgement';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Block, ComparativeJudgementBlock } from '@/schemas/block';
import {
  chipStats,
  choosePair,
  contestedPair,
  fitBradleyTerry,
  fitMarks,
  flagMisfits,
  judgeFit,
  markFor,
  pairKey,
  reliabilitySignal,
  splitHalf,
  ssr,
  thirdOf
} from '../../../../netlify/functions/_shared/cj-maths.mjs';
import '../styles/app.css';

/**
 * Comparative judgement preview with an in-page fake server that runs the
 * real maths (netlify/functions/_shared/cj-maths.mjs). ?view=editor (default),
 * teacher, student, display or print. ?seed=0 starts with no prior judgements.
 * Invented poem, invented students, synthetic answers only.
 */

const LESSON = 'lesson_demo';
const CLASS = 'class_demo';
const params = new URLSearchParams(location.search);
const view = (['editor', 'teacher', 'student', 'display', 'print'] as const).find((v) => v === params.get('view')) ?? 'editor';

/* ── The lesson ────────────────────────────────────────────────────── */

const question = createBlock('question_set', 'qs_lantern') as Extract<Block, { block_type: 'question_set' }>;
question.content = {
  title: 'The Lantern Keeper',
  questions: [{ id: 'qs_lantern_q1', prompt: 'How does the poet use the image of the lantern to show the keeper’s loneliness?', kind: 'short_answer', response_space: 'medium' }]
};

let cj = createBlock('comparative_judgement', 'cj_demo') as ComparativeJudgementBlock;
cj.content = {
  ...cj.content,
  title: 'Which answer explains the lantern better?',
  source: { lesson_id: '', block_id: 'qs_lantern', question_id: 'qs_lantern_q1' },
  criterion: 'Which answer explains better how the lantern shows the keeper’s loneliness?',
  chips: ['Precise quote', 'Clear argument', 'Analyses effect', 'Links to context'],
  calibration: [
    {
      id: 'cal_1',
      left: 'The lantern is lonely because the keeper is alone. It is a good image.',
      right: 'The lantern “burns for no ship” in stanza two, so its light is wasted, just as the keeper’s care reaches nobody. The image makes loneliness feel like effort that goes unseen.',
      better: 'right',
      reason: 'It quotes exactly and explains what the image makes us feel.'
    },
    {
      id: 'cal_2',
      left: 'The poet repeats “still it burns” three times, so the lantern becomes a stubborn habit. The keeper keeps going even though no one answers, and the repetition makes the reader feel the long nights pile up.',
      right: 'The poet uses the lantern as a symbol. It shows how the keeper feels. Symbols are used a lot in poems to show feelings.',
      better: 'left',
      reason: 'It names the technique and links it to the keeper’s feeling.'
    }
  ],
  anchors: [
    { id: 'anc_low', text: 'The lantern is in the poem and the keeper is lonely. The poet uses imagery.', mark: 6 },
    { id: 'anc_high', text: 'By calling the lantern “a small sun nobody asked for”, the poet turns light, usually a comfort, into proof of how far the keeper is from anyone. The metaphor’s smallness against the dark sea makes the loneliness feel enormous.', mark: 17 }
  ]
};

/* ── The fake server ──────────────────────────────────────────────── */

type Student = { id: string; name: string; initials: string };
const STUDENTS: Student[] = [
  ['Ada Lane', 'AL'], ['Tom Tills', 'TT'], ['Bea Marsh', 'BM'], ['Cal Ferris', 'CF'], ['Dot Quill', 'DQ'], ['Eli Rook', 'ER'],
  ['Fay Moss', 'FM'], ['Gus Penn', 'GP'], ['Hal Wren', 'HW'], ['Ivy Stone', 'IS'], ['Jo Pike', 'JP'], ['Kit Vale', 'KV']
].map(([name, initials], i) => ({ id: `stu_${i + 1}`, name: name!, initials: initials! }));

const ANSWERS: Array<[string, number]> = [
  ['The lantern “burns for no ship”, so its light goes out to nobody. That mirrors the keeper, who looks after a world that never looks back. The wasted light makes the loneliness feel like work.', 1.6],
  ['The lantern is lonely like the keeper. The poet shows this with imagery.', -1.4],
  ['Repeating “still it burns” makes the lantern stubborn. The keeper is the same: he keeps going alone. The repetition slows the poem down like a long night.', 1.1],
  ['The keeper lights the lantern every night. This shows he is lonely because nobody comes.', -0.6],
  ['The lantern is “a small sun nobody asked for”. The word “small” against the huge sea shows how little the keeper matters to the world, which is why he feels alone.', 1.3],
  ['The poem is about a lighthouse keeper who is lonely. The lantern is a symbol.', -1.1],
  ['The light “reaches the edge of the map and stops”, which suggests the keeper’s world has a limit. Past it is everyone else.', 0.7],
  ['I think the lantern shows loneliness because it is on its own at the top of the tower.', -0.3],
  ['The lantern is compared to a heart that keeps beating. It keeps the keeper company, so it shows he has nobody else.', 0.4],
  ['The poet uses personification. The lantern “waits” like a person. This shows the keeper waits too.', 0.2],
  ['The lantern is bright and the sea is dark. This contrast shows the keeper is different from everything around him.', 0.0],
  ['The keeper is lonely and the lantern helps him. The poem is sad.', -0.9]
];

type PoolItem = { text: string; kind: 'student' | 'anchor'; ref: string; quality: number };
const pool: Record<string, PoolItem> = {};
STUDENTS.forEach((s, i) => (pool[`a${(i + 1).toString(16).padStart(12, '0')}`] = { text: ANSWERS[i]![0], kind: 'student', ref: s.id, quality: ANSWERS[i]![1] }));
cj.content.anchors.forEach((a, i) => (pool[`b${(i + 1).toString(16).padStart(12, '0')}`] = { text: a.text, kind: 'anchor', ref: a.id, quality: a.mark! >= 10 ? 1.5 : -1.5 }));

type Judgement = { left: string; right: string; winner: string; chips: { left: number[]; right: number[] }; reason: string; at: string };
type Judge = { calibration: Array<{ id: string; choice: string }>; prediction: string | null; judgements: Judgement[]; reflection: string | null };
const judges = new Map<string, Judge>();
const emptyJudge = (): Judge => ({ calibration: [], prediction: null, judgements: [], reflection: null });
const round = { open: true, started_at: new Date(Date.now() - 20 * 60_000).toISOString() };
let started = params.get('round') !== 'none';

// Seeded random, so the preview looks the same on each load.
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Ada (stu_1) is the previewing student; the others have judged already. */
const ME = 'stu_1';
if (params.get('seed') !== '0') {
  const ids = Object.keys(pool);
  STUDENTS.slice(1).forEach((s, si) => {
    const j = emptyJudge();
    j.calibration = cj.content.calibration.map((c) => ({ id: c.id, choice: c.better }));
    j.prediction = (['top', 'middle', 'bottom'] as const)[si % 3]!;
    const own = ownItem(s.id);
    const careless = si === 4; // one judge who often goes against the class
    for (let k = 0; k < 6; k += 1) {
      const counts: Record<string, number> = {};
      for (const jj of judges.values()) for (const x of jj.judgements) for (const id of [x.left, x.right]) counts[id] = (counts[id] ?? 0) + 1;
      const pair = choosePair({ items: ids, counts, seen: new Set(j.judgements.map((x) => pairKey(x.left, x.right))), exclude: new Set(own ? [own] : []), rng });
      if (!pair) break;
      const [left, right] = pair;
      const p = 1 / (1 + Math.exp(-(pool[left]!.quality - pool[right]!.quality) * 2));
      const leftWins = careless ? rng() > p : rng() < p;
      const winner = leftWins ? left : right;
      const chipsFor = (won: boolean) => [0, 1, 2, 3].filter((c) => rng() < (won ? 0.55 : 0.2) - c * 0.05);
      j.judgements.push({ left, right, winner, chips: { left: chipsFor(leftWins), right: chipsFor(!leftWins) }, reason: '', at: new Date().toISOString() });
    }
    if (si % 2 === 0) j.reflection = ['Quote the exact words, then say what they make the reader feel.', 'Say which technique it is before I explain it.', 'Link my point back to the keeper being alone.'][si % 3]!;
    judges.set(`s_${s.id}`, j);
  });
}

function ownItem(studentId: string): string | null {
  return Object.keys(pool).find((id) => pool[id]!.kind === 'student' && pool[id]!.ref === studentId) ?? null;
}
const targetFor = (own: string | null) => {
  const m = Object.keys(pool).filter((id) => id !== own).length;
  return Math.min(cj.content.per_student, (m * (m - 1)) / 2);
};

function scale() {
  const ids = Object.keys(pool);
  const weights: Record<string, number> = {};
  const build = () => {
    const out: Array<{ winner: string; loser: string; weight: number; judge: string }> = [];
    for (const [key, j] of judges) {
      const w = (key === 'teacher' ? cj.content.teacher_weight : 1) * (weights[key] ?? 1);
      for (const x of j.judgements) out.push({ winner: x.winner, loser: x.winner === x.left ? x.right : x.left, weight: w, judge: key });
    }
    return out;
  };
  let comparisons = build();
  let fit = fitBradleyTerry(ids, comparisons);
  const infit = judgeFit(comparisons, fit.theta);
  const flagged = flagMisfits(infit);
  if (cj.content.downweight_misfits && flagged.size) {
    for (const key of flagged) weights[key] = 0.5;
    comparisons = build();
    fit = fitBradleyTerry(ids, comparisons);
  }
  const s = ssr(fit.theta, fit.se);
  const half = splitHalf(ids, comparisons, { rng });
  const reliability = { ...reliabilitySignal({ ssr: s, splitHalf: half, comparisons: comparisons.length, items: ids.length }), ssr: s, split_half: half };
  const order = [...ids].sort((a, b) => fit.theta[b]! - fit.theta[a]!);
  const studentOrder = order.filter((id) => pool[id]!.kind === 'student');
  return { ids, fit, comparisons, infit, flagged, weights, reliability, order, studentOrder };
}

function nextPairFor(key: string, own: string | null) {
  const sc = scale();
  const counts: Record<string, number> = {};
  for (const c of sc.comparisons) for (const id of [c.winner, c.loser]) counts[id] = (counts[id] ?? 0) + 1;
  const j = judges.get(key) ?? emptyJudge();
  const pair = choosePair({ items: sc.ids, theta: sc.fit.theta, counts, seen: new Set(j.judgements.map((x) => pairKey(x.left, x.right))), exclude: new Set(own ? [own] : []) });
  return pair ? { left: { id: pair[0], text: pool[pair[0]]!.text }, right: { id: pair[1], text: pool[pair[1]]!.text } } : null;
}

function studentState() {
  const j = judges.get(`s_${ME}`) ?? emptyJudge();
  const own = ownItem(ME);
  const target = targetFor(own);
  const cal = cj.content.calibration;
  const phase = !started || !round.open ? 'closed'
    : j.calibration.length < cal.length ? 'calibrate'
    : own && !j.prediction ? 'predict'
    : j.judgements.length < target ? 'judge'
    : j.reflection === null ? 'reflect' : 'done';
  const state: Record<string, unknown> = { need: null, initials: 'AL', phase, target, done_count: j.judgements.length, has_answer: !!own };
  if (phase === 'calibrate') {
    const index = j.calibration.length;
    state.calibration = { index, total: cal.length, left: cal[index]!.left, right: cal[index]!.right };
  }
  if (cj.content.show_third && own) {
    const sc = scale();
    if (sc.reliability.level !== 'keep') state.third = thirdOf(sc.studentOrder.indexOf(own), sc.studentOrder.length);
  }
  return state;
}

function teacherStatus() {
  return {
    round: started ? { open: round.open, started_at: round.started_at, pool_size: Object.keys(pool).length, anchors: cj.content.anchors.length } : null,
    progress: STUDENTS.map((s) => {
      const j = judges.get(`s_${s.id}`) ?? emptyJudge();
      const own = ownItem(s.id);
      return { student_id: s.id, name: s.name, initials: s.initials, has_answer: !!own, judged: j.judgements.length, target: targetFor(own), calibrated: j.calibration.length >= cj.content.calibration.length, predicted: !!j.prediction, reflected: j.reflection !== null };
    })
  };
}

function results() {
  const sc = scale();
  const byId = new Map(STUDENTS.map((s) => [s.id, s]));
  const wins: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of sc.comparisons) {
    wins[c.winner] = (wins[c.winner] ?? 0) + 1;
    for (const id of [c.winner, c.loser]) counts[id] = (counts[id] ?? 0) + 1;
  }
  const items = sc.order.map((id, i) => {
    const item = pool[id]!;
    const row: Record<string, unknown> = { id, text: item.text, kind: item.kind };
    if (item.kind === 'student') Object.assign(row, { name: byId.get(item.ref)!.name, initials: byId.get(item.ref)!.initials });
    else row.anchor_mark = cj.content.anchors.find((a) => a.id === item.ref)?.mark ?? null;
    return { ...row, theta: sc.fit.theta[id], se: sc.fit.se[id], wins: wins[id] ?? 0, comparisons: counts[id] ?? 0, rank: i + 1 };
  });
  const card = (id: string) => ({ id, text: pool[id]!.text });
  const pair = contestedPair(sc.comparisons, sc.fit.theta);
  const allJudgements = [...judges.values()].flatMap((j) => j.judgements);
  const points = Object.entries(pool).filter(([, x]) => x.kind === 'anchor').map(([id, x]) => ({ theta: sc.fit.theta[id]!, mark: cj.content.anchors.find((a) => a.id === x.ref)?.mark ?? NaN }));
  const line = fitMarks(points);
  const by_student: Record<string, number> = {};
  if (line) for (const [id, x] of Object.entries(pool)) if (x.kind === 'student') by_student[x.ref] = markFor(line, sc.fit.theta[id]!, cj.content.out_of);
  const predictions: unknown[] = [];
  const reflections: unknown[] = [];
  for (const s of STUDENTS) {
    const j = judges.get(`s_${s.id}`);
    const own = ownItem(s.id);
    if (j?.prediction && own) predictions.push({ name: s.name, predicted: j.prediction, actual: thirdOf(sc.studentOrder.indexOf(own), sc.studentOrder.length) });
    if (j?.reflection) reflections.push({ name: s.name, text: j.reflection });
  }
  return {
    items,
    reliability: sc.reliability,
    judges: [...judges.entries()].map(([key, j]) => ({ key, name: key === 'teacher' ? 'Teacher' : byId.get(key.slice(2))?.name ?? '?', judged: j.judgements.length, infit: sc.infit[key]?.infit ?? null, flagged: sc.flagged.has(key), weight: sc.weights[key] ?? 1 })),
    chips: chipStats(allJudgements, cj.content.chips),
    contested: pair ? { left: card(pair.a), right: card(pair.b), split: pair.split } : null,
    exemplars: sc.studentOrder.slice(0, 3).map(card),
    predictions,
    reflections,
    marks: line ? { a: line.a, b: line.b, out_of: cj.content.out_of, by_student } : null
  };
}

class Reject extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function addJudgement(key: string, body: Record<string, unknown>): void {
  const j = judges.get(key) ?? emptyJudge();
  const left = String(body.left);
  const right = String(body.right);
  if (j.judgements.some((x) => pairKey(x.left, x.right) === pairKey(left, right))) throw new Reject(409, 'seen', 'You’ve judged this pair already.');
  j.judgements.push({ left, right, winner: String(body.winner), chips: (body.chips as Judgement['chips']) ?? { left: [], right: [] }, reason: String(body.reason ?? ''), at: new Date().toISOString() });
  judges.set(key, j);
}

function studentAction(body: Record<string, unknown>): unknown {
  const key = `s_${ME}`;
  const j = judges.get(key) ?? emptyJudge();
  judges.set(key, j);
  const own = ownItem(ME);
  switch (body.action) {
    case 'status':
    case 'claim':
      return studentState();
    case 'calibrate': {
      const pick = cj.content.calibration[Number(body.index)]!;
      if (j.calibration.length === Number(body.index)) j.calibration.push({ id: pick.id, choice: String(body.choice) });
      return { ...studentState(), teacher: pick.better, reason: pick.reason };
    }
    case 'predict':
      j.prediction = String(body.third);
      return studentState();
    case 'next': {
      const target = targetFor(own);
      return { pair: j.judgements.length < target * 2 ? nextPairFor(key, own) : null, done_count: j.judgements.length, target, phase: studentState().phase };
    }
    case 'judge':
      addJudgement(key, body);
      return studentState();
    case 'reflect':
      j.reflection = String(body.text);
      return studentState();
  }
  throw new Reject(400, 'bad_action', 'Unknown action.');
}

function teacherAction(body: Record<string, unknown>): unknown {
  switch (body.action) {
    case 'classes':
      return { classes: [{ id: CLASS, title: '10 English Blue' }, { id: 'class_demo_2', title: '10 English Gold' }] };
    case 'status':
      return teacherStatus();
    case 'start':
      if (started) throw new Reject(409, 'started', 'Judging has already started for this class. Use Refresh pool to add late answers.');
      started = true;
      round.open = true;
      return teacherStatus();
    case 'refresh':
      return teacherStatus();
    case 'close':
    case 'open':
      round.open = body.action === 'open';
      return teacherStatus();
    case 'next':
      return { pair: nextPairFor('teacher', null), done_count: judges.get('teacher')?.judgements.length ?? 0 };
    case 'judge':
      addJudgement('teacher', body);
      return { done_count: judges.get('teacher')!.judgements.length };
    case 'results':
      return results();
    case 'display': {
      const r = results();
      return { contested: r.contested ? { left: r.contested.left, right: r.contested.right } : null, exemplars: r.exemplars };
    }
    case 'push_marks': {
      const r = results();
      return { column_id: 'col_demo', count: Object.keys(r.marks?.by_student ?? {}).length };
    }
  }
  throw new Reject(400, 'bad_action', 'Unknown action.');
}

const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const path = url.pathname;
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  const handler = path.startsWith('/api/published/comparative-judgement/') ? studentAction : path.includes('/comparative-judgement/') ? teacherAction : null;
  if (!handler) {
    if (path === '/api/published/lessons/lesson_demo') return reply(200, { ok: true, data: { classes: [{ id: CLASS }] } });
    return realFetch(input, init);
  }
  await new Promise((r) => setTimeout(r, 150));
  try {
    return reply(200, { ok: true, data: handler(body) });
  } catch (error) {
    if (error instanceof Reject) return reply(error.status, { ok: false, error: { code: error.code, message: error.message } });
    throw error;
  }
};

/* ── The page ─────────────────────────────────────────────────────── */

const mount = document.getElementById('mount')!;
const nav = document.createElement('p');
const link = (v: string) => {
  const q = new URLSearchParams(location.search);
  q.set('view', v);
  return `?${q}`;
};
nav.innerHTML = ['editor', 'teacher', 'student', 'display', 'print'].map((v) => `<a href="${link(v)}">${v[0]!.toUpperCase()}${v.slice(1)}</a>`).join(' · ');

const OTHER_LESSONS = [{ id: 'lesson_other', title: 'Week 2: The Lantern Keeper, second reading' }];
if (view === 'editor') {
  const panel = document.createElement('pre');
  panel.style.cssText = 'font-size:11px;max-height:14rem;overflow:auto;background:#f4f4f4;padding:8px;white-space:pre-wrap';
  const show = () => (panel.textContent = JSON.stringify(cj.content, null, 1));
  show();
  const editor = createComparativeJudgementEditor(cj, (next) => {
    cj = next;
    show();
  }, {
    lessonId: LESSON,
    getLessonBlocks: () => [question, cj],
    loadUnitLessons: async () => OTHER_LESSONS,
    loadLessonBlocks: async () => [question]
  });
  mount.replaceChildren(nav, editor, panel);
} else {
  const shown = view === 'student' ? (filterBlocksForStudent([cj as Block])[0] as Block) : (cj as Block);
  const mode = view === 'display' ? 'teacher' : view;
  const parts: HTMLElement[] = [nav];
  if (view === 'student') parts.push(renderBlock(question, 'student', { lessonId: LESSON, classId: CLASS }));
  parts.push(renderBlock(shown, mode, { lessonId: LESSON, classId: CLASS, display: view === 'display' }));
  mount.replaceChildren(...parts);
}

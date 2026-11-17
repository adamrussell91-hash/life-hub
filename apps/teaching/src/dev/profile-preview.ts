import { renderProfile, type ProfilePayload } from '@/student/profile-view';
import type { NetworkLine } from '@/schemas/block';
import type { ReturnedItem } from '@/progress/types';
import type { PiecePayload } from '@/student/returned-view';
import { renderSharePage } from '@/student/share-view';
import '../styles/app.css';

/**
 * Student My progress preview with an invented student, unit and feedback. Open the dev server
 * at /profile-preview.html; add ?teacher=1 for the teacher's view of the same page. No server.
 */

const CLASS = 'class_demo';
const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', short: 'UND', colour: 'wave', meaning: 'Knowing what the texts say, how they say it, and what they show about people.' },
  { id: 'resp', mode: 'train', name: 'Responding', short: 'RESP', colour: 'wave' },
  { id: 'pers', mode: 'metro', name: 'Perspective', short: 'PERS', colour: 'lilac', meaning: 'The point of view a text comes from, and how it shapes what we see.' },
  { id: 'rep', mode: 'metro', name: 'Representation', short: 'REP', colour: 'sage', meaning: 'How a composer shows people, places and experiences in a particular way.' },
  { id: 'read', mode: 'light_rail', name: 'Reading', short: 'READ', colour: 'amber', meaning: 'Reading closely to name techniques, explain effects and work out what a text suggests.' },
  { id: 'arg', mode: 'light_rail', name: 'Arguing', short: 'ARG', colour: 'peach', meaning: 'Building an argument that answers the question.' }
];
const LESSONS = [
  { id: 'l1', title: 'Harbour poems', line_stops: [{ line_id: 'und' }, { line_id: 'rep' }] },
  { id: 'l2', title: 'Salt and stone', line_stops: [{ line_id: 'pers' }, { line_id: 'read' }] },
  { id: 'l3', title: 'Lighthouse talk', line_stops: [{ line_id: 'resp' }, { line_id: 'rep' }, { line_id: 'arg' }] },
  { id: 'l4', title: 'Tidewater review', line_stops: [{ line_id: 'und' }, { line_id: 'read' }] },
  { id: 'l5', title: 'Inland roads', line_stops: [{ line_id: 'pers' }, { line_id: 'arg' }] }
];
const pieces = [
  { id: 'w:l1:a', label: 'Harbour poems', date: '3 Nov', kind: 'written' as const },
  { id: 'w:l1:b', label: 'Harbour poems Q2', date: '4 Nov', kind: 'written' as const },
  { id: 'v:l3:a', label: 'Lighthouse talk', date: '5 Nov', kind: 'viva' as const },
  { id: 'w:l2:a', label: 'Salt and stone', date: '6 Nov', kind: 'written' as const },
  { id: 'w:l4:a', label: 'Tidewater review', date: '9 Nov', kind: 'written' as const },
  { id: 'w:l4:b', label: 'Tidewater review Q3', date: '10 Nov', kind: 'written' as const }
];
const rungs = (a: string, b: string, c: string, d: string) => ({ capable: a, skilled: b, accomplished: c, excellent: d });

const payload: ProfilePayload = {
  need: null,
  initials: 'QZ',
  unseen: 0,
  pieces,
  outcomes: [],
  concepts: [{ key: 'concept:pers', name: 'Perspective', sub: 'Concept', cells: [null, null, null, 'building', null, 'secure'], now: 'secure', story: { kind: 'now', step: 'secure' }, looks: null }],
  next: [{ code_id: 'c1', code: 'T', colour: 'blue', positive: false, hit: 2, of: 6, action: 'Name the exact technique before you say its effect.' }],
  skills: [
    { strand: 'Reading', rows: [
      { key: 'skill:reading.tech', name: 'Technique and effect', counts: { below: 0, capable: 0, skilled: 0, accomplished: 0, excellent: 1 }, now: 'excellent', story: { kind: 'now', step: 'excellent' }, i_can: null, next_move: null, next_rung: null, rungs: rungs('Name a technique and say what it shows.', 'Quote a short phrase, name its technique and explain its effect.', 'Link a technique’s effect to the key idea in the question.', 'Show how two techniques work together and what the reader feels as a result.'), refine: 'Rewrite your answer in fewer words.' },
      { key: 'skill:reading.infer', name: 'Inferring the implied', counts: { below: 0, capable: 1, skilled: 1, accomplished: 0, excellent: 0 }, now: 'skilled', first: 'capable', story: { kind: 'now', step: 'skilled' }, i_can: 'Infer a feeling or attitude from a detail in the text.', next_move: 'Name the value behind that attitude, and say who holds power in the moment.', next_rung: 'accomplished', rungs: rungs('Say what literally happens in a passage.', 'Infer a feeling or attitude from a detail in the text.', 'Infer the values in a text and link them to who holds power.', 'Explain what a text leaves unsaid and why.') }
    ] },
    { strand: 'Arguing', rows: [
      { key: 'skill:arguing.evidence', name: 'Evidence', counts: { below: 1, capable: 0, skilled: 0, accomplished: 0, excellent: 0 }, now: 'below', story: { kind: 'now', step: 'below' }, i_can: null, next_move: 'Put the quotation inside your own sentence. Cut it to the 2 to 5 words you analyse.', next_rung: 'capable', rungs: rungs('Support a claim with a quotation and name a technique in it.', 'Quote short evidence inside my own sentence.', 'Choose evidence where two techniques work together.', 'Build a pattern of evidence from across the text.') }
    ] }
  ],
  codes: [],
  focus: { kind: 'do', line: 'After “this shows”, add a sentence starting “This matters because”.' },
  feedback: {
    pieces,
    rows: [
      { code_id: 'c1', code: 'T', label: 'Techniques', colour: 'blue', positive: false, cells: [0, 1, null, 0, 1, 0], hit: 2, of: 5, total: 2, trend: 'steady', do: 'Name the exact technique before you say its effect.', hits: [
        { piece_id: 'w:l4:a', title: 'Tidewater review', date: '9 Nov', words: 'the poem feels cold and lonely', note: 'Which technique makes it cold?' },
        { piece_id: 'w:l1:b', title: 'Harbour poems Q2', date: '4 Nov', words: 'it uses imagery', note: null }
      ] },
      { code_id: 'c2', code: 'AD', label: 'Analysis: depth', colour: 'lilac', positive: false, cells: [0, 0, 0, 0, 0, 1], hit: 1, of: 6, total: 1, trend: 'new', do: 'After “this shows”, add a sentence starting “This matters because”.', hits: [
        { piece_id: 'w:l4:b', title: 'Tidewater review Q3', date: '10 Nov', words: 'this shows the speaker is sad', note: 'Go one step further.' }
      ] },
      { code_id: 'c3', code: 'E', label: 'Evidence', colour: 'blue', positive: true, cells: [1, 1, 0, 1, 0, 1], hit: 4, of: 6, total: 4, trend: 'steady', do: 'Keep quotes this short.', hits: [
        { piece_id: 'w:l4:b', title: 'Tidewater review Q3', date: '10 Nov', words: '“grey water knits”', note: 'Short and well chosen.' }
      ] }
    ]
  },
  map: {
    lessons: LESSONS.map((l, i) => ({ id: l.id, title: l.title, role: 'core' as const, kind: 'lesson' as const, done: i < 2 })),
    next: 'l3',
    unit: { content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Assessment task' } }, lines: LINES, lessons: LESSONS, schedule: [], pre: [] }
  },
  todo: {
    countdowns: [{ title: 'Coastal poetry viva', lesson_id: 'l9', assessment: true, due_date: day(13), due_time: '13:24', set_date: '', published: false }],
    announcements: [],
    viva_practice: { spontaneous: { lesson_id: 'l7', title: 'Viva Voce Practice 2' }, prepared: { lesson_id: 'l6', title: 'Viva Voce Practice 1' } },
    practice: { today: 12, answered: 0 },
    waiting: [],
    boxes: [
      {
        key: 'now',
        items: [
          { id: 'w:l4:b', title: 'Tidewater review Q3', kind: 'feedback', done: false, reason: 'New feedback', feedback: { state: 'new', kind: 'written', date: '10 Nov' } },
          { id: 'l3', title: 'Lighthouse talk', kind: 'lesson', done: false, reason: 'For your viva' },
          { id: 'l2', title: 'Salt and stone', kind: 'lesson', done: true, reason: '' }
        ]
      },
      { key: 'next', items: [{ id: 'l5', title: 'Inland roads', kind: 'lesson', done: false, reason: 'Next in the unit' }] }
    ],
    more: 0
  },
  // ?pointer=off: the student said "Don't show this again".
  pointer: new URLSearchParams(location.search).get('pointer') !== 'off'
};

/** Returned work, newest first: written, spoken and short answer, two on one day, two still to open. */
const RETURNED: ReturnedItem[] = [
  { id: 'w:l4:b', kind: 'written', title: 'Tidewater review Q3', date: '10 Nov', day: '2026-11-10', new: true, codes: ['c2', 'c3'], work: ['c2'], good: ['c3'], verdict: { kind: 'better' } },
  { id: 'v:l4', kind: 'viva', title: 'Tidewater viva practice', date: '10 Nov', day: '2026-11-10', new: true, codes: ['c1'], work: ['c1'], good: [], verdict: { kind: 'same' } },
  { id: 'w:l4:a', kind: 'written', title: 'Tidewater review', date: '9 Nov', day: '2026-11-09', new: false, codes: ['c1', 'c3'], work: ['c1'], good: ['c3'], verdict: { kind: 'mixed' } },
  { id: 'q:l3', kind: 'quiz', title: 'Techniques quiz', date: '6 Nov', day: '2026-11-06', new: false, codes: [], work: [], good: [], verdict: { kind: 'counts', good: 3, work: 1 } },
  { id: 'w:l1:b', kind: 'written', title: 'Harbour poems Q2', date: '4 Nov', day: '2026-11-04', new: false, codes: ['c1', 'c3'], work: ['c1'], good: ['c3'], verdict: { kind: 'same' } },
  { id: 'v:l1', kind: 'viva', title: 'Harbour viva practice', date: '30 Oct', day: '2026-10-30', new: false, codes: ['c3'], work: [], good: ['c3'], verdict: { kind: 'first' } },
  { id: 'w:l1:a', kind: 'written', title: 'Harbour poems Q1', date: '28 Oct', day: '2026-10-28', new: false, codes: [], work: [], good: [], verdict: { kind: 'first' } }
];
const PIECE: PiecePayload = {
  id: 'w:l4:b', kind: 'written', title: 'Tidewater review Q3', date: '10 Nov', comment: 'Your quote does real work here. Now say why it matters.',
  text: { answers: { q3: 'The poet writes “grey water knits” to show the harbour at dusk. This shows the speaker is sad.' } },
  tags: [
    { code_id: 'c3', part: 'answers', field: 'q3', start: 16, end: 35, positive: true, code: 'E', label: 'Evidence', colour: 'blue', action: 'Keep quotes this short.', note: 'Short and well chosen.' },
    { code_id: 'c2', part: 'answers', field: 'q3', start: 64, end: 94, positive: false, code: 'AD', label: 'Analysis: depth', colour: 'lilac', action: 'After “this shows”, add a sentence starting “This matters because”.', note: 'Go one step further.' }
  ],
  criteria: [{ label: 'Analysis', step: 'building', was: 'building' }, { label: 'Evidence', step: 'secure', was: 'building' }],
  verdict: { kind: 'better', up: ['Evidence'], same: ['Analysis'], down: [] },
  rubric: { next_step: 'After “this shows”, add a sentence starting “This matters because”.', skills: [{ ref: 'arguing.evidence', name: 'Evidence', rung: 'capable' }] }
};

const query = new URLSearchParams(location.search);
const teacher = query.has('teacher');
// ?share=1: the Progress share page a parent or pastoral teacher sees, built on the same payload.
if (query.has('share')) {
  const token = 'Demo_share_token_0000000';
  const { initials: _i, code: _c, pointer: _p, unseen: _u, ...profile } = payload;
  document.getElementById('mount')!.append(
    renderSharePage(
      {
        student: { first_name: 'Quinn' },
        class_title: '10 English',
        viewer_initials: 'PT',
        lesson_ids: LESSONS.map((l) => l.id),
        ticks: [
          { lesson_id: 'l2', title: 'Salt and stone', at: `${day(-1)}T00:12:00Z`, via: 'tick', record: [{ at: `${day(-1)}T00:12:00Z`, kind: 'tick' }] },
          { lesson_id: 'l1', title: 'Harbour poems', at: `${day(-6)}T01:02:00Z`, via: 'quiz', record: [{ at: `${day(-6)}T01:02:00Z`, kind: 'quiz' }] }
        ],
        bursts: [],
        profile
      },
      { token, today: day(0), onSignOut: () => console.info('Preview: sign out') }
    )
  );
} else document.getElementById('mount')!.append(
  renderProfile(payload, {
    classId: CLASS,
    ...(teacher ? { teacher: { name: 'Quinn Zephyr' } } : {}),
    loadReturned: () => Promise.resolve(RETURNED),
    pointerOff: () => console.info('Preview: pointer turned off'),
    loadPiece: (id) => Promise.resolve({ ...PIECE, id, title: RETURNED.find((r) => r.id === id)?.title ?? PIECE.title })
  })
);

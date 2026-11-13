import { renderProfile, type ProfilePayload } from '@/student/profile-view';
import type { NetworkLine } from '@/schemas/block';
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
      { key: 'skill:reading.infer', name: 'Inferring the implied', counts: { below: 0, capable: 0, skilled: 1, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'now', step: 'skilled' }, i_can: 'Infer a feeling or attitude from a detail in the text.', next_move: 'Name the value behind that attitude, and say who holds power in the moment.', next_rung: 'accomplished', rungs: rungs('Say what literally happens in a passage.', 'Infer a feeling or attitude from a detail in the text.', 'Infer the values in a text and link them to who holds power.', 'Explain what a text leaves unsaid and why.') }
    ] },
    { strand: 'Arguing', rows: [
      { key: 'skill:arguing.evidence', name: 'Evidence', counts: { below: 1, capable: 0, skilled: 0, accomplished: 0, excellent: 0 }, now: 'below', story: { kind: 'now', step: 'below' }, i_can: null, next_move: 'Put the quotation inside your own sentence. Cut it to the 2 to 5 words you analyse.', next_rung: 'capable', rungs: rungs('Support a claim with a quotation and name a technique in it.', 'Quote short evidence inside my own sentence.', 'Choose evidence where two techniques work together.', 'Build a pattern of evidence from across the text.') }
    ] }
  ],
  codes: [],
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
          { id: 'l3', title: 'Lighthouse talk', kind: 'lesson', done: false, reason: 'For your viva' }
        ]
      },
      { key: 'next', items: [{ id: 'l5', title: 'Inland roads', kind: 'lesson', done: false, reason: 'Next in the unit' }] }
    ],
    more: 0
  },
  // ?pointer=off: the student said "Don't show this again".
  pointer: new URLSearchParams(location.search).get('pointer') !== 'off'
};

const teacher = new URLSearchParams(location.search).has('teacher');
document.getElementById('mount')!.append(
  renderProfile(payload, {
    classId: CLASS,
    ...(teacher ? { teacher: { name: 'Quinn Zephyr' } } : {}),
    loadReturned: () => Promise.resolve([]),
    pointerOff: () => console.info('Preview: pointer turned off'),
    loadPiece: () => Promise.reject(new Error('Preview: no server.'))
  })
);

import { mountToMarkPage } from '@/marking/to-mark-flow';
import '../styles/app.css';
import '@/blocks/voice.css';

/** To mark flow preview with an in-page fake server: every kind of work, and an AI read that answers at once. Invented data only. */

const codes = [
  { id: 'comp_ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with your argument.' },
  { id: 'comp_ar', code: 'AR', label: 'Relevance', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Link to the question.' },
  { id: 'comp_e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Quote the text.' },
  { id: 'comp_t', code: 'T', label: 'Techniques', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Name the technique.' },
  { id: 'comp_ex', code: 'EX', label: 'Expression', group: 'composition', criterion: 3, colour: 'gold', descriptor: 'Say it plainly.' },
  { id: 'speak_fw', code: 'FW', label: 'Filler word', group: 'speaking', criterion: null, colour: 'peach', descriptor: 'Pause instead.', key: '1' }
];
const CLASS = 'class_demo';
const roster = [{ id: 'st_js', initials: 'JS', name: 'Jo Sample' }, { id: 'st_rk', initials: 'RK', name: 'Ray Kent' }, { id: 'st_ev', initials: 'EV', name: 'Eve Vale' }];
const TAKE = 'So, um, I think the form is doing a lot of the work. In the road poem he goes from long prose into a haiku at the end, and in the river poem he borrows an American story. The prose keeps you moving like traffic, then the haiku just stops you on one image. And that shape is a bit like him, two cultures joined together.';
const CHECKS = ['Names two poems and a form choice in each', 'Says how each form choice acts out the experience', 'Compares what one poem does that the other does differently'];
const block = {
  id: 'blk_viva', type: 'block', block_type: 'audio', variant: 'medium', visibility: 'all',
  content: { url: '', mode: 'respond', prompt: 'How is the hybrid nature of both form and identity in the poetry represented and used?' },
  settings: { deep_step: { du: 'du_hybform', step: '3' }, deep_targets: ['kp_hf01', 'kp_hf02'], deep_checks: CHECKS }
};
const unit = { deep_understandings: [{ id: 'du_hybform', pieces: [{ id: 'kp_hf01', text: 'Form can act out the experience', tier: 'essential' }, { id: 'kp_hf02', text: 'A haibun joins prose to a haiku', tier: 'essential' }] }] };
const takes = new Map(['vs_js', 'vs_rk'].map((id, i) => {
  const words = TAKE.split(' ');
  return [id, {
    id, initials: roster[i]!.initials, device_hash: 'a1b2c3', submitted_at: '2026-11-01T02:00:00Z', audio_delete_after: '2026-12-01T00:00:00Z', duration_s: 60, status: 'new', transcript_status: 'done', points: [], tags: [] as unknown[], comment: '', audio_url: null,
    classes: [{ id: CLASS, title: '12ENX', students: roster }], class_id: CLASS, student_id: roster[i]!.id,
    transcript: { text: TAKE, segments: [{ text: TAKE, start: 0, end: 60, words: words.map((word, n) => ({ word, start: (n * 60) / words.length, end: ((n + 1) * 60) / words.length })) }] },
    ai_read: null as unknown
  }];
}));
const question = (id: string, kind: string, marks: number, prompt: string, answers: Record<string, unknown>[]) => ({ id, kind, marks, prompt, answers });
const answer = (s: number, text: string, extra: Record<string, unknown> = {}) => ({ attempt_id: `${'a'.repeat(23)}${s}~1`, student_id: roster[s]!.id, initials: roster[s]!.initials, name: roster[s]!.name, submitted_at: '2026-11-01T01:00:00Z', response: { text }, awarded: null, by: null, ai_ready: true, ...extra });
const WRITTEN = 'Bode says the road is “clearly” a colonial symbol, and that challenges readers who see roads as neutral. Using “clearly” shows she is sure. The poem makes a similar point because the talking never stops, so the past is still being dealt with now.';
let aiDone = false;
const quiz = () => ({
  lesson_id: 'lesson_quiz', title: 'Week 3 Review',
  questions: [
    question('q_short', 'short_answer', 1, 'A haiku compresses an idea into one concrete image. What is the one image here?', [
      answer(0, 'the curve in the road', aiDone ? { ai_ready: false, by: 'ai', awarded: 1, ai: { marks: 1, verdict: 'right', reason: 'Same as the accepted answer.' } } : {}),
      answer(1, 'hell', aiDone ? { ai_ready: false, by: 'ai', awarded: 0, ai: { marks: 0, verdict: 'wrong', reason: 'Names an idea, no image.' } } : {}),
      answer(2, 'a vagabond walking', aiDone ? { ai_ready: false, ai: { marks: null, verdict: 'unsure', reason: 'Names a figure; the line’s image is the curve.' } } : {})
    ]),
    question('q_written', 'extended_response', 4, 'Justify how the critic’s claims affirm or challenge a reader’s relationship with the past.', [
      answer(0, WRITTEN, aiDone ? { ai_ready: false, ai: { marks: null, suggested: 3, reason: 'Uses a judging word and links to the poem. The link to the reader stays general.', feedback: 'You name a judging word and show what it does. Next, say what this asks of the reader.', tags: [{ code_id: 'comp_e', quote: 'Using “clearly” shows she is sure', why: 'Names the judging word and what it does' }, { code_id: 'comp_ar', quote: 'the past is still being dealt with now', why: 'Close to the question, but says no more about the reader' }] } } : {})
    ])
  ]
});
const queue = () => {
  const base = { class_id: CLASS, class_title: '12ENX', roster: 3, late: false, oldest_at: '2026-11-01T00:00:00Z' };
  const open = [...takes.values()].filter((t) => t.status !== 'returned');
  return {
    tasks: [
      { ...base, kind: 'voice', what: 'Recordings to return', title: 'Viva Practice 1', lesson_id: 'lesson_viva', block_id: 'blk_viva', waiting: open.length, ai_ready: aiDone ? 0 : open.length, rows: open.map((t) => ({ id: t.id, student_id: t.student_id, initials: t.initials, has_transcript: true, ai_read: aiDone })) },
      { ...base, kind: 'quiz', what: 'Quiz answers to mark', title: 'Week 3 Review', lesson_id: 'lesson_quiz', waiting: 3, rows: [] },
      { ...base, kind: 'piece', what: 'Handed-in work', title: 'Your own road', lesson_id: 'lesson_road', column_id: 'col_road', waiting: 1, rows: [{ student_id: 'st_ev', initials: 'EV' }] },
      { ...base, kind: 'sprint', what: 'Sprint reflections to mark', title: 'Design sprint', lesson_id: 'lesson_sprint', column_id: 'col_sprint', waiting: 1, rows: [{ student_id: 'st_rk', initials: 'RK' }] },
      { ...base, kind: 'handup', what: 'Lecture hand-ups', title: 'Lecture 2', lesson_id: 'lesson_lecture', waiting: 1, rows: [{ id: `${'b'.repeat(24)}~abcdef`, source: 'lecture', initials: 'JS', text: 'Is correlation enough to say one thing causes another if the sample is really big?', scene_label: 'At 4:12' }] }
    ]
  };
};
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const sent: unknown[] = [];
Object.assign(window, { previewSent: sent });
const context = { feedback: null, codes: codes.filter((c) => c.group === 'composition'), recent_codes: [['comp_ex'], ['comp_ex'], ['comp_ex']] };
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const path = url.pathname;
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  if (!path.startsWith('/api/')) return realFetch(input, init);
  if (method !== 'GET') sent.push({ path, body });
  if (path === '/api/feedback-codes') return ok({ codes });
  if (path === '/api/to-mark' && method === 'GET') return ok(queue());
  if (path === '/api/to-mark') {
    if (body.action === 'quiz') return ok(quiz());
    if (body.action === 'answer_load') return ok(context);
    if (body.action === 'answer_save') return ok({ feedback: {} });
    if (body.action === 'sprint') return ok({ ...context, title: 'Design sprint', column_id: 'col_sprint', criteria: [{ id: 'c_tests', text: 'Used what the testers showed', self: 2, self_why: 'we moved the steps' }, { id: 'c_next', text: 'Says what to do next time', self: 3, self_why: '' }], reflection: ['We moved the instructions to the start because three testers got stuck at the same place.', 'Next time we would test earlier.'], quote: '', mark: null });
  }
  if (path === `/api/classes/${CLASS}/pieces`) {
    if (body.action === 'load') return ok({ ...context, column: { id: 'col_road', title: 'Your own road', kind: 'assessment', date: '2026-11-01', weight: 0, criteria: [{ id: 'c_code', label: 'Borrows a code and bends it', outcomes: ['EN12-1'], concepts: [], max: 10 }, { id: 'c_skill', label: 'Crafting language', outcomes: [], concepts: [], max: 10, skill: 'write.craft', skill_name: 'Crafting language' }] }, student: { id: 'st_ev', initials: 'EV', name: 'Eve Vale' }, text: { answers: { q1: 'For new Year 7s. 1. Students must keep to the left, where the lockers lean in close. 2. Students must keep moving. Standing still is loitering, unless you are the right kind of still. 3. The bell is always right.' } }, mark: null, handed_in_at: '2026-11-01T00:00:00Z' });
    return ok({ feedback: {} });
  }
  if (path === '/api/lessons/lesson_viva') return ok({ id: 'lesson_viva', unit_id: 'unit_demo', blocks: [block] });
  if (path === '/api/units/unit_demo') return ok(unit);
  if (path.endsWith('/quiz')) return ok({ attempt: {} });
  if (path.endsWith('/lecture') || path.endsWith('/tutorial')) return ok({});
  if (path.startsWith('/api/classes/') && path.endsWith('/deep')) return ok({ steps: { st_js: { du_hybform: { step: '2b', at: '2026-10-30' } } }, writing: {} });
  if (path.startsWith('/api/classes/')) return ok({ markbook: { marks: {} }, marks: {} });
  if (path === '/api/ai/jobs' || path.includes('/ai-jobs') || path.includes('ai/job')) {
    aiDone = true;
    for (const t of takes.values()) t.ai_read = { checks: [{ met: true, quote: 'In the road poem he goes from long prose into a haiku' }, { met: true, quote: 'keeps you moving like traffic' }, { met: false, why: 'Sets the poems side by side, says what each does' }], pieces: { kp_hf01: true, kp_hf02: false } };
    return ok({ id: 'ai_job_demo', status: 'done', response: 'Done', ai_read: true });
  }
  const voice = /^\/api\/voice\/lesson_viva\/blk_viva\/([^/]+)(\/return)?$/.exec(path);
  if (voice) {
    const take = takes.get(voice[1]!)!;
    if (voice[2]) take.status = 'returned';
    else if (method === 'PUT') Object.assign(take, body);
    return ok(take);
  }
  return ok({});
};

mountToMarkPage(document.getElementById('mount')!);

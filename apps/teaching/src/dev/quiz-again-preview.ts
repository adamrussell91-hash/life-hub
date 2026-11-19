import '../styles/app.css';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { el } from '@/quiz/dom';
import { mountStudentQuiz } from '@/quiz/student-quiz';

/**
 * Dev preview: a handed-in quiz where the teacher sent question 2 back for
 * another go. The student rewrites it right under the question, in the quiz.
 * ?slots=1 answers in place (each question where it sits in the lesson).
 * ?released=0 before marks are shared. Invented data only.
 */
const mount = document.getElementById('mount') as HTMLElement;
const params = new URLSearchParams(location.search);
const inPlace = params.get('slots') === '1';
const released = params.get('released') !== '0';

const q1 = { id: 'q1', kind: 'short_answer', prompt: 'Name the narrator of the story.', marks: 1, has_hint: false };
const q2 = { id: 'q2', kind: 'short_answer', prompt: 'How does the writer show the cost of the journey?', marks: 3, has_hint: false };
let state: 'asked' | 'sent' = 'asked';
let working = '';
const ask = () => ({ id: 'q2', question: q2, state, comment: 'Quote two to five words, name the technique, and say what it shows.' });

const status = () => ({
  version: 'v1', open: true, attempts_allowed: 1, attempts_used: 1, live: false,
  settings: { question_count: 2, total_marks: 4, attempts: 1, feedback: 'end', version: 'v1' },
  questions: [q1, q2],
  identity: { need: null, initials: 'AB' },
  current: null,
  results: [{
    n: 0, submitted_at: '2026-11-18T03:40:07.474Z', released, again: [ask()],
    ...(released ? {
      score: 1, max: 4, pending: 0, keys_shown: true,
      rows: [
        { id: 'q1', question: q1, mark: { score: 1, max: 1, correct: true }, awarded: 1, hinted: false, response: { text: 'The driver' }, key: null },
        { id: 'q2', question: q2, mark: { score: 0, max: 3, correct: false }, awarded: 0, hinted: false, response: { text: '' }, key: null, comment: 'Have a go at this one.' }
      ]
    } : {})
  }]
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('/api/published/quiz/')) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? '{}')) as { action: string; text?: string };
  await new Promise((r) => setTimeout(r, 150));
  const reply = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } });
  if (body.action === 'again_load') return reply({ scope: 'whole', text: { answer: { text: '' } }, prompts: { text: q2.prompt }, working: working ? { answer: { text: working } } : {} });
  if (body.action === 'again_save') { working = body.text ?? ''; return reply({ saved: true, at: new Date().toISOString() }); }
  if (body.action === 'again_send') { state = 'sent'; return reply({ sent: true, at: new Date().toISOString() }); }
  return reply(status());
};

const lesson = { lesson_id: 'lesson_preview', blocks: [], quiz: status().settings } as unknown as PublishedLesson;
const slots = new Map<string, HTMLElement>();
if (inPlace) {
  for (const q of [q1, q2]) {
    const slot = el('div', 'quiz-slot');
    slots.set(q.id, slot);
    mount.append(el('h3', '', `In the lesson: ${q.prompt}`), slot);
  }
  mount.append(el('h3', '', 'End of the lesson'));
}
mount.append(mountStudentQuiz(lesson, { classId: 'class_preview', ...(inPlace ? { slots } : {}) }));

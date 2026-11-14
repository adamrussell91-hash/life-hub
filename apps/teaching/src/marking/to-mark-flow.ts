import { apiGet, apiPost } from '@/api/client';
import { button, el, errorText } from '@/quiz/dom';
import { loadFeedbackCodes } from '@/blocks/feedback-codes';
import { findBlockById } from '@/blocks/find-block';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { mountVoiceTake } from '@/blocks/voice-teacher';
import { httpMarkbookApi } from '@/markbook/api';
import { LEVEL_LABELS } from '@/sprint/schema';
import { markId } from '@/sprint/marking';
import { openMarkPiece, type MarkPieceActions, type MarkPieceData } from './mark-piece';
import { loadRubricSetup, loadUnitRubricSetup } from './rubric-setup';
import { openAddWriting, unitFromApp, writingApi, type AddedSettings } from './add-writing';
import { runAiRead, type AiReadTarget } from './ai-read';
import { FLOW_LABEL, aiReadCount, flowItems, flowLabel, isStacked, type FlowItem, type FlowKind, type PassagePart, type QuizAnswer, type QuizLoad, type QuizQuestion, type QuizResponse } from './to-mark-items';
import { ageText, loadQueue, type ToMarkTask } from './to-mark-view';
import { writingPanel } from '@/quiz/writing-replay';
import '@/quiz/quiz.css';
import './marking.css';

/**
 * The To mark page: everything waiting across every class, one piece of work
 * at a time, with Return and next. Each card uses the marking its kind already
 * has. The AI suggests (dashed); nothing it says counts until the teacher does.
 */

type Card = {
  el: HTMLElement;
  /** Return or save this work. Resolves false when it isn't finished yet, so the flow stays on it. */
  finish?: () => Promise<boolean>;
  /** Going elsewhere: keep what can be kept. A card with `drop` is rebuilt on return. */
  leave?: () => void;
  drop?: boolean;
};

const VERB: Record<FlowKind, string> = { voice: 'Return', quiz: 'Return', writing: 'Return', sprint: 'Return', handup: 'Send reply', ask: 'Done' };
const quizPost = <T>(lessonId: string, body: Record<string, unknown>) => apiPost<T>(`/api/lessons/${encodeURIComponent(lessonId)}/quiz`, body);
const flowPost = <T>(body: Record<string, unknown>) => apiPost<T>('/api/to-mark', body);
const answerText = (r: QuizResponse): string => (r?.gaps ? Object.values(r.gaps).join(' · ') : r?.text ?? '');

/** A sent-back answer's first go and what was said about it, faded beside the new one. */
function firstGo(again: NonNullable<QuizAnswer['again']>): HTMLElement {
  const box = el('div', 'tf-first');
  box.append(el('h3', 'mk-side__title', 'Another go. Their first answer'), el('p', undefined, answerText(again.first ?? null) || '(blank)'));
  if (again.comment) box.append(el('p', 'tf-note', `You said: ${again.comment}`));
  return box;
}

function errorLine(): { line: HTMLElement; show: (e: unknown) => void } {
  const line = el('p', 'tf-error');
  line.setAttribute('role', 'alert');
  line.hidden = true;
  return { line, show: (e) => { line.textContent = typeof e === 'string' ? e : errorText(e, 'That didn’t save. Try again.'); line.hidden = false; } };
}

/* ── Cards ─────────────────────────────────────────────────────────── */

async function voiceCard(item: FlowItem, onGone: () => void): Promise<Card> {
  const lesson = await apiGet<Lesson>(`/api/lessons/${encodeURIComponent(item.task.lesson_id)}`);
  const block = findBlockById(lesson.blocks as Block[], item.task.block_id ?? '');
  if (!block || block.block_type !== 'audio') return { el: el('p', 'tf-note', 'This question is no longer in the lesson.'), drop: true };
  const take = mountVoiceTake(block, item.task.lesson_id, item.row!.id!, onGone);
  const box = el('div');
  const prompt = block.content.prompt?.trim();
  if (prompt) box.append(el('p', 'tf-prompt', prompt));
  box.append(take.el);
  return {
    el: box,
    drop: true,
    leave: () => take.close(),
    finish: async () => {
      const returned = await take.finish();
      if (returned) take.close();
      return returned;
    }
  };
}

type AddedLoad = Omit<MarkPieceData, 'position' | 'column' | 'mark'> & { piece: string; title: string; unit_id: string; settings: AddedSettings };

/** Writing the teacher added onto a student: marked like handed-in writing, with the rubric from its own unit and tags. */
async function addedCard(item: FlowItem): Promise<Card> {
  const { task, row } = item;
  const api = writingApi(task.class_id);
  const call = <T>(body: Record<string, unknown>) => api<T>({ student_id: row!.student_id, piece: row!.id, ...body });
  const data = await call<AddedLoad>({ action: 'load' });
  const rubric = await loadUnitRubricSetup({ unitId: data.unit_id, settings: data.settings as Block['settings'], who: { classId: task.class_id, studentId: row!.student_id! } }, { unit: unitFromApp });
  const view = openMarkPiece({ ...data, column: noColumn(data.title), mark: null, position: { index: 0, total: 1 } }, {
    save: (body) => call({ action: 'save', ...body }),
    returnIt: () => call({ action: 'return' }),
    takeBack: () => call({ action: 'take_back' }),
    move: () => undefined
  }, { embedded: true, rubric });
  return { el: view.el, leave: () => void view.save(), finish: () => view.finish() };
}

async function pieceCard(item: FlowItem): Promise<Card> {
  if (item.task.kind === 'added') return addedCard(item);
  const { task, row } = item;
  const call = <T>(body: Record<string, unknown>) => apiPost<T>(`/api/classes/${encodeURIComponent(task.class_id)}/pieces`, { column_id: task.column_id, student_id: row!.student_id, ...body });
  const data = await call<Omit<MarkPieceData, 'position'>>({ action: 'load' });
  const where = data.column.piece;
  const rubric = where ? await loadRubricSetup({ lessonId: where.lesson_id, blockId: where.block_id, who: { classId: task.class_id, studentId: row!.student_id! } }) : null;
  const view = openMarkPiece({ ...data, position: { index: 0, total: 1 } }, {
    save: (body) => call({ action: 'save', ...body }),
    returnIt: (ask) => call({ action: 'return', ...ask }),
    takeBack: () => call({ action: 'take_back' }),
    move: () => undefined
  }, { embedded: true, rubric, redraft: true });
  return { el: view.el, leave: () => void view.save(), finish: () => view.finish() };
}

/** The offsets of what the AI quoted, for a code it suggests on the student's words. */
function suggestedOn(text: string, part: string, field: string, tags: NonNullable<QuizAnswer['ai']>['tags']) {
  return (tags ?? []).flatMap((t) => {
    const start = text.indexOf(t.quote);
    return start < 0 ? [] : [{ code_id: t.code_id, part, field, start, end: start + t.quote.length, ...(t.why ? { why: t.why } : {}) }];
  });
}

type Loaded = { feedback: MarkPieceData['feedback']; codes: MarkPieceData['codes']; recent_codes: string[][] };

const noColumn = (title: string): MarkPieceData['column'] => ({ id: 'none', title, criteria: [] }) as unknown as MarkPieceData['column'];

async function writtenAnswerCard(item: FlowItem): Promise<Card> {
  const question = item.question!;
  const answer = item.answer!;
  const { task } = item;
  const piece = `q:${task.lesson_id}:${question.id}`;
  const text = answerText(answer.response);
  const parts = { answer: { text } };
  const [loaded, rubric] = await Promise.all([
    flowPost<Loaded>({ action: 'answer_load', class_id: task.class_id, student_id: answer.student_id, piece }),
    loadRubricSetup({ lessonId: task.lesson_id, questionId: question.id, who: { classId: task.class_id, studentId: answer.student_id } })
  ]);

  // The mark. The AI's is dashed, and Return keeps it unless another is pressed.
  let mark: number | null = answer.by === 'teacher' ? answer.awarded : null;
  const fromAi = answer.ai?.marks ?? answer.ai?.suggested ?? null;
  const aside = el('div', 'tf-card');
  const ticks = el('div', 'tf-ticks');
  const paintTicks = (): void => {
    ticks.replaceChildren();
    for (let n = 0; n <= question.marks; n += 1) {
      const on = mark === n;
      const b = el('button', `tf-tick${on ? ' is-on' : mark === null && fromAi === n ? ' is-ai' : ''}`, String(n));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => { mark = n; paintTicks(); });
      ticks.append(b);
    }
    ticks.append(el('span', 'tf-note', `out of ${question.marks}`));
  };
  paintTicks();
  // A tagged question's mark sits in its rubric, suggested from the rungs.
  if (!rubric) aside.append(el('h3', 'mk-side__title', 'Mark'), ticks);
  if (answer.ai) aside.append(el('p', 'mk-ai', `AI suggests ${fromAi ?? 'no mark'}: ${answer.ai.reason} Return keeps it unless you ${rubric ? 'change it' : 'press another'}.`));
  // A flagged answer can be watched being written right here, not only in Results.
  if (answer.writing) aside.append(el('h3', 'mk-side__title', 'How it was written'), writingPanel(answer.writing, answer.writing.log, text));
  if (answer.again?.state === 'sent') aside.append(firstGo(answer.again));
  // Another go: the mark stands until their new answer comes back, then that one is marked.
  const againBox = el('label', 'tf-again-line');
  const againOn = el('input');
  againOn.type = 'checkbox';
  againBox.append(againOn, document.createTextNode(' Ask for another go at this question'));
  aside.append(againBox, el('p', 'tf-note', 'Your comment goes with it. Their mark stays until the new answer is back.'));
  if (question.guide) aside.append(el('p', 'tf-note', `How to mark it: ${question.guide}`));
  if (question.model_answer) aside.append(el('p', 'tf-note', `Model answer: ${question.model_answer}`));

  const { line, show } = errorLine();
  let sent: Parameters<MarkPieceActions['save']>[0] = { tags: [], comment: '', steps: {} };
  const view = openMarkPiece(
    {
      column: noColumn(task.title),
      student: { id: answer.student_id, initials: answer.initials, name: answer.name },
      text: parts,
      feedback: loaded.feedback,
      mark: null,
      codes: loaded.codes,
      recent_codes: loaded.recent_codes,
      position: { index: 0, total: 1 }
    },
    {
      save: async (body) => { sent = body; },
      returnIt: async () => undefined,
      takeBack: async () => undefined,
      move: () => undefined
    },
    {
      embedded: true,
      aside,
      rubric,
      rubricMarks: { max: question.marks, value: mark, ai: fromAi },
      suggested: loaded.feedback ? [] : suggestedOn(text, 'answer', 'text', answer.ai?.tags),
      ...(answer.ai?.feedback && !answer.comment ? { draftComment: answer.ai.feedback } : answer.comment ? { draftComment: answer.comment } : {})
    }
  );
  const box = el('div');
  box.append(view.el, line);
  return {
    el: box,
    finish: async () => {
      const score = (view.rubric ? view.rubric.mark() : mark) ?? fromAi ?? (againOn.checked ? 0 : null);
      if (score === null) { show('Pick a mark first.'); return false; }
      await view.save();
      await quizPost(task.lesson_id, { action: 'mark', attempt_id: answer.attempt_id, question_id: question.id, score, comment: sent.comment });
      const fields = sent.rubric !== undefined ? { rubric: sent.rubric, attempt_id: answer.attempt_id, ...(sent.today ? { today: sent.today } : {}) } : {};
      try {
        const reply = await flowPost({ action: 'answer_save', class_id: task.class_id, student_id: answer.student_id, piece, lesson_id: task.lesson_id, title: task.title, text: parts, tags: sent.tags, comment: sent.comment, ...fields });
        if (againOn.checked) await quizPost(task.lesson_id, { action: 'again_ask', attempt_id: answer.attempt_id, question_id: question.id, comment: sent.comment });
        // A step that stayed practice holds the flow here once, so the teacher reads why.
        return !view.rubric?.applyReply(reply);
      } catch (error) {
        view.rubric?.failed();
        throw error;
      }
    }
  };
}

const gapNumbers = (passage: PassagePart[]): Map<string, number> => {
  const numbers = new Map<string, number>();
  for (const part of passage) if ('gap' in part) numbers.set(part.gap, numbers.size + 1);
  return numbers;
};
const fits = (given: string, accepted: string[]): boolean => accepted.some((x) => x.trim().toLowerCase() === given.trim().toLowerCase());

/** The question itself above the stacked answers: the passage with numbered gaps and their answers, or the accepted answers. */
function questionShown(question: QuizQuestion): HTMLElement {
  const box = el('div', 'tf-question');
  if (question.quote) box.append(el('p', 'tf-note', question.quote));
  if (question.passage) {
    const numbers = gapNumbers(question.passage);
    const p = el('p', 'tf-passage');
    for (const part of question.passage) {
      if ('gap' in part) {
        const gap = el('span', 'tf-gap');
        gap.append(el('b', undefined, String(numbers.get(part.gap))), document.createTextNode(part.answers.join(' / ') || '?'));
        p.append(gap);
      } else p.append(document.createTextNode(part.text));
    }
    box.append(p);
  }
  if (question.accepted?.length) box.append(el('p', 'tf-key', `Accepted: ${question.accepted.join(' / ')}`));
  if (question.looking_for) box.append(el('p', 'tf-key', `Looking for: ${question.looking_for}`));
  if (question.model_answer) box.append(el('p', 'tf-key', `Model answer: ${question.model_answer}`));
  return box;
}

/** One student's gap answers, numbered to match the passage; answers outside the key are flagged. */
function gapAnswers(passage: PassagePart[], gaps: Record<string, string>): HTMLElement {
  const p = el('p', 'tf-gapans');
  const numbers = gapNumbers(passage);
  for (const part of passage) {
    if (!('gap' in part)) continue;
    const given = gaps[part.gap] ?? '';
    const chip = el('span', `tf-gap${given.trim() && fits(given, part.answers) ? '' : ' is-off'}`);
    chip.append(el('b', undefined, String(numbers.get(part.gap))), document.createTextNode(given.trim() || '(blank)'));
    p.append(chip);
  }
  return p;
}

function stackCard(item: FlowItem): Card {
  const question = item.question!;
  const { task } = item;
  const picks = new Map<string, number>();
  /** Answers to send back for another go, with one comment for all of them. */
  const again = new Set<string>();
  const againNote = el('textarea', 'tf-again-note');
  againNote.rows = 2;
  againNote.placeholder = 'What to tell them. They see it with the question.';
  againNote.setAttribute('aria-label', 'Comment for the students you’re asking again');
  const box = el('div', 'tf-card');
  const shown = questionShown(question);
  const paint = (): void => {
    const n = question.answers.length;
    box.replaceChildren(shown, el('h3', 'mk-side__title', `${n} ${n === 1 ? 'answer' : 'answers'} to this question. Tap to decide.`));
    for (const a of question.answers) {
      const row = el('div', 'tf-ans');
      row.append(el('span', 'tf-who', a.initials));
      const p = question.passage && a.response?.gaps ? gapAnswers(question.passage, a.response.gaps) : el('p', undefined, answerText(a.response) || '(blank)');
      if (a.again?.state === 'sent') p.append(el('small', 'tf-first', `Another go. First answer: ${answerText(a.again.first ?? null) || '(blank)'}`));
      if (a.ai) p.append(el('small', undefined, a.ai.reason));
      row.append(p);
      const ticks = el('div', 'tf-ticks');
      const pick = picks.get(a.attempt_id);
      const suggestion = pick === undefined ? a.ai?.marks ?? a.ai?.suggested ?? null : null;
      const options = question.marks === 1 ? [[1, '✓'], [0, '✗']] as const : Array.from({ length: question.marks + 1 }, (_, n) => [n, String(n)] as const);
      for (const [value, label] of options) {
        const on = pick === value;
        const b = el('button', `tf-tick${on ? (value === 0 ? ' is-wrong' : ' is-on') : suggestion === value ? ' is-ai' : ''}`, label);
        b.type = 'button';
        b.setAttribute('aria-label', `${a.initials}: ${value} of ${question.marks}`);
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { picks.set(a.attempt_id, value); paint(); });
        ticks.append(b);
      }
      const asked = again.has(a.attempt_id);
      const redo = el('button', `tf-tick tf-tick--again${asked ? ' is-on' : ''}`, 'Again');
      redo.type = 'button';
      redo.title = 'Ask for another go';
      redo.setAttribute('aria-label', `${a.initials}: ask for another go`);
      redo.setAttribute('aria-pressed', String(asked));
      redo.addEventListener('click', () => { if (asked) again.delete(a.attempt_id); else again.add(a.attempt_id); paint(); });
      ticks.append(redo);
      row.append(ticks);
      box.append(row);
    }
    if (question.answers.some((a) => typeof a.ai?.marks === 'number' && !picks.has(a.attempt_id))) {
      box.append(button('Keep the AI’s clear ones', 'secondary', () => {
        for (const a of question.answers) if (typeof a.ai?.marks === 'number' && !picks.has(a.attempt_id)) picks.set(a.attempt_id, a.ai.marks);
        paint();
      }));
    }
    if (again.size) box.append(el('h3', 'mk-side__title', `Another go for ${again.size === 1 ? '1 student' : `${again.size} students`}`), againNote);
    box.append(line);
  };
  const { line, show } = errorLine();
  paint();
  return {
    el: box,
    finish: async () => {
      for (const a of question.answers.filter((x) => picks.has(x.attempt_id))) {
        await quizPost(task.lesson_id, { action: 'mark', attempt_id: a.attempt_id, question_id: question.id, score: picks.get(a.attempt_id) });
      }
      // An unmarked answer sent back gets 0 for now; its new answer replaces it.
      for (const id of again) await quizPost(task.lesson_id, { action: 'again_ask', attempt_id: id, question_id: question.id, comment: againNote.value });
      const left = question.answers.filter((a) => !picks.has(a.attempt_id) && !again.has(a.attempt_id));
      // Those are sent: the comment box is for the next ones.
      again.clear();
      againNote.value = '';
      if (left.length) {
        question.answers = left;
        show(`Saved. ${left.length === 1 ? '1 answer is' : `${left.length} answers are`} still undecided.`);
        paint();
        return false;
      }
      return true;
    }
  };
}

type SprintLoad = Loaded & {
  title: string;
  column_id: string | null;
  criteria: { id: string; text: string; self: number | null; self_why: string }[];
  reflection: string[];
  quote: string;
  mark: { criteria?: Record<string, number>; feedback?: string } | null;
};

async function sprintCard(item: FlowItem): Promise<Card> {
  const { task, row } = item;
  const studentId = row!.student_id!;
  const piece = `r:${task.lesson_id}`;
  const d = await flowPost<SprintLoad>({ action: 'sprint', class_id: task.class_id, student_id: studentId, lesson_id: task.lesson_id });
  const open = el('a', 'tf-note', 'Open the sprint');
  open.setAttribute('href', `/lessons/${encodeURIComponent(task.lesson_id)}`);
  if (!d.column_id) {
    const box = el('div', 'tf-card');
    box.append(el('p', 'tf-note', 'This sprint has no marking column yet. Press Mark on its Test step once, then its reflections open here.'), open);
    return { el: box };
  }
  const columnId = d.column_id;
  const ladder = LEVEL_LABELS.map((name, i) => [String(i + 1), name] as const);
  const fields = Object.fromEntries(d.reflection.map((text, i) => [`r${i}`, text]));
  if (d.quote) fields.quote = d.quote;
  const parts = { reflection: fields };
  const steps = Object.fromEntries(Object.entries(d.mark?.criteria ?? {}).map(([id, level]) => [id, String(level)]));
  const view = openMarkPiece(
    {
      column: {
        id: columnId,
        title: d.title,
        criteria: d.criteria.map((c) => ({
          id: markId(c.id), label: c.text, outcomes: [], concepts: [], max: 3, ladder,
          ...(c.self ? { self: `They judged: ${LEVEL_LABELS[c.self - 1]}${c.self_why ? `, ${c.self_why}` : ''}` } : {})
        }))
      } as unknown as MarkPieceData['column'],
      student: { id: studentId, initials: row!.initials, name: row!.initials },
      text: parts,
      feedback: d.feedback ?? (d.mark?.feedback ? { tags: [], comment: d.mark.feedback, status: 'draft' } : null),
      mark: { steps },
      codes: d.codes,
      recent_codes: d.recent_codes,
      position: { index: 0, total: 1 }
    },
    {
      save: async (body) => {
        const criteria = Object.fromEntries(Object.entries(body.steps).map(([id, level]) => [id, Number(level)]));
        await httpMarkbookApi.setMark(task.class_id, columnId, studentId, { ...(d.mark ?? {}), criteria, ...(body.comment ? { feedback: body.comment } : {}) });
        await flowPost({ action: 'answer_save', class_id: task.class_id, student_id: studentId, piece, lesson_id: task.lesson_id, title: task.title, text: parts, tags: body.tags, comment: body.comment });
      },
      returnIt: async () => undefined,
      takeBack: async () => undefined,
      move: () => undefined
    },
    { embedded: true }
  );
  return { el: view.el, finish: () => view.finish() };
}

function handupCard(item: FlowItem): Card {
  const { task, row } = item;
  const box = el('div', 'tf-card');
  if (row!.scene_label) box.append(el('p', 'tf-crumb', row!.scene_label));
  box.append(el('p', 'tf-prompt', row!.text ?? ''));
  const reply = el('textarea', 'mk-comment');
  reply.placeholder = 'Your reply';
  reply.setAttribute('aria-label', 'Your reply');
  const { line, show } = errorLine();
  box.append(reply, line);
  return {
    el: box,
    finish: async () => {
      if (!reply.value.trim()) { show('Write a reply first.'); return false; }
      const path = row!.source === 'tutorial' ? 'tutorial' : 'lecture';
      await apiPost(`/api/lessons/${encodeURIComponent(task.lesson_id)}/${path}`, { action: path === 'tutorial' ? 'reply' : 'answer', id: row!.id, reply: reply.value.trim() });
      return true;
    }
  };
}

function askCard(item: FlowItem): Card {
  const box = el('div', 'tf-card');
  const open = el('a', 'btn btn--secondary', 'Answer them in the sprint');
  open.setAttribute('href', item.task.href ?? `/lessons/${encodeURIComponent(item.task.lesson_id)}`);
  box.append(el('p', 'tf-note', `${item.task.who?.join(', ') ?? 'Groups'} asked you something.`), open);
  return { el: box };
}

function buildCard(item: FlowItem, onGone: () => void): Card | Promise<Card> {
  if (item.kind === 'voice') return voiceCard(item, onGone);
  if (item.kind === 'writing') return pieceCard(item);
  if (item.kind === 'sprint') return sprintCard(item);
  if (item.kind === 'handup') return handupCard(item);
  if (item.kind === 'ask') return askCard(item);
  return isStacked(item.question!.kind) ? stackCard(item) : writtenAnswerCard(item);
}

/* ── The page ──────────────────────────────────────────────────────── */

export type FlowLoad = { tasks: ToMarkTask[]; quizzes: Map<string, QuizLoad> };

async function loadAll(): Promise<FlowLoad> {
  const tasks = await loadQueue();
  const quizzes = new Map<string, QuizLoad>();
  await Promise.all(
    tasks.filter((t) => t.kind === 'quiz' && t.waiting > 0).map(async (t) => {
      quizzes.set(`${t.class_id}:${t.lesson_id}`, await flowPost<QuizLoad>({ action: 'quiz', class_id: t.class_id, lesson_id: t.lesson_id }));
    })
  );
  return { tasks, quizzes };
}

export function mountToMarkPage(canvas: HTMLElement, load: () => Promise<FlowLoad> = loadAll): { dispose: () => void } {
  canvas.replaceChildren(el('p', 'tm-sub', 'Loading what is waiting…'));
  let disposed = false;
  let data: FlowLoad = { tasks: [], quizzes: new Map() };
  let items: FlowItem[] = [];
  let at = 0;
  let filter: FlowKind | 'all' = 'all';
  let aiState: 'idle' | 'running' | 'done' = 'idle';
  let aiNote = '';
  const done = new Set<string>();
  const cards = new Map<string, Card>();
  let shownCard: Card | null = null;

  const root = el('section', 'tf');
  const head = el('div', 'tf-head');
  const headRow = el('div', 'tf-head__row');
  const progress = el('div', 'tf-progress');
  const fill = el('i');
  progress.append(fill);
  const count = el('span', 'tf-count');
  const queueToggle = el('button', 'tf-pill tf-queue-toggle', 'Queue');
  queueToggle.type = 'button';
  const addWriting = button('Add writing', 'secondary', () => void addPiece());
  addWriting.classList.add('aw-add');
  addWriting.title = 'Add writing a student gave you outside the app';
  headRow.append(el('h1', 'tf-title', 'To mark'), progress, count, addWriting, queueToggle);
  const pills = el('div', 'tf-pills');
  const ai = el('div', 'tf-ai');
  head.append(headRow, pills, ai);
  const body = el('div', 'tf-body');
  const queue = el('nav', 'tf-queue');
  queue.setAttribute('aria-label', 'Queue');
  const work = el('main', 'tf-work');
  body.append(queue, work);
  const bar = el('div', 'tf-bar');
  const prev = button('Back', 'ghost', () => move(-1));
  prev.append(el('kbd', undefined, '↑'));
  const skip = button('Skip', 'ghost', () => move(1));
  skip.append(el('kbd', undefined, '↓'));
  const go = button('', 'primary', () => void finish());
  go.classList.add('tf-go');
  bar.append(prev, skip, go);
  root.append(head, body, bar);
  queueToggle.addEventListener('click', () => body.classList.toggle('show-queue'));

  const shown = () => items.filter((i) => filter === 'all' || i.kind === filter);
  const current = () => items[at] ?? null;
  const left = (kind: FlowKind | 'all') => items.filter((i) => (kind === 'all' || i.kind === kind) && !done.has(i.key)).reduce((n, i) => n + i.count, 0);

  function leaveCard(): void {
    const key = current()?.key;
    shownCard?.leave?.();
    if (shownCard?.drop && key) cards.delete(key);
    shownCard = null;
  }

  function goTo(index: number): void {
    if (index !== at) leaveCard();
    at = index;
    body.classList.remove('show-queue');
    paint();
    work.scrollTop = 0;
  }

  function move(step: 1 | -1): void {
    const list = shown();
    if (!list.length) return;
    let i = list.indexOf(current()!);
    for (let tries = 0; tries < list.length; tries += 1) {
      i = (i + step + list.length) % list.length;
      if (!done.has(list[i]!.key) || step < 0) { goTo(items.indexOf(list[i]!)); return; }
    }
  }

  async function finish(): Promise<void> {
    const item = current();
    if (!item || done.has(item.key) || go.disabled) return;
    go.disabled = true;
    try {
      const finished = (await shownCard?.finish?.()) ?? true;
      if (finished) completed(item);
    } catch (error) {
      work.prepend(Object.assign(el('p', 'tf-error', errorText(error, 'That didn’t save. Try again.')), { role: 'alert' }));
    } finally {
      go.disabled = false;
    }
  }

  function completed(item: FlowItem): void {
    done.add(item.key);
    shownCard = null;
    cards.delete(item.key);
    if (shown().every((i) => done.has(i.key))) paint();
    else move(1);
  }

  function paintHead(): void {
    const total = items.reduce((n, i) => n + i.count, 0);
    const gone = total - left('all');
    fill.style.width = total ? `${(gone / total) * 100}%` : '0';
    count.textContent = `${gone} of ${total} done`;
    pills.replaceChildren();
    for (const k of ['all', 'voice', 'quiz', 'writing', 'sprint', 'handup', 'ask'] as const) {
      const n = left(k);
      if (k !== 'all' && !items.some((i) => i.kind === k)) continue;
      const b = el('button', 'tf-pill', k === 'all' ? 'Everything' : FLOW_LABEL[k]);
      b.type = 'button';
      b.append(el('small', undefined, String(n)));
      b.setAttribute('aria-pressed', String(filter === k));
      b.addEventListener('click', () => {
        filter = k;
        const list = shown();
        const first = list.find((i) => !done.has(i.key)) ?? list[0];
        if (first) goTo(items.indexOf(first));
        else paint();
      });
      pills.append(b);
    }
    paintAi();
  }

  function paintAi(): void {
    const readable = aiReadCount(data.tasks, data.quizzes);
    ai.className = `tf-ai${aiState === 'done' || (!readable && hasAiWork()) ? ' is-done' : ''}`;
    ai.hidden = !readable && !hasAiWork() && aiState === 'idle';
    ai.replaceChildren();
    if (aiState === 'running') {
      ai.append(el('span', undefined, aiNote || 'AI is reading…'));
    } else if (readable) {
      const line = el('span');
      line.append(el('b', undefined, `${readable} ${readable === 1 ? 'take or answer' : 'takes and answers'}`), document.createTextNode(' can be read by AI before you start.'));
      const run = button('AI read them', 'primary', () => void readAll());
      ai.append(line, run);
    } else {
      ai.append(el('span', undefined, 'AI has read what’s waiting. Its ticks and tags are dashed: yours decide. It never passes a step.'));
    }
    if (aiNote && aiState !== 'running') ai.append(el('span', undefined, aiNote));
  }

  const hasAiWork = (): boolean => [...data.quizzes.values()].some((q) => q.questions.some((x) => x.answers.some((a) => a.ai))) || data.tasks.some((t) => (t.rows as { ai_read?: boolean }[] | undefined)?.some((r) => r.ai_read));

  /** Adds a student's writing, then opens it in the queue to mark. */
  async function addPiece(): Promise<void> {
    const added = await openAddWriting();
    if (!added || disposed) return;
    leaveCard();
    cards.clear();
    data = await load();
    if (disposed) return;
    items = flowItems(data.tasks, data.quizzes);
    filter = 'all';
    const found = items.findIndex((i) => i.row?.id === added.piece);
    at = found >= 0 ? found : Math.max(0, items.findIndex((i) => !done.has(i.key)));
    paint();
  }

  async function readAll(): Promise<void> {
    const targets: AiReadTarget[] = [];
    for (const [key, q] of data.quizzes) if (q.questions.some((x) => x.answers.some((a) => a.ai_ready))) targets.push({ kind: 'quiz', lessonId: key.split(':')[1]! });
    for (const t of data.tasks) if (t.ai_ready && t.block_id) targets.push({ kind: 'voice', lessonId: t.lesson_id, blockId: t.block_id });
    aiState = 'running';
    aiNote = 'AI is reading…';
    paintAi();
    const failed = await runAiRead(targets, (n) => {
      aiNote = `AI is reading… ${n} of ${targets.length} finished`;
      paintAi();
    });
    if (disposed) return;
    const key = current()?.key;
    leaveCard();
    cards.clear();
    data = await load();
    items = flowItems(data.tasks, data.quizzes);
    const again = items.findIndex((i) => i.key === key);
    at = again >= 0 ? again : Math.max(0, items.findIndex((i) => !done.has(i.key)));
    aiState = 'done';
    aiNote = failed ? `${failed} couldn’t be read. Press again to retry.` : '';
    paint();
  }

  function paintQueue(): void {
    queue.replaceChildren();
    const groups = new Map<string, FlowItem[]>();
    for (const i of shown()) {
      const key = `${i.task.class_id}:${i.group}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    }
    for (const list of groups.values()) {
      const g = el('div', 'tf-group');
      const t = el('div', 'tf-group__t');
      t.append(el('span', undefined, list[0]!.group), el('small', undefined, list[0]!.task.class_title));
      g.append(t);
      for (const i of list) {
        const isDone = done.has(i.key);
        const b = el('button', `tf-item${i === current() ? ' is-on' : ''}${isDone ? ' is-done' : ''}`);
        b.type = 'button';
        b.append(el('span', 'tf-who', isDone ? '✓' : i.who), el('span', `tm-kind tm-kind--${i.task.kind ?? 'piece'}`, flowLabel(i)));
        if (!isDone && i.answer?.writing?.flags.length) b.append(el('span', 'tf-item__flag', 'Check writing'));
        if (!isDone && (i.row?.ai_read || i.answer?.ai || i.question?.answers.some((a) => a.ai))) b.append(el('span', 'tf-item__ai', 'AI read'));
        b.addEventListener('click', () => goTo(items.indexOf(i)));
        g.append(b);
      }
      queue.append(g);
    }
    for (const t of data.tasks) {
      if (t.asked?.length) queue.append(el('p', 'tf-note', `${t.title}: ${t.kind === 'quiz' ? 'asked again' : 'redraft asked'}, still with ${t.asked.map((a) => `${a.initials} (${ageText(a.asked_at)})`).join(', ')}`));
    }
  }

  function paintWork(): void {
    work.replaceChildren();
    const item = current();
    const list = shown();
    if (!list.length || list.every((i) => done.has(i.key))) {
      const clear = el('div', 'tf-clear');
      clear.append(el('h2', undefined, 'All clear'), el('p', 'tf-note', items.length ? 'Nothing else waiting here.' : 'Nothing is waiting for your feedback.'));
      work.append(clear);
      go.hidden = true;
      return;
    }
    if (!item) return;
    go.hidden = done.has(item.key);
    go.replaceChildren(document.createTextNode(item.kind === 'quiz' && item.question && isStacked(item.question.kind) ? 'Save marks and next' : `${VERB[item.kind]} and next`), el('kbd', undefined, '⌘↵'));
    const headLine = el('div', 'tf-work__head');
    headLine.append(el('span', `tm-kind tm-kind--${item.task.kind ?? 'piece'}`, flowLabel(item, true)));
    headLine.append(el('h2', 'tf-work__who', item.question && isStacked(item.question.kind) ? item.task.title : item.who));
    headLine.append(el('span', 'tf-crumb', `${item.task.class_title} · ${item.group}`));
    work.append(headLine);
    if (item.question) work.append(el('p', 'tf-prompt', `${item.question.prompt}${item.answer ? ` (${item.question.marks} marks)` : ''}`));
    if (done.has(item.key)) {
      work.append(el('p', 'tf-note', 'Done.'));
      return;
    }
    const cached = cards.get(item.key);
    if (cached) {
      shownCard = cached;
      work.append(cached.el);
      return;
    }
    const slot = el('div');
    slot.append(el('p', 'tf-note', 'Opening…'));
    work.append(slot);
    const key = item.key;
    void Promise.resolve()
      .then(() => buildCard(item, () => completed(item)))
      .then(
        (card) => {
          if (disposed || current()?.key !== key) { card.leave?.(); return; }
          cards.set(key, card);
          shownCard = card;
          slot.replaceChildren(card.el);
        },
        (error) => {
          if (current()?.key === key) slot.replaceChildren(el('p', 'tf-error', errorText(error, 'Couldn’t open this. Skip it or try again.')));
        }
      );
  }

  function paint(): void {
    paintHead();
    paintQueue();
    paintWork();
  }

  const onKey = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void finish();
      return;
    }
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  };
  document.addEventListener('keydown', onKey);

  void load().then(
    (loaded) => {
      if (disposed) return;
      data = loaded;
      items = flowItems(data.tasks, data.quizzes);
      canvas.replaceChildren(root);
      root.style.setProperty('--tf-top', `${Math.max(0, Math.round(root.getBoundingClientRect().top)) + 16}px`);
      paint();
    },
    () => {
      if (!disposed) canvas.replaceChildren(el('p', 'tm-sub', 'Could not load what is waiting for feedback. Reload to try again.'));
    }
  );

  return {
    dispose: () => {
      disposed = true;
      document.removeEventListener('keydown', onKey);
      leaveCard();
    }
  };
}

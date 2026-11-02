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
import { openMarkPiece, type MarkPieceData } from './mark-piece';
import { runAiRead, type AiReadTarget } from './ai-read';
import { FLOW_LABEL, aiReadCount, flowItems, isStacked, type FlowItem, type FlowKind, type QuizAnswer, type QuizLoad, type QuizQuestion, type QuizResponse } from './to-mark-items';
import { loadQueue, type ToMarkTask } from './to-mark-view';
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
  return { el: box, drop: true, leave: () => take.close(), finish: async () => { await take.finish(); take.close(); return true; } };
}

async function pieceCard(item: FlowItem): Promise<Card> {
  const { task, row } = item;
  const call = <T>(body: Record<string, unknown>) => apiPost<T>(`/api/classes/${encodeURIComponent(task.class_id)}/pieces`, { column_id: task.column_id, student_id: row!.student_id, ...body });
  const data = await call<Omit<MarkPieceData, 'position'>>({ action: 'load' });
  const view = openMarkPiece({ ...data, position: { index: 0, total: 1 } }, {
    save: (body) => call({ action: 'save', ...body }),
    returnIt: () => call({ action: 'return' }),
    takeBack: () => call({ action: 'take_back' }),
    move: () => undefined
  }, { embedded: true });
  return { el: view.el, leave: () => void view.save(), finish: async () => { await view.finish(); return true; } };
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
  const loaded = await flowPost<Loaded>({ action: 'answer_load', class_id: task.class_id, student_id: answer.student_id, piece });

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
  aside.append(el('h3', 'mk-side__title', 'Mark'), ticks);
  if (answer.ai) aside.append(el('p', 'mk-ai', `AI suggests ${fromAi ?? 'no mark'}: ${answer.ai.reason} Return keeps it unless you press another.`));
  if (question.guide) aside.append(el('p', 'tf-note', `How to mark it: ${question.guide}`));
  if (question.model_answer) aside.append(el('p', 'tf-note', `Model answer: ${question.model_answer}`));

  const { line, show } = errorLine();
  let sent: { tags: unknown[]; comment: string } = { tags: [], comment: '' };
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
      suggested: loaded.feedback ? [] : suggestedOn(text, 'answer', 'text', answer.ai?.tags),
      ...(answer.ai?.feedback && !answer.comment ? { draftComment: answer.ai.feedback } : answer.comment ? { draftComment: answer.comment } : {})
    }
  );
  const box = el('div');
  box.append(view.el, line);
  return {
    el: box,
    finish: async () => {
      const score = mark ?? fromAi;
      if (score === null) { show('Pick a mark first.'); return false; }
      await view.save();
      await quizPost(task.lesson_id, { action: 'mark', attempt_id: answer.attempt_id, question_id: question.id, score, comment: sent.comment });
      await flowPost({ action: 'answer_save', class_id: task.class_id, student_id: answer.student_id, piece, lesson_id: task.lesson_id, title: task.title, text: parts, tags: sent.tags, comment: sent.comment });
      return true;
    }
  };
}

function stackCard(item: FlowItem): Card {
  const question = item.question!;
  const { task } = item;
  const picks = new Map<string, number>();
  const box = el('div', 'tf-card');
  const paint = (): void => {
    box.replaceChildren(el('h3', 'mk-side__title', `${question.answers.length} answers to one question. Tap to decide.`));
    if (question.quote) box.append(el('p', 'tf-note', question.quote));
    for (const a of question.answers) {
      const row = el('div', 'tf-ans');
      row.append(el('span', 'tf-who', a.initials));
      const p = el('p', undefined, answerText(a.response) || '(blank)');
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
      row.append(ticks);
      box.append(row);
    }
    if (question.answers.some((a) => typeof a.ai?.marks === 'number' && !picks.has(a.attempt_id))) {
      box.append(button('Keep the AI’s clear ones', 'secondary', () => {
        for (const a of question.answers) if (typeof a.ai?.marks === 'number' && !picks.has(a.attempt_id)) picks.set(a.attempt_id, a.ai.marks);
        paint();
      }));
    }
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
      const left = question.answers.filter((a) => !picks.has(a.attempt_id));
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
  return { el: view.el, finish: async () => { await view.finish(); return true; } };
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
  headRow.append(el('h1', 'tf-title', 'To mark'), progress, count, queueToggle);
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
        b.append(el('span', 'tf-who', isDone ? '✓' : i.who), el('span', `tm-kind tm-kind--${i.task.kind ?? 'piece'}`, FLOW_LABEL[i.kind]));
        if (!isDone && (i.row?.ai_read || i.answer?.ai || i.question?.answers.some((a) => a.ai))) b.append(el('span', 'tf-item__ai', 'AI read'));
        b.addEventListener('click', () => goTo(items.indexOf(i)));
        g.append(b);
      }
      queue.append(g);
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
    headLine.append(el('span', `tm-kind tm-kind--${item.task.kind ?? 'piece'}`, FLOW_LABEL[item.kind]));
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

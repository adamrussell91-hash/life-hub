import type { Block } from '@/schemas/block';
import { apiPost } from '@/api/client';
import { navigate } from '@/app/router';
import { fetchCurriculum } from '@/teacher/nav';
import type { RenderMode, RenderContext } from '@/blocks/render';
import { QUIZ_KIND_INFO, QUIZ_QUESTION_KINDS, blankQuestion, type QuizImage, type QuizQuestion, type QuizQuestionKind } from '@/quiz/core';
import { mountQuestionBuilder } from '@/quiz/builder';
import { button, checkbox, deviceToken, el, errorText, labelled, plural, readJSON, select, textArea, writeJSON } from '@/quiz/dom';
import { lessonImages } from '@/quiz/images';
import '@/quiz/quiz.css';

/**
 * Question drop: students write a question that feeds a quiz lesson in the
 * same unit. The teacher chooses the quiz in the block's setup and approves
 * each question from the quiz lesson's page. No names, no accounts: each
 * device keeps a random token so the server can cap questions per student.
 */

type DropBlock = Extract<Block, { block_type: 'question_drop' }>;

type DropState = {
  open: boolean;
  reason: 'no_quiz' | 'paused' | 'closed' | null;
  quiz_title: string;
  kinds: QuizQuestionKind[];
  marks_min: number;
  marks_max: number;
  per_student: number;
  sent: Array<{ kind: QuizQuestionKind; prompt: string }>;
};

type QuizOption = { id: string; title: string };

/* ── Editor ────────────────────────────────────────────────────────── */

export function createQuestionDropEditor(block: DropBlock, onChange: (b: DropBlock) => void, lessonId?: string): HTMLElement {
  const root = el('div', 'qz-drop qz-drop--editor');
  let current = block;
  const set = (patch: Partial<DropBlock['content']>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };

  const target = select([], current.content.target_quiz_id, 'Loading quizzes…');
  target.disabled = true;
  target.addEventListener('change', () => set({ target_quiz_id: target.value }));
  const targetHint = el('p', 'qz-field__hint', 'Only lessons in this unit set to Quiz are listed.');
  const targetField = labelled('Feeds into', target);
  targetField.append(targetHint);
  root.append(targetField);
  void loadUnitQuizzes(lessonId).then((quizzes) => {
    target.replaceChildren();
    const blank = el('option', '', quizzes.length ? 'Choose a quiz' : 'No quiz lessons in this unit yet');
    blank.value = '';
    target.append(blank);
    for (const q of quizzes) {
      const option = el('option', '', q.title);
      option.value = q.id;
      target.append(option);
    }
    if (current.content.target_quiz_id && !quizzes.some((q) => q.id === current.content.target_quiz_id)) {
      const gone = el('option', '', 'A quiz that is no longer in this unit');
      gone.value = current.content.target_quiz_id;
      target.append(gone);
    }
    target.value = current.content.target_quiz_id;
    target.disabled = false;
    if (!quizzes.length) targetHint.textContent = 'Make a lesson in this unit, set its type to Quiz, then come back and choose it here.';
  });

  const prompt = textArea(current.content.prompt, 500, 2, 'e.g. Write a question about today’s poem.');
  prompt.addEventListener('input', () => set({ prompt: prompt.value }));
  root.append(labelled('What should students write a question about?', prompt));

  const kindsBox = el('fieldset', 'qz-fieldset');
  kindsBox.append(el('legend', 'qz-field__label', 'Question types students can choose'));
  kindsBox.append(el('p', 'qz-field__hint', 'Leave them all unticked to allow every type.'));
  const tiers: Array<[1 | 2 | 3, string]> = [
    [1, 'Quick'],
    [2, 'Richer'],
    [3, 'Marked by you']
  ];
  for (const [tier, name] of tiers) {
    const row = el('div', 'qz-kind-row');
    row.append(el('span', 'qz-kind-row__label', name));
    for (const kind of QUIZ_QUESTION_KINDS.filter((k) => QUIZ_KIND_INFO[k].tier === tier)) {
      row.append(
        checkbox(QUIZ_KIND_INFO[kind].label, current.content.kinds.includes(kind), (on) => {
          const next = on ? [...new Set([...current.content.kinds, kind])] : current.content.kinds.filter((k) => k !== kind);
          set({ kinds: QUIZ_QUESTION_KINDS.filter((k) => next.includes(k)) });
        })
      );
    }
    kindsBox.append(row);
  }
  root.append(kindsBox);

  const numbers = el('div', 'qz-extras-row');
  const num = (label: string, value: number, min: number, max: number, apply: (n: number) => void) => {
    const input = el('input', 'qz-input qz-input--marks');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('change', () => {
      const n = Math.max(min, Math.min(max, Math.round(Number(input.value)) || min));
      input.value = String(n);
      apply(n);
    });
    numbers.append(labelled(label, input));
    return input;
  };
  const minInput = num('Fewest marks', current.content.marks_min, 1, 20, (n) => {
    set({ marks_min: n, marks_max: Math.max(n, current.content.marks_max) });
    maxInput.value = String(current.content.marks_max);
  });
  const maxInput = num('Most marks', current.content.marks_max, 1, 20, (n) => {
    set({ marks_max: n, marks_min: Math.min(n, current.content.marks_min) });
    minInput.value = String(current.content.marks_min);
  });
  num('Questions per student', current.content.per_student, 1, 5, (n) => set({ per_student: n }));
  root.append(numbers);

  root.append(
    checkbox('Taking questions', current.content.accepting, (on) => set({ accepting: on })),
    el('p', 'qz-note block-secondary', 'Students write on the published lesson. Their questions wait on the quiz lesson’s page for you to approve.')
  );
  return root;
}

async function loadUnitQuizzes(lessonId?: string): Promise<QuizOption[]> {
  if (!lessonId) return [];
  try {
    const curriculum = await fetchCurriculum();
    const unitId = curriculum.lessons.find((l) => l.id === lessonId)?.unit_id;
    if (!unitId) return [];
    return curriculum.lessons
      .filter((l) => l.unit_id === unitId && l.id !== lessonId && l.pedagogical_mode === 'quiz' && l.status !== 'trashed')
      .sort((a, b) => a.sequence - b.sequence)
      .map((l) => ({ id: l.id, title: l.title }));
  } catch {
    return [];
  }
}

/* ── Render ────────────────────────────────────────────────────────── */

export function renderQuestionDrop(block: DropBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'qz-drop');
  root.dataset.blockId = block.id;
  const head = el('header', 'qz-drop__head');
  head.append(el('p', 'qz-eyebrow block-eyebrow', 'Write a quiz question'));
  head.append(el('h3', 'qz-drop__prompt block-title', block.content.prompt.trim() || 'Write a question for this week’s review quiz.'));
  root.append(head);

  if (mode === 'print') {
    root.append(el('p', 'qz-note block-secondary', 'Your question, the answer and how many marks it’s worth:'), el('div', 'qz-print-lines'));
    return root;
  }
  if (mode === 'teacher') {
    root.append(teacherSummary(block, ctx.lessonId));
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'qz-note block-secondary', 'Students write their question on the published lesson.'));
    return root;
  }
  root.append(mountStudent(block, ctx.lessonId, lessonImages(ctx.pageBlocks ?? [])));
  return root;
}

function teacherSummary(block: DropBlock, lessonId?: string): HTMLElement {
  const box = el('div', 'qz-panel');
  const target = block.content.target_quiz_id;
  if (!target) {
    box.append(el('p', 'qz-panel__title', 'Not feeding a quiz yet'), el('p', 'qz-note block-secondary', 'Edit this block and choose the quiz lesson it feeds into.'));
    return box;
  }
  const kinds = block.content.kinds.length ? block.content.kinds.map((k) => QUIZ_KIND_INFO[k].label).join(', ') : 'Any question type';
  const marks = block.content.marks_min === block.content.marks_max ? plural(block.content.marks_min, 'mark') : `${block.content.marks_min} to ${block.content.marks_max} marks`;
  const title = el('p', 'qz-panel__title', 'Feeds into a quiz');
  const meta = el('p', 'qz-note block-secondary', `${kinds} · ${marks} · ${plural(block.content.per_student, 'question')} per student${block.content.accepting ? '' : ' · Paused'}`);
  const count = el('p', 'qz-note block-secondary', '');
  const open = button('Open the quiz', 'secondary', () => navigate(`/lessons/${target}`));
  box.append(title, meta, count, open);
  void apiPost<{ submissions?: Array<{ block_id: string; source_lesson_id: string; status: string }> }>(
    `/api/lessons/${encodeURIComponent(target)}/quiz`,
    { action: 'submissions' }
  )
    .then((res) => {
      const mine = (res.submissions ?? []).filter((s) => s.block_id === block.id && (!lessonId || s.source_lesson_id === lessonId));
      const waiting = mine.filter((s) => s.status === 'pending').length;
      count.textContent = mine.length ? `${plural(mine.length, 'question')} sent from here, ${waiting} waiting for you.` : 'No questions sent from here yet.';
    })
    .catch(() => undefined);
  void fetchCurriculum()
    .then((c) => {
      const quiz = c.lessons.find((l) => l.id === target);
      if (quiz) title.textContent = `Feeds into ${quiz.title}`;
    })
    .catch(() => undefined);
  return box;
}

function mountStudent(block: DropBlock, lessonId: string, images: QuizImage[]): HTMLElement {
  const endpoint = `/api/published/question-drop/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const draftKey = `question-drop:${lessonId}:${block.id}:draft`;
  const root = el('div', 'qz-run');
  const body = el('div', 'qz-body');
  const alert = el('p', 'qz-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, alert);
  const token = deviceToken(`drop:${lessonId}:${block.id}`);
  let state: DropState | null = null;
  let writing = false;

  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };

  async function send(action: 'status' | 'submit', extra: Record<string, unknown> = {}): Promise<boolean> {
    try {
      state = await apiPost<DropState>(endpoint, { action, ...(token ? { token } : {}), ...extra });
      alert.hidden = true;
      return true;
    } catch (error) {
      showError(errorText(error));
      return false;
    }
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'qz-note block-secondary', 'Loading…'));
      return;
    }
    const s = state;
    const frame = el('div', 'qz-stage');
    if (s.sent.length) {
      const done = el('div', 'qz-panel qz-panel--done');
      done.append(el('p', 'qz-panel__title', s.sent.length === 1 ? `Sent to ${s.quiz_title}` : `${s.sent.length} questions sent to ${s.quiz_title}`));
      const list = el('ul', 'qz-sent');
      for (const q of s.sent) list.append(el('li', '', `${QUIZ_KIND_INFO[q.kind]?.label ?? 'Question'}: ${q.prompt || 'Fill the gap'}`));
      done.append(list, el('p', 'qz-note block-secondary', 'Your teacher checks every question before it goes in the quiz.'));
      frame.append(done);
    }
    const remaining = s.per_student - s.sent.length;
    if (!s.open) {
      const why = { no_quiz: 'This question box isn’t set up yet.', paused: 'Your teacher has paused this question box.', closed: 'The quiz has closed to new questions.' };
      frame.append(waitPanel(why[s.reason ?? 'paused'] ?? 'Not taking questions right now.', 'Ask your teacher what to do next.'));
    } else if (!token) {
      frame.append(waitPanel('Open a normal (not private) window to send a question here.', 'This page updates by itself.'));
    } else if (remaining > 0) {
      if (s.sent.length && !writing) {
        frame.append(
          button(`Write another (${remaining} left)`, 'secondary', () => {
            writing = true;
            paint();
          })
        );
      } else {
        frame.append(composer(s, remaining));
      }
    }
    body.replaceChildren(frame);
  }

  function composer(s: DropState, remaining: number): HTMLElement {
    const wrap = el('div', 'qz-compose');
    const kinds = s.kinds.length ? s.kinds : [...QUIZ_QUESTION_KINDS];
    const saved = readJSON<QuizQuestion>(draftKey);
    const start = saved && kinds.includes(saved.kind) ? saved : blankQuestion(kinds[0] ?? 'multiple_choice', 'draft', s.marks_min);
    const builder = mountQuestionBuilder({
      question: start,
      kinds,
      marks: { min: s.marks_min, max: s.marks_max },
      images,
      audience: 'student',
      onChange: (q) => {
        if (!writeJSON(draftKey, q)) showError('Keep this page open until you send, so your draft stays with you.');
      }
    });
    const sendBtn = button('Send question', 'primary', async function () {
      const problem = builder.problem();
      if (problem) {
        showError(problem);
        return;
      }
      this.disabled = true;
      this.textContent = 'Sending…';
      const ok = await send('submit', { question: builder.get() });
      if (ok) {
        writeJSON(draftKey, null);
        writing = false;
        paint();
      } else if (this.isConnected) {
        this.disabled = false;
        this.textContent = 'Send question';
      }
    });
    const actions = el('div', 'qz-actions');
    actions.append(sendBtn, el('span', 'qz-note block-secondary', remaining > 1 ? `You can send ${remaining}.` : 'Your question is final once you send it.'));
    wrap.append(builder.root, actions);
    return wrap;
  }

  paint();
  void send('status').then(paint);
  return root;
}

function waitPanel(title: string, sub: string): HTMLElement {
  const box = el('div', 'qz-panel qz-panel--wait');
  box.append(el('p', 'qz-panel__title', title), el('p', 'qz-note block-secondary', sub));
  return box;
}

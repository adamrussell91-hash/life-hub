import { apiGet } from '@/api/client';
import { el, errorText } from '@/quiz/dom';
import type { Lesson } from '@/schemas/lesson';
import './end-questions.css';

/**
 * The lesson editor's end-of-lesson questions: which questions this lesson
 * asks after the tick, and what students answered, pooled and anonymous. A
 * result with under 5 answers isn't shown; under 10 it's an early read, since
 * a class average that small isn't reliable (see the footer research page).
 */

type Question = { id: string; label: string; prompt: string; options: string[]; counts: number[]; n: number };
type Tally = { questions: Question[]; unclear: string[]; responses: number; students: number; ticked: number };
export type EndQuestionResults = {
  settings: { on: boolean; pool: string[]; unclear: boolean };
  bank: Array<{ id: string; label: string; prompt: string }>;
  all: Tally;
  classes: Array<Tally & { class_id: string; title: string }>;
};
export type EndQuestionSettings = NonNullable<Lesson['end_questions']>;
export type EndQuestionsOptions = {
  lessonId: string;
  getLesson: () => Lesson;
  onChange: (next: EndQuestionSettings) => void;
  /** Test seam. */
  load?: (lessonId: string) => Promise<EndQuestionResults>;
};

export const SHOW_FROM = 5;
export const FIRM_FROM = 10;
/** Off unless switched on: the lesson types that aren't taught lessons. Matches end-questions.mjs. */
const OFF_BY_DEFAULT = new Set(['assessment', 'quiz']);

export function defaultOn(lesson: Pick<Lesson, 'pedagogical_mode'>): boolean {
  return !OFF_BY_DEFAULT.has(lesson.pedagogical_mode ?? 'lesson');
}

/** How a result reads at this many answers. */
export function readiness(n: number): 'hidden' | 'early' | 'firm' {
  return n < SHOW_FROM ? 'hidden' : n < FIRM_FROM ? 'early' : 'firm';
}

/** "Getting unstuck" in two numbers: who got stuck, and of them, who stayed stuck. */
export function stuckSummary(counts: number[]): { stuck: number; stayed: number; n: number } {
  const n = counts.reduce((a, b) => a + b, 0);
  const stuck = n - (counts[0] ?? 0);
  return { stuck, stayed: counts[3] ?? 0, n };
}

export function mountEndQuestions(options: EndQuestionsOptions): { element: HTMLElement; refresh(): void } {
  const load = options.load ?? ((id: string) => apiGet<EndQuestionResults>(`/api/lessons/${encodeURIComponent(id)}/end-questions`));
  const root = el('section', 'eq');
  root.setAttribute('aria-label', 'End-of-lesson questions');
  let results: EndQuestionResults | null = null;
  let error = '';
  let classId = 'all';
  let loading = false;

  function settings(): EndQuestionSettings {
    return options.getLesson().end_questions ?? {};
  }
  function isOn(): boolean {
    const s = settings();
    return typeof s.on === 'boolean' ? s.on : defaultOn(options.getLesson());
  }
  function change(patch: Partial<EndQuestionSettings>): void {
    options.onChange({ ...settings(), ...patch });
    draw();
  }

  function switches(): HTMLElement {
    const box = el('div', 'eq__switches');
    const on = el('input');
    on.type = 'checkbox';
    on.id = `eq-on-${options.lessonId}`;
    on.checked = isOn();
    on.addEventListener('change', () => change({ on: on.checked }));
    const onLabel = el('label', 'eq__switch');
    onLabel.htmlFor = on.id;
    onLabel.append(on, document.createTextNode(' Ask two questions after the tick'));
    box.append(onLabel);
    const hint = defaultOn(options.getLesson()) ? 'On by default for this lesson type.' : 'Off by default for assessments and quizzes.';
    box.append(el('p', 'eq__hint', hint));

    const set = el('fieldset', 'eq__pool');
    set.disabled = !isOn();
    set.append(el('legend', 'eq__legend', 'Questions this lesson can ask'));
    const skip = new Set(settings().skip ?? []);
    const bank = results?.bank ?? [];
    for (const q of bank) {
      const input = el('input');
      input.type = 'checkbox';
      input.id = `eq-${options.lessonId}-${q.id}`;
      input.checked = !skip.has(q.id);
      input.addEventListener('change', () => {
        const next = new Set(settings().skip ?? []);
        if (input.checked) next.delete(q.id);
        else next.add(q.id);
        change({ skip: [...next] });
      });
      const label = el('label', 'eq__check');
      label.htmlFor = input.id;
      label.title = q.prompt;
      label.append(input, document.createTextNode(` ${q.label}`));
      set.append(label);
    }
    const unclear = el('input');
    unclear.type = 'checkbox';
    unclear.id = `eq-${options.lessonId}-unclear`;
    unclear.checked = settings().unclear !== false;
    unclear.addEventListener('change', () => change({ unclear: unclear.checked }));
    const unclearLabel = el('label', 'eq__check');
    unclearLabel.htmlFor = unclear.id;
    unclearLabel.append(unclear, document.createTextNode(' “Still unclear” box'));
    set.append(unclearLabel);
    if (bank.length && bank.length - skip.size < 2) set.append(el('p', 'eq__hint', 'Leave at least two questions on, or nothing is asked.'));
    box.append(set);
    return box;
  }

  function bar(q: Question): HTMLElement {
    const row = el('div', 'eq__bar');
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', q.options.map((o, i) => `${o}: ${q.counts[i]}`).join(', '));
    q.counts.forEach((count, i) => {
      if (!count) return;
      const seg = el('span', `eq__seg eq__seg--${Math.min(i, 3)}`, String(count));
      seg.style.flexGrow = String(count);
      seg.title = `${q.options[i]}: ${count}`;
      row.append(seg);
    });
    return row;
  }

  function resultFor(q: Question): HTMLElement {
    const item = el('div', 'eq__item');
    const head = el('p', 'eq__q');
    head.append(el('span', undefined, q.prompt));
    const state = readiness(q.n);
    head.append(el('small', 'eq__n', `${q.n} ${q.n === 1 ? 'answer' : 'answers'}${state === 'early' ? ' · early read' : ''}`));
    item.append(head);
    if (state === 'hidden') {
      item.append(el('p', 'eq__hint', `Shows at ${SHOW_FROM} answers.`));
      return item;
    }
    if (q.id === 'unstuck') {
      const s = stuckSummary(q.counts);
      item.append(el('p', 'eq__stuck', `${s.stuck} of ${s.n} got stuck${s.stuck ? `; ${s.stayed} of them stayed stuck` : ''}.`));
    }
    item.append(bar(q));
    const legend = el('p', 'eq__legend-row');
    legend.textContent = q.options.join(' · ');
    item.append(legend);
    return item;
  }

  function resultsView(): HTMLElement {
    const wrap = el('div', 'eq__results');
    if (!results) {
      wrap.append(el('p', 'eq__hint', error || (loading ? 'Loading answers…' : '')));
      return wrap;
    }
    if (results.classes.length > 1) {
      const pick = el('select', 'eq__class');
      pick.setAttribute('aria-label', 'Class');
      for (const [value, text] of [['all', 'All classes'], ...results.classes.map((c) => [c.class_id, c.title] as const)]) {
        const opt = el('option', undefined, text);
        opt.value = value;
        opt.selected = value === classId;
        pick.append(opt);
      }
      pick.addEventListener('change', () => {
        classId = pick.value;
        draw();
      });
      wrap.append(pick);
    }
    const tally: Tally = classId === 'all' ? results.all : results.classes.find((c) => c.class_id === classId) ?? results.all;
    wrap.append(el('p', 'eq__meta', `${tally.ticked} of ${tally.students} ticked this lesson finished · ${tally.responses} ${tally.responses === 1 ? 'student' : 'students'} answered · anonymous`));
    if (!tally.responses) {
      wrap.append(el('p', 'eq__hint', 'No answers yet. Students see two questions after they tick the lesson finished.'));
      return wrap;
    }
    for (const q of tally.questions) if (q.n) wrap.append(resultFor(q));
    if (tally.unclear.length) {
      const item = el('div', 'eq__item');
      item.append(el('p', 'eq__q', 'Still unclear'));
      const list = el('ul', 'eq__unclear');
      for (const text of tally.unclear) list.append(el('li', undefined, text));
      item.append(list);
      wrap.append(item);
    }
    return wrap;
  }

  function draw(): void {
    root.replaceChildren(el('h3', 'eq__title', 'End-of-lesson questions'), switches(), resultsView());
  }

  function refresh(): void {
    if (loading) return;
    loading = true;
    error = '';
    draw();
    void load(options.lessonId).then(
      (r) => {
        results = r;
        loading = false;
        draw();
      },
      (e: unknown) => {
        error = errorText(e, 'Couldn’t load the answers.');
        loading = false;
        draw();
      }
    );
  }

  draw();
  return { element: root, refresh };
}

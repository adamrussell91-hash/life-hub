// apps/tasks/src/views/question-book/view.ts
// The Question Book in the Tasks hub (#/question-book): a private notebook of reflection
// questions. The shelf lists the five groups and their chapters; a chapter page
// (#/question-book?chapter=<id>) shows its questions, each with the input its response type
// takes, saving as you go (after a pause, on blur and on each pick). "Your questions" is a list
// you build of your own questions and answers. "Notice a pattern" is the one model call, run
// only when pressed. The look is the book's (.qb-scope tokens): ivory paper, ink, blue, red
// and a yellow accent, flat shapes and square corners on a strong grid.
import '../../../design-kit/hub-list.css';
import '../../../../../packages/question-book/question-book.css';
import './question-book-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { createHubList } from '../../../design-kit/js/hub-list.js';
import { GROUPS, RULES } from '../../../../../packages/question-book/catalogue.mjs';
import { describeAnswer } from '../../../../../packages/question-book/answers.mjs';
import { bookEmblem, chapterEmblem, groupEmblem, wordmark } from '../../../../../packages/question-book/glyphs';
import { questionBookApi, type QbAnswer, type QbChapter, type QbChapterSummary, type QbNote, type QbOwn, type QbQuestion } from './api';
import { composeValue, mainEditor, partEditors, type Change } from './inputs';

export const SAVE_DELAY_MS = 800;
export const MIN_NOTICE = 3;
const HOME = '#/question-book';
const chapterHref = (id: string): string => `${HOME}?chapter=${encodeURIComponent(id)}`;

/** Cards with unsaved edits, flushed when the page changes. */
const live = new Set<{ flush(): void; dispose(): void }>();

export function unmountQuestionBookView(): void {
  for (const card of live) {
    card.flush();
    card.dispose();
  }
  live.clear();
}

export async function renderQuestionBookView(canvas: HTMLElement): Promise<void> {
  unmountQuestionBookView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const chapter = hashQuery().get('chapter');
  try {
    if (chapter) await renderChapter(canvas, chapter);
    else await renderShelf(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderQuestionBookView(canvas), 'Could not load the Question Book');
  }
}

const when = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDisplayDate(iso)}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

/* ── Shelf ──────────────────────────────────────────────────────────── */

function rulesCard(): HTMLDetailsElement {
  const card = el('details', 'qb-rules');
  const summary = el('summary', 'qb-rules__head');
  summary.append(el('span', 'qb-rules__mark'), el('span', 'qb-rules__title', 'Four rules of the game'), el('span', 'qb-rules__hint', 'Show'));
  const list = el('ol', 'qb-rules__list');
  for (const rule of RULES as readonly { id: string; label: string }[]) list.append(el('li', 'qb-rules__item', rule.label));
  card.append(summary, list);
  card.addEventListener('toggle', () => {
    summary.querySelector('.qb-rules__hint')!.textContent = card.open ? 'Hide' : 'Show';
  });
  return card;
}

function progressLine(row: QbChapterSummary): HTMLElement {
  const wrap = el('div', 'qb-progress');
  if (row.kind === 'rules') {
    wrap.append(el('span', 'qb-progress__text', 'Four agreements'));
    return wrap;
  }
  if (row.kind === 'own') {
    wrap.append(el('span', 'qb-progress__text', row.total ? `${row.total} of your own, ${row.answered} answered` : 'Write your own'));
    return wrap;
  }
  if (!row.total) {
    wrap.append(el('span', 'qb-progress__text', 'No questions yet'));
    return wrap;
  }
  const bar = el('span', 'qb-progress__bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'qb-progress__fill');
  fill.style.width = `${Math.round((row.answered / row.total) * 100)}%`;
  bar.append(fill);
  wrap.append(bar, el('span', 'qb-progress__text', `${row.answered} of ${row.total} answered`));
  return wrap;
}

function tile(row: QbChapterSummary): HTMLLIElement {
  const item = el('li', 'qb-tile');
  item.dataset.chapter = row.id;
  const link = el('a', 'qb-tile__link');
  link.href = chapterHref(row.id);
  const emblem = chapterEmblem(row.id);
  emblem.classList.add('qb-tile__emblem');
  const body = el('span', 'qb-tile__body');
  body.append(el('span', 'qb-tile__title', row.title), el('span', 'qb-tile__when', row.when), progressLine(row));
  if (row.updatedAt) body.append(el('span', 'qb-tile__updated', `Last updated ${formatDisplayDate(row.updatedAt)}`));
  link.append(emblem, body);
  item.append(link);
  return item;
}

async function renderShelf(canvas: HTMLElement): Promise<void> {
  const shelf = await questionBookApi.shelf();
  const page = el('div', 'qb-page qb-scope qb-shelf');
  const head = el('header', 'qb-head');
  const mark = el('div', 'qb-head__mark');
  mark.append(bookEmblem(), wordmark(null), el('h1', 'qb-head__title', 'The Question Book'));
  head.append(mark);
  head.append(el('p', 'qb-intro', 'A private notebook of questions about your life. Answer what you like, in any order; it saves as you go.'));
  page.append(head, rulesCard());
  const groups = [...shelf.groups].sort((a, b) => a.order - b.order);
  for (const group of groups) {
    const section = el('section', 'qb-group');
    section.dataset.group = group.key;
    const titleId = `qb-group-${group.key}`;
    section.setAttribute('aria-labelledby', titleId);
    const gh = el('header', 'qb-group__head');
    const emblem = groupEmblem(group.key);
    emblem.classList.add('qb-group__emblem');
    const h2 = el('h2', 'qb-group__title', group.title);
    h2.id = titleId;
    const rows = shelf.chapters.filter((c) => c.group === group.key).sort((a, b) => a.order - b.order);
    gh.append(emblem, h2, el('span', 'qb-group__count', `${rows.length} chapters`));
    const list = el('ul', 'qb-tiles');
    for (const row of rows) list.append(tile(row));
    section.append(gh, list);
    page.append(section);
  }
  canvas.replaceChildren(page);
}

/* ── Chapter ────────────────────────────────────────────────────────── */

function chapterHeader(data: QbChapter, count: HTMLElement): HTMLElement {
  const head = el('header', 'qb-chead');
  const back = el('a', 'qb-back', '← The Question Book');
  back.href = HOME;
  const emblem = chapterEmblem(data.chapter.id);
  emblem.classList.add('qb-chead__emblem');
  const words = el('div', 'qb-chead__words');
  const group = (GROUPS as readonly { key: string; title: string }[]).find((g) => g.key === data.chapter.group);
  words.append(el('p', 'qb-chead__group', group?.title ?? ''), el('h1', 'qb-chead__title', data.chapter.title), el('p', 'qb-chead__when', data.chapter.when), count);
  const row = el('div', 'qb-chead__row');
  row.append(emblem, words);
  head.append(back, row);
  return head;
}

async function renderChapter(canvas: HTMLElement, id: string): Promise<void> {
  const data = await questionBookApi.chapter(id);
  const page = el('div', 'qb-page qb-scope qb-chapter');
  page.dataset.chapter = data.chapter.id;
  const count = el('p', 'qb-chead__count');
  count.setAttribute('aria-live', 'polite');
  page.append(chapterHeader(data, count));
  if (data.chapter.kind === 'rules') {
    const list = el('ol', 'qb-rules__list qb-rules__list--page');
    for (const rule of data.rules ?? []) list.append(el('li', 'qb-rules__item', rule.label));
    page.append(list);
    canvas.replaceChildren(page);
    return;
  }
  const notice = noticeSection(data.chapter.id, data.notes);
  if (data.chapter.kind === 'own') {
    page.append(ownEditor(data.chapter.id, data.own ?? [], (answered, total) => {
      count.textContent = total ? `${answered} of ${total} answered` : '';
      notice.setAnswered(answered);
    }));
  } else {
    const setCount = (answered: number, total: number): void => {
      count.textContent = `${answered} of ${total} answered`;
      notice.setAnswered(answered);
    };
    const answeredNow = data.questions.filter((q) => data.answers[q.id]).length;
    setCount(answeredNow, data.questions.length);
    if (!data.questions.length) page.append(el('p', 'qb-empty', 'No questions in this chapter yet.'));
    const list = el('ol', 'qb-questions');
    for (const question of data.questions) list.append(questionCard(data, question, setCount));
    page.append(list);
  }
  page.append(notice.el);
  canvas.replaceChildren(page);
}

/** A saved value as words, for Earlier versions. */
function versionText(data: QbChapter, question: QbQuestion, value: QbAnswer['value']): string {
  if (question.response.type === 'comparison' && typeof value?.main === 'string') {
    const other = data.questions.find((q) => q.id === value.main);
    const rest = describeAnswer(question, { parts: value.parts }, null);
    return [other ? `Question ${other.n}: ${other.prompt}` : 'Another question', rest].filter(Boolean).join('\n');
  }
  try {
    const chart = question.response.type === 'chart' ? data.charts[String(question.response.chart)] ?? null : null;
    return describeAnswer(question, value, chart as never) || '(blank)';
  } catch {
    return '(this version can’t be shown)';
  }
}

function questionCard(data: QbChapter, question: QbQuestion, setCount: (answered: number, total: number) => void): HTMLLIElement {
  const card = el('li', 'qb-q');
  card.id = `qb-q-${question.id}`;
  card.dataset.question = question.id;
  card.dataset.type = question.response.type;
  const head = el('div', 'qb-q__head');
  head.append(el('span', 'qb-q__n', String(question.n)));
  const words = el('div', 'qb-q__words');
  if (question.from) words.append(el('p', 'qb-q__from', `from ${question.from}`));
  const prompt = el('h2', 'qb-q__prompt', question.prompt);
  prompt.id = `qb-prompt-${question.id}`;
  words.append(prompt);
  head.append(words);
  const body = el('div', 'qb-q__body');
  const status = el('p', 'qb-q__status');
  status.setAttribute('aria-live', 'polite');
  const foot = el('div', 'qb-q__foot');
  const historyBtn = el('button', 'qb-link-btn', 'Earlier versions');
  historyBtn.type = 'button';
  historyBtn.setAttribute('aria-expanded', 'false');
  const historyPanel = el('div', 'qb-q__history');
  historyPanel.id = `qb-history-${question.id}`;
  historyPanel.hidden = true;
  historyBtn.setAttribute('aria-controls', historyPanel.id);
  const clearBtn = el('button', 'qb-link-btn qb-link-btn--quiet', 'Clear');
  clearBtn.type = 'button';
  clearBtn.setAttribute('aria-label', `Clear your answer to question ${question.n}`);
  foot.append(status, historyBtn, clearBtn);
  card.append(head, body, foot, historyPanel);

  const chart = question.response.type === 'chart' ? data.charts[String(question.response.chart)] ?? null : null;
  let answer: QbAnswer | null = data.answers[question.id] ?? null;
  let editors = build(answer?.value ?? null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let inflight = false;
  let again = false;

  function build(value: QbAnswer['value']) {
    const ctx = { question, chart, questions: data.questions, labelId: prompt.id, changed: schedule };
    const main = mainEditor(ctx, value?.main);
    const parts = partEditors(ctx, value?.parts);
    body.replaceChildren(...[main?.el, parts?.el].filter((n): n is HTMLElement => Boolean(n)));
    return { main, parts };
  }

  function setStatus(text: string, state: 'idle' | 'saving' | 'saved' | 'error' | 'waiting'): void {
    status.textContent = text;
    status.dataset.state = state;
  }
  if (answer) setStatus(`Saved ${when(answer.updatedAt)}`, 'idle');

  function schedule(mode: Change): void {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const reason = editors.main?.invalid?.() ?? null;
    if (reason) {
      setStatus(reason, 'waiting');
      return;
    }
    if (mode === 'now') flush();
    else {
      setStatus('Editing…', 'idle');
      timer = setTimeout(flush, SAVE_DELAY_MS);
    }
  }

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    if (inflight) {
      again = true;
      return;
    }
    const reason = editors.main?.invalid?.() ?? null;
    if (reason) {
      setStatus(reason, 'waiting');
      return;
    }
    send(composeValue(editors.main, editors.parts));
  }

  function send(value: QbAnswer['value']): void {
    dirty = false;
    inflight = true;
    setStatus('Saving…', 'saving');
    questionBookApi
      .save(data.chapter.id, question.id, value)
      .then((res) => {
        answer = res.answer;
        if (res.answer) data.answers[question.id] = res.answer;
        else delete data.answers[question.id];
        setStatus(res.answer ? 'Saved' : 'Cleared', 'saved');
        setCount(res.answered, res.total);
        if (!historyPanel.hidden) void loadHistory();
      })
      .catch((err) => {
        dirty = true;
        setStatus(errorMessage(err, 'Couldn’t save just now. Your words are still here; edit again to retry.'), 'error');
      })
      .finally(() => {
        inflight = false;
        if (again) {
          again = false;
          flush();
        }
      });
  }

  body.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (!next || !card.contains(next)) flush();
  });

  clearBtn.addEventListener('click', () => {
    if (timer) clearTimeout(timer);
    timer = null;
    editors = build(null);
    if (!answer && !dirty) {
      setStatus('', 'idle');
      return;
    }
    if (inflight) {
      dirty = true;
      again = true;
      return;
    }
    send(null);
  });

  async function loadHistory(): Promise<void> {
    historyPanel.replaceChildren(el('p', 'qb-note', 'Loading…'));
    try {
      const res = await questionBookApi.history(data.chapter.id, question.id);
      historyPanel.replaceChildren();
      historyPanel.append(el('h3', 'qb-q__history-title', 'Earlier versions'));
      if (!res.versions.length) {
        historyPanel.append(el('p', 'qb-note', 'No earlier versions yet. One is kept when you change an answer later on, or clear it.'));
        return;
      }
      const list = el('ol', 'qb-versions');
      for (const version of res.versions) {
        const li = el('li', 'qb-version');
        li.append(el('p', 'qb-version__at', when(version.updatedAt)), el('p', 'qb-version__text', versionText(data, question, version.value)));
        list.append(li);
      }
      historyPanel.append(list);
    } catch (err) {
      historyPanel.replaceChildren(el('p', 'qb-error', errorMessage(err, 'Couldn’t load earlier versions.')));
    }
  }

  historyBtn.addEventListener('click', () => {
    const open = historyPanel.hidden;
    historyPanel.hidden = !open;
    historyBtn.setAttribute('aria-expanded', String(open));
    historyBtn.textContent = open ? 'Hide earlier versions' : 'Earlier versions';
    if (open) void loadHistory();
  });

  live.add({
    flush,
    dispose: () => {
      if (timer) clearTimeout(timer);
    }
  });
  return card;
}

/* ── Your questions ─────────────────────────────────────────────────── */

type OwnRow = { id: string; question: string; answer: string };
const newOwnId = (): string => `own_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function ownEditor(chapterId: string, saved: QbOwn[], onCounts: (answered: number, total: number) => void): HTMLElement {
  const wrap = el('section', 'qb-own');
  wrap.setAttribute('aria-label', 'Your own questions');
  wrap.append(el('p', 'qb-intro', 'Write the questions the book doesn’t ask, and answer them here. Each one saves as you go.'));
  const status = el('p', 'qb-q__status');
  status.setAttribute('aria-live', 'polite');
  let rows: OwnRow[] = saved.map((e) => ({ id: e.id, question: e.question, answer: e.answer }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let inflight = false;
  let again = false;
  const counts = (): void => {
    const filled = rows.filter((r) => r.question.trim() || r.answer.trim());
    onCounts(filled.filter((r) => r.question.trim() && r.answer.trim()).length, filled.length);
  };

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    if (inflight) {
      again = true;
      return;
    }
    dirty = false;
    inflight = true;
    status.textContent = 'Saving…';
    status.dataset.state = 'saving';
    questionBookApi
      .saveOwn(chapterId, rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer })))
      .then(() => {
        status.textContent = 'Saved';
        status.dataset.state = 'saved';
      })
      .catch((err) => {
        dirty = true;
        status.textContent = errorMessage(err, 'Couldn’t save just now. Your words are still here; edit again to retry.');
        status.dataset.state = 'error';
      })
      .finally(() => {
        inflight = false;
        if (again) {
          again = false;
          flush();
        }
      });
  }
  function schedule(mode: Change): void {
    dirty = true;
    counts();
    if (timer) clearTimeout(timer);
    timer = null;
    if (mode === 'now') flush();
    else timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  const list = createHubList<OwnRow>({
    items: rows,
    noun: 'question',
    label: 'Your questions',
    getKey: (row) => row.id,
    describe: (row) => (row.question.trim() ? `“${row.question.trim().slice(0, 40)}”` : 'Question'),
    create: () => ({ id: newOwnId(), question: '', answer: '' }),
    read: () => rows,
    onChange: (next) => {
      rows = next;
      schedule('now');
    },
    renderItem: (row, ctx) => {
      const box = el('div', 'qb-own__row');
      const q = el('textarea', 'qb-text');
      q.rows = 2;
      q.value = row.question;
      q.id = `qb-own-q-${row.id}`;
      const a = el('textarea', 'qb-text');
      a.rows = 3;
      a.value = row.answer;
      a.id = `qb-own-a-${row.id}`;
      const ql = el('label', 'qb-field__label', 'Your question');
      ql.htmlFor = q.id;
      const al = el('label', 'qb-field__label', 'Your answer');
      al.htmlFor = a.id;
      const edit = (): void => {
        const next = { ...ctx.current, question: q.value, answer: a.value };
        ctx.update(next);
        rows = rows.map((r) => (r.id === next.id ? next : r));
        schedule('soon');
      };
      q.addEventListener('input', edit);
      a.addEventListener('input', edit);
      const qf = el('div', 'qb-field');
      qf.append(ql, q);
      const af = el('div', 'qb-field');
      af.append(al, a);
      box.append(qf, af);
      return box;
    }
  });
  wrap.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (!next || !wrap.contains(next)) flush();
  });
  wrap.append(list.el, status);
  counts();
  live.add({ flush, dispose: () => timer && clearTimeout(timer) });
  return wrap;
}

/* ── Notice a pattern ───────────────────────────────────────────────── */

function noteCard(note: QbNote, fresh = false): HTMLElement {
  const card = el(fresh ? 'div' : 'li', fresh ? 'qb-noted qb-noted--fresh' : 'qb-noted');
  card.append(
    el('p', 'qb-noted__at', `${when(note.at)} · from ${note.answered} answers`),
    el('p', 'qb-noted__observation', note.observation)
  );
  const next = el('p', 'qb-noted__question');
  next.append(el('span', 'qb-noted__label', 'A question to take it further: '), document.createTextNode(note.question));
  card.append(next);
  return card;
}

function noticeSection(chapterId: string, notes: QbNote[]): { el: HTMLElement; setAnswered(n: number): void } {
  const section = el('section', 'qb-notice');
  section.setAttribute('aria-labelledby', 'qb-notice-title');
  const title = el('h2', 'qb-notice__title', 'Notice a pattern');
  title.id = 'qb-notice-title';
  const lede = el('p', 'qb-notice__lede', 'One short observation across this chapter’s answers, and a question to take it further. It reads only this chapter, and only when you press the button.');
  const button = el('button', 'qb-btn qb-btn--primary qb-notice__go', 'Notice a pattern · about 3 cents');
  button.type = 'button';
  const hint = el('p', 'qb-notice__hint');
  hint.id = 'qb-notice-hint';
  button.setAttribute('aria-describedby', hint.id);
  const result = el('div', 'qb-notice__result');
  result.setAttribute('aria-live', 'polite');
  const pastTitle = el('h3', 'qb-notice__past-title', 'Earlier notes');
  const past = el('ol', 'qb-notice__past');
  let answered = 0;
  let busy = false;
  let shown: QbNote[] = notes;
  let freshId: string | null = null;

  const paintPast = (): void => {
    const rest = shown.filter((n) => n.id !== freshId);
    past.replaceChildren(...rest.map((n) => noteCard(n)));
    pastTitle.hidden = !rest.length;
    past.hidden = !rest.length;
  };
  const paintButton = (): void => {
    button.disabled = busy || answered < MIN_NOTICE;
    button.setAttribute('aria-busy', String(busy));
    button.textContent = busy ? 'Noticing…' : 'Notice a pattern · about 3 cents';
    if (busy) hint.textContent = 'Reading this chapter’s answers…';
    else if (answered < MIN_NOTICE) hint.textContent = `Answer at least ${MIN_NOTICE} questions in this chapter first (${answered} so far).`;
    else hint.textContent = '';
    hint.dataset.state = '';
  };
  button.addEventListener('click', () => {
    if (busy || answered < MIN_NOTICE) return;
    busy = true;
    paintButton();
    questionBookApi
      .notice(chapterId)
      .then((res) => {
        shown = res.notes;
        freshId = res.note.id;
        result.replaceChildren(noteCard(res.note, true));
        paintPast();
        busy = false;
        paintButton();
      })
      .catch((err) => {
        busy = false;
        paintButton();
        hint.textContent = errorMessage(err, 'Nothing came back just now. Try again.');
        hint.dataset.state = 'error';
      });
  });
  section.append(title, lede, button, hint, result, pastTitle, past);
  paintPast();
  paintButton();
  return {
    el: section,
    setAnswered(n: number) {
      answered = n;
      if (!busy) paintButton();
    }
  };
}


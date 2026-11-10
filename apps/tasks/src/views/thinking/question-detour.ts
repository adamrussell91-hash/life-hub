// apps/tasks/src/views/thinking/question-detour.ts
// A Thought Starter detour: the questions the thread chose (2 to 4), answered here. Their text is
// read at run time from the Question Book's API, never kept in the code. Tick the lines to send
// back, then Send back lands them on the thread as the detour's packet.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { questionBookApi, type QbQuestion } from '../question-book/api';
import { threadsApi } from './api';
import { THREAD_CHANGED_EVENT } from './checkin-card';
import { detourHref } from './landing-block';
import type { Thread, ThreadSession } from './types';

/** The questions chosen for the detour, in the order the thread chose them. */
export function pickQuestions(all: readonly QbQuestion[], ids: readonly string[]): QbQuestion[] {
  return ids.map((id) => all.find((q) => q.id === id)).filter((q): q is QbQuestion => Boolean(q));
}

/** The lines to send back: the ticked, non-empty answers, trimmed. */
export function linesToSend(rows: readonly { ticked: boolean; answer: string }[]): string[] {
  return rows.filter((r) => r.ticked).map((r) => r.answer.trim()).filter(Boolean);
}

export function mountQuestionDetour(host: HTMLElement, thread: Thread, session: ThreadSession): void {
  host.classList.add('tt-qd');
  host.replaceChildren(el('p', 'canvas-status', 'Loading the questions…'));
  const home = thread.sessions.find((s) => s.sessionId === session.from?.sessionId);

  const done = (s: ThreadSession) => {
    const box = el('section', 'tt-card');
    box.append(el('p', 'tt-card__eyebrow', 'Sent back'), el('p', 'tt-land__answer', s.packet?.answer ?? ''));
    if (s.packet?.detail) box.append(el('p', 'tt-land__detail', s.packet.detail));
    if (home) {
      const back = el('a', 'btn btn--primary tt-btn', 'Back to where you left off') as HTMLAnchorElement;
      back.href = detourHref(thread, home);
      box.append(back);
    }
    host.replaceChildren(box);
  };

  if (session.state === 'returned') {
    done(session);
    return;
  }
  const chosen = session.questions;
  if (!chosen) {
    host.replaceChildren(el('p', 'canvas-status', 'This detour has no questions.'));
    return;
  }
  void questionBookApi.chapter(chosen.chapterId).then((data) => {
    const questions = pickQuestions(data.questions, chosen.questionIds);
    if (!questions.length) {
      host.replaceChildren(el('p', 'canvas-status', 'The questions could not be found.'));
      return;
    }
    const form = el('form', 'tt-qd__form') as HTMLFormElement;
    if (session.question) form.append(el('p', 'tt-land__question', session.question));
    const rows: { ticked: boolean; answer: string }[] = questions.map(() => ({ ticked: false, answer: '' }));
    const send = el('button', 'btn btn--primary tt-btn', 'Send back') as HTMLButtonElement;
    send.type = 'submit';
    send.disabled = true;
    const status = el('p', 'tt-card__status');
    status.setAttribute('role', 'status');
    const refresh = () => {
      send.disabled = linesToSend(rows).length === 0;
    };
    const list = el('ol', 'tt-qd__list');
    questions.forEach((q, i) => {
      const item = el('li', 'tt-qd__item');
      const label = el('label', 'tt-qd__label');
      const prompt = el('span', 'tt-qd__prompt', q.prompt);
      const input = el('textarea', 'tt-input tt-qd__answer') as HTMLTextAreaElement;
      input.rows = 3;
      input.addEventListener('input', () => {
        rows[i].answer = input.value;
        if (!input.value.trim()) {
          rows[i].ticked = false;
          tick.checked = false;
        } else if (!tick.dataset.touched) {
          rows[i].ticked = true;
          tick.checked = true;
        }
        refresh();
      });
      label.append(prompt, input);
      const tickLabel = el('label', 'tt-qd__tick');
      const tick = el('input') as HTMLInputElement;
      tick.type = 'checkbox';
      tick.addEventListener('change', () => {
        tick.dataset.touched = '1';
        rows[i].ticked = tick.checked;
        refresh();
      });
      tickLabel.append(tick, document.createTextNode(' Send this line back'));
      item.append(label, tickLabel);
      list.append(item);
    });
    form.append(list, status, send);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const lines = linesToSend(rows);
      if (!lines.length) return;
      send.disabled = true;
      try {
        const fresh = await threadsApi.get(thread.id);
        const next = await threadsApi.land(fresh, session.sessionId, { lines });
        window.dispatchEvent(new CustomEvent(THREAD_CHANGED_EVENT, { detail: { thread: next } }));
        const landed = next.sessions.find((s) => s.sessionId === session.sessionId);
        if (landed) done(landed);
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not send that back.');
        refresh();
      }
    });
    host.replaceChildren(form);
  }, (err) => {
    host.replaceChildren(el('p', 'canvas-status', errorMessage(err, 'Could not load the questions.')));
  });
}

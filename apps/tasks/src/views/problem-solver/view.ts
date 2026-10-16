// apps/tasks/src/views/problem-solver/view.ts
import '../../../../../packages/problem-solver/problem-solver.css';
import './problem-solver-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { isBusy, pollUntilSettled, problemSolverApi } from './api';
import { mountCanvas } from './canvas';
import { renderCoachPanel } from './coach-panel';

let poll: AbortController | null = null;

const PHASE_LABEL: Record<PsSession['phase'], string> = { frame: 'Framing', define: 'Defining', defined: 'Defined' };

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-scope');
  const start = el('form', 'ps-start') as HTMLFormElement;
  const input = el('textarea', 'hub-ai-bar__input ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What problem are you trying to solve?';
  input.setAttribute('aria-label', 'Describe the problem');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  start.append(el('h2', 'section-title', 'New problem'), input, go, status);
  start.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    go.disabled = true;
    try {
      const session = await problemSolverApi.create({ text });
      location.hash = `#/problem-solver?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  page.append(start);

  const sessions = await problemSolverApi.list();
  const list = el('ul', 'ps-list');
  for (const row of sessions.filter((item) => item.status !== 'archived')) {
    const item = el('li', 'ps-list__item');
    const link = el('a', 'ps-list__link', row.title) as HTMLAnchorElement;
    link.href = `#/problem-solver?id=${row.id}`;
    const meta = [PHASE_LABEL[row.phase], row.tool ? TOOLS[row.tool].name : null, formatDisplayDate(row.updatedAt.slice(0, 10))].filter(Boolean).join(' · ');
    item.append(link, el('span', 'ps-list__meta', meta));
    list.append(item);
  }
  page.append(el('h2', 'section-title', 'Problems'), sessions.length ? list : el('p', 'ps-empty', 'Nothing yet. Start with the problem that is bugging you most.'));
  canvas.replaceChildren(page);
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await problemSolverApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope');
  const back = el('a', 'ps-back', '← Problems') as HTMLAnchorElement;
  back.href = '#/problem-solver';
  const title = el('h2', 'ps-session__title', session.title);
  const board = el('div', 'ps-session__board');
  const canvasHost = el('div', 'ps-canvas');
  const coachHost = el('div', 'ps-coach-host');
  board.append(canvasHost, coachHost);
  page.append(back, title, board);
  canvas.replaceChildren(page);
  const diagram = mountCanvas(canvasHost);

  const paint = (next: PsSession) => {
    session = next;
    diagram.update(session);
    coachHost.replaceChildren(renderCoachPanel(session, { onSay: (text) => void act('say', text), onAction: (action) => void act(action) }));
    coachHost.querySelector('.ps-coach__messages')?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  };

  const settle = async () => {
    poll?.abort();
    poll = new AbortController();
    try {
      paint(await pollUntilSettled(session.id, paint, { signal: poll.signal }));
    } catch {
      /* aborted on navigation */
    }
  };

  async function act(action: PsAction, text?: string): Promise<void> {
    try {
      paint(await problemSolverApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
        return;
      }
      coachHost.prepend(el('p', 'ps-coach__status ps-coach__status--failed', errorMessage(err)));
      return;
    }
    if (isBusy(session)) await settle();
  }

  paint(session);
  if (isBusy(session)) await settle();
}

export async function renderProblemSolverView(canvas: HTMLElement): Promise<void> {
  poll?.abort();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderProblemSolverView(canvas), 'Could not load Problem Solver');
  }
}

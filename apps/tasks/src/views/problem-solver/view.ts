// apps/tasks/src/views/problem-solver/view.ts
import '../../../../../packages/problem-solver/problem-solver.css';
import './problem-solver-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { EMBLEM_SVG, skillGlyph, toolEmblem } from '../../../../../packages/problem-solver/glyphs';
import { SKILLS } from '../../../../../packages/problem-solver/skills.mjs';
import { TOOLS, TOOL_IDS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { stepName } from '../../../../../packages/problem-solver/steps.mjs';
import type { PsAction, PsSession, PsSummary, PsToolId } from '../../../../../packages/problem-solver/types';
import { isBusy, pollUntilSettled, problemSolverApi } from './api';
import { mountCanvas } from './canvas';
import { mountCoachPanel } from './coach-panel';
import { art, createShapeBoard, createTrack, FRAME_PIECES, problemMedal } from './decor';

let poll: AbortController | null = null;

const phaseLabel = (row: PsSummary): string => (row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase);
const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--ps-blue)' : phase === 'finished' ? 'var(--ps-red)' : 'var(--ps-yellow)');
const COLOURS = ['var(--ps-red)', 'var(--ps-yellow)', 'var(--ps-blue)'];

function section(title: string, aside: string, ...body: Node[]): HTMLElement {
  const wrap = el('section', 'ps-section');
  const head = el('div', 'ps-section__head');
  head.append(el('h2', 'section-title ps-section__title', title), el('p', 'ps-section__aside', aside));
  wrap.append(head, ...body);
  return wrap;
}

function startForm(onType: () => void): HTMLFormElement {
  const start = el('form', 'ps-start') as HTMLFormElement;
  const input = el('textarea', 'ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What problem are you trying to solve? Say it the way you would to a friend.';
  input.setAttribute('aria-label', 'Describe the problem');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  const row = el('div', 'ps-start__row');
  row.append(status, go);
  start.append(el('h2', 'ps-start__title', 'New problem'), input, row);
  input.addEventListener('input', () => {
    start.classList.remove('is-typing');
    void start.offsetWidth;
    start.classList.add('is-typing');
    onType();
  });
  start.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    go.disabled = true;
    status.textContent = '';
    try {
      const session = await problemSolverApi.create({ text });
      location.hash = `#/problem-solver?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  return start;
}

function problemCard(row: PsSummary, index: number): HTMLLIElement {
  const item = el('li', 'ps-prob') as HTMLLIElement;
  item.style.setProperty('--i', String(index));
  const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
  link.href = `#/problem-solver?id=${row.id}`;
  const medal = el('span', 'ps-prob__medal');
  const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
  medal.append(problemMedal(frame, row.tool));
  const body = el('span', 'ps-prob__body');
  const meta = el('span', 'ps-prob__meta');
  const phase = el('span', 'ps-prob__phase', phaseLabel(row));
  phase.style.setProperty('--c', phaseColour(row.phase));
  meta.append(phase, el('span', '', row.tool ? TOOLS[row.tool].name : row.phase === 'frame' ? `Question ${Math.min(frame + 1, 3)} of 3` : ''), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
  body.append(el('span', 'ps-prob__title', row.title), meta);
  const seen = Object.keys(row.skills ?? {});
  if (seen.length) {
    const glyphs = el('span', 'ps-prob__skills');
    glyphs.append(...seen.slice(0, 6).map((id) => skillGlyph(id)));
    body.append(glyphs);
  }
  link.append(medal, body);
  item.append(link);
  return item;
}

function buildSteps(): HTMLElement {
  const steps: Array<[string, string, string, SVGSVGElement | HTMLElement]> = [
    ['Frame', 'Three questions', 'What is the goal, what is true and what can be done. Each answer drops a piece into place.',
      art(`<path class="ps-build__a1" fill="var(--ps-blue)" d="${FRAME_PIECES.top}"/><path class="ps-build__a2" fill="var(--ps-yellow)" d="${FRAME_PIECES.mid}"/><path class="ps-build__a3" fill="var(--ps-red)" d="${FRAME_PIECES.bot}"/>`, 'ps-build__assemble')],
    ['Define', 'The coach picks a tool', '5 Whys for one clear symptom, a problem tree when causes tangle. The chart draws as you answer.', cyclingEmblem()],
    ['Skills', 'Thinking you used', "Answers earn the book's thinking skill marks, so you can see which ones you lean on.",
      art('<g class="ps-spin"><circle cx="50" cy="50" r="48" fill="var(--ps-ghost)"/><path fill="var(--ps-red)" d="M50 2A48 48 0 0 0 50 98Z"/><path fill="var(--ps-blue)" d="M50 50V2A48 48 0 0 1 98 50Z"/></g><circle cx="50" cy="50" r="14" fill="var(--ps-card)"/>')],
    ['Defined', 'A record you can act on', 'Finish with SMART objectives and a black and white record of every step.',
      art('<path fill="var(--ps-yellow)" d="M83.94 16.06A48 48 0 0 0 16.06 83.94Z"/><path fill="var(--ps-blue)" d="M83.94 16.06A48 48 0 0 1 16.06 83.94Z"/><path class="ps-spin ps-spin--fast" fill="var(--ps-red)" d="M50 30L70 66H30Z"/>')]
  ];
  const list = el('ol', 'ps-build');
  steps.forEach(([label, title, detail, drawing], i) => {
    const step = el('li', 'ps-build__step');
    const figure = el('span', 'ps-build__art');
    figure.append(drawing);
    step.append(figure, el('span', 'ps-build__n', `${i + 1} · ${label}`), el('h3', 'ps-build__title', title), el('p', 'ps-build__detail', detail));
    list.append(step);
  });
  return list;
}

function cyclingEmblem(): HTMLElement {
  const holder = el('span', 'ps-build__cycle');
  const order: PsToolId[] = ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'smart'];
  let i = 0;
  const show = () => {
    const drawing = art(EMBLEM_SVG[order[i % order.length]], 'ps-pop');
    holder.replaceChildren(drawing);
    i += 1;
  };
  show();
  if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    const timer = setInterval(() => (holder.isConnected ? !document.hidden && show() : clearInterval(timer)), 2400);
  }
  return holder;
}

function toolShelf(): HTMLElement {
  const shelf = el('ul', 'ps-shelf');
  for (const id of TOOL_IDS as PsToolId[]) {
    const item = el('li', 'ps-shelf__tool');
    item.append(toolEmblem(id), el('span', 'ps-shelf__name', TOOLS[id].name), el('span', 'ps-shelf__when', TOOLS[id].when));
    shelf.append(item);
  }
  return shelf;
}

function skillsRibbon(sessions: PsSummary[]): HTMLElement {
  const totals: Record<string, number> = {};
  for (const row of sessions) for (const [id, n] of Object.entries(row.skills ?? {})) totals[id] = (totals[id] ?? 0) + n;
  const max = Math.max(1, ...Object.values(totals));
  const grid = el('ul', 'ps-skills');
  SKILLS.forEach((skill, i) => {
    const n = totals[skill.id] ?? 0;
    const item = el('li', `ps-skills__item${n ? '' : ' is-unused'}`);
    item.title = skill.description;
    const text = el('span', 'ps-skills__text');
    const bar = el('span', 'ps-skills__bar');
    const fill = el('i');
    fill.style.setProperty('--w', `${(n / max) * 100}%`);
    fill.style.setProperty('--c', COLOURS[i % 3]);
    bar.append(fill);
    text.append(el('span', 'ps-skills__name', skill.name), el('span', 'ps-skills__count', n ? `${n}×` : 'Not yet'), bar);
    item.append(skillGlyph(skill.id), text);
    grid.append(item);
  });
  return grid;
}

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-landing ps-scope');
  const board = createShapeBoard();
  const hero = el('div', 'ps-hero');
  const copy = el('div', 'ps-hero__copy');
  copy.append(
    el('p', 'ps-hero__lede', 'Name the thing that is stuck. A coach asks one question at a time and builds the toolkit’s charts with you, piece by piece.'),
    startForm(() => board.nudge())
  );
  hero.append(copy, board.el);
  page.append(hero);

  const sessions = (await problemSolverApi.list()).filter((item) => item.status !== 'archived');
  const problems = el('ul', 'ps-probs');
  problems.append(...sessions.map(problemCard));
  const fresh = el('li', 'ps-prob ps-prob--new');
  const freshButton = el('button', 'ps-prob__new', '+ New problem') as HTMLButtonElement;
  freshButton.type = 'button';
  freshButton.addEventListener('click', () => {
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')?.focus();
    page.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  });
  fresh.append(freshButton);
  problems.append(fresh);

  page.append(
    section('Problems', sessions.length ? 'Each badge fills in as you go. Blue, yellow and red are the three framing questions; the centre is the tool in use.' : 'Nothing yet. Start with the problem that is bugging you most.', problems),
    section('How a session builds', 'The order follows the toolkit’s problem solving process.', buildSteps()),
    section('The toolkit', 'Seven Define tools. The coach chooses, and this is what each one is for.', toolShelf()),
    section('Thinking skills you have used', 'Totals across your problems. Faint marks have not come up yet.', skillsRibbon(sessions))
  );
  canvas.replaceChildren(page);
}

/** The twelve skill marks; ones seen in this session fill in, newly earned ones pop. */
function createSkillTray(): { el: HTMLElement; update(session: PsSession): void } {
  const tray = el('div', 'ps-tray');
  const head = el('div', 'ps-tray__head');
  const count = el('span', 'ps-tray__count');
  head.append(el('h3', 'ps-tray__title', 'Thinking skills this session'), count);
  const slots = el('ul', 'ps-tray__slots');
  const byId = new Map<string, HTMLElement>();
  for (const skill of SKILLS) {
    const slot = el('li', 'ps-tray__slot');
    slot.title = skill.name;
    slot.append(skillGlyph(skill.id));
    slots.append(slot);
    byId.set(skill.id, slot);
  }
  tray.append(head, slots);
  let first = true;
  return {
    el: tray,
    update(session) {
      const seen = new Set(session.turns.flatMap((turn) => turn.skillsSeen ?? []));
      let delay = 0;
      for (const [id, slot] of byId) {
        const on = seen.has(id);
        if (on && !slot.classList.contains('is-on') && !first) {
          slot.style.setProperty('--d', `${delay}ms`);
          delay += 220;
          slot.classList.add('is-earned');
          setTimeout(() => slot.classList.remove('is-earned'), 1200 + delay);
        }
        slot.classList.toggle('is-on', on);
      }
      count.textContent = `${seen.size} of ${SKILLS.length}`;
      first = false;
    }
  };
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await problemSolverApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope');
  const back = el('a', 'ps-back', '← Problems') as HTMLAnchorElement;
  back.href = '#/problem-solver';
  const title = el('h2', 'ps-session__title', session.title);
  const track = createTrack();
  const board = el('div', 'ps-session__board');
  const bench = el('div', 'ps-bench');
  const canvasHost = el('div', 'ps-canvas');
  const tray = createSkillTray();
  bench.append(canvasHost, tray.el);
  const coach = mountCoachPanel({ onSay: (text) => void act('say', text), onAction: (action) => void act(action) });
  const coachHost = el('div', 'ps-coach-host');
  coachHost.append(coach.el);
  board.append(bench, coachHost);
  page.append(back, title, track.el, board);
  canvas.replaceChildren(page);
  const diagram = mountCanvas(canvasHost, { onScore: (scores) => void rescore(scores) });

  const flash = (err: unknown) => {
    coachHost.querySelector('.ps-coach__status--failed.is-transient')?.remove();
    const note = el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err));
    coach.el.querySelector('.ps-coach__extras')?.prepend(note);
  };

  const paint = (next: PsSession) => {
    session = next;
    if (title.textContent !== session.title) title.textContent = session.title;
    track.update(session);
    diagram.update(session);
    tray.update(session);
    coach.update(session);
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
      flash(err);
      return;
    }
    if (isBusy(session)) await settle();
  }

  async function rescore(scores: { current: number[]; objective: number[] }): Promise<void> {
    try {
      paint(await problemSolverApi.rescore(session, scores));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
        return;
      }
      flash(err);
    }
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

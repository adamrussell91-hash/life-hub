/**
 * Grove: the year's finished work as one forest island. Each week is a piece of the island; every
 * finished task is a tree; real milestones bring animals. Tap a week to step in, tap a tree or an
 * animal to see what it stands for. Task records are read-only here.
 */
import { applyGroveHistory } from '@/domain/grove/private-history';
import { isGroveHistoryId } from '@/domain/grove/private-history';
import { groveCompletions } from '@/domain/grove/plan';
import { groveBooks } from '@/domain/grove/books';
import { groveTerms } from '@/domain/grove/calendar';
import { SPECIES_LABEL } from '@/domain/grove/assets';
import { taskPageHash } from '@/domain/cards';
import { toHubDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { tasksApi } from '@/services/client-api';
import { TASKS_CHANGED, TASKS_DELETED } from '@/services/task-cache';
import { renderLoadError } from '@/views/feedback';
import { forestAnimals, forestHistory } from './forest/data';
import type { ForestHandle, ForestPick, ForestState } from './forest/scene';
import './grove.css';

let detach: (() => void) | null = null;
let forest: ForestHandle | null = null;
let generation = 0;

/** `#/grove?year=2025&week=10`. Older links (`view=…&date=…`) open the year of their date. */
export function forestRoute(query: URLSearchParams, today: string): { year: number; week: number | null } {
  const thisYear = Number(today.slice(0, 4));
  const rawYear = Number(query.get('year') ?? query.get('date')?.slice(0, 4));
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= thisYear ? rawYear : thisYear;
  const rawWeek = Number(query.get('week'));
  return { year, week: Number.isInteger(rawWeek) && rawWeek >= 1 && rawWeek <= 52 ? rawWeek : null };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const short = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = (d: Date) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;

export async function renderGroveView(canvas: HTMLElement): Promise<void> {
  unmountGroveView();
  const gen = generation;
  const today = toHubDateKey(new Date());
  const route = forestRoute(new URLSearchParams(hashQuery()), today);

  const page = el('div', 'grove-page');
  const stage = el('div', 'grove-stage');
  stage.setAttribute('aria-label', `Grove ${route.year}: the year's finished work as a forest`);
  const veil = el('div', 'grove-veil');
  veil.append(el('span', 'grove-veil__dot'), el('span', '', 'Growing the forest…'));
  const top = el('div', 'grove-top');
  const title = el('div', 'grove-title');
  title.setAttribute('role', 'status');
  title.setAttribute('aria-live', 'polite');
  const heading = el('strong', 'grove-title__main', String(route.year));
  const meta = el('span', 'grove-title__meta');
  title.append(heading, meta);
  const year = el('button', 'grove-year');
  year.type = 'button';
  year.hidden = true;
  year.innerHTML = '<span aria-hidden="true">‹</span> Year';
  year.setAttribute('aria-label', `Back to ${route.year}`);
  top.append(title, year);
  const hint = el('p', 'grove-hint', 'Tap a week to step inside');
  const card = el('div', 'grove-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  page.append(stage, veil, top, hint, card);
  canvas.replaceChildren(page);

  const fitPage = fitToViewport(page);
  const closeCard = () => { card.hidden = true; };

  function paint(state: ForestState): void {
    if (state.week == null) {
      heading.textContent = String(state.year);
      meta.textContent = [plural(state.trees, 'tree'), state.animals ? plural(state.animals, 'animal') : ''].filter(Boolean).join(' · ');
    } else {
      heading.textContent = `Week ${state.week}`;
      meta.textContent = `${short(state.from!)} – ${short(state.to!)} · ${state.future ? 'still to come' : plural(state.trees, 'tree')}`;
    }
    year.hidden = state.week == null;
    if (state.week != null) hint.hidden = true;
    closeCard();
  }

  function showCard(pick: ForestPick | null, x: number, y: number): void {
    if (!pick) { closeCard(); return; }
    hint.hidden = true;
    const rows: HTMLElement[] = [];
    if (pick.kind === 'tree') {
      card.setAttribute('aria-label', 'Tree');
      rows.push(el('p', 'grove-card__title', pick.title));
      rows.push(el('p', 'grove-card__meta', `${SPECIES_LABEL[pick.species]}${pick.late ? ' · finished after its deadline' : ''}`));
      rows.push(el('p', 'grove-card__meta', `Finished ${long(pick.completed)}`));
      if (!isGroveHistoryId(pick.id)) {
        const open = el('a', 'grove-card__link', 'Open task');
        open.href = taskPageHash(pick.id);
        rows.push(open);
      }
    } else {
      card.setAttribute('aria-label', pick.animal.name);
      rows.push(el('p', 'grove-card__title', pick.animal.name));
      rows.push(el('p', 'grove-card__meta', pick.animal.reason));
      rows.push(el('p', 'grove-card__meta', `Arrived ${long(new Date(pick.animal.earnedOn + 'T12:00:00+10:00'))}`));
    }
    card.replaceChildren(...rows);
    card.hidden = false;
    const bounds = page.getBoundingClientRect();
    if (bounds.width < 720) {
      card.style.removeProperty('left');
      card.style.removeProperty('top');
      return;
    }
    const left = Math.min(Math.max(12, x - bounds.left + 14), bounds.width - card.offsetWidth - 12);
    const topPx = Math.min(Math.max(12, y - bounds.top + 14), bounds.height - card.offsetHeight - 12);
    card.style.left = `${left}px`;
    card.style.top = `${topPx}px`;
  }

  async function grow(): Promise<void> {
    let tasks, prefs, profile, books;
    try {
      [tasks, prefs, profile, books] = await Promise.all([
        tasksApi.listTasks({ includeCachedOnly: false }),
        tasksApi.getHubPrefs().catch(() => null),
        tasksApi.getPlanningProfile().catch(() => null),
        groveBooks().catch(() => [])
      ]);
    } catch (err) {
      if (gen !== generation) return;
      veil.hidden = true;
      renderLoadError(stage, err, () => void renderGroveView(canvas), 'Could not load finished tasks');
      return;
    }
    if (gen !== generation) return;
    const now = new Date();
    const inputs = applyGroveHistory({ history: prefs?.grove_history, tasks, terms: groveTerms({ hubPrefs: prefs, planningProfile: profile }), books, now });
    const { completions } = groveCompletions(inputs.tasks);
    const history = forestHistory(completions, route.year);
    const animals = forestAnimals(completions, inputs.terms, inputs.books, route.year, toHubDateKey(now));
    const { mountForest } = await import('./forest/scene');
    if (gen !== generation) return;
    const previous = forest;
    const next = el('div', 'grove-stage__layer');
    stage.append(next);
    try {
      const handle = await mountForest(next, {
        year: route.year,
        today: now,
        history,
        animals,
        topInset: () => top.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 12,
        onChange: paint,
        onPick: showCard
      });
      if (gen !== generation) { handle.dispose(); next.remove(); return; }
      forest = handle;
      previous?.dispose();
      for (const old of [...stage.children]) if (old !== next) old.remove();
      page.dataset.trees = String(history.length);
      page.dataset.animals = String(animals.length);
      veil.hidden = true;
      if (route.week != null && !previous) handle.expand(route.week);
    } catch (error) {
      if (gen !== generation) return;
      console.error(error);
      next.remove();
      veil.hidden = true;
      if (!previous) stage.replaceChildren(el('p', 'grove-status', 'The forest could not draw on this device.'));
    }
  }

  year.addEventListener('click', () => { closeCard(); forest?.showYear(); });
  // Finishing or reopening a task replants; so does coming back to the page on a new day.
  let pending = 0;
  const replant = () => { window.clearTimeout(pending); pending = window.setTimeout(() => void grow(), 600); };
  let day = today;
  const onVisible = () => { if (!document.hidden && toHubDateKey(new Date()) !== day) { day = toHubDateKey(new Date()); replant(); } };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!card.hidden) closeCard();
    else if (!year.hidden) forest?.showYear();
  };
  window.addEventListener(TASKS_CHANGED, replant);
  window.addEventListener(TASKS_DELETED, replant);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('keydown', onKey);
  detach = () => {
    window.clearTimeout(pending);
    window.removeEventListener(TASKS_CHANGED, replant);
    window.removeEventListener(TASKS_DELETED, replant);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('keydown', onKey);
    fitPage();
  };
  await grow();
}

/**
 * The forest fills the window below the page title (above the tab bar on a phone), and the
 * reminder strip steps aside while Grove is open. Returns its cleanup.
 */
function fitToViewport(page: HTMLElement): () => void {
  const root = document.documentElement;
  root.classList.add('grove-immersive');
  const phone = window.matchMedia('(max-width: 719px)');
  const fit = () => {
    const nav = phone.matches ? document.querySelector<HTMLElement>('.hub-mobile-nav')?.offsetHeight ?? 0 : 0;
    const top = page.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(320, Math.round(window.innerHeight - top - nav - (phone.matches ? 0 : 20)));
    if (Math.abs(page.offsetHeight - height) > 2) page.style.height = `${height}px`;
  };
  // Writing height inside the body's observer delivery can trigger WebKit's resize-loop error.
  let frame = 0;
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; fit(); });
  }) : null;
  observer?.observe(document.body);
  window.addEventListener('resize', fit);
  fit();
  return () => {
    root.classList.remove('grove-immersive');
    observer?.disconnect();
    window.removeEventListener('resize', fit);
    if (frame) cancelAnimationFrame(frame);
  };
}

/** Called by the shell when another view takes the canvas. */
export function unmountGroveView(): void {
  detach?.();
  detach = null;
  forest?.dispose();
  forest = null;
  generation += 1;
}

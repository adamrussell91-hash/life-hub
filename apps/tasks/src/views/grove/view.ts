/**
 * Grove: the year's finished work as one forest island. Each week is a piece of the island; every
 * finished task is a tree; real milestones bring animals. Tap a week to step in, tap a tree or an
 * animal to see what it stands for. Task records are read-only here.
 */
import { isGroveHistoryId } from '@/domain/grove/private-history';
import { SPECIES_LABEL } from '@/domain/grove/assets';
import { taskPageHash } from '@/domain/cards';
import { toHubDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { TASKS_CHANGED, TASKS_DELETED } from '@/services/task-cache';
import { renderLoadError } from '@/views/feedback';
import { groveAssetUrl } from './asset-url';
import { loadForest } from './forest/load';
import { weekOfDay } from './forest/history';
import { animalGlyph, groveKey } from './forest/key';
import type { ForestAnimal, ForestHandle, ForestPick, ForestState } from './forest/scene';
import './grove.css';

let detach: (() => void) | null = null;
let forest: ForestHandle | null = null;
let generation = 0;

/** `#/grove?year=2025&week=10`. Older links (`view=…&date=…`) open the year of their date. */
export function forestRoute(query: URLSearchParams, today: string): { year: number; week: number | null } {
  const thisYear = Number(today.slice(0, 4));
  const rawYear = Number(query.get('year') ?? query.get('date')?.slice(0, 4));
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= thisYear ? rawYear : thisYear;
  // `week=this` (Home's preview links here) opens the current week.
  const rawWeek = query.get('week') === 'this' && year === thisYear ? weekOfDay(today, year) : Number(query.get('week'));
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

const ICON = {
  turnLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 3v5h5"/></svg>',
  turnRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v5h-5"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  shrink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>'
};

function iconButton(className: string, label: string, icon: string): HTMLButtonElement {
  const button = el('button', `grove-icon ${className}`);
  button.type = 'button';
  button.innerHTML = icon;
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}

const animalLabel = (animal: ForestAnimal, young: boolean) => `${animal.name}${young ? ' and young' : ''}`;

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
  const actions = el('div', 'grove-actions');
  const keyButton = iconButton('grove-key-toggle', 'What everything means', ICON.key);
  keyButton.setAttribute('aria-expanded', 'false');
  keyButton.setAttribute('aria-controls', 'grove-key');
  top.append(title, actions);

  // Animal tray: every animal out in the forest; pick one and the camera follows it.
  const tray = el('nav', 'grove-tray');
  tray.setAttribute('aria-label', 'Animals');
  tray.hidden = true;
  const trayToggle = el('button', 'grove-tray__toggle');
  trayToggle.type = 'button';
  trayToggle.setAttribute('aria-controls', 'grove-tray-list');
  const trayCount = el('span', 'grove-tray__count');
  trayToggle.append(el('span', 'grove-tray__paw', '🐾'), el('span', 'grove-tray__heading', 'Animals'), trayCount, el('span', 'grove-tray__chevron'));
  const trayList = el('ul', 'grove-tray__list');
  trayList.id = 'grove-tray-list';
  tray.append(trayToggle, trayList);
  const setTray = (open: boolean) => { tray.classList.toggle('is-open', open); trayToggle.setAttribute('aria-expanded', String(open)); trayToggle.title = open ? 'Close the animal tray' : 'Open the animal tray'; };
  setTray(window.matchMedia('(min-width: 1024px)').matches);

  // Following chip, turn and full-screen buttons.
  const followChip = el('div', 'grove-follow');
  followChip.hidden = true;
  followChip.setAttribute('role', 'status');
  const followText = el('span', 'grove-follow__text');
  const followStop = el('button', 'grove-follow__stop', 'Stop');
  followStop.type = 'button';
  followChip.append(followText, followStop);
  // A column of round buttons down the top right, clear of the hub's chat button in the bottom corner.
  const tools = el('div', 'grove-tools');
  const turnLeft = iconButton('', 'Turn the view left', ICON.turnLeft);
  const turnRight = iconButton('', 'Turn the view right', ICON.turnRight);
  const full = iconButton('', 'Full screen', ICON.expand);
  tools.append(keyButton, full, turnLeft, turnRight);
  actions.append(year, tools);

  // Key: what each tree, animal and piece of land means. Built the first time it opens.
  const keyPanel = el('aside', 'grove-key');
  keyPanel.id = 'grove-key';
  keyPanel.hidden = true;
  keyPanel.setAttribute('aria-label', 'What everything means');

  const hint = el('p', 'grove-hint', 'Tap a week to step inside');
  const card = el('div', 'grove-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  page.append(stage, veil, top, tray, followChip, keyPanel, hint, card);
  canvas.replaceChildren(page);

  const fitPage = fitToViewport(page);
  const closeCard = () => { card.hidden = true; };

  let followed: ForestAnimal | null = null;
  function renderTray(): void {
    const list = forest?.animals() ?? [];
    tray.hidden = list.length === 0;
    trayCount.textContent = String(list.length);
    trayList.replaceChildren(...list.map((entry) => {
      const item = el('li');
      const button = el('button', 'grove-tray__item');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(entry.animal === followed));
      const label = animalLabel(entry.animal, entry.young);
      button.title = `Follow the ${label.toLowerCase()}`;
      const text = el('span', 'grove-tray__text');
      const week = weekOfDay(entry.animal.earnedOn, route.year);
      text.append(el('strong', '', label), el('small', '', `Week ${week} · ${entry.animal.reason}`));
      button.append(el('span', 'grove-tray__glyph', animalGlyph(entry.animal.model, entry.animal.species)), text);
      button.addEventListener('click', () => {
        closeCard();
        forest?.follow(entry.animal === followed ? null : entry.key);
        if (window.matchMedia('(max-width: 719px)').matches) setTray(false);
      });
      item.append(button);
      return item;
    }));
  }
  function onFollow(animal: ForestAnimal | null): void {
    followed = animal;
    followChip.hidden = !animal;
    if (animal) {
      followText.replaceChildren(el('span', 'grove-follow__glyph', animalGlyph(animal.model, animal.species)), document.createTextNode(`Following the ${animal.name.toLowerCase()}`));
      hint.hidden = true;
    }
    for (const button of trayList.querySelectorAll<HTMLButtonElement>('.grove-tray__item')) button.setAttribute('aria-pressed', 'false');
    const list = forest?.animals() ?? [];
    const at = list.findIndex((e) => e.animal === animal);
    trayList.querySelectorAll<HTMLButtonElement>('.grove-tray__item')[at]?.setAttribute('aria-pressed', 'true');
  }

  function buildKey(): void {
    const head = el('div', 'grove-key__head');
    const close = iconButton('grove-key__close', 'Close', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    close.addEventListener('click', () => setKey(false));
    head.append(el('h2', 'grove-key__title', 'What everything means'), close);
    const body = el('div', 'grove-key__body');
    for (const section of groveKey()) {
      const block = el('section', 'grove-key__section');
      block.append(el('h3', 'grove-key__heading', section.title));
      if (section.lede) block.append(el('p', 'grove-key__lede', section.lede));
      const list = el('ul', 'grove-key__list');
      for (const entry of section.entries) {
        const item = el('li', 'grove-key__item');
        const thumb = el('span', 'grove-key__thumb');
        if (entry.preview) {
          const img = el('img');
          img.src = groveAssetUrl(entry.preview);
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          thumb.append(img);
        } else if (entry.glyph) thumb.textContent = entry.glyph;
        else thumb.classList.add('grove-key__thumb--' + entry.name.split(' ')[0]!.toLowerCase());
        const copy = el('span', 'grove-key__copy');
        copy.append(el('strong', '', entry.name), el('span', '', entry.meaning));
        item.append(thumb, copy);
        list.append(item);
      }
      block.append(list);
      body.append(block);
    }
    keyPanel.replaceChildren(head, body);
  }
  function setKey(open: boolean): void {
    if (open && !keyPanel.childElementCount) buildKey();
    keyPanel.hidden = !open;
    keyButton.setAttribute('aria-expanded', String(open));
    if (open) closeCard();
  }

  // Full screen: the browser's own where it has one (not iPhone Safari), else the page fills the window.
  const fullscreenApi = typeof page.requestFullscreen === 'function' && document.fullscreenEnabled;
  const isFull = () => document.fullscreenElement === page || page.classList.contains('is-full');
  function syncFull(): void {
    const on = isFull();
    full.innerHTML = on ? ICON.shrink : ICON.expand;
    full.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    full.title = on ? 'Leave full screen' : 'Full screen';
    document.documentElement.classList.toggle('grove-full', on);
  }
  function toggleFull(): void {
    if (isFull()) {
      if (document.fullscreenElement === page) void document.exitFullscreen();
      page.classList.remove('is-full');
    } else if (fullscreenApi) page.requestFullscreen().catch(() => page.classList.add('is-full')).finally(syncFull);
    else page.classList.add('is-full');
    syncFull();
  }

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
      const entry = forest?.animals().find((e) => e.animal === pick.animal);
      if (entry && entry.animal !== followed) {
        const go = el('button', 'grove-card__link grove-card__button', 'Follow');
        go.type = 'button';
        go.addEventListener('click', () => { closeCard(); forest?.follow(entry.key); });
        rows.push(go);
      }
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
    const now = new Date();
    let history, animals;
    try {
      ({ history, animals } = await loadForest(route.year, now));
    } catch (err) {
      if (gen !== generation) return;
      veil.hidden = true;
      renderLoadError(stage, err, () => void renderGroveView(canvas), 'Could not load finished tasks');
      return;
    }
    if (gen !== generation) return;
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
        onPick: showCard,
        onFollow
      });
      if (gen !== generation) { handle.dispose(); next.remove(); return; }
      forest = handle;
      previous?.dispose();
      for (const old of [...stage.children]) if (old !== next) old.remove();
      page.dataset.trees = String(history.length);
      page.dataset.animals = String(animals.length);
      followed = null;
      onFollow(null);
      renderTray();
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
  trayToggle.addEventListener('click', () => setTray(!tray.classList.contains('is-open')));
  followStop.addEventListener('click', () => forest?.follow(null));
  keyButton.addEventListener('click', () => setKey(keyPanel.hidden));
  turnLeft.addEventListener('click', () => forest?.rotate(-Math.PI / 4));
  turnRight.addEventListener('click', () => forest?.rotate(Math.PI / 4));
  full.addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', syncFull);
  // Finishing or reopening a task replants; so does coming back to the page on a new day.
  let pending = 0;
  const replant = () => { window.clearTimeout(pending); pending = window.setTimeout(() => void grow(), 600); };
  let day = today;
  const onVisible = () => { if (!document.hidden && toHubDateKey(new Date()) !== day) { day = toHubDateKey(new Date()); replant(); } };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!card.hidden) closeCard();
    else if (!keyPanel.hidden) setKey(false);
    else if (followed) forest?.follow(null);
    else if (page.classList.contains('is-full')) toggleFull();
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
    document.removeEventListener('fullscreenchange', syncFull);
    if (document.fullscreenElement === page) void document.exitFullscreen();
    document.documentElement.classList.remove('grove-full');
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

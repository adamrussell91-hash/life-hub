import type {WaterQuality} from '@/domain/grove/motion';
import {AnnualGroveLoader} from '@/domain/grove/annual-loader';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
import type {AnnualTree} from '@/domain/grove/planting';
import {groveBooks} from '@/domain/grove/books';
/**
 * Grove (`#/grove?view=day|week&date=YYYY-MM-DD`): the forest grown from finished tasks.
 * The page reads task history and draws it; it never writes anything.
 */
import { type GroveView } from '@/domain/grove/plan';
import { GROVE_SPECIES, SPECIES_LABEL, SPECIES_SHORT } from '@/domain/grove/assets';
import { adjacentGroveDate, groveTerms, type GroveTerm } from '@/domain/grove/calendar';
import { isDateKey } from '@/domain/grove/dates';
import { taskPageHash } from '@/domain/cards';
import { toHubDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { tasksApi } from '@/services/client-api';
import { TASKS_CHANGED, TASKS_DELETED } from '@/services/task-cache';
import { renderLoadError } from '@/views/feedback';
import type { Task } from '@/schemas/task';
import type { GroveSceneHandle } from './scene';
import { dayCaption, finishedLine, undatedNote, periodCaption, weekCaption } from './copy';
import './grove.css';

const annualLoader=new AnnualGroveLoader();
let detach: (() => void) | null = null;
let sceneHandle: (GroveSceneHandle&{setQuality(quality:WaterQuality):void}) | null = null;
let generation = 0;
let wildlifePaused = false;let quality:WaterQuality='medium';

export function groveRoute(query: URLSearchParams, today: string): { view: GroveView; date: string } {
  const rawView = query.get('view');
  const view: GroveView = rawView === 'week' || rawView === 'term' || rawView === 'year' ? rawView : 'day';
  const raw = query.get('date');
  return { view, date: isDateKey(raw) ? raw : today };
}

function groveHash(view: GroveView, date: string, today: string): string {
  const params = new URLSearchParams();
  if (view !== 'day') params.set('view', view);
  if (date !== today) params.set('date', date);
  const qs = params.toString();
  return qs ? `#/grove?${qs}` : '#/grove';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export async function renderGroveView(canvas: HTMLElement): Promise<void> {
  annualLoader.cancel();
  detach?.();
  detach = null;
  sceneHandle?.dispose();
  sceneHandle = null;
  generation += 1;
  const gen = generation;

  const today = toHubDateKey(new Date());
  const route = groveRoute(new URLSearchParams(hashQuery()), today);

  const page = el('div', 'grove-page');
  page.dataset.view = route.view;
  const stage = el('div', 'grove-stage');
  const hud = el('div', 'grove-hud');
  page.append(stage, hud);
  canvas.replaceChildren(page);

  // Toolbar: Day / Week, then back · Today · forward. One state (the hash) drives both (V2).
  const bar = el('div', 'grove-bar');
  const pills = el('div', 'hub-pills grove-bar__views');
  pills.setAttribute('role', 'tablist');
  pills.setAttribute('aria-label', 'Grove view');
  for (const view of ['day', 'week', 'term', 'year'] as const) {
    const btn = el('a', 'hub-pills__btn', view.charAt(0).toUpperCase() + view.slice(1));
    btn.href = groveHash(view, route.date, today);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(view === route.view));
    pills.append(btn);
  }
  let terms: GroveTerm[] = [];
  const calendar = Promise.all([tasksApi.getHubPrefs().catch(() => null), tasksApi.getPlanningProfile().catch(() => null), groveBooks().catch(() => [])]);
  const navDate = (direction: -1 | 1) => adjacentGroveDate(route.view, route.date, direction, terms);
  const nav = el('div', 'grove-bar__nav');
  const back = el('a', 'btn btn--secondary grove-bar__step', '‹');
  back.href = groveHash(route.view, navDate(-1), today);
  back.setAttribute('aria-label', `Previous ${route.view}`);
  const todayLink = el('a', 'btn btn--secondary', 'Today');
  todayLink.href = groveHash(route.view, today, today);
  const forward = el('a', 'btn btn--secondary grove-bar__step', '›');
  forward.href = groveHash(route.view, navDate(1), today);
  forward.setAttribute('aria-label', `Next ${route.view}`);
  nav.append(back, todayLink, forward);
  bar.append(pills, nav);

  const caption = el('p', 'grove-caption');
  caption.setAttribute('aria-live', 'polite');
  caption.textContent = 'Growing the forest…';
  const key = el('div', 'grove-key');
  const card = el('div', 'grove-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Tree');
  const wildlife = el('button', 'btn btn--secondary grove-wildlife', wildlifePaused ? 'Resume motion' : 'Pause motion');
  wildlife.type = 'button';wildlife.hidden = false;
  wildlife.setAttribute('aria-pressed', String(wildlifePaused));
  wildlife.addEventListener('click', () => {
    wildlifePaused = !wildlifePaused;
    wildlife.textContent = wildlifePaused ? 'Resume motion' : 'Pause motion';
    wildlife.setAttribute('aria-pressed', String(wildlifePaused));
    sceneHandle?.setWildlifePaused(wildlifePaused);
  });
  const qualitySelect=el('select','btn btn--secondary grove-quality');qualitySelect.setAttribute('aria-label','Water quality');for(const level of ['low','medium','high'] as const){const option=el('option','',level.charAt(0).toUpperCase()+level.slice(1)+' water');option.value=level;qualitySelect.append(option);}qualitySelect.value=quality;qualitySelect.addEventListener('change',()=>{quality=qualitySelect.value as WaterQuality;sceneHandle?.setQuality(quality);});
  const credits = el('details', 'grove-credits');
  const creditSummary = el('summary', '', 'Wildlife credits');
  const creditText = el('p');
  credits.append(creditSummary, creditText);credits.hidden = true;
  const framing = el('button', 'btn btn--secondary grove-framing', `Show whole ${route.view}`);
  framing.type = 'button';framing.hidden = route.view === 'day';
  let overview = false;
  framing.addEventListener('click',()=>{
    overview = !overview;
    sceneHandle?.frame(overview?'overview':'clearing');
    framing.textContent = overview ? 'Show selected clearing' : `Show whole ${route.view}`;
    card.hidden = true;
  });
  hud.append(bar, caption, key, card, wildlife, qualitySelect, credits, framing);

  let tasks: Task[];
  try {
    tasks = await tasksApi.listTasks();
  } catch (err) {
    if (gen !== generation) return;
    renderLoadError(stage, err, () => void renderGroveView(canvas), 'Could not load finished tasks');
    caption.textContent = '';
    return;
  }
  if (gen !== generation) return;

  const [hubPrefs, planningProfile, books] = await calendar;
  if (gen !== generation) return;
  terms = groveTerms({hubPrefs, planningProfile});
  back.href = groveHash(route.view, navDate(-1), today);
  forward.href = groveHash(route.view, navDate(1), today);
  let loaded:Awaited<ReturnType<AnnualGroveLoader['load']>>;try{loaded=await annualLoader.load({tasks,view:route.view,anchor:route.date,now:new Date(),terms,books});}catch(error){if(gen!==generation)return;renderLoadError(stage,error,()=>void renderGroveView(canvas),'Could not prepare annual Grove');return;}if(gen!==generation)return;let plan=loaded.plan;
  paintHud(plan);
  let mountRevision = 0;
  await mount(plan, 'all');if(gen!==generation)return;

  function paintHud(next: AnnualGrovePlan): void {
    caption.textContent = next.view === 'week' ? weekCaption(next) : next.view === 'day' ? dayCaption(next) : periodCaption(next);
    key.replaceChildren();
    const list = el('ul', 'grove-key__list');
    for (const species of GROVE_SPECIES) {
      const count = next.counts[species];
      if (!count) continue;
      const row = el('li', 'grove-key__row');
      const dot = el('span', `grove-key__dot grove-key__dot--${species}`);
      dot.setAttribute('aria-hidden', 'true');
      row.append(
        dot,
        el('span', 'grove-key__long', `${SPECIES_LABEL[species]} · ${count}`),
        el('span', 'grove-key__short', `${SPECIES_SHORT[species]} · ${count}`)
      );
      list.append(row);
    }
    if (list.childElementCount) key.append(list);
    const note = undatedNote(next.undated);
    if (note) key.append(el('p', 'grove-key__note', note));
    key.hidden = !key.childElementCount;
  }

  function showCard(tree: AnnualTree | null, x: number, y: number): void {
    if (!tree) {
      card.hidden = true;
      return;
    }
    card.replaceChildren(
      el('p', 'grove-card__title', tree.title),
      el('p', 'grove-card__meta', SPECIES_LABEL[tree.species]),
      el('p', 'grove-card__meta', finishedLine(tree))
    );
    const open = el('a', 'grove-card__link', 'Open task');
    open.href = taskPageHash(tree.id);
    card.append(open);
    card.hidden = false;
    const bounds = page.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - bounds.left + 12), bounds.width - card.offsetWidth - 8);
    const top = Math.min(Math.max(8, y - bounds.top + 12), bounds.height - card.offsetHeight - 8);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  async function mount(next: AnnualGrovePlan, wobble: ReadonlySet<string> | 'all'): Promise<void> {
    const revision = ++mountRevision;
    const cameraState=sceneHandle?.cameraState();
    const { mountAnnualGroveScene } = await import('./annual-scene');
    if (gen !== generation || revision !== mountRevision) return;
    const byId = new Map(next.trees.map((t) => [t.id, t]));
    try {
      const handle = await mountAnnualGroveScene(stage, {
        ...loaded,plan: next,
        interactive: true,

        wildlifePaused,
        cameraState,
        onWildlife: (count, missing, lines) => {
          if (gen !== generation || revision !== mountRevision) return;
          wildlife.hidden = false;
          creditText.textContent = lines.join(' · ');
          credits.hidden = !lines.length;
          page.dataset.wildlifeCount = String(count);
          page.dataset.unavailableWildlife = missing.join(',');
        },

        onPick: (id, x, y) => showCard(id ? byId.get(id) ?? null : null, x, y)
      });
      if (gen !== generation || revision !== mountRevision) {
        handle.dispose();
        return;
      }
      sceneHandle?.dispose();
      sceneHandle = handle;handle.setQuality(quality);
    } catch (error) {
      if (gen !== generation || revision !== mountRevision) return;
      sceneHandle?.dispose();sceneHandle=null;
      console.error(error);
      stage.replaceChildren(el('p', 'grove-status', 'The forest could not draw on this device.'));
    }
  }

  // Finishing (or reopening) a task elsewhere in the hub replants. Only the new trees wobble.
  let pending: number | null = null;
  const replant = () => {
    if (pending != null) window.clearTimeout(pending);
    pending = window.setTimeout(async () => {
      pending = null;
      const fresh = await tasksApi.listTasks().catch(() => null);
      if (!fresh || gen !== generation) return;
      const before = new Set(plan.trees.map((t) => t.id));
      try{loaded=await annualLoader.load({tasks:fresh,view:route.view,anchor:route.date,now:new Date(),terms,books});}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;console.error(error);return;}if(gen!==generation)return;plan=loaded.plan;
      paintHud(plan);
      card.hidden = true;
      await mount(plan, new Set(plan.trees.filter((t) => !before.has(t.id)).map((t) => t.id)));
    }, 400);
  };
  // Phone: fill the space between the page header (whose stats strip loads late) and the tab bar.
  const phone = window.matchMedia('(max-width: 719px)');
  const fitPage = () => {
    if (!phone.matches) {
      page.style.removeProperty('height');
      return;
    }
    const nav = document.querySelector<HTMLElement>('.hub-mobile-nav');
    const top = page.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(320, Math.round(window.innerHeight - top - (nav?.offsetHeight ?? 0) - 12));
    if (Math.abs(page.offsetHeight - height) > 2) page.style.height = `${height}px`;
  };
  // Writing page height inside the body's observer delivery can trigger WebKit's
  // resize-loop error. Coalesce those writes into the next animation frame.
  let fitFrame = 0;
  const pageObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => { fitFrame = 0; fitPage(); });
  }) : null;
  pageObserver?.observe(document.body);
  window.addEventListener('resize', fitPage);
  fitPage();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') card.hidden = true;
  };
  window.addEventListener(TASKS_CHANGED, replant);
  window.addEventListener(TASKS_DELETED, replant);
  window.addEventListener('keydown', onKey);
  detach = () => {
    if (pending != null) window.clearTimeout(pending);
    window.removeEventListener(TASKS_CHANGED, replant);
    window.removeEventListener(TASKS_DELETED, replant);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fitPage);
    pageObserver?.disconnect();
    if (fitFrame) cancelAnimationFrame(fitFrame);
  };
}

/** Called by the shell when another view takes the canvas. */
export function unmountGroveView(): void {
  annualLoader.cancel();
  detach?.();
  detach = null;
  sceneHandle?.dispose();
  sceneHandle = null;
  generation += 1;
}

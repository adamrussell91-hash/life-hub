import { cityCatchUp, citySnapshot } from '@/domain/city/snapshot';
import { layoutCity } from '@/domain/city/layout';
import { hashQuery } from '@/shell/shell';
import type { GoldenDay } from '@/domain/city/fixtures/golden-days';
import './city.css';
import { legendRows, quietSinceLabel } from './copy';
import { cityNeedsWideScreen, goldenRequest, KNOWN_GOLDEN_DAYS, type GoldenKey } from './days';
import { planCity, type CityPlan } from './plan';
import type { CitySceneHandle } from './scene';

type Inspect = { text: string; href: string | null };

let detach: (() => void) | null = null;
let sceneHandle: CitySceneHandle | null = null;
let generation = 0;

export async function renderCityView(canvas: HTMLElement): Promise<void> {
  detach?.();
  detach = null;
  sceneHandle?.dispose();
  sceneHandle = null;
  generation += 1;
  const gen = generation;
  canvas.replaceChildren();

  const request = goldenRequest(hashQuery());
  if (request.kind === 'list') {
    canvas.append(renderDayList());
    return;
  }
  if (request.kind === 'unknown') {
    canvas.append(renderUnknown(request.value));
    return;
  }

  const page = document.createElement('div');
  page.className = 'city-page';
  page.dataset.golden = request.key;
  canvas.append(page);

  const narrow = document.createElement('p');
  narrow.className = 'city-narrow';
  narrow.textContent = 'Metropolis needs a wider screen';
  page.append(narrow);

  const stage = document.createElement('div');
  stage.className = 'city-stage';
  page.append(stage);

  const day = await loadDay(request.key);
  if (gen !== generation) return;
  const snapshot = citySnapshot(day.input, day.now);
  const layout = layoutCity(snapshot);
  const catchUp = cityCatchUp(day.input, day.lastVisitAt, day.now);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plan = planCity(snapshot, layout, catchUp, 1, reducedMotion);
  const inspect = indexPlan(plan);
  const hud = renderHud(page, day, plan, catchUp.quiet ? quietSinceLabel(catchUp) : null, inspect);
  page.append(hud.root);

  async function sync(): Promise<void> {
    if (gen !== generation) return;
    const wide = !cityNeedsWideScreen(window.innerWidth);
    page.dataset.wide = wide ? 'true' : 'false';
    if (!wide) {
      sceneHandle?.dispose();
      sceneHandle = null;
      stage.replaceChildren();
      return;
    }
    if (sceneHandle) {
      sceneHandle.resize();
      return;
    }
    const { mountCityScene } = await import('./scene');
    if (gen !== generation || cityNeedsWideScreen(window.innerWidth)) return;
    try {
      sceneHandle = await mountCityScene(stage, {
        snapshot,
        layout,
        catchUp,
        reducedMotion,
        onHover: (id, x, y) => showCard(hud.card, inspect, id, x, y, page),
        onPick: (id) => openPanel(hud.panel, inspect, id),
        onReplay: () => {
          hud.banner.hidden = !catchUp.quiet;
        }
      });
    } catch (error) {
      const status = document.createElement('p');
      status.className = 'city-status';
      status.textContent = 'The city models did not load.';
      page.append(status);
      console.error(error);
    }
  }

  const onResize = () => void sync();
  window.addEventListener('resize', onResize);
  detach = () => window.removeEventListener('resize', onResize);
  page.addEventListener('pointerdown', () => {
    sceneHandle?.skip();
  });
  await sync();
}

async function loadDay(key: GoldenKey): Promise<GoldenDay> {
  if (key === 'unseen-1' || key === 'unseen-2') {
    const unseen = await import('@/domain/city/fixtures/unseen-days');
    return key === 'unseen-1' ? unseen.unseenOne() : unseen.unseenTwo();
  }
  const known = await import('@/domain/city/fixtures/golden-days');
  const builders = {
    sunday: known.sundayAfternoon,
    suspended: known.suspendedService,
    deleted: known.deletedYesterday,
    'no-checkin': known.noCheckInMorning
  };
  return builders[key]();
}

function renderDayList(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'city-picker';
  const lede = document.createElement('p');
  lede.className = 'view-lede';
  lede.textContent = 'Pick a day.';
  const list = document.createElement('ul');
  for (const day of KNOWN_GOLDEN_DAYS) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#/city?golden=${day.key}`;
    link.textContent = day.label;
    item.append(link);
    list.append(item);
  }
  section.append(lede, list);
  return section;
}

function renderUnknown(value: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'city-unknown';
  const message = document.createElement('p');
  message.textContent = `${value} is not a glance day.`;
  const link = document.createElement('a');
  link.href = '#/city';
  link.textContent = 'Show the days';
  section.append(message, link);
  return section;
}

function renderHud(
  page: HTMLElement,
  day: GoldenDay,
  plan: CityPlan,
  quiet: string | null,
  inspect: Map<string, Inspect>
): { root: HTMLElement; card: HTMLElement; panel: HTMLElement; banner: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'city-hud';

  const tools = document.createElement('div');
  tools.className = 'city-tools';
  const legendButton = document.createElement('button');
  legendButton.type = 'button';
  legendButton.className = 'btn btn--secondary';
  legendButton.textContent = 'Legend';
  tools.append(legendButton);

  const sky = document.createElement('button');
  sky.type = 'button';
  sky.className = 'city-sky';
  sky.textContent = plan.skyLabel;
  sky.addEventListener('click', () => openPanel(panel, inspect, 'sky'));

  const caption = document.createElement('p');
  caption.className = 'city-day';
  caption.textContent = day.name;

  const banner = document.createElement('p');
  banner.className = 'city-banner';
  banner.hidden = !quiet;
  if (quiet) banner.textContent = quiet;

  const card = document.createElement('div');
  card.className = 'city-card';
  card.hidden = true;
  const cardText = document.createElement('p');
  card.append(cardText);

  const panel = document.createElement('aside');
  panel.className = 'city-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'About this');
  const panelText = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'city-panel__actions';
  const open = document.createElement('a');
  open.className = 'btn btn--primary';
  open.textContent = 'Open';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn--secondary';
  close.textContent = 'Close';
  close.addEventListener('click', () => {
    panel.hidden = true;
  });
  actions.append(open, close);
  panel.append(panelText, actions);

  const legend = document.createElement('aside');
  legend.className = 'city-legend';
  legend.hidden = true;
  legend.setAttribute('role', 'dialog');
  legend.setAttribute('aria-label', 'Legend');
  const legendTitle = document.createElement('p');
  legendTitle.textContent = 'What the city is showing';
  const rows = document.createElement('ul');
  for (const row of legendRows()) {
    const item = document.createElement('li');
    const term = document.createElement('strong');
    term.textContent = row.term;
    item.append(term, document.createTextNode(` ${row.means}`));
    rows.append(item);
  }
  const legendActions = document.createElement('div');
  legendActions.className = 'city-legend__actions';
  const legendClose = document.createElement('button');
  legendClose.type = 'button';
  legendClose.className = 'btn btn--secondary';
  legendClose.textContent = 'Close';
  legendClose.addEventListener('click', () => {
    legend.hidden = true;
  });
  legendActions.append(legendClose);
  legend.append(legendTitle, rows, legendActions);
  legendButton.addEventListener('click', () => {
    legend.hidden = false;
    panel.hidden = true;
  });

  const a11y = document.createElement('nav');
  a11y.className = 'city-a11y';
  a11y.setAttribute('aria-label', 'City marks');
  for (const item of focusItems(plan)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.text;
    button.addEventListener('click', () => openPanel(panel, inspect, item.id));
    a11y.append(button);
  }

  const hint = document.createElement('p');
  hint.className = 'city-hint';
  hint.textContent = 'Drag to move · scroll to zoom · Q and E to turn';

  root.append(tools, sky, caption, banner, card, panel, legend, a11y, hint);
  page.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    panel.hidden = true;
    legend.hidden = true;
    card.hidden = true;
  });

  inspect.set('sky', { text: plan.skyKnown ? plan.skyLabel : 'No data', href: null });
  return { root, card, panel, banner };
}

function focusItems(plan: CityPlan): { id: string; text: string }[] {
  const items: { id: string; text: string }[] = [];
  if (plan.halo) items.push({ id: plan.halo.id, text: plan.halo.text });
  for (const barrier of plan.barriers) items.push({ id: barrier.id, text: barrier.text });
  items.push({ id: plan.depot.id, text: plan.depot.text });
  return items;
}

function indexPlan(plan: CityPlan): Map<string, Inspect> {
  const map = new Map<string, Inspect>();
  const add = (id: string, text: string, href: string | null) => map.set(id, { text, href });
  for (const stop of plan.stops) add(stop.id, stop.text, stop.href);
  for (const barrier of plan.barriers) add(barrier.id, barrier.text, barrier.href);
  for (const ring of plan.rings) add(ring.id, ring.text, ring.href);
  for (const station of plan.stations) add(station.id, station.text, station.href);
  for (const mark of plan.landmarks) add(mark.id, mark.text, mark.href);
  for (const service of plan.services) add(service.id, service.text, service.href);
  for (const vehicle of plan.vehicles) add(vehicle.id, vehicle.text, vehicle.href);
  for (const tram of plan.trams) add(tram.id, tram.text, tram.href);
  for (const line of plan.lines) add(line.id, line.text, line.href);
  for (const sign of plan.signs) add(sign.id, sign.text, null);
  if (plan.halo) add(plan.halo.id, plan.halo.text, plan.halo.href);
  add(plan.depot.id, plan.depot.text, null);
  return map;
}

function showCard(
  card: HTMLElement,
  inspect: Map<string, Inspect>,
  id: string | null,
  clientX: number,
  clientY: number,
  page: HTMLElement
): void {
  const text = card.querySelector('p');
  if (!id || !text) {
    card.hidden = true;
    return;
  }
  const record = inspect.get(id);
  if (!record) {
    card.hidden = true;
    return;
  }
  text.textContent = record.text;
  card.hidden = false;
  const bounds = page.getBoundingClientRect();
  const left = Math.min(Math.max(8, clientX - bounds.left + 12), bounds.width - 280);
  const top = Math.min(Math.max(8, clientY - bounds.top + 12), bounds.height - 80);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function openPanel(panel: HTMLElement, inspect: Map<string, Inspect>, id: string | null): void {
  if (!id) {
    panel.hidden = true;
    return;
  }
  const record = inspect.get(id);
  if (!record) return;
  const text = panel.querySelector('p');
  const open = panel.querySelector('a');
  if (text) text.textContent = record.text;
  if (open) {
    if (record.href) {
      open.href = record.href;
      open.hidden = false;
    } else {
      open.removeAttribute('href');
      open.hidden = true;
    }
  }
  panel.hidden = false;
}

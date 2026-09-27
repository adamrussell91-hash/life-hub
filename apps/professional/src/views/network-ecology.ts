/**
 * Network Ecology miniworld view (BUILD-PLAN Phases 3–5).
 * Fetches `/api/network-ecology/world` via apiGet (W1) and hosts the canvas.
 */

import { ApiClientError } from '@/api/client';
import { fetchNetworkEcologyWorld } from '@/api/network-ecology';
import { asWorldApi, type WorldModel } from '@/components/miniworld/model';
import { mountWorldCanvas, type MiniworldSelection, type WorldCanvasHandle } from '@/components/miniworld/world-canvas';
import { mountPanel } from '@/components/miniworld/panel';
import { mountKey } from '@/components/miniworld/key';
import { mountCards } from '@/components/miniworld/cards';
import { mountTimeline } from '@/components/miniworld/timeline';
import { mountInsights } from '@/components/miniworld/insights';
import { renderLoadError, showViewLoading } from '@/views/feedback';

const WORLD_BUILD_POLL_MS = 4_000;
const WORLD_BUILD_POLL_ATTEMPTS = 45;

function isWorldBuilding(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'world_building';
}

export interface NetworkEcologyOptions {
  isCurrent?: () => boolean;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches;
}

export async function renderNetworkEcologyView(
  root: HTMLElement,
  options: NetworkEcologyOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  showViewLoading(root, 'Loading network ecology…');

  let world;
  // With no stored snapshot yet the server answers `world_building` while a
  // background function builds it; poll until it lands.
  for (let attempt = 0; ; attempt++) {
    try {
      world = await fetchNetworkEcologyWorld();
      break;
    } catch (error) {
      if (!isCurrent()) return;
      if (isWorldBuilding(error) && attempt < WORLD_BUILD_POLL_ATTEMPTS) {
        showViewLoading(root, 'Building your network map for the first time. This can take a minute…');
        await new Promise((resolve) => setTimeout(resolve, WORLD_BUILD_POLL_MS));
        if (!isCurrent()) return;
        continue;
      }
      renderLoadError(root, error, () => {
        void renderNetworkEcologyView(root, options);
      });
      return;
    }
  }
  if (!isCurrent()) return;

  const api = asWorldApi(world);
  const reduceMotion = prefersReducedMotion();
  const nowYear = new Date().getUTCFullYear();
  let year = nowYear;
  let isNow = true;
  let layers = { names: false, mycelium: false, opportunity: false, dormancy: false };
  let viewMode: 'world' | 'cards' = isPhone() ? 'cards' : 'world';

  root.replaceChildren();
  const page = document.createElement('div');
  page.className = 'network-ecology miniworld';

  const toolbar = document.createElement('div');
  toolbar.className = 'miniworld__toolbar';

  const seg = document.createElement('div');
  seg.className = 'miniworld__seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'View');
  const worldBtn = document.createElement('button');
  worldBtn.type = 'button';
  worldBtn.textContent = 'World';
  worldBtn.setAttribute('aria-pressed', viewMode === 'world' ? 'true' : 'false');
  const cardsBtn = document.createElement('button');
  cardsBtn.type = 'button';
  cardsBtn.textContent = 'Communities';
  cardsBtn.setAttribute('aria-pressed', viewMode === 'cards' ? 'true' : 'false');
  seg.append(worldBtn, cardsBtn);

  const findMe = document.createElement('button');
  findMe.type = 'button';
  findMe.className = 'btn btn--secondary';
  findMe.textContent = 'Find me';

  const layersWrap = document.createElement('div');
  layersWrap.className = 'miniworld__layers';
  layersWrap.setAttribute('role', 'group');
  layersWrap.setAttribute('aria-label', 'Layers');
  const layersLabel = document.createElement('span');
  layersLabel.className = 'miniworld__layers-label';
  layersLabel.textContent = 'Show';
  layersWrap.append(layersLabel);
  const layerButtons = new Map<keyof typeof layers, HTMLButtonElement>();
  for (const [key, label] of [
    ['names', 'Names'],
    ['mycelium', 'Mycelium'],
    ['opportunity', 'Opportunity'],
    ['dormancy', 'Dormancy']
  ] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'miniworld__toggle';
    btn.dataset.layer = key;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = label;
    layerButtons.set(key, btn);
    layersWrap.append(btn);
  }

  toolbar.append(seg, findMe, layersWrap);
  const layerNote = document.createElement('p');
  layerNote.className = 'miniworld__layer-note';
  layerNote.hidden = true;

  const mobileNote = document.createElement('p');
  mobileNote.className = 'miniworld__mobile-note';
  mobileNote.textContent =
    'The world map needs a bigger screen. On a phone you get the same communities as cards, and the timeline still works.';

  const mapHost = document.createElement('div');
  mapHost.className = 'miniworld__map-host';

  const cardsHost = document.createElement('div');
  const below = document.createElement('div');
  below.className = 'miniworld__below';
  const insightsHost = document.createElement('div');
  below.append(insightsHost);

  page.append(toolbar, layerNote, mobileNote, mapHost, cardsHost, below);
  root.append(page);

  const empty = !(api.clusters?.length || api.nodes?.some((n) => n.kind === 'person'));
  if (empty) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'miniworld__empty';
    emptyEl.textContent = 'No communities yet';
    page.prepend(emptyEl);
  }

  let canvas: WorldCanvasHandle | null = null;
  let model: WorldModel | null = null;

  const panel = mountPanel(mapHost, {
    onClose: () => {
      canvas?.setSelection(null);
      panel.render(null, model!);
    },
    onShowTheirWorld: (ref) => canvas?.showTheirWorld(ref)
  });
  const key = mountKey(mapHost);
  const cards = mountCards(cardsHost, {
    onSelectCommunity: (id) => {
      select({ kind: 'community', id });
      if (!isPhone()) {
        viewMode = 'world';
        syncViewMode();
        canvas?.focusRef('community', id);
      }
    }
  });

  const years = Object.keys(api.timeline ?? {})
    .map(Number)
    .filter((y) => Number.isFinite(y));
  const minYear = years.length ? Math.min(...years, 2015) : Math.max(2015, nowYear - 5);
  const timeline = mountTimeline(page, {
    minYear,
    maxYear: nowYear,
    reduceMotion,
    onYear: (y, nowFlag) => {
      year = y;
      isNow = nowFlag;
      canvas?.setYear(y, nowFlag);
      syncFromModel();
      updateLayerAvailability();
    }
  });
  // Move timeline before below
  page.insertBefore(timeline.el, below);
  const noteEl = page.querySelector('.miniworld__timeline-note');
  if (noteEl) page.insertBefore(noteEl, below);

  const insights = mountInsights(insightsHost, {
    onFocus: (insight) => {
      if (insight.focus.kind === 'open-sea') {
        select({ kind: 'open-sea', id: 'open-sea' });
        canvas?.focusRef('open-sea', 'open-sea');
        return;
      }
      select({ kind: insight.focus.kind, id: insight.focus.id } as MiniworldSelection);
      canvas?.focusRef(insight.focus.kind, insight.focus.id);
    }
  });

  function select(sel: MiniworldSelection): void {
    canvas?.setSelection(sel);
    if (model) panel.render(sel, model);
  }

  function syncFromModel(): void {
    model = canvas?.getModel() ?? null;
    if (!model) return;
    key.render(model);
    cards.render(model);
    insights.render(model);
    if (model.notes.noStartDateCount > 0 && !isNow) {
      timeline.setNote(
        `${model.notes.noStartDateCount} people have no start date, so they only appear at Now.`
      );
    } else if (!isNow && layers.dormancy) {
      timeline.setNote('Dormancy uses your last contact date, so it only shows at Now.');
    } else {
      timeline.setNote(null);
    }
  }

  function updateLayerAvailability(): void {
    const dormBtn = layerButtons.get('dormancy')!;
    dormBtn.disabled = !isNow;
    if (!isNow && layers.dormancy) {
      layers.dormancy = false;
      dormBtn.setAttribute('aria-pressed', 'false');
      canvas?.setLayers({ dormancy: false });
      layerNote.hidden = false;
      layerNote.textContent = 'Dormancy uses your last contact date, so it only shows at Now.';
    } else if (layers.opportunity && model && !(model.upcomingEvents?.length)) {
      layerNote.hidden = false;
      layerNote.textContent = 'No upcoming events with people you know';
    } else {
      layerNote.hidden = true;
      layerNote.textContent = '';
    }
  }

  function syncViewMode(): void {
    const phone = isPhone();
    const showMap = !phone && viewMode === 'world';
    mapHost.hidden = !showMap;
    cards.setVisible(phone || viewMode === 'cards');
    worldBtn.setAttribute('aria-pressed', viewMode === 'world' ? 'true' : 'false');
    cardsBtn.setAttribute('aria-pressed', viewMode === 'cards' ? 'true' : 'false');
    worldBtn.hidden = phone;
    if (phone) viewMode = 'cards';
  }

  worldBtn.addEventListener('click', () => {
    viewMode = 'world';
    syncViewMode();
  });
  cardsBtn.addEventListener('click', () => {
    viewMode = 'cards';
    syncViewMode();
  });
  findMe.addEventListener('click', () => {
    canvas?.findMe();
    const me = model?.people.find((p) => p.isSelf);
    if (me) select({ kind: 'person', id: me.ref });
  });

  for (const [keyName, btn] of layerButtons) {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const next = !layers[keyName];
      layers[keyName] = next;
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      canvas?.setLayers({ [keyName]: next });
      updateLayerAvailability();
      if (keyName === 'opportunity' && next && model && !model.upcomingEvents.length) {
        layerNote.hidden = false;
        layerNote.textContent = 'No upcoming events with people you know';
      }
    });
  }

  timeline.setEnabled(!empty);
  if (!empty) {
    canvas = mountWorldCanvas(mapHost, api, {
      reduceMotion,
      onSelect: (sel) => {
        if (model) panel.render(sel, model);
      },
      onModelChange: (m) => {
        model = m;
        key.render(m);
        cards.render(m);
        insights.render(m);
      }
    });
    syncFromModel();
  } else {
    cards.render({
      year: nowYear,
      isNow: true,
      communities: [],
      people: [],
      ecotones: [],
      steppingStones: [],
      landmarks: [],
      openSea: { people: [], buoys: [] },
      upcomingEvents: [],
      insights: [],
      bridgePeople: [],
      notes: { noStartDateCount: 0, dormancyOnlyAtNow: false, lastContactUnknownCount: 0 },
      keyCounts: {},
      threads: []
    });
  }

  syncViewMode();
  updateLayerAvailability();

  const onResize = () => {
    syncViewMode();
    canvas?.resize();
  };
  window.addEventListener('resize', onResize);

  // Cleanup when root is replaced by router: MutationObserver light touch —
  // professional router replaces children; destroy when page leaves DOM.
  const obs = new MutationObserver(() => {
    if (!root.contains(page)) {
      canvas?.destroy();
      timeline.destroy();
      window.removeEventListener('resize', onResize);
      obs.disconnect();
    }
  });
  obs.observe(root, { childList: true });
}

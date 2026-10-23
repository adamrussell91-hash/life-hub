import { getTrip } from '@/api/travel';
import { atlasAssetUrl, getAtlas, saveAtlasHome, type AtlasRead } from '@/api/travel-atlas';
import { atlasRoute, journalRoute } from '@/app/router';
import {
  bigMacIndex,
  bigMacStrip,
  deriveStickers,
  formatAudPrice,
  formatLocalPrice,
  groupByCountry,
  monthYear,
  shortDate,
  starsLabel,
  stickerCode,
  vsHomeLabel,
  type CountryGroup,
  type IndexRow,
} from '@/atlas/atlas-model';
import type { MaccasItem } from '@/atlas/maccas';
import '../styles/atlas.css';

export interface AtlasOptions {
  tripId?: string;
  isCurrent: () => boolean;
}

type Tab = 'menu' | 'stickers' | 'index';
const TABS: [Tab, string][] = [['menu', 'Menu'], ['stickers', 'Stickers'], ['index', 'Index']];
const STICKER_COLOURS = ['#1F6FE0', '#8E5BE8', '#0E7C70', '#C4161C', '#D9480F', '#1F3FA8', '#B5179E', '#2B8A3E'];
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Chewy&family=Nunito:wght@700;800;900&display=swap';
const TAB_KEY = 'lifehub.travel.atlas.tab';

export const ATLAS_EMPTY = 'Your first Maccas run goes here!';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The display fonts load only when the Atlas opens. */
function ensureFonts(): void {
  if (document.querySelector('link[data-atlas-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_HREF;
  link.dataset.atlasFonts = '';
  document.head.append(link);
}

/** A private artwork slot. Until (unless) the image loads, the drawn fallback shows. */
function assetSlot(slot: string, fallback: HTMLElement, alt: string): HTMLElement {
  const wrap = el('span', `atlas-slot atlas-slot--${slot}`);
  const img = el('img', 'atlas-slot__img');
  img.alt = alt;
  img.hidden = true;
  img.decoding = 'async';
  img.addEventListener('load', () => {
    img.hidden = false;
    fallback.hidden = true;
  });
  img.addEventListener('error', () => img.remove());
  img.src = atlasAssetUrl(slot);
  wrap.append(fallback, img);
  return wrap;
}

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'menu' || saved === 'stickers' || saved === 'index') return saved;
  } catch {
    /* storage blocked */
  }
  return 'menu';
}

function writeTab(tab: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* storage blocked */
  }
}

function mascot(message: string): HTMLElement {
  const row = el('div', 'atlas-mascot');
  const figure = el('div', 'atlas-mascot__figure');
  figure.setAttribute('aria-hidden', 'true');
  figure.innerHTML =
    '<span class="atlas-mascot__flagpole"></span><span class="atlas-mascot__flag"></span>' +
    '<span class="atlas-mascot__book"><span class="atlas-mascot__eye atlas-mascot__eye--l"></span>' +
    '<span class="atlas-mascot__eye atlas-mascot__eye--r"></span><span class="atlas-mascot__smile"></span></span>' +
    '<span class="atlas-mascot__wheel atlas-mascot__wheel--l"></span><span class="atlas-mascot__wheel atlas-mascot__wheel--r"></span>';
  const bubble = el('p', 'atlas-mascot__bubble', message);
  row.append(figure, bubble);
  return row;
}

function shell(item: MaccasItem, index: number): HTMLElement {
  const card = el('article', 'atlas-shell');
  card.style.setProperty('--tilt', `${index % 2 ? 1 : -1}deg`);
  const inner = el('div', 'atlas-shell__inner');

  const top = el('div', 'atlas-shell__top');
  top.append(el('span', 'atlas-shell__kind', item.kind === 'exclusive' ? 'LOCAL EXCLUSIVE' : 'THE CLASSIC'));
  if (item.kind === 'exclusive') {
    top.append(el('span', 'atlas-badge atlas-badge--only', 'ONLY HERE!'));
  } else {
    const vs = vsHomeLabel(item.vs_home);
    if (vs) top.append(el('span', 'atlas-shell__vs', vs));
  }

  const name = el('h3', 'atlas-shell__name');
  const link = el('a', undefined, item.name.toUpperCase());
  link.href = journalRoute(item.trip_id, item.moment_id);
  name.append(link);

  const details = el('p', 'atlas-shell__lines');
  const where = [item.city, shortDate(item.date)].filter(Boolean).join(' · ').toUpperCase();
  if (item.note) {
    details.append(item.note.toUpperCase(), document.createElement('br'));
  }
  details.append(where);

  const bottom = el('div', 'atlas-shell__bottom');
  const stars = el('span', 'atlas-shell__stars', starsLabel(item.rating));
  if (item.rating !== null) stars.setAttribute('aria-label', `${item.rating} out of 5`);
  const price = el('span', 'atlas-shell__price');
  price.append(formatLocalPrice(item.price));
  if (item.aud && item.price?.currency !== 'AUD') {
    price.append(el('small', 'atlas-shell__aud', `≈ ${formatAudPrice(item.aud.amount)}`));
  }
  bottom.append(stars, price);

  inner.append(top, name, details, bottom);
  card.append(inner);
  return card;
}

function stripCard(text: string): HTMLElement {
  const card = el('div', 'atlas-strip');
  card.append(el('span', 'atlas-strip__label', 'Big Mac Index'));
  const [here, ...rest] = text.split(' · ');
  const body = el('div', 'atlas-strip__body');
  body.append(el('span', 'atlas-strip__here', here ?? ''));
  if (rest.length) body.append(el('span', 'atlas-strip__vs', rest.join(' · ')));
  card.append(body);
  return card;
}

function renderMenu(
  panel: HTMLElement,
  groups: CountryGroup[],
  index: IndexRow[],
  home: number | null,
  state: { country: string | null },
): void {
  panel.replaceChildren();
  if (!groups.length) {
    panel.append(mascot(ATLAS_EMPTY));
    return;
  }
  const current = groups.find((g) => g.code === state.country) ?? groups[0]!;
  state.country = current.code;

  const chips = el('div', 'atlas-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Country');
  for (const group of groups) {
    const chip = el('button', 'atlas-chip', group.label.toUpperCase());
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(group.code === current.code));
    chip.addEventListener('click', () => {
      state.country = group.code;
      renderMenu(panel, groups, index, home, state);
      panel.querySelector<HTMLButtonElement>('.atlas-chip[aria-pressed="true"]')?.focus();
    });
    chips.append(chip);
  }
  panel.append(chips);

  const strip = bigMacStrip(index.find((r) => r.code === current.code), home);
  if (strip) panel.append(stripCard(strip));

  const list = el('div', 'atlas-shells');
  current.items.forEach((item, i) => list.append(shell(item, i)));
  panel.append(list);
}

function renderStickers(panel: HTMLElement, items: MaccasItem[]): void {
  panel.replaceChildren();
  const stickers = deriveStickers(items);
  const card = el('section', 'atlas-sheet');
  const head = el('div', 'atlas-sheet__head');
  head.append(el('h2', 'atlas-sheet__title', 'Sticker Sheet'));
  const earned = stickers.filter((s) => !s.home).length;
  head.append(el('span', 'atlas-sheet__count', `${earned} ${earned === 1 ? 'COUNTRY' : 'COUNTRIES'}`));
  const grid = el('ul', 'atlas-sheet__grid');
  stickers.forEach((sticker, i) => {
    const li = el('li', 'atlas-sticker');
    li.style.setProperty('--sticker', sticker.home ? '#16124A' : STICKER_COLOURS[(i - 1) % STICKER_COLOURS.length]!);
    li.style.setProperty('--tilt', `${[-6, 4, -3, 7, -2, 5][i % 6]}deg`);
    li.setAttribute('aria-label', sticker.home
      ? `${sticker.label}, home`
      : `${sticker.label}, since ${shortDate(sticker.since!)}`);
    li.append(el('span', 'atlas-sticker__code', stickerCode(sticker.code)));
    li.append(el('span', 'atlas-sticker__sub', sticker.home ? 'HOME' : monthYear(sticker.since!)));
    grid.append(li);
  });
  const slots = Math.max(8, Math.ceil((stickers.length + 1) / 4) * 4);
  for (let i = stickers.length; i < slots; i += 1) {
    const li = el('li', 'atlas-sticker atlas-sticker--empty', '?');
    li.setAttribute('aria-label', 'Still to collect');
    grid.append(li);
  }
  card.append(head, grid);
  panel.append(card);
}

function renderIndex(
  panel: HTMLElement,
  index: IndexRow[],
  data: AtlasRead,
  onHomeSaved: (read: Omit<AtlasRead, 'items'>) => void,
): void {
  panel.replaceChildren();
  const home = data.settings.home_big_mac_aud;
  const card = el('section', 'atlas-index');
  card.append(el('h2', 'atlas-index__title', 'Big Mac Index'));

  const form = el('form', 'atlas-home');
  const label = el('label', 'atlas-home__label');
  label.append(el('span', undefined, 'Big Mac at home (A$)'));
  const input = el('input', 'atlas-home__input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.value = home === null ? '' : home.toFixed(2);
  input.placeholder = '0.00';
  label.append(input);
  const save = el('button', 'atlas-button', 'SAVE');
  save.type = 'submit';
  const status = el('p', 'atlas-home__status');
  status.setAttribute('role', 'status');
  form.append(label, save, status);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const raw = input.value.trim();
    const value = raw === '' ? null : Number(raw.replace(/^A?\$/i, ''));
    if (value !== null && !(Number.isFinite(value) && value > 0 && value < 1000)) {
      status.textContent = 'Enter a price like 7.95.';
      return;
    }
    save.disabled = true;
    status.textContent = 'Saving…';
    try {
      onHomeSaved(await saveAtlasHome(value, data.settings_version));
    } catch {
      save.disabled = false;
      status.textContent = 'Could not save. Reload and try again.';
    }
  });
  card.append(form);

  if (!index.length) {
    card.append(el('p', 'atlas-index__empty', 'Tick “My Big Mac for the index” on a Maccas item to add a country.'));
    panel.append(card);
    return;
  }

  const top = Math.max(...index.map((r) => r.aud), home ?? 0) * 1.1;
  const chart = el('ol', 'atlas-bars');
  if (home !== null) {
    chart.style.setProperty('--home', `${(home / top) * 100}%`);
    chart.classList.add('atlas-bars--home');
    chart.setAttribute('aria-description', `Home is ${formatAudPrice(home)}`);
  }
  for (const row of index) {
    const li = el('li', 'atlas-bar');
    const name = el('span', 'atlas-bar__name', row.label.toUpperCase());
    if (row.standIn) name.append(el('small', 'atlas-bar__standin', row.standIn));
    const track = el('span', 'atlas-bar__track');
    const fill = el('span', 'atlas-bar__fill');
    fill.style.width = `${(row.aud / top) * 100}%`;
    track.append(fill);
    li.append(name, track, el('span', 'atlas-bar__price', formatAudPrice(row.aud)));
    chart.append(li);
  }
  card.append(chart);
  if (home !== null) card.append(el('p', 'atlas-index__legend', `Dashed line: home, ${formatAudPrice(home)}`));
  panel.append(card);
}

/** The Arches Atlas: McDonald's eaten around the world, from Travel moments. */
export async function renderAtlas(canvas: HTMLElement, options: AtlasOptions): Promise<void> {
  ensureFonts();
  canvas.replaceChildren();
  const [data, tripTitle] = await Promise.all([
    getAtlas(options.tripId),
    options.tripId ? getTrip(options.tripId).then((t) => t.trip.title).catch(() => 'this trip') : Promise.resolve(null),
  ]);
  if (!options.isCurrent()) return;

  const page = el('div', 'atlas');
  const boxes = el('div', 'atlas__boxes');
  boxes.setAttribute('aria-hidden', 'true');
  boxes.append(el('span', 'atlas__box atlas__box--a'), el('span', 'atlas__box atlas__box--b'));

  const header = el('header', 'atlas-head');
  const badge = el('span', 'atlas-badge atlas-badge--new', 'NEW!');
  header.append(assetSlot('badge', badge, ''));
  const title = el('h1', 'atlas-head__title');
  title.append(el('span', 'atlas-head__word', 'Arches'), el('span', 'atlas-head__word atlas-head__word--two', 'Atlas'));
  header.append(title, el('p', 'atlas-head__sub', 'World Tour Edition'));
  const logo = el('span', 'atlas-head__logo-fallback');
  logo.setAttribute('aria-hidden', 'true');
  header.append(assetSlot('header', logo, ''));

  page.append(boxes, header);

  if (options.tripId) {
    const filter = el('p', 'atlas-filter');
    filter.append(`Showing ${tripTitle} · `);
    const all = el('a', undefined, 'Show every trip');
    all.href = atlasRoute();
    filter.append(all);
    page.append(filter);
  }

  const tabs = el('div', 'atlas-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Atlas');
  const panel = el('div', 'atlas-panel');
  panel.id = 'atlas-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = -1;

  const items = data.items;
  const groups = groupByCountry(items);
  let index = bigMacIndex(items);
  const menuState = { country: null as string | null };
  let tab = readTab();
  const buttons = new Map<Tab, HTMLButtonElement>();

  function show(next: Tab): void {
    tab = next;
    writeTab(next);
    for (const [key, button] of buttons) {
      const on = key === next;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `atlas-tab-${next}`);
    if (next === 'menu') renderMenu(panel, groups, index, data.settings.home_big_mac_aud, menuState);
    if (next === 'stickers') renderStickers(panel, items);
    if (next === 'index') {
      renderIndex(panel, index, data, (saved) => {
        data.settings = saved.settings;
        data.settings_version = saved.settings_version;
        index = bigMacIndex(items);
        show('index');
      });
    }
  }

  for (const [key, label] of TABS) {
    const button = el('button', 'atlas-tab', label.toUpperCase());
    button.type = 'button';
    button.id = `atlas-tab-${key}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => show(key));
    button.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const order = TABS.map(([k]) => k);
      const step = ev.key === 'ArrowRight' ? 1 : -1;
      const nextKey = order[(order.indexOf(key) + step + order.length) % order.length]!;
      show(nextKey);
      buttons.get(nextKey)?.focus();
    });
    buttons.set(key, button);
    tabs.append(button);
  }

  page.append(tabs, panel);
  const countries = new Set(items.map((i) => i.country)).size;
  if (items.length) {
    page.append(mascot(countries > 1 ? `${countries} countries and counting! Collect them all!` : 'One down! Collect them all!'));
  }
  canvas.append(page);
  show(tab);
}

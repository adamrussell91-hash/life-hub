/**
 * Aesthetics › Dress › Watches: today's watch, the box, the price radar, the wishlist,
 * the London and Scotland hunt and every Notion record.
 *
 * createWatches(doc, { storage, radarApi, matchMedia }) → { render({ date, look }) }
 * `look` is today's outfit from dress-looks.js (the one paired with today's scent).
 */
import { WATCH_SOURCE_URL } from './notion-watch-source.js';
import { WATCH_PHOTOS } from './watch-photos.js';
import { WATCH_HUNT } from './watch-hunt.js';
import { DIAL_COLOURS, watchFace } from './watch-face.js';
import {
  WATCHES, boxFacts, colourway, formatAud, freshTags, groupByModel, isOwned, isTrackable, isWanted,
  lookLine, modelName, pingsFrom, radarCoverage, radarItems, radiusFor, rankForLook
} from './watch-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WEAR_KEY = 'life-aesthetics-watch-wear';
const TARGET_KEY = 'life-aesthetics-watch-targets';
const CHECK_KEY = 'life-aesthetics-watch-hunt-checks';
const SECTORS = ['Dress', 'Racing / Chronograph', 'Everyday', 'Other'];
const SECTOR_LABEL = { Dress: 'Dress', 'Racing / Chronograph': 'Chrono', Everyday: 'Everyday', Other: 'Other' };
const ZONE_WORDS = ['at or under your price', 'within 10% of your price', 'within 25% of your price', 'more than 25% over your price'];

/** Every Watch Tracker property, in the order a person reads a spec sheet. */
const RECORD_FIELDS = [
  'Brand', 'Model', 'Reference Number', 'Status', 'Ownership', 'Category', 'Price', 'Product URL',
  'Movement Type', 'Frequency', 'Jewel Count', 'Power Reserve Hours', 'Accuracy', 'Certification',
  'Case Diameter mm', 'Thickness mm', 'Lug to Lug mm', 'Lug Width mm', 'Case Material', 'Case Shape', 'Case Finish', 'Case Back',
  'Crystal Material', 'Crystal Profile', 'Anti Reflective Coating', 'Water Resistance', 'Crown', 'Bezel Type', 'Bezel Function',
  'Dial / Face Colour', 'Dial Texture', 'Dial Extras', 'Markers', 'Hands Style', 'Hands Colour', 'Complications',
  'Strap / Bracelet Material', 'Strap / Bracelet Colour', 'Bracelet Style', 'Clasp',
  'Origin', 'Limited Edition', 'Engraving Notes', 'Notes'
];

function readJson(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function writeJson(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep going */ }
}
const shortName = w => modelName(w.name);
const sectorOf = w => (SECTORS.includes(w.category) ? w.category : 'Other');

export function createWatches(doc, { storage = globalThis.localStorage, radarApi = null, matchMedia = globalThis.matchMedia?.bind(globalThis), now = () => new Date() } = {}) {
  const $ = sel => doc.querySelector(sel);
  const reduceMotion = () => matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const owned = WATCHES.filter(isOwned);
  const wanted = WATCHES.filter(isWanted);
  const groups = groupByModel(wanted);

  function el(tag, attrs = {}, ...kids) {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, String(v));
    }
    node.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
    return node;
  }
  function s(tag, attrs = {}, ...kids) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    node.append(...kids);
    return node;
  }
  function link(label, href, className) {
    try {
      const u = new URL(href);
      if (!['https:', 'http:'].includes(u.protocol)) return doc.createTextNode(label);
      return el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', class: className, text: label });
    } catch { return doc.createTextNode(label); }
  }
  /** The watch's photo when there is one, otherwise its drawing. */
  function picture(w, px, opts = {}) {
    const src = WATCH_PHOTOS[w.id];
    if (src) return el('img', { class: 'aes-watch aes-watch--photo', src, alt: w.name, width: px, height: Math.round((px * 110) / 60), loading: 'lazy', decoding: 'async' });
    return watchFace(doc, w, { px, ...opts });
  }

  const state = {
    date: null, look: null, pick: 0, sel: null, cat: 'All', variant: {},
    radar: { status: 'idle', readings: {}, lastRun: null, targets: readJson(storage, TARGET_KEY, {}) },
    radarSel: null, radarPicked: false, wired: false, raf: 0
  };

  // ---------------- on the wrist today ----------------
  const wearLog = () => readJson(storage, WEAR_KEY, {});
  function lastWornId() {
    const log = wearLog();
    const before = Object.keys(log).filter(d => d < state.date).sort().at(-1);
    return before ? log[before] : null;
  }
  function renderToday() {
    const ranked = rankForLook(owned, state.look, { lastWornId: lastWornId() });
    const pick = ranked[state.pick % ranked.length];
    const w = pick.watch;
    const t = now();
    $('#aes-wrist-name').textContent = colourway(w.name) ? `${shortName(w)} · ${colourway(w.name)}` : shortName(w);
    $('#aes-wrist-line').textContent = lookLine(pick, state.look);
    $('#aes-wrist-look').replaceChildren(...[state.look.outer, state.look.top, state.look.bottom, state.look.shoes, state.look.accent].map(([c, item]) => el('span', { class: 'aes-wrist__piece', text: `${c} ${item}` })));
    $('#aes-wrist-art').replaceChildren(picture(w, 200, { time: { h: t.getHours(), m: t.getMinutes(), s: t.getSeconds() } }));
    const worn = WATCHES.find(x => x.id === wearLog()[state.date]);
    $('#aes-wrist-worn').textContent = worn ? `Logged: ${shortName(worn)} today` : '';
  }
  function wearIt() {
    const ranked = rankForLook(owned, state.look, { lastWornId: lastWornId() });
    const w = ranked[state.pick % ranked.length].watch;
    const log = wearLog();
    log[state.date] = w.id;
    writeJson(storage, WEAR_KEY, log);
    $('#aes-wrist-worn').textContent = `Logged: ${shortName(w)} today`;
    renderBox();
  }

  // ---------------- the box ----------------
  function wearCount(id) { return Object.values(wearLog()).filter(x => x === id).length; }
  function renderBox() {
    const sorted = [...owned].sort((a, b) => (a.mm ?? 40) - (b.mm ?? 40));
    $('#aes-box').replaceChildren(...sorted.map(w => el('button', {
      type: 'button', class: 'aes-slot', 'aria-pressed': String(state.sel === w.id),
      onclick: () => { state.sel = state.sel === w.id ? null : w.id; renderBox(); }
    }, picture(w, 84), el('b', { text: shortName(w) }), el('small', { text: [w.mm ? `${w.mm} mm` : 'size not recorded', wearCount(w.id) ? `worn ${wearCount(w.id)}×` : null].filter(Boolean).join(' · ') }))));
    const w = owned.find(x => x.id === state.sel);
    $('#aes-box-detail').replaceChildren(w ? specSheet(w) : el('p', { class: 'aes-meta', text: 'Tap a watch for its spec sheet. The box is drawn to scale, smallest case first.' }));
  }
  function specSheet(w) {
    const row = (k, v) => [el('dt', { text: k }), el('dd', { text: v || 'Not recorded' })];
    const join = (...xs) => xs.filter(Boolean).join(' · ');
    return el('div', { class: 'aes-spec' },
      el('p', { class: 'aes-display aes-spec__name', text: w.name }),
      el('dl', { class: 'aes-record__fields' },
        row('Reference', w.source.properties['Reference Number']),
        row('Movement', w.movement),
        row('Case', join(w.mm && `${w.mm} mm`, w.thickness && `${w.thickness} mm thick`, w.lugToLug && `${w.lugToLug} mm lug to lug`, w.caseMaterial)),
        row('Dial', join(w.dial, w.markers.join(', '))),
        row('Strap', join(w.strap, w.strapMaterial, w.lugWidth && `${w.lugWidth} mm`)),
        row('Complications', w.complications.join(', ')),
        row('Water resistance', w.source.properties['Water Resistance'])),
      w.notes ? el('p', { class: 'aes-meta', text: w.notes }) : null,
      el('button', { type: 'button', class: 'aes-btn', onclick: () => openRecord(w.id) }, 'Full record'));
  }
  function openRecord(id) {
    const record = doc.querySelector(`#aes-watch-records [data-watch-id="${id}"]`);
    if (!record) return;
    record.open = true;
    record.scrollIntoView?.({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    record.querySelector('summary')?.focus();
  }

  // ---------------- price radar ----------------
  const targets = () => state.radar.targets;
  const items = () => radarItems(groups, { readings: state.radar.readings, targets: targets() });
  async function loadRadar() {
    if (!radarApi) { state.radar.status = 'offline'; renderRadar(); return; }
    state.radar.status = 'loading';
    renderRadar();
    try {
      const data = await radarApi.load();
      state.radar.readings = data?.readings ?? {};
      state.radar.lastRun = data?.lastRun ?? null;
      // The server copy wins; anything set while offline is kept for models it does not know.
      state.radar.targets = { ...targets(), ...(data?.targets ?? {}) };
      writeJson(storage, TARGET_KEY, state.radar.targets);
      state.radar.status = 'ready';
    } catch {
      state.radar.status = 'offline';
    }
    renderRadar();
    renderWishlist();
  }
  async function setTarget(key, value) {
    state.radarSel = key;
    state.radarPicked = true;
    state.radar.targets = { ...targets(), [key]: value };
    writeJson(storage, TARGET_KEY, state.radar.targets);
    renderRadar();
    renderWishlist();
    try { await radarApi?.setTarget(key, value); } catch { /* kept on this device; saved again next time */ }
  }

  function radarStatusLine() {
    const r = state.radar;
    if (r.status === 'loading') return 'Checking the radar…';
    if (r.status === 'offline') return 'The radar is out of reach right now, so each watch sits at its saved price.';
    if (!r.lastRun) return 'The first shop check runs on Sunday morning. Until then each watch sits at its saved price.';
    const d = new Date(r.lastRun);
    return `Shops last checked ${d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}. Checks run every Sunday morning.`;
  }

  function renderRadar() {
    const all = items();
    // Until Adam taps a watch, show the one closest to buying.
    if (!state.radarPicked || !all.some(i => i.key === state.radarSel)) state.radarSel = (all.find(i => i.zone === 0) ?? all.find(i => i.trackable) ?? all[0])?.key;
    $('#aes-radar-status').textContent = radarStatusLine();
    drawDial(all);
    renderRadarCard(all.find(i => i.key === state.radarSel));
    renderPings(all);
    const c = radarCoverage(wanted);
    $('#aes-radar-cover-bar').replaceChildren(
      el('i', { style: `width:${(c.tracked / c.total) * 100}%`, 'data-kind': 'tracked' }),
      el('i', { style: `width:${(c.homepage / c.total) * 100}%`, 'data-kind': 'homepage' }),
      el('i', { style: `width:${(c.missing / c.total) * 100}%`, 'data-kind': 'missing' }));
    $('#aes-radar-cover').textContent = `${c.tracked} of ${c.total} have a shop page the radar can check. ${c.homepage} only link to a brand homepage and ${c.missing} have no link yet. A product page link is needed to include a watch on the radar.`;
  }

  function drawDial(all) {
    globalThis.cancelAnimationFrame?.(state.raf);
    const R = 150, C = 170;
    const svg = s('svg', { viewBox: '0 0 340 340', class: 'aes-radar__svg', role: 'group', 'aria-label': 'Price radar. The closer a watch is to the centre, the closer it is to your price.' });
    svg.append(s('circle', { cx: C, cy: C, r: R + 14, class: 'aes-radar__face' }), s('circle', { cx: C, cy: C, r: R + 14, class: 'aes-radar__bezel' }));
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180, l = i % 5 ? 5 : 10;
      svg.append(s('line', { x1: C + Math.sin(a) * (R + 12), y1: C - Math.cos(a) * (R + 12), x2: C + Math.sin(a) * (R + 12 - l), y2: C - Math.cos(a) * (R + 12 - l), class: i % 5 ? 'aes-radar__tick' : 'aes-radar__tick aes-radar__tick--hour' }));
    }
    [0.25, 0.5, 0.75, 1].forEach((f, i) => svg.append(s('circle', { cx: C, cy: C, r: R * f, class: i === 0 ? 'aes-radar__zone' : 'aes-radar__ring' })));
    SECTORS.forEach((name, i) => {
      const a = (i * 90 * Math.PI) / 180, m = ((i * 90 + 45) * Math.PI) / 180;
      svg.append(s('line', { x1: C, y1: C, x2: C + Math.sin(a) * R, y2: C - Math.cos(a) * R, class: 'aes-radar__ring' }));
      const label = s('text', { x: C + Math.sin(m) * (R - 16), y: C - Math.cos(m) * (R - 16) + 3, 'text-anchor': 'middle', class: 'aes-radar__label' });
      label.textContent = SECTOR_LABEL[name].toUpperCase();
      svg.append(label);
    });
    const trail = 40 * Math.PI / 180;
    const sweep = s('g', { class: 'aes-radar__sweep' },
      s('path', { d: `M${C} ${C} L${C} ${C - R} A${R} ${R} 0 0 0 ${C - Math.sin(trail) * R} ${C - Math.cos(trail) * R} Z`, class: 'aes-radar__trail' }),
      s('line', { x1: C, y1: C + 18, x2: C, y2: C - R, class: 'aes-radar__hand' }));
    svg.append(sweep);
    const perSector = {}, seen = {};
    for (const it of all) perSector[sectorOf(it.watch)] = (perSector[sectorOf(it.watch)] ?? 0) + 1;
    const blips = [];
    for (const it of all) {
      const sector = sectorOf(it.watch), si = SECTORS.indexOf(sector);
      seen[sector] = (seen[sector] ?? 0) + 1;
      const ang = si * 90 + (90 * seen[sector]) / (perSector[sector] + 1);
      const d = R * (it.trackable ? radiusFor(it.price, it.target) : 1);
      const x = C + Math.sin((ang * Math.PI) / 180) * d, y = C - Math.cos((ang * Math.PI) / 180) * d;
      const on = it.key === state.radarSel;
      const words = !it.trackable ? 'no shop page to check yet' : it.zone == null ? 'no price recorded' : ZONE_WORDS[it.zone];
      const g = s('g', {
        class: 'aes-blip', tabindex: 0, role: 'button', 'aria-pressed': String(on), 'aria-label': `${it.name}, ${words}`,
        'data-zone': it.trackable ? String(it.zone ?? 'none') : 'untracked',
        onclick: () => { state.radarSel = it.key; state.radarPicked = true; renderRadar(); },
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.radarSel = it.key; state.radarPicked = true; renderRadar(); } }
      });
      if (it.trackable && it.zone === 0) g.append(s('circle', { cx: x, cy: y, r: 3, class: 'aes-blip__pulse' }));
      g.append(s('circle', { cx: x, cy: y, r: on ? 8 : 6, fill: it.trackable ? (DIAL_COLOURS[it.watch.dial] ?? DIAL_COLOURS.Other) : 'none', class: on ? 'aes-blip__dot aes-blip__dot--on' : 'aes-blip__dot' }));
      svg.append(g);
      blips.push({ g, ang });
    }
    svg.append(s('circle', { cx: C, cy: C, r: 3, class: 'aes-radar__pin' }));
    $('#aes-radar-dial').replaceChildren(svg);
    const raf = globalThis.requestAnimationFrame;
    if (reduceMotion() || typeof raf !== 'function') { sweep.setAttribute('transform', `rotate(300 ${C} ${C})`); return; }
    const tick = t => {
      if (!svg.isConnected) return;
      const a = ((t / 1000) * 6) % 360;
      sweep.setAttribute('transform', `rotate(${a} ${C} ${C})`);
      for (const b of blips) { const lag = (a - b.ang + 360) % 360; b.g.style.opacity = String(0.5 + 0.5 * Math.max(0, 1 - lag / 140)); }
      state.raf = raf(tick);
    };
    state.raf = raf(tick);
  }

  function sparkline(history) {
    const W = 240, H = 46, vals = history.map(h => h.aud);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = vals.map((v, i) => [(i * W) / Math.max(1, vals.length - 1), H - 6 - ((v - lo) / span) * (H - 12)]);
    const line = pts.map(p => p.join(' ')).join(' L');
    return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aes-spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' },
      s('path', { d: `M${line} L${W} ${H} L0 ${H} Z`, class: 'aes-spark__area' }),
      s('path', { d: `M${line}`, class: 'aes-spark__line' }),
      s('circle', { cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 3, class: 'aes-spark__end' }));
  }

  function renderRadarCard(it) {
    const host = $('#aes-radar-card');
    if (!it) { host.replaceChildren(); return; }
    const w = it.watch;
    const kids = [el('div', { class: 'aes-radar__head' }, picture(w, 56),
      el('div', {}, el('p', { class: 'aes-display aes-spec__name', text: it.name }),
        el('p', { class: 'aes-meta', text: it.group.items.length > 1 ? `${it.group.items.length} colourways · cheapest is ${colourway(w.name)}` : (w.category ?? 'Uncategorised') })))];
    if (it.price) {
      const diff = it.live && it.notionPrice ? it.price - it.notionPrice : 0;
      kids.push(el('div', { class: 'aes-radar__price' },
        el('span', { class: 'aes-display aes-radar__big', text: formatAud(it.price) }),
        it.live
          ? (it.notionPrice ? el('span', { class: 'aes-radar__delta', 'data-dir': diff < 0 ? 'down' : diff > 0 ? 'up' : 'flat', text: diff ? `${diff < 0 ? '▼' : '▲'} ${formatAud(Math.abs(diff))} on saved price of ${formatAud(it.notionPrice)}` : `Same as saved price of ${formatAud(it.notionPrice)}` }) : null)
          : el('span', { class: 'aes-meta', text: 'saved price, not checked yet' })));
    }
    if (it.reading) {
      const r = it.reading;
      const when = new Date(r.checkedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      kids.push(el('p', { class: 'aes-meta', text: `${r.currency !== 'AUD' ? `${r.currency} ${r.amount} converted to Australian dollars, before shipping and duties. ` : ''}From ${r.host}, ${when}.` }));
      if ((r.history ?? []).length > 1) kids.push(sparkline(r.history), el('p', { class: 'aes-meta', text: `Last ${r.history.length} weekly checks` }));
    }
    if (!it.trackable) {
      kids.push(el('p', { class: 'aes-meta', text: it.group.items.some(x => x.url) ? 'Only a brand homepage is saved, so the radar can’t find this exact watch. A product page link is needed.' : 'No shop link saved yet. A shop link is needed for radar checks.' }));
    } else if (it.reading?.error && !it.reading.aud) {
      kids.push(el('p', { class: 'aes-meta', text: 'The last check could not read a price from the shop page.' }));
    }
    if (it.target) {
      const base = it.notionPrice ?? it.price ?? it.target;
      const max = Math.round((base * 1.2) / 5) * 5, min = Math.round((base * 0.4) / 5) * 5;
      const label = el('label', { class: 'aes-eyebrow', for: 'aes-radar-target', text: `I'd buy at ${formatAud(it.target)}` });
      const input = el('input', { id: 'aes-radar-target', class: 'aes-range', type: 'range', min, max, step: 5, value: it.target });
      input.addEventListener('input', () => { label.textContent = `I'd buy at ${formatAud(Number(input.value))}`; });
      input.addEventListener('change', () => setTarget(it.key, Number(input.value)));
      kids.push(label, input);
      if (it.trackable && it.price) {
        kids.push(el('p', { class: 'aes-radar__verdict', 'data-zone': String(it.zone), text: it.zone === 0 ? 'In your price. Buy it if you still want it.' : `${formatAud(it.price - it.target)} above your price.` }));
      }
    }
    const shop = it.group.items.find(x => isTrackable(x.url)) ?? it.group.items.find(x => x.url);
    if (shop) kids.push(link('Open the shop page ↗', shop.url, 'aes-radar__link'));
    host.replaceChildren(...kids);
  }

  function renderPings(all) {
    const pings = pingsFrom(all).slice(0, 5);
    $('#aes-radar-pings').replaceChildren(...(pings.length ? pings.map(p => el('li', {},
      el('button', { type: 'button', class: 'aes-ping', 'data-under': String(p.underTarget), onclick: () => { state.radarSel = p.item.key; state.radarPicked = true; renderRadar(); } },
        el('span', { class: 'aes-ping__dot', 'aria-hidden': 'true' }),
        el('span', {}, el('b', { text: p.item.name }), ` down to ${formatAud(p.to)} from ${formatAud(p.from)}.${p.underTarget ? ' Under your price.' : ''}`,
          el('small', { text: new Date(p.at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) })))))
      : [el('li', { class: 'aes-meta', text: 'No drops yet. A watch that falls in price shows here, and one that reaches your price sends a notification.' })]));
  }

  // ---------------- wishlist ----------------
  function renderWishlist() {
    const all = items();
    const cats = ['All', ...new Set(wanted.map(w => w.category ?? 'Uncategorised'))];
    $('#aes-wish-filter').replaceChildren(...cats.map(c => el('button', { type: 'button', class: 'hub-pills__btn', 'aria-pressed': String(c === state.cat), onclick: () => { state.cat = c; renderWishlist(); } }, c)));
    const priced = wanted.filter(w => w.price);
    $('#aes-wish-title').textContent = `${wanted.length} watches on the list, about ${formatAud(priced.reduce((a, w) => a + w.price, 0))} across the ${priced.length} with prices`;
    const shown = groups.filter(g => state.cat === 'All' || g.items.some(w => (w.category ?? 'Uncategorised') === state.cat));
    $('#aes-wish').replaceChildren(...shown.map(g => {
      const idx = state.variant[g.key] ?? 0;
      const w = g.items[idx];
      const it = all.find(i => i.key === g.key);
      const reading = state.radar.readings[w.id];
      const price = reading?.aud ?? w.price;
      return el('article', { class: 'aes-wish' },
        picture(w, 64),
        el('div', { class: 'aes-wish__body' },
          el('h3', { class: 'aes-wish__name', text: g.items.length > 1 ? g.name : shortName(w) }),
          el('p', { class: 'aes-meta' }, el('b', { class: 'aes-wish__price', text: price ? formatAud(price) : 'No price yet' }), [w.category, w.mm && `${w.mm} mm`].filter(Boolean).map(x => ` · ${x}`).join('')),
          g.items.length > 1 ? el('div', { class: 'aes-wish__variants' },
            g.items.map((v, i) => el('button', { type: 'button', class: 'aes-swatch', 'aria-pressed': String(i === idx), 'aria-label': colourway(v.name), title: colourway(v.name), style: `background:${DIAL_COLOURS[v.dial] ?? DIAL_COLOURS.Other}`, onclick: () => { state.variant[g.key] = i; renderWishlist(); } })),
            el('span', { class: 'aes-meta', text: colourway(w.name) })) : null,
          it?.trackable && it.zone === 0 ? el('p', { class: 'aes-wish__hit', text: 'At your price' }) : null,
          el('div', { class: 'aes-tags' }, freshTags(w, owned).map(t => el('span', { text: t })))));
    }));
  }

  // ---------------- the hunt ----------------
  function renderHunt() {
    const H = WATCH_HUNT;
    $('#aes-hunt-brief').replaceChildren(...H.brief.map(b => el('span', { text: b })));
    const small = [...owned].filter(w => w.mm).sort((a, b) => a.mm - b.mm)[0];
    const large = [...owned].filter(w => w.mm).sort((a, b) => b.mm - a.mm)[0];
    $('#aes-hunt-sizes').replaceChildren(...[[small, `Your ${shortName(small).split(' ')[0]}`], [H.sample, 'The brief'], [large, `Your ${shortName(large).split(' ').slice(0, 2).join(' ')}`]].map(([w, label]) =>
      el('figure', { class: 'aes-hunt__size' }, watchFace(doc, w, { px: 64 }), el('figcaption', {}, el('b', { text: `${w.mm} mm` }), el('br'), label))));
    $('#aes-hunt-size-note').textContent = `Drawn to the same scale. Your ${shortName(small)} is ${small.mm} mm, so small already works for you. Try older watches on before writing them off.`;
    $('#aes-hunt-targets').replaceChildren(...H.targets.map(t => el('li', {}, el('b', { text: t.name }), ` ${t.note}`)));
    const done = new Set(readJson(storage, CHECK_KEY, []));
    $('#aes-hunt-checks').replaceChildren(...H.checks.map((c, i) => {
      const id = `aes-hunt-check-${i}`;
      const box = el('input', { type: 'checkbox', id });
      box.checked = done.has(i);
      box.addEventListener('change', () => { box.checked ? done.add(i) : done.delete(i); writeJson(storage, CHECK_KEY, [...done]); });
      return el('li', {}, el('label', { for: id }, box, c));
    }));
    $('#aes-hunt-rule').textContent = H.rule;
  }

  // ---------------- every record ----------------
  function renderRecords() {
    const format = (k, v) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return 'Not recorded';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (Array.isArray(v)) return v.join(', ');
      if (k === 'Price') return formatAud(v);
      return String(v);
    };
    $('#aes-watch-records').replaceChildren(...WATCHES.map(w => {
      const p = w.source.properties;
      return el('details', { class: 'aes-record', 'data-watch-id': w.id },
        el('summary', {}, el('b', { text: w.name }), el('span', { class: 'aes-meta', text: [p.Status, p.Category, p.Price != null ? formatAud(p.Price) : null].filter(Boolean).join(' · ') })),
        el('div', { class: 'aes-record__body' },
          el('dl', { class: 'aes-record__fields' }, RECORD_FIELDS.map(k => [
            el('dt', { text: k }),
            el('dd', { 'data-source-field': k }, k === 'Product URL' && p[k] ? link(p[k], p[k]) : format(k, p[k]))
          ])),
          el('p', { class: 'aes-meta', text: '' })));
    }));
    $('#aes-watch-source').replaceChildren();
  }

  function wire() {
    if (state.wired) return;
    state.wired = true;
    $('#aes-wrist-wear').addEventListener('click', wearIt);
    $('#aes-wrist-next').addEventListener('click', () => { state.pick += 1; renderToday(); });
    $('#aes-box-facts').replaceChildren(...boxFacts(owned, wanted).map(f => el('li', {}, el('strong', { class: 'aes-display', text: f.value }), el('span', { text: f.text }))));
    renderHunt();
    renderRecords();
    loadRadar();
  }

  return {
    render({ date, look } = {}) {
      if (!$('#aes-watches') || !date || !look) return;
      if (state.date !== date) state.pick = 0;
      state.date = date;
      state.look = look;
      wire();
      renderToday();
      renderBox();
      renderRadar();
      renderWishlist();
    }
  };
}

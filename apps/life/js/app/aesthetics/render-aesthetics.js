/**
 * Aesthetics section (route stays `skincare`): Today · Scent · Dress (Looks, Watches) · Skin.
 * The Skin tab is the existing Skincare dashboard, untouched.
 *
 * createAesthetics(doc, { storage }) → { render({ date, events }) }
 * `events` are today's calendar items ({ time: 'HH:MM', title, type }).
 */
import { FAMILY_LABELS, FRAGRANCES, REFERENCE_FRAGRANCES } from './fragrance-library.js';
import { GARMENT_COLOURS, LOOKS, SNAP_SAMPLES } from './dress-looks.js';
import { renderSourceReference } from './render-source-reference.js';
import { createWatches } from './render-watches.js';
import {
  dominantColour,
  formatHour,
  judgeNotes,
  listOf,
  lookForScent,
  lookPieces,
  lookRules,
  looksForColour,
  mapInsight,
  nearestGarmentColour,
  noteAffinity,
  placeOnMap,
  planScentDay,
  proseNote,
  resolveQuery,
  seasonName
} from './aesthetics-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'text', 'defs', 'radialGradient', 'linearGradient', 'stop', 'line']);
const TABS = ['today', 'scent', 'dress', 'skin'];
const TAB_KEY = 'life-aesthetics-tab';
const DRESS_VIEW_KEY = 'life-aesthetics-dress-view';
const DRESS_VIEWS = ['looks', 'watches'];
const WEAR_KEY = 'life-aesthetics-wear';
const PRAISE_KEY = 'life-aesthetics-compliments';

const famVar = f => `var(--aes-${f.family})`;

function readJson(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function writeJson(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep going */ }
}

export function createAesthetics(doc, { storage = globalThis.localStorage, matchMedia = globalThis.matchMedia?.bind(globalThis), watchRadarApi = null } = {}) {
  const $ = sel => doc.querySelector(sel);
  const reduceMotion = () => matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const affinity = noteAffinity(FRAGRANCES);
  const watches = createWatches(doc, { storage, matchMedia, radarApi: watchRadarApi });

  /** Tiny element helper; SVG tags get the SVG namespace, CSS-var paints go through style. */
  function el(tag, attrs = {}, ...kids) {
    const svg = SVG_TAGS.has(tag) || (tag === 'title' && attrs.svg);
    const node = svg ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false || k === 'svg') continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (svg && /^(fill|stroke|stop-color)$/.test(k) && /var\(|color-mix/.test(String(v))) node.style.setProperty(k, v);
      else if (k === 'class' && !svg) node.className = v;
      else node.setAttribute(k, String(v));
    }
    node.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
    return node;
  }

  const state = {
    tab: (() => { try { const t = storage?.getItem?.(TAB_KEY); return TABS.includes(t) ? t : 'today'; } catch { return 'today'; } })(),
    dressView: (() => { try { const v = storage?.getItem?.(DRESS_VIEW_KEY); return DRESS_VIEWS.includes(v) ? v : 'looks'; } catch { return 'looks'; } })(),
    dayIndex: 0,
    mapSel: 'Neon',
    mapShow: { Owned: true, Sampling: true, Wishlist: true, Retired: true },
    query: 'Tom Ford Tobacco Vanille',
    vibe: 0,
    snap: null,
    date: null,
    events: [],
    wired: false
  };

  // ---------------- glass bottle ----------------
  let gradientId = 0;
  function bottle(f, width = 120) {
    const id = `aes-glass-${gradientId++}`;
    const glass = 'M30 48 Q30 40 40 40 H80 Q90 40 90 48 L104 70 Q108 76 108 86 V160 Q108 176 92 176 H28 Q12 176 12 160 V86 Q12 76 16 70 Z';
    const level = f.status === 'Owned' ? 92 : f.status === 'Sampling' ? 150 : null;
    const label = f.name.length > 18 ? `${f.name.slice(0, 17)}…` : f.name;
    return el('svg', { class: 'aes-bottle', viewBox: '0 0 120 180', width, height: width * 1.5, 'aria-hidden': 'true', 'data-status': f.status },
      el('defs', {}, el('linearGradient', { id, x1: 0, x2: 1 },
        el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.4 }),
        el('stop', { offset: 0.22, 'stop-color': '#fff', 'stop-opacity': 0 }),
        el('stop', { offset: 0.85, 'stop-color': '#000', 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.25 }))),
      el('rect', { x: 44, y: 2, width: 32, height: 30, rx: 5, class: 'aes-bottle__cap' }),
      el('rect', { x: 50, y: 30, width: 20, height: 10, class: 'aes-bottle__collar' }),
      el('path', { d: glass, fill: famVar(f), 'fill-opacity': 0.2, stroke: famVar(f), 'stroke-width': 2, 'stroke-dasharray': f.status === 'Wishlist' ? '5 4' : null }),
      level ? el('path', { d: `M14 ${level} H106 V160 Q106 174 92 174 H28 Q14 174 14 160 Z`, fill: famVar(f), 'fill-opacity': 0.88 }) : null,
      el('path', { d: glass, fill: `url(#${id})` }),
      el('rect', { x: 28, y: 108, width: 64, height: 34, rx: 3, class: 'aes-bottle__label' }),
      el('text', { x: 60, y: 129, 'text-anchor': 'middle', class: 'aes-bottle__name', 'font-size': label.length > 12 ? 8 : label.length > 8 ? 10 : 13, text: label }));
  }

  // ---------------- flat-lay ----------------
  function flatlay(look, onStage) {
    const C = GARMENT_COLOURS;
    const edge = onStage ? 'rgba(255,255,255,.3)' : 'var(--line)';
    const piece = (d, colour) => el('path', { d, fill: C[colour], stroke: edge, 'stroke-width': 1.2, class: 'aes-piece' });
    const seam = d => el('path', { d, class: 'aes-seam' });
    const tip = p => el('title', { svg: 1, text: `${p[0]} ${p[1]}` });
    const f = FRAGRANCES.find(x => x.name === look.scent);
    const b = bottle(f, 48);
    b.setAttribute('x', '312');
    b.setAttribute('y', '190');
    return el('svg', { class: 'aes-flatlay__art', viewBox: '0 0 380 330', role: 'img', 'aria-label': `${lookPieces(look).map(p => `${p[0]} ${p[1]}`).join(', ')}, with ${look.scent}` },
      el('g', { transform: 'rotate(-6 110 100)' }, piece('M62 28 L104 18 L118 30 L132 18 L174 28 L206 80 L184 94 L170 72 L170 186 L66 186 L66 72 L52 94 L30 80 Z', look.outer[0]), seam('M104 18 L118 60 L132 18 M118 60 L118 186'), tip(look.outer)),
      el('g', { transform: 'rotate(5 290 80)' }, piece('M236 26 L266 18 Q282 34 298 18 L328 26 L356 58 L338 72 L326 60 L326 146 L240 146 L240 60 L228 72 L210 58 Z', look.top[0]), seam('M266 18 Q282 34 298 18'), tip(look.top)),
      el('g', { transform: 'rotate(-3 130 250)' }, piece('M92 196 L178 196 L190 322 L150 322 L136 236 L122 322 L82 322 Z', look.bottom[0]), seam('M92 206 H178'), tip(look.bottom)),
      el('g', {},
        el('ellipse', { cx: 230, cy: 284, rx: 34, ry: 13, fill: C[look.shoes[0]], stroke: edge, 'stroke-width': 1.2, transform: 'rotate(-18 230 284)', class: 'aes-piece' }),
        el('ellipse', { cx: 256, cy: 304, rx: 34, ry: 13, fill: C[look.shoes[0]], stroke: edge, 'stroke-width': 1.2, transform: 'rotate(-18 256 304)', class: 'aes-piece' }),
        tip(look.shoes)),
      el('g', {},
        el('circle', { cx: 250, cy: 202, r: 30, fill: 'none', stroke: C[look.accent[0]], 'stroke-width': 9, class: 'aes-piece' }),
        el('rect', { x: 272, y: 194, width: 14, height: 16, rx: 2, class: 'aes-buckle' }),
        tip(look.accent)),
      b);
  }
  function renderFlat(host, look, onStage = false) {
    host.replaceChildren(
      flatlay(look, onStage),
      el('div', { class: 'aes-flatlay__label' },
        el('span', { class: 'aes-vibe', text: look.vibe }),
        el('ul', { class: 'aes-rules', 'aria-label': 'Outfit rules' }, lookRules(look).map(r => el('li', { 'data-ok': String(r.ok), text: `${r.label}${r.ok ? ' ✓' : ''}` })))));
  }

  // ---------------- tabs ----------------
  function showTab(tab) {
    state.tab = tab;
    try { storage?.setItem(TAB_KEY, tab); } catch { /* ignore */ }
    for (const b of doc.querySelectorAll('#aes-tabs [data-aes-tab]')) b.setAttribute('aria-selected', String(b.dataset.aesTab === tab));
    for (const t of TABS) { const p = $(`#aes-${t}`); if (p) p.hidden = t !== tab; }
  }

  function showDressView(view) {
    state.dressView = view;
    try { storage?.setItem(DRESS_VIEW_KEY, view); } catch { /* ignore */ }
    for (const b of doc.querySelectorAll('#aes-dress-views [data-aes-dress-view]')) b.setAttribute('aria-selected', String(b.dataset.aesDressView === view));
    const looks = $('#aes-looks'), wrist = $('#aes-watches');
    if (looks) looks.hidden = view !== 'looks';
    if (wrist) wrist.hidden = view !== 'watches';
  }

  // ---------------- TODAY ----------------
  const canonicalName = name => name === 'Asad Zanzibar' ? 'Asad Zanzibar Limited Edition' : name;
  const wearLog = () => Object.fromEntries(Object.entries(readJson(storage, WEAR_KEY, {})).map(([date, name]) => [date, canonicalName(name)]));
  const praise = () => {
    const counts = {};
    for (const [name, value] of Object.entries(readJson(storage, PRAISE_KEY, {}))) {
      const key = canonicalName(name);
      counts[key] = (counts[key] ?? 0) + value;
    }
    return counts;
  };
  function lastWorn() {
    const log = wearLog();
    const before = Object.keys(log).filter(d => d < state.date).sort().at(-1);
    return before ? log[before] : null;
  }
  let plan = null;
  function renderToday() {
    plan = planScentDay({ date: state.date, events: state.events, index: state.dayIndex, lastWorn: lastWorn() });
    const f = plan.day;
    const stage = $('#aes-stage');
    stage.style.setProperty('--aes-glow', famVar(f));
    const dateLabel = new Date(`${state.date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#aes-today-date').textContent = `${dateLabel} · Sydney ${seasonName(plan.season)}`;
    const wrap = $('#aes-today-bottle');
    wrap.querySelector('svg')?.remove();
    wrap.prepend(bottle(f));
    wrap.setAttribute('aria-label', `Spray ${f.name}`);
    $('#aes-today-name').textContent = f.name;
    $('#aes-today-by').textContent = `${f.brand} · ${FAMILY_LABELS[f.family]}`;
    $('#aes-today-line').textContent = plan.line;
    const worn = wearLog()[state.date];
    $('#aes-today-worn').textContent = worn ? `Logged: ${worn} today` : '';
    renderFlat($('#aes-today-flat'), lookForScent(f.name), true);
    renderRibbon();
  }

  function renderRibbon() {
    const H0 = 6, H1 = 23;
    const anchors = plan.anchors.filter(a => a.hour >= H0 && a.hour <= H1);
    const from = Math.min(7, ...anchors.map(a => Math.floor(a.hour)));
    const x = h => ((Math.min(Math.max(h, from), H1) - from) / (H1 - from)) * 100;
    const band = (start, end, f) => el('div', { class: 'aes-band', style: `left:${x(start)}%;width:${x(end) - x(start)}%;--aes-band:${famVar(f)}` },
      el('span', { class: 'aes-band__top', title: 'Top notes' }, 'top'),
      el('span', { class: 'aes-band__heart', title: 'Heart' }, f.name),
      el('span', { class: 'aes-band__base', title: 'Drydown' }, 'drydown'));
    const dayEnd = Math.min(plan.fadeAt, plan.swapAt ?? H1);
    const hours = [];
    for (let h = Math.ceil(from); h <= H1; h += 3) hours.push(h);
    $('#aes-ribbon').replaceChildren(...[
      band(plan.sprayAt, dayEnd, plan.day),
      plan.night ? band(plan.swapAt, H1, plan.night) : null,
      ...anchors.map((a, i) => el('div', { class: 'aes-ev', 'data-row': String(i % 2), style: `left:${x(a.hour)}%` }, el('b', { text: a.title }), el('i'))),
      el('div', { class: 'aes-ribbon__hours', 'aria-hidden': 'true' }, hours.map(h => el('span', { style: `left:${x(h)}%`, text: formatHour(h) })))
    ].filter(Boolean));
    $('#aes-ribbon-empty').hidden = anchors.length > 0;
    $('#aes-ribbon-notes').replaceChildren(...plan.notes.map(n => el('div', { class: 'aes-rnote' }, el('b', { text: n.title }), n.body)));
  }

  function burst(kind) {
    if (reduceMotion()) return;
    const cv = $('#aes-mist');
    const ctx = cv?.getContext?.('2d');
    if (!ctx) return;
    const colour = getComputedStyle($('#aes-stage')).getPropertyValue(`--aes-${plan.day.family}`).trim() || '#c7aeea';
    const ps = kind === 'mist'
      ? Array.from({ length: 150 }, () => ({ x: 202, y: 128, vx: 2 + Math.random() * 5.5, vy: -2.8 + Math.random() * 3.4, r: 1 + Math.random() * 3.5, a: 0.9, c: colour }))
      : Array.from({ length: 70 }, () => ({ x: 200, y: 150, vx: (Math.random() - 0.5) * 10, vy: -2 - Math.random() * 8, r: 3 + Math.random() * 4, a: 1, rot: Math.random() * 6, c: ['#f6c453', '#c7aeea', '#fdfaf4', '#7fb0ea', '#e59ab8'][Math.floor(Math.random() * 5)] }));
    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (kind === 'mist') {
          p.vx *= 0.965; p.vy = p.vy * 0.965 + 0.02; p.a *= 0.968; p.r *= 1.012;
          ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          p.vy += 0.32; p.rot += 0.25;
          ctx.globalAlpha = 1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
        }
      }
      if (++frame < 85) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#aes-toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function spray() {
    burst('mist');
    const log = wearLog();
    log[state.date] = plan.day.name;
    writeJson(storage, WEAR_KEY, log);
    $('#aes-today-worn').textContent = `Logged: ${plan.day.name} today`;
    toast(`Logged ${plan.day.name} for today`);
  }
  function noticed() {
    burst('confetti');
    const counts = praise();
    counts[plan.day.name] = (counts[plan.day.name] ?? 0) + 1;
    writeJson(storage, PRAISE_KEY, counts);
    const n = counts[plan.day.name];
    toast(`${n} compliment${n === 1 ? '' : 's'} for ${plan.day.name}`);
  }

  // ---------------- SCENT ----------------
  const placed = FRAGRANCES.map(f => ({ f, ...placeOnMap(f) }));
  function renderMap() {
    $('#aes-map-filter').replaceChildren(...[['Owned', '●'], ['Sampling', '◐'], ['Wishlist', '○'], ['Retired', '✕']].map(([s, g]) =>
      el('button', { type: 'button', class: 'hub-pills__btn', 'aria-pressed': String(state.mapShow[s]), onclick: () => { state.mapShow[s] = !state.mapShow[s]; renderMap(); } }, `${g} ${s}`)));
    const W = 560, H = 420, pad = 36;
    const xs = placed.map(p => p.x), ys = placed.map(p => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 0.3, Math.max(...xs) + 0.3, Math.min(...ys) - 0.3, Math.max(...ys) + 0.3];
    const X = v => pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad);
    const Y = v => H - pad - ((v - y0) / (y1 - y0)) * (H - 2 * pad);
    const sel = placed.find(p => p.f.name === state.mapSel) ?? placed[0];
    const pick = p => () => { state.mapSel = p.f.name; renderMap(); };
    const labelRight = X(sel.x) < W - 180;
    $('#aes-map').replaceChildren(el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Scent map: fresh to warm across, dry to sweet up' },
      el('defs', {},
        el('radialGradient', { id: 'aes-glow-love' }, el('stop', { offset: 0, 'stop-color': 'var(--aes-love)', 'stop-opacity': 0.6 }), el('stop', { offset: 1, 'stop-color': 'var(--aes-love)', 'stop-opacity': 0 })),
        el('radialGradient', { id: 'aes-glow-hate' }, el('stop', { offset: 0, 'stop-color': 'var(--danger)', 'stop-opacity': 0.3 }), el('stop', { offset: 1, 'stop-color': 'var(--danger)', 'stop-opacity': 0 }))),
      el('rect', { x: 0, y: 0, width: W, height: H, rx: 14, class: 'aes-map__ground' }),
      el('line', { x1: X(0), x2: X(0), y1: 14, y2: H - 14, class: 'aes-map__axis-line' }),
      el('line', { y1: Y(0), y2: Y(0), x1: 14, x2: W - 14, class: 'aes-map__axis-line' }),
      placed.filter(p => p.f.loved).map(p => el('circle', { cx: X(p.x), cy: Y(p.y), r: 72, fill: 'url(#aes-glow-love)' })),
      placed.filter(p => p.f.hated).map(p => el('circle', { cx: X(p.x), cy: Y(p.y), r: 50, fill: 'url(#aes-glow-hate)' })),
      el('text', { class: 'aes-map__zone', x: 46, y: 36, text: 'fruit & flowers' }),
      el('text', { class: 'aes-map__zone', x: W - 22, y: 36, 'text-anchor': 'end', text: 'dessert' }),
      el('text', { class: 'aes-map__zone', x: 46, y: H - 40, text: 'salt & green' }),
      el('text', { class: 'aes-map__zone', x: W - 22, y: H - 40, 'text-anchor': 'end', text: 'smoke & resin' }),
      el('text', { class: 'aes-map__axis', x: 14, y: H - 12, text: '← fresh' }),
      el('text', { class: 'aes-map__axis', x: W - 14, y: H - 12, 'text-anchor': 'end', text: 'warm →' }),
      el('text', { class: 'aes-map__axis', x: 14, y: 18, text: '↑ sweet' }),
      el('text', { class: 'aes-map__axis', x: X(0) + 6, y: H - 12, text: '↓ dry' }),
      placed.filter(p => state.mapShow[p.f.status]).map(p => {
        const cx = X(p.x), cy = Y(p.y), on = p === sel;
        const a = { class: 'aes-star', tabindex: 0, role: 'button', 'aria-label': `${p.f.name}, ${p.f.status}`, onclick: pick(p), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p)(); } } };
        if (p.f.status === 'Retired') {
          return el('g', a, el('circle', { cx, cy, r: 10, fill: 'transparent' }), el('path', { d: `M${cx - 5} ${cy - 5}L${cx + 5} ${cy + 5}M${cx + 5} ${cy - 5}L${cx - 5} ${cy + 5}`, stroke: 'var(--danger)', 'stroke-width': on ? 3 : 2.2 }));
        }
        const fill = p.f.status === 'Owned' ? famVar(p.f) : p.f.status === 'Sampling' ? `color-mix(in srgb, ${famVar(p.f)} 40%, var(--paper))` : 'var(--paper)';
        return el('circle', { ...a, cx, cy, r: on ? 9 : p.f.status === 'Owned' ? 6.5 : 5, fill, stroke: on ? 'var(--ink)' : famVar(p.f), 'stroke-width': on ? 2.5 : 1.8 });
      }),
      el('text', { x: labelRight ? X(sel.x) + 14 : X(sel.x) - 14, y: Y(sel.y) + 5, 'text-anchor': labelRight ? 'start' : 'end', class: 'aes-map__sel', text: sel.f.name })));
    const f = sel.f;
    const count = (f.source.properties.Compliments ?? 0) + (praise()[f.name] ?? 0);
    const meta = [f.brand, f.status, f.rating ? `${f.rating}/10` : null, f.loved ? 'loved' : null, f.hated ? 'not for you' : null, count ? `${count} compliment${count === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
    $('#aes-mapcard').replaceChildren(bottle(f, 54), el('div', { class: 'aes-mapcard__body' },
      el('div', { class: 'aes-display aes-mapcard__name', text: f.name }),
      el('div', { class: 'aes-meta', text: meta }),
      f.quote ? el('p', { class: 'aes-quote', text: `“${f.quote}”` }) : el('p', { class: 'aes-meta', text: listOf(f.notes.slice(0, 6)) }),
      f.tryAt && f.status === 'Wishlist' ? el('p', { class: 'aes-meta', text: `Try it at: ${f.tryAt}` }) : null,
      el('button', { type: 'button', class: 'aes-btn', onclick: () => {
        const record = doc.querySelector(`#aes-library [data-fragrance-id="${f.id}"]`);
        if (record) { record.open = true; record.scrollIntoView?.({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); record.querySelector('summary')?.focus(); }
      } }, 'Full record')));
  }

  function renderOracle() {
    const resolved = resolveQuery(state.query);
    const host = $('#aes-verdict');
    if (!resolved) {
      host.replaceChildren(el('p', { class: 'aes-meta', text: state.query.trim() ? 'Not one I know. Type its notes instead, separated by commas.' : 'Type a name, or notes like: vanilla, cardamom, incense.' }));
      return;
    }
    if (!resolved.notes.length) {
      host.replaceChildren(el('p', { class: 'aes-meta', text: `${resolved.name} has no recorded note pyramid. Read its full review below, or enter notes to compare.` }));
      return;
    }
    const v = judgeNotes(resolved.notes, affinity);
    const circ = 2 * Math.PI * 40;
    host.replaceChildren(
      el('div', { class: 'aes-dial', 'data-band': v.score >= 6 ? 'good' : v.score >= 4 ? 'maybe' : 'bad' },
        el('svg', { viewBox: '0 0 92 92', 'aria-hidden': 'true' },
          el('circle', { cx: 46, cy: 46, r: 40, class: 'aes-dial__track' }),
          el('circle', { cx: 46, cy: 46, r: 40, class: 'aes-dial__value', 'stroke-dasharray': `${(v.score / 10) * circ} ${circ}` })),
        el('b', { text: String(v.score) })),
      el('div', { class: 'aes-verdict__body' },
        el('div', { class: 'aes-display aes-verdict__word', text: resolved.name ? `${v.verdict}: ${resolved.name}` : v.verdict }),
        el('p', { class: 'aes-why' },
          v.likes.length ? [el('span', { class: 'aes-why__yes', text: 'You like ' }), listOf(v.likes.map(proseNote)), '. '] : 'Little overlap with your favourites. ',
          v.flags.length ? [el('span', { class: 'aes-why__no', text: 'Watch out: ' }), listOf(v.flags.map(proseNote)), '.'] : 'No red flags.')));
  }

  function renderShelf() {
    $('#aes-shelf').replaceChildren(...FRAGRANCES.filter(f => f.status === 'Owned').map(f =>
      el('button', { type: 'button', class: 'aes-shelf__bottle', onclick: () => { state.mapSel = f.name; renderMap(); $('#aes-map')?.scrollIntoView?.({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); } },
        bottle(f, 50), el('span', { text: f.name }), el('small', { text: f.brand }))));
  }

  // ---------------- DRESS ----------------
  function renderVibe() {
    const look = LOOKS[state.vibe];
    $('#aes-vibes').replaceChildren(...LOOKS.map((l, i) => el('button', { type: 'button', class: 'hub-pills__btn', 'aria-pressed': String(i === state.vibe), onclick: () => { state.vibe = i; renderVibe(); renderSnap(); } }, l.vibe)));
    renderFlat($('#aes-dress-flat'), look);
    const f = FRAGRANCES.find(x => x.name === look.scent);
    $('#aes-dress-scent').replaceChildren(bottle(f, 24), el('span', {}, 'Wear it with ', el('b', { text: f.name })));
    $('#aes-dress-quote').textContent = `From your notes: “${look.source}”`;
  }
  function spin() {
    let target = Math.floor(Math.random() * LOOKS.length);
    if (target === state.vibe) target = (target + 4) % LOOKS.length;
    if (reduceMotion()) { state.vibe = target; renderVibe(); return; }
    let n = 0;
    (function step() {
      state.vibe = (state.vibe + 1) % LOOKS.length;
      renderVibe();
      if (++n < 10 || state.vibe !== target) setTimeout(step, 45 + n * 14);
    })();
  }
  function renderSnap() {
    const host = $('#aes-snapres');
    if (!state.snap) { host.replaceChildren(); return; }
    const { colour, label } = state.snap;
    const { exact, looks } = looksForColour(colour);
    $('#aes-snap-swatch').hidden = false;
    $('#aes-snap-swatch').style.background = GARMENT_COLOURS[colour];
    host.replaceChildren(
      el('div', { class: 'aes-display aes-snapres__name', text: label ? `${label}. Good choice.` : `That reads as ${colour}.` }),
      el('p', { class: 'aes-meta', text: exact ? `It works in ${looks.length} of your looks. Tap one to lay it out.` : `None of your notes use ${colour} yet. These are the closest by tone.` }),
      el('div', { class: 'aes-matches' }, looks.map(l => {
        const i = LOOKS.indexOf(l);
        return el('button', { type: 'button', class: 'aes-match', 'aria-pressed': String(i === state.vibe), onclick: () => { state.vibe = i; renderVibe(); renderSnap(); } },
          el('span', { class: 'aes-match__sw', 'aria-hidden': 'true' }, lookPieces(l).slice(0, 3).map(([c]) => el('i', { style: `background:${GARMENT_COLOURS[c]}` }))), l.vibe);
      })));
  }
  function snapColour(colour, label = null) {
    state.snap = { colour, label };
    const { looks } = looksForColour(colour);
    if (!looks.includes(LOOKS[state.vibe])) state.vibe = LOOKS.indexOf(looks[0]);
    renderVibe();
    renderSnap();
  }
  function onPhoto(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const tile = $('#aes-snap-img');
      tile.style.background = '';
      tile.style.backgroundImage = `url(${url})`;
      $('#aes-snap-plus').textContent = '';
      const cv = doc.createElement('canvas');
      cv.width = 60; cv.height = 60;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 60, 60);
      // The centre of the frame is where the garment usually is.
      const rgb = dominantColour(ctx.getImageData(15, 15, 30, 30).data);
      if (rgb) snapColour(nearestGarmentColour(rgb));
    };
    img.onerror = () => { $('#aes-snapres').replaceChildren(el('p', { class: 'aes-meta', text: 'That photo would not open. Try a JPEG or PNG.' })); };
    img.src = url;
  }

  // ---------------- wiring ----------------
  function wire() {
    if (state.wired) return;
    state.wired = true;
    for (const b of doc.querySelectorAll('#aes-tabs [data-aes-tab]')) b.addEventListener('click', () => showTab(b.dataset.aesTab));
    for (const b of doc.querySelectorAll('#aes-dress-views [data-aes-dress-view]')) b.addEventListener('click', () => showDressView(b.dataset.aesDressView));
    $('#aes-spray').addEventListener('click', spray);
    $('#aes-today-bottle').addEventListener('click', spray);
    $('#aes-today-bottle').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); spray(); } });
    $('#aes-reroll').addEventListener('click', () => { state.dayIndex += 1; renderToday(); });
    $('#aes-noticed').addEventListener('click', noticed);
    const ask = $('#aes-ask');
    ask.value = state.query;
    ask.addEventListener('input', () => { state.query = ask.value; renderOracle(); });
    $('#aes-ask-list').replaceChildren(...[...Object.keys(REFERENCE_FRAGRANCES), ...FRAGRANCES.map(f => f.name)].map(v => el('option', { value: v })));
    $('#aes-ask-presets').replaceChildren(...['Tom Ford Tobacco Vanille', 'Baccarat Rouge 540', 'Creed Aventus', "Kilian Angels' Share"].map(k =>
      el('button', { type: 'button', class: 'hub-pills__btn', onclick: () => { ask.value = k; state.query = k; renderOracle(); } }, k)));
    $('#aes-spin').addEventListener('click', spin);
    $('#aes-snap-file').addEventListener('change', e => onPhoto(e.target.files?.[0]));
    $('#aes-snap-samples').replaceChildren(...SNAP_SAMPLES.map(s => el('button', { type: 'button', class: 'hub-pills__btn', onclick: () => {
      const tile = $('#aes-snap-img');
      tile.style.backgroundImage = 'none';
      tile.style.background = GARMENT_COLOURS[s.colour];
      $('#aes-snap-plus').textContent = '';
      snapColour(s.colour, s.label);
    } }, el('i', { class: 'aes-dot', style: `background:${GARMENT_COLOURS[s.colour]}` }), s.label)));
    $('#aes-insight').textContent = mapInsight(FRAGRANCES);
    renderShelf();
    renderSourceReference(doc);
  }

  return {
    render({ date, events = [] } = {}) {
      if (!$('#aes-stage') || !date) return;
      wire();
      if (state.date !== date) state.dayIndex = 0;
      state.date = date;
      state.events = events;
      showTab(state.tab);
      showDressView(state.dressView);
      renderToday();
      watches.render({ date, look: lookForScent(plan.day.name) });
      renderMap();
      renderOracle();
      renderVibe();
      renderSnap();
    }
  };
}

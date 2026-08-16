import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firstSentence, renderMind } from '../../js/app/render-mind.js';

function el(tag = 'div') {
  let text = '';
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    hidden: false,
    id: '',
    dataset: {},
    children: [],
    attributes: {},
    listeners: [],
    style: { setProperty() {} },
    classList: {
      remove() {},
      add() {},
      toggle(name, force) {
        const parts = String(this.className || '').split(/\s+/).filter(Boolean);
        const has = parts.includes(name);
        const on = force == null ? !has : Boolean(force);
        this.className = on
          ? (has ? parts.join(' ') : [...parts, name].join(' '))
          : parts.filter(part => part !== name).join(' ');
      }
    },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    append(...nodes) {
      for (const child of nodes) child.parentNode = this;
      this.children.push(...nodes);
      const bits = this.children.map(n => n.textContent).filter(Boolean);
      if (bits.length) this.textContent = bits.join('');
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
      this.textContent = this.children.map(n => n.textContent).filter(Boolean).join('');
    },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'id') this.id = String(value);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = String(value);
      }
      if (name === 'hidden') this.hidden = true;
    },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'hidden') this.hidden = false;
    },
    querySelector(selector) {
      return collect(this, selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return collect(this, selector);
    }
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      if (this.children.length) {
        return this.children.map(child => child.textContent).filter(Boolean).join('');
      }
      return text;
    },
    set(value) {
      text = String(value ?? '');
    }
  });
  return node;
}

function collect(node, selector) {
  const out = [];
  walk(node, child => { if (matches(child, selector)) out.push(child); });
  return out;
}

function walk(node, visit) {
  for (const child of node.children ?? []) {
    visit(child);
    walk(child, visit);
  }
}

function matches(node, selector) {
  if (selector.startsWith('.')) {
    return String(node.className).split(/\s+/).includes(selector.slice(1));
  }
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  const data = /^\[data-([a-z-]+)(?:="([^"]+)")?\]$/.exec(selector);
  if (data) {
    const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (data[2]) return node.dataset?.[key] === data[2] || node.attributes?.[`data-${data[1]}`] === data[2];
    return node.dataset?.[key] !== undefined;
  }
  if (/^[a-z][\w-]*$/i.test(selector)) {
    return String(node.tagName).toLowerCase() === selector.toLowerCase();
  }
  return false;
}

function ringSvg(level) {
  const svg = el('svg');
  svg.dataset.mindEnergyRing = level;
  const track = el('circle');
  track.dataset.role = 'track';
  const fill = el('circle');
  fill.dataset.role = 'fill';
  svg.append(track, fill);
  return svg;
}

function fakeRoot() {
  const dashboard = el('section');
  dashboard.id = 'mind-dashboard';
  dashboard.hidden = true;
  dashboard.style = { setProperty() {} };
  const ranges = el('div');
  ranges.id = 'mind-range-control';
  ranges.querySelectorAll = () => [];
  const caption = el('p');
  caption.dataset.mind = 'entry-count';
  const ambient = el('p');
  ambient.dataset.mind = 'ambient';
  const moodChart = el('svg');
  moodChart.id = 'mind-mood-chart';
  const area = el('path');
  area.dataset.role = 'area';
  const line = el('path');
  line.dataset.role = 'line';
  const dots = el('g');
  dots.dataset.role = 'dots';
  moodChart.append(area, line, dots);
  const slices = el('g');
  slices.dataset.role = 'slices';
  const pie = el('svg');
  pie.id = 'mind-mood-pie';
  pie.append(slices);
  const mix = el('div');
  mix.id = 'mind-mood-mix';
  mix.append(pie);
  const mixLabel = el('p');
  mixLabel.dataset.mind = 'mood-mix-label';
  const energy = el('div');
  energy.id = 'mind-energy-rings';
  const high = ringSvg('high');
  const medium = ringSvg('medium');
  const low = ringSvg('low');
  energy.append(high, medium, low);
  const energyEmpty = el('p');
  energyEmpty.dataset.mind = 'energy-empty';
  energyEmpty.hidden = true;
  const hero = el('div');
  hero.id = 'mind-hero';
  const themes = el('div');
  themes.id = 'mind-themes';
  const empty = el('p');
  empty.id = 'mind-empty';
  const silence = el('div');
  silence.id = 'mind-silence';
  silence.hidden = true;
  const sessions = el('div');
  sessions.id = 'mind-sessions';
  const insights = el('div');
  insights.id = 'mind-insights';
  const cross = el('div');
  cross.id = 'mind-cross-agent';
  const board = el('div');
  board.id = 'mind-board';
  const threadSheet = el('div');
  threadSheet.id = 'mind-thread-sheet';
  threadSheet.hidden = true;
  for (const role of ['title', 'rows', 'continue', 'close', 'scrim']) {
    const part = el(role === 'continue' || role === 'close' ? 'button' : 'div');
    part.dataset.role = role;
    threadSheet.append(part);
  }
  const tileInsights = el('article');
  tileInsights.id = 'mind-tile-insights';
  const tileFactors = el('article');
  tileFactors.id = 'mind-tile-factors';
  const tileStreak = el('article');
  tileStreak.id = 'mind-tile-streak';
  const streakRing = el('svg');
  streakRing.id = 'mind-streak-ring';
  const streakTrack = el('circle');
  streakTrack.dataset.role = 'track';
  const streakFill = el('circle');
  streakFill.dataset.role = 'fill';
  streakRing.append(streakTrack, streakFill);
  tileStreak.append(streakRing);
  const tileConstellation = el('article');
  tileConstellation.id = 'mind-tile-constellation';
  const constellation = el('svg');
  constellation.id = 'mind-constellation';
  tileConstellation.append(constellation);
  const tension = el('article');
  tension.id = 'mind-tension';
  tension.hidden = false;
  const tileStream = el('article');
  tileStream.id = 'mind-tile-stream';
  const streamSvg = el('svg');
  streamSvg.id = 'mind-stream';
  tileStream.append(streamSvg);
  const tileTransitions = el('article');
  tileTransitions.id = 'mind-tile-transitions';
  const sankeySvg = el('svg');
  sankeySvg.id = 'mind-sankey';
  tileTransitions.append(sankeySvg);
  const tileBump = el('article');
  tileBump.id = 'mind-tile-bump';
  const bumpSvg = el('svg');
  bumpSvg.id = 'mind-bump';
  tileBump.append(bumpSvg);
  const tileChord = el('article');
  tileChord.id = 'mind-tile-chord';
  const chordSvg = el('svg');
  chordSvg.id = 'mind-chord';
  tileChord.append(chordSvg);
  const tileRadial = el('article');
  tileRadial.id = 'mind-tile-radial';
  const radialSvg = el('svg');
  radialSvg.id = 'mind-radial-year';
  tileRadial.append(radialSvg);
  const tileHorizon = el('article');
  tileHorizon.id = 'mind-tile-horizon';
  const horizonHost = el('div');
  horizonHost.id = 'mind-horizon';
  tileHorizon.append(horizonHost);
  const tileButterfly = el('article');
  tileButterfly.id = 'mind-tile-butterfly';
  const butterflyHost = el('div');
  butterflyHost.id = 'mind-butterfly';
  tileButterfly.append(butterflyHost);
  const tileLexical = el('article');
  tileLexical.id = 'mind-tile-lexical';
  const lexicalHost = el('div');
  lexicalHost.id = 'mind-lexical';
  tileLexical.append(lexicalHost);
  const tileWaffle = el('article');
  tileWaffle.id = 'mind-tile-waffle';
  const waffleHost = el('div');
  waffleHost.id = 'mind-waffle';
  tileWaffle.append(waffleHost);
  const hosts = {
    '#mind-dashboard': dashboard,
    '#mind-range-control': ranges,
    '[data-mind="entry-count"]': caption,
    '[data-mind="ambient"]': ambient,
    '#mind-mood-chart': moodChart,
    '#mind-mood-mix': mix,
    '#mind-mood-pie': pie,
    '#mind-mood-pie [data-role="slices"]': slices,
    '[data-mind="mood-mix-label"]': mixLabel,
    '#mind-energy-rings': energy,
    '[data-mind="energy-empty"]': energyEmpty,
    '[data-mind-energy-ring="high"]': high,
    '[data-mind-energy-ring="medium"]': medium,
    '[data-mind-energy-ring="low"]': low,
    '#mind-hero': hero,
    '#mind-themes': themes,
    '#mind-empty': empty,
    '#mind-silence': silence,
    '#mind-sessions': sessions,
    '#mind-insights': insights,
    '#mind-tile-insights': insights,
    '#mind-cross-agent': cross,
    '#mind-board': board,
    '#mind-thread-sheet': threadSheet,
    '#mind-tile-factors': tileFactors,
    '#mind-tile-streak': tileStreak,
    '#mind-streak-ring': streakRing,
    '#mind-tile-constellation': tileConstellation,
    '#mind-constellation': constellation,
    '#mind-tension': tension,
    '#mind-tile-stream': tileStream,
    '#mind-stream': streamSvg,
    '#mind-tile-transitions': tileTransitions,
    '#mind-sankey': sankeySvg,
    '#mind-tile-bump': tileBump,
    '#mind-bump': bumpSvg,
    '#mind-tile-chord': tileChord,
    '#mind-chord': chordSvg,
    '#mind-tile-radial': tileRadial,
    '#mind-radial-year': radialSvg,
    '#mind-tile-horizon': tileHorizon,
    '#mind-horizon': horizonHost,
    '#mind-tile-butterfly': tileButterfly,
    '#mind-butterfly': butterflyHost,
    '#mind-tile-lexical': tileLexical,
    '#mind-lexical': lexicalHost,
    '#mind-tile-waffle': tileWaffle,
    '#mind-waffle': waffleHost
  };
  return {
    createElement: tag => el(tag),
    createElementNS: (_ns, tag) => el(tag),
    querySelector(selector) {
      if (hosts[selector]) return hosts[selector];
      for (const tree of [dashboard, insights, tileInsights, threadSheet]) {
        const found = tree.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-mind-agent]') return [];
      return [];
    },
    _energy: energy,
    _high: high,
    _silence: silence,
    _sessions: sessions,
    _insights: insights,
    _cross: cross,
    _themes: themes,
    _hero: hero,
    _dots: dots,
    _mixLabel: mixLabel
  };
}

function emptyModel(overrides = {}) {
  return {
    date: '2026-08-13',
    range: 'monthly',
    rangeLabel: 'Monthly',
    entryCount: 0,
    moodSeries: [],
    byMood: [],
    themes: [],
    sessions: [],
    energyByLevel: [],
    insights: [],
    crossAgentLines: [],
    daysSinceLastDiary: null,
    daysSinceLastMindSession: null,
    silence: false,
    empty: true,
    ...overrides
  };
}

test('renderMind shows empty states for sessions, insights, and cross-agent', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel());
  assert.match(root._sessions.textContent, /No sessions logged yet/);
  assert.match(root._insights.textContent, /No governance entries yet/);
  assert.match(root._cross.textContent, /No Vera or Penelope coordination lines yet/);
  assert.equal(root._silence.hidden, true);
  assert.equal(root._silence.children.length, 0);
});

test('renderMind renders energy rings, session mood-shift, insights, and silence', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    entryCount: 3,
    moodSeries: [
      { date: '2026-08-10', value: 4, mood: 'low' },
      { date: '2026-08-12', value: 7, mood: 'good' }
    ],
    byMood: [
      { key: 'great', label: 'Great', value: 0 },
      { key: 'good', label: 'Good', value: 1 },
      { key: 'neutral', label: 'Neutral', value: 0 },
      { key: 'low', label: 'Low', value: 1 },
      { key: 'bad', label: 'Bad', value: 0 }
    ],
    themes: [{ key: 'school', label: 'school', value: 2 }],
    energyByLevel: [
      { key: 'high', label: 'High', value: 1 },
      { key: 'medium', label: 'Medium', value: 0 },
      { key: 'low', label: 'Low', value: 2 }
    ],
    sessions: [{
      date: '2026-08-10',
      theme: 'Weekend',
      closingQuestion: 'What is the weekend for?',
      insight: 'Rest is not a prize. Keep the rest of this off the board.',
      observation: 'Long observation that must not dump onto the board.',
      moodAtOpen: 'low',
      moodAtClose: 'good',
      crossAgentNote: null,
      path: 's'
    }],
    insights: [{
      dateKey: '2026-08-10',
      entryType: 'Mind Insight',
      title: 'Weekend',
      status: 'Still Active',
      body: 'Rest is not a prize. A second sentence stays in the sheet.'
    }],
    crossAgentLines: ['Vera→Penelope: ask what the weekend is actually for.'],
    silence: true,
    daysSinceLastDiary: 12,
    daysSinceLastMindSession: 9
  }));

  assert.equal(root._high.querySelector('[data-role="fill"]').getAttribute('stroke-dasharray'), String(2 * Math.PI * 25));
  const card = root._sessions.querySelector('.mind-session-card');
  assert.ok(card);
  assert.match(card.textContent, /Weekend/);
  assert.match(card.textContent, /10\/08\/26/);
  assert.doesNotMatch(card.textContent, /2026-08-10/);
  assert.match(card.textContent, /mood lifted/);
  assert.doesNotMatch(card.textContent, /What is the weekend for/);
  assert.doesNotMatch(card.textContent, /Keep the rest of this off the board/);
  assert.equal(card.querySelector('.mind-session-shift')?.dataset.shift, 'improved');
  const insight = root._insights.querySelector('.governance-entry');
  assert.ok(insight);
  assert.equal(insight.dataset.current, 'true');
  assert.match(insight.textContent, /Mind Insight/);
  assert.doesNotMatch(insight.textContent, /second sentence stays in the sheet/);
  assert.match(root._cross.textContent, /Vera→Penelope/);
  assert.equal(root._cross.querySelector('[data-agent="vera"]')?.style.borderLeftColor, '#37598A');
  assert.equal(root._silence.hidden, false);
  assert.match(root._silence.textContent, /12 days since diary/);
  assert.match(root._silence.textContent, /9 days since a Vera session/);
  assert.match(root._themes.textContent, /school/);
  assert.doesNotMatch(root._themes.textContent, /school · 2/);
  assert.match(root._mixLabel.textContent, /Good/);
  assert.equal(root._dots.children.length, 2);
  assert.equal(root._dots.children[0].dataset.mood, 'low');
});

test('renderMind hides hero in the empty state and does not require launchers', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({ empty: true }));
  assert.equal(root._hero.hidden, true);
  assert.equal(root.querySelector('#mind-launcher-vera'), null);
  assert.equal(root.querySelector('#mind-cadence'), null);
});

test('firstSentence keeps one clause', () => {
  assert.equal(firstSentence('Rest is not a prize. Keep going.'), 'Rest is not a prize.');
  assert.equal(firstSentence(''), '');
});

test('renderMind caps insights to three scan rows', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    insights: [
      { dateKey: '2026-08-10', title: 'One', body: 'First.' },
      { dateKey: '2026-08-09', title: 'Two', body: 'Second.' },
      { dateKey: '2026-08-08', title: 'Three', body: 'Third.' },
      { dateKey: '2026-08-07', title: 'Four', body: 'Hidden.' }
    ]
  }));
  assert.doesNotMatch(root._insights.textContent, /Hidden/);
  assert.match(root._insights.textContent, /more in sheet/i);
});

test('renderMind paints honest empty instead of sparse chord, sankey, radial, and tension', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    themeCooccurrence: [{ themeA: 'work', themeB: 'shame', count: 1 }],
    moodTransitions: [{ from: 'low', to: 'good', count: 1 }],
    moodSeries: [],
    tensions: []
  }));
  assert.match(root.querySelector('#mind-tile-chord').textContent, /Need 3 paired themes/);
  assert.equal(root.querySelector('#mind-chord').children.length, 0);
  assert.match(root.querySelector('#mind-tile-transitions').textContent, /Need 3 transitions/);
  assert.equal(root.querySelector('#mind-sankey').children.length, 0);
  assert.match(root.querySelector('#mind-tile-radial').textContent, /Need /);
  assert.equal(root.querySelector('#mind-radial-year').children.length, 0);
  const tension = root.querySelector('#mind-tension');
  assert.equal(tension.hidden, false);
  assert.match(tension.textContent, /Need /);
});

test('renderMind paints factor bars and streak label', () => {
  const root = fakeRoot();
  renderMind(root, {
    ...emptyModel(),
    empty: false,
    factorEffects: [{ key: 'walk', label: 'walk', effect: 1.5, direction: 'positive' }],
    consistency: { daysWithEntry: 10, windowDays: 30, streak: 3 }
  });
  assert.match(root.querySelector('#mind-tile-factors').textContent, /walk/);
  assert.match(root.querySelector('#mind-tile-streak').textContent, /3/);
});

test('renderMind draws constellation nodes and keeps empty tension as honest empty', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    themeNodes: [{ key: 'work', count: 4, meanMood: 7 }],
    themeCooccurrence: [{ themeA: 'work', themeB: 'shame', count: 2 }],
    tensions: []
  }));
  const node = root.querySelector('#mind-constellation').querySelector('[data-theme="work"]');
  assert.ok(node);
  assert.equal(root.querySelector('#mind-tension').hidden, false);
  assert.match(root.querySelector('#mind-tension').textContent, /Need /);
});

test('renderMind paints waffle and stream marks', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    waffle: [{ date: '2026-08-01', mood: 'good', kind: 'diary' }],
    themeWeekly: {
      weeks: ['2026-08-03'],
      themes: ['work'],
      series: [{ key: 'work', values: [2] }]
    }
  }));
  assert.ok(root.querySelector('#mind-waffle').querySelector('[data-mood]'));
  assert.ok(root.querySelector('#mind-stream').querySelector('path'));
});

test('renderMind paints tension poles and keeps the tile visible', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    tensions: [{ body: 'The filter vs the need.', tension: { poleA: 'filter', poleB: 'need' }, stated: 0.2, revealed: 0.8 }]
  }));
  const tile = root.querySelector('#mind-tension');
  assert.equal(tile.hidden, false);
  const circles = [...(tile.querySelectorAll?.('circle') ?? tile.children)].filter(n => String(n.tagName).toLowerCase() === 'circle');
  assert.ok(circles.length >= 2 || tile.querySelector('svg'));
});

test('resurfacing card dismisses and stays gone', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); }
  };
  const root = fakeRoot();
  renderMind(root, {
    ...emptyModel(),
    resurfacing: { id: 'shame-loop-2026-08-10', theme: 'shame-loop', priorDate: '2026-07-01', excerpt: 'Old mention.' }
  });
  assert.match(root.querySelector('#mind-tile-insights').textContent, /came up again/i);
  root.querySelector('[data-mind-resurfacing-dismiss]').listeners.find(([t]) => t === 'click')[1]();
  renderMind(root, {
    ...emptyModel(),
    resurfacing: { id: 'shame-loop-2026-08-10', theme: 'shame-loop', priorDate: '2026-07-01', excerpt: 'Old mention.' }
  });
  assert.doesNotMatch(root.querySelector('#mind-tile-insights').textContent, /came up again/i);
});

test('renderMind shows human theme labels instead of snake_case keys', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    themes: [{ key: 'free_will', label: 'Free will', value: 1 }],
    themeNodes: [{ key: 'free_will', count: 3, meanMood: 6 }],
    butterfly: [{ theme: 'free_will', veraCount: 1, penelopeCount: 2 }]
  }));
  assert.match(root.querySelector('#mind-themes').textContent, /Free will/);
  assert.doesNotMatch(root.querySelector('#mind-themes').textContent, /free_will/);
  assert.doesNotMatch(root.querySelector('#mind-themes').textContent, /Free will · 1/);
  assert.match(root.querySelector('#mind-tile-constellation').textContent, /Free will/);
  assert.match(root.querySelector('#mind-butterfly').textContent, /Free will/);
  const mark = root.querySelector('#mind-constellation').querySelector('[data-theme="free_will"]');
  assert.ok(mark?.listeners?.some(([type]) => type === 'click'));
});

test('index.html Mind board has no Talk launchers or cadence heatmap', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="mind-dashboard"');
  const end = html.indexOf('id="central-node-dashboard"');
  const mind = html.slice(start, end);
  assert.doesNotMatch(mind, /id="mind-launcher-vera"/);
  assert.doesNotMatch(mind, /id="mind-launcher-penelope"/);
  assert.doesNotMatch(mind, /Talk with Vera/);
  assert.doesNotMatch(mind, /Talk with Penelope/);
  assert.doesNotMatch(mind, /id="mind-cadence"/);
  assert.doesNotMatch(mind, /id="mind-heatmap-diary"/);
  assert.match(mind, /id="mind-themes"/);
  assert.match(mind, /id="mind-tile-streak"/);
});

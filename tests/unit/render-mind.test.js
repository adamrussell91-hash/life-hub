import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMind } from '../../js/app/render-mind.js';

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
  const cadence = el('div');
  cadence.id = 'mind-cadence';
  const diaryHeat = el('div');
  diaryHeat.id = 'mind-heatmap-diary';
  const veraHeat = el('div');
  veraHeat.id = 'mind-heatmap-vera';
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
  const veraMeta = el('span');
  veraMeta.className = 'mind-launcher__meta';
  const veraBtn = el('button');
  veraBtn.id = 'mind-launcher-vera';
  veraBtn.dataset.mindAgent = 'vera';
  veraBtn.append(veraMeta);
  const penelopeMeta = el('span');
  penelopeMeta.className = 'mind-launcher__meta';
  const penelopeBtn = el('button');
  penelopeBtn.id = 'mind-launcher-penelope';
  penelopeBtn.dataset.mindAgent = 'penelope';
  penelopeBtn.append(penelopeMeta);
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
  const penelopeHeat = el('div');
  penelopeHeat.id = 'mind-heatmap-penelope';
  const constellation = el('svg');
  constellation.id = 'mind-constellation';
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
  const agentButtons = [veraBtn, penelopeBtn];
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
    '#mind-cadence': cadence,
    '#mind-heatmap-diary': diaryHeat,
    '#mind-heatmap-vera': veraHeat,
    '#mind-heatmap-penelope': penelopeHeat,
    '#mind-themes': themes,
    '#mind-empty': empty,
    '#mind-silence': silence,
    '#mind-sessions': sessions,
    '#mind-insights': insights,
    '#mind-cross-agent': cross,
    '#mind-board': board,
    '#mind-launcher-vera': veraBtn,
    '#mind-launcher-penelope': penelopeBtn,
    '[data-mind-agent="vera"]': veraBtn,
    '[data-mind-agent="penelope"]': penelopeBtn,
    '#mind-thread-sheet': threadSheet,
    '#mind-tile-insights': tileInsights,
    '#mind-tile-factors': tileFactors,
    '#mind-tile-streak': tileStreak,
    '#mind-streak-ring': streakRing,
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
    querySelector(selector) { return hosts[selector] ?? null; },
    querySelectorAll(selector) {
      if (selector === '[data-mind-agent]') return agentButtons;
      return [];
    },
    _energy: energy,
    _high: high,
    _silence: silence,
    _sessions: sessions,
    _insights: insights,
    _cross: cross,
    _diaryHeat: diaryHeat,
    _veraHeat: veraHeat,
    _themes: themes,
    _hero: hero,
    _cadence: cadence,
    _dots: dots,
    _mixLabel: mixLabel,
    _veraBtn: veraBtn,
    _penelopeBtn: penelopeBtn
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

test('renderMind renders energy rings, session mood-shift, insights, heatmap, and silence', () => {
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
      insight: 'Rest is not a prize.',
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
      body: 'Rest is not a prize.'
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
  assert.match(card.textContent, /mood lifted/);
  assert.equal(card.querySelector('.mind-session-shift')?.dataset.shift, 'improved');
  const insight = root._insights.querySelector('.governance-entry');
  assert.ok(insight);
  assert.equal(insight.dataset.current, 'true');
  assert.match(insight.textContent, /Mind Insight/);
  assert.match(root._cross.textContent, /Vera→Penelope/);
  assert.equal(root._cross.querySelector('[data-agent="vera"]')?.style.borderLeftColor, '#37598A');
  assert.equal(root._silence.hidden, false);
  assert.match(root._silence.textContent, /12 days since diary/);
  assert.match(root._silence.textContent, /9 days since a Vera session/);
  assert.equal(root._diaryHeat.children.length, 30);
  assert.equal(root._diaryHeat.children.filter(tile => tile.dataset.hit === 'true').length, 2);
  assert.equal(root._veraHeat.children.filter(tile => tile.dataset.hit === 'true').length, 1);
  assert.match(root._themes.textContent, /school/);
  assert.match(root._mixLabel.textContent, /Good/);
  assert.equal(root._dots.children.length, 2);
  assert.equal(root._dots.children[0].dataset.mood, 'low');
});

test('renderMind hides hero and cadence rows in the empty state', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({ empty: true }));
  assert.equal(root._hero.hidden, true);
  assert.equal(root._cadence.hidden, true);
  assert.equal(root._veraBtn.hidden, false);
  assert.equal(root._penelopeBtn.hidden, false);
});

function modelWithLaunchers() {
  return emptyModel({
    empty: false,
    launchers: {
      vera: { title: 'The Filter', daysAgo: 2, outcome: 'mood lifted' },
      penelope: { daysAgo: 0, outcome: 'logged' }
    }
  });
}

test('renderMind writes launcher context and keeps agent clicks', () => {
  const root = fakeRoot();
  const opens = [];
  renderMind(root, modelWithLaunchers(), {
    onOpenAgent: slug => opens.push(slug),
    agentsConfig: {}
  });
  assert.match(root.querySelector('#mind-launcher-vera').textContent, /Filter|mood lifted|Vera/i);
  const vera = root.querySelector('[data-mind-agent="vera"]');
  vera.listeners.find(([type]) => type === 'click')[1]();
  assert.deepEqual(opens, ['vera']);
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

test('renderMind draws constellation nodes and hides empty tension', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    themeNodes: [{ key: 'work', count: 4, meanMood: 7 }],
    themeCooccurrence: [{ themeA: 'work', themeB: 'shame', count: 2 }],
    tensions: []
  }));
  const node = root.querySelector('#mind-constellation').querySelector('[data-theme="work"]');
  assert.ok(node);
  assert.equal(root.querySelector('#mind-tension').hidden, true);
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

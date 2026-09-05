import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCentralNode } from '../../apps/life/js/app/render-central-node.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.id = '';
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.hidden = false;
    this.attributes = {};
    this.style = {};
    this.offsetHeight = 0;
    this._width = 0;
    this.classList = { add() {}, remove() {} };
    this.listeners = [];
  }

  getBoundingClientRect() {
    return { width: this._width ?? 0 };
  }

  addEventListener(type, fn) {
    this.listeners.push([type, fn]);
  }

  removeEventListener() {}

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  get textContent() {
    if (this.children.length) return this.children.map(child => child.textContent).join('');
    return this._textContent;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (matches(child, selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'hidden') this.hidden = true;
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }
}

function matches(el, selector) {
  if (!el) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) {
    return String(el.className || '').split(/\s+/).includes(selector.slice(1));
  }
  const dataMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (dataMatch[2]) return el.dataset?.[key] === dataMatch[2];
    return el.dataset?.[key] !== undefined;
  }
  return false;
}

const TILE_SPECS = [
  { id: 'cn-tile-status', span: 2 },
  { id: 'cn-tile-week', span: 1 },
  { id: 'cn-tile-month', span: 1 },
  { id: 'cn-tile-trends', span: 2 },
  { id: 'cn-tile-radial', span: 1 },
  { id: 'cn-tile-governance', span: 1 },
  { id: 'cn-tile-cross-agent', span: 1 },
  { id: 'cn-tile-actions', span: 1 },
  { id: 'cn-tile-constraints', span: 1 }
];

function fakeCentralNodeRoot({ boardWidth = 900 } = {}) {
  const dashboard = new FakeElement('section');
  dashboard.id = 'central-node-dashboard';
  dashboard.hidden = true;

  const sections = {};
  for (const key of [
    'todays-status',
    'this-week',
    'this-month',
    'long-term-trends',
    'cross-agent',
    'recent-actions',
    'constraints'
  ]) {
    const el = new FakeElement('div');
    el.dataset.centralNode = key;
    sections[key] = el;
  }

  const completionRing = new FakeElement('svg');
  completionRing.id = 'central-node-completion-ring';
  const track = new FakeElement('circle');
  track.dataset.role = 'track';
  const fill = new FakeElement('circle');
  fill.dataset.role = 'fill';
  completionRing.append(track, fill);

  const weekHorizon = new FakeElement('svg');
  weekHorizon.id = 'central-node-week-horizon';
  const radialYear = new FakeElement('svg');
  radialYear.id = 'central-node-radial-year';
  const stream = new FakeElement('svg');
  stream.id = 'central-node-stream';
  const chord = new FakeElement('svg');
  chord.id = 'central-node-chord';
  const governanceHeat = new FakeElement('div');
  governanceHeat.id = 'central-node-governance-heat';

  const chordDetail = new FakeElement('p');
  chordDetail.dataset.cn = 'chord-detail';
  const trendScan = new FakeElement('div');
  trendScan.dataset.role = 'trend-scan';
  const trendMore = new FakeElement('button');
  trendMore.dataset.role = 'trend-more';

  const liveComplete = {};
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const el = new FakeElement('li');
    el.dataset.liveComplete = key;
    liveComplete[key] = el;
  }
  const liveSnapshot = new FakeElement('p');
  liveSnapshot.dataset.liveSnapshot = '';
  const completionLabel = new FakeElement('span');
  completionLabel.dataset.value = 'completion-ring-label';

  const board = new FakeElement('div');
  board.id = 'cn-board';
  board._width = boardWidth;

  const tiles = {};
  for (const spec of TILE_SPECS) {
    const tile = new FakeElement(spec.id === 'cn-tile-constraints' ? 'details' : 'article');
    tile.id = spec.id;
    tile.className = 'cn-tile';
    tile.dataset.cnSpan = String(spec.span);
    tile.offsetHeight = 160;
    tiles[spec.id] = tile;
    board.append(tile);
  }

  tiles['cn-tile-status'].append(completionRing, completionLabel, ...Object.values(liveComplete), liveSnapshot, sections['todays-status']);
  tiles['cn-tile-week'].append(weekHorizon, sections['this-week']);
  tiles['cn-tile-month'].append(sections['this-month']);
  tiles['cn-tile-trends'].append(stream, trendScan, trendMore, sections['long-term-trends']);
  tiles['cn-tile-radial'].append(radialYear);
  tiles['cn-tile-governance'].append(governanceHeat);
  tiles['cn-tile-cross-agent'].append(chord, chordDetail, sections['cross-agent']);
  tiles['cn-tile-actions'].append(sections['recent-actions']);
  tiles['cn-tile-constraints'].append(sections.constraints);

  const auditButton = new FakeElement('button');
  auditButton.id = 'central-node-audit-button';
  const chatButton = new FakeElement('button');
  chatButton.id = 'central-node-chat-button';

  const bySelector = {
    '#central-node-dashboard': dashboard,
    '#cn-board': board,
    '#cn-tile-status': tiles['cn-tile-status'],
    '#cn-tile-week': tiles['cn-tile-week'],
    '#cn-tile-month': tiles['cn-tile-month'],
    '#cn-tile-trends': tiles['cn-tile-trends'],
    '#cn-tile-radial': tiles['cn-tile-radial'],
    '#cn-tile-governance': tiles['cn-tile-governance'],
    '#cn-tile-cross-agent': tiles['cn-tile-cross-agent'],
    '#cn-tile-actions': tiles['cn-tile-actions'],
    '#cn-tile-constraints': tiles['cn-tile-constraints'],
    '#central-node-completion-ring': completionRing,
    '#central-node-week-horizon': weekHorizon,
    '#central-node-radial-year': radialYear,
    '#central-node-stream': stream,
    '#central-node-chord': chord,
    '#central-node-governance-heat': governanceHeat,
    '#central-node-audit-button': auditButton,
    '#central-node-chat-button': chatButton,
    '[data-value="completion-ring-label"]': completionLabel,
    '[data-central-node="todays-status"]': sections['todays-status'],
    '[data-central-node="this-week"]': sections['this-week'],
    '[data-central-node="this-month"]': sections['this-month'],
    '[data-central-node="long-term-trends"]': sections['long-term-trends'],
    '[data-central-node="cross-agent"]': sections['cross-agent'],
    '[data-central-node="recent-actions"]': sections['recent-actions'],
    '[data-central-node="constraints"]': sections.constraints,
    '[data-live-snapshot]': liveSnapshot,
    '[data-cn="chord-detail"]': chordDetail,
    '[data-role="trend-scan"]': trendScan,
    '[data-role="trend-more"]': trendMore
  };
  for (const [key, el] of Object.entries(liveComplete)) {
    bySelector[`[data-live-complete="${key}"]`] = el;
  }
  for (const spec of TILE_SPECS) {
    bySelector[`#${spec.id}`] = tiles[spec.id];
  }

  return {
    createElement: tag => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    querySelector(selector) {
      if (bySelector[selector]) return bySelector[selector];
      return board.querySelector(selector) ?? dashboard.querySelector(selector);
    },
    _sections: sections,
    _board: board,
    _auditButton: auditButton,
    _tiles: tiles
  };
}

function baseModel(overrides = {}) {
  return {
    sections: {
      todaysStatus: 'Status text',
      thisWeek: '',
      thisMonth: 'Month text',
      longTermTrends: 'Trend text',
      crossAgentCoordination: 'Cross text',
      recentAgentActions: 'Actions text',
      constraints: 'Constraint text'
    },
    liveStatus: {
      completeness: { nutrition: true, fitness: false, diary: false, body: false, skincare: false },
      snapshot: { protein_g: 80, calories: 1200, fat_g: 20 }
    },
    completeness: { complete: 1, total: 5 },
    week: [
      { date: '2026-07-24', protein_g: 40 },
      { date: '2026-07-25', protein_g: 60 },
      { date: '2026-07-26', protein_g: 80 },
      { date: '2026-07-27', protein_g: 100 },
      { date: '2026-07-28', protein_g: 90 },
      { date: '2026-07-29', protein_g: 70 },
      { date: '2026-07-30', protein_g: 110 }
    ],
    loggingMonth: [],
    exerciseMonth: [],
    eatingMonth: [],
    ...overrides
  };
}

test('central node board markup packs tiles and unmounts the protein line and heatmaps', () => {
  const html = readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="central-node-dashboard"');
  const end = html.indexOf('hub-mobile-nav');
  const block = html.slice(start, end);

  assert.match(block, /id="cn-board"/);
  assert.match(block, /id="cn-tile-status"[\s\S]*cn-tile__question">Has today been logged\?/);
  assert.match(block, /id="cn-tile-week"[\s\S]*How is protein moving\?/);
  assert.match(block, /id="cn-tile-month"[\s\S]*What's on the month\?/);
  assert.match(block, /id="cn-tile-trends"[\s\S]*Where is attention going\?/);
  assert.match(block, /id="cn-tile-radial"[\s\S]*Who showed up this year\?/);
  assert.match(block, /id="cn-tile-governance"[\s\S]*What's still open\?/);
  assert.match(block, /id="cn-tile-cross-agent"[\s\S]*Who is handing off to whom\?/);
  assert.match(block, /id="cn-tile-actions"[\s\S]*What just happened\?/);
  assert.match(block, /id="cn-tile-constraints"[\s\S]*What still binds\?/);
  assert.match(block, /id="central-node-week-horizon"/);
  assert.match(block, /id="central-node-radial-year"/);
  assert.match(block, /id="central-node-stream"/);
  assert.match(block, /id="central-node-chord"/);
  assert.match(block, /id="central-node-governance-heat"/);
  assert.equal(block.includes('central-node-week-chart'), false);
  assert.equal(block.includes('central-node-logging-heatmap'), false);
  assert.equal(block.includes('central-node-exercise-heatmap'), false);
  assert.equal(block.includes('central-node-eating-heatmap'), false);
  assert.ok(block.indexOf('id="cn-board"') < block.indexOf('id="central-node-audit-button"'));
  assert.ok(block.indexOf('id="cn-board"') < block.indexOf('id="central-node-chat-button"'));
  assert.match(block, /id="central-node-audit-button"[\s\S]*Run audit/);
  assert.match(block, /id="central-node-chat-button"/);
  const week = block.slice(block.indexOf('id="cn-tile-week"'), block.indexOf('id="cn-tile-month"'));
  assert.ok(week.indexOf('central-node-week-horizon') < week.indexOf('data-central-node="this-week"'));
});

test('renderCentralNode omits empty this-week prose', () => {
  const root = fakeCentralNodeRoot();
  const model = baseModel({ sections: { ...baseModel().sections, thisWeek: '' } });

  renderCentralNode(root, model);

  const prose = root._sections['this-week'];
  assert.equal(prose.hidden || prose.textContent.trim() === '', true);
});

test('renderCentralNode shows this-week prose when present', () => {
  const root = fakeCentralNodeRoot();
  const model = baseModel({ sections: { ...baseModel().sections, thisWeek: 'Some week notes' } });

  renderCentralNode(root, model);

  const prose = root._sections['this-week'];
  assert.equal(prose.hidden, false);
  assert.match(prose.textContent, /Some week notes/);
});

test('packCnBoard uses Mind column breaks and ignores FABs', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 900 });
  renderCentralNode(root, baseModel());
  const board = root._board;
  const tiles = board.children.filter(node => node.className.includes('cn-tile'));
  assert.ok(tiles.length >= 8);
  assert.equal(tiles.every(tile => tile.style.position === 'absolute'), true);
  const status = tiles.find(tile => tile.id === 'cn-tile-status');
  assert.ok(Number.parseFloat(status.style.width) > 400);
  assert.equal(root._auditButton.style.position == null || root._auditButton.style.left == null, true);
});

test('packCnBoard is one column at 390 px', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 390 });
  renderCentralNode(root, baseModel());
  const tiles = root._board.children.filter(node => node.className.includes('cn-tile'));
  for (const tile of tiles) {
    assert.ok(Number.parseFloat(tile.style.width) >= 350);
  }
});

test('renderCentralNode omits empty this-month prose and keeps status fallback', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    sections: { ...baseModel().sections, thisWeek: '', thisMonth: '', todaysStatus: '' }
  }));
  assert.equal(root._sections['this-week'].hidden, true);
  assert.equal(root._sections['this-month'].hidden, true);
  assert.match(root._sections['todays-status'].textContent, /No agent notes yet/);
});

test('renderCentralNode paints a protein horizon and not a line chart', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel());
  const svg = root.querySelector('#central-node-week-horizon');
  const rects = svg.children.filter(node => node.tagName === 'rect');
  assert.equal(rects.length, 7);
  assert.ok(rects.every(rect => rect.getAttribute('fill') === 'var(--wave)'));
  assert.equal(root.querySelector('#central-node-week-chart'), null);
});

test('paintChartOrEmpty keeps the tile and writes honest empty copy', async () => {
  const { paintChartOrEmpty } = await import('../../apps/life/js/app/render-central-node.js');
  const root = fakeCentralNodeRoot();
  const host = root.querySelector('#cn-tile-week');
  const svg = root.querySelector('#central-node-week-horizon');
  svg.append(root.createElement('rect'));

  assert.equal(typeof paintChartOrEmpty, 'function');
  const qualifies = paintChartOrEmpty(root, host, svg, { need: 3, have: 1, unit: 'protein days' });

  assert.equal(qualifies, false);
  assert.equal(host.hidden, false);
  assert.equal(svg.hidden, true);
  assert.equal(svg.children.length, 0);
  const empty = host.children.find(node => String(node.className).includes('cn-honest-empty'));
  assert.ok(empty);
  assert.equal(empty.className, 'cn-honest-empty mind-honest-empty metric-caption');
  assert.equal(empty.textContent, 'Need 3 protein days. 1 so far.');
});

test('renderCentralNode paints three radial rings from year hit maps and honest-empties without hits', () => {
  const root = fakeCentralNodeRoot();
  const loggingYear = [
    { date: '2026-01-01', complete: true },
    { date: '2026-01-02', complete: false }
  ];
  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    loggingYear,
    exerciseYear: [{ date: '2026-01-02', completed: true }],
    eatingYear: [{ date: '2026-01-03', hitEatingTargets: false }]
  }));
  const svg = root.querySelector('#central-node-radial-year');
  const lines = svg.children.filter(node => node.tagName === 'line');
  assert.ok(lines.length >= 2);
  assert.ok(lines.some(line => line.getAttribute('stroke') === 'var(--wave)'));
  assert.equal(svg.hidden, false);

  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    loggingYear: [],
    exerciseYear: [],
    eatingYear: []
  }));
  const empty = root.querySelector('#cn-tile-radial').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 hit days this year/);
});

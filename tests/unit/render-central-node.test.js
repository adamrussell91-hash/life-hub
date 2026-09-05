import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packCnBoard, renderCentralNode } from '../../apps/life/js/app/render-central-node.js';

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
    this._listeners = {};
  }

  getBoundingClientRect() {
    return { width: this._width ?? 0 };
  }

  addEventListener(type, fn) {
    this.listeners.push([type, fn]);
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  click() {
    for (const [type, fn] of this.listeners) {
      if (type === 'click') fn();
    }
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
    for (const node of nodes) {
      if (node) node.parentNode = this;
    }
    this.children.push(...nodes);
  }

  after(node) {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const from = siblings.indexOf(node);
    if (from >= 0) siblings.splice(from, 1);
    const index = siblings.indexOf(this);
    node.parentNode = this.parentNode;
    siblings.splice(index + 1, 0, node);
  }

  replaceChildren(...nodes) {
    for (const child of this.children) {
      if (child && child.parentNode === this) child.parentNode = null;
    }
    this.children = [];
    this.append(...nodes);
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
  const governanceLog = new FakeElement('div');
  governanceLog.dataset.centralNode = 'governance-log';

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
  tiles['cn-tile-governance'].append(governanceHeat, governanceLog);
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
    '[data-role="trend-more"]': trendMore,
    '[data-central-node="governance-log"]': governanceLog
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
    createTextNode: text => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    },
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

test('renderCentralNode paints a stream with clinical colours and scans three trend blocks', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 900 });
  renderCentralNode(root, baseModel({
    domainWeekly: {
      weeks: ['2026-07-20', '2026-07-27'],
      series: [
        { key: 'nutrition', values: [2, 4] },
        { key: 'fitness', values: [1, 0] }
      ]
    },
    sections: {
      ...baseModel().sections,
      longTermTrends: '**Nutrition:**\n- Protein rising.\n**Exercise:**\n- EP anchor.\n**Health Trajectory:**\n- Taper.\n**Work/Energy:**\n- Holidays.'
    }
  }));
  const svg = root.querySelector('#central-node-stream');
  assert.ok(svg.children.some(node => node.tagName === 'path'));
  assert.ok(svg.children.some(node => node.getAttribute('fill') === 'var(--wave)'));
  const scan = root.querySelector('[data-role="trend-scan"]');
  assert.match(scan.textContent, /Nutrition/);
  assert.match(scan.textContent, /Exercise/);
  assert.equal(scan.textContent.includes('Work/Energy'), false);
  const more = root.querySelector('[data-role="trend-more"]');
  assert.equal(more.hidden, false);
  more.click();
  assert.match(scan.textContent, /Work\/Energy/);
});

test('renderCentralNode honest-empties the stream when there are no weekly bands', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({ domainWeekly: { weeks: [], series: [] } }));
  const empty = root.querySelector('#cn-tile-trends').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 weekly domain bands/);
});

test('renderCentralNode honest-empties a chord with fewer than 3 pairs', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: [{ themeA: 'Chadwick', themeB: 'Sara', count: 4 }],
      details: [{ themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] }]
    }
  }));
  const empty = root.querySelector('#cn-tile-cross-agent').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 3 paired handoffs/);
  assert.match(empty.textContent, /1 so far/);
});

test('renderCentralNode paints open-item heat and captions ageDays', () => {
  const root = fakeCentralNodeRoot();
  const points = [
    { date: '2026-06-08', count: 0 },
    { date: '2026-06-15', count: 1 },
    { date: '2026-06-22', count: 1 },
    { date: '2026-06-29', count: 1 },
    { date: '2026-07-06', count: 1 },
    { date: '2026-07-13', count: 1 },
    { date: '2026-07-20', count: 1 },
    { date: '2026-07-27', count: 1 }
  ];
  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    governanceHeat: [{ term: 'Sleep goal', points }],
    governanceOpen: [{ title: 'Sleep goal', entryType: 'Drift Detection', dateKey: '2026-07-01', ageDays: 29 }]
  }));
  const host = root.querySelector('#central-node-governance-heat');
  assert.ok(host.children.length >= 1);
  assert.match(host.textContent, /Sleep goal/);
  assert.match(host.textContent, /29d open/);
});

function htmlCollectionLike(items = []) {
  const collection = { length: items.length };
  items.forEach((item, index) => {
    collection[index] = item;
  });
  collection[Symbol.iterator] = function* () {
    for (let i = 0; i < this.length; i++) yield this[i];
  };
  return collection;
}

test('renderCentralNode honest-empties governance heat when nothing is open', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({ governanceHeat: [], governanceOpen: [] }));
  const empty = root.querySelector('#central-node-governance-heat').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 open items/);
});

test('paintChartOrEmpty appends honest empty when host.children lacks includes', async () => {
  const { paintChartOrEmpty } = await import('../../apps/life/js/app/render-central-node.js');
  const root = fakeCentralNodeRoot();
  const host = root.createElement('div');
  const appended = [];
  host.children = htmlCollectionLike([]);
  host.append = (...nodes) => {
    for (const node of nodes) appended.push(node);
  };
  const qualifies = paintChartOrEmpty(root, host, null, { need: 1, have: 0, unit: 'open items' });
  assert.equal(qualifies, false);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /Need 1 open items/);
});

test('renderCentralNode caps visible heat rows at 5', () => {
  const root = fakeCentralNodeRoot();
  const points = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-06-${String(8 + index * 7).padStart(2, '0')}`,
    count: 1
  }));
  const governanceHeat = Array.from({ length: 7 }, (_, index) => ({
    term: `Item ${index + 1}`,
    points
  }));
  renderCentralNode(root, baseModel({
    governanceHeat,
    governanceOpen: governanceHeat.map((row, index) => ({ title: row.term, ageDays: index }))
  }));
  const host = root.querySelector('#central-node-governance-heat');
  const rows = host.children.filter(node => String(node.className).includes('cn-watchlist-heat__row'));
  assert.equal(rows.length, 5);
});

test('renderCentralNode paints a chord and focuses a line into the caption', () => {
  const root = fakeCentralNodeRoot();
  const details = [
    { themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] },
    { themeA: 'Hammond', themeB: 'Ann', lines: ['Hammond→Ann: teaching handoff.'] },
    { themeA: 'Vera', themeB: 'Penelope', lines: ['Vera→Penelope: weekend framed as escape.'] }
  ];
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: details.map(row => ({ themeA: row.themeA, themeB: row.themeB, count: 1 })),
      details
    }
  }));
  const svg = root.querySelector('#central-node-chord');
  assert.ok(svg.children.some(node => node.getAttribute('data-role') === 'arc'));
  assert.ok(svg.children.some(node => node.getAttribute('data-role') === 'ribbon'));
  const caption = root.querySelector('[data-cn="chord-detail"]');
  assert.match(caption.textContent, /→/);
  const arc = svg.children.find(node => node.getAttribute('data-theme') === 'Hammond');
  arc._listeners.focus[0]();
  assert.match(caption.textContent, /Hammond→Ann/);
  assert.equal(root._sections['cross-agent'].hidden, true);
});

test('empty protein week honest-empties with no horizon rects', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    week: [
      { date: '2026-07-24', protein_g: 0 },
      { date: '2026-07-25', protein_g: 0 },
      { date: '2026-07-26', protein_g: 0 },
      { date: '2026-07-27', protein_g: 0 },
      { date: '2026-07-28', protein_g: 0 },
      { date: '2026-07-29', protein_g: 0 },
      { date: '2026-07-30', protein_g: 0 }
    ]
  }));
  const svg = root.querySelector('#central-node-week-horizon');
  const empty = root.querySelector('#cn-tile-week').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.ok(empty);
  assert.equal(empty.textContent, 'Need 1 protein days. 0 so far.');
  assert.equal(svg.hidden, true);
  assert.equal(svg.children.filter(node => node.tagName === 'rect').length, 0);
});

test('chord ribbon focus matches detail stored in reverse theme order', () => {
  const root = fakeCentralNodeRoot();
  const details = [
    { themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] },
    { themeA: 'Hammond', themeB: 'Ann', lines: ['Hammond→Ann: teaching handoff.'] },
    { themeA: 'Vera', themeB: 'Penelope', lines: ['Vera→Penelope: weekend framed as escape.'] }
  ];
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: [
        { themeA: 'Sara', themeB: 'Chadwick', count: 1 },
        { themeA: 'Hammond', themeB: 'Ann', count: 1 },
        { themeA: 'Vera', themeB: 'Penelope', count: 1 }
      ],
      details
    }
  }));
  const svg = root.querySelector('#central-node-chord');
  const caption = root.querySelector('[data-cn="chord-detail"]');
  const ribbon = svg.children.find(node => node.getAttribute('data-role') === 'ribbon');
  ribbon._listeners.focus[0]();
  assert.match(caption.textContent, /Chadwick→Sara: AC flag/);
});

test('chord ribbon focus shows that pair’s line, not every line for the source', () => {
  const root = fakeCentralNodeRoot();
  const details = [
    { themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] },
    { themeA: 'Chadwick', themeB: 'Ann', lines: ['Chadwick→Ann: teaching handoff.'] },
    { themeA: 'Vera', themeB: 'Penelope', lines: ['Vera→Penelope: weekend framed as escape.'] }
  ];
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: details.map(row => ({ themeA: row.themeA, themeB: row.themeB, count: 1 })),
      details
    }
  }));
  const svg = root.querySelector('#central-node-chord');
  const caption = root.querySelector('[data-cn="chord-detail"]');
  assert.equal(caption.textContent, 'Chadwick→Sara: AC flag.');
  const ribbons = svg.children.filter(node => node.getAttribute('data-role') === 'ribbon');
  const chadwickRibbons = ribbons.filter(node => node.getAttribute('data-theme') === 'Chadwick');
  assert.ok(chadwickRibbons.length >= 1);
  for (const ribbon of chadwickRibbons) {
    ribbon._listeners.focus[0]();
    const hasSara = caption.textContent.includes('Chadwick→Sara');
    const hasAnn = caption.textContent.includes('Chadwick→Ann');
    assert.equal(hasSara && hasAnn, false);
    assert.equal(hasSara || hasAnn, true);
  }
});

test('trend More after a second render reveals the new rest', () => {
  const root = fakeCentralNodeRoot();
  const sections = baseModel().sections;
  renderCentralNode(root, baseModel({
    domainWeekly: {
      weeks: ['2026-07-20', '2026-07-27'],
      series: [{ key: 'nutrition', values: [2, 4] }]
    },
    sections: {
      ...sections,
      longTermTrends: '**Nutrition:**\n- Protein rising.\n**Exercise:**\n- EP anchor.\n**Health Trajectory:**\n- Taper.\n**Work/Energy:**\n- Holidays.'
    }
  }));
  renderCentralNode(root, baseModel({
    domainWeekly: {
      weeks: ['2026-07-20', '2026-07-27'],
      series: [{ key: 'nutrition', values: [2, 4] }]
    },
    sections: {
      ...sections,
      longTermTrends: '**Nutrition:**\n- Protein rising.\n**Exercise:**\n- EP anchor.\n**Health Trajectory:**\n- Taper.\n**Sleep:**\n- New rest.'
    }
  }));
  const scan = root.querySelector('[data-role="trend-scan"]');
  const more = root.querySelector('[data-role="trend-more"]');
  assert.equal(more.hidden, false);
  more.click();
  assert.match(scan.textContent, /Sleep/);
  assert.equal(scan.textContent.includes('Work/Energy'), false);
});

test('honest-empty for stream and governance is not after the scan or list', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    domainWeekly: { weeks: [], series: [] },
    governanceHeat: [],
    governanceOpen: []
  }));

  const trends = root.querySelector('#cn-tile-trends');
  const stream = root.querySelector('#central-node-stream');
  const scan = root.querySelector('[data-role="trend-scan"]');
  const streamEmpty = trends.children.find(node => String(node.className).includes('cn-honest-empty'));
  assert.ok(streamEmpty);
  assert.equal(trends.children.indexOf(streamEmpty), trends.children.indexOf(stream) + 1);
  assert.ok(trends.children.indexOf(streamEmpty) < trends.children.indexOf(scan));

  const tile = root.querySelector('#cn-tile-governance');
  const heat = root.querySelector('#central-node-governance-heat');
  const list = tile.children.find(node => node.dataset?.centralNode === 'governance-log');
  const heatEmpty = heat.children.find(node => String(node.className).includes('cn-honest-empty'));
  const tileEmpty = tile.children.find(node => String(node.className).includes('cn-honest-empty'));
  assert.ok(heatEmpty);
  assert.match(heatEmpty.textContent, /Need 1 open items/);
  assert.equal(tileEmpty, undefined);
  assert.ok(list);
  assert.equal(tile.children.indexOf(heatEmpty), -1);
});

test('packCnBoard after governance height growth moves later tiles', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel());
  const board = root._board;
  const governance = root._tiles['cn-tile-governance'];
  const minBefore = Number.parseFloat(board.style.minHeight);
  const constraints = root._tiles['cn-tile-constraints'];
  const leftBefore = constraints.style.left;
  const topBefore = constraints.style.top;
  governance.offsetHeight = 480;
  packCnBoard(root);
  assert.ok(Number.parseFloat(board.style.minHeight) > minBefore);
  assert.equal(
    constraints.style.left !== leftBefore || constraints.style.top !== topBefore,
    true
  );
});

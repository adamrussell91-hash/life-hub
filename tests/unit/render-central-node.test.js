import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hideLoopId,
  packCnBoard,
  paintChartOrEmpty,
  readHiddenLoopIds,
  renderCentralNode
} from '../../apps/life/js/app/render-central-node.js';

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
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    this.listeners = [];
    this._listeners = {};
    this.parentNode = null;
  }

  addEventListener(type, fn) {
    this.listeners.push([type, fn]);
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  click() {
    let node = this;
    const event = { target: this };
    while (node) {
      for (const [type, fn] of node.listeners ?? []) {
        if (type === 'click') fn(event);
      }
      node = node.parentNode;
    }
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

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

const TILE_IDS = [
  'cn-tile-fat',
  'cn-tile-weight',
  'cn-tile-load',
  'cn-tile-collide',
  'cn-tile-mind',
  'cn-tile-train',
  'cn-tile-knowledge',
  'cn-tile-loops',
  'cn-tile-agents'
];

function fakeCentralNodeRoot() {
  const dashboard = new FakeElement('section');
  dashboard.id = 'central-node-dashboard';
  dashboard.hidden = true;

  const supporting = new FakeElement('p');
  supporting.dataset.centralNode = 'supporting';
  const status = new FakeElement('div');
  status.dataset.centralNode = 'todays-status';
  status.hidden = true;
  const needs = new FakeElement('div');
  needs.id = 'cn-needs';
  needs.dataset.centralNode = 'needs-you';

  const board = new FakeElement('div');
  board.id = 'cn-board';
  const tiles = {};
  for (const id of TILE_IDS) {
    const tile = new FakeElement('article');
    tile.id = id;
    tile.className = 'cn-tile';
    tiles[id] = tile;
    board.append(tile);
  }

  const fat = new FakeElement('svg');
  fat.id = 'cn-fat';
  const fatRead = new FakeElement('p');
  fatRead.dataset.cn = 'fat-read';
  const fatGoal = new FakeElement('p');
  fatGoal.dataset.cn = 'fat-goal';
  tiles['cn-tile-fat'].append(fat, fatRead, fatGoal);

  const weight = new FakeElement('svg');
  weight.id = 'cn-weight';
  const weightRead = new FakeElement('p');
  weightRead.dataset.cn = 'weight-read';
  const weightGoal = new FakeElement('p');
  weightGoal.dataset.cn = 'weight-goal';
  tiles['cn-tile-weight'].append(weight, weightRead, weightGoal);

  const load = new FakeElement('svg');
  load.id = 'cn-load';
  const loadRead = new FakeElement('p');
  loadRead.dataset.cn = 'load-read';
  tiles['cn-tile-load'].append(load, loadRead);

  const collide = new FakeElement('div');
  collide.id = 'cn-collide';
  const collideRead = new FakeElement('p');
  collideRead.dataset.cn = 'collide-read';
  const collideGoal = new FakeElement('p');
  collideGoal.dataset.cn = 'collide-goal';
  tiles['cn-tile-collide'].append(collide, collideRead, collideGoal);

  const pairs = new FakeElement('div');
  pairs.id = 'cn-pairs';
  const mindRead = new FakeElement('p');
  mindRead.dataset.cn = 'mind-read';
  const mindGoal = new FakeElement('p');
  mindGoal.dataset.cn = 'mind-goal';
  tiles['cn-tile-mind'].append(pairs, mindRead, mindGoal);

  const train = new FakeElement('svg');
  train.id = 'cn-train';
  const trainRead = new FakeElement('p');
  trainRead.dataset.cn = 'train-read';
  const trainGoal = new FakeElement('p');
  trainGoal.dataset.cn = 'train-goal';
  tiles['cn-tile-train'].append(train, trainRead, trainGoal);

  const know = new FakeElement('div');
  know.id = 'cn-know';
  const knowRead = new FakeElement('p');
  knowRead.dataset.cn = 'know-read';
  const knowGoal = new FakeElement('p');
  knowGoal.dataset.cn = 'know-goal';
  tiles['cn-tile-knowledge'].append(know, knowRead, knowGoal);

  const loops = new FakeElement('div');
  loops.id = 'cn-loops';
  loops.dataset.centralNode = 'open-loops';
  const loopRead = new FakeElement('p');
  loopRead.dataset.cn = 'loop-read';
  const loopsEmpty = new FakeElement('p');
  loopsEmpty.dataset.cn = 'loops-empty';
  loopsEmpty.hidden = true;
  tiles['cn-tile-loops'].append(loops, loopRead, loopsEmpty);

  const deposits = new FakeElement('div');
  deposits.dataset.centralNode = 'recent-actions';
  tiles['cn-tile-agents'].append(deposits);

  const constraints = new FakeElement('div');
  constraints.dataset.centralNode = 'constraints';
  const about = new FakeElement('div');
  about.dataset.centralNode = 'about-me';
  const history = new FakeElement('div');
  history.dataset.centralNode = 'governance-log';

  const chatButton = new FakeElement('button');
  chatButton.id = 'central-node-chat-button';
  const auditButton = new FakeElement('button');
  auditButton.id = 'central-node-audit-button';

  const bySelector = {
    '#central-node-dashboard': dashboard,
    '#cn-board': board,
    '#cn-needs': needs,
    '#cn-fat': fat,
    '#cn-weight': weight,
    '#cn-load': load,
    '#cn-collide': collide,
    '#cn-pairs': pairs,
    '#cn-train': train,
    '#cn-know': know,
    '#cn-loops': loops,
    '#central-node-chat-button': chatButton,
    '#central-node-audit-button': auditButton,
    '[data-central-node="supporting"]': supporting,
    '[data-central-node="todays-status"]': status,
    '[data-central-node="needs-you"]': needs,
    '[data-central-node="recent-actions"]': deposits,
    '[data-central-node="constraints"]': constraints,
    '[data-central-node="about-me"]': about,
    '[data-central-node="governance-log"]': history,
    '[data-cn="fat-read"]': fatRead,
    '[data-cn="fat-goal"]': fatGoal,
    '[data-cn="weight-read"]': weightRead,
    '[data-cn="weight-goal"]': weightGoal,
    '[data-cn="load-read"]': loadRead,
    '[data-cn="collide-read"]': collideRead,
    '[data-cn="collide-goal"]': collideGoal,
    '[data-cn="mind-read"]': mindRead,
    '[data-cn="mind-goal"]': mindGoal,
    '[data-cn="train-read"]': trainRead,
    '[data-cn="train-goal"]': trainGoal,
    '[data-cn="know-read"]': knowRead,
    '[data-cn="know-goal"]': knowGoal,
    '[data-cn="loop-read"]': loopRead,
    '[data-cn="loops-empty"]': loopsEmpty
  };
  for (const id of TILE_IDS) bySelector[`#${id}`] = tiles[id];

  const root = {
    dataset: {},
    listeners: [],
    createElement: tag => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    createTextNode: text => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    },
    addEventListener(type, fn) {
      this.listeners.push([type, fn]);
    },
    querySelector(selector) {
      if (bySelector[selector]) return bySelector[selector];
      return board.querySelector(selector)
        ?? needs.querySelector(selector)
        ?? dashboard.querySelector(selector);
    },
    _tiles: tiles,
    _needs: needs,
    _supporting: supporting,
    _constraints: constraints,
    _about: about,
    _deposits: deposits,
    _chatButton: chatButton
  };
  dashboard.append(supporting, status, needs, board, auditButton, chatButton);
  return root;
}

function baseModel(overrides = {}) {
  return {
    date: '2026-07-30',
    sections: {
      aboutMe: 'Teach English. Finish the MEd.',
      constraints: 'Constraint text',
      todaysStatus: 'Status text',
      thisWeek: '',
      thisMonth: '',
      longTermTrends: '',
      crossAgentCoordination: '',
      recentAgentActions: ''
    },
    fat: { fatCeiling: 50, days: [] },
    weight: { point: null, target: { low: 78, high: 82 } },
    trainingWeeks: [],
    moodStrip: [],
    hubLoad: { days: [], hubs: [], stack: [] },
    knowledgeTopics: { weeks: [], topics: [] },
    deposits: [],
    openLoops: [],
    needsYou: [],
    completeness: { complete: 1, total: 5 },
    ...overrides
  };
}

test('central node board markup is the synthesis layout', () => {
  const html = readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="central-node-dashboard"');
  const end = html.indexOf('hub-mobile-nav');
  const block = html.slice(start, end);

  assert.match(block, /Needs you/);
  assert.match(block, /What the evidence says/);
  assert.match(block, /id="cn-needs"/);
  assert.match(block, /id="cn-board"/);
  assert.match(block, /id="cn-tile-fat"[\s\S]*Is fat staying under the flare ceiling\?/);
  assert.match(block, /id="cn-tile-weight"[\s\S]*Where is weight against target\?/);
  assert.match(block, /id="cn-tile-load"[\s\S]*How heavy is the coming week\?/);
  assert.match(block, /id="cn-tile-collide"[\s\S]*Where do hubs pile onto the same day\?/);
  assert.match(block, /id="cn-tile-mind"[\s\S]*How has mood been moving\?/);
  assert.match(block, /id="cn-tile-train"[\s\S]*Is training holding under the flare rule\?/);
  assert.match(block, /id="cn-tile-knowledge"[\s\S]*What are you actually reading\?/);
  assert.match(block, /id="cn-tile-loops"[\s\S]*What has sat open longest\?/);
  assert.match(block, /id="cn-tile-agents"[\s\S]*What are the agents telling each other\?/);
  assert.match(block, /id="cn-tile-about"[\s\S]*Who is this for\?/);
  assert.match(block, /id="cn-tile-constraints"[\s\S]*What still binds\?/);
  assert.match(block, /id="cn-tile-history"[\s\S]*Change history/);
  assert.match(block, /data-central-node="about-me"/);
  assert.match(block, /data-central-node="todays-status"[\s\S]*hidden/);
  assert.equal(block.includes('id="cn-tile-status"'), false);
  assert.equal(block.includes('central-node-week-horizon'), false);
  assert.equal(block.includes('central-node-radial-year'), false);
  assert.equal(block.includes('central-node-chord'), false);
  assert.ok(block.indexOf('id="cn-board"') < block.indexOf('id="central-node-audit-button"'));
  assert.match(block, /id="central-node-audit-button"[\s\S]*Run audit/);
  assert.match(block, /id="central-node-chat-button"/);
});

test('packCnBoard is a no-op now that the board is CSS grid', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel());
  assert.equal(packCnBoard(root), undefined);
  for (const tile of Object.values(root._tiles)) {
    assert.notEqual(tile.style.position, 'absolute');
  }
});

test('paintChartOrEmpty keeps the tile and writes honest empty copy', () => {
  const root = fakeCentralNodeRoot();
  const host = root.querySelector('#cn-tile-fat');
  const svg = root.querySelector('#cn-fat');
  svg.append(root.createElement('rect'));

  const qualifies = paintChartOrEmpty(root, host, svg, { need: 3, have: 1, unit: 'logged fat days' });

  assert.equal(qualifies, false);
  assert.equal(host.hidden, false);
  assert.equal(svg.hidden, true);
  assert.equal(svg.children.length, 0);
  const empty = host.children.find(node => String(node.className).includes('cn-honest-empty'));
  assert.ok(empty);
  assert.equal(empty.className, 'cn-honest-empty mind-honest-empty metric-caption');
  assert.equal(empty.textContent, 'Need 3 logged fat days. 1 so far.');
});

test('paintChartOrEmpty appends honest empty when host.children lacks includes', () => {
  const root = fakeCentralNodeRoot();
  const host = root.createElement('div');
  const appended = [];
  const items = [];
  host.children = {
    get length() { return items.length; },
    [Symbol.iterator]: function* () {
      for (const item of items) yield item;
    }
  };
  host.append = (...nodes) => {
    for (const node of nodes) {
      items.push(node);
      appended.push(node);
    }
  };
  const qualifies = paintChartOrEmpty(root, host, null, { need: 1, have: 0, unit: 'open items' });
  assert.equal(qualifies, false);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /Need 1 open items/);
});

test('renderCentralNode paints fat bars and an honest empty when nothing is logged', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    fat: {
      fatCeiling: 50,
      days: [
        { date: '2026-07-29', fat_g: 62, logged: true, over: true },
        { date: '2026-07-30', fat_g: 27, logged: true, over: false }
      ]
    }
  }));
  const svg = root.querySelector('#cn-fat');
  assert.ok(svg.children.some(node => node.tagName === 'rect'));
  assert.match(root.querySelector('[data-cn="fat-read"]').textContent, /1 of 2 days over/);
  assert.match(root.querySelector('[data-cn="fat-goal"]').textContent, /recomposition/);

  renderCentralNode(root, baseModel());
  const empty = root.querySelector('#cn-tile-fat').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 logged fat days/);
});

test('renderCentralNode paints weight, mood, training, and hub heat from board series', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    weight: { point: { date: '2026-07-24', weight_kg: 80 }, target: { low: 78, high: 82 } },
    moodStrip: [
      { date: '2026-07-29', mood: 0, energy: 0, logged: false },
      { date: '2026-07-30', mood: 7, energy: 5, logged: true }
    ],
    trainingWeeks: [
      { weekStart: '2026-07-20', minutes: 26, over: false, cap: 30 },
      { weekStart: '2026-07-27', minutes: 40, over: true, cap: 30 }
    ],
    hubLoad: {
      days: ['2026-07-30', '2026-07-31'],
      hubs: [
        { name: 'Teaching', vals: [2, 0] },
        { name: 'Tasks', vals: [1, 0] }
      ],
      stack: [2, 0]
    },
    knowledgeTopics: {
      weeks: ['2026-07-20', '2026-07-27'],
      topics: [{ name: 'Gifted education', vals: [1, 2] }]
    }
  }));

  assert.ok(root.querySelector('#cn-weight').children.some(node => node.tagName === 'circle'));
  assert.match(root.querySelector('[data-cn="weight-read"]').textContent, /80 kg/);
  assert.equal(root.querySelector('#cn-pairs').children.length, 2);
  assert.match(root.querySelector('[data-cn="mind-read"]').textContent, /mood 7/);
  assert.ok(root.querySelector('#cn-train').children.some(node => String(node.className || '').includes('cn-bar--over')));
  assert.match(root.querySelector('[data-cn="collide-read"]').textContent, /pile-up/);
  assert.match(root.querySelector('[data-cn="know-read"]').textContent, /Gifted education/);
});

test('renderCentralNode writes collapsed About Me and constraints', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel());
  assert.match(root._about.textContent, /Teach English/);
  assert.match(root._constraints.textContent, /Constraint text/);
  assert.match(root._supporting.textContent, /No new deposits/);
});

test('renderCentralNode shows Needs you cards and latest deposits', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    needsYou: [{
      source: 'governance',
      owner: 'Hammond',
      title: 'Open loop',
      dateKey: '2026-07-01',
      ageDays: 29,
      status: 'Awaiting Adam',
      body: 'Need a yes or no on the sleep lock.'
    }],
    deposits: [{ from: 'Chadwick', to: 'Brisket', text: 'Session logged.' }],
    openLoops: [{ source: 'governance', owner: 'Hammond', title: 'Open loop', dateKey: '2026-07-01', ageDays: 29 }]
  }));
  assert.match(root._needs.textContent, /Open loop/);
  assert.match(root._needs.textContent, /Hammond is waiting on you/);
  assert.match(root._needs.textContent, /Need a yes or no on the sleep lock/);
  assert.match(root._deposits.textContent, /Chadwick to Brisket/);
  assert.match(root._supporting.textContent, /1 deposit/);
  const loop = root.querySelector('#cn-loops').children[0];
  assert.equal(loop.dataset.loopId, 'governance:2026-07-01:Open loop');
});

test('loop hide writes local storage and dismisses from the board callback', () => {
  const store = {};
  const storage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = value; }
  };
  assert.deepEqual(readHiddenLoopIds(storage), []);
  hideLoopId('governance:2026-07-01:Open loop', storage);
  assert.deepEqual(readHiddenLoopIds(storage), ['governance:2026-07-01:Open loop']);

  const root = fakeCentralNodeRoot();
  let hidden = [];
  renderCentralNode(root, baseModel({
    openLoops: [{ source: 'governance', owner: 'Hammond', title: 'Open loop', dateKey: '2026-07-01', ageDays: 29 }]
  }), {
    storage,
    onLoopsChange: ids => { hidden = ids; }
  });
  const dismiss = root.querySelector('#cn-loops').querySelector('[data-act="dismiss"]');
  dismiss.click();
  assert.ok(hidden.includes('governance:2026-07-01:Open loop'));
  assert.match(root.querySelector('[data-cn="loop-read"]').textContent, /Dismissed/);
});

test('Answer on a Needs you card hands the loop to Hammond', () => {
  const root = fakeCentralNodeRoot();
  let opened = 0;
  let handed = null;
  root._chatButton.addEventListener('click', () => { opened += 1; });
  const item = {
    source: 'governance',
    owner: 'Hammond',
    title: 'Open loop',
    dateKey: '2026-07-01',
    ageDays: 29,
    status: 'Awaiting Adam',
    body: 'Need a yes or no on the sleep lock.'
  };
  renderCentralNode(root, baseModel({ needsYou: [item] }), {
    onAnswer: loop => { handed = loop; }
  });
  const answer = root._needs.querySelector('[data-act="answer"]');
  answer.click();
  assert.equal(opened, 0);
  assert.equal(handed.title, 'Open loop');
  assert.equal(handed.body, 'Need a yes or no on the sleep lock.');
});

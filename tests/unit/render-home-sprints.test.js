import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHomeSprints } from '../../apps/life/js/app/render-home-sprints.js';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }
  get tokens() {
    return (this.owner.className || '').split(/\s+/).filter(Boolean);
  }
  contains(name) {
    return this.tokens.includes(name);
  }
  add(name) {
    const tokens = this.tokens;
    if (!tokens.includes(name)) tokens.push(name);
    this.owner.className = tokens.join(' ');
  }
  remove(name) {
    this.owner.className = this.tokens.filter(token => token !== name).join(' ');
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.children = [];
    this.listeners = [];
    this.hidden = false;
    this.src = '';
    this.alt = '';
    this.width = 0;
    this.height = 0;
    this.decoding = '';
    this.type = '';
    this.href = '';
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  querySelector(selector) {
    return this.nodes?.get(selector) ?? null;
  }
  addEventListener(type, fn) {
    this.listeners.push({ type, fn });
  }
  createElement(tag) {
    return new FakeElement(tag);
  }
  createElementNS(_ns, tag) {
    return new FakeElement(tag);
  }
  createDocumentFragment() {
    const frag = new FakeElement('fragment');
    frag.append = (...nodes) => { this._fragChildren = [...(this._fragChildren || []), ...nodes]; frag.children = this._fragChildren; };
    return frag;
  }
}

function hostTree() {
  const root = new FakeElement('document');
  const host = new FakeElement('section');
  host.id = 'home-sprints';
  host.setAttribute('hidden', '');
  const status = new FakeElement('p');
  const rail = new FakeElement('div');
  const count = new FakeElement('p');
  const heading = new FakeElement('h2');
  heading.id = 'home-sprints-heading';
  heading.textContent = 'Challenge sprint';
  host.nodes = new Map([
    ['[data-home-sprints-status]', status],
    ['[data-home-sprints-rail]', rail],
    ['[data-home-sprints-count]', count],
    ['#home-sprints-heading', heading]
  ]);
  root.nodes = new Map([['#home-sprints', host]]);
  root._host = host;
  root._status = status;
  root._rail = rail;
  root._count = count;
  root._heading = heading;
  const origReplace = rail.replaceChildren.bind(rail);
  rail.replaceChildren = (...nodes) => {
    const flat = [];
    for (const n of nodes) {
      if (n?.children?.length && n.tagName === 'FRAGMENT') flat.push(...n.children);
      else if (n?._fragChildren) flat.push(...n._fragChildren);
      else flat.push(n);
    }
    origReplace(...flat);
  };
  return root;
}

function walkTexts(node, texts = []) {
  if (node.textContent) texts.push(node.textContent);
  for (const child of node.children || []) walkTexts(child, texts);
  return texts;
}

function findByClass(node, className) {
  if ((node.className || '').split(/\s+/).includes(className)) return node;
  for (const child of node.children || []) {
    const hit = findByClass(child, className);
    if (hit) return hit;
  }
  return null;
}

function findAllByClass(node, className, out = []) {
  if ((node.className || '').split(/\s+/).includes(className)) out.push(node);
  for (const child of node.children || []) findAllByClass(child, className, out);
  return out;
}

const sprintRow = {
  sprint: { id: 'blitz', kind: 'sprint' },
  state: {
    id: 'blitz',
    title: 'Belly Flab Blitz',
    open: true,
    ended_awaiting_review: false,
    day_label: 'day 4 of 12',
    day_n: 4,
    length_days: 12,
    end_date: '2026-10-12',
    checkin_done_today: false,
    lead_agent: 'hammond',
    headline: {
      label: 'Midsection',
      metricLabel: 'Waist',
      unit: 'cm',
      baseline: 89,
      direction: 'down',
      latest: { value: 88 },
      delta: -1,
      readings: [
        { date: '2026-10-01', value: 89 },
        { date: '2026-10-04', value: 88 }
      ]
    },
    lanes: [
      {
        agent: 'brisket',
        role: 'Eating',
        status: 'on_track',
        measureSummaries: [{ label: 'Protein ≥ target', met: 3, judged: 3 }]
      },
      {
        agent: 'chadwick',
        role: 'Training',
        status: 'unavailable',
        measureSummaries: [{ label: 'Workout', met: 0, judged: 0 }]
      }
    ]
  }
};

test('home sprints card hidden when API returns no open sprints', async () => {
  const root = hostTree();
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [], flags: {} }) }
  });
  assert.equal(root._host.getAttribute('hidden'), '');
  assert.equal(root._rail.children.length, 0);
});

test('home sprints card shows day, headline, lanes, check-in; unavailable ≠ missed', async () => {
  const root = hostTree();
  let opened = null;
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [sprintRow], flags: { anyOpen: true } }) },
    onOpenChat: href => { opened = href; }
  });
  assert.equal(root._host.getAttribute('hidden'), null);
  assert.equal(root._rail.children.length, 1);
  assert.equal(root._count.textContent, '1 open');
  const card = root._rail.children[0];
  const blob = walkTexts(card).join(' | ');
  assert.match(blob, /Belly Flab Blitz/);
  assert.match(blob, /Day 4 of 12/i);
  assert.match(blob, /Waist/);
  assert.match(blob, /On track/);
  assert.match(blob, /Unavailable/);
  assert.doesNotMatch(blob, /\bMissed\b/i);
  assert.match(blob, /Protein ≥ target · 3 of 3 days/);
  assert.match(blob, /Brisket/);
  assert.match(blob, /Chadwick/);

  const avatars = findAllByClass(card, 'home-sprint-card__avatar');
  assert.equal(avatars.length, 2);
  assert.match(avatars[0].src, /brisket/);
  assert.match(avatars[1].src, /chadwick/);

  const tracks = findAllByClass(card, 'home-sprint-card__track');
  assert.ok(tracks.length >= 2);
  assert.equal(tracks[0].attributes['aria-valuenow'], '33');
  assert.equal(tracks[1].attributes['aria-valuenow'], '100');

  const checkBtn = findByClass(card, 'home-sprint-card__cta');
  assert.equal(checkBtn?.textContent, 'Check in');
  checkBtn.listeners.find(l => l.type === 'click')?.fn();
  assert.match(opened, /#\/chat\/hammond\?protocol=sprint-checkin/);
});

test('home sprints card shows ended — final review state', async () => {
  const root = hostTree();
  const ended = {
    ...sprintRow,
    state: {
      ...sprintRow.state,
      open: false,
      ended_awaiting_review: true,
      checkin_done_today: false
    }
  };
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [ended], flags: { endedAwaitingReview: true } }) }
  });
  assert.equal(root._host.getAttribute('hidden'), null);
  const card = root._rail.children[0];
  const btn = findByClass(card, 'home-sprint-card__cta');
  assert.equal(btn?.textContent, 'Ended — final review');
});

test('home sprints check-in done uses intentional done chip and secondary lead link', async () => {
  const root = hostTree();
  const doneRow = {
    ...sprintRow,
    state: { ...sprintRow.state, checkin_done_today: true }
  };
  let opened = null;
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [doneRow], flags: {} }) },
    onOpenChat: href => { opened = href; }
  });
  const card = root._rail.children[0];
  assert.ok(findByClass(card, 'home-sprint-card__done'));
  const secondary = findByClass(card, 'home-sprint-card__secondary');
  assert.match(secondary?.textContent || '', /Message Hammond/);
  secondary.listeners.find(l => l.type === 'click')?.fn({ preventDefault() {} });
  assert.match(opened, /#\/chat\/hammond/);
});

test('home sprints section heading leads with challenge name; defaults viz to glide-slope for down headline', async () => {
  const root = hostTree();
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [sprintRow], flags: { anyOpen: true } }) }
  });
  assert.equal(root._heading.textContent, 'Belly Flab Blitz');
  const card = root._rail.children[0];
  assert.equal(card.dataset.vizHeadline, 'glide-slope');
  assert.equal(card.dataset.vizLanes, 'progress-track');
  const blob = walkTexts(card).join(' | ');
  assert.match(blob, /Glide slope/);
});

test('home sprints respects explicit viz and falls back safely without ownerDocument mounts', async () => {
  const root = hostTree();
  const row = {
    ...sprintRow,
    sprint: { id: 'blitz', kind: 'sprint', viz: { headline: 'area-line', lanes: 'ring' } },
    state: {
      ...sprintRow.state,
      viz: { headline: 'area-line', lanes: 'ring' }
    }
  };
  await renderHomeSprints(root, {
    api: { list: async () => ({ sprints: [row], flags: {} }) }
  });
  const card = root._rail.children[0];
  assert.equal(card.dataset.vizHeadline, 'area-line');
  assert.equal(card.dataset.vizLanes, 'ring');
  assert.ok(findAllByClass(card, 'home-sprint-card__lane-ring').length >= 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  hubDomainForItem,
  isOwnHubItem,
  openInHubHref,
  openInHubLabel,
  openInHubLinkHtml
} from '../../packages/design-kit/js/calendar/open-in-hub.js';
import {
  calendarZoomHref,
  normalizeCalendarZoom,
  parseCalendarZoom
} from '../../packages/design-kit/js/calendar/hub-calendar-zoom.js';
import {
  createHubSourceLoader,
  paintSourceErrors
} from '../../packages/design-kit/js/calendar/load-hub-sources.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function lineCount(rel) {
  return readFileSync(join(root, rel), 'utf8').split('\n').length;
}

test('hub adapters stay ≤150 lines (defaultFilter, fills, routeFor, mount only)', () => {
  assert.ok(lineCount('apps/teaching/src/teacher/hub-calendar.ts') <= 150);
  assert.ok(lineCount('apps/professional/src/calendar/hub-calendar.ts') <= 150);
  assert.ok(lineCount('apps/tasks/src/views/hub-calendar.ts') <= 150);
});

test('Pages hub calendar adapters prefix getApiBaseUrl (not same-origin /api)', () => {
  // life-hub.adam-russell.com is GitHub Pages — /api/* is SPA HTML 404.
  // Functions live on api.adam-russell.com; relative fetch breaks every source.
  for (const rel of [
    'apps/teaching/src/teacher/hub-calendar.ts',
    'apps/professional/src/calendar/hub-calendar.ts',
    'apps/tasks/src/views/hub-calendar.ts'
  ]) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.match(src, /getApiBaseUrl/, rel);
    assert.match(src, /\$\{getApiBaseUrl\(\)\}/, rel);
    assert.doesNotMatch(src, /return fetch\(path,/);
  }
});

test('Life events loader batches /api/repo/files like Life sync-repository', () => {
  const src = readFileSync(join(root, 'packages/design-kit/js/calendar/load-life-events.js'), 'utf8');
  assert.match(src, /MAX_BATCH_FILES\s*=\s*50/);
  assert.match(src, /batchLifeFileRequests/);
  assert.match(src, /for \(const batch of batchLifeFileRequests/);
});

test('Tideline Hammond tray wires Review, Dismiss all, and portrait src', () => {
  const src = readFileSync(join(root, 'packages/design-kit/js/calendar/render-tideline.js'), 'utf8');
  assert.match(src, /data-action': 'review'/);
  assert.match(src, /data-action': 'dismiss-all'/);
  assert.match(src, /\/assets\/agents\/hammond\.jpg/);
  assert.match(src, /function reviewNextGhost/);
  assert.match(src, /function dismissAll/);
  assert.match(src, /agentAvatarNode/);
});

test('open-in-hub maps domains and builds full-nav Open in links', () => {
  assert.equal(hubDomainForItem({ kind: 'task' }), 'tasks');
  assert.equal(hubDomainForItem({ source: 'professional_meeting' }), 'professional');
  assert.equal(hubDomainForItem({ source: 'scheduled_lesson', isClass: true }), 'teaching');
  assert.equal(isOwnHubItem({ kind: 'task' }, 'tasks'), true);
  assert.equal(isOwnHubItem({ kind: 'task' }, 'teaching'), false);
  assert.equal(openInHubLabel('professional'), 'Open in Professional');
  const href = openInHubHref(
    { kind: 'task', id: 't1' },
    (item) => `/tasks/#/task/${item.id}`
  );
  assert.equal(href, '/tasks/#/task/t1');
  const html = openInHubLinkHtml(
    { kind: 'task', id: 't1' },
    { hub: 'teaching', routeFor: (item) => `/tasks/#/task/${item.id}` }
  );
  assert.match(html, /Open in Tasks/);
  assert.match(html, /data-part="open-in-hub"/);
  assert.match(html, /href="\/tasks\/#\/task\/t1"/);
  assert.equal(
    openInHubLinkHtml({ kind: 'task' }, { hub: 'tasks', routeFor: () => '#/task/x' }),
    ''
  );
  // Visual-seed foreign chips often have kind only — still get a landing Open in link.
  const pd = openInHubLinkHtml(
    { kind: 'professional', id: 'resource-day' },
    { hub: 'teaching', routeFor: () => null }
  );
  assert.match(pd, /Open in Professional/);
  assert.match(pd, /data-part="open-in-hub"/);
  assert.match(pd, /href="\/professional\/#\/calendar"/);
});

test('calendar zoom href/parse per hub; month redirects to week', () => {
  assert.equal(normalizeCalendarZoom('month'), 'week');
  assert.equal(calendarZoomHref('teaching', 'week'), '/calendar');
  assert.equal(calendarZoomHref('teaching', 'term'), '/calendar/term');
  assert.equal(calendarZoomHref('tasks', 'year'), '#/year');
  assert.equal(calendarZoomHref('professional', 'almanac'), '#/calendar/almanac');
  assert.equal(calendarZoomHref('life', 'day'), '#/calendar/day');
  assert.equal(parseCalendarZoom({ pathname: '/teaching/calendar/term' }, 'teaching'), 'term');
  assert.equal(parseCalendarZoom({ pathname: '/calendar' }, 'teaching'), 'week');
  assert.equal(parseCalendarZoom({ hash: '#/calendar/year' }, 'professional'), 'year');
  assert.equal(parseCalendarZoom({ hash: '#/month' }, 'tasks'), 'week');
  assert.equal(parseCalendarZoom({ hash: '#/almanac' }, 'tasks'), 'almanac');
});

test('hub source loader surfaces per-source error with Retry copy, never silent 0', async () => {
  const apiFetch = async (path) => {
    if (path.includes('curriculum')) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ ok: false })
      };
    }
    if (path.includes('schedule-projections')) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ ok: false })
      };
    }
    if (path.includes('tasks') || path.includes('work-blocks') || path.includes('planning') || path.includes('workflow') || path.includes('hub-prefs')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { tasks: [], work_blocks: [], school_terms: [] } })
      };
    }
    if (path.includes('knowledge')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { pages: [] } })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
  };

  const loader = createHubSourceLoader({ apiFetch });
  await loader.loadAll();
  const statuses = loader.getStatuses();
  assert.equal(statuses.teaching.status, 'error');
  assert.match(statuses.teaching.error, /Couldn't load Teaching/);
  assert.equal(statuses.professional.status, 'error');
  assert.match(statuses.professional.error, /Couldn't load Professional/);
  assert.equal(statuses.tasks.status, 'live');
  assert.equal(loader.getEvents().length, 0);

  const doc = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        textContent: '',
        childNodes: [],
        style: {},
        setAttribute() {},
        addEventListener() {},
        append(...nodes) {
          this.childNodes.push(...nodes);
        },
        replaceChildren(...nodes) {
          this.childNodes = nodes;
        },
        remove() {
          this.removed = true;
        },
        querySelector() {
          return null;
        },
        prepend(node) {
          this.childNodes.unshift(node);
        }
      };
      return el;
    },
    createTextNode(text) {
      return { textContent: text };
    }
  };
  const host = {
    childNodes: [],
    querySelector() {
      return null;
    },
    prepend(node) {
      this.childNodes.unshift(node);
    }
  };
  let retried = null;
  paintSourceErrors(doc, host, statuses, (id) => {
    retried = id;
  });
  assert.equal(host.childNodes.length, 1);
  const strip = host.childNodes[0];
  assert.equal(strip.dataset.part, 'source-errors');
  assert.ok(strip.childNodes.length >= 2);
  const line = strip.childNodes.find((n) => n.dataset?.source === 'professional');
  assert.ok(line);
  assert.match(line.childNodes[0].textContent, /Couldn't load Professional/);
  const retry = line.childNodes.find((n) => n.textContent === 'Retry');
  assert.ok(retry);
  retry.addEventListener = undefined;
  // click wired via addEventListener on create — re-paint with working listener
  const clicks = [];
  const host2 = {
    childNodes: [],
    querySelector() {
      return null;
    },
    prepend(node) {
      this.childNodes.unshift(node);
    }
  };
  const doc2 = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        textContent: '',
        childNodes: [],
        type: '',
        listeners: {},
        setAttribute() {},
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        append(...nodes) {
          this.childNodes.push(...nodes);
        },
        replaceChildren(...nodes) {
          this.childNodes = nodes;
        },
        remove() {},
        querySelector() {
          return null;
        },
        prepend(node) {
          this.childNodes.unshift(node);
        }
      };
      return el;
    },
    createTextNode(text) {
      return { textContent: text };
    }
  };
  paintSourceErrors(doc2, host2, { professional: statuses.professional }, (id) => clicks.push(id));
  const btn = host2.childNodes[0].childNodes[0].childNodes.find((n) => n.textContent === 'Retry');
  btn.listeners.click();
  assert.deepEqual(clicks, ['professional']);
  assert.equal(retried, null);
});

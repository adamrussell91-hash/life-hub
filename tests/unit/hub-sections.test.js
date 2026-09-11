import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listHubSections } from '../../apps/life/js/shell/hub-sections.js';
import { formatHubPulseCount, formatLessonGlance, renderHubPulse } from '../../apps/life/js/shell/render-hub-pulse.js';
import { hubSwitcherHost, hubSwitcherHtml, listUmbrellaHubs } from '../../packages/hub-switcher.js';

test('hub section registry names Teaching, Knowledge, and Tasks', () => {
  const ids = listHubSections().map(section => section.id);
  assert.deepEqual(ids, ['teaching', 'knowledge', 'tasks']);
});

test('Teaching mount is the same-origin SPA and keeps the student prefix', () => {
  const teaching = listHubSections().find(section => section.id === 'teaching');
  assert.equal(teaching.origin, '/teaching/');
  assert.equal(teaching.studentPublicPrefix, '/teaching/s/');
});

test('Knowledge mount is the same-origin SPA', () => {
  const knowledge = listHubSections().find(section => section.id === 'knowledge');
  assert.equal(knowledge.origin, '/knowledge/');
});

test('Tasks mount is the same-origin SPA', () => {
  const tasks = listHubSections().find(section => section.id === 'tasks');
  assert.equal(tasks.origin, '/tasks/');
});

test('Life shell links out to remounted hubs instead of stub dashboards', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/teaching\/"/);
  assert.match(html, /href="\/knowledge\/"/);
  assert.match(html, /href="\/tasks\/"/);
  assert.match(html, /data-hub-pulse="teaching"/);
  assert.match(html, /data-hub-pulse="knowledge"/);
  assert.match(html, /data-hub-pulse="tasks"/);
  assert.doesNotMatch(html, /id="clare-dump-form"/);
  assert.doesNotMatch(html, /id="teaching-dashboard"/);
  assert.doesNotMatch(html, /id="knowledge-dashboard"/);
  assert.doesNotMatch(html, /id="tasks-dashboard"/);
  assert.doesNotMatch(html, /data-section="teaching"/);
  assert.doesNotMatch(html, /data-section="knowledge"/);
  assert.doesNotMatch(html, /data-section="tasks"/);
  assert.doesNotMatch(html, /teaching-api|knowledge-api|tasks-api/i);
});

test('hub pulse shows today\'s next lesson for Teaching and a live count for Tasks', () => {
  const cards = {
    teaching: { glance: { textContent: '' }, status: { textContent: '', hidden: false } },
    knowledge: { status: { textContent: '', hidden: false } },
    tasks: { count: { textContent: '' }, status: { textContent: '', hidden: false } }
  };
  const root = {
    querySelector(selector) {
      const match = selector.match(/data-hub-pulse="(\w+)"/);
      if (!match) return null;
      const card = cards[match[1]];
      return {
        dataset: {},
        querySelector(inner) {
          if (inner === '[data-hub-glance]') return card.glance;
          if (inner === '[data-hub-count]') return card.count;
          if (inner === '[data-hub-status]') return card.status;
          return null;
        }
      };
    }
  };
  renderHubPulse(root, {
    teaching: { status: 'ready', nextLesson: { classTitle: 'Year 10 English', lessonTitle: '', startTime: '09:40' } },
    knowledge: { status: 'ready' },
    tasks: { status: 'error' }
  });
  assert.equal(cards.teaching.glance.textContent, 'Year 10 English · 09:40');
  assert.equal(cards.tasks.count.textContent, '—');
  assert.match(cards.tasks.status.textContent, /Could not load/);
});

test('hub pulse count copy is singular for one item', () => {
  assert.equal(formatHubPulseCount('tasks', 1), '1 open task');
});

test('formatLessonGlance names an honest empty state and includes the lesson topic when known', () => {
  assert.equal(formatLessonGlance(null), 'No lessons today');
  assert.equal(formatLessonGlance({ classTitle: 'Year 8 Maths', lessonTitle: '', startTime: '08:45' }), 'Year 8 Maths · 08:45');
  assert.equal(
    formatLessonGlance({ classTitle: 'Year 10 English', lessonTitle: 'Analysing belonging', startTime: '09:40' }),
    'Year 10 English · Analysing belonging · 09:40'
  );
});

test('umbrella hub switcher lists Life plus the three remounted hubs', () => {
  const ids = listUmbrellaHubs().map(hub => hub.id);
  assert.deepEqual(ids, ['life', 'teaching', 'knowledge', 'tasks']);
  const html = hubSwitcherHtml('knowledge');
  assert.match(html, /data-hub-switcher/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/teaching\/"/);
  assert.match(html, /href="\/knowledge\/"/);
  assert.match(html, /href="\/tasks\/"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /data-hub-toggle="knowledge"/);
  assert.match(html, /class="hub-row is-active"/);
});

test('hub switcher host prefers the rail so it stays out of the scrolling nav', () => {
  const rail = { classList: { contains: name => name === 'hub-rail' } };
  const nav = { closest: selector => (selector === '.hub-rail' ? rail : null) };
  assert.equal(hubSwitcherHost(nav), rail);
  assert.equal(hubSwitcherHost(nav), rail);
});

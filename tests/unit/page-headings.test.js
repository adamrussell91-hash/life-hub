import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('section dashboards do not repeat the page name as a kicker under the topbar', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const ids = [
    'nutrition-dashboard',
    'fitness-dashboard',
    'skincare-dashboard',
    'calendar-dashboard',
    'body-dashboard',
    'body-bloods-dashboard',
    'body-medical-dashboard',
    'mind-dashboard',
    'central-node-dashboard',
    'teaching-dashboard',
    'knowledge-dashboard',
    'tasks-dashboard'
  ];
  for (const id of ids) {
    const start = html.indexOf(`id="${id}"`);
    assert.ok(start >= 0, id);
    const next = html.indexOf('<section id="', start + 10);
    const chunk = html.slice(start, next === -1 ? undefined : next);
    assert.doesNotMatch(chunk, /class="section-kicker"/, `${id} still has a duplicate kicker`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('calendar dashboard mounts a host for the shared time-grid calendar', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="calendar-dashboard"');
  const next = html.indexOf('<section id="', start + 10);
  const chunk = html.slice(start, next === -1 ? undefined : next);

  assert.match(chunk, /id="life-calendar-host"/);
  assert.match(html, /packages\/design-kit\/calendar\.css/);
  assert.doesNotMatch(chunk, /teaching-api|knowledge-api|tasks-api/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('calendar dashboard includes a shared-source placeholder card', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="calendar-dashboard"');
  const next = html.indexOf('<section id="', start + 10);
  const chunk = html.slice(start, next === -1 ? undefined : next);

  assert.match(chunk, /id="calendar-source-registry"/);
  assert.match(chunk, /data-calendar="sources-empty"/);
  assert.match(chunk, /id="calendar-source-list"/);
  assert.match(chunk, /Shared sources/);
  assert.doesNotMatch(chunk, /teaching-api|knowledge-api|tasks-api/i);
});

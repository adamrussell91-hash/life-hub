import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseBrainDump } from '../../netlify/functions/_shared/clare-dump.mjs';
import {
  composeDueLine,
  composeDumpText,
  defaultScheduleValues,
  formatDisplayTime,
  readHubCompose
} from '../../packages/design-kit/js/hub-compose.js';

test('display time is 24-hour HH:MM, never a US clock', () => {
  assert.equal(formatDisplayTime('9:30'), '09:30');
  assert.equal(formatDisplayTime('13:05'), '13:05');
  assert.equal(formatDisplayTime(''), '');
});

test('default schedule is Sydney today and the next whole hour', () => {
  const noon = new Date('2026-07-30T12:00:00+10:00');
  assert.deepEqual(defaultScheduleValues(noon), { dateKey: '2026-07-30', time: '12:00' });

  const half = new Date('2026-07-30T12:30:00+10:00');
  assert.deepEqual(defaultScheduleValues(half), { dateKey: '2026-07-30', time: '13:00' });
});

test('due line uses locked dd/mm/yy and never a US month-day', () => {
  assert.equal(composeDueLine('2026-07-30', '13:00'), 'due 30/07/26 at 13:00');
  assert.doesNotMatch(composeDueLine('2026-07-30', '13:00'), /Jul|July|Dec|AM|PM/i);
});

test('plain dump stays untouched; schedule appends a Clare-parseable due phrase', () => {
  assert.equal(composeDumpText('Buy milk'), 'Buy milk');
  assert.equal(composeDumpText('Buy milk', { scheduled: false, dateKey: '2026-07-30' }), 'Buy milk');
  assert.equal(
    composeDumpText('Buy milk', { scheduled: true, dateKey: '2026-07-30', timeValue: '13:00' }),
    'Buy milk due 30/07/26 at 13:00'
  );
  assert.equal(
    composeDumpText('Buy milk due 30/07/26', { scheduled: true, dateKey: '2026-07-30', timeValue: '13:00' }),
    'Buy milk due 30/07/26'
  );
});

test('scheduled dump text is a due date Clare can parse', () => {
  const text = composeDumpText('Book the florist', {
    scheduled: true,
    dateKey: '2026-07-30',
    timeValue: '13:00'
  });
  const [item] = parseBrainDump(text, { now: new Date('2026-07-01T12:00:00+10:00') });
  assert.equal(item.due_date, '2026-07-30');
  assert.match(item.title, /florist/i);
  assert.doesNotMatch(item.title, /30\/07\/26/);
});

test('readHubCompose is null on a plain form', () => {
  assert.equal(readHubCompose({ matches() { return false; } }), null);
});

test('kit, chrome, Life, Teaching, and Knowledge all load hub-compose', async () => {
  const css = await readFile(new URL('../../packages/design-kit/hub-compose.css', import.meta.url), 'utf8');
  const chrome = await readFile(new URL('../../packages/design-kit/chrome.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../apps/life/js/app/main.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../../apps/life/js/app/app-controller.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');
  const teaching = await readFile(new URL('../../apps/teaching/src/design/tokens.css', import.meta.url), 'utf8');
  const knowledge = await readFile(new URL('../../apps/knowledge/src/tokens.css', import.meta.url), 'utf8');
  const snippet = await readFile(new URL('../../packages/design-kit/snippets/hub-compose.html', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../../packages/design-kit/js/hub-motion.js', import.meta.url), 'utf8');

  assert.match(css, /--hub-compose-duration: 700ms/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /will be posted/i);
  assert.match(chrome, /hub-compose\.css/);
  assert.match(html, /packages\/design-kit\/hub-compose\.css/);
  assert.match(html, /id="clare-dump-form"/);
  assert.match(html, /data-hub-compose/);
  assert.match(html, /id="clare-dump-text"/);
  assert.match(html, /id="clare-dump-protocol"/);
  assert.match(html, /id="clare-brief-button"/);
  assert.doesNotMatch(html, /Write a dump/);
  assert.doesNotMatch(html, /Will be posted/);
  assert.match(main, /startHubMotion/);
  assert.match(controller, /readHubCompose/);
  assert.match(controller, /compose/);
  assert.match(sw, /hub-compose\.css/);
  assert.match(sw, /hub-compose\.js/);
  assert.match(teaching, /hub-compose\.css/);
  assert.match(knowledge, /hub-compose\.css/);
  assert.match(snippet, /data-hub-compose/);
  assert.doesNotMatch(snippet, /Will be posted/);
  assert.match(motion, /mountHubComposes/);
});

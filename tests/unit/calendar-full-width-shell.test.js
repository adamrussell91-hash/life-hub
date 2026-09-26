/**
 * Kit calendar shell: every zoom fills the content column; rail stacks under.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const calendarCss = readFileSync(resolve(root, 'packages/design-kit/calendar.css'), 'utf8');
const calendarMd = readFileSync(resolve(root, 'packages/design-kit/CALENDAR.md'), 'utf8');

test('hub-calendar__workspace is a single full-width column (no side rail track)', () => {
  const block = calendarCss.match(/\.hub-calendar__workspace\s*\{[^}]+\}/);
  assert.ok(block, 'workspace rule exists');
  assert.match(block[0], /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(block[0], /minmax\(0,\s*1fr\)\s+min\(/);
  assert.match(block[0], /width:\s*100%/);
  assert.match(block[0], /max-width:\s*none/);
});

test('hub-calendar__rail is stacked (not sticky side)', () => {
  const block = calendarCss.match(/\.hub-calendar__rail\s*\{[^}]+\}/);
  assert.ok(block, 'rail rule exists');
  assert.match(block[0], /position:\s*static/);
  assert.match(block[0], /width:\s*100%/);
  assert.doesNotMatch(block[0], /position:\s*sticky/);
});

test('kit mount + zoom roots fill the content column', () => {
  assert.match(calendarCss, /\.hub-calendar-mount[\s\S]*?width:\s*100%/);
  assert.match(calendarCss, /\.hub-calendar-mount\s+\.cal/);
  assert.match(calendarCss, /\.hub-calendar-mount\s+\.dd/);
  assert.match(calendarCss, /\.hub-calendar-mount\s+\.tr/);
  assert.match(calendarCss, /\.hub-calendar-mount\s+\.alm/);
});

test('CALENDAR.md locks layout width contract', () => {
  assert.match(calendarMd, /Layout width \(locked\)/);
  assert.match(calendarMd, /single column/i);
  assert.match(calendarMd, /stacks \*\*under\*\*/);
});

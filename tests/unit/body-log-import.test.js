import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBodyLogMarkdown, parseBodyLogLine } from '../../scripts/lib/body-log-import.mjs';

test('parseBodyLogLine extracts weight and body fat', () => {
  const events = parseBodyLogLine('19 May 2015: weight 88.5 kg, body fat 21.2%');
  assert.equal(events.length, 1);
  assert.equal(events[0].slug, 'composition');
  assert.equal(events[0].record.type, 'composition');
  assert.equal(events[0].record.date, '2015-05-19');
  assert.equal(events[0].record.weight_kg, 88.5);
  assert.equal(events[0].record.body_fat_pct, 21.2);
  assert.equal(events[0].record.time, '12:00');
  assert.equal(events[0].record.source, 'notion_import');
});

test('parseBodyLogLine weight-only and fat-only', () => {
  const weight = parseBodyLogLine('19 May 2026: weight 88 kg');
  assert.equal(weight[0].slug, 'weight');
  assert.equal(weight[0].record.weight_kg, 88);

  const fat = parseBodyLogLine('6 Nov 2014: body fat 19.8%');
  assert.equal(fat[0].slug, 'composition');
  assert.equal(fat[0].record.body_fat_pct, 19.8);
  assert.equal(fat[0].record.weight_kg, undefined);
});

test('parseBodyLogLine same-day a/b get distinct slugs and ids', () => {
  const a = parseBodyLogLine('26 Dec 2019 (a): body fat 36.1%');
  const b = parseBodyLogLine('26 Dec 2019 (b): body fat 36.5%');
  assert.equal(a[0].record.date, '2019-12-26');
  assert.equal(b[0].record.date, '2019-12-26');
  assert.equal(a[0].slug, 'composition-a');
  assert.equal(b[0].slug, 'composition-b');
  assert.notEqual(a[0].record.id, b[0].record.id);
});

test('parseBodyLogMarkdown skips headings and counts dated lines', () => {
  const md = `# Title

### 2015

19 May 2015: weight 88.5 kg, body fat 21.2%
21 Jul 2015: weight 89.55 kg

## Tape measurements

Chest 99 cm
`;
  const events = parseBodyLogMarkdown(md);
  assert.equal(events.length, 2);
});

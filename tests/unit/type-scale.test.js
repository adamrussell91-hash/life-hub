import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../apps/life/css/app.css'),
  'utf8'
);

test('app.css font sizes use the closed type scale', () => {
  const vals = [...css.matchAll(/font-size:\s*([^;]+);/g)].map(match => match[1].trim());
  const allowed = /^(inherit|[\d.]+px|var\(--(?:text|font-size)-|clamp\(var\(--(?:text|font-size)-)/;
  const stray = vals.filter(value => !allowed.test(value));
  assert.deepEqual(stray, [], 'ad-hoc font-size values must map onto --text-* tokens');
});

test('mind chart entrances are disabled under reduced motion', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.mind-mood-dot/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.mind-pie-slice/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.mind-theme-chip/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.mind-insight/);
});

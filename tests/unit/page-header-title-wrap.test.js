import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('kit page titles wrap at words, and extra phone actions leave the title row (T2)', async () => {
  const chrome = await readFile(new URL('../../packages/design-kit/chrome.css', import.meta.url), 'utf8');
  const knowledge = await readFile(new URL('../../apps/knowledge/src/style.css', import.meta.url), 'utf8');

  assert.match(chrome, /\.page-header__title\s*\{[^}]*overflow-wrap:\s*break-word/);
  assert.match(chrome, /\.page-header__title\s*\{[^}]*word-break:\s*normal/);
  assert.match(chrome, /@media \(max-width: 720px\)[\s\S]*\.page-header\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(
    chrome,
    /\.page-header__actions:has\(>\s*:not\(\.hub-utilities\)\)\s*\{[^}]*flex:\s*1 0 100%/
  );

  assert.doesNotMatch(
    knowledge,
    /\.page-header__title,\s*\.reader__title\s*\{[^}]*overflow-wrap:\s*anywhere/
  );
  assert.match(knowledge, /\.page-header__title\s*\{[^}]*overflow-wrap:\s*break-word/);
  assert.match(knowledge, /\.reader__title\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

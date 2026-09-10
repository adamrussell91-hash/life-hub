import test from 'node:test';
import assert from 'node:assert/strict';
import { rewritePublishedKitSpecifiers } from '../../scripts/lib/rewrite-published-kit-imports.mjs';

const publishRoot = new URL('file:///hub/dist/');
const fromFile = new URL('file:///hub/dist/js/app/render-medical.js');

test('rewrites import and export from specifiers to the published kit path', () => {
  const source = [
    "import { createHubFilter } from '../../../../packages/design-kit/js/hub-filter-menu.js';",
    "export { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';"
  ].join('\n');
  const published = rewritePublishedKitSpecifiers(source, fromFile, publishRoot);
  assert.match(published, /from '\.\.\/\.\.\/packages\/design-kit\/js\/hub-filter-menu\.js'/);
  assert.match(published, /from '\.\.\/\.\.\/packages\/design-kit\/js\/format-display-date\.js'/);
});

test('leaves comments and plain string literals alone', () => {
  const source = [
    "const note = '../../../../packages/design-kit/js/hub-filter-menu.js';",
    "// see ../../../../packages/design-kit/js/format-display-date.js"
  ].join('\n');
  assert.equal(rewritePublishedKitSpecifiers(source, fromFile, publishRoot), source);
});

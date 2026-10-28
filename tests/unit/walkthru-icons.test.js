import test from 'node:test';
import assert from 'node:assert/strict';
import { tidy } from '../../scripts/import-walkthru-icons.mjs';

test('the icon importer drops the scan page, title and fixed size', () => {
  const raw = `<?xml version='1.0'?>\n<svg xmlns="http://www.w3.org/2000/svg" width="141" height="142" viewBox="0 0 141 142" role="img"><title id="t">menu icon Quizzing</title><desc>Traced</desc><path d="M0 0 C46.53 0 93.06 0 141 0 Z" fill="#FDFDFD" transform="translate(0,0)" /><path d="M0 0 C1.71 1.28 3.37 2.62 5.123456 4 Z" fill="#242422" transform="translate(44,52)" /></svg>`;
  const out = tidy(raw);
  assert.ok(out.includes('viewBox="0 0 141 142"'));
  assert.ok(!out.includes('FDFDFD'));
  assert.ok(!/<title|<desc|width=|role=/.test(out));
  assert.ok(out.includes('#242422'));
  assert.ok(out.includes('5.12 4'), 'numbers are rounded');
  assert.equal(tidy('<svg></svg>'), null);
});

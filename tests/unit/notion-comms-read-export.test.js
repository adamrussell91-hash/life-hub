import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseCsv, parseRelations, pageIdFromFilename, matchRowsToPages, readExport } from '../../scripts/lib/notion-comms/read-export.mjs';

test('parseCsv handles a BOM, quoted commas, newlines and escapes', () => {
  assert.deepEqual(parseCsv('\ufeffTitle,Notes\n"Sample, note","one\ntwo ""quoted"""'), [{ Title: 'Sample, note', Notes: 'one\ntwo "quoted"' }]);
});

test('matchRowsToPages matches by normalised title and never guesses duplicates', () => {
  const page = { id: 'a'.repeat(32), name: 'Staff  meeting aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md', body: '' };
  const result = matchRowsToPages([{ 'Meeting Title': ' Staff meeting ' }, { 'Meeting Title': 'Unknown' }], [page]);
  assert.deepEqual(result.matches, [page, null]);
  assert.deepEqual(result.unmatchedRows, [1]);
});

test('relation parsing retains names and stable Notion ids', () => {
  assert.deepEqual(parseRelations('Sam K. (People%20abc123def456abc123def456abc123de.md), https://www.notion.so/Ollie-P-9876543210abcdef9876543210abcdef'), [
    { name: 'Sam K.', notionId: 'abc123def456abc123def456abc123de' }, { name: 'Ollie P', notionId: '9876543210abcdef9876543210abcdef' }
  ]);
  assert.equal(pageIdFromFilename('Example abc123def456abc123def456abc123de.md'), 'abc123def456abc123def456abc123de');
});

test('readExport prefers the complete CSV and matches invented fixture pages', async () => {
  const fixture = path.resolve('tests/fixtures/notion-comms'); const result = await readExport(fixture);
  assert.match(result.csvName, /_all\.csv$/);
  assert.equal(result.rows.length, 6);
  assert.equal(result.unmatchedRows.length, 0);
  assert.equal(result.pageList.length, 6);
});

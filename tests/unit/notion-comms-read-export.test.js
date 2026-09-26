import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseRelations, pageIdFromFilename } from '../../scripts/lib/notion-comms/read-export.mjs';

test('parseCsv handles a BOM, quoted commas, newlines and escapes', () => {
  assert.deepEqual(parseCsv('\ufeffTitle,Notes\n"Sample, note","one\ntwo ""quoted"""'), [{ Title: 'Sample, note', Notes: 'one\ntwo "quoted"' }]);
});

test('relation parsing retains names and stable Notion ids', () => {
  assert.deepEqual(parseRelations('Sam K. (People%20abc123def456abc123def456abc123de.md), https://www.notion.so/Ollie-P-9876543210abcdef9876543210abcdef'), [
    { name: 'Sam K.', notionId: 'abc123def456abc123def456abc123de' }, { name: 'Ollie P', notionId: '9876543210abcdef9876543210abcdef' }
  ]);
  assert.equal(pageIdFromFilename('Example abc123def456abc123def456abc123de.md'), 'abc123def456abc123def456abc123de');
});

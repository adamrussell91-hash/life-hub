import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isArchiveLookupQuery,
  topicQuery
} from '../../netlify/functions/_shared/knowledge-research.mjs';

test('existence checks are archive lookups and strip to the topic', () => {
  assert.equal(isArchiveLookupQuery('Do I already have a note on coincidence reasoning?'), true);
  assert.equal(topicQuery('Do I already have a note on coincidence reasoning?'), 'coincidence reasoning');
  assert.equal(isArchiveLookupQuery('Synthesise coincidence reasoning'), false);
});

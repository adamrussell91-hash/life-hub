import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTopicTags, canonicalTopicTag } from '../../netlify/functions/_shared/knowledge-tidy-tags.mjs';
import { applyTidyProposal, parseTidyProposal } from '../../netlify/functions/_shared/knowledge-tidy.mjs';

test('parseTidyProposal keeps closed-list tags and optional title', () => {
  const proposal = parseTidyProposal(JSON.stringify({
    tags: ['philosophy knowledge and society', 'Invented'],
    title: 'Working memory',
    body: 'Miller.\n\n\nMore.'
  }));
  assert.deepEqual(proposal.tags, ['Philosophy Knowledge and Society']);
  assert.equal(proposal.title, 'Working memory');
  assert.equal(proposal.body, 'Miller.\n\nMore.');
});

test('applyTidyProposal keeps structural tags and replaces topics', () => {
  const next = applyTidyProposal({
    id: 'note-1',
    title: 'Old',
    tags: ['Note', 'EDST5805', 'Motivation and Self Regulation'],
    body: 'x'
  }, {
    tags: ['Learning Science and Cognition'],
    title: null,
    body: 'Cleaned'
  });
  assert.equal(next.title, 'Old');
  assert.deepEqual(next.tags, ['Note', 'EDST5805', 'Learning Science and Cognition']);
  assert.equal(canonicalTopicTag('learning science and cognition'), 'Learning Science and Cognition');
  assert.deepEqual(applyTopicTags(['Note'], ['Wellbeing Mental Health and Trauma']), [
    'Note',
    'Wellbeing Mental Health and Trauma'
  ]);
});

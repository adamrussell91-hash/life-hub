import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTopicTags, canonicalTopicTag } from '../../netlify/functions/_shared/knowledge-tidy-tags.mjs';
import {
  applyTidyProposal,
  parseTidyProposal,
  restoreDroppedFileLinks,
  tidyQualityIssues
} from '../../netlify/functions/_shared/knowledge-tidy.mjs';
import { readFileSync } from 'node:fs';

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

test('applyTidyProposal puts back file links the model dropped and keeps attachments', () => {
  const attachment = {
    id: 'att-1',
    kind: 'pdf',
    r2_key: 'university/paper.pdf',
    filename: 'paper.pdf',
    content_type: 'application/pdf'
  };
  const next = applyTidyProposal({
    id: 'note-1',
    title: 'Metacognition',
    tags: ['Note', 'EDUC9736', 'Learning Science and Cognition'],
    body: '[paper.pdf](Enhancing%20Metacognition/paper.pdf)\n\n[Family Therapy](Family%20Therapy%201a0f.md)\n\nRaw notes.',
    attachments: [attachment],
    connected: ['page_other']
  }, {
    tags: ['Learning Science and Cognition'],
    title: null,
    body: 'Tidied prose about metacognition.'
  });
  assert.match(next.body, /\[paper\.pdf\]\(Enhancing%20Metacognition\/paper\.pdf\)/);
  assert.match(next.body, /\[Family Therapy\]\(Family%20Therapy%201a0f\.md\)/);
  assert.match(next.body, /Tidied prose about metacognition/);
  assert.deepEqual(next.attachments, [attachment]);
  assert.deepEqual(next.connected, ['page_other']);
});

test('restoreDroppedFileLinks keeps a rewritten label that still points at the same file', () => {
  const restored = restoreDroppedFileLinks(
    '[s10984-013-9153-7.pdf](Readings%20folder/s10984-013-9153-7.pdf)',
    '[Paper](Readings%20folder/s10984-013-9153-7.pdf)\n\nClean prose.'
  );
  assert.equal(restored, '[Paper](Readings%20folder/s10984-013-9153-7.pdf)\n\nClean prose.');
  assert.equal(
    restoreDroppedFileLinks('[paper.pdf](folder/(2021) paper.pdf)', 'Clean prose.'),
    '[paper.pdf](folder/(2021) paper.pdf)\n\nClean prose.'
  );
});

test('tidy no longer rejects existing encoded file links, and still rejects extraction dumps', () => {
  const page = { title: 'Working memory', body: 'Raw' };
  assert.deepEqual(tidyQualityIssues(page, {
    title: null,
    tags: ['Learning Science and Cognition'],
    body: '[Note](..%2FEDST5888%20Capstone%20Readings%2Fpaper.md)\n\nReadable prose.'
  }), []);
  assert.deepEqual(tidyQualityIssues(page, {
    title: null,
    tags: ['Learning Science and Cognition'],
    body: 'APA 7 reference: Miller (1956)'
  }), ['contains an extraction metadata dump']);
});

test('tidy prompt tells the model to keep file links', () => {
  const prompt = readFileSync(new URL('../../config/knowledge/tidy.md', import.meta.url), 'utf8');
  assert.match(prompt, /Keep every existing markdown file link/);
  assert.doesNotMatch(prompt, /Remove local file paths/);
});

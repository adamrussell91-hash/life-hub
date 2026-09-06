import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceKnowledgeIntakeJob,
  createKnowledgeIntakeJob,
  resolveKnowledgeIntakeJob,
  runKnowledgeIntakeUntilReview,
  unresolvedJobForPage
} from '../../netlify/functions/_shared/knowledge-intake.mjs';

const page = {
  id: 'note-1',
  title: 'Old title',
  tags: ['Note'],
  body: 'Messy   body\n\n\nMore.',
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z'
};

const proposal = {
  tags: ['Learning Science and Cognition'],
  title: 'Working memory',
  body: 'Miller seven plus or minus two.'
};

function deps(overrides = {}) {
  const saved = [];
  return {
    nowIso: () => '2026-09-06T02:00:00.000Z',
    getPage: async id => (id === page.id ? { ...page } : null),
    proposeTidy: async () => proposal,
    savePage: async next => {
      saved.push(next);
      return { ...next, updated_at: '2026-09-06T02:05:00.000Z' };
    },
    saved,
    ...overrides
  };
}

test('intake jobs start queued and walk extracting → classifying → awaiting review', async () => {
  const job = createKnowledgeIntakeJob({
    id: 'ai_job_1',
    page_id: 'note-1',
    now: '2026-09-06T01:00:00.000Z'
  });
  assert.equal(job.kind, 'knowledge_intake');
  assert.equal(job.status, 'working');
  assert.equal(job.phase, 'queued');

  const extracting = await advanceKnowledgeIntakeJob(job, deps());
  assert.equal(extracting.phase, 'extracting');
  assert.equal(extracting.status, 'working');

  const classifying = await advanceKnowledgeIntakeJob(extracting, deps());
  assert.equal(classifying.phase, 'classifying');
  assert.equal(classifying.extracted_text, page.body);
  assert.equal(classifying.extracted_title, page.title);

  const review = await advanceKnowledgeIntakeJob(classifying, deps());
  assert.equal(review.phase, 'awaiting_review');
  assert.equal(review.status, 'done');
  assert.deepEqual(review.proposal, proposal);
});

test('runKnowledgeIntakeUntilReview stops before writing the page', async () => {
  const context = deps();
  const review = await runKnowledgeIntakeUntilReview(
    createKnowledgeIntakeJob({ id: 'ai_job_1', page_id: 'note-1', now: '2026-09-06T01:00:00.000Z' }),
    context
  );
  assert.equal(review.phase, 'awaiting_review');
  assert.equal(context.saved.length, 0);
});

test('accept applies the tidy proposal; reject leaves the page alone', async () => {
  const context = deps();
  const review = await runKnowledgeIntakeUntilReview(
    createKnowledgeIntakeJob({ id: 'ai_job_1', page_id: 'note-1', now: '2026-09-06T01:00:00.000Z' }),
    context
  );
  const accepted = await resolveKnowledgeIntakeJob(review, 'accepted', context);
  assert.equal(accepted.phase, 'done');
  assert.equal(accepted.resolution, 'accepted');
  assert.equal(context.saved.length, 1);
  assert.equal(context.saved[0].title, 'Working memory');
  assert.ok(context.saved[0].tags.includes('Learning Science and Cognition'));
  assert.equal(context.saved[0].body, 'Miller seven plus or minus two.');

  const rejectedContext = deps();
  const rejected = await resolveKnowledgeIntakeJob(review, 'rejected', rejectedContext);
  assert.equal(rejected.phase, 'rejected');
  assert.equal(rejected.resolution, 'rejected');
  assert.equal(rejectedContext.saved.length, 0);
});

test('accept refuses when the page changed while the review card was open', async () => {
  const context = deps({
    getPage: async () => ({
      ...page,
      body: 'Edited while the card was open.',
      updated_at: '2026-09-06T01:30:00.000Z'
    })
  });
  const review = await runKnowledgeIntakeUntilReview(
    createKnowledgeIntakeJob({ id: 'ai_job_1', page_id: 'note-1', now: '2026-09-06T01:00:00.000Z' }),
    deps()
  );
  await assert.rejects(
    () => resolveKnowledgeIntakeJob(review, 'accepted', context),
    error => error.status === 409 && error.code === 'stale_page'
  );
  assert.equal(context.saved.length, 0);
});

test('unresolvedJobForPage finds working and awaiting-review intake jobs', () => {
  const inbox = {
    jobs: [
      { id: 'old', page_id: 'note-1', kind: 'knowledge_intake', status: 'done', phase: 'done', resolution: 'accepted' },
      { id: 'open', page_id: 'note-1', kind: 'knowledge_intake', status: 'done', phase: 'awaiting_review' },
      { id: 'other', page_id: 'note-2', kind: 'knowledge_intake', status: 'working', phase: 'extracting' }
    ]
  };
  assert.equal(unresolvedJobForPage(inbox, 'note-1').id, 'open');
  assert.equal(unresolvedJobForPage(inbox, 'note-2').id, 'other');
  assert.equal(unresolvedJobForPage(inbox, 'note-3'), undefined);
});

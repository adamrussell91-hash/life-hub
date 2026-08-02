import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';

const env = {
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const CONTENT_SHA = 'a'.repeat(40);
const COMMIT_SHA = 'b'.repeat(40);

function fetchStub({ status = 200, body = { content: { sha: CONTENT_SHA }, commit: { sha: COMMIT_SHA } } } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json(body, { status });
  };
  return { calls, fetchImpl };
}

test('writeFile PUTs base64 content without a sha when creating', async () => {
  const { calls, fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });

  const result = await client.writeFile({
    path: 'data/nutrition/2026/08/2026-08-01-breakfast.md',
    content: '---\ntype: meal\n---\n',
    message: 'feat: log breakfast'
  });

  assert.equal(result.sha, CONTENT_SHA);
  assert.equal(result.commitSha, COMMIT_SHA);
  assert.equal(calls[0].options.method, 'PUT');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.sha, undefined);
  assert.equal(Buffer.from(sentBody.content, 'base64').toString('utf8'), '---\ntype: meal\n---\n');
  assert.equal(sentBody.branch, 'main');
});

test('writeFile includes sha as an update precondition when overwriting', async () => {
  const { calls, fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });
  await client.writeFile({ path: 'x.md', content: 'y', sha: 'c'.repeat(40), message: 'fix: update' });
  assert.equal(JSON.parse(calls[0].options.body).sha, 'c'.repeat(40));
});

for (const status of [409, 422]) {
  test(`writeFile maps a ${status} response to a retryable write_conflict error`, async () => {
    const { fetchImpl } = fetchStub({ status, body: { message: 'sha mismatch' } });
    const client = createGitHubClient({ env, fetchImpl });
    await assert.rejects(
      client.writeFile({ path: 'x.md', content: 'y', message: 'fix: update' }),
      error => error instanceof GitHubClientError && error.code === 'write_conflict' && error.retryable === true
    );
  });
}

test('writeFile rejects an invalid path, content, sha, or missing message', async () => {
  const { fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });
  await assert.rejects(client.writeFile({ path: '', content: 'y', message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 1, message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 'y', sha: 'bad', message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 'y' }), TypeError);
});

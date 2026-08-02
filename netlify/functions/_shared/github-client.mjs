import { isCalendarDate } from '../../../js/core/time.js';

const API_VERSION = '2026-03-10';
const GITHUB_ORIGIN = 'https://api.github.com';
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^(?<owner>[A-Za-z0-9](?:[A-Za-z0-9.-]{0,38}))\/(?<repo>[A-Za-z0-9_.-]{1,100})$/;

export class GitHubClientError extends Error {
  constructor(code, retryable) {
    super('GitHub request failed.');
    this.name = 'GitHubClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class GitHubConfigurationError extends Error {
  constructor() {
    super('GitHub configuration is invalid.');
    this.name = 'GitHubConfigurationError';
    this.code = 'misconfigured';
    this.retryable = false;
  }
}

export function createGitHubClient({ env = process.env, fetchImpl = fetch } = {}) {
  const config = parseConfiguration(env);
  if (typeof fetchImpl !== 'function') throw new GitHubConfigurationError();
  const repositoryPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;

  async function github(path) {
    let response;
    try {
      response = await fetchImpl(`${GITHUB_ORIGIN}${path}`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${config.token}`,
          'user-agent': 'life-hub',
          'x-github-api-version': API_VERSION
        }
      });
    } catch {
      throw new GitHubClientError('github_unavailable', true);
    }
    if (!response?.ok) throw mapGitHubFailure(response);
    try {
      return await response.json();
    } catch {
      throw new GitHubClientError('github_invalid_response', true);
    }
  }

  return {
    async resolveTree() {
      const commit = await github(`${repositoryPath}/commits/${encodeURIComponent(config.branch)}`);
      if (!SHA.test(commit?.sha) || !SHA.test(commit?.commit?.tree?.sha)) {
        throw new GitHubClientError('github_invalid_response', true);
      }
      const commitSha = commit.sha;
      const treeSha = commit.commit.tree.sha;
      const resolved = await github(`${repositoryPath}/git/trees/${treeSha}?recursive=1`);
      if (resolved?.truncated === true) {
        throw new GitHubClientError('repository_tree_incomplete', true);
      }
      if (!Array.isArray(resolved?.tree)) {
        throw new GitHubClientError('github_invalid_response', true);
      }
      return { commitSha, treeSha, tree: resolved.tree };
    },

    readBlob(sha) {
      if (!SHA.test(sha)) throw new TypeError('Invalid blob SHA.');
      return github(`${repositoryPath}/git/blobs/${sha}`);
    },

    async writeFile({ path, content, sha, message }) {
      if (typeof path !== 'string' || path.length === 0) throw new TypeError('A file path is required.');
      if (typeof content !== 'string') throw new TypeError('File content must be a string.');
      if (sha != null && !SHA.test(sha)) throw new TypeError('Invalid blob SHA.');
      if (typeof message !== 'string' || message.length === 0) throw new TypeError('A commit message is required.');

      const body = {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: config.branch,
        ...(sha ? { sha } : {})
      };

      let response;
      try {
        response = await fetchImpl(`${GITHUB_ORIGIN}${repositoryPath}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'PUT',
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
            'user-agent': 'life-hub',
            'x-github-api-version': API_VERSION
          },
          body: JSON.stringify(body)
        });
      } catch {
        throw new GitHubClientError('github_unavailable', true);
      }
      if (response.status === 409 || response.status === 422) throw new GitHubClientError('write_conflict', true);
      if (!response.ok) throw mapGitHubFailure(response);

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new GitHubClientError('github_invalid_response', true);
      }
      if (!SHA.test(payload?.content?.sha) || !SHA.test(payload?.commit?.sha)) {
        throw new GitHubClientError('github_invalid_response', true);
      }
      return { sha: payload.content.sha, commitSha: payload.commit.sha };
    }
  };
}

function parseConfiguration(env) {
  const repository = typeof env?.GITHUB_REPOSITORY === 'string' ? REPOSITORY.exec(env.GITHUB_REPOSITORY) : null;
  const branch = env?.GITHUB_BRANCH;
  const token = env?.GITHUB_TOKEN;
  const tokenExpires = env?.GITHUB_TOKEN_EXPIRES;
  if (!repository || typeof branch !== 'string' || branch.length === 0 || branch.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(branch) || branch.trim() !== branch ||
      typeof token !== 'string' || token.length === 0 || token.trim() !== token ||
      /[\u0000-\u001f\u007f]/.test(token) || !isCalendarDate(tokenExpires)) {
    throw new GitHubConfigurationError();
  }
  return { ...repository.groups, branch, token };
}

function mapGitHubFailure(response) {
  const status = response?.status;
  if (status === 401) return new GitHubClientError('github_authentication_failed', false);
  if (status === 403 && (
    response.headers?.get('x-ratelimit-remaining') === '0' ||
    response.headers?.has('retry-after')
  )) return new GitHubClientError('github_rate_limited', true);
  if (status === 403) return new GitHubClientError('github_access_denied', false);
  if (status === 404) return new GitHubClientError('repository_not_found', false);
  if (status === 429) return new GitHubClientError('github_rate_limited', true);
  if (Number.isInteger(status) && status >= 500) return new GitHubClientError('github_unavailable', true);
  return new GitHubClientError('github_request_failed', false);
}

import { isCalendarDate } from '../../../js/core/time.js';

const API_VERSION = '2026-03-10';
const GITHUB_ORIGIN = 'https://api.github.com';
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^(?<owner>[A-Za-z0-9](?:[A-Za-z0-9.-]{0,38}))\/(?<repo>[A-Za-z0-9_.-]{1,100})$/;
const TREE_BATCH = 20;

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

  async function graphql(query, variables) {
    let response;
    try {
      response = await fetchImpl(`${GITHUB_ORIGIN}/graphql`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
          'user-agent': 'life-hub'
        },
        body: JSON.stringify({ query, variables })
      });
    } catch {
      throw new GitHubClientError('github_unavailable', true);
    }
    if (!response?.ok) throw mapGitHubFailure(response);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new GitHubClientError('github_invalid_response', true);
    }
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new GitHubClientError('github_invalid_response', true);
    }
    return payload?.data;
  }

  async function resolveTreeViaRest() {
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
  }

  async function resolveTreeViaGraphql() {
    const head = await graphql(
      `query ($owner: String!, $name: String!, $ref: String!) {
        repository(owner: $owner, name: $name) {
          ref(qualifiedName: $ref) {
            target {
              ... on Commit {
                oid
                tree { oid }
              }
            }
          }
        }
      }`,
      {
        owner: config.owner,
        name: config.repo,
        ref: `refs/heads/${config.branch}`
      }
    );
    const commitSha = head?.repository?.ref?.target?.oid;
    const treeSha = head?.repository?.ref?.target?.tree?.oid;
    if (!SHA.test(commitSha) || !SHA.test(treeSha)) {
      throw new GitHubClientError('github_invalid_response', true);
    }

    const tree = [];
    const queue = [{ sha: treeSha, prefix: '' }];
    while (queue.length > 0) {
      const batch = queue.splice(0, TREE_BATCH);
      const selection = batch.map((entry, index) => `
        t${index}: object(oid: $oid${index}) {
          ... on Tree {
            entries {
              name
              type
              oid
              object { ... on Blob { byteSize } }
            }
          }
        }`).join('\n');
      const params = batch.map((_, index) => `$oid${index}: GitObjectID!`).join(', ');
      const variables = {
        owner: config.owner,
        name: config.repo,
        ...Object.fromEntries(batch.map((entry, index) => [`oid${index}`, entry.sha]))
      };
      const data = await graphql(
        `query ($owner: String!, $name: String!, ${params}) {
          repository(owner: $owner, name: $name) {
            ${selection}
          }
        }`,
        variables
      );
      const repository = data?.repository;
      if (!repository) throw new GitHubClientError('github_invalid_response', true);

      for (const [index, parent] of batch.entries()) {
        const entries = repository[`t${index}`]?.entries;
        if (!Array.isArray(entries)) {
          throw new GitHubClientError('github_invalid_response', true);
        }
        for (const entry of entries) {
          if (!entry || typeof entry.name !== 'string' || !SHA.test(entry.oid)) {
            throw new GitHubClientError('github_invalid_response', true);
          }
          const path = parent.prefix ? `${parent.prefix}/${entry.name}` : entry.name;
          if (entry.type === 'tree') {
            tree.push({ path, mode: '040000', type: 'tree', sha: entry.oid, size: 0 });
            queue.push({ sha: entry.oid, prefix: path });
            continue;
          }
          if (entry.type === 'blob') {
            const size = entry.object?.byteSize;
            tree.push({
              path,
              mode: '100644',
              type: 'blob',
              sha: entry.oid,
              size: Number.isInteger(size) ? size : 0
            });
            continue;
          }
        }
      }
    }

    return { commitSha, treeSha, tree };
  }

  async function readBlobViaGraphql(sha) {
    const data = await graphql(
      `query ($owner: String!, $name: String!, $oid: GitObjectID!) {
        repository(owner: $owner, name: $name) {
          object(oid: $oid) {
            ... on Blob {
              text
              byteSize
              isBinary
            }
          }
        }
      }`,
      { owner: config.owner, name: config.repo, oid: sha }
    );
    const blob = data?.repository?.object;
    if (!blob || blob.isBinary === true || typeof blob.text !== 'string') {
      throw new GitHubClientError('github_invalid_response', true);
    }
    return {
      sha,
      encoding: 'base64',
      content: Buffer.from(blob.text, 'utf8').toString('base64'),
      size: Number.isInteger(blob.byteSize) ? blob.byteSize : Buffer.byteLength(blob.text, 'utf8')
    };
  }

  return {
    async resolveTree() {
      try {
        return await resolveTreeViaRest();
      } catch (error) {
        if (!(error instanceof GitHubClientError) || error.code !== 'repository_not_found') {
          throw error;
        }
        return resolveTreeViaGraphql();
      }
    },

    readBlob(sha) {
      if (!SHA.test(sha)) throw new TypeError('Invalid blob SHA.');
      return (async () => {
        try {
          return await github(`${repositoryPath}/git/blobs/${sha}`);
        } catch (error) {
          if (!(error instanceof GitHubClientError) || error.code !== 'repository_not_found') {
            throw error;
          }
          return readBlobViaGraphql(sha);
        }
      })();
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDateRange } from '../netlify/functions/_shared/repo-policy.mjs';

const PASSPHRASE = 'life-hub-local';
const SESSION_COOKIE = 'life_hub_mock=1; HttpOnly; SameSite=Strict; Path=/';
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };
const SESSION_MS = 8 * 60 * 60 * 1000;
const FIXTURE_FILES = [
  { path: 'config/agents.yml', source: 'config/agents.yml' },
  { path: 'config/targets.yml', source: 'config/targets.yml' },
  {
    path: 'data/fitness/2026/07/2026-07-30-chest-curls.md',
    source: 'tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md'
  },
  {
    path: 'data/mind/2026/07/2026-07-30-diary.md',
    source: 'tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md'
  },
  {
    path: 'data/nutrition/2026/07/2026-07-30-breakfast.md',
    source: 'tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-breakfast.md'
  },
  {
    path: 'data/nutrition/2026/07/2026-07-30-lunch.md',
    source: 'tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md'
  }
];

export function createMockApi({ root, now = Date.now }) {
  const rootPath = resolve(root instanceof URL ? fileURLToPath(root) : root);

  return async function handleMockApi(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;

    if (!isLocalRequest(request)) {
      error(response, 403, 'forbidden', 'This local API accepts localhost requests only.', false);
      return true;
    }

    if (url.pathname === '/api/auth') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      const body = await readJson(request);
      if (!body || typeof body.passphrase !== 'string') {
        error(response, 400, 'invalid_request', 'The request body was not valid JSON.', false);
      } else if (body.passphrase !== PASSPHRASE) {
        error(response, 401, 'invalid_credentials', 'That passphrase was not accepted.', true);
      } else {
        json(response, 200, {
          ok: true,
          data: { authenticated: true, expiresAt: new Date(now() + SESSION_MS).toISOString() }
        }, { 'Set-Cookie': SESSION_COOKIE });
      }
      return true;
    }

    if (url.pathname === '/api/session') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      if (!hasSession(request)) return unauthenticated(response);
      json(response, 200, {
        ok: true,
        data: { authenticated: true, expiresAt: new Date(now() + SESSION_MS).toISOString() }
      });
      return true;
    }

    if (url.pathname === '/api/logout') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      response.writeHead(204, {
        ...PRIVATE_HEADERS,
        'Set-Cookie': 'life_hub_mock=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/'
      });
      response.end();
      return true;
    }

    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      if (!hasSession(request)) return unauthenticated(response);
      json(response, 200, {
        ok: true,
        data: {
          github: 'healthy',
          token: 'unknown',
          expiresOn: null,
          code: 'ok',
          retryable: false
        }
      });
      return true;
    }

    if (url.pathname === '/api/repo/manifest') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      if (!hasSession(request)) return unauthenticated(response);

      let range;
      try {
        range = parseDateRange(url);
      } catch {
        error(response, 400, 'invalid_date_range', 'Provide a valid date range.', false);
        return true;
      }
      const repository = await readFixtureRepository(rootPath);
      const files = repository.files.filter(file => isInRange(file.path, range));
      const manifestId = hash(`${repository.commitSha}\0${range.from}\0${range.to}`);
      const etag = `"${manifestId}"`;
      if (etagMatches(request.headers['if-none-match'], etag)) {
        response.writeHead(304, { ...PRIVATE_HEADERS, ETag: etag });
        response.end();
        return true;
      }
      json(response, 200, {
        ok: true,
        data: {
          commitSha: repository.commitSha,
          treeSha: repository.treeSha,
          manifestId,
          ...range,
          files: files.map(({ path, sha, size }) => ({ path, sha, size }))
        }
      }, { ETag: etag });
      return true;
    }

    if (url.pathname === '/api/repo/files') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!hasSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      const range = parseFileRange(body);
      if (!range || !Array.isArray(body.files)) {
        error(response, 400, 'invalid_request', 'Provide a valid file request.', false);
        return true;
      }

      const repository = await readFixtureRepository(rootPath);
      const allowed = new Map(repository.files
        .filter(file => isInRange(file.path, range))
        .map(file => [`${file.path}\0${file.sha}`, file]));
      const files = body.files.map(file => allowed.get(`${file?.path}\0${file?.sha}`));
      if (files.some(file => !file)) {
        error(response, 409, 'stale_manifest', 'Refresh the repository manifest and try again.', true);
        return true;
      }
      json(response, 200, {
        ok: true,
        data: {
          commitSha: repository.commitSha,
          files: files.map(({ path, sha, content }) => ({ path, sha, content }))
        }
      });
      return true;
    }

    error(response, 404, 'not_found', 'Not found.', false);
    return true;
  };
}

async function readFixtureRepository(rootPath) {
  const files = await Promise.all(FIXTURE_FILES.map(async fixture => {
    const content = await readFile(resolve(rootPath, fixture.source), 'utf8');
    return {
      path: fixture.path,
      content,
      size: Buffer.byteLength(content),
      sha: hash(content).slice(0, 40)
    };
  }));
  const fingerprint = files.map(file => `${file.path}\0${file.sha}\0${file.size}`).join('\0');
  return {
    files,
    commitSha: hash(`commit\0${fingerprint}`).slice(0, 40),
    treeSha: hash(`tree\0${fingerprint}`).slice(0, 40)
  };
}

function isInRange(path, { from, to }) {
  if (path.startsWith('config/')) return true;
  const date = /\/(\d{4}-\d{2}-\d{2})-[^/]+\.md$/.exec(path)?.[1];
  return date >= from && date <= to;
}

function isLocalRequest(request) {
  const host = request.headers.host;
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const address = request.socket.remoteAddress;
  const localAddress = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  return localHost && localAddress;
}

function hasSession(request) {
  return request.headers.cookie?.split(';').some(value => value.trim() === 'life_hub_mock=1') === true;
}

function etagMatches(value, etag) {
  return typeof value === 'string' && value.split(',').some(candidate => {
    const trimmed = candidate.trim();
    return trimmed === '*' || trimmed === etag || trimmed === `W/${etag}`;
  });
}

function parseFileRange(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.from !== 'string' || typeof body.to !== 'string') return null;
  const url = new URL('http://localhost/api/repo/manifest');
  url.searchParams.set('from', body.from);
  url.searchParams.set('to', body.to);
  try {
    return parseDateRange(url);
  } catch {
    return null;
  }
}

function unauthenticated(response) {
  error(response, 401, 'unauthenticated', 'Please sign in to continue.', false, {
    'Set-Cookie': 'life_hub_mock=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/'
  });
  return true;
}

function methodNotAllowed(response, allow) {
  error(response, 405, 'method_not_allowed', 'This method is not allowed.', false, { Allow: allow });
  return true;
}

function error(response, status, code, message, retryable, headers = {}) {
  json(response, status, { ok: false, error: { code, message, retryable } }, headers);
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...PRIVATE_HEADERS,
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  try {
    for await (const chunk of request) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

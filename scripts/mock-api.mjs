import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump } from 'js-yaml';
import { parseDateRange, CONFIG_PATHS, RESEARCH_PATH, linkedRecordDate } from '../netlify/functions/_shared/repo-policy.mjs';
import { TYPE_DOMAINS } from '../apps/life/js/core/records.js';
import { listNamedShortcuts } from '../netlify/functions/_shared/capabilities/registry.mjs';
import { buildHubMapSeed } from '../apps/life/js/app/hub-map-seed.js';
import { validateMap } from '../apps/life/js/app/hub-map-model.js';

import { SESSION_MS } from '../netlify/functions/_shared/auth-security.mjs';
import { getSydneyDateKey, getSydneyTimestamp } from '../apps/life/js/core/time.js';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  pendingGhostsInRange,
  readGhostDecision,
  runGhostDecision
} from '../netlify/functions/calendar-ghosts.mjs';
import { runCalendarGhostsPropose } from '../netlify/functions/_shared/calendar-ghosts-propose.mjs';
import { CALENDAR_VISUAL_PATH, loadCalendarVisualSeed } from './calendar-visual-seed.mjs';
import { loadAlmanacVisualSeed } from './almanac-visual-seed.mjs';
import {
  ALMANAC_DONE_PATH,
  HUB_PREFS_KEY,
  appendAlmanacDone,
  readAlmanac,
  readAlmanacTasked,
  readDoneRequest,
  readSchoolTerms
} from '../netlify/functions/almanac.mjs';
import { GitHubClientError } from '../netlify/functions/_shared/github-client.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../netlify/functions/_shared/tasks-blobs.mjs';

const PASSPHRASE = 'life-hub-local';
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };
const FIXTURE_FILES = [
  { path: 'config/agents.yml', source: 'config/agents.yml' },
  { path: 'config/targets.yml', source: 'config/targets.yml' },
  { path: 'central-node.md', source: 'tests/fixtures/valid/central-node.md' },
  {
    path: 'data/fitness/2026/07/2026-07-24-leg-day.md',
    source: 'tests/fixtures/valid/data/fitness/2026/07/2026-07-24-leg-day.md'
  },
  {
    path: 'data/fitness/2026/07/2026-07-30-chest-curls.md',
    source: 'tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md'
  },
  {
    path: 'data/fitness/2026/08/2026-08-29-upper-body.md',
    source: 'tests/fixtures/valid/data/fitness/2026/08/2026-08-29-upper-body.md'
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
  },
  {
    path: 'data/nutrition/challenges.json',
    source: 'tests/fixtures/valid/data/nutrition/challenges.json'
  },
  {
    path: 'data/body/2026/07/2026-07-08-therapy-kate-semple.md',
    source: 'tests/fixtures/valid/data/body/2026/07/2026-07-08-therapy-kate-semple.md'
  }
];

function confirmedPath(candidate, slug) {
  const date = candidate?.date;
  const domain = TYPE_DOMAINS[candidate?.type] ?? 'fitness';
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof slug !== 'string') {
    return `data/${domain}/mock/${slug}.md`;
  }
  return `data/${domain}/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-${slug}.md`;
}

function confirmedMarkdown(candidate, slug) {
  const fields = candidate?.fields && typeof candidate.fields === 'object' ? candidate.fields : {};
  const stamp = getSydneyTimestamp();
  const front = {
    schema_version: 1,
    id: slug,
    type: candidate.type,
    date: candidate.date,
    ...(candidate.time ? { time: candidate.time } : {}),
    created_at: stamp,
    updated_at: stamp,
    source: 'chat',
    ...fields
  };
  return `---\n${dump(front, { lineWidth: 120 })}---\n${candidate.notes ?? ''}\n`;
}

export function createMockApi({ root, now = Date.now, sessionMs = SESSION_MS, extraFiles = [] } = {}) {
  const rootPath = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const clock = { now };
  const sessions = new Map();
  const confirmedFiles = new Map(extraFiles.map(file => [file.path, file.content]));
  const taskData = new Map();
  let nextSessionId = 0;
  const hubMap = { map: null, version: 0 };
  const taskStore = {
    async get(key, options) {
      const value = taskData.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      taskData.set(key, structuredClone(value));
    },
    async set(key, value) {
      taskData.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    }
  };

  async function openRepo() {
    const repository = await readFixtureRepository(rootPath, confirmedFiles);
    const files = new Map(repository.files.map(file => [file.path, file.content]));
    for (const [path, content] of confirmedFiles) files.set(path, content);
    return {
      base: { commitSha: repository.commitSha, treeSha: repository.treeSha },
      listPaths() { return [...files.keys()]; },
      async readFile(path) {
        return files.has(path) ? files.get(path) : null;
      }
    };
  }

  const readSession = request => {
    const id = readCookie(request, 'life_hub_mock');
    const session = sessions.get(id);
    if (!session || clock.now() >= session.expiresAt) {
      if (id) sessions.delete(id);
      return null;
    }
    return session;
  };

  return async function handleMockApi(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;

    if (!isLocalRequest(request)) {
      error(response, 403, 'forbidden', 'This local API accepts localhost requests only.', false);
      return true;
    }

    if (url.pathname === '/api/auth-login' || url.pathname === '/api/auth') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      const body = await readJson(request);
      if (!body || typeof body.passphrase !== 'string') {
        error(response, 400, 'invalid_request', 'The request body was not valid JSON.', false);
      } else if (body.passphrase !== PASSPHRASE) {
        error(response, 401, 'invalid_credentials', 'That passphrase was not accepted.', true);
      } else {
        const id = String(++nextSessionId);
        const expiresAt = clock.now() + sessionMs;
        sessions.set(id, { expiresAt });
        json(response, 200, {
          ok: true,
          data: { authenticated: true, expiresAt: new Date(expiresAt).toISOString() }
        }, { 'Set-Cookie': sessionCookie(id) });
      }
      return true;
    }

    if (url.pathname === '/api/auth-session' || url.pathname === '/api/session') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      const session = readSession(request);
      if (!session) return unauthenticated(response);
      json(response, 200, {
        ok: true,
        data: { authenticated: true, expiresAt: new Date(session.expiresAt).toISOString() }
      });
      return true;
    }

    if (url.pathname === '/api/logout') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      sessions.delete(readCookie(request, 'life_hub_mock'));
      response.writeHead(204, {
        ...PRIVATE_HEADERS,
        'Set-Cookie': 'life_hub_mock=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/'
      });
      response.end();
      return true;
    }

    if (url.pathname === '/api/repo/manifest') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      if (!readSession(request)) return unauthenticated(response);

      let range;
      try {
        range = parseDateRange(url);
      } catch {
        error(response, 400, 'invalid_date_range', 'Provide a valid date range.', false);
        return true;
      }
      const repository = await readFixtureRepository(rootPath, confirmedFiles);
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
      if (!readSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      const range = parseFileRange(body);
      if (!range || !Array.isArray(body.files)) {
        error(response, 400, 'invalid_request', 'Provide a valid file request.', false);
        return true;
      }

      const repository = await readFixtureRepository(rootPath, confirmedFiles);
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

    if (url.pathname === '/api/hub-map') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return methodNotAllowed(response, 'GET, POST');
      }
      if (!readSession(request)) return unauthenticated(response);
      const sha = () => (hubMap.map ? `mock-${hubMap.version}` : null);
      if (request.method === 'GET') {
        json(response, 200, {
          ok: true,
          data: { map: hubMap.map ?? buildHubMapSeed(), sha: sha(), seeded: !hubMap.map }
        });
        return true;
      }
      const body = await readJson(request);
      const checked = validateMap(body?.map);
      if (!checked.ok || (body.baseSha !== null && typeof body.baseSha !== 'string')) {
        error(response, 400, 'invalid_request', 'Provide a valid hub map.', false);
        return true;
      }
      if (body.baseSha !== sha()) {
        error(response, 409, 'write_conflict', 'The hub map was updated elsewhere. Reload to continue.', true);
        return true;
      }
      hubMap.map = checked.map;
      hubMap.version += 1;
      json(response, 200, { ok: true, data: { map: hubMap.map, sha: sha(), seeded: false } });
      return true;
    }

    if (url.pathname === '/api/shortcuts') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return methodNotAllowed(response, 'GET, POST');
      }
      if (!readSession(request)) return unauthenticated(response);
      if (request.method === 'GET') {
        json(response, 200, {
          ok: true,
          data: {
            catalog: listNamedShortcuts(),
            promoted: [{
              proposed_id: 'track.morning-weigh-in',
              tool_name: 'track_morning_weigh_in',
              summary: 'Morning weigh-in tracker',
              proposed_by: 'brisket',
              write_count: 1,
              risk: 'confirm',
              status: 'ready'
            }]
          }
        });
        return true;
      }
      const body = await readJson(request);
      const proposedId = typeof body?.proposed_id === 'string' ? body.proposed_id.trim() : '';
      if (!proposedId) {
        error(response, 400, 'invalid_input', 'proposed_id is required.', false);
        return true;
      }
      const agentSlug = typeof body?.agent_slug === 'string' && body.agent_slug.trim()
        ? body.agent_slug.trim()
        : 'hammond';
      json(response, 200, {
        ok: true,
        data: {
          agent_slug: agentSlug,
          proposal: {
            intent: `Run promoted shortcut: ${proposedId}`,
            agent: agentSlug,
            writes: [{
              path: 'data/challenges/2026-08-31-weigh-in.json',
              mode: 'create',
              content: '{\n  "title": "Morning weigh-in"\n}\n'
            }]
          }
        }
      });
      return true;
    }

    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
        error(response, 400, 'invalid_request', 'Provide a valid chat message.', false);
        return true;
      }
      streamMockChat(response, body.message);
      return true;
    }

    if (url.pathname === '/api/chat/confirm') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      if (!body || typeof body.slug !== 'string' || !body.candidate) {
        error(response, 400, 'invalid_request', 'Provide a valid confirmation request.', false);
        return true;
      }
      const path = confirmedPath(body.candidate, body.slug);
      const content = confirmedMarkdown(body.candidate, body.slug);
      confirmedFiles.set(path, content);
      json(response, 200, {
        ok: true,
        data: {
          path,
          sha: hash(content).slice(0, 40),
          commitSha: hash(`mock-commit\0${path}\0${content}`).slice(0, 40)
        }
      });
      return true;
    }

    if (url.pathname === '/api/curriculum' ||
        url.pathname === '/api/search' ||
        url.pathname === '/api/outcomes' ||
        url.pathname.startsWith('/api/outcomes/') ||
        url.pathname === '/api/media/upload' ||
        (url.pathname === '/api/media' || /^\/api\/media\/[^/]+$/.test(url.pathname)) ||
        /^\/api\/(classes|units|lessons|years|subjects|scheduled-lessons)(\/|$)/.test(url.pathname)) {
      if (!readSession(request)) return unauthenticated(response);
      error(response, 503, 'blobs_unbound', 'Teaching content store is not bound.', true);
      return true;
    }

    if (url.pathname === '/api/pages' || url.pathname.startsWith('/api/pages/') ||
        url.pathname.startsWith('/api/knowledge/')) {
      if (!readSession(request)) return unauthenticated(response);
      error(response, 503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.', true);
      return true;
    }

    if (url.pathname === '/api/lesson-alchemist') {
      if (!request.headers.get('x-alchemist-secret')) {
        return unauthenticated(response);
      }
      error(response, 503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.', true);
      return true;
    }

    if (url.pathname === '/api/almanac-visual-seed') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      try {
        const seeded = await loadAlmanacVisualSeed();
        clock.now = () => Date.parse(seeded.now);
        for (const [path, content] of seeded.files) confirmedFiles.set(path, content);
        const current = taskData.get(HUB_PREFS_KEY);
        const prefs = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
        prefs.school_terms = seeded.terms;
        taskData.set(HUB_PREFS_KEY, prefs);
        json(response, 200, { ok: true, data: { now: seeded.now } });
      } catch (seedError) {
        error(response, 500, 'seed_failed', seedError instanceof Error ? seedError.message : 'Almanac visual seed failed.', true);
      }
      return true;
    }

    if (url.pathname === '/api/almanac/done') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const body = readDoneRequest(await readJson(request));
      if (body.error === 'client_write_rejected') {
        error(response, 400, 'client_write_rejected', 'The client cannot send writes.', false);
        return true;
      }
      if (body.error) {
        error(response, 400, 'invalid_request', 'Provide stepId.', false);
        return true;
      }
      const opened = await openRepo();
      const at = getSydneyTimestamp(new Date(clock.now()));
      const next = appendAlmanacDone(await opened.readFile(ALMANAC_DONE_PATH) ?? '', body.stepId, at);
      confirmedFiles.set(ALMANAC_DONE_PATH, next);
      json(response, 200, { ok: true, stepId: body.stepId, at });
      return true;
    }

    if (url.pathname === '/api/almanac') {
      if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
      if (!readSession(request)) return unauthenticated(response);
      try {
        parseDateRange(url);
      } catch {
        error(response, 400, 'invalid_date_range', 'Provide from and to as YYYY-MM-DD.', false);
        return true;
      }
      try {
        const opened = await openRepo();
        const terms = await readSchoolTerms(async () => taskStore);
        const view = await readAlmanac({
          readFile: path => opened.readFile(path),
          listPaths: () => opened.listPaths(),
          today: getSydneyDateKey(new Date(clock.now())),
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          terms,
          lessons: [],
          professionalEvents: []
        });
        const tasked = await readAlmanacTasked(async () => taskStore);
        json(response, 200, { ok: true, ...view, tasked });
      } catch (almanacError) {
        error(response, 500, 'almanac_failed', almanacError instanceof Error ? almanacError.message : 'Almanac could not be built.', true);
      }
      return true;
    }

    if (url.pathname === '/api/calendar-visual-seed') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      try {
        const seeded = await loadCalendarVisualSeed();
        clock.now = () => Date.parse(seeded.now);
        for (const [path, content] of seeded.files) confirmedFiles.set(path, content);
        if (url.searchParams.get('clearGhosts') === '1') {
          const { serializePendingCalendarGhosts } = await import('../netlify/functions/calendar-ghosts.mjs');
          confirmedFiles.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts([]));
        }
        for (const task of seeded.tasks) taskData.set(taskKey(task.id), task);
        taskData.set(TASKS_INDEX_KEY, seeded.tasks.map(task => task.id));
        json(response, 200, { ok: true, data: { now: seeded.now, ...seeded.counts } });
      } catch (seedError) {
        error(response, 500, 'seed_failed', seedError instanceof Error ? seedError.message : 'Calendar visual seed failed.', true);
      }
      return true;
    }

    if (url.pathname === '/api/calendar-ghosts-propose') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const instant = new Date(clock.now());
      try {
        const terms = await readSchoolTerms(async () => taskStore);
        const result = await runCalendarGhostsPropose({
          open: openRepo,
          commit: async (changed) => {
            for (const [path, content] of changed) confirmedFiles.set(path, content);
          },
          today: getSydneyDateKey(instant),
          nowIso: getSydneyTimestamp(instant),
          nowMs: instant.getTime(),
          terms,
          lessons: [],
          professionalEvents: [],
          trigger: 'manual'
        });
        json(response, 200, result);
      } catch (proposeError) {
        error(response, 500, 'propose_failed', proposeError instanceof Error ? proposeError.message : 'Propose failed.', true);
      }
      return true;
    }

    if (url.pathname === '/api/calendar-ghosts') {
      if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed(response, 'GET, POST');
      if (!readSession(request)) return unauthenticated(response);
      const instant = new Date(clock.now());
      const open = openRepo;
      if (request.method === 'GET') {
        try {
          const { parseDateRange } = await import('../netlify/functions/_shared/repo-policy.mjs');
          parseDateRange(url);
        } catch {
          error(response, 400, 'invalid_date_range', 'Provide from and to as YYYY-MM-DD.', false);
          return true;
        }
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const today = getSydneyDateKey(instant);
        if (from <= today && to >= today) {
          try {
            const terms = await readSchoolTerms(async () => taskStore);
            await runCalendarGhostsPropose({
              open: openRepo,
              commit: async (changed) => {
                for (const [path, content] of changed) confirmedFiles.set(path, content);
              },
              today,
              nowIso: getSydneyTimestamp(instant),
              nowMs: instant.getTime(),
              terms,
              lessons: [],
              professionalEvents: [],
              trigger: 'refresh'
            });
          } catch (refreshError) {
            console.warn('mock calendar-ghosts GET refresh failed', refreshError);
          }
        }
        const opened = await open();
        const ghosts = pendingGhostsInRange(
          await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH),
          from,
          to
        );
        json(response, 200, { ok: true, ghosts });
        return true;
      }
      const decision = readGhostDecision(await readJson(request));
      if (decision.error === 'client_write_rejected') {
        error(response, 400, 'client_write_rejected', 'The client cannot send writes.', false);
        return true;
      }
      if (decision.error) {
        error(response, 400, 'invalid_request', 'Provide id and decision.', false);
        return true;
      }
      try {
        const result = await runGhostDecision({
          open,
          commit: async (changed) => {
            for (const [path, content] of changed) confirmedFiles.set(path, content);
          },
          tasksStore: async () => taskStore,
          decision,
          today: getSydneyDateKey(instant),
          nowIso: getSydneyTimestamp(instant),
          lessons: [],
          professionalEvents: []
        });
        json(response, result.status, result.payload);
      } catch (ghostError) {
        const conflict = ghostError instanceof GitHubClientError && ghostError.code === 'write_conflict';
        error(response, conflict ? 409 : 503, conflict ? 'write_conflict' : 'github_unavailable', 'The repository is temporarily unavailable.', !conflict);
      }
      return true;
    }

    if ((url.pathname === '/api/tasks' || url.pathname === '/api/projects') && request.method === 'GET') {
      if (!readSession(request)) return unauthenticated(response);
      const index = await taskStore.get(TASKS_INDEX_KEY, { type: 'json' });
      if (Array.isArray(index)) {
        if (url.pathname === '/api/projects') {
          json(response, 200, { ok: true, data: { projects: [] } });
          return true;
        }
        const id = url.searchParams.get('id');
        if (id) {
          const task = await taskStore.get(taskKey(id), { type: 'json' });
          if (!task || typeof task !== 'object') {
            error(response, 404, 'not_found', 'Task not found.', false);
            return true;
          }
          json(response, 200, { ok: true, data: task });
          return true;
        }
        const tasks = [];
        for (const taskId of index) {
          if (typeof taskId !== 'string') continue;
          const task = await taskStore.get(taskKey(taskId), { type: 'json' });
          if (task && typeof task === 'object') tasks.push(task);
        }
        json(response, 200, { ok: true, data: { tasks } });
        return true;
      }
    }

    if (url.pathname === '/api/tasks' || url.pathname.startsWith('/api/tasks/') ||
        url.pathname === '/api/clare' ||
        /^\/api\/(projects|areas|goals|programs|maps|templates|stall)(\/|$|\?)/.test(url.pathname)) {
      if (!readSession(request)) return unauthenticated(response);
      error(response, 503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true);
      return true;
    }

    error(response, 404, 'not_found', 'Not found.', false);
    return true;
  };
}

function asRepoFile(path, content) {
  return {
    path,
    content,
    size: Buffer.byteLength(content),
    sha: hash(content).slice(0, 40)
  };
}

async function readFixtureRepository(rootPath, confirmedFiles = new Map()) {
  const files = await Promise.all(FIXTURE_FILES.map(async fixture => {
    const content = confirmedFiles.get(fixture.path)
      ?? await readFile(resolve(rootPath, fixture.source), 'utf8');
    return asRepoFile(fixture.path, content);
  }));
  for (const [path, content] of confirmedFiles) {
    if (files.some(file => file.path === path)) continue;
    files.push(asRepoFile(path, content));
  }
  const fingerprint = files.map(file => `${file.path}\0${file.sha}\0${file.size}`).join('\0');
  return {
    files,
    commitSha: hash(`commit\0${fingerprint}`).slice(0, 40),
    treeSha: hash(`tree\0${fingerprint}`).slice(0, 40)
  };
}

function isInRange(path, { from, to }) {
  if (path === CALENDAR_VISUAL_PATH) return true;
  if (CONFIG_PATHS.has(path) || RESEARCH_PATH.test(path)) return true;
  const date = /\/(\d{4}-\d{2}-\d{2})-[^/]+\.md$/.exec(path)?.[1] ?? linkedRecordDate(path);
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

function readCookie(request, name) {
  const prefix = `${name}=`;
  for (const value of request.headers.cookie?.split(';') ?? []) {
    const cookie = value.trim();
    if (cookie.startsWith(prefix)) return cookie.slice(prefix.length);
  }
  return null;
}

function sessionCookie(id) {
  return `life_hub_mock=${id}; HttpOnly; SameSite=Strict; Path=/`;
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

const FLAT_WORKOUT_DUMP = [
  '1. **Bar Squat** — legs first while you\'re fresh - Set 1: 10 reps x 25kg (cable: none) - Set 2: 10 reps x 25kg (cable: none) - Set 3: 10 reps x 25kg (cable: none)',
  '2. **Bar Row** — pull that back thick - Set 1: 10 reps x 26kg (cable: constant force) - Set 2: 10 reps x 26kg (cable: constant force) - Set 3: 10 reps x 26kg (cable: constant force)',
  '3. **Bar Press** — chest gets its pump, always - Set 1: 10 reps x 30kg (cable: constant force) - Set 2: 10 reps x 30kg (cable: constant force) - Set 3: 10 reps x 30kg (cable: constant force)',
  '4. **Goblet Squat** — burnout finisher for the legs - Set 1: 12 reps x 14kg (cable: none) - Set 2: 12 reps x 14kg (cable: none)',
  '5. **Single Arm Row with Chest Supported** — unilateral back detail work - Set 1: 12 reps x 14kg (cable: constant force) - Set 2: 12 reps x 14kg (cable: constant force)',
  '6. **Bent Over Fly** — rear delt/upper back finisher, that shoulder cap growth - Set 1: 15 reps x 9kg (cable: elastic) - Set 2: 15 reps x 9kg (cable: elastic)',
  '7. **Cable Bar Curl** — because we always end on guns, that\'s the law - Set 1: 12 reps x 20kg (cable: eccentric) - Set 2: 12 reps x 20kg (cable: eccentric)',
  '8. **Bent Leg Reverse Crunch** — core, keep that waistline tight while Brisket handles the rest - Set 1: 15 reps x 0kg (cable: none) - Set 2: 15 reps x 0kg (cable: none)'
].join(' ');

function streamMockChat(response, message) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    ...PRIVATE_HEADERS,
    Connection: 'keep-alive'
  });
  const isLockIn = /lock (it|this|the plan) (in|onto)|make (the|this|my) workout|is (it|this) ready|ready to go|start (the |this )?(workout|session)|put (it|this) on(to)? fitness/i.test(message);
  const isWorkout = isLockIn || /chad|chadwick|workout/i.test(message);
  const isPlanDump = !isLockIn && /full send|describe the (plan|session)|show (me )?the (plan|session)/i.test(message);
  const isMeal = /brisket|meal|breakfast|lunch|dinner|lasagna|snack|dessert|ate|food/i.test(message);
  const send = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: 'agent', slug: isWorkout ? 'chadwick' : isMeal ? 'brisket' : 'router' });
  send({ type: 'status', text: 'Loading your logs…' });
  send({ type: 'status', text: 'Thinking…' });
  if (isWorkout && isPlanDump) {
    send({ type: 'text', delta: `Here's today's full send.\n${FLAT_WORKOUT_DUMP}` });
  } else if (isWorkout) {
    send({ type: 'text', delta: 'Here’s your workout for today. Start it when you’re ready.' });
    send({
      type: 'record_proposal',
      path: 'data/fitness/2026/08/2026-08-29-upper-body.md',
      record: {
        schema_version: 1,
        id: 'mock-workout-1',
        type: 'workout',
        date: '2026-08-29',
        title: 'Upper Body',
        session_kind: 'strength',
        day_type: 'workout_30',
        status: 'planned',
        duration_min: 35,
        exercises: [
          { name: 'Bench Press', sets: [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }, { reps: 8, weight_kg: 36, cable_type: 'constant_force' }, { reps: 8, weight_kg: 36, cable_type: 'constant_force' }, { reps: 8, weight_kg: 36, cable_type: 'constant_force' }] },
          { name: 'Decline Dumbbell Bench Press', sets: [{ reps: 10, weight_kg: 20, cable_type: 'none' }, { reps: 10, weight_kg: 20, cable_type: 'none' }, { reps: 10, weight_kg: 20, cable_type: 'none' }, { reps: 10, weight_kg: 20, cable_type: 'none' }] },
          { name: 'Chair Dip', sets: [{ reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }] },
          { name: 'Push-Up', sets: [{ reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }, { reps: 12, weight_kg: 0, cable_type: 'none' }] }
        ],
        created_at: '2026-08-29T07:30:00+10:00',
        updated_at: '2026-08-29T07:30:00+10:00',
        source: 'chat'
      }
    });
  } else if (isMeal) {
    send({ type: 'text', delta: 'Logging that meal now.' });
    send({
      type: 'record_proposal',
      path: 'data/nutrition/2026/08/2026-08-01-dinner.md',
      record: {
        schema_version: 1, id: 'mock-meal-1', type: 'meal', date: '2026-08-01', time: '19:00',
        meal: 'dinner', calories: 650, protein_g: 42, fat_g: 28, sodium_mg: 980,
        created_at: '2026-08-01T19:00:00+10:00', updated_at: '2026-08-01T19:00:00+10:00', source: 'chat'
      },
      notes: 'Homemade lasagna — solid protein, watch the sodium.'
    });
  } else {
    send({ type: 'text', delta: 'Got it — who should I route this to?' });
  }
  send({ type: 'done' });
  response.end();
}

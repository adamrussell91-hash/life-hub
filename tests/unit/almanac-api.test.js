import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { createCalendarGhostsHandler, ghostTaskId } from '../../netlify/functions/calendar-ghosts.mjs';
import {
  HUB_PREFS_KEY,
  buildAlmanac,
  parseAlmanacAnchors,
  readSchoolTerms
} from '../../netlify/functions/almanac.mjs';
import { ALMANAC_WANTS } from '../../apps/life/js/app/almanac-rules.js';
import { forecastSeries } from '../../apps/life/js/app/capacity-model.js';
import { addDays } from '../../packages/design-kit/js/lead-lines.js';
import { findOpenings } from '../../packages/design-kit/js/openings.js';
import { createMockApi } from '../../scripts/mock-api.mjs';
import { loadAlmanacVisualSeed } from '../../scripts/almanac-visual-seed.mjs';

const NOW = Date.parse('2026-09-24T18:05:00+10:00');
const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const SESSION = createSessionToken({
  now: NOW,
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const FIXTURE = JSON.parse(await readFile(new URL('../../docs/proposals/calendar-reference/almanac/fixture.json', import.meta.url), 'utf8'));
const CN = await readFile(new URL('../fixtures/valid/central-node.md', import.meta.url), 'utf8');
const SEEDED = await loadAlmanacVisualSeed();

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 40);
}

function memoryGitHub(initial) {
  const files = new Map(initial);
  let head = 'a'.repeat(40);
  const commits = [];
  return {
    files,
    commits,
    async resolveTree() {
      return {
        commitSha: head,
        treeSha: head,
        tree: [...files.entries()].map(([path, content]) => ({
          path, type: 'blob', sha: sha(content), size: Buffer.byteLength(content)
        }))
      };
    },
    async readBlob(blobSha) {
      for (const content of files.values()) {
        if (sha(content) === blobSha) {
          return { encoding: 'base64', content: Buffer.from(content).toString('base64'), sha: blobSha, size: Buffer.byteLength(content) };
        }
      }
      throw new Error('missing blob');
    },
    async commitFiles({ files: next, message, parentSha }) {
      if (parentSha !== head) throw new Error('write_conflict');
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function memoryTasks() {
  const data = new Map([[TASKS_INDEX_KEY, []]]);
  return {
    data,
    writes: 0,
    async get(key, options) {
      const value = data.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
      this.writes += 1;
    },
    async set(key, value) {
      data.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    }
  };
}

function ghostHarness() {
  const github = memoryGitHub(new Map([...SEEDED.files, ['central-node.md', CN]]));
  const store = memoryTasks();
  store.data.set(HUB_PREFS_KEY, { school_terms: SEEDED.terms });
  const handler = createCalendarGhostsHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => store,
    loadLessons: async () => [],
    loadProfessionalEvents: async () => []
  });
  return { handler, github, store };
}

function post(body) {
  return new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function project(openings) {
  return openings.filter(opening => opening.dates.length).map(opening => ({
    wantId: opening.wantId,
    title: opening.title,
    span: opening.span,
    with: opening.with ?? null,
    dates: opening.dates,
    pct: opening.pct
  }));
}

/** Independent of the server: the reference openingDays + full fixture pattern. */
function referenceOpenings(fixture) {
  const dates = [];
  for (let date = fixture.RANGE.from; date <= fixture.RANGE.to; date = addDays(date, 1)) dates.push(date);
  const inTerm = date => fixture.TERMS.some(term => date >= term.starts_on && date <= term.ends_on);
  const pattern = date => fixture.PATTERN.filter(row => date >= row.from && date <= row.to).reduce((sum, row) => sum + row.delta, 0);
  const series = forecastSeries(dates, {
    lastPct: fixture.LAST_LOG.pct,
    lastDate: fixture.LAST_LOG.date,
    isHoliday: date => !inTerm(date),
    pattern
  });
  const days = series.map(point => {
    const weekday = new Date(`${point.date}T00:00:00Z`).getUTCDay();
    const school = inTerm(point.date) && weekday >= 1 && weekday <= 5;
    const busy = fixture.BUSY.some(row => row.date === point.date);
    return {
      date: point.date,
      pct: point.pct,
      weekday,
      holiday: !inTerm(point.date),
      walled: weekday === 0 || fixture.WALLS.some(wall => point.date >= wall.from && point.date <= wall.to),
      freeDay: school || busy ? 0 : 12,
      freeEvening: fixture.TAKEN_EVENINGS.includes(point.date) ? 0 : school && weekday !== 5 ? 3 : 4.5,
      tags: fixture.DAY_TAGS[point.date] ?? []
    };
  });
  return findOpenings(days, ALMANAC_WANTS);
}

test('readSchoolTerms flattens the year-nested school_terms hub-prefs writes, sorted by starts_on', async () => {
  const store = memoryTasks();
  store.data.set(HUB_PREFS_KEY, {
    school_terms: [
      {
        year: 2027,
        terms: [
          { term: 2, starts_on: '2027-04-27', ends_on: '2027-07-02' },
          { term: 1, starts_on: '2027-02-01', ends_on: '2027-04-09' }
        ]
      },
      {
        year: 2026,
        terms: [
          { term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' },
          { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }
        ]
      }
    ]
  });
  const warnings = [];
  const terms = await readSchoolTerms(async () => store, { warn: message => warnings.push(message) });
  assert.deepEqual(terms, [
    { term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' },
    { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' },
    { term: 1, starts_on: '2027-02-01', ends_on: '2027-04-09' },
    { term: 2, starts_on: '2027-04-27', ends_on: '2027-07-02' }
  ]);
  assert.deepEqual(warnings, []);
});

test('a bad anchor row is skipped with a warning', () => {
  const warnings = [];
  const anchors = parseAlmanacAnchors([
    '- id: korea',
    '  title: Korea honeymoon',
    '  kind: trip',
    "  date: '2026-12-23'",
    "  returns: '2027-01-10'",
    '  tags: [international]',
    '  sub: away',
    '- id: bad',
    '  title: Both',
    '  kind: trip',
    "  date: '2026-12-01'",
    '  window:',
    "    opens: '2026-12-02'",
    "    closes: '2026-12-03'",
    '  tags: []',
    '  sub: both'
  ].join('\n'), { warn: message => warnings.push(message) });
  assert.deepEqual(anchors.map(anchor => anchor.id), ['korea']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /bad/);
});

test('a daytime lesson busies a holiday, and an anchor flag becomes an anchor', () => {
  const day = '2026-09-28';
  const base = {
    today: day,
    from: day,
    to: day,
    anchors: [],
    terms: [],
    logs: []
  };
  const open = buildAlmanac(base);
  const busy = buildAlmanac({ ...base, lessons: [{ date: day, start_time: '09:00' }] });
  const bob = openings => openings.find(opening => opening.wantId === 'bob');
  assert.deepEqual(bob(open.openings).dates, [day]);
  assert.deepEqual(bob(busy.openings).dates, []);

  const marked = buildAlmanac({
    today: '2026-09-24',
    from: '2026-09-24',
    to: '2026-09-30',
    anchors: [],
    professionalEvents: [{
      anchor: true,
      id: 'conf',
      title: 'Extra conferral',
      date: '2026-09-30',
      sub: 'guest',
      tags: ['graduation'],
      all_day: true
    }]
  });
  assert.equal(marked.lines.some(line => line.anchor.id === 'event-conf'), true);
});

test('GET on the seed matches the reference summary and openings, and done drops the step', async () => {
  const root = new URL('../../', import.meta.url);
  const handle = createMockApi({ root });
  const server = createServer((request, response) => {
    handle(request, response).then(handled => {
      if (!handled && !response.writableEnded) {
        response.statusCode = 404;
        response.end();
      }
    }).catch(error => {
      if (!response.writableEnded) {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : 'failed');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const login = await fetch(`${base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: 'life-hub-local' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { cookie, 'content-type': 'application/json' };
    const seeded = await fetch(`${base}/api/almanac-visual-seed`, { method: 'POST', headers });
    assert.equal(seeded.status, 200);
    const viewResponse = await fetch(`${base}/api/almanac?from=2026-09-24&to=2027-01-10`, { headers });
    const view = await viewResponse.json();
    assert.equal(viewResponse.status, 200);
    assert.deepEqual(view.summary, { unbooked: 2, lastSafeSoon: 7, openings: 4 });
    assert.deepEqual(project(view.openings), project(referenceOpenings(FIXTURE)));

    const done = await fetch(`${base}/api/almanac/done`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ stepId: 'vitamin-d:book-recheck' })
    });
    assert.equal(done.status, 200);
    const after = await (await fetch(`${base}/api/almanac?from=2026-09-24&to=2027-01-10`, { headers })).json();
    assert.equal(after.summary.unbooked, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('accepting the pet-sitter ghost creates one task, and a retry does not create another', async () => {
  const { handler, github, store } = ghostHarness();
  const first = await handler(post({ id: 'alm-korea:pet-sitter', decision: 'accept' }));
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  const again = await handler(post({ id: 'alm-korea:pet-sitter', decision: 'accept' }));
  assert.equal(again.status, 200);
  const id = ghostTaskId('alm-korea:pet-sitter');
  const taskIds = [...store.data.keys()].filter(key => key.startsWith('tasks/') && key !== TASKS_INDEX_KEY);
  assert.deepEqual(taskIds, [taskKey(id)]);
  assert.equal(store.data.get(taskKey(id)).due_date, '2026-10-28');
  assert.deepEqual(store.data.get(TASKS_INDEX_KEY), [id]);
  assert.equal(github.commits.length, 1);
});

test('holding an opening writes the block and does not queue a ghost', async () => {
  const { handler, github } = ghostHarness();
  const result = await handler(post({ id: 'alm-hold-good-night', decision: 'accept' }));
  const body = await result.json();
  assert.equal(result.status, 200, JSON.stringify(body));
  assert.equal(github.files.has('pending-calendar-ghosts.json'), false);
  const blocks = [...github.files.keys()].filter(path => path.startsWith('data/calendar/') && path.includes('2026-10-02'));
  assert.equal(blocks.length, 1);
  assert.match(github.files.get(blocks[0]), /Good night: dinner out \+ a show/);
});

test('after a hold, buildAlmanac marks that opening held until the date passes', async () => {
  const { load } = await import('js-yaml');
  const { handler, github } = ghostHarness();
  assert.equal((await handler(post({ id: 'alm-hold-good-night', decision: 'accept' }))).status, 200);

  const blockEntries = [...github.files.entries()]
    .filter(([path]) => path.startsWith('data/calendar/'))
    .map(([, content]) => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
      return match ? load(match[1]) : null;
    })
    .filter(Boolean);

  const held = buildAlmanac({
    today: '2026-09-24',
    from: '2026-09-24',
    to: '2027-01-10',
    anchors: parseAlmanacAnchors(SEEDED.files.get('almanac-anchors.yml') ?? ''),
    done: [],
    terms: FIXTURE.TERMS,
    logs: [],
    blocks: blockEntries
  });
  const goodNight = held.openings.find(opening => opening.wantId === 'good-night');
  assert.equal(goodNight?.held, true);
  assert.deepEqual(goodNight?.dates, ['2026-10-02']);
  assert.equal(goodNight?.ids?.hold, null);

  const after = buildAlmanac({
    today: '2026-10-03',
    from: '2026-10-03',
    to: '2027-01-10',
    anchors: parseAlmanacAnchors(SEEDED.files.get('almanac-anchors.yml') ?? ''),
    done: [],
    terms: FIXTURE.TERMS,
    logs: [],
    blocks: blockEntries
  });
  const next = after.openings.find(opening => opening.wantId === 'good-night');
  assert.equal(next?.held, false);
  assert.ok(next?.dates?.[0] > '2026-10-02');
});

test('accepting a draft writes nothing and returns the text', async () => {
  const { handler, github, store } = ghostHarness();
  const before = new Map(github.files);
  const result = await handler(post({ id: 'alm-draft-bob', decision: 'accept' }));
  const body = await result.json();
  assert.equal(result.status, 200, JSON.stringify(body));
  assert.match(body.receipt, /Nothing sent/);
  assert.match(body.draft.text, /Monday 28 September/);
  assert.equal(github.commits.length, 0);
  assert.equal(store.writes, 0);
  assert.equal(github.files.size, before.size);
  for (const [path, content] of before) assert.equal(github.files.get(path), content);
});

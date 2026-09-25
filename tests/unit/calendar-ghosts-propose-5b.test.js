/**
 * Calendar phase 5b: Sydney propose window, calendar-open refresh, last_run metadata.
 */
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';
import { renderMarkdown } from '../../netlify/functions/_shared/persist-log.mjs';
import { buildCanonicalPath, buildRecordSlug } from '../../netlify/functions/_shared/chat-schema.mjs';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  createCalendarGhostsHandler,
  parsePendingCalendarGhostsDoc,
  serializePendingCalendarGhosts,
  appendPendingCalendarGhost
} from '../../netlify/functions/calendar-ghosts.mjs';
import {
  inSydneyProposeWindow,
  shouldRefreshPropose,
  shouldScheduledPropose,
  runCalendarGhostsPropose,
  newestRecordAtForDate
} from '../../netlify/functions/_shared/calendar-ghosts-propose.mjs';
import { loadCalendarVisualSeed } from '../../scripts/calendar-visual-seed.mjs';
import { ghostSemanticKey } from '../../apps/life/js/app/ghost-proposer.js';

const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};

const SEEDED = await loadCalendarVisualSeed();
const TODAY = '2026-09-24';
const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

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
          path,
          type: 'blob',
          sha: sha(content),
          size: Buffer.byteLength(content)
        }))
      };
    },
    async readBlob(blobSha) {
      for (const content of files.values()) {
        if (sha(content) === blobSha) {
          return {
            encoding: 'base64',
            content: Buffer.from(content).toString('base64'),
            sha: blobSha,
            size: Buffer.byteLength(content)
          };
        }
      }
      throw new GitHubClientError('repository_not_found', false);
    },
    async commitFiles({ files: next, message, parentSha }) {
      if (parentSha !== head) throw new GitHubClientError('write_conflict', true);
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function openCommit(github) {
  return {
    open: async () => {
      const resolved = await github.resolveTree();
      const blobs = new Map(
        (resolved.tree ?? [])
          .filter(entry => entry?.type === 'blob' && typeof entry.path === 'string')
          .map(entry => [entry.path, entry.sha])
      );
      return {
        base: { commitSha: resolved.commitSha, treeSha: resolved.treeSha },
        listPaths() { return [...blobs.keys()]; },
        async readFile(path) {
          const shaVal = blobs.get(path);
          if (!shaVal) return null;
          const blob = await github.readBlob(shaVal);
          return Buffer.from(blob.content, 'base64').toString('utf8');
        }
      };
    },
    commit: (changed, base, message) => github.commitFiles({
      files: [...changed.entries()].map(([path, content]) => ({ path, content })),
      message,
      parentSha: base.commitSha,
      baseTreeSha: base.treeSha
    })
  };
}

/** Visual-seed week with an empty queue (no fixture ghosts). */
function emptyQueueSeed() {
  const files = new Map(SEEDED.files);
  files.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts([]));
  return files;
}

function stampDiary(updatedAt) {
  const record = {
    schema_version: 1,
    id: 'diary-sore-throat',
    type: 'diary',
    date: TODAY,
    time: '07:40',
    created_at: updatedAt,
    updated_at: updatedAt,
    source: 'phase5b-test',
    title: 'Morning'
  };
  assert.deepEqual(validateRecord(record), []);
  const path = buildCanonicalPath({
    type: record.type,
    date: record.date,
    slug: buildRecordSlug(record)
  });
  return { path, content: renderMarkdown(record, 'Sore throat, sniffles, poor sleep') };
}

test('Sydney propose window keeps 05:30 and drops 04:30 AEST', () => {
  // AEST (+10): 18:30 UTC = 04:30 Sydney — outside.
  assert.equal(inSydneyProposeWindow(new Date('2026-06-15T18:30:00Z')), false);
  // AEST (+10): 19:30 UTC = 05:30 Sydney — inside.
  assert.equal(inSydneyProposeWindow(new Date('2026-06-15T19:30:00Z')), true);
  // AEDT (+11): 18:30 UTC = 05:30 Sydney — inside.
  assert.equal(inSydneyProposeWindow(new Date('2026-01-15T18:30:00Z')), true);
  // Edges
  assert.equal(inSydneyProposeWindow(new Date('2026-06-15T19:25:00Z')), true); // 05:25
  assert.equal(inSydneyProposeWindow(new Date('2026-06-15T20:35:00Z')), true); // 06:35
  assert.equal(inSydneyProposeWindow(new Date('2026-06-15T19:24:00Z')), false); // 05:24
});

test('04:30 AEST scheduled tick does nothing', async () => {
  const github = memoryGitHub(emptyQueueSeed());
  const { open, commit } = openCommit(github);
  // 2026-06-15 is AEST: 18:30 UTC → 04:30 Sydney
  const instant = new Date('2026-06-15T18:30:00Z');
  const result = await runCalendarGhostsPropose({
    open,
    commit,
    today: '2026-06-15',
    nowIso: '2026-06-15T04:30:00+10:00',
    nowMs: instant.getTime(),
    instant,
    terms: TERMS,
    lessons: [],
    professionalEvents: [],
    trigger: 'scheduled'
  });
  assert.equal(result.skipped, 'outside_window');
  assert.equal(result.proposed, 0);
  assert.equal(github.commits.length, 0);
});

test('shouldRefreshPropose: 2h stale or newer Life record', () => {
  const last = {
    date: TODAY,
    at: '2026-09-24T08:00:00+10:00',
    newest_record_at: '2026-09-24T07:40:00+10:00'
  };
  assert.equal(shouldRefreshPropose(null, { today: TODAY, nowMs: Date.parse('2026-09-24T08:00:00+10:00'), newestRecordAt: null }), true);
  assert.equal(shouldRefreshPropose(last, {
    today: TODAY,
    nowMs: Date.parse('2026-09-24T08:05:00+10:00'),
    newestRecordAt: '2026-09-24T07:40:00+10:00'
  }), false);
  assert.equal(shouldRefreshPropose(last, {
    today: TODAY,
    nowMs: Date.parse('2026-09-24T10:01:00+10:00'),
    newestRecordAt: '2026-09-24T07:40:00+10:00'
  }), true);
  assert.equal(shouldRefreshPropose(last, {
    today: TODAY,
    nowMs: Date.parse('2026-09-24T08:05:00+10:00'),
    newestRecordAt: '2026-09-24T07:50:00+10:00'
  }), true);
  assert.equal(shouldScheduledPropose(last, TODAY), false);
  assert.equal(shouldScheduledPropose(null, TODAY), true);
});

test('diary at 07:40 then calendar open at 08:00 yields Sara proposals the same day', async () => {
  const files = emptyQueueSeed();
  // Visual seed already has the Thursday diary; bump its updated_at to 07:40 and clear last_run.
  const diary = stampDiary('2026-09-24T07:40:00+10:00');
  files.set(diary.path, diary.content);

  const github = memoryGitHub(files);
  const session = createSessionToken({
    now: Date.parse('2026-09-24T08:00:00+10:00'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;

  const handler = createCalendarGhostsHandler({
    env: ENV,
    now: () => Date.parse('2026-09-24T08:00:00+10:00'),
    createGitHubClient: () => github,
    getTasksStore: async () => ({
      async get() { return null; },
      async set() {},
      async setJSON() {}
    }),
    loadLessons: async () => [],
    loadProfessionalEvents: async () => []
  });

  const response = await handler(new Request(
    `https://life.example/api/calendar-ghosts?from=2026-09-21&to=2026-09-27`,
    { headers: { cookie: `life_hub_session=${session}` } }
  ));
  const payload = await response.json();
  assert.equal(response.status, 200);
  const sara = payload.ghosts.filter(g => g.agent === 'sara');
  assert.ok(sara.some(g => g.kind === 'skip_workout'), 'Sara skip_workout same day');
  assert.ok(sara.some(g => g.kind === 'bedtime'), 'Sara bedtime same day');
  assert.ok(sara.find(g => g.kind === 'skip_workout')?.reason?.includes('sore throat'));

  const doc = parsePendingCalendarGhostsDoc(github.files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(doc.last_run?.date, TODAY);
  assert.equal(doc.last_run?.at, '2026-09-24T08:00:00+10:00');
  assert.ok(doc.last_run?.newest_record_at);
});

test('opening again at 08:05 with nothing new proposes nothing', async () => {
  const files = emptyQueueSeed();
  const diary = stampDiary('2026-09-24T07:40:00+10:00');
  files.set(diary.path, diary.content);

  // First run at 08:00.
  const github = memoryGitHub(files);
  const { open, commit } = openCommit(github);
  const first = await runCalendarGhostsPropose({
    open,
    commit,
    today: TODAY,
    nowIso: '2026-09-24T08:00:00+10:00',
    nowMs: Date.parse('2026-09-24T08:00:00+10:00'),
    terms: TERMS,
    lessons: [],
    professionalEvents: [],
    trigger: 'refresh'
  });
  assert.ok(first.proposed >= 1);
  const commitsAfterFirst = github.commits.length;

  const second = await runCalendarGhostsPropose({
    open,
    commit,
    today: TODAY,
    nowIso: '2026-09-24T08:05:00+10:00',
    nowMs: Date.parse('2026-09-24T08:05:00+10:00'),
    terms: TERMS,
    lessons: [],
    professionalEvents: [],
    trigger: 'refresh'
  });
  assert.equal(second.skipped, 'fresh');
  assert.equal(second.proposed, 0);
  assert.equal(github.commits.length, commitsAfterFirst);
});

test('a fresh GET does not call school / lesson / professional loaders', async () => {
  const files = emptyQueueSeed();
  const diary = stampDiary('2026-09-24T07:40:00+10:00');
  files.set(diary.path, diary.content);
  const github = memoryGitHub(files);
  const { open, commit } = openCommit(github);
  await runCalendarGhostsPropose({
    open,
    commit,
    today: TODAY,
    nowIso: '2026-09-24T08:00:00+10:00',
    nowMs: Date.parse('2026-09-24T08:00:00+10:00'),
    terms: TERMS,
    lessons: [],
    professionalEvents: [],
    trigger: 'refresh'
  });

  let lessonsCalls = 0;
  let professionalCalls = 0;
  const session = createSessionToken({
    now: Date.parse('2026-09-24T08:05:00+10:00'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;
  const handler = createCalendarGhostsHandler({
    env: ENV,
    now: () => Date.parse('2026-09-24T08:05:00+10:00'),
    createGitHubClient: () => github,
    getTasksStore: async () => ({
      async get() { return null; },
      async set() {},
      async setJSON() {}
    }),
    loadLessons: async () => { lessonsCalls += 1; return []; },
    loadProfessionalEvents: async () => { professionalCalls += 1; return []; }
  });

  const response = await handler(new Request(
    `https://life.example/api/calendar-ghosts?from=2026-09-21&to=2026-09-27`,
    { headers: { cookie: `life_hub_session=${session}` } }
  ));
  assert.equal(response.status, 200);
  assert.equal(lessonsCalls, 0, 'fresh GET must not load teaching lessons');
  assert.equal(professionalCalls, 0, 'fresh GET must not load professional events');
});

test('a run that proposes nothing still records last_run metadata', async () => {
  const files = new Map([
    ['central-node.md', '# CN\n'],
    [PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts([])]
  ]);
  const github = memoryGitHub(files);
  const { open, commit } = openCommit(github);
  const result = await runCalendarGhostsPropose({
    open,
    commit,
    today: TODAY,
    nowIso: '2026-09-24T08:00:00+10:00',
    nowMs: Date.parse('2026-09-24T08:00:00+10:00'),
    terms: TERMS,
    lessons: [],
    professionalEvents: [],
    trigger: 'manual'
  });
  // May propose a protect_block from empty openings — either way last_run is set.
  const doc = parsePendingCalendarGhostsDoc(github.files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(doc.last_run?.date, TODAY);
  assert.equal(doc.last_run?.at, '2026-09-24T08:00:00+10:00');
  assert.equal(result.last_run?.date, TODAY);
});

test('appendPendingCalendarGhost semantic-dedupes fixture g-skip against proposer id', () => {
  const fixture = {
    id: 'g-skip',
    agent: 'sara',
    kind: 'skip_workout',
    date: TODAY,
    workoutPath: 'records/2026/09/24/workout-1815.md',
    status: 'pending',
    created_at: '2026-09-24T05:30:00+10:00'
  };
  const prior = serializePendingCalendarGhosts([fixture]);
  const proposerShaped = {
    id: 'sara-skip_workout-2026-09-24',
    agent: 'sara',
    kind: 'skip_workout',
    date: TODAY,
    workoutPath: 'records/2026/09/24/workout-1815.md',
    status: 'pending',
    created_at: '2026-09-24T08:00:00+10:00',
    via: 'refresh'
  };
  assert.equal(ghostSemanticKey(fixture), ghostSemanticKey(proposerShaped));
  const again = appendPendingCalendarGhost(prior, proposerShaped);
  assert.equal(again.added, false);
});

test('newestRecordAtForDate picks the latest updated_at on today', () => {
  const newest = newestRecordAtForDate([
    { record: { date: TODAY, updated_at: '2026-09-24T06:00:00+10:00' } },
    { record: { date: TODAY, updated_at: '2026-09-24T07:40:00+10:00' } },
    { record: { date: '2026-09-23', updated_at: '2026-09-24T09:00:00+10:00' } }
  ], TODAY);
  assert.equal(newest, '2026-09-24T07:40:00+10:00');
});

/**
 * Schedule Diff product boundary (SD1–SD41).
 *
 * Evidence levels — do not upgrade by renaming:
 * LEVEL 1 = override helper / hard-busy domain
 * LEVEL 2 = Schedule Diff card move preview / payload→card wiring (no durable write)
 * LEVEL 3 = compose_schedule / planning profile domain
 * LEVEL 4 = createChatHandler or createChatConfirmHandler → queue / SSE / persistence / fail-closed
 * LEVEL 5 = live smoke — not this file
 *
 * SD1 (legacy): compose + manual queue insert — LEVEL 2/3 seam only, not chat→queue→SSE.
 * SD19: real createChatHandler → pending queue → SSE identity — LEVEL 4.
 * SD33–SD41: failure-path consistency (queue orphan, terminal workflow, Life event source).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';
import {
  PENDING_ACTIONS_PATH,
  addPendingAction,
  applyScheduleOverrides,
  findPendingActionById,
  getPendingActionStatus,
  isPendingActionExecutable,
  parsePendingActions,
  serializePendingActions
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { executeClareWork, loadWorkflowState, reconcileScheduleDiffIfPendingConsumed, reconcileScheduleDiffIfPendingDismissed } from '../../netlify/functions/_shared/clare-work.mjs';
import { buildProductivityCardEvent } from '../../netlify/functions/_shared/productivity-card-map.mjs';
import {
  FALLBACK_WORKDAY,
  buildAuthoritativeHardBusy,
  detectStaleScheduleCollisions,
  workdayForDate,
  workWindowGapSpans
} from '../../netlify/functions/_shared/productivity-os.mjs';
import { createScheduleDiffCard } from '../../packages/design-kit/js/agent-productivity-cards.js';
import { scheduleDiffActiveProposed } from '../../apps/life/js/shell/tasks-calendar.js';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const NOW_MS = Date.parse('2026-09-08T12:00:00Z');
const session = createSessionToken({
  now: NOW_MS,
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

/** Tuesday fixture — protected Pickup lives on tue. */
const DAY = '2026-09-08';

function confirmRequest(body) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function sha40(n) {
  return String(n).padStart(40, '0');
}

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setJSON(key, value) {
      data[key] = value;
    },
    async set(key, value) {
      data[key] = typeof value === 'string' ? JSON.parse(value) : value;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(data)
          .filter((key) => !prefix || key.startsWith(prefix))
          .map((key) => ({ key }))
      };
    }
  };
}

function statefulGithub(seed = {}) {
  const blobs = new Map();
  for (const [path, content] of Object.entries(seed)) {
    blobs.set(path, { sha: sha40(11), content });
  }
  let seq = 100;
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: sha40(9), commit: { tree: { sha: sha40(8) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [...blobs.entries()].map(([path, blob]) => ({ path, type: 'blob', sha: blob.sha }))
      });
    }
    const blobMatch = /\/git\/blobs\/([0-9a-f]{40})/.exec(url);
    if (blobMatch) {
      const found = [...blobs.values()].find((item) => item.sha === blobMatch[1]);
      if (!found) return Response.json({ message: 'missing' }, { status: 404 });
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(found.content, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      const path = decodeURIComponent(url.split('/contents/')[1] ?? '');
      const body = JSON.parse(options.body);
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const sha = sha40(seq++);
      blobs.set(path, { sha, content });
      return Response.json({ content: { sha }, commit: { sha: sha40(seq++) } });
    }
    return Response.json({ message: 'unused' }, { status: 404 });
  };
  return { blobs, fetchImpl };
}

function workBlockWrite(id, {
  title = 'Mark essays',
  date = DAY,
  start_time = '09:00',
  duration_minutes = 60,
  task_id = 'task_mark'
} = {}) {
  return {
    path: `tasks:work_block:${id}`,
    mode: 'create',
    content: JSON.stringify({
      schema_version: 1,
      id,
      task_id,
      project_id: null,
      title,
      date,
      start_time,
      duration_minutes,
      depth: 'shallow',
      status: 'proposed',
      source: 'clare',
      locked: false,
      created_at: `${DAY}T12:00:00.000Z`,
      updated_at: `${DAY}T12:00:00.000Z`
    }),
    diff: `schedule ${date} ${start_time} · ${title}`
  };
}

function pendingEntry(id, writes, extras = {}) {
  return {
    id,
    createdAt: `${DAY}T12:00:00.000Z`,
    slug: 'clare',
    workflowKind: 'schedule_diff',
    workflowId: 'schedule_diff:current',
    proposal: {
      capability: 'os.propose-action',
      agent: 'clare',
      intent: 'Compose Tuesday schedule',
      reads: [],
      writes,
      surfaces: ['confirm_card', 'tasks_hub', 'schedule_diff']
    },
    ...extras
  };
}

function withDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.document = dom.window.document;
  globalThis.CSS = { escape: (value) => String(value) };
  return dom;
}

function confirmHandler({ github, tasks, teaching }) {
  return createChatConfirmHandler({
    env: validEnv,
    fetchImpl: github.fetchImpl,
    now: () => NOW_MS,
    getTasksStore: async () => tasks,
    getTeachingStore: async () => teaching
  });
}

describe('LEVEL 1 schedule override + hard busy', () => {
  it('applyScheduleOverrides changes only start_time', () => {
    const writes = [workBlockWrite('a', { start_time: '09:00', task_id: 'task_a' })];
    const result = applyScheduleOverrides(writes, [
      { path: 'tasks:work_block:a', start_time: '10:30' }
    ]);
    assert.equal(result.ok, true);
    const record = JSON.parse(result.writes[0].content);
    assert.equal(record.start_time, '10:30');
    assert.equal(record.task_id, 'task_a');
  });

  it('unknown override fields fail closed', () => {
    const writes = [workBlockWrite('a')];
    const result = applyScheduleOverrides(writes, [
      { path: 'tasks:work_block:a', start_time: '10:30', task_id: 'hack' }
    ]);
    assert.equal(result.ok, false);
  });

  it('Year 10 English and Pickup are hard busy', () => {
    const hardBusy = buildAuthoritativeHardBusy({
      date: DAY,
      lessons: [{
        id: 'lesson_y10',
        title: 'Year 10 English',
        date: DAY,
        start_time: '11:00',
        duration_minutes: 60
      }],
      workBlocks: [],
      planningProfile: {
        protected_windows: {
          tue: [{ start: '15:00', end: '16:30', label: 'Pickup' }]
        },
        work_windows: {
          tue: [{ start: '08:00', end: '16:30' }]
        }
      }
    });
    assert.equal(
      detectStaleScheduleCollisions({
        proposedBlocks: [{
          temp_id: 'a',
          title: 'A',
          start_time: '11:15',
          duration_minutes: 60,
          selected: true
        }],
        hardBusy,
        workday: FALLBACK_WORKDAY
      }).ok,
      false
    );
    assert.equal(
      detectStaleScheduleCollisions({
        proposedBlocks: [{
          temp_id: 'a',
          title: 'A',
          start_time: '15:00',
          duration_minutes: 45,
          selected: true
        }],
        hardBusy,
        workday: FALLBACK_WORKDAY
      }).ok,
      false
    );
  });
});

function chatRequest(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

function planningProfile(overrides = {}) {
  return {
    work_windows: {
      mon: [],
      tue: [{ start: '08:00', end: '16:30' }],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
      ...(overrides.work_windows || {})
    },
    protected_windows: {
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
      ...(overrides.protected_windows || {})
    }
  };
}

function minutesOfTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function failingListStore(base) {
  return {
    data: base.data,
    async get(key, ...rest) {
      return base.get(key, ...rest);
    },
    async setJSON(key, value) {
      return base.setJSON(key, value);
    },
    async set(key, value) {
      return base.set(key, value);
    },
    async list() {
      throw new Error('authoritative_schedule_read_failed');
    }
  };
}

async function composeFixture({
  lessons = [],
  planning_profile = planningProfile(),
  task = {
    id: 'task_a',
    title: 'Mark Year 10',
    status: 'open',
    estimated_duration: 60,
    depth: 'shallow'
  },
  workBlocks = [],
  input = { date: DAY, task_ids: ['task_a'] }
} = {}) {
  const saved = new Map();
  const result = await executeClareWork('compose_schedule', input, {
    now: new Date(`${DAY}T08:00:00Z`),
    tasks: [task],
    projects: [],
    lessons,
    workBlocks,
    planning_profile,
    tasksStore: {
      async get(key) {
        return saved.has(key) ? saved.get(key) : null;
      },
      async setJSON(key, value) {
        saved.set(key, value);
      },
      async set(key, value) {
        saved.set(key, typeof value === 'string' ? JSON.parse(value) : value);
      }
    }
  });
  return { result, saved };
}

describe('SD1 compose proposal identity (LEVEL 2/3 — not chat→queue→SSE)', () => {
  it('compose_schedule emits work_block writes mapped on schedule-diff card', async () => {
    const saved = new Map();
    const result = await executeClareWork(
      'compose_schedule',
      { date: DAY, task_ids: ['task_a'] },
      {
        now: new Date(`${DAY}T08:00:00Z`),
        tasks: [{
          id: 'task_a',
          title: 'Mark Year 10',
          status: 'open',
          estimated_duration: 60,
          depth: 'shallow'
        }],
        projects: [],
        lessons: [],
        workBlocks: [],
        planning_profile: {
          work_windows: {
            mon: [], tue: [{ start: '08:00', end: '16:30' }], wed: [], thu: [], fri: [], sat: [], sun: []
          },
          protected_windows: {
            mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
          }
        },
        tasksStore: {
          async get(key) {
            return saved.has(key) ? saved.get(key) : null;
          },
          async setJSON(key, value) {
            saved.set(key, value);
          },
          async set(key, value) {
            saved.set(key, typeof value === 'string' ? JSON.parse(value) : value);
          }
        }
      }
    );
    assert.equal(result.kind, 'propose');
    assert.ok(result.proposal?.writes?.length >= 1);
    assert.ok(result.proposal.writes.every((write) => String(write.path).startsWith('tasks:work_block:')));

    const pendingId = 'act_sd1';
    const card = buildProductivityCardEvent('compose_schedule', result, { pendingId });
    assert.equal(card?.card_type, 'schedule-diff');
    assert.equal(card.payload.pendingId, pendingId);
    const blocks = card.payload.blocks ?? card.payload.proposed ?? [];
    assert.ok(blocks.length >= 1);
    for (const block of blocks) {
      const path = block.write_path || block.id;
      assert.ok(result.proposal.writes.some((write) => write.path === path));
    }

    const queue = addPendingAction([], {
      id: pendingId,
      createdAt: `${DAY}T12:00:00.000Z`,
      slug: 'clare',
      proposal: result.proposal
    });
    assert.ok(findPendingActionById(queue, pendingId));
  });
});

describe('SD2 move is preview only (LEVEL 2)', () => {
  it('moving a ghost updates times without confirm', () => {
    withDom();
    const ghostTimes = [];
    const confirms = [];
    const built = createScheduleDiffCard(document, {
      pendingId: 'act_sd2',
      blocks: [
        { id: 'tasks:work_block:a', title: 'A', start_time: '09:00', duration_minutes: 60, date: DAY },
        { id: 'tasks:work_block:b', title: 'B', start_time: '11:00', duration_minutes: 30, date: DAY }
      ],
      onBlocksChange: (rows) => ghostTimes.push(rows.map((row) => row.time)),
      onConfirm: () => confirms.push('confirm')
    });
    document.body.append(built.card);
    assert.equal(built.moveBlockForTest('tasks:work_block:a', '10:30'), true);
    assert.equal(built.getBlocks().find((row) => row.id === 'tasks:work_block:a')?.time, '10:30');
    assert.ok(ghostTimes.some((times) => times.includes('10:30')));
    assert.deepEqual(confirms, []);
    assert.ok(
      built.getScheduleOverrides().some(
        (row) => row.path === 'tasks:work_block:a' && row.start_time === '10:30'
      )
    );
  });
});

describe('LEVEL 4 Schedule Diff confirm (SD3–SD11)', () => {
  it('SD3 exact moved override persists for A only', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd3', [
          workBlockWrite('a', { start_time: '09:00', title: 'Block A' }),
          workBlockWrite('b', { start_time: '11:00', title: 'Block B', task_id: 'task_b' })
        ])
      ])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd3',
        accept: ['tasks:work_block:a', 'tasks:work_block:b'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '13:00' }]
      })
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(tasks.data['work_blocks/a']?.start_time, '13:00');
    assert.equal(tasks.data['work_blocks/b']?.start_time, '11:00');
    assert.equal(tasks.data['work_blocks/a']?.task_id, 'task_mark');
    const entry = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd3'
    );
    assert.equal(getPendingActionStatus(entry), 'consumed');
    assert.equal(isPendingActionExecutable(entry), false);
  });

  it('SD4 tampered override fails closed', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd4', [workBlockWrite('a')])])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd4',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{
          path: 'tasks:work_block:a',
          start_time: '10:30',
          task_id: 'hacked'
        }]
      })
    );
    assert.equal(response.status, 400);
    assert.equal(tasks.data['work_blocks/a'], undefined);
    const entry = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd4'
    );
    assert.equal(isPendingActionExecutable(entry), true);
  });

  it('SD5 deselected B does not write', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd5', [
          workBlockWrite('a', { start_time: '09:00' }),
          workBlockWrite('b', { start_time: '11:00', title: 'Block B' })
        ])
      ])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd5',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '10:30' }]
      })
    );
    assert.equal(response.status, 200);
    assert.equal(tasks.data['work_blocks/a']?.start_time, '10:30');
    assert.equal(tasks.data['work_blocks/b'], undefined);
  });

  it('SD6 stale collision after move rejects', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd6', [workBlockWrite('a')])])
    });
    const tasks = memoryStore({
      'work_blocks/existing': {
        id: 'existing',
        title: 'Confirmed planning',
        date: DAY,
        start_time: '10:30',
        duration_minutes: 60,
        status: 'confirmed'
      }
    });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd6',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '10:30' }]
      })
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, 'stale_schedule_collision');
    assert.equal(tasks.data['work_blocks/a'], undefined);
    const entry = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd6'
    );
    assert.equal(isPendingActionExecutable(entry), true);
  });

  it('SD7 workday boundary: UI invalid + server reject', async () => {
    withDom();
    const built = createScheduleDiffCard(document, {
      pendingId: 'act_sd7_ui',
      workday: { start: FALLBACK_WORKDAY.start, end: FALLBACK_WORKDAY.end },
      blocks: [{ id: 'tasks:work_block:a', title: 'A', start_time: '09:00', duration_minutes: 60 }]
    });
    built.moveBlockForTest('tasks:work_block:a', '07:00');
    assert.equal(built.getBlocks()[0].invalid, true);

    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd7', [workBlockWrite('a')])])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd7',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '07:00' }]
      })
    );
    assert.equal(response.status, 409);
    assert.equal(tasks.data['work_blocks/a'], undefined);
  });

  it('SD8 protected Pickup window rejects', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd8', [workBlockWrite('a')])])
    });
    const tasks = memoryStore({
      'meta/planning_profile': {
        protected_windows: {
          tue: [{ start: '15:00', end: '16:30', label: 'Pickup' }]
        },
        work_windows: {
          tue: [{ start: '08:00', end: '16:30' }]
        }
      }
    });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd8',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '15:00' }]
      })
    );
    assert.equal(response.status, 409);
    assert.equal(tasks.data['work_blocks/a'], undefined);
  });

  it('SD9 Year 10 English hard busy then free slot persists', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd9', [workBlockWrite('a')])])
    });
    const tasks = memoryStore();
    const teaching = memoryStore({
      'scheduled_lessons/lesson_y10': {
        id: 'lesson_y10',
        title: 'Year 10 English',
        date: DAY,
        start_time: '11:00',
        duration_minutes: 60
      }
    });
    const confirm = confirmHandler({ github, tasks, teaching });
    const blocked = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd9',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '11:15' }]
      })
    );
    assert.equal(blocked.status, 409);
    assert.equal(tasks.data['work_blocks/a'], undefined);

    const ok = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd9',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '13:00' }]
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(tasks.data['work_blocks/a']?.start_time, '13:00');
  });

  it('SD10 dismiss writes no work blocks', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd10', [workBlockWrite('a')])])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action_dismiss',
        slug: 'clare',
        id: 'act_sd10'
      })
    );
    assert.equal(response.status, 200);
    assert.equal(tasks.data['work_blocks/a'], undefined);
    const queue = parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH)?.content ?? '[]');
    const entry = findPendingActionById(queue, 'act_sd10');
    assert.ok(!entry || !isPendingActionExecutable(entry));
  });

  it('SD11 consumed replay fails closed without duplicate write', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd11', [workBlockWrite('a')])])
    });
    const tasks = memoryStore();
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const first = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd11',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '10:00' }]
      })
    );
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(tasks.data['work_blocks/a']?.start_time, '10:00');
    const replay = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd11',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '14:00' }]
      })
    );
    assert.ok(replay.status === 409 || replay.status === 400 || replay.status === 404);
    assert.equal(tasks.data['work_blocks/a']?.start_time, '10:00');
  });
});

describe('SD13 authoritative schedule read failure fails closed (LEVEL 4)', () => {
  it('Teaching/Tasks schedule read throw → 503 schedule_validation_unavailable; retry succeeds', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd13', [workBlockWrite('a')])])
    });
    const tasks = memoryStore({
      'meta/planning_profile': planningProfile()
    });
    const teachingOk = memoryStore({
      'scheduled_lessons/lesson_y10': {
        id: 'lesson_y10',
        title: 'Year 10 English',
        date: DAY,
        start_time: '11:00',
        duration_minutes: 60
      }
    });
    const teachingFail = failingListStore(teachingOk);
    const confirmFail = confirmHandler({ github, tasks, teaching: teachingFail });
    const blocked = await confirmFail(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd13',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '13:00' }]
      })
    );
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 503);
    assert.equal(blockedBody.error?.code, 'schedule_validation_unavailable');
    assert.equal(blockedBody.error?.retryable, true);
    assert.equal(tasks.data['work_blocks/a'], undefined);
    const pendingAfter = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd13'
    );
    assert.equal(getPendingActionStatus(pendingAfter), 'pending');
    assert.equal(isPendingActionExecutable(pendingAfter), true);

    const confirmOk = confirmHandler({ github, tasks, teaching: teachingOk });
    const ok = await confirmOk(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd13',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '13:00' }]
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(tasks.data['work_blocks/a']?.start_time, '13:00');
  });
});

describe('SD14/SD15 real card receives authoritative hard-busy from compose payload (LEVEL 2)', () => {
  it('SD14 Year 10 English hard busy via compose→card payload (not injected)', async () => {
    withDom();
    const confirms = [];
    const { result } = await composeFixture({
      lessons: [{
        id: 'lesson_y10',
        title: 'Year 10 English',
        date: DAY,
        start_time: '11:00',
        duration_minutes: 60
      }],
      planning_profile: planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] }
      })
    });
    assert.equal(result.kind, 'propose');
    assert.ok(Array.isArray(result.hardBusy));
    assert.ok(result.hardBusy.some((span) => /Year 10 English/i.test(span.title)));

    const cardEvent = buildProductivityCardEvent('compose_schedule', result, { pendingId: 'act_sd14' });
    assert.equal(cardEvent?.card_type, 'schedule-diff');
    assert.ok(Array.isArray(cardEvent.payload.hardBusy));
    assert.ok(cardEvent.payload.hardBusy.some((span) => /Year 10 English/i.test(span.title)));

    const built = createScheduleDiffCard(document, {
      pendingId: cardEvent.payload.pendingId,
      blocks: cardEvent.payload.blocks,
      hardBusy: cardEvent.payload.hardBusy,
      workday: cardEvent.payload.workday,
      onConfirm: () => confirms.push('confirm')
    });
    document.body.append(built.card);
    const path = built.getBlocks()[0].id;
    assert.equal(built.moveBlockForTest(path, '11:15'), true);
    const invalid = built.getBlocks()[0];
    assert.equal(invalid.invalid, true);
    assert.match(String(invalid.invalidReason || ''), /Year 10 English/i);
    const confirmBtn = [...built.card.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Confirm Selected'
    );
    assert.equal(confirmBtn?.disabled, true);
    assert.deepEqual(confirms, []);

    assert.equal(built.moveBlockForTest(path, '13:00'), true);
    assert.equal(built.getBlocks()[0].invalid, false);
    assert.equal(confirmBtn?.disabled, false);
  });

  it('SD15 protected Pickup via compose→card payload (not injected)', async () => {
    withDom();
    const { result } = await composeFixture({
      planning_profile: planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] },
        protected_windows: {
          tue: [{ start: '15:00', end: '16:30', label: 'Pickup' }]
        }
      }),
      task: {
        id: 'task_a',
        title: 'Admin batch',
        status: 'open',
        estimated_duration: 45,
        depth: 'admin'
      }
    });
    assert.equal(result.kind, 'propose');
    assert.ok(result.hardBusy.some((span) => /Pickup/i.test(span.title)));

    const cardEvent = buildProductivityCardEvent('compose_schedule', result, { pendingId: 'act_sd15' });
    const built = createScheduleDiffCard(document, {
      pendingId: cardEvent.payload.pendingId,
      blocks: cardEvent.payload.blocks,
      hardBusy: cardEvent.payload.hardBusy,
      workday: cardEvent.payload.workday
    });
    document.body.append(built.card);
    const path = built.getBlocks()[0].id;
    assert.equal(built.moveBlockForTest(path, '15:00'), true);
    const invalid = built.getBlocks()[0];
    assert.equal(invalid.invalid, true);
    assert.match(String(invalid.invalidReason || ''), /Pickup/i);
  });
});

describe('SD16–SD18 planning profile workday (LEVEL 3/4)', () => {
  it('SD16 compose uses stored Tuesday work window 09:30–15:30', async () => {
    const profile = planningProfile({
      work_windows: { tue: [{ start: '09:30', end: '15:30' }] }
    });
    const { result } = await composeFixture({
      planning_profile: profile,
      input: { date: DAY, task_ids: ['task_a'] }
    });
    assert.equal(result.kind, 'propose');
    const resolved = workdayForDate(DAY, profile);
    assert.equal(resolved.start, '09:30');
    assert.equal(resolved.end, '15:30');
    assert.equal(resolved.source, 'planning_profile');
    assert.equal(result.workday?.start, '09:30');
    assert.equal(result.workday?.end, '15:30');
    assert.equal(result.workday?.source, 'planning_profile');
    for (const block of result.proposed || []) {
      const start = minutesOfTime(block.start_time);
      const end = start + (Number(block.duration_minutes) || 0);
      assert.ok(start >= minutesOfTime('09:30'), `start ${block.start_time}`);
      assert.ok(end <= minutesOfTime('15:30'), `end beyond workday for ${block.start_time}`);
    }
  });

  it('SD17 Confirm enforces current profile workday (08:15 rejected, in-window ok)', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd17', [workBlockWrite('a')])])
    });
    const tasks = memoryStore({
      'meta/planning_profile': planningProfile({
        work_windows: { tue: [{ start: '09:30', end: '15:30' }] }
      })
    });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const early = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd17',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '08:15' }]
      })
    );
    const earlyBody = await early.json();
    assert.equal(early.status, 409);
    assert.equal(earlyBody.error, 'stale_schedule_collision');
    assert.equal(tasks.data['work_blocks/a'], undefined);
    const pending = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd17'
    );
    assert.equal(isPendingActionExecutable(pending), true);

    const ok = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd17',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '10:00' }]
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(tasks.data['work_blocks/a']?.start_time, '10:00');
  });

  it('SD18 profile change after proposal invalidates Confirm at 09:00', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd18', [workBlockWrite('a', { start_time: '09:00' })])
      ])
    });
    const tasks = memoryStore({
      'meta/planning_profile': planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] }
      })
    });
    const teaching = memoryStore();
    // Proposal-time window would have allowed 09:00; Confirm-time profile does not.
    tasks.data['meta/planning_profile'] = planningProfile({
      work_windows: { tue: [{ start: '10:00', end: '15:00' }] }
    });
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd18',
        accept: ['tasks:work_block:a'],
        schedule_overrides: [{ path: 'tasks:work_block:a', start_time: '09:00' }]
      })
    );
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, 'stale_schedule_collision');
    assert.equal(tasks.data['work_blocks/a'], undefined);
    assert.equal(
      isPendingActionExecutable(
        findPendingActionById(
          parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
          'act_sd18'
        )
      ),
      true
    );
  });
});

describe('SD19 real chat → queue → SSE Schedule Diff identity (LEVEL 4)', () => {
  it('createChatHandler compose_schedule persists pending and matches card id', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 60,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] }
      })
    });
    const teaching = memoryStore();
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd19_compose',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(
        chatRequest({
          message: 'Compose Tuesday schedule for Mark Year 10 using compose_schedule.',
          priorAgentSlug: 'clare',
          agentKernel: true
        })
      )
    );
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    const cardEvent = events.find(
      (event) => event.type === 'productivity_card' && event.card_type === 'schedule-diff'
    );
    assert.ok(proposalEvent, 'missing action_proposal SSE');
    assert.ok(typeof proposalEvent.id === 'string' && proposalEvent.id.trim(), 'empty pending id');
    assert.ok(cardEvent, 'missing schedule-diff card');
    assert.equal(cardEvent.payload?.pendingId, proposalEvent.id);

    const queueRaw = github.blobs.get(PENDING_ACTIONS_PATH)?.content;
    assert.ok(queueRaw, 'PENDING_ACTIONS_PATH missing');
    const entry = findPendingActionById(parsePendingActions(queueRaw), proposalEvent.id);
    assert.ok(entry, 'pending id not in queue');
    assert.equal(isPendingActionExecutable(entry), true);
    const writes = entry.proposal?.writes || [];
    assert.ok(writes.length >= 1);
    const blocks = cardEvent.payload.blocks || [];
    assert.ok(blocks.length >= 1);
    for (const block of blocks) {
      const path = block.write_path || block.id;
      assert.ok(writes.some((write) => write.path === path), `ghost ${path} missing from proposal writes`);
    }
  });
});

describe('SD20 ghost cleanup after Confirm/Discard (LEVEL 4 controller seam)', () => {
  it('Confirm persists work block; Discard writes nothing (ghost overlay cleared by controller)', async () => {
    // Controller clears via clearCalendarGhostBlocksForProposal after Confirm/Discard
    // (apps/tasks confirm-proposal-binding SD20). Here prove the durable side.
    const githubConfirm = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd20_c', [workBlockWrite('c')])])
    });
    const tasksConfirm = memoryStore({ 'meta/planning_profile': planningProfile() });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github: githubConfirm, tasks: tasksConfirm, teaching });
    const ok = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd20_c',
        accept: ['tasks:work_block:c'],
        schedule_overrides: [{ path: 'tasks:work_block:c', start_time: '10:00' }]
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(tasksConfirm.data['work_blocks/c']?.start_time, '10:00');

    const githubDiscard = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd20_d', [workBlockWrite('d')])])
    });
    const tasksDiscard = memoryStore({ 'meta/planning_profile': planningProfile() });
    const discard = confirmHandler({ github: githubDiscard, tasks: tasksDiscard, teaching });
    const gone = await discard(
      confirmRequest({
        kind: 'action_dismiss',
        slug: 'clare',
        id: 'act_sd20_d'
      })
    );
    assert.equal(gone.status, 200);
    assert.equal(tasksDiscard.data['work_blocks/d'], undefined);
  });
});

describe('SD21/SD22 durable confirmed status (LEVEL 4)', () => {
  it('SD21 Confirm promotes work block status proposed → confirmed', async () => {
    const write = workBlockWrite('sd21', { start_time: '10:00' });
    const before = JSON.parse(write.content);
    assert.equal(before.status, 'proposed');
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd21', [write])])
    });
    const tasks = memoryStore({ 'meta/planning_profile': planningProfile() });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd21',
        accept: ['tasks:work_block:sd21'],
        schedule_overrides: [{ path: 'tasks:work_block:sd21', start_time: '10:00' }]
      })
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(tasks.data['work_blocks/sd21']?.status, 'confirmed');
    assert.notEqual(tasks.data['work_blocks/sd21']?.status, 'proposed');
    const entry = findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      'act_sd21'
    );
    assert.equal(getPendingActionStatus(entry), 'consumed');
  });

  it('SD22 confirmed block is hard busy for a later Confirm', async () => {
    const githubA = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd22a', [workBlockWrite('a22', { start_time: '10:00', title: 'Block A' })])
      ])
    });
    const tasks = memoryStore({ 'meta/planning_profile': planningProfile() });
    const teaching = memoryStore();
    const confirmA = confirmHandler({ github: githubA, tasks, teaching });
    const first = await confirmA(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd22a',
        accept: ['tasks:work_block:a22'],
        schedule_overrides: [{ path: 'tasks:work_block:a22', start_time: '10:00' }]
      })
    );
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(tasks.data['work_blocks/a22']?.status, 'confirmed');

    const hardBusy = buildAuthoritativeHardBusy({
      date: DAY,
      lessons: [],
      workBlocks: [tasks.data['work_blocks/a22']],
      planningProfile: planningProfile()
    });
    assert.ok(hardBusy.some((span) => span.kind === 'locked' && /Block A/i.test(span.title)));

    const githubB = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd22b', [workBlockWrite('b22', { start_time: '09:00', title: 'Block B' })])
      ])
    });
    const confirmB = confirmHandler({ github: githubB, tasks, teaching });
    const blocked = await confirmB(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd22b',
        accept: ['tasks:work_block:b22'],
        schedule_overrides: [{ path: 'tasks:work_block:b22', start_time: '10:15' }]
      })
    );
    const body = await blocked.json();
    assert.equal(blocked.status, 409);
    assert.equal(body.error, 'stale_schedule_collision');
    assert.equal(tasks.data['work_blocks/b22'], undefined);
    assert.equal(
      isPendingActionExecutable(
        findPendingActionById(
          parsePendingActions(githubB.blobs.get(PENDING_ACTIONS_PATH).content),
          'act_sd22b'
        )
      ),
      true
    );
  });
});

describe('SD23–SD26 schedule_diff workflow lifecycle (LEVEL 2/4)', () => {
  it('SD23 Confirm reconciles persisted workflow with pending identity', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 60,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd23',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(
        chatRequest({
          message: 'Compose Tuesday schedule.',
          priorAgentSlug: 'clare',
          agentKernel: true
        })
      )
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const wfBefore = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfBefore?.status, 'awaiting_confirm');
    assert.equal(wfBefore?.pending_action_id, proposalEvent.id);
    assert.ok(Array.isArray(wfBefore?.proposed) && wfBefore.proposed.length >= 1);

    const paths = (wfBefore.proposed || []).map((b) => b.write_path || b.id);
    const confirm = confirmHandler({ github, tasks, teaching });
    const ok = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: proposalEvent.id,
        accept: paths
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    const wfAfter = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfAfter?.status, 'confirmed');
    assert.equal(wfAfter?.pending_action_id, proposalEvent.id);
    assert.deepEqual(scheduleDiffActiveProposed(wfAfter), []);
    const durable = Object.values(tasks.data).find(
      (v) => v && typeof v === 'object' && v.status === 'confirmed' && v.source === 'clare'
    );
    assert.ok(durable, 'durable confirmed work block missing');
  });

  it('SD24 Discard reconciles persisted workflow', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd24',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(
        chatRequest({
          message: 'Compose Tuesday schedule for discard.',
          priorAgentSlug: 'clare',
          agentKernel: true
        })
      )
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const confirm = confirmHandler({ github, tasks, teaching });
    const gone = await confirm(
      confirmRequest({
        kind: 'action_dismiss',
        slug: 'clare',
        id: proposalEvent.id
      })
    );
    assert.equal(gone.status, 200);
    assert.equal(
      Object.keys(tasks.data).some((k) => k.startsWith('work_blocks/')),
      false
    );
    const wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wf?.status, 'discarded');
    assert.equal(wf?.pending_action_id, proposalEvent.id);
    assert.deepEqual(scheduleDiffActiveProposed(wf), []);
  });

  it('SD25 confirming old A does not terminate newer workflow B', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    let round = 0;
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          round += 1;
          await args.executeTools({
            id: `call_sd25_${round}`,
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const eventsA = await readSse(
      await chat(chatRequest({ message: 'Compose A', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const idA = eventsA.find((e) => e.type === 'action_proposal')?.id;
    assert.ok(idA);
    const eventsB = await readSse(
      await chat(chatRequest({ message: 'Compose B', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const idB = eventsB.find((e) => e.type === 'action_proposal')?.id;
    assert.ok(idB);
    assert.notEqual(idA, idB);
    const wfB = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfB?.pending_action_id, idB);
    assert.equal(wfB?.status, 'awaiting_confirm');

    const pathsA = (parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content)
      .find((e) => e.id === idA)?.proposal?.writes || []).map((w) => w.path);
    const confirm = confirmHandler({ github, tasks, teaching });
    const ok = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: idA,
        accept: pathsA
      })
    );
    assert.equal(ok.status, 200, await ok.clone().text());
    const wfAfter = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfAfter?.status, 'awaiting_confirm');
    assert.equal(wfAfter?.pending_action_id, idB);
    assert.ok(scheduleDiffActiveProposed(wfAfter).length >= 1);
  });

  it('SD26 Life Hub reload does not resurrect terminal ghosts', () => {
    assert.deepEqual(
      scheduleDiffActiveProposed({
        status: 'confirmed',
        proposed: [{ id: 'tasks:work_block:x', title: 'X', date: DAY, start_time: '10:00' }]
      }),
      []
    );
    assert.deepEqual(
      scheduleDiffActiveProposed({
        status: 'discarded',
        proposed: [{ id: 'tasks:work_block:y', title: 'Y', date: DAY, start_time: '11:00' }]
      }),
      []
    );
    const active = scheduleDiffActiveProposed({
      status: 'awaiting_confirm',
      pending_action_id: 'act_live',
      proposed: [{ id: 'tasks:work_block:z', title: 'Z', date: DAY, start_time: '12:00' }]
    });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, 'tasks:work_block:z');
  });
});

describe('SD27–SD29 multiple work windows (LEVEL 2/3/4)', () => {
  const splitProfile = planningProfile({
    work_windows: {
      tue: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' }
      ]
    }
  });

  it('SD27 compose respects midday gap between windows', async () => {
    const gaps = workWindowGapSpans(DAY, splitProfile);
    assert.ok(gaps.some((g) => g.start === 12 * 60 && g.end === 13 * 60));
    const { result } = await composeFixture({
      planning_profile: splitProfile,
      task: {
        id: 'task_a',
        title: 'Midday work',
        status: 'open',
        estimated_duration: 60,
        depth: 'shallow'
      }
    });
    assert.equal(result.kind, 'propose');
    assert.ok(result.hardBusy.some((s) => s.kind === 'outside_work_window'));
    for (const block of result.proposed || []) {
      const start = minutesOfTime(block.start_time);
      const end = start + (Number(block.duration_minutes) || 0);
      assert.ok(!(start < 13 * 60 && end > 12 * 60), `block overlaps gap: ${block.start_time}`);
    }
  });

  it('SD28 client move into work-window gap is invalid', async () => {
    withDom();
    const { result } = await composeFixture({
      planning_profile: splitProfile,
      task: {
        id: 'task_a',
        title: 'Gap probe',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      }
    });
    const cardEvent = buildProductivityCardEvent('compose_schedule', result, { pendingId: 'act_sd28' });
    assert.ok(cardEvent.payload.hardBusy.some((s) => s.kind === 'outside_work_window'));
    const built = createScheduleDiffCard(document, {
      pendingId: cardEvent.payload.pendingId,
      blocks: cardEvent.payload.blocks,
      hardBusy: cardEvent.payload.hardBusy,
      workday: cardEvent.payload.workday
    });
    document.body.append(built.card);
    const path = built.getBlocks()[0].id;
    assert.equal(built.moveBlockForTest(path, '12:15'), true);
    const invalid = built.getBlocks()[0];
    assert.equal(invalid.invalid, true);
    assert.match(String(invalid.invalidReason || ''), /Outside work window|work window|unavailable/i);
    const confirmBtn = [...built.card.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Confirm Selected'
    );
    assert.equal(confirmBtn?.disabled, true);
  });

  it('SD29 server rejects crafted gap override', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([pendingEntry('act_sd29', [workBlockWrite('g')])])
    });
    const tasks = memoryStore({ 'meta/planning_profile': splitProfile });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const blocked = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd29',
        accept: ['tasks:work_block:g'],
        schedule_overrides: [{ path: 'tasks:work_block:g', start_time: '12:15' }]
      })
    );
    assert.equal(blocked.status, 409);
    assert.equal(tasks.data['work_blocks/g'], undefined);
    assert.equal(
      isPendingActionExecutable(
        findPendingActionById(
          parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
          'act_sd29'
        )
      ),
      true
    );
  });
});

describe('SD30 explicit one-off protected windows (LEVEL 3/4)', () => {
  it('compose hardBusy includes Dentist travel; Confirm rejects 14:15', async () => {
    const dentist = [{ start: '14:00', end: '14:45', label: 'Dentist travel' }];
    const { result } = await composeFixture({
      planning_profile: planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] }
      }),
      input: { date: DAY, task_ids: ['task_a'], protected_windows: dentist }
    });
    assert.equal(result.kind, 'propose');
    assert.ok(result.hardBusy.some((s) => /Dentist travel/i.test(s.title)));
    for (const block of result.proposed || []) {
      const start = minutesOfTime(block.start_time);
      const end = start + (Number(block.duration_minutes) || 0);
      assert.ok(!(start < 14 * 60 + 45 && end > 14 * 60), 'composed over dentist');
    }

    const write = workBlockWrite('dent', { start_time: '09:00' });
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd30', [write], {
          scheduleContext: {
            date: DAY,
            protected_windows: result.schedule_context.protected_windows
          }
        })
      ])
    });
    const tasks = memoryStore({
      'meta/planning_profile': planningProfile({
        work_windows: { tue: [{ start: '08:00', end: '16:30' }] }
      })
    });
    const teaching = memoryStore();
    const confirm = confirmHandler({ github, tasks, teaching });
    const blocked = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd30',
        accept: ['tasks:work_block:dent'],
        schedule_overrides: [{ path: 'tasks:work_block:dent', start_time: '14:15' }]
      })
    );
    assert.equal(blocked.status, 409);
    assert.equal(tasks.data['work_blocks/dent'], undefined);
  });
});

describe('SD31/SD32 Life calendar events (LEVEL 3/4)', () => {
  it('SD31 Life Doctor event blocks compose and appears in hardBusy', async () => {
    const doctor = {
      type: 'medical',
      title: 'Doctor',
      date: DAY,
      time: '13:00',
      duration_minutes: 60
    };
    const { result } = await composeFixture({
      planning_profile: planningProfile(),
      task: {
        id: 'task_a',
        title: 'Mark essays',
        status: 'open',
        estimated_duration: 60,
        depth: 'shallow'
      }
    });
    // Re-compose with life events via executeClareWork ctx
    const saved = new Map();
    const withDoctor = await executeClareWork(
      'compose_schedule',
      { date: DAY, task_ids: ['task_a'] },
      {
        now: new Date(`${DAY}T08:00:00Z`),
        tasks: [{
          id: 'task_a',
          title: 'Mark essays',
          status: 'open',
          estimated_duration: 60,
          depth: 'shallow'
        }],
        projects: [],
        lessons: [],
        workBlocks: [],
        planning_profile: planningProfile(),
        lifeEvents: [doctor],
        tasksStore: {
          async get(key) {
            return saved.has(key) ? saved.get(key) : null;
          },
          async setJSON(key, value) {
            saved.set(key, value);
          },
          async set(key, value) {
            saved.set(key, typeof value === 'string' ? JSON.parse(value) : value);
          }
        }
      }
    );
    assert.equal(withDoctor.kind, 'propose');
    assert.ok(withDoctor.hardBusy.some((s) => /Doctor/i.test(s.title) && s.kind === 'life_event'));
    for (const block of withDoctor.proposed || []) {
      const start = minutesOfTime(block.start_time);
      const end = start + (Number(block.duration_minutes) || 0);
      assert.ok(!(start < 14 * 60 && end > 13 * 60), `overlaps Doctor: ${block.start_time}`);
    }
    void result;
  });

  it('SD32 new Life event after proposal invalidates Confirm', async () => {
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd32', [workBlockWrite('life32', { start_time: '13:15' })])
      ])
    });
    const tasks = memoryStore({ 'meta/planning_profile': planningProfile() });
    const teaching = memoryStore();
    let lifeEvents = [];
    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: () => NOW_MS,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      getLifeEvents: async () => lifeEvents
    });
    // Proposal-time free; then Doctor appears before Confirm.
    lifeEvents = [{
      type: 'medical',
      title: 'Doctor',
      date: DAY,
      time: '13:00',
      duration_minutes: 60
    }];
    const blocked = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd32',
        accept: ['tasks:work_block:life32'],
        schedule_overrides: [{ path: 'tasks:work_block:life32', start_time: '13:15' }]
      })
    );
    const body = await blocked.json();
    assert.equal(blocked.status, 409);
    assert.equal(body.error, 'stale_schedule_collision');
    assert.equal(tasks.data['work_blocks/life32'], undefined);
    assert.equal(
      isPendingActionExecutable(
        findPendingActionById(
          parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
          'act_sd32'
        )
      ),
      true
    );
  });
});

function lifeEventMarkdown({
  type = 'medical',
  title = 'Doctor',
  date = DAY,
  time = '13:00',
  duration_minutes = 60
} = {}) {
  return [
    '---',
    'schema_version: 1',
    `type: ${type}`,
    `title: ${title}`,
    `date: ${date}`,
    `time: "${time}"`,
    `duration_minutes: ${duration_minutes}`,
    '---',
    '',
    title
  ].join('\n');
}

function diaryMarkdown({ date = DAY, title = 'Journal' } = {}) {
  return [
    '---',
    'schema_version: 1',
    'type: diary',
    `title: ${title}`,
    `date: ${date}`,
    '---',
    '',
    'No timed commitment.'
  ].join('\n');
}

describe('SD33/SD34 queue failure and ghost gate (LEVEL 2/4)', () => {
  it('SD33 queue write failure leaves preparing / no active ghosts', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const fetchImpl = async (url, options) => {
      if (
        options?.method === 'PUT'
        && decodeURIComponent(url.split('/contents/')[1] ?? '') === PENDING_ACTIONS_PATH
      ) {
        return Response.json({ message: 'queue write failed' }, { status: 500 });
      }
      return github.fetchImpl(url, options);
    };
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd33',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({ message: 'Compose Tuesday', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(!proposalEvent?.id, 'must not emit durable pending id');
    const cardEvent = events.find(
      (e) => e.type === 'productivity_card' && e.card_type === 'schedule-diff'
    );
    assert.equal(cardEvent, undefined, 'no schedule-diff card without pending id');
    assert.equal(github.blobs.has(PENDING_ACTIONS_PATH), false);
    const wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.ok(wf);
    assert.notEqual(wf.status, 'awaiting_confirm');
    assert.equal(wf.pending_action_id, null);
    assert.ok(wf.status === 'preparing' || !wf.pending_action_id);
    assert.deepEqual(scheduleDiffActiveProposed(wf), []);
    assert.equal(Object.keys(tasks.data).some((k) => k.startsWith('work_blocks/')), false);
  });

  it('SD34 awaiting_confirm requires real pending id', () => {
    assert.deepEqual(
      scheduleDiffActiveProposed({
        status: 'awaiting_confirm',
        pending_action_id: null,
        proposed: [{ id: 'tasks:work_block:x', title: 'X', date: DAY, start_time: '10:00' }]
      }),
      []
    );
    assert.deepEqual(
      scheduleDiffActiveProposed({
        status: 'preparing',
        pending_action_id: null,
        proposed: [{ id: 'tasks:work_block:x', title: 'X', date: DAY, start_time: '10:00' }]
      }),
      []
    );
    const ghosts = scheduleDiffActiveProposed({
      status: 'awaiting_confirm',
      pending_action_id: 'act_real',
      proposed: [{ id: 'tasks:work_block:x', title: 'X', date: DAY, start_time: '10:00' }]
    });
    assert.equal(ghosts.length, 1);
  });
});

describe('SD35–SD38 terminal workflow failure + recovery (LEVEL 4)', () => {
  async function proposeScheduleViaChat(tasks, github, teaching, label = 'sd') {
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: `call_${label}`,
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({ message: `Compose ${label}`, priorAgentSlug: 'clare', agentKernel: true }))
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    return proposalEvent.id;
  }

  it('SD35 Confirm workflow terminal save failure then reconcile', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const idA = await proposeScheduleViaChat(tasks, github, teaching, 'sd35');
    const paths = (await loadWorkflowState(tasks, 'schedule_diff:current'))?.proposed
      ?.map((b) => b.write_path || b.id) || [];

    const originalSetJSON = tasks.setJSON.bind(tasks);
    let blockConfirmed = true;
    tasks.setJSON = async (key, value) => {
      if (
        blockConfirmed
        && String(key).includes('schedule_diff:current')
        && value
        && value.status === 'confirmed'
      ) {
        throw new Error('confirmed persist failed');
      }
      return originalSetJSON(key, value);
    };

    const confirm = confirmHandler({ github, tasks, teaching });
    const failed = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: paths })
    );
    const failedBody = await failed.json();
    assert.equal(failed.status, 503);
    assert.equal(failedBody.error?.code, 'schedule_diff_completion_pending');
    assert.equal(failedBody.data?.writesApplied, true);
    assert.equal(failedBody.data?.pendingActionStatus, 'consumed');
    assert.equal(getPendingActionStatus(findPendingActionById(
      parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
      idA
    )), 'consumed');
    const blocks = Object.values(tasks.data).filter(
      (v) => v && typeof v === 'object' && v.source === 'clare' && v.status === 'confirmed'
    );
    assert.equal(blocks.length, 1);
    let wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.notEqual(wf?.status, 'confirmed');
    assert.equal(wf?.pending_action_status, 'consumed');

    blockConfirmed = false;
    const retry = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: paths })
    );
    assert.equal(retry.status, 409);
    const retryBody = await retry.json();
    assert.equal(retryBody.error?.code, 'pending_action_consumed');
    wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wf?.status, 'confirmed');
    assert.deepEqual(scheduleDiffActiveProposed(wf), []);
    assert.equal(
      Object.values(tasks.data).filter(
        (v) => v && typeof v === 'object' && v.source === 'clare' && v.status === 'confirmed'
      ).length,
      1
    );
  });

  it('SD36 lost-response retry does not duplicate work blocks', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const idA = await proposeScheduleViaChat(tasks, github, teaching, 'sd36');
    const paths = (await loadWorkflowState(tasks, 'schedule_diff:current'))?.proposed
      ?.map((b) => b.write_path || b.id) || [];
    const confirm = confirmHandler({ github, tasks, teaching });
    const first = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: paths })
    );
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal((await loadWorkflowState(tasks, 'schedule_diff:current'))?.status, 'confirmed');
    const second = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: paths })
    );
    const secondBody = await second.json();
    assert.equal(second.status, 409);
    assert.equal(secondBody.error?.code, 'pending_action_consumed');
    assert.equal(
      Object.values(tasks.data).filter(
        (v) => v && typeof v === 'object' && v.source === 'clare' && v.status === 'confirmed'
      ).length,
      1
    );
    assert.equal((await loadWorkflowState(tasks, 'schedule_diff:current'))?.status, 'confirmed');
  });

  it('SD37 Discard workflow save failure then reconcile', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const idB = await proposeScheduleViaChat(tasks, github, teaching, 'sd37');

    const originalSetJSON = tasks.setJSON.bind(tasks);
    let blockDiscarded = true;
    tasks.setJSON = async (key, value) => {
      if (
        blockDiscarded
        && String(key).includes('schedule_diff:current')
        && value
        && value.status === 'discarded'
      ) {
        throw new Error('discarded persist failed');
      }
      return originalSetJSON(key, value);
    };

    const confirm = confirmHandler({ github, tasks, teaching });
    const failed = await confirm(
      confirmRequest({ kind: 'action_dismiss', slug: 'clare', id: idB })
    );
    const failedBody = await failed.json();
    assert.equal(failed.status, 503);
    assert.equal(failedBody.error?.code, 'schedule_diff_discard_pending');
    assert.equal(failedBody.data?.writesApplied, false);
    assert.equal(Object.keys(tasks.data).some((k) => k.startsWith('work_blocks/')), false);
    assert.equal(
      findPendingActionById(parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content), idB),
      null
    );
    let wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.notEqual(wf?.status, 'discarded');
    assert.equal(wf?.pending_action_status, 'dismissed');

    blockDiscarded = false;
    const healed = await reconcileScheduleDiffIfPendingDismissed(tasks, {
      pendingActionId: idB,
      stamp: new Date(NOW_MS).toISOString()
    });
    assert.equal(healed?.status, 'discarded');
    wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wf?.status, 'discarded');
    assert.deepEqual(scheduleDiffActiveProposed(wf), []);
    // Retry Confirm must not execute — id is gone from queue.
    const replay = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: idB,
        accept: ['tasks:work_block:nope']
      })
    );
    assert.equal(replay.status, 404);
    assert.equal(Object.keys(tasks.data).some((k) => k.startsWith('work_blocks/')), false);
  });

  it('SD38 old terminal recovery cannot touch newer workflow B', async () => {
    const github = statefulGithub({});
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const idA = await proposeScheduleViaChat(tasks, github, teaching, 'sd38a');
    const pathsA = (await loadWorkflowState(tasks, 'schedule_diff:current'))?.proposed
      ?.map((b) => b.write_path || b.id) || [];

    const originalSetJSON = tasks.setJSON.bind(tasks);
    let blockConfirmed = true;
    tasks.setJSON = async (key, value) => {
      if (
        blockConfirmed
        && String(key).includes('schedule_diff:current')
        && value
        && value.status === 'confirmed'
      ) {
        throw new Error('confirmed persist failed');
      }
      return originalSetJSON(key, value);
    };
    const confirm = confirmHandler({ github, tasks, teaching });
    const failed = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: pathsA })
    );
    assert.equal(failed.status, 503);

    blockConfirmed = false;
    const idB = await proposeScheduleViaChat(tasks, github, teaching, 'sd38b');
    assert.notEqual(idA, idB);
    const wfB = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfB?.status, 'awaiting_confirm');
    assert.equal(wfB?.pending_action_id, idB);
    assert.ok(scheduleDiffActiveProposed(wfB).length >= 1);

    const reconciled = await reconcileScheduleDiffIfPendingConsumed(tasks, {
      pendingActionId: idA,
      queueEvidenceConsumed: true,
      stamp: new Date(NOW_MS).toISOString()
    });
    assert.equal(reconciled?.pending_action_id, idB);
    assert.equal(reconciled?.status, 'awaiting_confirm');
    const retry = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: idA, accept: pathsA })
    );
    assert.equal(retry.status, 409);
    const wfAfter = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wfAfter?.status, 'awaiting_confirm');
    assert.equal(wfAfter?.pending_action_id, idB);
    assert.ok(scheduleDiffActiveProposed(wfAfter).length >= 1);
  });
});

describe('SD39–SD41 Life event source integrity (LEVEL 3/4)', () => {
  const doctorPath = `data/body/2026/09/${DAY}-doctor.md`;
  const diaryPath = `data/mind/2026/09/${DAY}-journal.md`;

  it('SD39 default Life event read failure blocks Confirm', async () => {
    const doctorSha = sha40(77);
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: serializePendingActions([
        pendingEntry('act_sd39', [workBlockWrite('life39', { start_time: '13:15' })])
      ]),
      [doctorPath]: lifeEventMarkdown()
    });
    // Pin known sha for doctor blob so we can fail that read specifically.
    github.blobs.set(doctorPath, { sha: doctorSha, content: lifeEventMarkdown() });
    const tasks = memoryStore({ 'meta/planning_profile': planningProfile() });
    const teaching = memoryStore();
    const fetchImpl = async (url, options) => {
      if (!options?.method && url.includes(`/git/blobs/${doctorSha}`)) {
        return Response.json({ message: 'blob read failed' }, { status: 500 });
      }
      return github.fetchImpl(url, options);
    };
    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl,
      now: () => NOW_MS,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching
      // default Life loader — no getLifeEvents injection
    });
    const blocked = await confirm(
      confirmRequest({
        kind: 'action',
        slug: 'clare',
        id: 'act_sd39',
        accept: ['tasks:work_block:life39'],
        schedule_overrides: [{ path: 'tasks:work_block:life39', start_time: '13:15' }]
      })
    );
    const body = await blocked.json();
    assert.equal(blocked.status, 503);
    assert.equal(body.error?.code || body.error, 'schedule_validation_unavailable');
    assert.equal(tasks.data['work_blocks/life39'], undefined);
    assert.equal(
      isPendingActionExecutable(
        findPendingActionById(
          parsePendingActions(github.blobs.get(PENDING_ACTIONS_PATH).content),
          'act_sd39'
        )
      ),
      true
    );
  });

  it('SD40 Life event read failure blocks compose', async () => {
    const doctorSha = sha40(88);
    const github = statefulGithub({
      [doctorPath]: lifeEventMarkdown()
    });
    github.blobs.set(doctorPath, { sha: doctorSha, content: lifeEventMarkdown() });
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const fetchImpl = async (url, options) => {
      if (!options?.method && url.includes(`/git/blobs/${doctorSha}`)) {
        return Response.json({ message: 'blob read failed' }, { status: 500 });
      }
      return github.fetchImpl(url, options);
    };
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd40',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({ message: 'Compose Tuesday', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(!proposalEvent?.id);
    assert.equal(
      events.find((e) => e.type === 'productivity_card' && e.card_type === 'schedule-diff'),
      undefined
    );
    assert.equal(github.blobs.has(PENDING_ACTIONS_PATH), false);
    const wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.deepEqual(scheduleDiffActiveProposed(wf), []);
    assert.ok(!wf || wf.status !== 'awaiting_confirm' || !wf.pending_action_id);
  });

  it('SD41 irrelevant Life diary record skips safely', async () => {
    const github = statefulGithub({
      [diaryPath]: diaryMarkdown()
    });
    const tasks = memoryStore({
      'tasks/task_a': {
        id: 'task_a',
        title: 'Mark Year 10',
        status: 'open',
        estimated_duration: 45,
        depth: 'shallow'
      },
      'meta/planning_profile': planningProfile()
    });
    const teaching = memoryStore();
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_sd41',
            name: 'compose_schedule',
            input: { date: DAY, task_ids: ['task_a'] }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({ message: 'Compose Tuesday', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const proposalEvent = events.find((e) => e.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const card = events.find((e) => e.type === 'productivity_card' && e.card_type === 'schedule-diff');
    assert.ok(card);
    const hardBusy = card.payload?.hardBusy || [];
    assert.equal(hardBusy.some((s) => /Journal/i.test(s.title || '')), false);
    const wf = await loadWorkflowState(tasks, 'schedule_diff:current');
    assert.equal(wf?.status, 'awaiting_confirm');
    assert.equal(wf?.pending_action_id, proposalEvent.id);
  });
});

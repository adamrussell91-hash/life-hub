/**
 * Schedule Diff product boundary (SD1–SD11).
 *
 * Evidence levels — do not upgrade by renaming:
 * LEVEL 1 = override helper / hard-busy domain
 * LEVEL 2 = Schedule Diff card move preview (no durable write)
 * LEVEL 4 = pending id → createChatConfirmHandler → work_block persistence / fail-closed
 * LEVEL 5 = live smoke (clare-live-pending-confirm) — not this file
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
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
import { executeClareWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { buildProductivityCardEvent } from '../../netlify/functions/_shared/productivity-card-map.mjs';
import {
  FALLBACK_WORKDAY,
  buildAuthoritativeHardBusy,
  detectStaleScheduleCollisions
} from '../../netlify/functions/_shared/productivity-os.mjs';
import { createScheduleDiffCard } from '../../packages/design-kit/js/agent-productivity-cards.js';

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

function pendingEntry(id, writes) {
  return {
    id,
    createdAt: `${DAY}T12:00:00.000Z`,
    slug: 'clare',
    proposal: {
      capability: 'os.propose-action',
      agent: 'clare',
      intent: 'Compose Tuesday schedule',
      reads: [],
      writes,
      surfaces: ['confirm_card', 'tasks_hub', 'schedule_diff']
    }
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

describe('SD1 compose proposal identity (LEVEL 4 seam)', () => {
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

/**
 * Skills scan source readers. Each kind is read through an injectable lister;
 * a lister that throws (unbound store, Knowledge repo unbound) is skipped and
 * the kind is left out of `read_kinds`, so a silent gap shows on the panel.
 *
 * Privacy: lesson blocks are never read, and quiz activity is a key count
 * only. No student names, scores or markbook rows reach the model.
 */

import { formatEntityRef } from './entity-ref.mjs';
import { withoutDeleted } from './record-liveness.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { normalizeGoalRecord } from './goal-record.mjs';

export const SCAN_WINDOW_CAP_DAYS = 21;
export const SCAN_WEEKLY_SOURCE_CAP = 60;
export const SCAN_TEXT_MAX = 600;
const QUIZ_COUNT_CONCURRENCY = 5;

export function clip(value, max = SCAN_TEXT_MAX) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function textOf(...parts) {
  return clip(parts.filter((p) => typeof p === 'string' && p.trim()).join(' | '));
}

function ms(value) {
  const t = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function dayOf(value) {
  return typeof value === 'string' && value ? value.slice(0, 10) : null;
}

function ref(namespace, kind, id) {
  return formatEntityRef({ namespace, kind, id });
}

/** Default listers, bound to env. Stores are acquired lazily so an unbound store throws inside the reader. */
export function defaultScanListers(deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl;
  const professional = async () => {
    if (!deps.professionalStore) throw new Error('professional_blobs_unbound');
    return deps.professionalStore;
  };
  const tasksStore = async () => {
    if (deps.tasksStore) return deps.tasksStore;
    const get = deps.getTasksStore ?? (await import('./tasks-blobs.mjs')).defaultGetTasksStore;
    return get(env);
  };
  const teachingStore = async () => {
    if (deps.teachingStore) return deps.teachingStore;
    const get = deps.getContentStore ?? (await import('./teaching-blobs.mjs')).defaultGetContentStore;
    return get(env);
  };
  const tasksList = async (prefix) => {
    const { listJSON } = await import('./tasks-blobs.mjs');
    return withoutDeleted(await listJSON(await tasksStore(), prefix));
  };
  const teachingList = async (prefix) => {
    const { listJSON } = await import('./teaching-blobs.mjs');
    return withoutDeleted(await listJSON(await teachingStore(), prefix));
  };
  return {
    async listMeetings() {
      const { createMeetingRepository } = await import('./meeting-repository.mjs');
      return createMeetingRepository({ store: await professional() }).listMeetings();
    },
    async listEvents() {
      const { createEventRepository } = await import('./event-repository.mjs');
      return createEventRepository({ store: await professional(), env }).listEvents();
    },
    async listCommunications() {
      const { createCommunicationRepository } = await import('./communication-repository.mjs');
      return createCommunicationRepository({ store: await professional() }).listCommunications();
    },
    listTasks: () => tasksList('tasks/'),
    listProjects: () => tasksList('projects/'),
    async listGoals() {
      const rows = await tasksList('goals/');
      return rows.map((row) => {
        try {
          return normalizeGoalRecord(row);
        } catch {
          return row;
        }
      });
    },
    listUnits: () => teachingList('units/'),
    listLessons: () => teachingList('lessons/'),
    listScheduledLessons: () => teachingList('scheduled_lessons/'),
    async countQuizResults(lessonId) {
      const keys = await listBlobKeys(await teachingStore(), `quiz/${lessonId}/results/`);
      return keys.length;
    },
    async listKnowledge() {
      const { listKnowledgePages } = await import('./knowledge-data.mjs');
      return listKnowledgePages({ env, ...(fetchImpl ? { fetchImpl } : {}) });
    }
  };
}

function isTaskDone(task) {
  return task.status === 'done' || task.bucket === 'done' || Boolean(task.completed_at);
}

/**
 * Collect sources for a window. Returns { sources, witness_refs, read_kinds }.
 * deps: nowIso, since, until, windowDays (cap, default 21), limit (default 60,
 * Infinity for history), plus the listers above.
 */
export async function collectScanSources(deps = {}) {
  const nowMs = Date.parse(deps.nowIso ?? new Date().toISOString());
  const windowDays = deps.windowDays ?? SCAN_WINDOW_CAP_DAYS;
  const capMs = nowMs - windowDays * 86400000;
  const sinceRaw = deps.since ? Date.parse(deps.since) : NaN;
  const sinceMs = Number.isFinite(sinceRaw) ? Math.max(sinceRaw, capMs) : capMs;
  const untilMs = deps.until ? Date.parse(deps.until) : Infinity;
  const inWindow = (t) => Number.isFinite(t) && t >= sinceMs && t <= untilMs;
  const limit = deps.limit ?? SCAN_WEEKLY_SOURCE_CAP;

  const sources = [];
  const readKinds = new Set();
  const push = (source) => sources.push(source);

  async function read(kind, lister, fn) {
    if (typeof lister !== 'function') return;
    try {
      const rows = await lister();
      fn(Array.isArray(rows) ? rows : []);
      readKinds.add(kind);
    } catch {
      // Reader unavailable: skipped, and left out of read_kinds.
    }
  }

  await read('meeting', deps.listMeetings, (rows) => {
    for (const m of withoutDeleted(rows)) {
      const at = m.occurred_on || m.scheduled_start || m.starts_at || m.updated_at;
      if (!inWindow(ms(at))) continue;
      const body = [m.notes, m.summary].find((v) => typeof v === 'string' && v.trim()) ?? '';
      if (!body) continue;
      push({
        ref: ref('professional', 'meeting', m.id),
        kind: 'meeting',
        title: clip(m.title || 'Meeting', 200),
        date: dayOf(at),
        text: clip(body)
      });
    }
  });

  await read('event', deps.listEvents, (rows) => {
    for (const e of withoutDeleted(rows)) {
      if (e.occurrence_state !== 'completed' || !inWindow(ms(e.start))) continue;
      const talks = Array.isArray(e.talks) ? e.talks.map((t) => t?.title).filter(Boolean).join('; ') : '';
      push({
        ref: ref('professional', 'event', e.id),
        kind: 'event',
        title: clip(e.title || 'Event', 200),
        date: dayOf(e.start),
        text: textOf(e.event_type, e.hours != null ? `${e.hours} hours` : '', talks && `Talks: ${talks}`)
      });
    }
  });

  await read('communication', deps.listCommunications, (rows) => {
    for (const c of withoutDeleted(rows)) {
      if (!inWindow(ms(c.occurred_at))) continue;
      if (typeof c.summary !== 'string' || !c.summary.trim()) continue;
      push({
        ref: ref('professional', 'communication', c.id),
        kind: 'communication',
        title: clip(c.subject || 'Communication', 200),
        date: dayOf(c.occurred_at),
        text: textOf(c.subject, c.summary)
      });
    }
  });

  // Tasks and projects share one list of tasks.
  let tasksPromise = null;
  const tasks = () => (tasksPromise ??= Promise.resolve().then(() => deps.listTasks()));
  if (typeof deps.listTasks === 'function') {
    await read('task', tasks, (rows) => {
      for (const t of withoutDeleted(rows)) {
        if (!isTaskDone(t)) continue;
        const at = t.completed_at ?? t.updated_at;
        if (!inWindow(ms(at))) continue;
        push({
          ref: ref('tasks', 'task', t.id),
          kind: 'task',
          title: clip(t.title || t.name || 'Task', 200),
          date: dayOf(at),
          text: textOf(t.title || t.name, t.description)
        });
      }
    });
  }
  if (typeof deps.listProjects === 'function' && typeof deps.listTasks === 'function') {
    await read('project', async () => [await deps.listProjects(), await tasks()], ([projects, taskRows]) => {
      const live = withoutDeleted(taskRows);
      for (const p of withoutDeleted(projects)) {
        const children = live.filter((t) => t.parent_project_id === p.id && t.status !== 'dead');
        if (!children.length || !children.every(isTaskDone)) continue;
        if (!inWindow(ms(p.updated_at))) continue;
        push({
          ref: ref('tasks', 'project', p.id),
          kind: 'project',
          title: clip(p.title || p.name || 'Project', 200),
          date: dayOf(p.updated_at),
          text: textOf(p.title || p.name, p.description)
        });
      }
    });
  }

  await read('goal', deps.listGoals, (rows) => {
    for (const g of withoutDeleted(rows)) {
      if (g.status !== 'achieved' || !inWindow(ms(g.updated_at))) continue;
      push({
        ref: ref('tasks', 'goal', g.id),
        kind: 'goal',
        title: clip(g.title || 'Goal', 200),
        date: dayOf(g.updated_at),
        text: textOf(g.title, g.description)
      });
    }
  });

  let unitTitles = new Map();
  await read('unit', deps.listUnits, (rows) => {
    for (const u of withoutDeleted(rows)) {
      unitTitles.set(u.id, u.title || u.code || '');
      if (!inWindow(ms(u.updated_at))) continue;
      push({
        ref: ref('teaching', 'unit', u.id),
        kind: 'unit',
        title: clip(u.title || u.code || 'Unit', 200),
        date: dayOf(u.updated_at),
        text: textOf(u.title, u.code && `Code ${u.code}`, u.description)
      });
    }
  });

  if (typeof deps.listLessons === 'function') {
    const lessonSources = [];
    await read(
      'lesson',
      async () => [await deps.listLessons(), deps.listScheduledLessons ? await deps.listScheduledLessons() : []],
      ([lessons, scheduled]) => {
        const taught = new Map();
        for (const row of withoutDeleted(scheduled)) {
          if (row.delivery_status !== 'delivered' || !row.lesson_id) continue;
          const t = ms(row.date);
          const entry = taught.get(row.lesson_id) ?? { classes: new Set(), latest: NaN, day: null };
          if (row.class_id) entry.classes.add(row.class_id);
          if (Number.isFinite(t) && !(entry.latest >= t)) {
            entry.latest = t;
            entry.day = dayOf(row.date);
          }
          taught.set(row.lesson_id, entry);
        }
        for (const l of withoutDeleted(lessons)) {
          const dates = [
            [ms(l.created_at), dayOf(l.created_at)],
            [ms(l.published_at), dayOf(l.published_at)]
          ];
          const t = taught.get(l.id);
          if (t) dates.push([t.latest, t.day]);
          const live = dates.filter(([at]) => inWindow(at)).sort((a, b) => b[0] - a[0]);
          if (!live.length) continue;
          lessonSources.push({
            lessonId: l.id,
            taughtClasses: t ? t.classes.size : 0,
            source: {
              ref: ref('teaching', 'lesson', l.id),
              kind: 'lesson',
              title: clip(l.title || 'Lesson', 200),
              date: live[0][1],
              text: ''
            },
            lesson: l
          });
        }
      }
    );
    if (lessonSources.length) {
      const counts = typeof deps.countQuizResults === 'function'
        ? await mapBounded(lessonSources, QUIZ_COUNT_CONCURRENCY, async (item) => {
            try {
              const n = await deps.countQuizResults(item.lessonId);
              return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
            } catch {
              return 0;
            }
          })
        : lessonSources.map(() => 0);
      lessonSources.forEach((item, i) => {
        const l = item.lesson;
        item.source.text = textOf(
          l.title,
          l.pedagogical_mode && `Mode: ${l.pedagogical_mode}`,
          l.unit_id && unitTitles.get(l.unit_id) && `Unit: ${unitTitles.get(l.unit_id)}`,
          item.taughtClasses ? `Taught to ${item.taughtClasses} ${item.taughtClasses === 1 ? 'class' : 'classes'}` : '',
          counts[i] ? `${counts[i]} quiz hand-ins` : ''
        );
        push(item.source);
      });
    }
  }

  await read('page', deps.listKnowledge, (rows) => {
    for (const k of rows) {
      if (!k?.id || !inWindow(ms(k.updated_at))) continue;
      const tags = Array.isArray(k.tags) ? k.tags.join(', ') : '';
      push({
        ref: ref('knowledge', 'page', k.id),
        kind: 'page',
        title: clip(k.title || 'Knowledge page', 200),
        date: dayOf(k.updated_at),
        text: textOf(k.title, tags && `Tags: ${tags}`, k.excerpt)
      });
    }
  });

  const seen = new Set();
  const unique = sources.filter((s) => (seen.has(s.ref) ? false : (seen.add(s.ref), true)));
  // Newest first; ties broken by ref so the order is stable.
  unique.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.ref.localeCompare(b.ref));
  return {
    sources: Number.isFinite(limit) ? unique.slice(0, limit) : unique,
    witness_refs: [],
    read_kinds: [...readKinds]
  };
}

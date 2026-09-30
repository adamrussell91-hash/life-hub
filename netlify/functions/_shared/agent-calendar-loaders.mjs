/**
 * Server loaders for loadAgentCalendarMerge — wired from chat / Clare paths.
 * Kept separate so agent-calendar-merge.mjs stays unit-testable without Blobs.
 */
import { loadTimedLifeEventsFromTree } from './life-schedule-events.mjs';
import { cachedFeedRows } from '../calendar-feeds.mjs';
import { defaultGetContentStore } from './teaching-blobs.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';
import { createMeetingRepository } from './meeting-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { listKnowledgePages } from './knowledge-data.mjs';
import { withoutDeleted } from './record-liveness.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function enumerateDates(from, to) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return [];
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    if (out.length > 62) break;
  }
  return out;
}

/**
 * Build injectable loaders from chat turn context.
 * Missing pieces → loadAgentCalendarMerge marks that source unavailable
 * (fail-visible: do not pretend free).
 */
export function createAgentCalendarLoaders({
  client = null,
  repoTree = null,
  env = process.env,
  fetchImpl = fetch,
  hubLessons = [],
  hubClasses = [],
  hubTasks = [],
  hubWorkBlocks = [],
  getLifeEvents = null,
  getTasksStore = null,
  getProfessionalStore = null,
  listPages = null,
  loadIcal = null
} = {}) {
  return {
    async loadLifeEvents({ from, to }) {
      const dates = enumerateDates(from, to);
      if (typeof getLifeEvents === 'function') {
        return getLifeEvents({ dates, client, tree: repoTree });
      }
      if (!client || !Array.isArray(repoTree)) {
        throw Object.assign(new Error('life_tree_unavailable'), { code: 'life_tree_unavailable' });
      }
      return loadTimedLifeEventsFromTree({ client, tree: repoTree, dates });
    },

    async loadTeaching() {
      const scheduled = (hubLessons ?? []).filter(
        (row) => row && (row.type === 'scheduled_lesson' || DATE_RE.test(String(row.date ?? '')))
      );
      const drafts = (hubLessons ?? []).filter((row) => row && row.type === 'lesson');
      return {
        lessons: drafts,
        classes: hubClasses ?? [],
        scheduled_lessons: scheduled
      };
    },

    async loadKnowledgePages() {
      const list = typeof listPages === 'function'
        ? listPages
        : () => listKnowledgePages({ env, fetchImpl });
      return list();
    },

    async loadTasks() {
      return withoutDeleted(hubTasks ?? []);
    },

    async loadWorkBlocks() {
      if (Array.isArray(hubWorkBlocks) && hubWorkBlocks.length) {
        return withoutDeleted(hubWorkBlocks);
      }
      if (typeof getTasksStore === 'function') {
        const store = await getTasksStore(env);
        const { listJSON } = await import('./tasks-blobs.mjs');
        return withoutDeleted(await listJSON(store, 'work_blocks/'));
      }
      return [];
    },

    async loadProfessional() {
      const getStore = getProfessionalStore ?? defaultGetProfessionalStore;
      const store = await getStore(env);
      const meetingRepo = createMeetingRepository({ store });
      const eventRepo = createEventRepository({ store });
      const [meetings, events] = await Promise.all([
        meetingRepo.listMeetings(),
        eventRepo.listEvents()
      ]);
      return { meetings, events };
    },

    async loadIcalRows({ from, to }) {
      if (typeof loadIcal === 'function') return loadIcal({ from, to });
      const store = await defaultGetContentStore(env);
      return cachedFeedRows({ store, from, to });
    }
  };
}

export { enumerateDates };

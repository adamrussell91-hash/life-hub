/**
 * Ann Teaching-surface adapter — same evidence competence as Life-chat Ann.
 * Production Teaching AI routes must call this and pass promptBlock into
 * buildAiSystemPrompt({ evidencePackBlock }).
 */
import { assembleAnnEvidence } from './evidence-packs.mjs';
import {
  CLASS_PREFIX,
  DRAFT_LESSON_PREFIX,
  SCHEDULED_LESSON_PREFIX,
  UNIT_PREFIX,
  listJSON as listTeachingJSON
} from './teaching-blobs.mjs';

/**
 * @param {{
 *   message?: string,
 *   today?: string,
 *   now?: Date,
 *   classes?: any[],
 *   lessons?: any[],
 *   units?: any[],
 *   loadErrors?: Record<string, string>
 * }} input
 */
export function buildAnnTeachingEvidence(input = {}) {
  const {
    message = "Help me improve tomorrow's lesson",
    today,
    now = new Date(),
    classes = [],
    lessons = [],
    units = [],
    loadErrors = {}
  } = input;

  const pack = assembleAnnEvidence(
    { classes, lessons, units, loadErrors },
    { message, today: today ?? now.toISOString().slice(0, 10), now }
  );

  return {
    active: pack.active,
    answerable: pack.answerable,
    intentClass: pack.intentClass,
    toolsExecuted: pack.toolsExecuted,
    promptBlock: pack.promptBlock,
    sections: pack.sections
  };
}

/**
 * Load Teaching store slices then assemble Ann's evidence pack.
 * @param {{ getTeachingStore: Function, message?: string, today?: string, now?: Date, env?: any }} opts
 */
export async function loadAnnTeachingEvidence({
  getTeachingStore,
  message,
  today,
  now = new Date(),
  env
} = {}) {
  const loadErrors = {};
  if (typeof getTeachingStore !== 'function') {
    return buildAnnTeachingEvidence({
      message,
      today,
      now,
      loadErrors: { teaching: 'store_unavailable' }
    });
  }

  let store;
  try {
    store = await getTeachingStore(env);
  } catch (err) {
    return buildAnnTeachingEvidence({
      message,
      today,
      now,
      loadErrors: { teaching: err?.code || 'store_unavailable' }
    });
  }

  const [classes, drafts, scheduled, units] = await Promise.all([
    listTeachingJSON(store, CLASS_PREFIX).catch(err => {
      loadErrors.classes = err?.code || 'load_failed';
      return [];
    }),
    listTeachingJSON(store, DRAFT_LESSON_PREFIX).catch(err => {
      loadErrors.lessons = err?.code || 'load_failed';
      return [];
    }),
    listTeachingJSON(store, SCHEDULED_LESSON_PREFIX).catch(err => {
      loadErrors.scheduledLessons = err?.code || 'load_failed';
      return [];
    }),
    listTeachingJSON(store, UNIT_PREFIX).catch(err => {
      loadErrors.units = err?.code || 'load_failed';
      return [];
    })
  ]);

  return buildAnnTeachingEvidence({
    message,
    today,
    now,
    classes: Array.isArray(classes) ? classes : [],
    lessons: [...(Array.isArray(drafts) ? drafts : []), ...(Array.isArray(scheduled) ? scheduled : [])],
    units: Array.isArray(units) ? units : [],
    loadErrors
  });
}

import {
  draftLessonKey,
  getJSON,
  newId,
  setJSON,
  slugify,
  unitKey
} from './_shared/teaching-blobs.mjs';
import { QuizSettingsSchema } from './_shared/quiz-core.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';
import { BlockSchema } from './_shared/teaching-block-schema.mjs';
import { TutorialSettingsSchema } from './_shared/tutorial-schema.mjs';

/** A new lesson can start with a skeleton (a tutorial's tabs and exit checks). */
const MAX_START_BLOCKS = 40;

function startBlocks(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_START_BLOCKS) {
    throw teachingWriteError(400, 'validation_error', `blocks must be a list of at most ${MAX_START_BLOCKS} blocks`);
  }
  const parsed = BlockSchema.array().safeParse(value);
  if (!parsed.success) throw teachingWriteError(400, 'validation_error', 'blocks are not valid lesson blocks');
  return parsed.data;
}

/** A tutorial needs its class and groups, so a bad one is refused rather than dropped. */
function tutorialSettings(mode, value) {
  if (mode !== 'tutorial' || value === undefined) return null;
  const parsed = TutorialSettingsSchema.safeParse(value);
  if (!parsed.success) throw teachingWriteError(400, 'validation_error', 'tutorial settings are not valid');
  return parsed.data;
}

export const config = { path: '/api/lessons' };

export async function createLessonRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const unit_id = typeof body.unit_id === 'string' ? body.unit_id : '';
  const pedagogical_mode = typeof body.pedagogical_mode === 'string'
    ? body.pedagogical_mode
    : 'direct';

  if (!title || !unit_id) {
    throw teachingWriteError(400, 'validation_error', 'title and unit_id are required');
  }
  const blocks = startBlocks(body.blocks);
  const tutorial = tutorialSettings(pedagogical_mode, body.tutorial);

  const unit = await getJSON(store, unitKey(unit_id));
  if (!unit) throw teachingWriteError(404, 'not_found', 'Unit not found');

  const lessonIds = Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [];
  const sequences = new Map();
  for (const lessonId of lessonIds) {
    const lesson = await getJSON(store, draftLessonKey(lessonId));
    if (typeof lesson?.sequence === 'number') sequences.set(lessonId, lesson.sequence);
  }
  const maxSequence = Math.max(0, ...sequences.values());
  // A follow-up sits straight after the lesson it follows: halfway to the next one.
  const after = typeof body.after_lesson_id === 'string' && sequences.has(body.after_lesson_id) ? body.after_lesson_id : null;
  let sequence = maxSequence + 1;
  if (after) {
    const from = sequences.get(after);
    const later = [...sequences.values()].filter((s) => s > from);
    sequence = later.length ? (from + Math.min(...later)) / 2 : from + 1;
  }
  const quiz = pedagogical_mode === 'quiz' && body.quiz ? QuizSettingsSchema.safeParse(body.quiz) : null;

  const timestamp = new Date().toISOString();
  const id = newId('lesson');
  const record = {
    id,
    type: 'lesson',
    title,
    slug: slugify(title),
    unit_id,
    sequence,
    blocks,
    pedagogical_mode,
    ...(quiz?.success ? { quiz: quiz.data } : {}),
    ...(tutorial ? { tutorial } : {}),
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  await setJSON(store, draftLessonKey(id), record);
  const at = after ? lessonIds.indexOf(after) + 1 : lessonIds.length;
  await setJSON(store, unitKey(unit_id), {
    ...unit,
    lesson_ids: [...lessonIds.slice(0, at), id, ...lessonIds.slice(at)],
    updated_at: timestamp
  });
  return record;
}

export function createLessonsHandler(deps = {}) {
  return createTeachingCollectionHandler({ create: createLessonRecord }, deps);
}

export default createLessonsHandler();

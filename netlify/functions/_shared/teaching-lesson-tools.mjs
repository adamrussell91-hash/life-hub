import { isDeletedRecord, withoutDeleted } from './record-liveness.mjs';
import { draftLessonKey, getJSON, listJSON, SCHEDULED_LESSON_PREFIX, UNIT_PREFIX, unitKey } from './teaching-blobs.mjs';
import { childBlocks, editableFields } from '../../../packages/alchemy/patches.js';

/** One read_lesson call returns this much text; pass offset to continue. */
export const LESSON_READ_CHARS = 20000;

/**
 * Adam's own lessons, for the Teaching AI job runner: a review quiz is built
 * from what was taught, so Ann can list a unit's lessons with their dates and
 * read any of them in full.
 */
export const LESSON_TOOLS = [
  {
    name: 'list_lessons',
    description: 'List the lessons in a unit in teaching order, with the dates each is timetabled and its type (quiz or lesson). With no unit_id it lists the unit this lesson belongs to. Also lists the other units in the same year, so you can list those too. Use it to find the lessons a review covers (e.g. "week one" means the lessons dated in the unit\'s first week).',
    input_schema: { type: 'object', additionalProperties: false, properties: {
      unit_id: { type: 'string', description: 'A unit id from other_units. Leave out for this lesson\'s unit.' }
    } }
  },
  {
    name: 'read_lesson',
    description: `Read one of Adam's lessons in full: every block's text in order, with its block type (${LESSON_READ_CHARS.toLocaleString('en-AU')} characters per call; pass offset to continue). This is what was taught, so ground a review in it before notes or the web. Read-only.`,
    input_schema: { type: 'object', additionalProperties: false, required: ['id'], properties: {
      id: { type: 'string', description: 'A lesson id from list_lessons.' },
      offset: { type: 'integer', minimum: 0 }
    } }
  }
];

export const LESSON_TOOL_NAMES = new Set(LESSON_TOOLS.map(tool => tool.name));

function plain(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lesson as Ann reads it for content: each block's type and its text, nested blocks indented. */
export function lessonReadingText(lesson) {
  const lines = [`Title: ${lesson.title ?? ''}`];
  if (lesson.pedagogical_mode) lines.push(`Type: ${lesson.pedagogical_mode}`);
  lines.push('');
  const walk = (blocks, depth) => {
    for (const block of blocks ?? []) {
      const text = editableFields(block).map(([, value]) => plain(value)).filter(Boolean).join(' · ');
      lines.push(`${'  '.repeat(depth)}[${block.block_type}]${text ? ` ${text}` : ''}`);
      walk(childBlocks(block), depth + 1);
    }
  };
  walk(lesson.blocks, 0);
  return lines.join('\n');
}

/** Runs list_lessons and read_lesson against the content store, loading the timetable once per job. */
export function createLessonToolRunner({ store, lesson }) {
  let scheduled = null;
  const datesFor = async () => {
    scheduled ??= withoutDeleted(await listJSON(store, SCHEDULED_LESSON_PREFIX).catch(() => []));
    return lessonId => [...new Set(scheduled.filter(row => row.lesson_id === lessonId && row.delivery_status !== 'skipped').map(row => row.date))].sort();
  };
  const liveUnit = async id => {
    const unit = id ? await getJSON(store, unitKey(id)) : null;
    return unit && !isDeletedRecord(unit) ? unit : null;
  };

  return async function runLessonTool(name, input = {}) {
    switch (name) {
      case 'list_lessons': {
        const unit = await liveUnit(String(input.unit_id || lesson.unit_id || ''));
        if (!unit) return { error: 'That unit is unavailable. Leave unit_id out for this lesson\'s unit.' };
        const dates = await datesFor();
        const rows = await Promise.all((unit.lesson_ids ?? []).map(id => (id === lesson.id ? lesson : getJSON(store, draftLessonKey(id)).catch(() => null))));
        const lessons = rows
          .filter(row => row && !isDeletedRecord(row))
          .map((row, index) => ({
            id: row.id,
            position: index + 1,
            title: row.title,
            type: row.pedagogical_mode === 'quiz' ? 'quiz' : 'lesson',
            dates: dates(row.id),
            ...(row.id === lesson.id ? { this_lesson: true } : {})
          }));
        const units = withoutDeleted(await listJSON(store, UNIT_PREFIX).catch(() => []));
        const otherUnits = units
          .filter(other => other.id !== unit.id && other.year_id === unit.year_id)
          .map(other => ({ id: other.id, title: other.title, ...(other.start_date ? { start_date: other.start_date } : {}) }));
        return {
          unit: { id: unit.id, title: unit.title, ...(unit.start_date ? { start_date: unit.start_date } : {}), ...(unit.end_date ? { end_date: unit.end_date } : {}) },
          lessons,
          other_units: otherUnits
        };
      }
      case 'read_lesson': {
        const id = String(input.id ?? '');
        const other = id === lesson.id ? lesson : await getJSON(store, draftLessonKey(id)).catch(() => null);
        if (!other || isDeletedRecord(other)) return { error: 'That lesson is unavailable. Use an id from list_lessons.' };
        const text = lessonReadingText(other);
        const offset = Math.max(0, Number.parseInt(input.offset, 10) || 0);
        const end = offset + LESSON_READ_CHARS;
        const unit = await liveUnit(other.unit_id);
        return {
          id: other.id,
          title: other.title,
          ...(unit ? { unit: unit.title } : {}),
          dates: (await datesFor())(other.id),
          text: text.slice(offset, end),
          ...(end < text.length ? { more_from: end } : {})
        };
      }
      default:
        return { error: 'Unknown tool.' };
    }
  };
}

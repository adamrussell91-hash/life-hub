/**
 * The unit map a student's progress page draws: the same route, lanes and branches as the teacher's
 * coverage map, from published lessons only. Only fields the map needs leave the server: no lesson
 * content, no teacher notes, no skip rules, no unpublished titles, no syllabus wording.
 */
import { isDeletedRecord } from './record-liveness.mjs';
import { read } from './question-drop.mjs';
import { subjectKey, SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { filterBlocksForStudent } from './teaching-student.mjs';
import { publicNetworkLines } from './teaching-network.mjs';

const EMPTY_CONTENT = { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Assessment task' } };
const LEVELS = new Set(['introduced', 'reinforced', 'mastered']);
const ROLES = new Set(['core', 'support', 'extension', 'optional']);
const id = (v) => (typeof v === 'string' && v ? v : undefined);

/** The unit's map block as students may see it, cut down to what drawing needs. */
function mapContent(unit) {
  const block = filterBlocksForStudent(unit?.blocks ?? []).find((b) => b?.block_type === 'curriculum_lines' && b.content?.version === 2);
  const c = block?.content;
  if (!c) return EMPTY_CONTENT;
  return {
    version: 2,
    rail_stops: (c.rail_stops ?? []).map((s) => ({
      id: s.id, line_id: s.line_id, kind: s.kind ?? 'stop', label: '',
      ...(id(s.after_lesson_id) ? { after_lesson_id: s.after_lesson_id } : {}),
      ...(id(s.lesson_id) ? { lesson_id: s.lesson_id } : {})
    })),
    gates: (c.gates ?? []).map((g) => ({ id: g.id, label: '', line_ids: g.line_ids ?? [], ...(id(g.after_lesson_id) ? { after_lesson_id: g.after_lesson_id } : {}), ...(id(g.lesson_id) ? { lesson_id: g.lesson_id } : {}) })),
    nudges: {},
    ...(Array.isArray(c.station_order) ? { station_order: c.station_order } : {}),
    ...(Array.isArray(c.hidden_lessons) ? { hidden_lessons: c.hidden_lessons } : {}),
    ...(Array.isArray(c.concept_lines) ? { concept_lines: c.concept_lines } : {}),
    terminus: { label: typeof c.terminus?.label === 'string' ? c.terminus.label : 'Assessment task', ...(id(c.terminus?.lesson_id) ? { lesson_id: c.terminus.lesson_id } : {}) }
  };
}

/** `lessons` are the unit's published drafts, in unit order. Null when the class has no unit. */
export async function unitMapPayload(store, roster, unit, lessons) {
  if (!unit) return null;
  const content = mapContent(unit);
  const subject = id(roster.cls.subject_id) ? await read(store, subjectKey(roster.cls.subject_id)) : null;
  const all = !subject || isDeletedRecord(subject) ? [] : publicNetworkLines(subject.network_lines);
  const keep = new Set(content.concept_lines ?? []);
  const lines = all.filter((l) => l.mode !== 'metro' || !keep.size || keep.has(l.id));
  const ids = new Set(lessons.map((l) => l.id));
  const rows = (await Promise.all((await listBlobKeys(store, SCHEDULED_LESSON_PREFIX)).map((key) => read(store, key))))
    .filter((r) => r && !isDeletedRecord(r) && r.class_id === roster.cls.id && ids.has(r.lesson_id) && r.delivery_status !== 'skipped' && typeof r.date === 'string');
  return {
    content,
    lines,
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      ...(Array.isArray(l.line_stops) && l.line_stops.length
        ? { line_stops: l.line_stops.filter((s) => id(s?.line_id)).slice(0, 16).map((s) => ({ line_id: s.line_id, ...(LEVELS.has(s.level) ? { level: s.level } : {}), ...(s.auto === true ? { auto: true } : {}) })) }
        : {}),
      ...(Array.isArray(l.line_off) ? { line_off: l.line_off.filter(id).slice(0, 24) } : {}),
      ...(Array.isArray(l.after_lesson_ids) ? { after: l.after_lesson_ids.filter((x) => ids.has(x)) } : {}),
      ...(ROLES.has(l.route_role) ? { role: l.route_role } : {}),
      ...(id(l.branch_from) && ids.has(l.branch_from) ? { branchFrom: l.branch_from } : {}),
      ...(l.pedagogical_mode === 'quiz' ? { quiz: true } : {}),
      ...(l.pedagogical_mode === 'assessment' ? { assessment: true } : {})
    })),
    schedule: rows.map((r) => ({ lesson_id: r.lesson_id, date: r.date, ...(typeof r.start_time === 'string' ? { start_time: r.start_time } : {}) })),
    pre: lessons.filter((l) => l.pre_unit).map((l) => l.id)
  };
}

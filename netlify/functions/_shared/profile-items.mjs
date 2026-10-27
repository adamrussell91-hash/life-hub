/**
 * The items each profile bar is measured against: the unit's declared items, not only what has
 * been marked, so a bar never shrinks when new work lands. A group with no declared items is empty.
 *
 *   understanding / responding  dot points of the unit's lessons (`dp:{area}:{U|R id}`)
 *   concepts                    catalogue techniques the unit's quizzes' answer keys name (`tech:{id}`)
 *   skills                      skills on the class's assessment criteria and the unit's quiz keys (`skill:{strand.sub}`)
 */
import { mapBounded } from './blobs-list.mjs';
import { read } from './question-drop.mjs';
import { quizDeclaredTags } from './quiz.mjs';
import { ALIGNMENT_ID } from './syllabus-alignment-schema.mjs';
import { lessonPointMap } from './profile-evidence.mjs';

/** The stored alignment copy, or null. Never reads the private source from a public request. */
export async function storedAlignment(store) {
  return (await read(store, `syllabus_alignment/${ALIGNMENT_ID}`)) ?? null;
}

const unique = (xs) => [...new Set(xs)];

export async function profileItems(store, roster, lessons, view, alignment = null) {
  const items = [];
  for (const tag of unique([...lessonPointMap(lessons, alignment).values()].flat())) {
    items.push({ group: tag.split(':')[2]?.startsWith('R') ? 'responding' : 'understanding', tag });
  }
  const quizTags = (await mapBounded(lessons, 4, (l) => quizDeclaredTags(store, l.id))).flat();
  for (const tag of unique(quizTags.filter((t) => t.startsWith('tech:')))) items.push({ group: 'concepts', tag });
  const criteria = (view.markbook?.columns ?? []).filter((c) => c.kind === 'assessment').flatMap((c) => c.criteria ?? []);
  const skills = [...criteria.map((c) => c.skill).filter(Boolean).map((s) => `skill:${s}`), ...quizTags.filter((t) => t.startsWith('skill:'))];
  for (const tag of unique(skills)) items.push({ group: 'skills', tag });
  return items;
}

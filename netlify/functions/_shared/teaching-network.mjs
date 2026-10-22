/**
 * Curriculum network data for student endpoints. Only the fields a map needs
 * leave the server: line ids, modes, names and colours; stop line ids and depth.
 */

const MODES = new Set(['train', 'metro', 'light_rail']);
const LEVELS = new Set(['introduced', 'reinforced', 'mastered']);

const KINDS = new Set(['workshop', 'lecture']);

export function publicLessonKind(kind) {
  return KINDS.has(kind) ? kind : undefined;
}

/**
 * What comes after each published lesson, for students. A link to a lesson
 * students cannot see passes through it to what that lesson leads to (its own
 * links, or the next lesson in unit order). Unset links stay unset: the map
 * then follows unit order among the published lessons.
 */
export function publicAfterLinks(unitLessonIds, drafts, published) {
  const order = unitLessonIds.filter(id => drafts.has(id));
  const linksOf = id => {
    const after = drafts.get(id)?.after_lesson_ids;
    if (Array.isArray(after)) return after.filter(x => typeof x === 'string' && drafts.has(x));
    const next = order[order.indexOf(id) + 1];
    return next ? [next] : [];
  };
  const expand = (ids, seen) => ids.flatMap(id => {
    if (published.has(id)) return [id];
    if (seen.has(id)) return [];
    return expand(linksOf(id), new Set([...seen, id]));
  });
  const out = new Map();
  for (const id of order) {
    if (!published.has(id) || !Array.isArray(drafts.get(id)?.after_lesson_ids)) continue;
    out.set(id, [...new Set(expand(linksOf(id), new Set([id])))].slice(0, 6));
  }
  return out;
}

export function publicNetworkLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter(line => line && typeof line.id === 'string' && MODES.has(line.mode))
    .slice(0, 24)
    .map(line => ({
      id: line.id,
      mode: line.mode,
      name: typeof line.name === 'string' ? line.name.slice(0, 60) : '',
      ...(typeof line.short === 'string' && line.short ? { short: line.short.slice(0, 4) } : {}),
      colour: typeof line.colour === 'string' ? line.colour : 'wave'
    }));
}

export function publicLineStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops
    .filter(stop => stop && typeof stop.line_id === 'string')
    .slice(0, 16)
    .map(stop => ({
      line_id: stop.line_id,
      ...(LEVELS.has(stop.level) ? { level: stop.level } : {})
    }));
}

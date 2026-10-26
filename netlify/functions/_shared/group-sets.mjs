/**
 * Group sets: a quiz section marked `group_set` holds questions for one saved
 * markbook group. On publish the set leaves the public blocks (its name, tags
 * and students are the teacher's) and its questions go into the quiz key under
 * `sets`, where narrow() hands them only to the set's students.
 */

export const GROUP_SET_LIMITS = { sets: 6, questions: 10 };

export function isGroupSet(block) {
  return block?.block_type === 'section' && !!block.content?.group_set && typeof block.content.group_set.group_id === 'string';
}

/** Removes any group set below the top level; returns the cleaned blocks and whether one was found. */
function dropNested(blocks) {
  let found = false;
  const walk = (list) =>
    (Array.isArray(list) ? list : []).flatMap((block) => {
      if (isGroupSet(block)) {
        found = true;
        return [];
      }
      const c = block.content ?? {};
      if (Array.isArray(c.blocks)) return [{ ...block, content: { ...c, blocks: walk(c.blocks) } }];
      if (Array.isArray(c.columns)) return [{ ...block, content: { ...c, columns: c.columns.map((col) => ({ ...col, blocks: walk(col.blocks) })) } }];
      if (Array.isArray(c.tabs)) return [{ ...block, content: { ...c, tabs: c.tabs.map((tab) => ({ ...tab, blocks: walk(tab.blocks) })) } }];
      return [block];
    });
  return { blocks: walk(blocks), found };
}

/**
 * Splits a quiz's student blocks into the public blocks and its group sets.
 * Only top-level sets count; a set inside a section, column or tab is dropped
 * with a problem, so its questions never ship to everyone.
 */
export function liftGroupSets(blocks) {
  const kept = [];
  const sets = [];
  const problems = [];
  let nested = false;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (isGroupSet(block)) {
      const inner = dropNested(block.content.blocks ?? []);
      nested ||= inner.found;
      sets.push({ id: block.id, config: block.content.group_set, blocks: inner.blocks });
      continue;
    }
    const cleaned = dropNested([block]);
    nested ||= cleaned.found;
    kept.push(...cleaned.blocks);
  }
  if (nested) problems.push('A group set must sit at the top of the quiz, not inside a section, column or tab.');
  if (sets.length > GROUP_SET_LIMITS.sets) problems.push(`A quiz holds at most ${GROUP_SET_LIMITS.sets} group sets.`);
  for (const s of sets) {
    const count = s.blocks.filter((b) => b.block_type === 'quiz_question').length;
    if (count > GROUP_SET_LIMITS.questions) problems.push(`A group set holds at most ${GROUP_SET_LIMITS.questions} questions (${s.config.name ?? 'a set'} has ${count}).`);
  }
  return { blocks: kept, sets, problems };
}

/**
 * The shared questions with practice spread evenly through them. Sets take
 * turns (x1, y1, x2, y2…), and practice question k goes after shared question
 * slot(k), so practice never bunches at the start or the end.
 */
export function interleave(shared, sets) {
  const extra = [];
  const lists = sets.map((s) => [...s]);
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) extra.push(l.shift());
  if (!extra.length) return [...shared];
  if (!shared.length) return extra;
  // Evenly spaced, 1-based: after which shared question practice k goes.
  const slot = (k) => Math.max(1, Math.round(((k + 1) * shared.length) / (extra.length + 1)));
  const out = [];
  let k = 0;
  for (let i = 1; i <= shared.length; i += 1) {
    out.push(shared[i - 1]);
    while (k < extra.length && slot(k) === i) out.push(extra[k++]);
  }
  while (k < extra.length) out.push(extra[k++]);
  return out;
}

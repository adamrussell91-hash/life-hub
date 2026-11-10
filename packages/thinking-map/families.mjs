// packages/thinking-map/families.mjs
// The four families the Browse all page sorts by. Actions are things you work through, insights
// are ideas that explain what is going on, frames are ways of looking at it, and snares are the
// traps (snares.mjs). Every option takes its tool's default; a few models that plainly belong to
// another family are named below. Tool-level options have no family.

export const FAMILIES = Object.freeze(['action', 'insight', 'frame', 'snare']);

/** Each tool's default family (`knowledge-protocols` is the protocols' tool id). */
export const TOOL_FAMILY = Object.freeze({
  'problem-solver': 'action',
  'decision-book': 'action',
  'get-things-done': 'action',
  'rules-book': 'insight',
  'change-book': 'insight',
  'collaboration-book': 'insight',
  'communication-book': 'insight',
  'question-book': 'frame',
  'knowledge-protocols': 'action'
});

/** The few models that plainly sit in another family. Keep this short. */
export const FAMILY_OVERRIDES = Object.freeze({
  dm_role_playing: 'frame',
  dm_outside_box: 'frame',
  dm_rumsfeld: 'frame',
  dm_cognitive_bias: 'insight',
  cb_four_in_one: 'frame',
  rb_scout: 'frame'
});

/** An option's family: null for a tool-level option, else its override or its tool's default. */
export function familyOf({ id, tool, kind }) {
  if (kind === 'tool') return null;
  return FAMILY_OVERRIDES[id] ?? TOOL_FAMILY[tool] ?? null;
}

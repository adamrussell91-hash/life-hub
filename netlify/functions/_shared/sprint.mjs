/**
 * Design Sprints. Publish keeps the whole student-safe body public (brief and
 * phase guides are for everyone) with a public `sprint` subset; the groups,
 * class and rules go to sprint/{lesson}/config. Student and teacher actions
 * below read and write the records listed in sprint-keys.mjs. No model is
 * called here.
 */
import { sprintKeys } from './sprint-keys.mjs';
import { SprintSettingsSchema } from './sprint-schema.mjs';
import { phaseDue } from './sprint-rules.mjs';

const strip = (c) => ({ id: c.id, text: c.text });

export function prepareSprintPublish(draft, studentBlocks) {
  const s = draft.sprint;
  const snapshot = {
    blocks: studentBlocks,
    sprint: {
      support: s.support,
      lock_hours: s.lock_hours,
      criteria: s.criteria.map(strip),
      reflection_criteria: s.reflection_criteria.map(strip),
      reflection_prompts: [...s.reflection_prompts],
      requirements: s.requirements,
      idea_guide: s.idea_guide,
      phases: s.phases
    }
  };
  const config = {
    version: Date.now().toString(36),
    class_id: s.class_id,
    decider: s.decider,
    lock_hours: s.lock_hours,
    groups: s.groups.map((g) => ({ id: g.id, name: g.name, students: [...g.students] })),
    phases: s.phases.map((p) => ({ key: p.key, where: p.where, due_date: p.due_date, due_time: p.due_time, ends_at: p.ends_at })),
    ideas: Object.fromEntries(s.phases.filter((p) => p.ideas).map((p) => [p.key, p.ideas])),
    criteria: s.criteria.map((c) => c.id),
    reflection_criteria: s.reflection_criteria.map((c) => c.id),
    requirements: s.requirements.map((r) => ({ id: r.id, phases: [...r.phases] }))
  };
  return { snapshot, config };
}

/** The server's copy of sprintIssues (apps/teaching/src/sprint/model.ts): the browser checks first, this stops a stale or hand-made draft. */
export function sprintPublishProblems(draft) {
  if (!draft.sprint) return ['Set up the sprint’s Kit before publishing.'];
  const parsed = SprintSettingsSchema.safeParse(draft.sprint);
  if (!parsed.success) return [`The sprint’s Kit isn’t valid: ${parsed.error.issues[0]?.message ?? 'check the settings'}`];
  const s = parsed.data;
  const out = [];
  if (s.criteria.length < 2) out.push('Add at least 2 criteria in the Kit.');
  const dues = s.phases.map((p) => phaseDue(p));
  if (dues.some((d) => d === null)) out.push('Set a deadline for every phase.');
  else if (dues.some((d, i) => i > 0 && d <= dues[i - 1])) out.push('Each phase’s deadline must come after the one before it.');
  if (!s.groups.length || s.groups.some((g) => !g.students.length)) out.push('Put every student in a group.');
  const all = s.groups.flatMap((g) => g.students);
  if (new Set(all).size < all.length) out.push('A student is in two groups. Keep each student in one group.');
  return out;
}

export async function storeSprintConfig(store, lessonId, config) {
  await store.setJSON(sprintKeys(lessonId).config, config);
}

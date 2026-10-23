// apps/teaching/src/tutorial/grouping.ts
import type { Evidence, Why } from '@/evidence/types';
import { TutorialGroupSchema, type TutorialGroup } from './schema';

/** At most this many groups; a teacher can't sit with more in a lesson or two. */
export const MAX_GROUPS = 5;

export type AnonRow = { key: string; mistakes: Why[]; share: number | null };

/**
 * What leaves the app for grouping: S1, S2… and their recorded mistakes on
 * the one tag. No names, initials or ids. `keys` stays in the browser.
 */
export function anonymise(students: readonly string[], evidence: readonly Evidence[], tag: string): { keys: Record<string, string>; rows: AnonRow[] } {
  const keys: Record<string, string> = {};
  const rows = students.map((student, i) => {
    const key = `S${i + 1}`;
    keys[key] = student;
    const mine = evidence.filter((e) => e.student === student && e.tags.includes(tag));
    const shares = mine.map((e) => e.share).filter((s): s is number => s !== null);
    return { key, mistakes: mine.flatMap((e) => e.why).slice(0, 12), share: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null };
  });
  return { keys, rows };
}

export function groupingBrief(input: { tagLabel: string; rows: AnonRow[]; mistakeText: (why: Why) => string }): string {
  const lines = input.rows.map((r) => `${r.key} (${r.share === null ? 'not marked' : `${Math.round(r.share * 100)}%`}): ${r.mistakes.map(input.mistakeText).join('; ') || 'low marks, no mistake recorded'}`);
  return [
    `These students are behind on ${input.tagLabel}. Group them by WHY they get it wrong, so each group can be taught to its reason.`,
    `Make 2 to ${MAX_GROUPS} groups. Every student goes in exactly one group.`,
    'For each group give: name (teacher-facing, under 8 words), why (one sentence), goal (student-facing, starts "Today:", says what they will do, never what they can’t), gap_type ("knowledge" when something is missing, "mix_up" when they confuse two things), members (the S keys), quotes (per member, one short line from their mistakes above that shows the reason).',
    'Reply with JSON only: {"groups":[{"name":"","why":"","goal":"","gap_type":"knowledge","members":["S1"],"quotes":{"S1":""}}]}',
    'Students:',
    ...lines
  ].join('\n\n');
}

const slug = (text: string, i: number) => `${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'group'}-${i + 1}`;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Ann's reply → groups with real student ids. Anyone left out goes in an Unsure group. */
export function parseGroups(raw: string, keys: Record<string, string>): TutorialGroup[] {
  let parsed: { groups?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Ann’s grouping came back unreadable. Try again.');
  }
  if (!Array.isArray(parsed.groups)) throw new Error('Ann’s grouping came back unreadable. Try again.');
  const placed = new Set<string>();
  const groups: TutorialGroup[] = [];
  parsed.groups.slice(0, MAX_GROUPS).forEach((g, i) => {
    const raw = g as { name?: string; why?: string; goal?: string; gap_type?: string; members?: unknown; quotes?: Record<string, string> };
    const students = (Array.isArray(raw.members) ? raw.members : []).map((m) => keys[String(m)]).filter((id): id is string => !!id && !placed.has(id));
    students.forEach((id) => placed.add(id));
    if (!students.length) return;
    const back = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
    const candidate = {
      id: slug(raw.name ?? 'group', i),
      name: (raw.name ?? `Group ${i + 1}`).slice(0, 80),
      why: (raw.why ?? '').slice(0, 300),
      goal: (raw.goal ?? 'Today: practising this together').slice(0, 140),
      gap_type: raw.gap_type === 'mix_up' ? 'mix_up' : 'knowledge',
      students,
      evidence: students.map((id) => ({ student: id, quote: (raw.quotes?.[back[id]!] ?? '').slice(0, 300) })).filter((e) => e.quote)
    };
    let id = candidate.id;
    for (let n = 2; groups.some((x) => x.id === id); n++) id = `${candidate.id.slice(0, 36)}-${n}`;
    groups.push(TutorialGroupSchema.parse({ ...candidate, id }));
  });
  const left = Object.values(keys).filter((id) => !placed.has(id));
  if (left.length) groups.push(TutorialGroupSchema.parse({ id: groups.some((x) => x.id === 'unsure') ? 'unsure-left' : 'unsure', name: 'Unsure', why: 'Ann couldn’t place these students. Move each one to a group.', goal: 'Today: practising this together', gap_type: 'knowledge', students: left, evidence: [], unsure: left }));
  return groups;
}

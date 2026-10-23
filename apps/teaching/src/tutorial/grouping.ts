// apps/teaching/src/tutorial/grouping.ts
import type { Evidence, Why } from '@/evidence/types';
import { TutorialGroupSchema, type TutorialGroup } from './schema';

/** At most this many groups; a teacher can't sit with more in a lesson or two. */
export const MAX_GROUPS = 5;

export type AnonRow = { key: string; mistakes: Why[]; share: number | null };

/**
 * What leaves the app for grouping: S1, S2… and their recorded mistakes on
 * the one tag. No names, initials or ids of the students. `keys` stays in the browser.
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

export type RosterName = { name: string; initials: string };

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (alts: string[], flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, flags);

/**
 * Replaces any roster student's full name, first name or initials in `text`
 * with "[name]", whole words only. Names match in any case; initials only as
 * written (upper case), so "AN" doesn't eat the word "an".
 */
export function scrubNames(text: string, roster: readonly RosterName[]): string {
  const names = [...new Set(roster.flatMap((s) => { const full = s.name.trim().replace(/\s+/g, ' '); return full ? [full, full.split(' ')[0]!] : []; }))]
    .filter((n) => n.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((n) => escapeRe(n).replace(/ /g, '\\s+'));
  const initials = [...new Set(roster.map((s) => s.initials.trim()).filter((i) => i.length > 1))].sort((a, b) => b.length - a.length).map(escapeRe);
  let out = text;
  if (names.length) out = out.replace(wholeWord(names, 'giu'), '[name]');
  if (initials.length) out = out.replace(wholeWord(initials, 'gu'), '[name]');
  return out;
}

export function groupingBrief(input: { tagLabel: string; rows: AnonRow[]; mistakeText: (why: Why) => string; roster?: readonly RosterName[] }): string {
  const text = (w: Why) => scrubNames(input.mistakeText(w), input.roster ?? []).slice(0, 160);
  const lines = input.rows.map((r) => `${r.key} (${r.share === null ? 'not marked' : `${Math.round(r.share * 100)}%`}): ${r.mistakes.map(text).join('; ') || 'low marks, no mistake recorded'}`);
  return [
    `These students are behind on ${input.tagLabel}. Group them by WHY they get it wrong, so each group can be taught to its reason.`,
    `Make 2 to ${MAX_GROUPS} groups. Every student goes in exactly one group.`,
    'For each group give: name (teacher-facing, under 8 words), why (one sentence), goal (student-facing, starts "Today:", says what they will do, never what they can’t), gap_type ("knowledge" when something is missing, "mix_up" when they confuse two things), members (the S keys), quotes (per member, one short line from their mistakes above that shows the reason), notes (for the teacher, 3 to 5 short lines: the misunderstanding to target, what to model, and what the exit check should test; no S keys or names).',
    'Reply with JSON only: {"groups":[{"name":"","why":"","goal":"","gap_type":"knowledge","members":["S1"],"quotes":{"S1":""},"notes":""}]}',
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
const UNREADABLE = 'Ann’s grouping came back unreadable. Try again.';
const DEFAULT_GOAL = 'Today: practising this together';
const DEFICIT = /\b(can'?t|can’t|cannot|without|not|never|rather than)\b/i;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Teacher notes with any S keys taken out, capped to fit the schema. */
function cleanNotes(v: unknown): string | undefined {
  const notes = str(v).replace(/\bS\d+\b/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1').trim().slice(0, 1200);
  return notes || undefined;
}

function cleanGoal(v: unknown): string {
  let goal = str(v).trim();
  if (!goal || DEFICIT.test(goal)) return DEFAULT_GOAL;
  if (!/^today:/i.test(goal)) goal = `Today: ${goal}`;
  return goal.slice(0, 140);
}

/** Ann's reply → groups with real student ids. Anyone left out goes in an Unsure group. */
export function parseGroups(raw: string, keys: Record<string, string>): TutorialGroup[] {
  let parsed: { groups?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error(UNREADABLE);
  }
  if (!parsed || !Array.isArray(parsed.groups)) throw new Error(UNREADABLE);
  try {
    const back = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
    const placed = new Set<string>();
    const groups: TutorialGroup[] = [];
    parsed.groups.slice(0, MAX_GROUPS).forEach((g, i) => {
      const r = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
      const members = Array.isArray(r.members) ? r.members : [];
      const students = members.map((m) => (typeof m === 'string' && Object.hasOwn(keys, m) ? keys[m]! : '')).filter((id) => !!id && !placed.has(id));
      students.forEach((id) => placed.add(id));
      if (!students.length) return;
      const quotes = (r.quotes && typeof r.quotes === 'object' ? r.quotes : {}) as Record<string, unknown>;
      const name = str(r.name).trim() || `Group ${i + 1}`;
      const notes = cleanNotes(r.notes);
      const base = slug(name, i);
      let id = base;
      for (let n = 2; groups.some((x) => x.id === id); n++) id = `${base.slice(0, 36)}-${n}`;
      groups.push(
        TutorialGroupSchema.parse({
          id,
          name: name.slice(0, 80),
          why: str(r.why).slice(0, 300),
          goal: cleanGoal(r.goal),
          gap_type: r.gap_type === 'mix_up' ? 'mix_up' : 'knowledge',
          students,
          evidence: students.map((s) => ({ student: s, quote: str(quotes[back[s]!]).slice(0, 300) })).filter((e) => e.quote),
          ...(notes ? { notes } : {})
        })
      );
    });
    const left = Object.values(keys).filter((id) => !placed.has(id));
    if (left.length) {
      groups.push(TutorialGroupSchema.parse({ id: groups.some((x) => x.id === 'unsure') ? 'unsure-left' : 'unsure', name: 'Unsure', why: 'Ann couldn’t place these students. Move each one to a group.', goal: DEFAULT_GOAL, gap_type: 'knowledge', students: left, evidence: [], unsure: left }));
    }
    return groups;
  } catch {
    throw new Error(UNREADABLE);
  }
}

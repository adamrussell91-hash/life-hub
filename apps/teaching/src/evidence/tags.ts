import type { LiteraryElementsTable } from '@/blocks/literary-elements';
import { sydneyDay } from '@/markbook/calc';
import type { OutcomeLabel } from '@/markbook/types';
import { norm } from '@/quiz/core';
import type { SkillsContinuum } from '@/skills/schema';
import type { Evidence, InsightPayload, TagKind, Why } from './types';

export type TagContext = { table: LiteraryElementsTable | null; outcomes: readonly OutcomeLabel[]; skills: SkillsContinuum | null };

export function kindOf(tag: string): TagKind | null {
  const prefix = tag.slice(0, Math.max(0, tag.indexOf(':')));
  return prefix === 'tech' || prefix === 'fam' || prefix === 'out' || prefix === 'skill' ? prefix : null;
}

/** Every item in an insight payload, placed with its student, source, day and confidence. */
export function payloadEvidence(p: InsightPayload): Evidence[] {
  const out: Evidence[] = [];
  for (const a of p.attempts) {
    const date = sydneyDay(a.submitted_at);
    for (const row of a.rows) for (const item of row.items) out.push({ ...item, student: a.student, source: `quiz:${p.lesson_id}`, date, confidence: row.confidence });
  }
  return out;
}

/**
 * Turns name tags (`tech:~simile`) into catalogue ids where a technique has
 * that name, and adds each technique's family tag. Unknown names stay as they are.
 */
export function expandTags(evidence: Evidence[], table: LiteraryElementsTable | null): Evidence[] {
  if (!table) return evidence;
  const byName = new Map(table.techniques.map((t) => [norm(t.name), t.id]));
  const familyOf = new Map<string, string>();
  const subgroupFamily = new Map(table.subgroups.map((s) => [s.id, s.family]));
  for (const t of table.techniques) {
    const fam = subgroupFamily.get(t.subgroup);
    if (fam) familyOf.set(t.id, fam);
  }
  const resolve = (tag: string): string => {
    if (!tag.startsWith('tech:~')) return tag;
    const id = byName.get(tag.slice(6));
    return id ? `tech:${id}` : tag;
  };
  const fixWhy = (w: Why): Why => (w.type === 'named' ? { ...w, as: resolve(w.as), target: resolve(w.target) } : w.type === 'not_found' ? { ...w, target: resolve(w.target) } : w);
  return evidence.map((e) => {
    const tags = new Set<string>();
    for (const raw of e.tags) {
      const tag = resolve(raw);
      tags.add(tag);
      const fam = tag.startsWith('tech:') ? familyOf.get(tag.slice(5)) : undefined;
      if (fam) tags.add(`fam:${fam}`);
    }
    return { ...e, tags: [...tags], why: e.why.map(fixWhy) };
  });
}

const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function tagLabel(tag: string, ctx: TagContext): string {
  const kind = kindOf(tag);
  const value = tag.slice(tag.indexOf(':') + 1);
  if (kind === 'tech') {
    if (value.startsWith('~')) return capital(value.slice(1));
    return ctx.table?.techniques.find((t) => t.id === value)?.name ?? value;
  }
  if (kind === 'fam') return ctx.table?.families.find((f) => f.key === value)?.name ?? value;
  if (kind === 'out') return ctx.outcomes.find((o) => o.id === value)?.code ?? value;
  if (kind === 'skill') {
    const [strand, sub] = value.split('.');
    return ctx.skills?.strands.find((s) => s.strand === strand)?.sub_strands.find((x) => x.id === sub)?.name ?? value;
  }
  return tag;
}

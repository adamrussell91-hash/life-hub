import type { Alignment, AlignmentConcept, AlignmentPoint, LinkStrength } from './schema';

/** A dot point, tagged with its focus area when a view spans all of them. */
export type AreaPoint = AlignmentPoint & { area: string; areaName: string };

/** One meeting of a dot point, an outcome and a concept. */
export type AlignmentDot = { point: AreaPoint; n: number; concept: string; refs: string[]; link: LinkStrength };

export type HeatHit = { point: AreaPoint; refs: string[]; link: LinkStrength };

/** The alignment covers Year 12 English Advanced, so any English Advanced subject not marked Year 11. */
export function subjectUsesAlignment(title: string): boolean {
  return /english\s+advanced/i.test(title) && !/(year\s*11|\by?11\b)/i.test(title);
}

export const conceptKeyOf = (ref: string): string => ref.replace(/\d+$/, '');
export const bulletNumberOf = (ref: string): number => Number(ref.slice(conceptKeyOf(ref).length));

export function pointsFor(doc: Alignment, areaId: string | 'all'): AreaPoint[] {
  return doc.focus_areas
    .filter((f) => areaId === 'all' || f.id === areaId)
    .flatMap((f) => f.points.map((p) => ({ ...p, area: f.id, areaName: f.name })));
}

export function conceptByKey(doc: Alignment): Map<string, AlignmentConcept> {
  return new Map(doc.concepts.map((c) => [c.key, c]));
}

export function bulletText(doc: Alignment, ref: string): { text: string; adv: boolean } | null {
  const concept = doc.concepts.find((c) => c.key === conceptKeyOf(ref));
  const bullet = concept?.bullets.find((b) => b.n === bulletNumberOf(ref));
  return bullet ? { text: bullet.text, adv: bullet.adv } : null;
}

/** Concepts any of these points touch, in booklet order. */
export function conceptsUsed(doc: Alignment, points: AreaPoint[]): AlignmentConcept[] {
  const used = new Set(points.flatMap((p) => p.concepts.map((c) => conceptKeyOf(c.ref))));
  return doc.concepts.filter((c) => used.has(c.key));
}

/** Solid only when the outcome link and at least one concept link both share wording. */
export function alignmentDots(points: AreaPoint[]): AlignmentDot[] {
  const dots: AlignmentDot[] = [];
  for (const point of points) {
    const byConcept = new Map<string, { refs: string[]; shared: boolean }>();
    for (const c of point.concepts) {
      const key = conceptKeyOf(c.ref);
      const row = byConcept.get(key) ?? { refs: [], shared: false };
      row.refs.push(c.ref);
      row.shared ||= c.link === 'shared';
      byConcept.set(key, row);
    }
    for (const o of point.outcomes) {
      for (const [concept, row] of byConcept) {
        dots.push({ point, n: o.n, concept, refs: row.refs, link: o.link === 'shared' && row.shared ? 'shared' : 'related' });
      }
    }
  }
  return dots;
}

/** Dot points linking outcome n and concept key. */
export function heatHits(points: AreaPoint[], n: number, key: string): HeatHit[] {
  const hits: HeatHit[] = [];
  for (const point of points) {
    const o = point.outcomes.find((x) => x.n === n);
    const cs = point.concepts.filter((c) => conceptKeyOf(c.ref) === key);
    if (!o || !cs.length) continue;
    hits.push({ point, refs: cs.map((c) => c.ref), link: o.link === 'shared' && cs.some((c) => c.link === 'shared') ? 'shared' : 'related' });
  }
  return hits;
}

/** Shared wording counts 1, a related idea counts half. */
export const heatScore = (hits: HeatHit[]): number => hits.reduce((sum, h) => sum + (h.link === 'shared' ? 1 : 0.5), 0);

/** Seven shade steps; zero stays empty. */
export function heatStep(score: number, max: number): number {
  if (score <= 0 || max <= 0) return 0;
  return Math.max(1, Math.min(7, Math.round((score / max) * 7)));
}

const STOP = new Set(
  'the and of to in a an for that their through text texts students ways way can may be are is as by with on or from own range different which these they its it how used use using one into such other others our we us all each this those has have them there at not both while when also so than more most being been within between particular various'.split(' ')
);

function stem(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  for (const s of ['isation', 'ization', 'ations', 'ation', 'ively', 'ings', 'ing', 'ities', 'ity', 'ies', 'ive', 'ed', 'es', 'al', 'ly', 's', 'e']) {
    if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  }
  return w;
}

const isContentWord = (w: string): boolean => w.length > 2 && !STOP.has(w.toLowerCase());

/** Word stems worth matching between two pieces of wording. */
export function wordStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.split(/[^A-Za-z’']+/)) if (isContentWord(w)) out.add(stem(w));
  return out;
}

/** Split wording into plain and shared runs, for highlighting. */
export function sharedRuns(text: string, stems: Set<string>): Array<{ text: string; shared: boolean }> {
  return text
    .split(/([A-Za-z’']+)/)
    .filter(Boolean)
    .map((part) => ({ text: part, shared: /^[A-Za-z’']+$/.test(part) && isContentWord(part) && stems.has(stem(part)) }));
}

/** Dot points that call on a thinking skill and reach outcome n. */
export function skillHits(points: AreaPoint[], n: number, skill: string): HeatHit[] {
  const hits: HeatHit[] = [];
  for (const point of points) {
    const o = point.outcomes.find((x) => x.n === n);
    if (!o || !(point.skills ?? []).includes(skill)) continue;
    hits.push({ point, refs: [], link: o.link });
  }
  return hits;
}

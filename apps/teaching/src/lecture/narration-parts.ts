// apps/teaching/src/lecture/narration-parts.ts
import type { Narration, NarrationPart } from '@/schemas/block';

/** Every take in play order, each with only the fields a take carries. */
export function narrationParts(narration: Narration | null | undefined): NarrationPart[] {
  if (!narration?.url) return [];
  const { url, duration_s, end_s } = narration;
  const first: NarrationPart = end_s === undefined ? { url, duration_s } : { url, duration_s, end_s };
  return [first, ...(narration.more ?? [])];
}

/** Seconds of a take that play: up to the cut when there is one. */
export function partLength(part: NarrationPart): number {
  if (part.end_s === undefined) return part.duration_s;
  return part.duration_s > 0 ? Math.min(part.end_s, part.duration_s) : part.end_s;
}

/** Seconds the whole narration plays. */
export function narrationLength(narration: Narration | null | undefined): number {
  return narrationParts(narration).reduce((sum, part) => sum + partLength(part), 0);
}

/** Back from a list of takes to a narration; undefined when no takes are left. */
export function fromParts(parts: NarrationPart[], transcript?: string): Narration | undefined {
  const [first, ...rest] = parts;
  if (!first) return undefined;
  const next: Narration = { ...first };
  if (transcript) next.transcript = transcript;
  if (rest.length) next.more = rest;
  return next;
}

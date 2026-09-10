import type { LessonLibraryRow } from './types';

export interface DuplicatePair {
  ids: [string, string];
  score: number;
  titles: [string, string];
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function findNearDuplicates(lessons: LessonLibraryRow[], threshold = 0.55): DuplicatePair[] {
  const bags = lessons.map((lesson) => ({
    lesson,
    tokens: tokens(`${lesson.title} ${lesson.excerpt ?? ''}`)
  }));
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < bags.length; i += 1) {
    for (let j = i + 1; j < bags.length; j += 1) {
      const left = bags[i]!;
      const right = bags[j]!;
      let score = jaccard(left.tokens, right.tokens);
      if (left.lesson.unit_id === right.lesson.unit_id) score = Math.min(1, score + 0.08);
      if (score >= threshold) {
        pairs.push({
          ids: [left.lesson.id, right.lesson.id],
          score,
          titles: [left.lesson.title, right.lesson.title]
        });
      }
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}

export function duplicateIdSet(pairs: DuplicatePair[]): Set<string> {
  const ids = new Set<string>();
  for (const pair of pairs) {
    ids.add(pair.ids[0]);
    ids.add(pair.ids[1]);
  }
  return ids;
}

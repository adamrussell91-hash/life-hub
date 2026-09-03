import type { LessonLibraryRow } from './types';

const SYNONYMS: Record<string, string[]> = {
  guilt: ['complicity', 'shame', 'responsibility', 'blame', 'remorse'],
  complicity: ['guilt', 'collusion', 'responsibility'],
  memory: ['recollection', 'nostalgia', 'past'],
  identity: ['self', 'persona', 'reputation'],
  'close reading': ['passage analysis', 'textual analysis', 'close-reading'],
  essay: ['writing', 'composition', 'extended response'],
  revision: ['review', 'exam prep', 'study'],
  assessment: ['task', 'exam', 'moderation'],
  discussion: ['socratic', 'seminar', 'dialogue'],
  hamlet: ['elision', 'revenge', 'denmark'],
  module: ['common module', 'module a', 'module b', 'module c']
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function expandQueryTokens(query: string): string[] {
  const raw = query.trim().toLowerCase();
  const tokens = new Set(tokenize(raw));
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (raw.includes(key) || tokens.has(key)) {
      for (const value of values) tokens.add(value);
    }
    for (const value of values) {
      if (raw.includes(value) || tokens.has(value)) {
        tokens.add(key);
        for (const extra of values) tokens.add(extra);
      }
    }
  }
  return [...tokens];
}

export function semanticScore(
  lesson: LessonLibraryRow,
  haystack: string,
  query: string,
  expanded = expandQueryTokens(query)
): number {
  if (expanded.length === 0) return 0;
  const hayTokens = new Set(tokenize(`${haystack} ${lesson.title}`));
  let hits = 0;
  for (const token of expanded) {
    if (haystack.includes(token) || hayTokens.has(token)) hits += 1;
  }
  return hits / expanded.length;
}

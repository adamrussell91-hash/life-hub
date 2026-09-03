import type { ContentSearchHit, SearchHit } from './types';

const MATCH_RANK: Record<SearchHit['match'], number> = {
  title: 0,
  code: 1,
  hierarchy: 2,
  action: 3,
  body: 4
};

function hitKey(hit: Pick<SearchHit, 'type' | 'id'>): string {
  return `${hit.type}:${hit.id}`;
}

export function mergeAndRankHits(
  client: SearchHit[],
  content: ContentSearchHit[],
  enrichBody: (hit: ContentSearchHit) => SearchHit
): SearchHit[] {
  const merged = new Map<string, SearchHit>();

  for (const hit of client) {
    merged.set(hitKey(hit), { ...hit });
  }

  for (const contentHit of content) {
    const key = hitKey(contentHit);
    const existing = merged.get(key);
    if (existing) {
      existing.snippet = contentHit.snippet;
      continue;
    }
    merged.set(key, enrichBody(contentHit));
  }

  return [...merged.values()]
    .sort((a, b) => {
      const rankDiff = MATCH_RANK[a.match] - MATCH_RANK[b.match];
      if (rankDiff !== 0) return rankDiff;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 30);
}

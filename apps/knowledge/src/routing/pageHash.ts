const PAGE_HASH = /^#page\/([^#/?\s]+)$/;

/** Same pattern the server applies (`isSafeKnowledgePageId` in netlify/functions/_shared/knowledge-data.mjs). */
const SAFE_PAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function isSafePageId(value: unknown): value is string {
  return typeof value === "string" && SAFE_PAGE_ID.test(value);
}

export function pageIdFromHash(hash: string): string | null {
  const match = PAGE_HASH.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function pageHashForId(pageId: string): string {
  return `#page/${encodeURIComponent(pageId)}`;
}

export function isPageHash(hash: string): boolean {
  return pageIdFromHash(hash) !== null;
}

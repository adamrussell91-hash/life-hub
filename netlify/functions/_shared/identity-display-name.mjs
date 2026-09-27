/**
 * Clean identity labels that were polluted with Notion URL / profile-text
 * debris, and key them for Blobs↔GitHub twin dedupe.
 *
 * `people.json` / `organisations.json` display_names are clean; live Blobs
 * twins and profile fields (`current_workplace`, Notes labels) sometimes
 * leak `https://app.notion.com/p/…` or bare `p/` into the name slot.
 */

const NOTION_PAGE_URL =
  /^(?:https?:\/\/)?(?:www\.)?(?:app\.)?notion\.(?:so|com)\/(?:[^/\s]+\/)*?(?:p\/)?([^?\s#/]+)(?:[?#].*)?$/i;

export function cleanIdentityDisplayName(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return '';

  const md = text.match(/^\[([^\]]+)\]\(\s*https?:\/\/[^)]+\)\s*$/i);
  if (md) text = md[1].trim();

  if (/notion\.(?:so|com)/i.test(text)) {
    const notion = text.match(NOTION_PAGE_URL);
    if (notion) text = notionSlugToTitle(notion[1]);
  }

  text = text.replace(/^p\//i, '');
  // Leaked Notion slug (Title-Case-Words + trailing 32-hex / UUID page id)
  if (
    /-(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
      text
    )
  ) {
    text = notionSlugToTitle(text);
  }
  // "Name (https://…)" — same shape as workplace export pollution
  text = text.replace(/\s*\(\s*https?:\/\/[^)]+\)\s*/gi, ' ');
  text = text.replace(/\s+https?:\/\/\S+/gi, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  // Bare leftover URL with no recoverable title is not a display name.
  if (/^https?:\/\//i.test(text)) return '';
  return text;
}

function notionSlugToTitle(slug) {
  let s = decodeURIComponent(String(slug || '')).replace(/^p\//i, '');
  // Trailing page id: 32 hex, or dashed UUID
  s = s.replace(/-[0-9a-f]{32}$/i, '');
  s = s.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
  return s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Stable identity key for twin detection after cleaning. */
export function identityNameKey(raw) {
  return cleanIdentityDisplayName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prefer the richer twin when Blobs and GitHub both hold the same human/org
 * under different ids. GitHub import usually carries `employee_at` / profile;
 * Blobs twins are often relationship-empty hermits with polluted labels.
 *
 * @param {{ relationships?: unknown[], record: object, source: 'blob'|'github' }} a
 * @param {{ relationships?: unknown[], record: object, source: 'blob'|'github' }} b
 */
export function preferIdentityTwin(a, b) {
  const score = (row) => {
    let s = (row.relationships?.length ?? 0) * 10;
    if (row.record?.is_self) s += 1000;
    if (row.record?.professional_profile) s += 20;
    if (row.source === 'github') s += 5;
    const raw = String(row.record?.display_name ?? '');
    if (!/https?:\/\//i.test(raw) && !/^p\//i.test(raw) && !/notion\.(?:so|com)/i.test(raw)) {
      s += 2;
    }
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

/**
 * Clean labels and collapse Blobs↔GitHub twins that share an identity name key.
 * Id collision is already handled by callers (skip GitHub when native id matches).
 * Same-source rows that share a name (two Blob people both called "Test Person",
 * or two GitHub imports) are kept — only cross-source twins collapse. Collapsing
 * same-source rows before relationship hydration wiped distinct people that
 * share a label.
 *
 * @template {{ relationships?: unknown[] }} TRow
 * @param {TRow[]} rows
 * @param {(row: TRow) => object} getRecord — person or organisation record
 * @param {(row: TRow, record: object) => TRow} withRecord
 * @param {(row: TRow) => 'blob'|'github'} getSource
 * @returns {TRow[]}
 */
export function dedupeIdentityRows(rows, getRecord, withRecord, getSource) {
  const byKey = new Map();
  const passthrough = [];

  for (const row of rows) {
    const record = getRecord(row);
    if (!record) continue;
    const cleaned = cleanIdentityDisplayName(record.display_name);
    // URL-only / unparseable pollution → drop; not a usable identity label.
    if (!cleaned) continue;

    const nextRecord =
      cleaned === record.display_name ? record : { ...record, display_name: cleaned };
    const keyed = withRecord(row, nextRecord);
    const key = identityNameKey(cleaned);
    if (!key) {
      passthrough.push(keyed);
      continue;
    }

    const source = getSource(row);
    const candidate = {
      row: keyed,
      relationships: keyed.relationships,
      record: nextRecord,
      source
    };
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, candidate);
      continue;
    }
    // Same source → distinct records that happen to share a label. Keep both.
    if (prev.source === source) {
      passthrough.push(keyed);
      continue;
    }
    byKey.set(key, preferIdentityTwin(candidate, prev));
  }

  return [...[...byKey.values()].map((c) => c.row), ...passthrough];
}

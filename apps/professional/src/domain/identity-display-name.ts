/**
 * Client mirror of `netlify/functions/_shared/identity-display-name.mjs`.
 * Strip Notion URL / `p/` debris so person-pane titles and initials match
 * the cleaned directory rows.
 */

const NOTION_PAGE_URL =
  /^(?:https?:\/\/)?(?:www\.)?(?:app\.)?notion\.(?:so|com)\/(?:[^/\s]+\/)*?(?:p\/)?([^?\s#/]+)(?:[?#].*)?$/i;

function notionSlugToTitle(slug: string): string {
  let s = decodeURIComponent(String(slug || '')).replace(/^p\//i, '');
  s = s.replace(/-[0-9a-f]{32}$/i, '');
  s = s.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
  return s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanIdentityDisplayName(raw: string | null | undefined): string {
  let text = String(raw ?? '').trim();
  if (!text) return '';

  const md = text.match(/^\[([^\]]+)\]\(\s*https?:\/\/[^)]+\)\s*$/i);
  if (md) text = md[1]!.trim();

  if (/notion\.(?:so|com)/i.test(text)) {
    const notion = text.match(NOTION_PAGE_URL);
    if (notion) text = notionSlugToTitle(notion[1]!);
  }

  text = text.replace(/^p\//i, '');
  if (
    /-(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
      text
    )
  ) {
    text = notionSlugToTitle(text);
  }
  text = text.replace(/\s*\(\s*https?:\/\/[^)]+\)\s*/gi, ' ');
  text = text.replace(/\s+https?:\/\/\S+/gi, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (/^https?:\/\//i.test(text)) return '';
  return text;
}

/**
 * A person's roles (employee_at / member_of) and education (studied_at),
 * read from their entity overview. Pure: no DOM, no fetch.
 *
 * Dates are month precision on the wire (`YYYY-MM-01T00:00:00.000Z`). A date
 * of 1 January is shown as the year alone, since that is how "2016" is saved.
 */

import type { EntityOverview, RelationshipEntry } from '@/domain/types';

export type RoleLinkType = 'employee_at' | 'member_of' | 'studied_at';

export interface PersonRole {
  linkId: string;
  type: RoleLinkType;
  kind: 'role' | 'education';
  orgRef: string;
  orgName: string;
  title: string | null;
  from: string | null;
  to: string | null;
  current: boolean;
  /** From the Notion import: editing writes a native copy; it can't be removed. */
  imported: boolean;
}

const ROLE_TYPES = new Set<string>(['employee_at', 'member_of', 'studied_at']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isCurrentLink(link: RelationshipEntry['link']): boolean {
  return link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');
}

function time(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

export function orgMonogram(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ORG';
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

/** Current first, then newest start first. Education sorts the same way. */
export function rolesFromOverview(overview: EntityOverview): PersonRole[] {
  const entries = [...(overview.current_relationships ?? []), ...(overview.historical_relationships ?? [])];
  const seen = new Set<string>();
  const roles: PersonRole[] = [];
  for (const entry of entries) {
    const { link, endpoint } = entry;
    if (!ROLE_TYPES.has(link.relationship_type) || endpoint.kind !== 'organisation') continue;
    if (link.status === 'suppressed' || seen.has(link.id)) continue;
    seen.add(link.id);
    const title = typeof link.role === 'string' && link.role.trim() ? link.role.trim() : null;
    roles.push({
      linkId: link.id,
      type: link.relationship_type as RoleLinkType,
      kind: link.relationship_type === 'studied_at' ? 'education' : 'role',
      orgRef: endpoint.ref,
      orgName: endpoint.display_label,
      title,
      from: link.valid_from ?? null,
      to: link.valid_to ?? null,
      current: isCurrentLink(link),
      imported: Boolean((link as { import_source?: unknown }).import_source)
    });
  }
  return roles.sort(
    (a, b) => Number(b.current) - Number(a.current) || time(b.from) - time(a.from)
  );
}

export function currentRoles(roles: PersonRole[]): PersonRole[] {
  return roles.filter((r) => r.kind === 'role' && r.current);
}

/**
 * "2016", "2016-03", "3/2016", "Mar 2016", "March 2016" → ISO at the first
 * of the month. Empty → null. Anything else → undefined (invalid).
 */
export function parseMonthYear(text: string): string | null | undefined {
  const value = text.trim();
  if (!value) return null;
  let year: number | null = null;
  let month = 1;
  let m: RegExpMatchArray | null;
  if ((m = value.match(/^(\d{4})$/))) {
    year = Number(m[1]);
  } else if ((m = value.match(/^(\d{4})-(\d{1,2})$/))) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else if ((m = value.match(/^(\d{1,2})\/(\d{4})$/))) {
    year = Number(m[2]);
    month = Number(m[1]);
  } else if ((m = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/))) {
    const idx = MONTHS.findIndex((name) => m![1]!.toLowerCase().startsWith(name.toLowerCase()));
    if (idx < 0) return undefined;
    year = Number(m[2]);
    month = idx + 1;
  }
  if (year === null || year < 1900 || year > 2100 || month < 1 || month > 12) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
}

function parts(iso: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function yearOnly(p: { month: number; day: number }): boolean {
  return p.month === 1 && p.day === 1;
}

/** The value an input shows for a saved date: "2016" or "2016-03". */
export function monthYearInput(iso: string | null): string {
  const p = parts(iso);
  if (!p) return '';
  return yearOnly(p) ? String(p.year) : `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/** "2016" or "Mar 2016". */
export function formatMonthYear(iso: string | null): string {
  const p = parts(iso);
  if (!p) return '';
  return yearOnly(p) ? String(p.year) : `${MONTHS[p.month - 1]} ${p.year}`;
}

export function formatYear(iso: string | null): string {
  const p = parts(iso);
  return p ? String(p.year) : '';
}

/**
 * "Mar 2016 – now", "2016 – 2022", "2016" (a single year), or "" with no
 * dates. `yearsOnly` gives the timeline's "2016 – 2022".
 */
export function formatRange(
  role: Pick<PersonRole, 'from' | 'to' | 'current'>,
  options: { yearsOnly?: boolean } = {}
): string {
  const fmt = options.yearsOnly ? formatYear : formatMonthYear;
  const from = fmt(role.from);
  const to = role.current ? 'now' : fmt(role.to);
  if (!from && !to) return '';
  if (!from) return role.current ? '' : `until ${to}`;
  if (!to || to === from) return role.current ? `${from} – now` : from;
  return `${from} – ${to}`;
}

/** "Head of English, Tallowwood College" or just the organisation. */
export function roleLabel(role: Pick<PersonRole, 'title' | 'orgName'>): string {
  return role.title ? `${role.title}, ${role.orgName}` : role.orgName;
}

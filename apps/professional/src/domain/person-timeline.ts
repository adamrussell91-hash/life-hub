/**
 * One timeline for a person: career entries (roles and education, keyed by
 * `valid_from`) merged with touchpoints with Adam (meetings, notes, tasks).
 * Newest first, grouped by year. Pure: no DOM.
 */

import { formatRange, roleLabel, type PersonRole } from '@/domain/person-roles';

export interface TimelinePoint {
  id: string;
  at: string;
  label: string;
}

export interface TimelineRow {
  id: string;
  kind: 'role' | 'education' | 'touchpoint';
  /** ISO sort key; null for an undated role (listed last). */
  at: string | null;
  text: string;
  /** Career: "2016 – 2022" / "2016 – now". Touchpoint: "12 Mar". */
  when: string;
  orgRef?: string;
  orgName?: string;
}

export interface TimelineYear {
  year: string;
  rows: TimelineRow[];
}

export const TIMELINE_COLLAPSE_AT = 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function time(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** "12 Mar" in the hub's time zone-free reading of the date. */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function buildPersonTimeline(roles: PersonRole[], points: TimelinePoint[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const role of roles) {
    rows.push({
      id: `career:${role.linkId}`,
      kind: role.kind,
      at: role.from,
      text: roleLabel(role),
      when: formatRange(role, { yearsOnly: true }),
      orgRef: role.orgRef,
      orgName: role.orgName
    });
  }
  for (const point of points) {
    if (Number.isNaN(Date.parse(point.at))) continue;
    rows.push({ id: `touch:${point.id}`, kind: 'touchpoint', at: point.at, text: point.label, when: dayMonth(point.at) });
  }
  return rows.sort((a, b) => time(b.at) - time(a.at) || a.text.localeCompare(b.text));
}

/** Year groups in row order; undated rows fall under "Undated". */
export function groupTimelineByYear(rows: TimelineRow[]): TimelineYear[] {
  const groups: TimelineYear[] = [];
  for (const row of rows) {
    const year = row.at && !Number.isNaN(Date.parse(row.at)) ? String(new Date(row.at).getUTCFullYear()) : 'Undated';
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }
  return groups;
}

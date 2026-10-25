import { el } from '@/quiz/dom';
import { TAG_KINDS, TAG_KIND_LABEL, type TagKind } from '@/evidence/types';
import type { HistoryEvent, SavedGroup } from './schema';
import { formatDay } from './calc';

/**
 * History: every saved group, active and retired, with each member's record:
 * when they joined and why, the practice they received and how they did, and
 * when their marks showed they were secure. Read from the stored events only.
 */

export type HistoryStatus = 'active' | 'retired' | 'all';
export type HistoryState = { status: HistoryStatus; kind: TagKind | 'any'; open: Set<string> };
export const newHistoryState = (): HistoryState => ({ status: 'all', kind: 'any', open: new Set() });

export type HistoryLine = { day: string; text: string; kind: HistoryEvent['kind'] };

/** One student's record, oldest first; a quiz's received and result share a line. */
export function studentTimeline(student: string, history: HistoryEvent[], groupId?: string): HistoryLine[] {
  const mine = history.filter((e) => 'student' in e && e.student === student && (!groupId || e.group === groupId));
  const results = new Map<string, HistoryEvent>();
  for (const e of mine) if (e.kind === 'result') results.set(`${e.group}:${e.source}`, e);
  const lines: HistoryLine[] = [];
  for (const e of mine) {
    if (e.kind === 'joined') lines.push({ day: e.day, kind: e.kind, text: `${e.name}: joined ${formatDay(e.day)}${e.why ? ` (${e.why})` : ''}` });
    else if (e.kind === 'received') {
      const r = results.get(`${e.group}:${e.source}`);
      const n = `${e.questions} practice ${e.questions === 1 ? 'question' : 'questions'}`;
      lines.push({ day: e.day, kind: e.kind, text: `${e.title}, ${formatDay(e.day)}: ${n}${r && r.kind === 'result' ? `, ${r.score}/${r.max}` : ''}` });
    } else if (e.kind === 'left') lines.push({ day: e.day, kind: e.kind, text: `Left ${formatDay(e.day)}${e.why ? ` (${e.why})` : ''}` });
  }
  return lines;
}

const kindOf = (tag: string): string => tag.slice(0, tag.indexOf(':'));

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (v: T) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', 'ev-switch__pill', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    group.append(b);
  }
  return group;
}

export type HistoryOptions = {
  groups: SavedGroup[];
  history: HistoryEvent[];
  names: ReadonlyMap<string, string>;
  label: (tag: string) => string;
  state: HistoryState;
  repaint: () => void;
  openStudent?: (studentId: string) => void;
};

export function renderHistory(o: HistoryOptions): HTMLElement {
  const root = el('div', 'mb-hist');
  const { state } = o;
  const bar = el('div', 'mb-hist__bar');
  bar.append(
    pills<HistoryStatus>('Status', [['all', 'All'], ['active', 'Active'], ['retired', 'Retired']], state.status, (v) => {
      state.status = v;
      o.repaint();
    }),
    pills<TagKind | 'any'>('Tag kind', [['any', 'Any'], ...TAG_KINDS.map((k): [TagKind, string] => [k, TAG_KIND_LABEL[k]])], state.kind, (v) => {
      state.kind = v;
      o.repaint();
    })
  );
  root.append(bar);
  const shown = o.groups
    .filter((g) => (state.status === 'all' ? true : state.status === 'active' ? g.retired === null : g.retired !== null))
    .filter((g) => state.kind === 'any' || g.tags.some((t) => kindOf(t) === state.kind))
    .sort((a, b) => b.started.localeCompare(a.started));
  if (!shown.length) {
    root.append(el('p', 'mb__empty', o.groups.length ? 'No groups match.' : 'Save a group from Next steps to start its history.'));
    return root;
  }
  for (const g of shown) {
    const card = el('article', 'mb-hist__group');
    const left = g.members.filter((m) => m.left !== null).length;
    const head = el('button', 'mb-hist__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(state.open.has(g.id)));
    head.append(
      el('span', 'mb-hist__name', g.name),
      el('span', 'mb-hist__meta', `${g.tags.map(o.label).join(' · ')} · ${formatDay(g.started)}${g.retired ? `–${formatDay(g.retired)} · retired` : ' · active'} · ${g.members.length} joined · ${left} left`)
    );
    head.addEventListener('click', () => {
      if (state.open.has(g.id)) state.open.delete(g.id);
      else state.open.add(g.id);
      o.repaint();
    });
    card.append(head);
    if (state.open.has(g.id)) {
      const list = el('div', 'mb-hist__members');
      for (const m of g.members) {
        const row = el('div', 'mb-hist__member');
        const who = el('button', 'mb-hist__who', o.names.get(m.student) ?? 'Removed student');
        who.type = 'button';
        who.addEventListener('click', () => o.openStudent?.(m.student));
        const lines = el('ol', 'mb-hist__lines');
        for (const line of studentTimeline(m.student, o.history, g.id)) lines.append(el('li', `mb-hist__line mb-hist__line--${line.kind}`, line.text));
        row.append(who, lines);
        list.append(row);
      }
      card.append(list);
    }
    root.append(card);
  }
  return root;
}

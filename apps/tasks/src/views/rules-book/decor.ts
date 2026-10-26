// apps/tasks/src/views/rules-book/decor.ts
/**
 * The Rules Book's small pieces: the session track (Ground, Apply a rule, Act, Review), the
 * group strip above the canvas, the coach look and a few helpers. They sit in Problem Solver's
 * layout classes (ps-track) so the tools read as a set; the shapes and colours are the book's
 * own (rules-book.css), after the pack's emblems. Every string here is static markup; user text
 * is always set with textContent elsewhere.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/rules-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../../packages/rules-book/commit-slots.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/rules-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A registered tool by id (the Rules Book's ids are strings the toolkit's id type does not list). */
export const toolNamed = (id: string): { name: string; when: string } | undefined => (TOOLS as Record<string, { name: string; when: string }>)[id];

/** A rule's name for a label: without its leading "The", starting with a capital. */
export function plainName(id: string): string {
  const name = (toolNamed(id)?.name ?? id).replace(/^The /, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── Marks, in the pack's shapes (100×100) ─────────────────────────────── */

const B = 'var(--rb-indigo)';
const O = 'var(--rb-orange)';
const I = 'var(--rb-ink)';
const Y = 'var(--rb-yellow)';
const G = 'var(--rb-grey)';

/** The closed box: the rule, the first reading. */
export const CLOSED_BOX = `<polygon points="50,18 82,31 50,44 18,31" fill="${O}"/><polygon points="18,31 50,44 50,82 18,69" fill="${O}" opacity="0.8"/><polygon points="82,31 50,44 50,82 82,69" fill="${O}" opacity="0.62"/>`;
/** The bulb: the question to ask. */
export const BULB = `<circle cx="50" cy="40" r="20" fill="${Y}" stroke="${I}" stroke-width="4"/><rect x="42" y="62" width="16" height="9" fill="${G}"/><line x1="50" y1="10" x2="50" y2="16" stroke="${G}" stroke-width="4" stroke-linecap="round"/><line x1="24" y1="22" x2="28" y2="26" stroke="${G}" stroke-width="4" stroke-linecap="round"/><line x1="76" y1="22" x2="72" y2="26" stroke="${G}" stroke-width="4" stroke-linecap="round"/>`;
const GROUND = `<line x1="14" y1="76" x2="86" y2="76" stroke="${I}" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="42" r="22" fill="none" stroke="${B}" stroke-width="6"/><circle cx="50" cy="42" r="8" fill="${O}"/>`;
const ACT = `<path d="M14 86L66 34" stroke="${I}" stroke-width="8" stroke-linecap="round"/><path d="M88 12L56 24L76 44Z" fill="${O}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
const REVIEW = `<rect x="18" y="26" width="64" height="52" fill="none" stroke="${B}" stroke-width="6"/><line x1="18" y1="42" x2="82" y2="42" stroke="${B}" stroke-width="6"/><circle cx="62" cy="62" r="9" fill="${O}"/>`;
const STATION_ART = [GROUND, BULB, ACT, REVIEW];
const STATION_NAMES = ['Ground', 'Apply a rule', 'Act', 'Review'];

export const MARKS = { ground: GROUND, act: ACT, review: REVIEW };

/* ── Track ──────────────────────────────────────────────────────────── */

/** "5 Nov" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

type Station = { name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string };

/** Where the session is (0 Ground … 3 Review, 4 finished) and each station's state and note. */
export function trackStations(session: PsSession): { at: number; stations: Station[] } {
  const order = ['frame', 'explore', 'commit', 'review'];
  const at = session.phase === 'finished' ? 4 : Math.max(0, order.indexOf(session.phase));
  const active = (step: string) => {
    const runs = session.steps?.[step]?.runs ?? [];
    return runs.find((run) => run.status === 'active') ?? runs.filter((run) => run.status !== 'switched').at(-1) ?? null;
  };
  const worked = (session.steps?.explore?.runs ?? []).filter((run) => run.status !== 'switched' && run.nodes.length);
  const waiting = session.reviewState?.status === 'waiting';
  const due = session.reviewState?.due ?? session.reviewProposal?.due ?? null;
  const exploreNote = () => {
    if (at === 1) return active('explore') ? plainName(active('explore')!.tool) : 'Pick a rule';
    if (worked.length === 1) return plainName(worked[0].tool);
    return worked.length ? `${worked.length} rules` : '';
  };
  const notes = [
    at === 0 ? `Question ${Math.min(Object.values(session.frame ?? {}).filter(Boolean).length + 1, 3)} of 3` : 'Done',
    exploreNote(),
    at === 2 ? ((active('commit')?.tool as string | undefined) === COMMIT_ID ? 'The experiment' : 'Set it up') : at > 2 ? 'Set' : '',
    waiting && due ? `Check ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Check ${shortDate(due)}` : ''
  ];
  const stations = STATION_NAMES.map((name, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name, state: state as Station['state'], note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Stations for Ground, Apply a rule, Act and Review, joined by a dashed line. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track rb-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line rb-track__line');
  nav.append(list);
  let key = '';
  return {
    el: nav,
    update(session) {
      const { at, stations } = trackStations(session);
      const next = JSON.stringify(stations);
      if (next === key) return;
      key = next;
      list.style.setProperty('--ps-track-p', String(Math.min(at, 3) / 3));
      list.replaceChildren(...stations.map((station, i) => {
        const item = el('li', 'ps-track__stn rb-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark rb-track__mark');
        mark.append(svg('0 0 100 100', STATION_ART[i]));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'rb-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Groups ─────────────────────────────────────────────────────────── */

/** One line per group: what it means for the situation, in our words. */
const GROUP_LINES: Record<string, string> = {
  workplace: 'Time, deadlines, meetings, teams and the commitments you take on.',
  change: 'A change, an idea or a new way of working, and what it might set off.',
  people: 'Yourself, a colleague or a manager, and how you read each other.',
  life: 'A bigger choice, or an explanation that has set harder than the facts.'
};

export type GroupsView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The four group emblems in a row above the canvas. Lit groups are ringed and the rest fade;
 * hidden until the group is answered.
 */
export function createGroups(): GroupsView {
  const box = el('section', 'rb-groups');
  box.hidden = true;
  const row = el('ol', 'rb-groups__row');
  const items = new Map<string, HTMLElement>();
  for (const group of GROUPS) {
    const item = el('li', 'rb-groups__item');
    const emblem = el('span', 'rb-groups__em');
    emblem.append(sectionEmblem(group.section));
    item.append(emblem, el('span', 'rb-groups__label', group.label));
    items.set(group.id, item);
    row.append(item);
  }
  const text = el('p', 'rb-groups__text');
  box.append(row, text);
  let key = '';
  return {
    el: box,
    update(session) {
      const lit: string[] = parseGroups(session.frame?.group ?? '');
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      box.hidden = !lit.length;
      for (const [id, item] of items) {
        item.dataset.lit = String(lit.includes(id));
        if (lit.includes(id)) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      }
      const label = (id: string) => GROUPS.find((g) => g.id === id)!.label;
      text.replaceChildren(...lit.flatMap((id, i) => [...(i ? [document.createTextNode(' ')] : []), el('b', '', `${label(id)}.`), document.createTextNode(` ${GROUP_LINES[id]}`)]));
      box.setAttribute('aria-label', `Part of life: ${lit.map(label).join(' and ')}`);
    }
  };
}

export const groupLine = (id: string): string => GROUP_LINES[id] ?? '';

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The book emblem, small: the coach's avatar. */
export function rbAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar rb-avatar');
  span.append(bookEmblem());
  return span;
}

/** The experiment's mark: the arrow into the closed box. */
function commitMark(): HTMLSpanElement {
  const span = el('span', 'rb-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', ACT));
  return span;
}

/** The review's mark: the open box with the orange dot. */
function reviewMark(): HTMLSpanElement {
  const span = el('span', 'rb-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', REVIEW));
  return span;
}

/** How the shared coach panel looks in the Rules Book. */
export const RB_LOOK: CoachLook = {
  avatar: rbAvatar,
  emblem: (tool) => (tool === COMMIT_ID ? commitMark() : tool === REVIEW_ID ? reviewMark() : entryEmblem(tool)),
  frames: {
    rules: {
      keys: ['situation', 'group', 'known'],
      prompts: ['What is the situation?', 'Which part of life is it in?', 'What do you already know?']
    }
  },
  noun: 'Session'
};

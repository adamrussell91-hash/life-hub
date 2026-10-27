/**
 * The Change Book's small pieces: the session track (Name it, Apply a model, Act, Review), the
 * group strip above the canvas, the coach look and a few helpers. They sit in Problem Solver's
 * layout classes (ps-track) so the tools read as a set; the shapes and colours are the book's
 * own (change-book.css), after the pack's graphic language: teal paths and one copper hinge on
 * ivory paper. Every string here is static markup; user text is always set with textContent
 * elsewhere. As the Rules Book's decor.ts.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/change-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../../packages/change-book/commit-slots.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/change-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';

/** A registered tool by id (the Change Book's ids are strings the toolkit's id type does not list). */
export const toolNamed = (id: string): { name: string; when: string } | undefined => (TOOLS as Record<string, { name: string; when: string }>)[id];

/** A model's name for a label: without its leading "The", starting with a capital. */
export function plainName(id: string): string {
  const name = (toolNamed(id)?.name ?? id).replace(/^The /, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Static markup as an SVG element. The HTML parser puts <svg> in the SVG namespace, so the
 * namespace URL (whose year the copy check would read as a dated snapshot) never ships here.
 */
export function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const holder = document.createElement('span');
  holder.innerHTML = `<svg>${markup}</svg>`;
  const node = holder.firstElementChild as SVGSVGElement;
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── Marks, in the pack's language (100×100): teal paths, one copper hinge, ink for weight ── */

const T = 'var(--ch-teal)';
const C = 'var(--ch-copper)';
const I = 'var(--ch-ink)';

/** The copper hinge at the centre of every mark. */
const HINGE = (x = 50, y = 50) => `<polygon points="${x},${y - 9} ${x + 9},${y} ${x},${y + 9} ${x - 9},${y}" fill="${C}"/>`;
const CORNERS = `<path d="M14 30V14H30 M86 70V86H70" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Name it: a straight run reaching the hinge, where it could turn. */
const NAME = `${CORNERS}<path d="M22 50H41" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/><path d="M59 50H78" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>${HINGE()}`;
/** Select: one path branching at the hinge into two. */
export const BRANCH = `${CORNERS}<path d="M22 50H41" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/><path d="M57 45C66 40 70 30 78 28 M57 55C66 60 70 70 78 72" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/>${HINGE()}`;
/** Apply: a grid of runs gathered through the hinge onto one line. */
export const LENS = `${CORNERS}<path d="M24 32H40 M24 50H41 M24 68H40" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/><path d="M40 32C46 32 46 46 41 50 M40 68C46 68 46 54 41 50" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/><path d="M59 50H78" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/>${HINGE()}`;
/** Act: an ink anchor, then a path stepping up through the hinge. */
const ACT = `${CORNERS}<rect x="20" y="64" width="20" height="10" rx="2" fill="${I}"/><path d="M30 64V50H41 M57 45L78 26" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>${HINGE()}`;
/** Review: a path that loops back to the hinge it left. */
const REVIEW = `${CORNERS}<path d="M58 50H70C80 50 80 30 64 30H36C20 30 20 50 30 50H41" fill="none" stroke="${T}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 68H70" fill="none" stroke="${I}" stroke-width="8" stroke-linecap="round"/>${HINGE()}`;
const STATION_ART = [NAME, BRANCH, ACT, REVIEW];
const STATION_NAMES = ['Name it', 'Apply a model', 'Act', 'Review'];

export const MARKS = { name: NAME, act: ACT, review: REVIEW };

/* ── Track ──────────────────────────────────────────────────────────── */

/** "5 Nov" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

type Station = { name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string };

/** Where the session is (0 Name it … 3 Review, 4 finished) and each station's state and note. */
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
    if (at === 1) return active('explore') ? plainName(active('explore')!.tool) : 'Pick a model';
    if (worked.length === 1) return plainName(worked[0].tool);
    return worked.length ? `${worked.length} models` : '';
  };
  const notes = [
    at === 0 ? `Question ${Math.min(Object.values(session.frame ?? {}).filter(Boolean).length + 1, 3)} of 3` : 'Done',
    exploreNote(),
    at === 2 ? ((active('commit')?.tool as string | undefined) === COMMIT_ID ? 'The step' : 'Set it up') : at > 2 ? 'Set' : '',
    waiting && due ? `Review ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Review ${shortDate(due)}` : ''
  ];
  const stations = STATION_NAMES.map((name, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name, state: state as Station['state'], note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Stations for Name it, Apply a model, Act and Review, joined by a teal path. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track ch-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line ch-track__line');
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
        const item = el('li', 'ps-track__stn ch-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark ch-track__mark');
        mark.append(svg('0 0 100 100', STATION_ART[i]));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'ch-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Groups ─────────────────────────────────────────────────────────── */

/** One line per group: what it covers, in our words. */
const GROUP_LINES: Record<string, string> = {
  world: 'Systems, networks, science and the wider forces shaping what happens.',
  self: 'Who you are, how you see other people, and what gives life meaning.',
  mine: 'Your choices, your attention, your habits and how you meet a change.',
  ours: 'Teams, trust, shared ideas and the future a group prepares for.'
};

export type GroupsView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The four group emblems in a row above the canvas. Lit groups are ringed and the rest fade;
 * hidden until the group is answered.
 */
export function createGroups(): GroupsView {
  const box = el('section', 'ch-groups');
  box.hidden = true;
  const row = el('ol', 'ch-groups__row');
  const items = new Map<string, HTMLElement>();
  for (const group of GROUPS) {
    const item = el('li', 'ch-groups__item');
    const emblem = el('span', 'ch-groups__em');
    emblem.append(sectionEmblem(group.section));
    item.append(emblem, el('span', 'ch-groups__label', group.label));
    items.set(group.id, item);
    row.append(item);
  }
  const text = el('p', 'ch-groups__text');
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
      box.setAttribute('aria-label', `Where the change sits: ${lit.map(label).join(' and ')}`);
    }
  };
}

export const groupLine = (id: string): string => GROUP_LINES[id] ?? '';

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The book emblem, small: the coach's avatar. */
export function chAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar ch-avatar');
  span.append(bookEmblem());
  return span;
}

function markOf(art: string): HTMLSpanElement {
  const span = el('span', 'ch-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', art));
  return span;
}

/** How the shared coach panel looks in the Change Book. */
export const CH_LOOK: CoachLook = {
  avatar: chAvatar,
  emblem: (tool) => (tool === COMMIT_ID ? markOf(ACT) : tool === REVIEW_ID ? markOf(REVIEW) : entryEmblem(tool)),
  frames: {
    change: {
      keys: ['change', 'group', 'stay'],
      prompts: ['What is changing?', 'Where does it sit?', 'What should stay?']
    }
  },
  noun: 'Session'
};

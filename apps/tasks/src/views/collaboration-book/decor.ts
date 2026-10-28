/**
 * The Collaboration Book's small pieces: the session track (Locate, Work a model, Agree, Review),
 * the group strip above the canvas, the coach look and a few helpers. They sit in Problem
 * Solver's layout classes (ps-track) so the tools read as a set; the shapes and colours are the
 * book's own (collaboration-book.css), after the pack's graphic language: purple ribbons, cyan
 * loops where people meet and one gold point of attention, on warm paper. Every string here is
 * static markup; user text is always set with textContent elsewhere. As the Change Book's
 * decor.ts.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/collaboration-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../../packages/collaboration-book/commit-slots.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/collaboration-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';

/** A registered tool by id (the Collaboration Book's ids are strings the toolkit's id type does not list). */
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

/* ── Marks, in the pack's language (100×100): purple ribbons, cyan loops, one gold point ── */

const P = 'var(--cb-purple)';
const C = 'var(--cb-cyan)';
const G = 'var(--cb-gold)';
const RIBBON = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

/** Locate: a ring around one gold point: the difficulty, found. */
const LOCATE = `<circle cx="50" cy="50" r="30" ${RIBBON} stroke="${P}" stroke-width="8"/><path d="M71 71L84 84" ${RIBBON} stroke="${P}" stroke-width="8"/><circle cx="50" cy="50" r="9" fill="${G}"/>`;
/** Choose: one loop picked out of two that cross. */
export const BRANCH = `<ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(45 50 50)" ${RIBBON} stroke="${C}" stroke-width="7"/><ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(-45 50 50)" ${RIBBON} stroke="${P}" stroke-width="7"/><circle cx="74" cy="26" r="8" fill="${G}"/>`;
/** Work: two loops interlocking around a shared centre, as on the cover. */
export const LENS = `<circle cx="50" cy="50" r="26" ${RIBBON} stroke="${G}" stroke-width="7"/><ellipse cx="50" cy="50" rx="36" ry="16" transform="rotate(45 50 50)" ${RIBBON} stroke="${C}" stroke-width="7"/><ellipse cx="50" cy="50" rx="36" ry="16" transform="rotate(-45 50 50)" ${RIBBON} stroke="${P}" stroke-width="7"/>`;
/** Agree: two paths joining into one that steps forward. */
const AGREE = `<path d="M16 28C34 28 40 50 52 50 M16 72C34 72 40 50 52 50 M52 50H80" ${RIBBON} stroke="${C}" stroke-width="7"/><path d="M70 40L82 50L70 60" ${RIBBON} stroke="${P}" stroke-width="7"/><circle cx="52" cy="50" r="8" fill="${G}"/>`;
/** Review: a loop that comes back to where it started. */
const REVIEW = `<path d="M60 26A26 26 0 1 1 30 34" ${RIBBON} stroke="${P}" stroke-width="8"/><path d="M28 18L30 34L46 32" ${RIBBON} stroke="${C}" stroke-width="7"/><circle cx="50" cy="52" r="8" fill="${G}"/>`;
/** Own part: a small figure inside a ring of others. */
const OWN = `<circle cx="50" cy="50" r="32" ${RIBBON} stroke="${C}" stroke-width="6" stroke-dasharray="10 9"/><circle cx="50" cy="42" r="9" fill="${G}"/><path d="M36 66C38 56 62 56 64 66" ${RIBBON} stroke="${P}" stroke-width="7"/>`;
const STATION_ART = [LOCATE, BRANCH, AGREE, REVIEW];
const STATION_NAMES = ['Locate', 'Work a model', 'Agree', 'Review'];

export const MARKS = { locate: LOCATE, agree: AGREE, review: REVIEW, own: OWN };

/* ── Track ──────────────────────────────────────────────────────────── */

/** "5 Nov" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

type Station = { name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string };

/** Where the session is (0 Locate … 3 Review, 4 finished) and each station's state and note. */
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
    at === 2 ? ((active('commit')?.tool as string | undefined) === COMMIT_ID ? 'The experiment' : 'Set it up') : at > 2 ? 'Agreed' : '',
    waiting && due ? `Review ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Review ${shortDate(due)}` : ''
  ];
  const stations = STATION_NAMES.map((name, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name, state: state as Station['state'], note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Stations for Locate, Work a model, Agree and Review, joined by a cyan path. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track cb-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line cb-track__line');
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
        const item = el('li', 'ps-track__stn cb-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark cb-track__mark');
        mark.append(svg('0 0 100 100', STATION_ART[i]));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'cb-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Groups ─────────────────────────────────────────────────────────── */

/** One line per group: what it covers, in our words. */
const GROUP_LINES: Record<string, string> = {
  problems: 'How a team is sized, organised and led, how it decides, and how it handles feedback and strain.',
  goals: 'Purpose, plans, decisions, meetings and the requests that compete for a team’s time.',
  trust: 'Culture, respect, safety, inclusion and how leaders’ behaviour lands on others.'
};

export type GroupsView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The three group emblems in a row above the canvas. Lit groups are ringed and the rest fade;
 * hidden until the group is answered.
 */
export function createGroups(): GroupsView {
  const box = el('section', 'cb-groups');
  box.hidden = true;
  const row = el('ol', 'cb-groups__row');
  const items = new Map<string, HTMLElement>();
  for (const group of GROUPS) {
    const item = el('li', 'cb-groups__item');
    const emblem = el('span', 'cb-groups__em');
    emblem.append(sectionEmblem(group.section));
    item.append(emblem, el('span', 'cb-groups__label', group.label));
    items.set(group.id, item);
    row.append(item);
  }
  const text = el('p', 'cb-groups__text');
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
      box.setAttribute('aria-label', `What the team needs: ${lit.map(label).join(' and ')}`);
    }
  };
}

export const groupLine = (id: string): string => GROUP_LINES[id] ?? '';

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The book emblem, small: the coach's avatar. */
export function cbAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar cb-avatar');
  span.append(bookEmblem());
  return span;
}

function markOf(art: string): HTMLSpanElement {
  const span = el('span', 'cb-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', art));
  return span;
}

/** How the shared coach panel looks in the Collaboration Book. */
export const CB_LOOK: CoachLook = {
  avatar: cbAvatar,
  emblem: (tool) => (tool === COMMIT_ID ? markOf(AGREE) : tool === REVIEW_ID ? markOf(REVIEW) : entryEmblem(tool)),
  frames: {
    collab: {
      keys: ['situation', 'group', 'outcome'],
      prompts: ['What happened in the team?', 'Problem, goal or trust?', 'What result would help?']
    }
  },
  noun: 'Session'
};

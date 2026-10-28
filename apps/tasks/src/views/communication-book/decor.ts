/**
 * The Communication Book's small pieces: the session track (Name, Work a model, Commit, Review),
 * the group strip above the canvas, the coach look and a few helpers. They sit in Problem
 * Solver's layout classes (ps-track) so the tools read as a set; the shapes and colours are the
 * book's own (communication-book.css), after the pack's graphic language: black bars for what is
 * said, grey for what is heard or held back, one gold point, square ends, on warm near-white
 * paper. Every string here is static markup; user text is always set with textContent elsewhere.
 * As the Collaboration Book's decor.ts.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { GROUPS, parseGroups } from '../../../../../packages/communication-book/route.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../../packages/communication-book/commit-slots.mjs';
import { bookEmblem, entryEmblem, sectionEmblem } from '../../../../../packages/communication-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';

/** A registered tool by id (the Communication Book's ids are strings the toolkit's id type does not list). */
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

/* ── Marks, in the pack's language (100×100): ink bars, grey bars, one gold point, square ends ── */

const I = 'var(--cmb-ink)';
const R = 'var(--cmb-grey)';
const G = 'var(--cmb-gold)';

/** The pack's quotation mark (a square head with a cut wedge tail) at x, y, scaled by s. */
const quote = (x: number, y: number, s: number, fill: string): string =>
  `<polygon points="${[[0, 0], [1, 0], [1, 1.2], [0.3, 1.8], [0.45, 1], [0, 1]].map(([px, py]) => `${x + px * s},${y + py * s}`).join(' ')}" fill="${fill}"/>`;
const bar = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const dot = (cx: number, cy: number, fill = G) => `<circle cx="${cx}" cy="${cy}" r="8" fill="${fill}"/>`;

/** Name: a quotation mark over a line of speech, with the gold point where it starts. */
const NAME = `${quote(16, 16, 22, I)}${bar(16, 66, 68, 12, I)}${bar(48, 30, 24, 10, R)}${dot(84, 35)}`;
/** Choose: three lines of differing weight, one picked out in gold. */
export const BRANCH = `${bar(14, 22, 72, 12, R)}${bar(14, 44, 54, 12, I)}${bar(14, 66, 72, 12, R)}${dot(82, 50)}`;
/** Work: two quotation marks facing a line, what is said set against what is heard. */
export const LENS = `${quote(14, 16, 18, I)}${quote(38, 16, 18, I)}${bar(14, 62, 72, 12, I)}${bar(14, 80, 46, 8, R)}${dot(78, 84)}`;
/** Commit: a line of speech stepping forward to a gold full stop. */
const COMMIT = `${quote(14, 22, 18, I)}${bar(14, 64, 52, 12, I)}${bar(40, 32, 30, 10, R)}${dot(80, 70)}`;
/** Review: a bar spoken, a bar heard back, and the point where they meet. */
const REVIEW = `${bar(14, 24, 60, 12, I)}${bar(26, 64, 60, 12, R)}${bar(44, 36, 12, 28, I)}${dot(50, 50)}`;
/** Heard: a grey bar under an ink one, the gap between said and heard. */
const HEARD = `${quote(14, 14, 18, I)}${bar(14, 54, 72, 12, I)}${bar(14, 74, 56, 12, R)}${dot(82, 80)}`;
const STATION_ART = [NAME, BRANCH, COMMIT, REVIEW];
const STATION_NAMES = ['Name', 'Work a model', 'Commit', 'Review'];

export const MARKS = { name: NAME, commit: COMMIT, review: REVIEW, heard: HEARD };

/* ── Track ──────────────────────────────────────────────────────────── */

/** "5 Nov" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

type Station = { name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string };

/** Where the session is (0 Name … 3 Review, 4 finished) and each station's state and note. */
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
    at === 2 ? ((active('commit')?.tool as string | undefined) === COMMIT_ID ? 'The next conversation' : 'Set it up') : at > 2 ? 'Committed' : '',
    waiting && due ? `Review ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Review ${shortDate(due)}` : ''
  ];
  const stations = STATION_NAMES.map((name, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name, state: state as Station['state'], note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Stations for Name, Work a model, Commit and Review, joined by a gold rule. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track cmb-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line cmb-track__line');
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
        const item = el('li', 'ps-track__stn cmb-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark cmb-track__mark');
        mark.append(svg('0 0 100 100', STATION_ART[i]));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'cmb-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Groups ─────────────────────────────────────────────────────────── */

/** One line per group: what it covers, in our words. */
const GROUP_LINES: Record<string, string> = {
  prepare: 'Getting ready to persuade, present, run a meeting, give feedback or negotiate.',
  relate: 'Listening, apologising, closeness, misunderstandings with people near you, and talk with yourself.',
  read: 'Reading a message, a claim or a medium for what it does, and how an exchange will be remembered.'
};

export type GroupsView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The three group emblems in a row above the canvas (each group's first section emblem). Lit
 * groups are ringed and the rest fade; hidden until the group is answered.
 */
export function createGroups(): GroupsView {
  const box = el('section', 'cmb-groups');
  box.hidden = true;
  const row = el('ol', 'cmb-groups__row');
  const items = new Map<string, HTMLElement>();
  for (const group of GROUPS) {
    const item = el('li', 'cmb-groups__item');
    const emblem = el('span', 'cmb-groups__em');
    emblem.append(sectionEmblem(group.sections[0]));
    item.append(emblem, el('span', 'cmb-groups__label', group.label));
    items.set(group.id, item);
    row.append(item);
  }
  const text = el('p', 'cmb-groups__text');
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
      box.setAttribute('aria-label', `What the exchange needs: ${lit.map(label).join(' and ')}`);
    }
  };
}

export const groupLine = (id: string): string => GROUP_LINES[id] ?? '';

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The book emblem, small: the coach's avatar. */
export function cmbAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar cmb-avatar');
  span.append(bookEmblem());
  return span;
}

function markOf(art: string): HTMLSpanElement {
  const span = el('span', 'cmb-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', art));
  return span;
}

/** How the shared coach panel looks in the Communication Book. */
export const CMB_LOOK: CoachLook = {
  avatar: cmbAvatar,
  emblem: (tool) => (tool === COMMIT_ID ? markOf(COMMIT) : tool === REVIEW_ID ? markOf(REVIEW) : entryEmblem(tool)),
  frames: {
    talk: {
      keys: ['situation', 'group', 'outcome'],
      prompts: ['What was said, or needs saying?', 'Prepare, relate or read?', 'What would a better exchange be?']
    }
  },
  noun: 'Session'
};

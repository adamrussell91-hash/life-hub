// packages/get-things-done/render/quick.ts
// Quick start's chart, in Gear Shifter's style: the first action as the target and, once the
// person picks how it starts, the dart flying into it (five shrinking dots behind it for a
// countdown cue, a blue arc for a protected interval); below, the route's stations on a dotted
// cobalt line, each with its answer. With `onPick`, the "How it starts" station carries the two
// ways as buttons. Earlier rounds are summed up in a line. The route is our design, and the
// credit line under the chart names the two techniques it borrows from.
import { START_NODES, START_WAYS, checkPointOf, cueLabel, currentEntry, isCheckDate, latestNote, taskOf, wayOf } from '../quick.mjs';
import type { GtStartState, GtStartWay } from '../../problem-solver/types';
import { checkDateText } from '../../decision-book/render/quick';
import { el, setAttr, setText } from '../../decision-book/render/core';

export type StartView = { el: HTMLElement; update(state: GtStartState): void; destroy(): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const WAYS = Object.keys(START_WAYS) as GtStartWay[];
const STATIONS = Object.keys(START_NODES) as Array<keyof typeof START_NODES>;

/** A check-back point as the chart says it: a date in words, or their words. */
export function checkPointText(point: string | null): string {
  if (!point) return '';
  return isCheckDate(point) ? checkDateText(point) : point;
}

/** The target, the dart and the two start marks (static markup, 200×120); CSS shows the dart and one mark once a way is picked. */
const ART = `
<circle cx="140" cy="60" r="50" fill="var(--gt-paper)" stroke="var(--gt-blue)" stroke-width="9"/>
<circle cx="140" cy="60" r="30" fill="none" stroke="var(--gt-red)" stroke-width="9"/>
<circle cx="140" cy="60" r="10" fill="var(--gt-red)"/>
<g class="gt-qs__mark gt-qs__mark--countdown">
  <circle cx="14" cy="104" r="7" fill="var(--gt-ink)"/><circle cx="32" cy="98" r="6" fill="var(--gt-ink)"/><circle cx="48" cy="93" r="5" fill="var(--gt-ink)"/><circle cx="62" cy="89" r="4" fill="var(--gt-ink)"/><circle cx="74" cy="85" r="3" fill="var(--gt-ink)"/>
</g>
<g class="gt-qs__mark gt-qs__mark--interval">
  <path d="M36 74A26 26 0 1 1 18 112" fill="none" stroke="var(--gt-blue)" stroke-width="6" stroke-linecap="round"/><circle cx="36" cy="100" r="6" fill="var(--gt-amber)"/>
</g>
<g class="gt-qs__dart">
  <path d="M84 84L128 66" stroke="var(--gt-ink)" stroke-width="6" stroke-linecap="round"/>
  <path d="M140 60L118 62L126 74Z" fill="var(--gt-ink)" stroke="var(--gt-ink)" stroke-width="3" stroke-linejoin="round"/>
  <path d="M84 84L74 76M84 84L76 94" stroke="var(--gt-ink)" stroke-width="4" stroke-linecap="round"/>
</g>`;

export function createStartView(doc: Document = document, opts: { onPick?(node: string, way: GtStartWay): void } = {}): StartView {
  const root = el(doc, 'section', 'gt-qs');
  root.setAttribute('aria-label', 'The Quick start route');
  const rounds = el(doc, 'p', 'gt-qs__rounds');
  rounds.hidden = true;

  const hit = el(doc, 'div', 'gt-qs__hit');
  const art = doc.createElementNS(SVG_NS, 'svg');
  art.setAttribute('viewBox', '0 0 200 120');
  art.setAttribute('class', 'gt-qs__art');
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = ART;
  const hitText = el(doc, 'div', 'gt-qs__hit-text');
  const action = el(doc, 'p', 'gt-qs__action');
  const way = el(doc, 'p', 'gt-qs__way');
  hitText.append(el(doc, 'span', 'gt-qs__kicker', 'The target: the first action'), action, way);
  hit.append(art, hitText);

  const route = el(doc, 'ol', 'gt-qs__route');
  const rows = new Map(STATIONS.map((id) => {
    const item = el(doc, 'li', 'gt-qs__stn');
    item.dataset.box = id;
    const disc = el(doc, 'span', 'gt-qs__disc');
    disc.setAttribute('aria-hidden', 'true');
    const label = el(doc, 'span', 'gt-qs__label');
    const now = el(doc, 'span', 'gt-qs__now', 'Now');
    now.hidden = true;
    const text = el(doc, 'p', 'gt-qs__text');
    text.hidden = true;
    item.append(disc, label, now, text);
    route.append(item);
    return [id, { item, label, now, text }] as const;
  }));

  const ask = el(doc, 'div', 'gt-qs__ask');
  ask.hidden = true;
  // Read-only charts (the panel on a full session) carry no buttons at all.
  const buttons = (opts.onPick ? WAYS : []).map((id) => {
    const button = el(doc, 'button', 'gt-qs__pick', START_WAYS[id].label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.way = id;
    button.setAttribute('aria-label', `Start with a ${START_WAYS[id].label.toLowerCase()}`);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      for (const b of buttons) b.setAttribute('aria-disabled', 'true');
      opts.onPick?.('how', id);
    });
    ask.append(button);
    return button;
  });
  if (buttons.length) rows.get('how')!.item.append(ask);

  const credit = el(doc, 'p', 'gt-qs__credit', 'Gear Shifter’s own short route, borrowing two ideas from the book: The 5-Second Rule for the countdown and The Pomodoro Technique for the interval.');
  root.append(rounds, hit, route, credit);

  return {
    el: root,
    update(state) {
      const current = currentEntry(state);
      const picked = wayOf(state);
      setAttr(root, 'data-way', picked);
      setAttr(root, 'data-done', state.finishedAt ? 'true' : null);

      const first = latestNote(state, 'action');
      setText(action, first ?? 'Not named yet');
      setAttr(action, 'data-empty', first ? null : 'true');
      const cue = latestNote(state, 'cue');
      setText(way, picked ? `Starts with a ${START_WAYS[picked].label.toLowerCase()}${cue ? `: ${cue}` : ''}` : 'Pick how it starts, and the dart flies in.');

      const answers: Record<string, string | null> = {
        task: taskOf(state) || null,
        action: first,
        how: picked ? `${START_WAYS[picked].label}. ${START_WAYS[picked].line}` : null,
        cue,
        check: checkPointText(checkPointOf(state)) || null,
        happened: latestNote(state, 'happened'),
        next: latestNote(state, 'next')
      };
      for (const id of STATIONS) {
        const row = rows.get(id)!;
        setText(row.label, id === 'cue' ? cueLabel(state) : id === 'check' ? 'Check back' : START_NODES[id].label);
        const answer = answers[id];
        setText(row.text, answer ?? '');
        row.text.hidden = !answer;
        setAttr(row.item, 'data-done', answer ? 'true' : null);
        const isNow = current?.node === id;
        setAttr(row.item, 'data-now', isNow ? 'true' : null);
        row.now.hidden = !isNow;
      }

      const asking = current?.node === 'how' && opts.onPick;
      if (asking) {
        if (ask.hidden) for (const b of buttons) b.removeAttribute('aria-disabled');
        ask.hidden = false;
      } else ask.hidden = true;

      const earlier = Array.from({ length: state.rounds - 1 }, (_, i) => {
        const round = i + 1;
        const tried = latestNote(state, 'action', round);
        const how = wayOf(state, round);
        return `Round ${round}: ${tried ?? 'no action named'}${how ? `, with a ${START_WAYS[how].label.toLowerCase()}` : ''}.`;
      });
      rounds.hidden = !earlier.length;
      setText(rounds, earlier.length ? `Round ${state.rounds}. ${earlier.join(' ')}` : '');
    },
    destroy() {
      root.remove();
    }
  };
}

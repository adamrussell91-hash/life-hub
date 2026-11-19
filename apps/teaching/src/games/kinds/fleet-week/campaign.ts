/**
 * Fleet week, the student's phone (spec §1, §3.4; lesson mode).
 *
 * A full-screen view over one campaign: place my ships, fire (square, then
 * Sure or Unsure, only then the question), file damage reports and recall
 * lines, read the round report and, at the end, the reveal. It polls
 * `fleet_state` every 2 s while the page is visible. Every player is a call
 * sign from the view; real names appear only in `view.reveal`. After an
 * answer the phone says "Answer sent", never right or wrong.
 */
import { el } from '@/quiz/dom';
import type { WritingLog } from '@/quiz/writing';
import { watchWriting } from '@/quiz/writing-watch';
import type { PublicGame } from '../../core/schema';
import { GRID, SHIP_IDS, SHIP_SIZES, colOf, rowOf, shipLine, squareLabel, type ShipId } from './rules';
import type { FleetCampaignClient, FleetLine, FleetOwed, FleetQuestion, FleetShip, FleetView } from './campaign-api';
import { calm } from '../../motion/motion';
import { createSea, type Sea, type SeaChart, type SeaMode } from './sea';
import './fleet-week.css';

export type FleetCampaignOptions = {
  lessonId: string;
  classId: string;
  game: PublicGame;
  client: FleetCampaignClient;
  onClose?: () => void;
  /** Poll interval in ms (tests). */
  pollMs?: number;
};
export type FleetCampaign = { close(): void; refresh(): Promise<void> };

const POLL_MS = 2000;
const ROW_LETTERS = 'ABCDE';
const sizeOf = (id: ShipId) => SHIP_SIZES[SHIP_IDS.indexOf(id)];
const promptOf = (q: FleetQuestion) => (q && typeof q.prompt === 'string' && q.prompt.trim() ? q.prompt : 'Answer from memory.');
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const errCode = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');

type Cell = { cls: string[]; label: string; disabled?: boolean };
/** The rendered sea under a chart: which one (kept across repaints), how it draws, and what it shows. */
type SeaSpec = { key: string; mode: SeaMode; state: SeaChart };
type Draft = { text: string; log: WritingLog | null };

/** Ship segment classes: bow, mid, stern or solo, and the way it lies. */
function shipParts(ships: FleetShip[]): Map<number, { cls: string[]; id: ShipId }> {
  const out = new Map<number, { cls: string[]; id: ShipId }>();
  for (const s of ships) {
    const sq = [...s.squares].sort((a, b) => a - b);
    const dir = sq.length > 1 && sq[1] - sq[0] === 1 ? 'h' : 'v';
    sq.forEach((n, i) => {
      const part = sq.length === 1 ? 'solo' : i === 0 ? 'bow' : i === sq.length - 1 ? 'stern' : 'mid';
      out.set(n, { cls: ['fw-ship', `fw-ship--${part}`, `fw-ship--${dir}`], id: s.id });
    });
  }
  return out;
}

export function openFleetCampaign(host: HTMLElement, options: FleetCampaignOptions): FleetCampaign {
  const { client, game, lessonId, classId } = options;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const draftKey = (id: string) => `fleet:${lessonId}:${classId}:${game.id}:${id}`;

  let view: FleetView | null = null;
  let waitingForTeacher = false;
  let loadError = '';
  let closed = false;
  let inflight = false;
  let paintedSig = '';
  let typingKey = '';
  // Local state that survives polls.
  let selected: number | null = null;
  let firedRound = -1;
  const fired = new Set<number>();
  let sent = false;
  const filed = new Set<string>();
  const recalled = new Set<string>();
  const layout = new Map<ShipId, number[]>();
  let activeShip: ShipId | null = null;
  let across = true;
  let message = '';
  /** Rendered seas by key ('ours', 'theirs', …): one canvas each, moved into every rebuilt chart. */
  const seas = new Map<string, { layer: HTMLElement; sea: Sea; lifted: boolean }>();
  let dawnRound = -1;

  const root = el('div', 'gm gm-solo fw');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Fleet week: ${game.title || 'Fleet week'}`);
  const panel = el('div', 'gm-solo__panel fw-panel');
  panel.tabIndex = -1;
  const head = el('header', 'gm-solo__head fw-head');
  const back = el('button', 'gm-icon-btn gm-solo__back', 'Leave');
  back.type = 'button';
  const titles = el('div', 'gm-solo__titles');
  const title = el('h2', 'gm-solo__title', game.title || 'Fleet week');
  const status = el('p', 'gm-solo__status');
  status.setAttribute('aria-live', 'polite');
  titles.append(title, status);
  const score = el('p', 'fw-score');
  head.append(back, titles, score);
  const body = el('div', 'gm-solo__body fw-body');
  const stage = el('div', 'fw-stage');
  body.append(stage);
  panel.append(head, body);
  root.append(panel);
  host.append(root);
  panel.focus();

  // ------------------------------------------------------------ drafts
  function readDraft(id: string): Draft {
    try {
      const raw = sessionStorage.getItem(draftKey(id));
      const d = raw ? (JSON.parse(raw) as Draft) : null;
      if (d && typeof d.text === 'string') return { text: d.text, log: d.log ?? null };
    } catch {
      // storage off: start empty
    }
    return { text: '', log: null };
  }
  function saveDraft(id: string, d: Draft): void {
    try {
      sessionStorage.setItem(draftKey(id), JSON.stringify(d));
    } catch {
      // storage off: the draft lives in memory only
    }
  }
  function dropDraft(id: string): void {
    try {
      sessionStorage.removeItem(draftKey(id));
    } catch {
      // ignore
    }
  }

  // ------------------------------------------------------------ chart
  /** The sea layer for a chart, or null when the canvas isn't available (the CSS look stays). */
  function seaLayer(spec: SeaSpec): HTMLElement | null {
    let entry = seas.get(spec.key);
    if (!entry) {
      const layer = el('div', 'fw-sea-layer');
      layer.setAttribute('aria-hidden', 'true');
      entry = { layer, sea: createSea(layer, { seed: `${view?.campaign ?? 'fleet'}:${spec.key}`, mode: spec.mode, size: GRID }), lifted: false };
      seas.set(spec.key, entry);
    }
    if (!entry.sea.live) return null;
    entry.sea.update(spec.state);
    if (spec.mode === 'reveal' && !entry.lifted) {
      entry.lifted = true;
      const sea = entry.sea;
      if (calm()) void sea.lift();
      else window.setTimeout(() => void sea.lift(), 500);
    }
    return entry.layer;
  }

  function chart(caption: string, cellOf: (sq: number) => Cell, onTap?: (sq: number) => void, current?: number | null, sea?: SeaSpec): HTMLElement {
    const labels = view?.labels ?? { columns: [], rows: [] };
    const wrap = el('div', 'fw-chart-wrap');
    const grid = el('div', 'fw-chart');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', caption);
    const layer = sea ? seaLayer(sea) : null;
    if (layer) {
      // Canvas under the buttons: the squares stay DOM buttons on top.
      grid.classList.add('fw-chart--sea', `fw-chart--${sea!.mode}`);
      grid.append(layer);
    }
    grid.append(el('span', 'fw-corner'));
    for (let c = 0; c < GRID; c++) {
      const h = el('span', 'fw-col-label', labels.columns[c] || String(c + 1));
      h.title = labels.columns[c] || '';
      grid.append(h);
    }
    for (let r = 0; r < GRID; r++) {
      const rh = el('span', 'fw-row-label', labels.rows[r] || ROW_LETTERS[r]);
      rh.title = labels.rows[r] || '';
      grid.append(rh);
      for (let c = 0; c < GRID; c++) {
        const sq = r * GRID + c;
        const cell = cellOf(sq);
        const name = `${squareLabel(sq)}${labels.rows[r] ? `, ${labels.rows[r]}` : ''}${labels.columns[c] ? `, ${labels.columns[c]}` : ''}`;
        const node = onTap ? el('button', 'fw-cell') : el('span', 'fw-cell');
        node.classList.add(...cell.cls);
        node.dataset.square = String(sq);
        node.setAttribute('aria-label', `${name}: ${cell.label}`);
        if (current === sq) node.classList.add('fw-cell--selected');
        if (node instanceof HTMLButtonElement) {
          node.type = 'button';
          node.disabled = !!cell.disabled;
          if (current === sq) node.setAttribute('aria-pressed', 'true');
          node.addEventListener('click', () => onTap!(sq));
        }
        node.append(el('span', 'fw-mark'));
        grid.append(node);
      }
    }
    wrap.append(grid);
    return wrap;
  }

  /** The square's two labels, so the student knows what the question is about. */
  function squareName(sq: number): string {
    const labels = view?.labels ?? { columns: [], rows: [] };
    const parts = [labels.rows[rowOf(sq)], labels.columns[colOf(sq)]].filter(Boolean);
    return parts.length ? `${squareLabel(sq)} · ${parts.join(' × ')}` : squareLabel(sq);
  }

  /** Our fleet as the sea draws it: my ships in my colour, my partner's in theirs. */
  function ourSea(v: FleetView, ships: FleetShip[] = v.team.fleet): SeaSpec {
    const mine = new Set(v.me.ships);
    return { key: 'ours', mode: 'own', state: { ships: ships.map((s) => ({ squares: s.squares, tone: mine.has(s.id) ? 'own' : 'mate' })), marks: v.team.chart } };
  }

  function ourChart(v: FleetView, caption: string): HTMLElement {
    const parts = shipParts(v.team.fleet);
    return chart(caption, (sq) => {
      const mark = v.team.chart[sq];
      const ship = parts.get(sq);
      const cls = [...(ship?.cls ?? ['fw-sea'])];
      if (mark) cls.push(`fw-cell--${mark}`);
      return { cls, label: [ship ? 'our ship' : 'open sea', mark === 'hit' ? 'hit' : mark === 'miss' ? 'their miss' : ''].filter(Boolean).join(', ') };
    }, undefined, undefined, ourSea(v));
  }

  // ------------------------------------------------------------ screens
  function note(text: string, cls = 'fw-note'): HTMLElement {
    return el('p', cls, text);
  }
  function errLine(): HTMLElement {
    const p = el('p', 'fw-error', message);
    p.setAttribute('role', 'alert');
    p.hidden = !message;
    return p;
  }
  function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', `btn ${cls}`, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function placementScreen(v: FleetView): HTMLElement[] {
    const mine = v.me.ships;
    if (v.me.placed || !mine.length) {
      return [
        el('h3', 'fw-h', mine.length ? 'Your ships are at sea' : 'Your partner places the ships this time'),
        note('Waiting for the rest of the class to place their ships.'),
        ourChart(v, 'Our fleet')
      ];
    }
    if (!activeShip || !mine.includes(activeShip)) activeShip = mine.find((id) => !layout.has(id)) ?? mine[0];
    const mate = v.team.fleet.filter((s) => !mine.includes(s.id));
    const mateSquares = new Set(mate.flatMap((s) => s.squares));
    const own: FleetShip[] = mine.filter((id) => layout.has(id)).map((id) => ({ id, squares: layout.get(id)! }));
    const parts = shipParts([...mate, ...own]);

    const tryPlace = (id: ShipId, start: number, flat: boolean): boolean => {
      const line = shipLine(start, sizeOf(id), flat ? 'h' : 'v');
      if (!line) {
        message = 'That ship would leave the chart.';
        return false;
      }
      const others = new Set(mine.filter((o) => o !== id && layout.has(o)).flatMap((o) => layout.get(o)!));
      if (line.some((s) => mateSquares.has(s) || others.has(s))) {
        message = 'Ships can’t overlap.';
        return false;
      }
      layout.set(id, line);
      message = '';
      return true;
    };

    const tap = (sq: number) => {
      const owned = mine.find((id) => layout.get(id)?.includes(sq));
      if (owned && owned !== activeShip) {
        activeShip = owned;
        message = '';
      } else if (activeShip && tryPlace(activeShip, sq, across)) {
        activeShip = mine.find((id) => !layout.has(id)) ?? activeShip;
      }
      repaint();
    };

    const picker = el('div', 'fw-ships');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Your ships');
    for (const id of mine) {
      const b = button('', 'btn--secondary fw-ship-pick', () => {
        activeShip = id;
        message = '';
        repaint();
      });
      b.setAttribute('aria-pressed', String(id === activeShip));
      const hull = el('span', 'fw-hull');
      for (let i = 0; i < sizeOf(id); i++) hull.append(el('span', 'fw-hull__seg'));
      b.append(hull, el('span', '', `${sizeOf(id)} square${sizeOf(id) === 1 ? '' : 's'}${layout.has(id) ? ' · placed' : ''}`));
      picker.append(b);
    }
    const turn = button(across ? 'Lie: across' : 'Lie: down', 'btn--secondary fw-turn', () => {
      across = !across;
      const at = activeShip ? layout.get(activeShip) : undefined;
      if (activeShip && at) tryPlace(activeShip, Math.min(...at), across);
      repaint();
    });
    turn.setAttribute('aria-pressed', String(!across));

    const ready = mine.every((id) => layout.has(id));
    const confirm = button('Confirm placement', 'btn--primary fw-wide', () => {
      if (!ready) return;
      confirm.disabled = true;
      const ships = mine.map((id) => ({ id, squares: layout.get(id)! }));
      client.place(game.id, ships).then(
        (next) => {
          message = '';
          show(next);
        },
        (e) => {
          message = errText(e, 'Those ships didn’t save. Try again.');
          confirm.disabled = false;
          repaint();
        }
      );
    });
    confirm.disabled = !ready;

    return [
      el('h3', 'fw-h', 'Hide your ships'),
      note('Pick a ship, then tap the square where its front goes. Your partner’s ships are shown; keep a square of sea between yours and theirs.'),
      picker,
      turn,
      chart('Our chart: place your ships', (sq) => {
        const ship = parts.get(sq);
        const isMate = mateSquares.has(sq);
        return { cls: ship ? [...ship.cls, ...(isMate ? ['fw-ship--mate'] : [])] : ['fw-sea'], label: ship ? (isMate ? 'partner’s ship' : 'your ship') : 'open sea' };
      }, tap, undefined, ourSea(v, [...mate, ...own])),
      errLine(),
      confirm
    ];
  }

  function rivalCells(v: FleetView): (sq: number) => Cell {
    const duds = new Set((v.report?.lines ?? []).filter((l) => l.side === 'us' && l.outcome === 'dud').map((l) => l.square));
    const back = new Set(v.shots.returning);
    return (sq) => {
      const mark = v.rival.chart[sq];
      if (mark === 'hit') return { cls: ['fw-cell--hit'], label: 'hit', disabled: true };
      if (mark === 'miss') return { cls: ['fw-cell--miss'], label: 'miss', disabled: true };
      if (fired.has(sq)) return { cls: ['fw-fog', 'fw-cell--fired'], label: 'fired this round', disabled: true };
      if (back.has(sq)) return { cls: ['fw-fog', 'fw-cell--returning'], label: 'returning to you' };
      if (duds.has(sq)) return { cls: ['fw-fog', 'fw-cell--dud'], label: 'dud, still unknown' };
      return { cls: ['fw-fog'], label: 'unknown' };
    };
  }

  function firingScreen(v: FleetView): HTMLElement[] {
    if (v.round !== firedRound) {
      firedRound = v.round;
      fired.clear();
      selected = null;
    }
    const out: HTMLElement[] = [];
    out.push(el('h3', 'fw-h', 'Their waters'));
    const left = el('p', 'fw-shells', `${v.shots.left} shell${v.shots.left === 1 ? '' : 's'} left`);
    out.push(left);
    if (v.match_over) out.push(note('Their fleet is sunk. Keep firing at the practice chart.'));
    const cells = rivalCells(v);
    const canFire = v.shots.left > 0;
    out.push(chart('Their chart: pick a square to fire at', cells, canFire ? (sq) => {
      selected = selected === sq ? null : sq;
      message = '';
      repaint();
    } : undefined, selected, { key: 'theirs', mode: 'rival', state: { marks: v.rival.chart } }));
    out.push(legend());
    if (canFire && selected !== null) {
      const bar = el('div', 'fw-fire');
      bar.append(el('p', 'fw-fire__square', squareName(selected)), note('How sure are you? Sure and right does double damage. Sure and wrong sends the other team a sonar ping. The question appears next.'));
      const row = el('div', 'fw-fire__buttons');
      const fire = (sure: boolean) => {
        if (selected === null) return;
        const sq = selected;
        row.querySelectorAll('button').forEach((b) => (b.disabled = true));
        client.commit(game.id, sq, sure).then(
          (shot) => {
            fired.add(sq);
            selected = null;
            message = '';
            if (view) show({ ...view, shots: { ...view.shots, open: shot } });
          },
          (e) => {
            message = errText(e, 'That shot didn’t go. Try again.');
            repaint();
          }
        );
      };
      row.append(button('Sure', 'btn--primary fw-sure', () => fire(true)), button('Unsure', 'btn--secondary fw-unsure', () => fire(false)));
      bar.append(row);
      out.push(bar);
    } else if (!canFire) out.push(note('Shells spent. The report comes when the round closes.'));
    out.push(errLine());
    out.push(reportBlock(v));
    const ours = el('details', 'fw-ours');
    ours.append(el('summary', '', 'Our fleet'), ourChart(v, 'Our fleet'));
    out.push(ours);
    return out;
  }

  function legend(): HTMLElement {
    const l = el('ul', 'fw-legend');
    for (const [cls, text] of [['fw-cell--hit', 'Hit'], ['fw-cell--miss', 'Miss'], ['fw-cell--dud', 'Dud'], ['fw-cell--returning', 'Returning']]) {
      const li = el('li');
      li.append(el('span', `fw-key fw-fog ${cls}`), el('span', '', text));
      l.append(li);
    }
    return l;
  }

  function answerBox(id: string, label: string, rows: number, onSend: (text: string, log: WritingLog | null) => Promise<unknown>, sendText: string, after: () => void): HTMLElement {
    const draft = readDraft(id);
    const form = el('form', 'fw-answer');
    form.noValidate = true;
    const lab = el('label', 'fw-label', label);
    const box = el('textarea', 'fw-textarea');
    box.id = `fw-${id.replace(/[^a-z0-9]/gi, '-')}`;
    lab.htmlFor = box.id;
    box.rows = rows;
    box.maxLength = 300;
    box.autocomplete = 'off';
    box.spellcheck = false;
    box.value = draft.text;
    let log = draft.log;
    const watchNote = watchWriting(box, {
      check: 'block',
      log,
      onLog: (next) => {
        log = next;
        saveDraft(id, { text: box.value, log });
      }
    });
    box.addEventListener('input', () => saveDraft(id, { text: box.value, log }));
    const err = el('p', 'fw-error');
    err.setAttribute('role', 'alert');
    const send = el('button', 'btn btn--primary fw-wide', sendText);
    send.type = 'submit';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = box.value.trim();
      if (!text) {
        err.textContent = 'Type an answer first.';
        return;
      }
      send.disabled = true;
      err.textContent = '';
      onSend(text, log).then(
        () => {
          dropDraft(id);
          after();
        },
        (e2) => {
          err.textContent = errText(e2, 'That didn’t send. Try again.');
          send.disabled = false;
          if (errCode(e2) === 'late' || errCode(e2) === 'settled' || errCode(e2) === 'filed' || errCode(e2) === 'answered') {
            dropDraft(id);
            typingKey = '';
            void refresh();
          }
        }
      );
    });
    form.append(lab, box, watchNote, err, send);
    return form;
  }

  function questionScreen(v: FleetView): HTMLElement[] {
    const shot = v.shots.open!;
    const id = `shot:${v.round}:${shot.square}`;
    const clock = el('p', 'fw-clock');
    clock.dataset.deadline = String(shot.deadline);
    clock.setAttribute('role', 'timer');
    tickClock(clock);
    const card = el('div', 'fw-question');
    card.append(
      el('p', 'fw-question__meta', `${squareName(shot.square)} · ${shot.sure ? 'Sure' : 'Unsure'}`),
      clock,
      el('p', 'fw-question__prompt', promptOf(shot.question))
    );
    return [
      el('h3', 'fw-h', 'Fire!'),
      card,
      answerBox(id, 'Your answer', 3, (text, log) => client.answer(game.id, text, log), 'Send answer', () => {
        sent = true;
        typingKey = '';
        if (view) view = { ...view, shots: { ...view.shots, open: undefined } };
        repaint(true);
        void refresh();
      })
    ];
  }

  function sentScreen(v: FleetView): HTMLElement[] {
    const box = el('div', 'fw-sent');
    box.setAttribute('role', 'status');
    box.append(el('p', 'fw-sent__title', 'Answer sent'));
    return [
      box,
      button(v.shots.left > 0 ? 'Back to the chart' : 'See the chart', 'btn--primary fw-wide', () => {
        sent = false;
        repaint(true);
      })
    ];
  }

  function reportScreen(o: FleetOwed): HTMLElement[] {
    const card = el('div', 'fw-question');
    card.append(
      el('p', 'fw-question__meta', `${o.by} hit ${squareLabel(o.square)}`),
      el('p', 'fw-label', 'The question'),
      el('p', 'fw-question__prompt', promptOf(o.question)),
      el('p', 'fw-label', `${o.by}’s answer`)
    );
    const quote = el('blockquote', 'fw-partner-answer', o.answer || '(no answer)');
    card.append(quote);
    return [
      el('h3', 'fw-h', 'Damage report'),
      note('Your partner landed a hit. Explain in one line why their answer is right, so it counts in full.'),
      card,
      answerBox(`report:${o.hit}`, 'Why is that right?', 2, (text, log) => client.report(game.id, o.hit, text, log), 'File report', () => {
        filed.add(o.hit);
        typingKey = '';
        repaint(true);
        void refresh();
      })
    ];
  }

  function recallScreen(r: NonNullable<FleetView['recall']>): HTMLElement[] {
    const card = el('div', 'fw-question');
    card.append(el('p', 'fw-question__meta', 'Last hit on a ship'), el('p', 'fw-question__prompt', promptOf(r.prompt)));
    return [
      el('h3', 'fw-h', 'Sink it'),
      note('Type the line from memory. Right sinks the ship for bonus damage.'),
      card,
      answerBox(`recall:${r.ship_key}`, 'The line, from memory', 2, (text, log) => client.recall(game.id, r.ship_key, text, log), 'Send', () => {
        recalled.add(r.ship_key);
        typingKey = '';
        repaint(true);
        void refresh();
      })
    ];
  }

  function lineText(l: FleetLine): string {
    const what = l.outcome === 'hit' ? `hit${l.damage ? ` (+${l.damage})` : ''}` : l.outcome === 'void' ? 'voided' : l.outcome === 'dup' ? 'already known' : l.outcome;
    const extra = [l.sure ? 'sure' : '', l.returning ? 'returning square' : ''].filter(Boolean).join(', ');
    return `${l.side === 'us' ? 'We' : 'They'}: ${l.by} → ${squareLabel(l.square)}, ${what}${extra ? ` (${extra})` : ''}`;
  }

  /** Sunrise over the report: night fades, the sun climbs, light warms. It plays once per round. */
  function dawn(round: number): HTMLElement {
    const head = el('div', 'fw-dawn');
    if (round === dawnRound || calm()) head.classList.add('fw-dawn--risen');
    dawnRound = round;
    for (const part of ['sky', 'rays', 'sun', 'night', 'water']) {
      const layer = el('span', `fw-dawn__${part}`);
      layer.setAttribute('aria-hidden', 'true');
      head.append(layer);
    }
    const text = el('div', 'fw-dawn__text');
    text.append(el('h3', 'fw-h fw-report__title', `Dawn report · round ${round}`), el('p', 'fw-dawn__sub', 'The round has closed. Here is what landed.'));
    head.append(text);
    return head;
  }

  function reportBlock(v: FleetView): HTMLElement {
    const box = el('section', 'fw-report');
    if (!v.report) {
      box.hidden = true;
      return box;
    }
    box.append(dawn(v.report.round), el('span', 'fw-warm'));
    const list = el('ul', 'fw-report__lines');
    for (const l of v.report.lines) {
      const li = el('li', `fw-line fw-line--${l.side} fw-line--${l.outcome}`, lineText(l));
      list.append(li);
    }
    if (!v.report.lines.length) list.append(el('li', 'fw-line', 'Quiet night. No shots landed.'));
    box.append(list);
    for (const p of v.report.pings) box.append(el('p', 'fw-ping', `Sonar ping: ${p}`));
    return box;
  }

  function waitingScreen(v: FleetView): HTMLElement[] {
    const done = v.phase === 'waiting' ? 'All rounds are fired. Waiting for your teacher to open the reveal.' : 'Waiting for the next round.';
    return [note(done, 'fw-note fw-note--wait'), reportBlock(v), ourChart(v, 'Our fleet')];
  }

  function revealScreen(v: FleetView): HTMLElement[] {
    const r = v.reveal;
    if (!r) return [note(v.phase === 'closed' ? 'This game has finished.' : 'The reveal is coming.'), reportBlock(v)];
    const out: HTMLElement[] = [];
    const st = r.standings;
    const head = st?.winner === 'us' ? 'We won the week' : st?.winner === 'them' ? 'They won the week' : 'A draw';
    out.push(el('h3', 'fw-h fw-reveal__title', head));
    if (st) {
      const t = el('ul', 'fw-standings');
      for (const team of st.teams) t.append(el('li', '', `${team.side === 'us' ? 'Us' : 'Them'}: ${team.damage} damage, ${team.sunk} sunk, ${Math.round(team.accuracy * 100)}% first try`));
      out.push(t);
    }
    const names = el('ul', 'fw-names');
    for (const [sign, name] of Object.entries(r.names)) names.append(el('li', '', `${sign} was ${name}`));
    out.push(el('h3', 'fw-h', 'Who was who'), names);
    out.push(note(`Your Sure shots: ${r.calibration.right} right out of ${r.calibration.total}.`));
    const fleetChart = (ships: FleetShip[], marks: Record<string, 'hit' | 'miss'>, caption: string, key: string, tone: 'rival' | 'own') => {
      const parts = shipParts(ships);
      const hits = new Set(Object.entries(marks).filter(([, m]) => m === 'hit').map(([k]) => Number(k)));
      const sea: SeaSpec = { key, mode: 'reveal', state: { marks, ships: ships.map((s) => ({ squares: s.squares, tone: s.squares.every((q) => hits.has(q)) ? 'sunk' : tone })) } };
      return chart(caption, (sq) => {
        const ship = parts.get(sq);
        const mark = marks[sq];
        return { cls: [...(ship?.cls ?? ['fw-sea']), ...(mark ? [`fw-cell--${mark}`] : [])], label: [ship ? 'ship' : 'sea', mark ?? ''].filter(Boolean).join(', ') };
      }, undefined, undefined, sea);
    };
    out.push(el('h3', 'fw-h', 'Their fleet'), fleetChart(r.fleets.them, v.rival.chart, 'Their fleet', 'reveal-theirs', 'rival'));
    out.push(el('h3', 'fw-h', 'Our fleet'), fleetChart(r.fleets.us, v.team.chart, 'Our fleet', 'reveal-ours', 'own'));
    return out;
  }

  // ------------------------------------------------------------ paint
  function screenFor(v: FleetView): { key: string; build: () => HTMLElement[] } {
    if (v.phase === 'reveal' || v.phase === 'closed') return { key: 'reveal', build: () => revealScreen(v) };
    if (v.phase === 'placement') return { key: 'placement', build: () => placementScreen(v) };
    if (v.shots.open && !sent) return { key: `shot:${v.round}:${v.shots.open.square}`, build: () => questionScreen(v) };
    if (sent) return { key: 'sent', build: () => sentScreen(v) };
    if (v.recall && !recalled.has(v.recall.ship_key)) {
      const r = v.recall;
      return { key: `recall:${r.ship_key}`, build: () => recallScreen(r) };
    }
    const owed = v.owed.find((o) => !filed.has(o.hit));
    if (owed) return { key: `report:${owed.hit}`, build: () => reportScreen(owed) };
    if (v.phase === 'firing') return { key: 'firing', build: () => firingScreen(v) };
    return { key: 'waiting', build: () => waitingScreen(v) };
  }

  function paintHead(): void {
    if (!view) {
      status.textContent = '';
      score.textContent = '';
      return;
    }
    const v = view;
    const phase = v.phase === 'placement' ? 'Placement' : v.phase === 'firing' ? `Round ${v.round} of ${v.rounds}` : v.phase === 'waiting' ? 'All rounds fired' : 'Reveal';
    status.textContent = `You are ${v.me.sign} · ${phase}`;
    score.textContent = `Us ${v.score.us} · Them ${v.score.them}`;
  }

  function repaint(force = false): void {
    if (closed) return;
    paintHead();
    if (!view) {
      const text = waitingForTeacher ? 'Waiting for your teacher to start the campaign.' : loadError || 'Loading the campaign…';
      const p = el('p', loadError && !waitingForTeacher ? 'fw-error' : 'fw-note fw-note--wait', text);
      if (loadError) p.setAttribute('role', 'alert');
      stage.replaceChildren(p);
      paintedSig = '';
      typingKey = '';
      return;
    }
    const screen = screenFor(view);
    // A box being typed in is never rebuilt by a poll.
    if (!force && typingKey && screen.key === typingKey) return;
    const sig = `${screen.key}|${JSON.stringify(view)}|${selected}|${message}|${[...layout].join(';')}|${activeShip}|${across}|${[...fired].join(',')}`;
    if (!force && sig === paintedSig) return;
    paintedSig = sig;
    typingKey = /^(shot|report|recall):/.test(screen.key) ? screen.key : '';
    const hadFocus = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.square : undefined;
    stage.replaceChildren(...screen.build());
    stage.dataset.screen = screen.key.split(':')[0];
    if (hadFocus !== undefined) stage.querySelector<HTMLElement>(`[data-square="${hadFocus}"]`)?.focus();
  }

  function show(next: FleetView): void {
    view = next;
    waitingForTeacher = false;
    loadError = '';
    repaint();
  }

  // ------------------------------------------------------------ clock and poll
  function tickClock(node: HTMLElement): void {
    const left = Math.max(0, Math.ceil((Number(node.dataset.deadline) - Date.now()) / 1000));
    node.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'Time’s up. Send what you have.';
    node.dataset.low = String(left <= 10);
  }
  const clockTimer = window.setInterval(() => root.querySelectorAll<HTMLElement>('[data-deadline]').forEach(tickClock), 1000);

  async function refresh(): Promise<void> {
    if (closed || inflight) return;
    inflight = true;
    try {
      show(await client.state(game.id));
    } catch (e) {
      if (errCode(e) === 'no_campaign') {
        view = null;
        waitingForTeacher = true;
        loadError = '';
      } else if (!view) loadError = errText(e, 'The campaign didn’t load. Checking again…');
      repaint();
    } finally {
      inflight = false;
    }
  }

  const pollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void refresh();
  }, options.pollMs ?? POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) close();
  };
  root.addEventListener('keydown', onKey);

  function close(): void {
    if (closed) return;
    closed = true;
    window.clearInterval(pollTimer);
    window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisible);
    for (const { sea } of seas.values()) sea.destroy();
    seas.clear();
    root.remove();
    returnFocus?.focus();
    options.onClose?.();
  }
  back.addEventListener('click', close);

  repaint();
  void refresh();
  return { close, refresh };
}

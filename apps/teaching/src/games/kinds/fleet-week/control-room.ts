import { el } from '@/quiz/dom';
import { replayText, type WritingStep } from '@/quiz/writing';
import { gameTeacherApi } from '../../api';
import { GAME_KIND_INFO, type Game } from '../../core/schema';
import { gameGlyph } from '../../glyphs';
import { pills } from '../../item-editors';
import { GRID, squareLabel } from './rules';
import type { FleetCampaignState, FleetControlApi, FleetFlag, FleetLogResult, FleetMember, FleetTeamState } from './control-api';
import './control-room.css';

/**
 * Fleet week, the teacher's control room (spec §1.6–§1.9, §5). Before a
 * campaign: class, rounds and round cap, then Open campaign (lesson mode).
 * During: polls `campaign_state` every 2 s and shows the phase, every match
 * with real names, who has placed or fired, owed damage reports, writing
 * flags with a typing replay, and standings, with Next round, Void shot,
 * Reject report, Reveal and Close. After the reveal, a large-type board view
 * for the projector: both fleets per match, hits and misses, names, the
 * winner and the hardest squares. A student's typed answer never reaches the
 * board view.
 */

export type FleetControlOptions = {
  lessonId: string;
  game: Game;
  classes: Array<{ id: string; name: string }>;
  /** The class picked first (defaults to the first class). */
  classId?: string | null;
  /** Defaults to the lesson's teacher API. */
  api?: FleetControlApi | null;
  pollMs?: number;
  now?: () => number;
};

export type FleetControlRoom = {
  root: HTMLElement;
  refresh(): Promise<void>;
  /** The latest campaign state, or null before a campaign is open. */
  state(): FleetCampaignState | null;
  dispose(): void;
};

type FleetSettings = { rounds?: number; round_cap_s?: number };

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const btn = (text: string, kind: 'primary' | 'secondary' | 'ghost' | 'danger', onClick: () => void): HTMLButtonElement => {
  const b = el('button', `btn btn--${kind === 'danger' ? 'secondary' : kind}${kind === 'danger' ? ' fc-danger' : ''}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const capLabel = (s: number) => (s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);

/** "Ana Example & Ben Sample", or "Ghost fleet". */
export const teamName = (t: FleetTeamState | undefined): string => (!t ? 'Unknown team' : t.ghost ? 'Ghost fleet' : t.members.map((m) => m.name).join(' & ') || 'Empty team');

export function phaseText(s: FleetCampaignState): string {
  if (s.closed_at) return 'Closed';
  if (s.revealed_at) return 'Revealed';
  if (s.round === 0) return 'Placing ships';
  if (s.round > s.rounds || s.closes_at === null) return 'Every round played';
  return `Round ${s.round} of ${s.rounds}`;
}
const roundOpen = (s: FleetCampaignState) => !s.closed_at && !s.revealed_at && s.round <= s.rounds && s.closes_at !== null;

/** Each resolved shot at a team's chart: square → hit or miss (practice shots and duds leave it unknown). */
export function chartMarks(s: FleetCampaignState, teamId: string): Map<number, 'hit' | 'miss'> {
  const marks = new Map<number, 'hit' | 'miss'>();
  for (const round of s.log) {
    for (const r of round.results) {
      if (r.target !== teamId) continue;
      if (r.outcome === 'hit') marks.set(r.square, 'hit');
      else if (r.outcome === 'miss' && marks.get(r.square) !== 'hit') marks.set(r.square, 'miss');
    }
  }
  return marks;
}

/** First-try accuracy per square from the resolved log, hardest first (at least two tries, not all right). */
export function hardestSquares(s: FleetCampaignState, limit = 3): Array<{ square: number; right: number; total: number }> {
  const tally = new Map<number, { right: number; total: number }>();
  const counts = (r: FleetLogResult) => r.outcome !== 'void' && r.outcome !== 'dup';
  for (const round of s.log) {
    for (const r of round.results) {
      if (!counts(r)) continue;
      const t = tally.get(r.square) ?? { right: 0, total: 0 };
      t.total += 1;
      if (r.correct === true) t.right += 1;
      tally.set(r.square, t);
    }
  }
  return [...tally.entries()]
    .map(([square, t]) => ({ square, ...t }))
    .filter((t) => t.total >= 2 && t.right < t.total)
    .sort((a, b) => a.right / a.total - b.right / b.total || b.total - a.total || a.square - b.square)
    .slice(0, limit);
}

function chart(team: FleetTeamState | undefined, marks: Map<number, 'hit' | 'miss'>, size: 'sm' | 'lg'): HTMLElement {
  const ships = new Set((team?.fleet ?? []).flatMap((ship) => ship.squares));
  const grid = el('div', `fc-chart fc-chart--${size}`);
  grid.setAttribute('role', 'img');
  const hits = [...marks.values()].filter((m) => m === 'hit').length;
  const misses = marks.size - hits;
  grid.setAttribute('aria-label', `${teamName(team)}: ${hits} hit${hits === 1 ? '' : 's'}, ${misses} miss${misses === 1 ? '' : 'es'}`);
  grid.append(el('span', 'fc-chart__corner'));
  for (let c = 0; c < GRID; c += 1) grid.append(el('span', 'fc-chart__head', String(c + 1)));
  for (let r = 0; r < GRID; r += 1) {
    grid.append(el('span', 'fc-chart__head', 'ABCDE'[r]));
    for (let c = 0; c < GRID; c += 1) {
      const i = r * GRID + c;
      const mark = marks.get(i);
      const cell = el('span', 'fc-chart__cell');
      if (ships.has(i)) cell.classList.add('is-ship');
      if (mark) cell.classList.add(`is-${mark}`);
      cell.title = `${squareLabel(i)}${mark ? ` · ${mark}` : ''}`;
      if (mark) cell.textContent = mark === 'hit' ? '✕' : '•';
      grid.append(cell);
    }
  }
  return grid;
}

function memberStatus(m: FleetMember, s: FleetCampaignState): { text: string; tone: 'done' | 'busy' | 'idle' } {
  if (s.round === 0) return m.done ? { text: 'Placed', tone: 'done' } : { text: m.seen ? 'Placing…' : 'Not opened', tone: m.seen ? 'busy' : 'idle' };
  if (!roundOpen(s)) return { text: '—', tone: 'idle' };
  if (m.done) return { text: `Fired ${m.shots}`, tone: 'done' };
  if (m.shots) return { text: `Fired ${m.shots}…`, tone: 'busy' };
  return { text: m.seen ? 'Not fired' : 'Not opened', tone: 'idle' };
}

/** A small typing replay: the counts, then the text rebuilt step by step. */
function replay(flag: FleetFlag): HTMLDetailsElement {
  const box = el('details', 'fc-replay');
  box.append(el('summary', '', 'Typing replay (teacher only)'));
  const steps = Array.isArray(flag.writing?.steps) ? (flag.writing!.steps as WritingStep[]) : [];
  const base = typeof flag.writing?.base === 'string' ? flag.writing.base : '';
  const out = el('pre', 'fc-replay__text', steps.length || base ? replayText({ base, steps }) : 'No typing was recorded.');
  const meta = el('p', 'gm-note', `${steps.length} change${steps.length === 1 ? '' : 's'}${typeof flag.writing?.ms === 'number' ? ` · ${Math.round(flag.writing.ms / 1000)} s typing` : ''}${flag.writing?.full ? ' · replay cut short' : ''}`);
  let timer: ReturnType<typeof setInterval> | null = null;
  const play = btn('Play', 'ghost', () => {
    if (timer) clearInterval(timer);
    let at = 0;
    timer = setInterval(() => {
      at += 1;
      out.textContent = replayText({ base, steps }, at);
      if (at >= steps.length && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 120);
  });
  play.disabled = !steps.length;
  box.append(meta, play, out);
  return box;
}

/** "Run Fleet week" rows for the editor's Results tab (null when the lesson has no Fleet week game). */
export function fleetLauncher(o: { games: Game[]; classes: Array<{ id: string; name: string }>; classId: string | null; lessonId: string; api: FleetControlApi | null | undefined }): HTMLElement | null {
  const fleets = o.games.filter((g) => g.kind === 'fleet_week');
  if (!fleets.length) return null;
  const panel = el('section', 'gm-panel gl-launch fc-launch');
  const head = el('div', 'gm-panel__head');
  head.append(el('h3', 'gm-h3', 'Fleet week'));
  panel.append(head, el('p', 'gm-note', o.api ? 'Opens the control room: pick the class and rounds, then run the game in this lesson.' : 'The control room needs the server. Publish and open this lesson in the teacher hub.'));
  const list = el('div', 'gl-launch__list');
  for (const g of fleets) {
    const row = el('div', 'gl-launch__row');
    const text = el('div', 'gl-launch__text');
    text.append(el('b', '', g.title || GAME_KIND_INFO[g.kind].label), el('span', 'gm-note', `${GAME_KIND_INFO[g.kind].label} · in teams, on phones, over a lesson`));
    const go = btn('Run Fleet week', 'primary', () => {
      openFleetControlRoom(document.body, { lessonId: o.lessonId, game: g, classes: o.classes, classId: o.classId, api: o.api });
    });
    go.disabled = !o.api;
    row.append(gameGlyph(g.kind, 'sm'), text, go);
    list.append(row);
  }
  panel.append(list);
  return panel;
}

export function openFleetControlRoom(host: HTMLElement, o: FleetControlOptions): FleetControlRoom {
  const api: FleetControlApi | null = o.api === undefined ? (gameTeacherApi(o.lessonId).fleet ?? null) : o.api;
  const now = o.now ?? (() => Date.now());
  const pollMs = o.pollMs ?? 2000;
  const settings = ((o.game as { settings?: FleetSettings }).settings ?? {}) as FleetSettings;
  const title = o.game.title || 'Fleet week';
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let classId: string | null = o.classId ?? o.classes[0]?.id ?? null;
  let rounds = settings.rounds ?? 5;
  let capS = settings.round_cap_s ?? 240;
  let state: FleetCampaignState | null = null;
  let painted = '';
  let busy = false;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let boardEl: HTMLElement | null = null;
  let boardAt = 0;
  const openReplays = new Set<string>();

  const root = el('div', 'fc');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Fleet week control room: ${title}`);
  root.tabIndex = -1;
  const top = el('header', 'fc-top');
  const heading = el('div', 'fc-top__title');
  heading.append(el('p', 'fc-kicker', 'Fleet week · control room'), el('h2', 'fc-h2', title));
  const phase = el('p', 'fc-phase');
  phase.setAttribute('aria-live', 'polite');
  const timeLeft = el('p', 'fc-time');
  const leave = btn('Leave', 'ghost', () => handle.dispose());
  leave.title = 'Leave the control room. The game keeps running.';
  top.append(heading, phase, timeLeft, leave);
  const status = el('p', 'fc-status');
  status.setAttribute('role', 'status');
  const confirmBar = el('div', 'fc-confirm');
  confirmBar.hidden = true;
  const main = el('main', 'fc-main');
  root.append(top, status, confirmBar, main);
  host.append(root);
  root.focus();

  const className = () => o.classes.find((c) => c.id === classId)?.name ?? 'this class';

  function say(text: string, error = false): void {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function askConfirm(question: string, yes: string, run: () => void): void {
    confirmBar.replaceChildren();
    confirmBar.hidden = false;
    const go = btn(yes, 'primary', () => {
      confirmBar.hidden = true;
      run();
    });
    go.classList.add('fc-confirm__yes');
    const no = btn('Cancel', 'ghost', () => {
      confirmBar.hidden = true;
    });
    confirmBar.append(el('p', 'fc-confirm__q', question), go, no);
    go.focus();
  }

  async function act(label: string, call: () => Promise<FleetCampaignState>, done?: string): Promise<void> {
    if (!api || busy) return;
    busy = true;
    say(label);
    try {
      apply(await call());
      say(done ?? '');
    } catch (e) {
      say(errText(e, 'That didn’t work. Try again.'), true);
    } finally {
      busy = false;
      paintTop();
    }
  }

  function apply(next: FleetCampaignState): void {
    state = next;
    paintTop();
    const key = JSON.stringify(next);
    if (key !== painted) {
      painted = key;
      paintRoom();
      if (boardEl) paintBoard();
    }
    schedule();
  }

  function schedule(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (disposed || !state || state.closed_at) return;
    pollTimer = setTimeout(() => void handle.refresh(), pollMs);
  }

  // ------------------------------------------------------------ top bar
  function paintTop(): void {
    if (!state) {
      phase.textContent = 'Not started';
      timeLeft.textContent = '';
      return;
    }
    phase.textContent = `${phaseText(state)} · ${className()}`;
    timeLeft.textContent = roundOpen(state) && state.closes_at !== null ? `${clock(state.closes_at - now())} left` : '';
  }
  const tick = setInterval(() => {
    if (state) paintTop();
  }, 1000);

  // ------------------------------------------------------------ setup
  function paintSetup(): void {
    main.replaceChildren();
    const card = el('section', 'fc-card fc-setup');
    card.append(el('h3', 'fc-h3', 'Open a campaign'), el('p', 'gm-note', 'Lesson mode: phones poll, and you move the class on with Next round. If one is already running for the class, this picks it up.'));
    if (o.classes.length) {
      const field = el('div', 'gm-field');
      field.append(
        el('span', 'gm-field__label', 'Class'),
        pills(o.classes.map((c): [string, string] => [c.id, c.name]), classId ?? '', 'Class', (v) => {
          classId = v;
        })
      );
      card.append(field);
    } else card.append(el('p', 'gm-note', 'No class teaches this unit yet. Add a class first.'));

    const roundsField = el('label', 'gm-field');
    const roundsPick = el('select', 'gm-select');
    roundsPick.name = 'rounds';
    for (let n = 2; n <= 8; n += 1) {
      const opt = el('option', '', `${n} rounds`);
      opt.value = String(n);
      opt.selected = n === rounds;
      roundsPick.append(opt);
    }
    roundsPick.addEventListener('change', () => (rounds = Number(roundsPick.value)));
    roundsField.append(el('span', 'gm-field__label', 'Rounds'), roundsPick);

    const capField = el('label', 'gm-field');
    const capPick = el('select', 'gm-select');
    capPick.name = 'round_cap_s';
    const caps = new Set([60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540, 600, capS]);
    for (const s of [...caps].sort((a, b) => a - b)) {
      const opt = el('option', '', capLabel(s));
      opt.value = String(s);
      opt.selected = s === capS;
      capPick.append(opt);
    }
    capPick.addEventListener('change', () => (capS = Number(capPick.value)));
    capField.append(el('span', 'gm-field__label', 'Round cap'), capPick);

    const row = el('div', 'fc-row');
    row.append(roundsField, capField);
    const open = btn('Open campaign', 'primary', () => {
      if (!classId || !api) return;
      const id = classId;
      void act(`Opening Fleet week for ${className()}…`, () => api.open(o.game.id, id, { rounds, round_cap_s: capS }), 'Campaign open. Students open the game on their phones to place ships.');
    });
    open.classList.add('fc-open');
    open.disabled = !classId || !api;
    card.append(row, open);
    if (!api) card.append(el('p', 'gm-note', 'The control room needs the server.'));
    main.append(card);
  }

  // ------------------------------------------------------------ room
  function paintRoom(): void {
    const s = state;
    if (!s) return paintSetup();
    main.replaceChildren();
    const teamById = new Map(s.teams.map((t) => [t.id, t]));
    const live = !s.closed_at;

    const bar = el('div', 'fc-actions');
    const next = btn('Next round', 'primary', () => void act('Closing this round…', () => api!.next(o.game.id, classId!, s.campaign_id), 'Round closed.'));
    next.disabled = !live || !roundOpen(s);
    const reveal = btn(s.revealed_at ? 'Show the reveal board' : 'Reveal', 'primary', () => {
      if (s.revealed_at) return openBoard();
      askConfirm('Reveal to the class? Names and both fleets show on every phone. This can’t be undone.', 'Reveal now', () =>
        void act('Revealing…', () => api!.reveal(o.game.id, classId!, s.campaign_id), 'Revealed.').then(() => {
          if (state?.revealed_at) openBoard();
        })
      );
    });
    reveal.classList.add('fc-reveal');
    reveal.disabled = !!s.closed_at && !s.revealed_at;
    const close = btn('Close campaign', 'danger', () =>
      askConfirm('Close this campaign? Students can’t play it any more, and the class is free for a new one.', 'Close campaign', () =>
        void act('Closing…', () => api!.close(o.game.id, classId!, s.campaign_id), 'Campaign closed.')
      )
    );
    close.disabled = !live;
    bar.append(next, reveal, close);
    main.append(bar);

    // Matches, grouped by team.
    const matches = el('section', 'fc-card');
    matches.append(el('h3', 'fc-h3', 'Matches'));
    const grid = el('div', 'fc-matches');
    for (const m of s.matches) {
      const card = el('article', 'fc-match');
      card.append(el('p', 'fc-match__title', `${m.id.toUpperCase()}${m.ended ? ' · fleet sunk' : ''}`));
      const sides = el('div', 'fc-match__sides');
      m.teams.forEach((tid, k) => {
        const t = teamById.get(tid);
        const side = el('div', `fc-team fc-team--${k + 1}`);
        side.append(el('p', 'fc-team__name', teamName(t)), el('p', 'fc-team__damage', `${t?.damage ?? 0} damage`));
        const members = el('ul', 'fc-members');
        for (const mem of t?.members ?? []) {
          const st = memberStatus(mem, s);
          const li = el('li', 'fc-member');
          li.append(el('span', 'fc-member__name', mem.name), el('span', `fc-pill fc-pill--${st.tone}`, st.text));
          members.append(li);
        }
        if (t?.ghost) members.append(el('li', 'gm-note', 'Ships placed by the app.'));
        side.append(members, chart(t, chartMarks(s, tid), 'sm'));
        sides.append(side);
      });
      card.append(sides);
      grid.append(card);
    }
    if (!s.matches.length) grid.append(el('p', 'gm-note', 'No matches yet.'));
    matches.append(grid);
    main.append(matches);

    // Owed damage reports.
    const owed = el('section', 'fc-card');
    owed.append(el('h3', 'fc-h3', `Damage reports owed (${s.owed.length})`));
    if (!s.owed.length) owed.append(el('p', 'gm-note', 'None owed.'));
    const owedList = el('ul', 'fc-list');
    for (const h of s.owed) {
      const li = el('li', 'fc-item');
      const partner = teamById.get(h.team)?.members.filter((mm) => mm.name !== h.by).map((mm) => mm.name).join(' & ');
      li.append(el('p', 'fc-item__head', `${h.by} hit ${squareLabel(h.square)} in round ${h.round} · ${partner ? `${partner} owes` : 'owed'} the report by round ${h.due}${h.rejected ? ' · returned once' : ''}`));
      if (h.filed) {
        li.append(el('p', 'fc-item__text', `Filed by ${h.filed.by}: “${h.filed.text}”`));
        if (live && !h.rejected) li.append(btn('Reject report', 'secondary', () => void act('Returning the report…', () => api!.rejectReport(o.game.id, classId!, h.hit, s.campaign_id), 'Report returned to the partner.')));
      } else li.append(el('p', 'gm-note', 'Not filed yet.'));
      owedList.append(li);
    }
    owed.append(owedList);
    main.append(owed);

    // Writing flags.
    const flags = el('section', 'fc-card');
    flags.append(el('h3', 'fc-h3', `Writing flags (${s.flags.length})`));
    if (!s.flags.length) flags.append(el('p', 'gm-note', 'No pastes, time away or bursts.'));
    const flagList = el('ul', 'fc-list');
    for (const f of s.flags) {
      const li = el('li', 'fc-item fc-flag');
      const what = f.kind === 'answer' ? `answer at ${squareLabel(f.square ?? -1)}` : f.kind === 'report' ? 'damage report' : 'recall line';
      const marks = [f.pastes ? `${f.pastes} paste${f.pastes === 1 ? '' : 's'}` : '', f.away ? `${f.away}× away` : '', f.jumps ? `${f.jumps} burst${f.jumps === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      li.append(el('p', 'fc-item__head', `${f.name} · round ${f.round} · ${what}`), el('p', 'fc-flag__marks', marks));
      if (f.kind === 'answer' && typeof f.seq === 'number' && live && roundOpen(s) && f.round === s.round) {
        const shot = { round: f.round, owner: f.owner, seq: f.seq };
        li.append(btn('Void shot', 'secondary', () => void act('Voiding the shot…', () => api!.voidShot(o.game.id, classId!, shot, s.campaign_id), 'Shot voided: it becomes a dud that doesn’t return.')));
      }
      const r = replay(f);
      const key = `${f.kind}:${f.owner}:${f.round}:${f.seq ?? f.hit ?? f.ship ?? ''}`;
      r.open = openReplays.has(key);
      r.addEventListener('toggle', () => (r.open ? openReplays.add(key) : openReplays.delete(key)));
      li.append(r);
      flagList.append(li);
    }
    flags.append(flagList);
    main.append(flags);

    // Standings.
    const standings = el('section', 'fc-card');
    standings.append(el('h3', 'fc-h3', 'Standings'));
    for (const st of s.standings) {
      const table = el('table', 'fc-table');
      const head = el('tr');
      for (const h of ['Team', 'Damage', 'Sunk', 'First-try']) head.append(el('th', '', h));
      table.append(el('caption', '', `${st.match.toUpperCase()}${st.winner ? ` · leading: ${teamName(teamById.get(st.winner))}` : ' · level'}`), head);
      for (const row of st.teams) {
        const tr = el('tr');
        tr.append(el('td', '', teamName(teamById.get(row.team))), el('td', '', String(row.damage)), el('td', '', String(row.sunk)), el('td', '', `${Math.round(row.accuracy * 100)}%`));
        table.append(tr);
      }
      standings.append(table);
    }
    main.append(standings);

    // Last resolved round, in words (outcomes only: no answers).
    const last = s.log[s.log.length - 1];
    if (last && last.round > 0) {
      const log = el('section', 'fc-card');
      log.append(el('h3', 'fc-h3', `Round ${last.round} results`));
      const ul = el('ul', 'fc-list fc-log');
      for (const r of last.results) ul.append(el('li', '', `${r.name} → ${squareLabel(r.square)}: ${r.outcome}${r.sure ? ' (sure)' : ''}${r.damage ? ` · ${r.damage} damage` : ''}`));
      if (!last.results.length) ul.append(el('li', 'gm-note', 'No shots.'));
      log.append(ul);
      main.append(log);
    }
  }

  // ------------------------------------------------------------ board (projector)
  function openBoard(): void {
    if (boardEl || !state) return;
    boardEl = el('div', 'fc-board');
    boardEl.setAttribute('role', 'dialog');
    boardEl.setAttribute('aria-label', 'Fleet week reveal');
    boardEl.tabIndex = -1;
    boardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBoard();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
    root.append(boardEl);
    paintBoard();
    boardEl.focus();
  }
  function closeBoard(): void {
    boardEl?.remove();
    boardEl = null;
  }
  function step(d: number): void {
    if (!state?.matches.length) return;
    boardAt = (boardAt + d + state.matches.length) % state.matches.length;
    paintBoard();
  }
  function paintBoard(): void {
    const s = state;
    if (!boardEl || !s) return;
    boardEl.replaceChildren();
    const teamById = new Map(s.teams.map((t) => [t.id, t]));
    const m = s.matches[boardAt];
    const nav = el('div', 'fc-board__nav');
    const prev = btn('‹ Previous', 'ghost', () => step(-1));
    const nxt = btn('Next match ›', 'ghost', () => step(1));
    prev.disabled = nxt.disabled = s.matches.length < 2;
    nav.append(prev, el('span', 'fc-board__count', m ? `Match ${boardAt + 1} of ${s.matches.length}` : ''), nxt, btn('Close', 'ghost', closeBoard));
    boardEl.append(el('p', 'fc-board__kicker', `Fleet week · ${title}`), nav);
    if (!m) {
      boardEl.append(el('p', 'fc-board__empty', 'No matches.'));
      return;
    }
    const standing = s.standings.find((st) => st.match === m.id);
    const winner = standing?.winner ? teamById.get(standing.winner) : undefined;
    boardEl.append(el('h2', 'fc-board__winner', winner ? `${teamName(winner)} win${winner.members.length === 1 ? 's' : ''}` : standing ? 'A draw' : ''));
    const sides = el('div', 'fc-board__sides');
    for (const tid of m.teams) {
      const t = teamById.get(tid);
      const row = standing?.teams.find((r) => r.team === tid);
      const side = el('section', `fc-board__side${winner && winner.id === tid ? ' is-winner' : ''}`);
      side.append(el('h3', 'fc-board__team', teamName(t)), el('p', 'fc-board__stats', `${row?.damage ?? t?.damage ?? 0} damage · ${row?.sunk ?? 0} sunk · ${Math.round((row?.accuracy ?? 0) * 100)}% first try`));
      side.append(chart(t, chartMarks(s, tid), 'lg'));
      sides.append(side);
    }
    boardEl.append(sides);
    const hard = hardestSquares(s);
    if (hard.length) {
      const cols = (o.game as { columns?: string[] }).columns ?? [];
      const rows = (o.game as { rows?: string[] }).rows ?? [];
      const box = el('section', 'fc-board__hard');
      box.append(el('h3', 'fc-board__team', 'Hardest squares'));
      const ul = el('ul', 'fc-board__hardlist');
      for (const h of hard) {
        const topic = [rows[Math.floor(h.square / GRID)], cols[h.square % GRID]].filter(Boolean).join(' · ');
        ul.append(el('li', '', `${squareLabel(h.square)}${topic ? ` (${topic})` : ''}: ${h.right} of ${h.total} right`));
      }
      box.append(ul);
      boardEl.append(box);
    }
  }

  // ------------------------------------------------------------ handle
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !boardEl && !confirmBar.hidden) confirmBar.hidden = true;
  };
  root.addEventListener('keydown', onKey);

  const handle: FleetControlRoom = {
    root,
    state: () => state,
    async refresh() {
      if (!api || !state || !classId || busy || disposed) return schedule();
      try {
        const next = await api.state(o.game.id, classId, state.campaign_id);
        if (!disposed) apply(next);
      } catch (e) {
        say(errText(e, 'Lost touch with the server. Retrying…'), true);
        schedule();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearInterval(tick);
      root.remove();
      returnFocus?.focus();
    }
  };
  paintTop();
  paintSetup();
  return handle;
}

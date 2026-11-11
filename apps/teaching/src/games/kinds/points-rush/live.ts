import { el } from '@/quiz/dom';
import type { RoomView } from '../../core/room-protocol';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { avatar } from '../../live/board-parts';
import { animate, countUp, enter } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import { fmt, type ShownItem } from '../wager/content';
import { autoGoal, MILESTONES, type ShopRow, type Upgrade, type Verdict } from './engine';
import { mountStream, type StreamState } from './stream';
import './points-rush.css';

/**
 * Points rush live screens (spec §6.6; approved mockup
 * docs/mockups/games/points-rush.html).
 *
 * Board: the class goal card (total, % and time left, a bar that fills in
 * smooth chunks, ticks at 25/50/75% and the goal, each milestone a fanfare
 * card), the top-five race (avatars slide along their lanes, scores roll),
 * and four class numbers. The teacher's "first try vs came back" view and
 * its no-names class version are board views the teacher switches to.
 *
 * Phone: the shared stream (stream.ts) driven by the room.
 */

type BoardKV = {
  minutes: number;
  goal: number;
  class_earned: number;
  milestones: number[];
  over: boolean;
  started_at?: number;
  ends_at?: number;
  board: 'race' | 'insight' | 'anon';
  stats: { per_minute: number; first_pct: number | null; back_pct: number | null; upgrades: number };
  top: Array<{ initials: string; points: number }>;
  insight: {
    items: Array<{ item: string; label: string; first_pct: number | null; back_pct: number | null; first_n: number; back_n: number }>;
    students: Array<{ initials: string; first_pct: number | null; fixed_pct: number | null; still: number }>;
  };
};

type YouKV = {
  points: number;
  earned: number;
  streak: number;
  best: number;
  mult: number;
  up: Record<Upgrade, number>;
  answered: number;
  shop: ShopRow[];
  cur: { item: string; back: boolean; n: number; q: ShownItem | null } | null;
  last?: Verdict;
  summary?: { first_right: number; tried: number; missed: number; fixed: number; still: string[]; best: number };
  rank?: number;
  of?: number;
};
type PhoneKV = { minutes: number; goal: number; class_earned: number; over: boolean; started_at?: number; ends_at?: number; you: YouKV | null };

const kv = <T>(view: RoomView): T | null => ((view as RoomView & { kind_view?: unknown }).kind_view as T) ?? null;
const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const MILE_WORDS: Record<number, [string, string]> = { 25: ['Quarter way', 'A great start'], 50: ['Halfway', 'Keep it going'], 75: ['75%', 'Nearly there'], 100: ['Goal!', 'The whole class did that'] };

/* ── Board ─────────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'pr-board');
  host.append(root);
  let k: BoardKV | null = null;
  let mode: BoardKV['board'] | '' = '';
  let shownTotal = 0;
  let stopTotal: (() => void) | null = null;
  let seenMiles: number[] | null = null;
  let clockTimer = 0;
  let lastSec = -1;
  let paused = false;
  const lanes = new Map<string, { row: HTMLElement; rank: HTMLElement; av: HTMLElement; fill: HTMLElement; pts: HTMLElement; points: number }>();

  /* Live view parts, built once per mode. */
  let totalEl: HTMLElement | null = null;
  let pctEl: HTMLElement | null = null;
  let clockEl: HTMLElement | null = null;
  let fillEl: HTMLElement | null = null;
  let raceEl: HTMLElement | null = null;
  let ticks: HTMLElement[] = [];
  const stat: Record<string, HTMLElement> = {};

  function buildRace() {
    root.className = 'pr-board';
    root.replaceChildren();
    lanes.clear();
    const goal = el('section', 'pr-goal');
    goal.setAttribute('aria-label', 'Class goal');
    const row = el('div', 'pr-goal__row');
    const left = el('div', 'pr-goal__tot');
    totalEl = el('span', 'pr-total', fmt(shownTotal));
    left.append(el('span', 'gl-eyebrow', 'Class goal'), totalEl);
    const of = el('span', 'pr-of', `of ${fmt(k?.goal ?? 0)}`);
    pctEl = el('span', 'pr-pct', '0%');
    const clock = el('div', 'pr-clock');
    clockEl = el('b', '', '');
    clockEl.setAttribute('role', 'timer');
    clock.append(el('small', '', 'Time left'), clockEl);
    row.append(left, of, pctEl, clock);
    const barEl = el('div', 'pr-bar');
    fillEl = el('div', 'pr-bar__fill');
    barEl.append(fillEl, el('div', 'pr-bar__glint'));
    const tickRow = el('div', 'pr-ticks');
    ticks = MILESTONES.map((m) => {
      const t = el('span', 'pr-tick', m === 100 ? 'Goal' : m === 50 ? 'Halfway' : `${m}%`);
      t.style.left = `${m}%`;
      tickRow.append(t);
      return t;
    });
    goal.append(row, barEl, tickRow);
    const body = el('div', 'pr-body');
    const race = el('section', 'pr-race');
    race.append(el('h3', 'pr-race__h', 'Top five'));
    raceEl = el('div', 'pr-lanes');
    raceEl.setAttribute('role', 'list');
    race.append(raceEl);
    const side = el('aside', 'pr-side');
    const card = (key: string, label: string) => {
      const c = el('div', 'pr-card');
      const b = el('b', '', '0');
      stat[key] = b;
      c.append(el('small', '', label), b);
      side.append(c);
    };
    card('apm', 'Answers this minute');
    card('first', 'Right first time');
    card('back', 'Fixed when it came back');
    card('up', 'Upgrades bought');
    body.append(race, side);
    root.append(goal, body);
    void enter(goal);
    side.querySelectorAll('.pr-card').forEach((c, i) => void animate(c, [{ opacity: 0, transform: 'translateX(2em)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 200 + i * 80, fill: 'backwards' }));
  }

  function paintRace(view: RoomView) {
    if (!k || !totalEl || !pctEl || !fillEl || !raceEl) return;
    const total = k.class_earned;
    const pct = total / Math.max(1, k.goal);
    stopTotal?.();
    stopTotal = countUp(totalEl, shownTotal, total, 800);
    shownTotal = total;
    const ofEl = root.querySelector('.pr-of');
    if (ofEl) ofEl.textContent = `of ${fmt(k.goal)}`;
    pctEl.textContent = pct >= 1 ? `Goal smashed · ${Math.round(pct * 100)}%` : `${Math.floor(pct * 100)}%`;
    fillEl.style.transform = `scaleX(${Math.min(1, pct)})`;
    ticks.forEach((t, i) => t.classList.toggle('is-hit', pct * 100 >= MILESTONES[i]));
    stat.apm.textContent = fmt(k.stats.per_minute);
    stat.first.textContent = k.stats.first_pct === null ? '–' : `${k.stats.first_pct}%`;
    stat.back.textContent = k.stats.back_pct === null ? '–' : `${k.stats.back_pct}%`;
    stat.up.textContent = fmt(k.stats.upgrades);
    paintLanes();
    paused = view.phase === 'paused';
    paintClock(view);
  }

  function paintLanes() {
    if (!k || !raceEl) return;
    const top = k.top;
    const max = Math.max(1, top[0]?.points ?? 1);
    const firstTop = new Map([...lanes.values()].map((l) => [l.row, l.row.getBoundingClientRect().top]));
    const keep = new Set(top.map((r) => r.initials));
    for (const [ini, l] of lanes) if (!keep.has(ini)) {
      l.row.remove();
      lanes.delete(ini);
    }
    top.forEach((r, i) => {
      let l = lanes.get(r.initials);
      const fresh = !l;
      if (!l) {
        const row = el('div', 'pr-lane');
        row.setAttribute('role', 'listitem');
        const rank = el('span', 'pr-lane__rk');
        const track = el('div', 'pr-track');
        const line = el('div', 'pr-track__line');
        const fill = el('i');
        line.append(fill);
        const av = avatar(r.initials, 'pr-track__av');
        track.append(line, av);
        const pts = el('span', 'pr-lane__pts', '0');
        row.append(rank, track, pts);
        l = { row, rank, av, fill, pts, points: 0 };
        lanes.set(r.initials, l);
      }
      raceEl?.append(l.row);
      l.rank.textContent = String(i + 1);
      l.row.classList.toggle('is-first', i === 0);
      l.row.setAttribute('aria-label', `${i + 1}. ${r.initials}, ${fmt(r.points)} points`);
      const share = r.points / max;
      l.fill.style.transform = `scaleX(${share})`;
      l.av.style.left = `calc(${share} * (100% - 2.6em))`;
      if (r.points !== l.points) {
        const gain = r.points - l.points;
        countUp(l.pts, l.points, r.points, 700);
        if (!fresh && gain >= 300 && !api.calm()) {
          const plus = el('span', 'pr-plus', `+${fmt(gain)}`);
          plus.style.left = `calc(${share} * (100% - 2.6em) + 3em)`;
          l.row.querySelector('.pr-track')?.append(plus);
          void animate(plus, [{ opacity: 0, transform: 'translateY(0.4em)' }, { opacity: 1, transform: 'translateY(-0.2em)', offset: 0.3 }, { opacity: 0, transform: 'translateY(-1em)' }], { duration: 1200, easing: 'ease-out' }).then(() => plus.remove());
        }
        l.points = r.points;
      } else l.pts.textContent = fmt(r.points);
      if (fresh) void animate(l.row, [{ opacity: 0, transform: 'translateX(-1.5em)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
      else {
        const was = firstTop.get(l.row);
        const now = l.row.getBoundingClientRect().top;
        if (was !== undefined && Math.abs(was - now) > 1) void animate(l.row, [{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], { duration: 650 });
      }
    });
    if (!top.length && !raceEl.querySelector('.pr-empty')) raceEl.append(el('p', 'pr-empty', 'Scores appear as answers come in.'));
    if (top.length) raceEl.querySelector('.pr-empty')?.remove();
  }

  function paintClock(view?: RoomView) {
    if (!clockEl || !k) return;
    const left = paused ? view?.paused_left_ms ?? 0 : k.ends_at ? k.ends_at - api.serverNow() : k.minutes * 60_000;
    const sec = Math.ceil(Math.max(0, left) / 1000);
    clockEl.textContent = mmss(left);
    clockEl.parentElement?.classList.toggle('is-low', sec <= 15);
    if (sec !== lastSec && !paused) {
      if (lastSec !== -1 && sec <= 5 && sec > 0) api.sfx.tick();
      lastSec = sec;
    }
  }

  function milestone(m: number) {
    const [big, line] = MILE_WORDS[m] ?? [`${m}%`, ''];
    root.querySelector('.pr-mile')?.remove();
    const wrap = el('div', 'pr-mile');
    wrap.setAttribute('role', 'status');
    const inner = el('div', 'pr-mile__in');
    inner.append(el('small', '', 'Class goal'), el('b', '', big), el('span', '', `${fmt(((k?.goal ?? 0) * m) / 100)} points · ${line}`));
    wrap.append(inner);
    root.append(wrap);
    api.sfx.fanfare();
    if (m === 100 && !api.calm()) void confetti(root);
    void animate(inner, [{ opacity: 0, transform: 'scale(.6) rotate(-4deg)' }, { opacity: 1, transform: 'scale(1.05) rotate(1deg)', offset: 0.5 }, { opacity: 1, transform: 'none' }], { duration: 650 });
    setTimeout(() => {
      void animate(inner, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.92) translateY(-1em)' }], { duration: 400, fill: 'forwards' }).then(() => wrap.remove());
    }, api.calm() ? 1200 : 2000);
  }

  function buildInsight() {
    if (!k) return;
    root.className = 'pr-board pr-board--insight';
    root.replaceChildren();
    const wrap = el('div', 'pr-ins');
    wrap.append(el('span', 'gl-eyebrow', 'Teacher only · not for the projector'), el('h2', 'pr-ins__h', 'First try vs when it came back'));
    const legend = el('div', 'pr-legend');
    legend.innerHTML = '<span><i class="pr-dot--first"></i>Right first try</span><span><i class="pr-dot--back"></i>Right when it came back</span>';
    const grid = el('div', 'pr-ins__grid');
    const rows = el('div', 'pr-db');
    for (const x of k.insight.items.slice(0, 8)) {
      const r = el('div', 'pr-db__row');
      // Labels are whole prompts, not short terms: two lines at most, with the Reteach tag outside the clamp so it always shows.
      const name = el('span', 'pr-db__name');
      const lbl = el('span', 'pr-db__lbl', x.label);
      lbl.title = x.label;
      name.append(lbl);
      if (x.back_pct !== null && x.back_pct < 75) name.append(el('span', 'pr-db__re', 'Reteach'));
      const tr = el('div', 'pr-db__tr');
      const f = x.first_pct ?? 0;
      const b = x.back_pct ?? f;
      const gap = el('span', 'pr-db__gap');
      gap.style.left = `${Math.min(f, b)}%`;
      gap.style.width = `${Math.abs(b - f)}%`;
      const d1 = el('span', 'pr-db__d pr-dot--first');
      d1.style.left = `${f}%`;
      tr.append(gap, d1);
      if (x.back_pct !== null) {
        const d2 = el('span', 'pr-db__d pr-dot--back');
        d2.style.left = `${b}%`;
        tr.append(d2);
      }
      const nums = el('span', 'pr-db__nums');
      nums.innerHTML = `${x.first_pct ?? '–'}% → <b>${x.back_pct === null ? '–' : `${x.back_pct}%`}</b>`;
      r.append(name, tr, nums);
      rows.append(r);
    }
    if (!k.insight.items.length) rows.append(el('p', 'pr-empty', 'Nothing answered yet.'));
    const tbl = el('div', 'pr-tbl');
    const th = el('div', 'pr-tbl__th');
    th.append(el('span', '', 'Student'), el('span', '', 'First try'), el('span', '', 'Fixed on come-back'), el('span', '', 'Still to fix'));
    tbl.append(th);
    for (const s of k.insight.students.slice(0, 12)) {
      const r = el('div', 'pr-tbl__row');
      r.append(el('span', 'pr-tbl__who', s.initials), el('span', '', s.first_pct === null ? '–' : `${s.first_pct}%`), el('span', s.fixed_pct !== null && s.fixed_pct < 60 ? 'is-hot' : '', s.fixed_pct === null ? '–' : `${s.fixed_pct}%`), el('span', s.still >= 3 ? 'is-hot' : '', String(s.still)));
      tbl.append(r);
    }
    grid.append(rows, tbl);
    wrap.append(legend, grid, el('p', 'pr-foot', 'Every item records first try, tries until right, and time. A big jump means the come-back worked; a small one means the class is guessing, not learning it.'));
    root.append(wrap);
    rows.querySelectorAll('.pr-db__gap').forEach((g, i) => void animate(g, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 800, delay: 200 + i * 70, fill: 'backwards' }));
  }

  function buildAnon() {
    if (!k) return;
    root.className = 'pr-board pr-board--anon';
    root.replaceChildren();
    const wrap = el('div', 'pr-anon');
    wrap.append(el('span', 'gl-eyebrow', 'Safe for the projector · no names'), el('h2', '', 'Fixed on the second go'));
    const jumps = k.insight.items.filter((x) => x.back_pct !== null && x.first_pct !== null).sort((a, b) => (b.back_pct ?? 0) - (b.first_pct ?? 0) - ((a.back_pct ?? 0) - (a.first_pct ?? 0))).slice(0, 3);
    for (const x of jumps) {
      const r = el('div', 'pr-anon__row');
      const em = el('em');
      em.innerHTML = `${x.first_pct}% first try → <b>${x.back_pct}%</b> when it came back`;
      r.append(el('span', '', x.label), em);
      wrap.append(r);
    }
    if (!jumps.length) wrap.append(el('p', 'pr-empty', 'Nothing has come back yet.'));
    const tricky = k.insight.items.filter((x) => (x.first_pct ?? 100) < 50 && (x.back_pct ?? 0) < 60).slice(0, 2);
    if (tricky.length) {
      const r = el('div', 'pr-anon__row');
      r.append(el('em', '', 'Still tricky:'), ...tricky.map((x) => el('span', '', x.label)));
      wrap.append(r);
    }
    root.append(wrap);
    wrap.querySelectorAll('.pr-anon__row').forEach((n, i) => void animate(n, [{ opacity: 0, transform: 'translateY(1em)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: i * 150, fill: 'backwards' }));
    api.sfx.reveal();
  }

  clockTimer = window.setInterval(() => paintClock(), 250);

  return {
    update(view) {
      const next = kv<BoardKV>(view);
      if (!next) return;
      k = next;
      if (k.board !== mode || (k.board === 'race' && !root.querySelector('.pr-goal'))) {
        mode = k.board;
        if (mode === 'race') buildRace();
        else if (mode === 'insight') buildInsight();
        else buildAnon();
      } else if (mode === 'insight') buildInsight();
      if (mode === 'race') paintRace(view);
      if (seenMiles === null) seenMiles = [...k.milestones];
      for (const m of k.milestones) if (!seenMiles.includes(m)) {
        seenMiles.push(m);
        if (mode === 'race') milestone(m);
      }
    },
    controls(view) {
      const cur = kv<BoardKV>(view) ?? k;
      if (!cur) return [];
      const auto = autoGoal(view.seats.length, cur.minutes);
      const presets = [Math.round(auto / 2 / 1000) * 1000 || 1000, auto, Math.round((auto * 1.5) / 1000) * 1000];
      const nextGoal = presets.find((g) => g > cur.goal) ?? presets[0];
      const out: Array<{ label: string; name: string; data?: unknown; key?: string; primary?: boolean }> = [];
      if (cur.board === 'race') {
        out.push({ label: `Class goal ${fmt(cur.goal)} · change`, name: 'goal', data: { goal: nextGoal } });
        out.push({ label: '+1 min', name: 'add_time', data: { seconds: 60 }, key: '+' });
        out.push({ label: 'Teacher view', name: 'show', data: { view: 'insight' } });
        out.push({ label: 'End now', name: 'end_now', primary: true });
      } else if (cur.board === 'insight') {
        out.push({ label: 'Class version (no names)', name: 'show', data: { view: 'anon' } });
        out.push({ label: 'Back to the rush', name: 'show', data: { view: 'race' }, primary: true });
      } else out.push({ label: 'Back to teacher view', name: 'show', data: { view: 'insight' }, primary: true });
      return out;
    },
    dispose() {
      clearInterval(clockTimer);
      stopTotal?.();
      root.remove();
    }
  };
}

/* ── Phone ─────────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  let k: PhoneKV | null = null;
  let waiters: Array<{ ready: (y: YouKV) => boolean; resolve: (y: YouKV | null) => void }> = [];
  /** Resolves with this seat's slice once a view passes `ready` (or null after `ms`: the ack alone then decides). */
  const waitFor = (ready: (y: YouKV) => boolean, ms = 4000) =>
    new Promise<YouKV | null>((resolve) => {
      waiters.push({ ready, resolve });
      setTimeout(() => resolve(null), ms);
    });

  const stateOf = (p: PhoneKV): StreamState => {
    const y = p.you;
    return {
      points: y?.points ?? 0,
      streak: y?.streak ?? 0,
      best: y?.best ?? 0,
      mult: y?.mult ?? 1,
      up: y?.up ?? { mult: 0, streak: 0, ins: 0 },
      shop: y?.shop ?? [],
      cur: y?.cur ?? null,
      ...(p.ends_at ? { endsAt: p.ends_at } : {}),
      totalMs: p.minutes * 60_000,
      over: p.over
    };
  };

  const stream = mountStream(host, {
    calm: api.calm,
    sfx: api.sfx,
    toast: api.toast,
    setActions: api.setActions,
    driver: {
      now: api.serverNow,
      async answer(item, response) {
        const before = k?.you?.answered ?? 0;
        const after = waitFor((y) => y.answered > before);
        const ack = await api.move({ item, move: 'answer', response });
        const you = await after;
        const correct = ack.correct === true;
        const verdict = you?.last && you.last.item === item ? you.last : null;
        return { correct, verdict, state: k ? stateOf(k) : (null as unknown as StreamState) };
      },
      async buy(up) {
        const level = k?.you?.up[up] ?? 0;
        const after = waitFor((y) => y.up[up] > level, 3000);
        await api.control('buy', { up });
        await after;
        return k ? stateOf(k) : null;
      }
    }
  });

  return {
    update(view) {
      const next = kv<PhoneKV>(view);
      if (!next) return;
      k = next;
      const y = next.you;
      if (y) {
        const ready = waiters.filter((w) => w.ready(y));
        waiters = waiters.filter((w) => !ready.includes(w));
        ready.forEach((w) => w.resolve(y));
      }
      stream.set(stateOf(next));
    },
    onKey: (e) => stream.onKey(e),
    dispose() {
      waiters.forEach((w) => w.resolve(null));
      waiters = [];
      stream.dispose();
    }
  };
}

registerLiveKind('points_rush', { board: mountBoard, phone: mountPhone });

export { mountBoard as mountRushBoard, mountPhone as mountRushPhone };

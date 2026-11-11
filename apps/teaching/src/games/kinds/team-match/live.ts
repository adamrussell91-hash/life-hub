import { el } from '@/quiz/dom';
import { WRONG_TAP_LABELS, type WrongTap } from '../../core/schema';
import type { RoomView } from '../../core/room-protocol';
import { animate, calm, flip, springEasing } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import { avatar } from '../../live/board-parts';
import { ordinal } from '../../live/format';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { teamColour, teamName, teamSoft } from '../jeopardy/shared';
import type { TeamMatchLane, TeamMatchView } from './rules';
import './team-match.css';

/**
 * Team match on the board and the phone (spec §6.5; approved mockup
 * docs/mockups/games/team-match.html). The board: one lane per team, tokens
 * sliding forward on springs, a crash-and-rewind on a wrong tap (the lane
 * glows red, "Back 3" pops, ghosts trail the token home), standings that
 * reorder, a feed of wrong taps and finishes, and the teacher's wrong-tap
 * setting. The phone: the team's question, this member's share of the 12
 * answers, teammates with how many each holds, and a green or red flash for
 * the whole team when anyone taps.
 */

const kv = (v: RoomView | null): TeamMatchView | null => (v?.kind_view as TeamMatchView | undefined) ?? null;
const mark = (team: number) => teamName(team).slice(0, 1);
const backLabel = (mode: WrongTap) => WRONG_TAP_LABELS[mode] ?? 'Back 3';
const setTeam = (node: HTMLElement, team: number) => {
  node.style.setProperty('--c', teamColour(team));
  node.style.setProperty('--soft', teamSoft(team));
};
const FLAG =
  '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true"><path d="M5 3v18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h6v4H6zM12 8h6v4h-6z" fill="currentColor"/><path d="M12 4h6v4h-6zM6 8h6v4H6z" fill="currentColor" opacity=".35"/></svg>';

/* ── Board ─────────────────────────────────────────────────────────── */

export function teamMatchBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'tm');
  const head = el('div', 'tm-head');
  const eyebrow = el('span', 'gl-eyebrow');
  head.append(eyebrow, el('p', 'tm-h', 'Talk first. Only one phone on each team holds the answer.'));
  const feedBox = el('div', 'tm-feed');
  feedBox.setAttribute('aria-live', 'polite');
  const track = el('div', 'tm-track');
  const standHead = el('div', 'tm-stand-h', 'Standings');
  const stand = el('div', 'tm-stand');
  const side = el('div', 'tm-side');
  side.append(standHead, stand);
  const setting = el('p', 'tm-set');
  const insightBtn = el('button', 'tm-insight-btn', 'False taps');
  insightBtn.type = 'button';
  const insight = el('div', 'tm-ins');
  insight.hidden = true;
  const foot = el('div', 'tm-foot');
  foot.append(setting, insightBtn);
  root.append(head, feedBox, track, side, foot, insight);
  host.append(root);

  let view: RoomView | null = null;
  let disposed = false;
  let insightOpen = false;
  let built = '';
  const lanes = new Map<number, HTMLElement>();
  const rows = new Map<number, HTMLElement>();
  const shown = new Map<number, { step: number; place: number | null; lastAt: number }>();
  const busy = new Set<number>();
  let feedTop = 0;

  insightBtn.addEventListener('click', () => {
    insightOpen = !insightOpen;
    paintInsight();
  });

  function cellX(lane: HTMLElement, s: number): number {
    const road = lane.querySelector('.tm-road') as HTMLElement;
    const c = road.children[s] as HTMLElement | undefined;
    return c ? c.offsetLeft + c.offsetWidth / 2 : 0;
  }

  function place(team: number, step: number, placeNo: number | null, instant = false): void {
    const lane = lanes.get(team);
    if (!lane) return;
    const k = kv(view);
    const N = k?.track ?? 12;
    const tok = lane.querySelector<HTMLElement>('.tm-tok') as HTMLElement;
    if (instant) tok.style.transition = 'none';
    const x = cellX(lane, placeNo ? N + 1 : step);
    tok.style.transform = `translateX(calc(${x}px - 50%))`;
    tok.classList.toggle('won', !!placeNo);
    (tok.firstElementChild as HTMLElement).textContent = placeNo ? ordinal(placeNo) : mark(team);
    lane.querySelectorAll('.tm-cell').forEach((c, i) => c.classList.toggle('on', i < step));
    if (instant) {
      void tok.offsetWidth;
      tok.style.transition = '';
    }
  }

  function build(k: TeamMatchView): void {
    track.replaceChildren();
    lanes.clear();
    stand.replaceChildren();
    rows.clear();
    track.style.setProperty('--n', String(k.track));
    for (const l of k.lanes) {
      const lane = el('div', 'tm-lane');
      lane.dataset.t = String(l.team);
      setTeam(lane, l.team);
      const name = el('div', 'tm-name');
      const who = el('span');
      who.append(el('b', '', teamName(l.team)), el('small', '', l.members.map((m) => m.initials).join(' ')));
      name.append(el('span', 'tm-badge', mark(l.team)), who);
      const road = el('div', 'tm-road');
      road.append(el('i', 'tm-start'));
      for (let i = 0; i < k.track; i++) road.append(el('i', 'tm-cell'));
      const flag = el('i', 'tm-flag');
      flag.innerHTML = FLAG;
      road.append(flag);
      const tok = el('div', 'tm-tok');
      tok.append(el('div', 'tm-tok-in', mark(l.team)));
      road.append(tok);
      lane.append(name, road);
      track.append(lane);
      lanes.set(l.team, lane);
      const row = el('div', 'tm-srow');
      setTeam(row, l.team);
      row.append(el('span', 'rk'), el('span', 'nm', teamName(l.team)), el('span', 'st'));
      stand.append(row);
      rows.set(l.team, row);
    }
    requestFrame(() => k.lanes.forEach((l) => place(l.team, l.step, l.place, true)));
    [...lanes.values()].forEach((n, i) => void animate(n, [{ opacity: 0, transform: 'translateX(-60px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: i * 70, fill: 'backwards' }));
  }

  function requestFrame(fn: () => void): void {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => !disposed && fn());
    else fn();
  }

  function hop(team: number): void {
    const inner = lanes.get(team)?.querySelector('.tm-tok-in');
    void animate(inner, [{ transform: 'none' }, { transform: 'translateY(-22px) scale(1.14)', offset: 0.4 }, { transform: 'none' }], { duration: 620, calmFade: false });
  }

  async function crash(l: TeamMatchLane, mode: WrongTap): Promise<void> {
    const lane = lanes.get(l.team);
    const last = l.last;
    if (!lane || !last) return;
    busy.add(l.team);
    const road = lane.querySelector('.tm-road') as HTMLElement;
    const tok = lane.querySelector('.tm-tok') as HTMLElement;
    const inner = tok.firstElementChild as HTMLElement;
    lane.classList.add('crash');
    api.sfx.buzz();
    const boom = el('span', 'tm-boom', backLabel(mode));
    boom.style.left = `${cellX(lane, last.from)}px`;
    road.append(boom);
    if (!calm()) {
      void animate(boom, [{ opacity: 0, transform: 'translate(-50%, 16px) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1.08)', offset: 0.3 }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%, 0)' }], { duration: 1500, fill: 'forwards' });
      void animate(inner, [{ transform: 'none' }, { transform: 'translateX(-10px) rotate(-18deg)' }, { transform: 'translateX(12px) rotate(14deg)' }, { transform: 'translateX(-8px) rotate(-10deg)' }, { transform: 'translateX(5px) rotate(4deg)' }, { transform: 'none' }], { duration: 480, easing: 'ease-out' });
      await new Promise((r) => setTimeout(r, 520));
      for (let s = last.from; s > last.to; s--) {
        const g = el('i', 'tm-ghost');
        g.style.left = `${cellX(lane, s)}px`;
        road.append(g);
        void animate(g, [{ opacity: 0 }, { opacity: 0.45, offset: 0.2 }, { opacity: 0 }], { duration: 700, delay: (last.from - s) * 70, fill: 'both' }).then(() => g.remove());
      }
      tok.style.transition = `transform ${0.35 + (last.from - last.to) * 0.09}s cubic-bezier(.6,0,.2,1)`;
    }
    if (disposed) return;
    place(l.team, l.step, l.place);
    paintStand(kv(view) as TeamMatchView);
    await new Promise((r) => setTimeout(r, calm() ? 150 : 450 + (last.from - last.to) * 90));
    tok.style.transition = '';
    lane.classList.remove('crash');
    boom.remove();
    busy.delete(l.team);
    if (view && !disposed) paintLanes(kv(view) as TeamMatchView);
  }

  function paintLanes(k: TeamMatchView): void {
    for (const l of k.lanes) {
      const was = shown.get(l.team);
      const lastAt = l.last?.at ?? 0;
      if (!was) {
        shown.set(l.team, { step: l.step, place: l.place, lastAt });
        continue;
      }
      if (busy.has(l.team)) continue;
      const lane = lanes.get(l.team);
      lane?.querySelector('.tm-name small')?.replaceChildren(l.members.map((m) => m.initials).join(' '));
      if (lastAt !== was.lastAt && l.last && !l.last.correct) {
        shown.set(l.team, { step: l.step, place: l.place, lastAt });
        void crash(l, k.mode);
        continue;
      }
      if (l.step > was.step || (l.place && !was.place)) {
        place(l.team, l.step, l.place);
        hop(l.team);
        if (l.place && !was.place) {
          if (l.place === 1) {
            api.sfx.fanfare();
            void confetti(root);
          } else api.sfx.ding();
          void animate(lane?.querySelector('.tm-tok-in'), [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 700, easing: springEasing(), calmFade: false });
        } else api.sfx.click();
      } else if (l.step !== was.step) place(l.team, l.step, l.place);
      shown.set(l.team, { step: l.step, place: l.place, lastAt });
    }
  }

  function order(k: TeamMatchView): TeamMatchLane[] {
    return [...k.lanes].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.step - a.step || a.team - b.team);
  }

  function paintStand(k: TeamMatchView): void {
    const sorted = order(k);
    const mutate = () => sorted.forEach((l) => stand.append(rows.get(l.team) as HTMLElement));
    const moved = sorted.some((l, i) => stand.children[i] !== rows.get(l.team));
    if (moved && !calm()) void flip(stand, mutate);
    else if (moved) mutate();
    sorted.forEach((l, i) => {
      const row = rows.get(l.team) as HTMLElement;
      (row.querySelector('.rk') as HTMLElement).textContent = String(i + 1);
      (row.querySelector('.st') as HTMLElement).textContent = l.place ? ordinal(l.place) : `${l.step}/${k.track}`;
      row.classList.toggle('done', !!l.place);
    });
  }

  function paintFeed(k: TeamMatchView): void {
    const fresh = k.feed.filter((f) => f.at > feedTop).reverse();
    for (const f of fresh) {
      const pill = el('span', `tm-pill ${f.tone === 'bad' ? 'bad' : f.tone === 'win' ? 'win' : ''}`);
      setTeam(pill, f.team);
      pill.append(el('i'), f.text);
      feedBox.prepend(pill);
      void animate(pill, [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 450 });
      feedTop = Math.max(feedTop, f.at);
    }
    while (feedBox.children.length > 3) feedBox.lastElementChild?.remove();
  }

  function paintInsight(): void {
    const k = kv(view);
    const ins = k?.insight;
    insightBtn.hidden = !ins;
    insightBtn.setAttribute('aria-pressed', String(insightOpen));
    insight.hidden = !insightOpen || !ins;
    if (!insightOpen || !ins) return;
    const teacher = !!ins.students;
    const kids: HTMLElement[] = [el('span', 'gl-eyebrow', teacher ? 'Teacher view' : 'Safe for the projector · no names'), el('h2', '', teacher ? 'False taps: what people believed was right' : 'Most mixed up today')];
    if (!ins.pairs.length) kids.push(el('p', 'tm-foot-note', 'No false taps yet.'));
    const max = Math.max(1, ...ins.pairs.map((p) => p.n));
    const list = el('div', 'tm-pairs');
    for (const p of ins.pairs) {
      const row = el('div', 'tm-pair');
      const ln = el('div', 'ln');
      ln.append(el('em', '', 'Tapped'), el('b', '', p.tapped), el('em', '', 'when the answer was'), el('b', '', p.answer));
      const meta = el('div', 'meta');
      const bar = el('span', 'bar');
      const fill = el('i');
      fill.style.width = `${(p.n / max) * 100}%`;
      bar.append(fill);
      meta.append(bar, `${p.n} tap${p.n === 1 ? '' : 's'}${p.students ? ` · ${p.students} student${p.students === 1 ? '' : 's'}` : ''}${p.who?.length ? ` · ${p.who.join(' ')}` : ''}`);
      row.append(ln, meta);
      list.append(row);
    }
    kids.push(list);
    if (ins.students) {
      const tbl = el('div', 'tm-tbl');
      const th = el('div', 'th');
      th.append(el('span', '', 'Student'), el('span', '', 'Held it'), el('span', '', 'Tapped right'), el('span', '', 'False taps'));
      tbl.append(th);
      for (const s of ins.students) {
        const r = el('div');
        const who = el('span', 'who');
        if (s.team !== undefined) setTeam(who, s.team);
        who.append(el('i'), s.initials);
        r.append(who, el('span', '', String(s.held)), el('span', '', String(s.right)), el('span', s.false_taps >= 2 ? 'hot' : '', String(s.false_taps)));
        tbl.append(r);
      }
      kids.push(tbl, el('p', 'tm-foot-note', 'A false tap is a student tapping their own option when a teammate held the answer: they believed it was right. Every tap is saved per student as team evidence.'));
    }
    insight.replaceChildren(...kids);
  }

  return {
    update(v) {
      const k = kv(v);
      view = v;
      if (!k) return;
      eyebrow.textContent = `Race to ${k.track}`;
      setting.replaceChildren(el('span', '', 'Wrong tap'), el('b', '', backLabel(k.mode)));
      const sig = `${k.track}:${k.lanes.map((l) => l.team).join(',')}`;
      if (sig !== built) {
        built = sig;
        build(k);
      }
      paintLanes(k);
      paintStand(k);
      paintFeed(k);
      paintInsight();
    },
    controls(v) {
      const k = kv(v);
      if (!k) return [];
      const next: WrongTap = k.mode === 'back3' ? 'start' : 'back3';
      return [{ label: `Wrong tap: ${backLabel(k.mode)}`, name: 'wrong_tap', data: { mode: next } }];
    },
    onKey(e) {
      if (e.key === 'i' && kv(view)?.insight) {
        insightOpen = !insightOpen;
        paintInsight();
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      root.remove();
    }
  };
}

/* ── Phone ─────────────────────────────────────────────────────────── */

export function teamMatchPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'tmp');
  const top = el('div', 'tmp-top');
  const body = el('div', 'tmp-body');
  const flash = el('div', 'tmp-flash');
  root.append(top, body, flash);
  host.append(root);

  let view: RoomView | null = null;
  let disposed = false;
  let roundKey = '';
  let lastAt = 0;
  let holdUntil = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  let finishedShown = false;
  let optionButtons: HTMLButtonElement[] = [];

  const actions = (nodes: HTMLElement[]) => {
    if (api.setActions) api.setActions(nodes);
    else {
      root.querySelector('.tmp-dock')?.remove();
      if (nodes.length) {
        const dock = el('div', 'tmp-dock');
        dock.append(...nodes);
        root.append(dock);
      }
    }
  };

  function paintTop(v: RoomView, k: TeamMatchView): void {
    const me = k.me;
    if (!me) return;
    const lane = k.lanes.find((l) => l.team === me.team);
    setTeam(root, me.team);
    const who = el('span', 'tmp-me');
    who.append(avatar(v.you?.seat?.initials ?? ''), v.you?.seat?.initials ?? '');
    const tag = el('span', 'tmp-tag');
    tag.append(el('i'), teamName(me.team));
    const score = el('span', 'tmp-score');
    score.append(el('b', '', String(lane?.step ?? 0)), ` / ${k.track}`);
    top.replaceChildren(who, tag, score);
  }

  function mini(k: TeamMatchView): HTMLElement {
    const step = k.lanes.find((l) => l.team === k.me?.team)?.step ?? 0;
    const bar = el('div', 'tmp-mini');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `Team progress ${step} of ${k.track}`);
    bar.style.setProperty('--n', String(k.track));
    for (let i = 0; i < k.track; i++) bar.append(el('i', i < step ? 'on' : ''));
    return bar;
  }

  function strip(k: TeamMatchView): HTMLElement {
    const n = Math.max(1, k.me?.mates.length ?? 1);
    // Big teams (a small class split two ways): number only, and the strip scrolls sideways.
    const s = el('div', `tmp-strip${n > 5 ? ' tight' : ''}`);
    s.style.setProperty('--n', String(n));
    for (const m of k.me?.mates ?? []) {
      const c = el('div', `tmp-mate ${m.me ? 'me' : ''} ${m.connected ? '' : 'off'}`.trim());
      c.dataset.ini = m.initials;
      const count = el('span', '', m.connected ? String(m.options) : 'Away');
      if (m.connected) count.append(el('i', '', ` answer${m.options === 1 ? '' : 's'}`));
      c.title = m.connected ? `${m.initials}: ${m.options} answer${m.options === 1 ? '' : 's'}` : `${m.initials}: away`;
      c.append(avatar(m.initials), el('b', '', m.me ? 'You' : m.initials), count);
      s.append(c);
    }
    return s;
  }

  function paintRound(k: TeamMatchView, enter: boolean): void {
    const me = k.me;
    if (!me) return;
    const lane = k.lanes.find((l) => l.team === me.team);
    if (lane?.place) {
      finished(k, lane.place);
      return;
    }
    finishedShown = false;
    const round = me.round;
    if (!round) {
      body.replaceChildren(mini(k), strip(k), el('p', 'tmp-hint', 'Waiting for the next question…'));
      actions([]);
      return;
    }
    const q = el('div', 'tmp-q');
    q.append(el('span', 'eb', round.eyebrow), el('p', '', round.prompt));
    body.replaceChildren(mini(k), strip(k), q, el('p', 'tmp-hint', `Not on your phone? Say so out loud. Wrong tap: ${backLabel(k.mode).toLowerCase()}.`));
    const label = el('span', 'tmp-dock-l', `Your ${round.options.length} answer${round.options.length === 1 ? '' : 's'}`);
    optionButtons = round.options.map((o) => {
      const b = el('button', 'btn btn--secondary tmp-opt', o.text);
      b.type = 'button';
      b.dataset.o = o.id;
      b.addEventListener('click', () => void tap(round.item, o.id, b));
      return b;
    });
    actions([label, ...optionButtons]);
    if (enter) {
      void animate(q, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
      optionButtons.forEach((b, i) => void animate(b, [{ opacity: 0, transform: 'translateY(24px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 80 + i * 60, fill: 'backwards' }));
    }
  }

  async function tap(item: string, option: string, b: HTMLButtonElement): Promise<void> {
    if (sending || b.disabled) return;
    sending = true;
    optionButtons.forEach((x) => (x.disabled = true));
    b.classList.add('is-sent');
    try {
      await api.move({ item, move: 'tap', response: { option } });
    } catch (e) {
      // The question moved on (a teammate tapped first): the next view brings the new round.
      optionButtons.forEach((x) => (x.disabled = false));
      b.classList.remove('is-sent');
      const msg = e instanceof Error ? e.message : '';
      if (msg && !/moved on/i.test(msg)) api.toast(msg, 'bad');
    } finally {
      sending = false;
    }
  }

  function showLast(k: TeamMatchView): void {
    const last = k.me?.last;
    if (!last) return;
    const good = last.correct;
    flash.className = `tmp-flash ${good ? 'good' : 'bad'}`;
    void animate(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: calm() ? 300 : 900, easing: 'ease-out', calmFade: false });
    for (const b of optionButtons) {
      b.disabled = true;
      const text = b.textContent ?? '';
      if (last.mine && text === last.tapped) b.classList.add(good ? 'is-right' : 'is-wrong');
      else if (text === last.answer) b.classList.add('is-right');
      else b.classList.add('is-dim');
    }
    const mate = body.querySelector<HTMLElement>(`.tmp-mate[data-ini="${last.by}"]`);
    mate?.classList.add(good ? 'good' : 'bad');
    const who = last.mine ? 'You' : last.by;
    if (good) {
      api.toast(`${last.mine ? 'You found it' : `${last.by} found it`} · +1 step · ${last.answer}`, 'good');
      api.sfx.right();
    } else {
      const had = last.held ? 'You' : (last.holder ?? 'Someone');
      api.toast(`${who} tapped ${last.tapped}. ${backLabel(kv(view)?.mode ?? 'back3')}. It was ${last.answer}. ${had} had it.`, 'bad');
      api.sfx.wrong();
      void animate(body, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 360, calmFade: false });
    }
  }

  function finished(k: TeamMatchView, placeNo: number): void {
    if (finishedShown) return;
    finishedShown = true;
    const me = k.me;
    if (!me) return;
    const you = el('div', 'tmp-you');
    you.append(el('span', 'tmp-badge', mark(me.team)), el('span', 'tmp-sub', `${teamName(me.team)} finished`), el('span', 'tmp-big', ordinal(placeNo)), el('span', 'tmp-sub', 'The race goes on for places. Eyes on the board.'));
    const brk = el('div', 'tmp-break');
    const row = (a: string, b: string) => {
      const d = el('div');
      d.append(el('span', '', a), el('span', '', b));
      return d;
    };
    brk.append(row('You held the answer and tapped it', `${me.stats.right} of ${me.stats.held}`), row('False taps (a teammate held it)', String(me.stats.false_taps)));
    for (const w of me.stats.wrong) brk.append(row(`You tapped ${w.tapped}`, `It was ${w.answer}`));
    body.replaceChildren(el('div', 'tmp-wait'), brk);
    (body.firstElementChild as HTMLElement).append(you);
    actions([]);
    void animate(you, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 500, easing: springEasing() });
    api.toast(`${teamName(me.team)} crossed the line · ${ordinal(placeNo)}`, 'good');
  }

  function render(): void {
    if (disposed || !view) return;
    const k = kv(view);
    if (!k?.me) return;
    paintTop(view, k);
    const key = `${k.me.round?.item ?? ''}:${k.me.round?.n ?? ''}:${k.me.round?.options.map((o) => o.id).join(',') ?? ''}`;
    const mates = JSON.stringify(k.me.mates);
    if (key !== roundKey || body.dataset.mates !== mates || !body.childElementCount) {
      const fresh = (k.me.round?.n ?? '') !== roundKey.split(':')[1];
      roundKey = key;
      body.dataset.mates = mates;
      paintRound(k, fresh);
    }
  }

  return {
    update(v) {
      view = v;
      const k = kv(v);
      if (!k?.me) return;
      const last = k.me.last;
      if (last && last.at !== lastAt) {
        const first = lastAt === 0 && !optionButtons.length;
        lastAt = last.at;
        if (!first) {
          paintTop(v, k);
          showLast(k);
          holdUntil = Date.now() + (calm() ? 400 : last.correct ? 1100 : 1800);
        }
      }
      const wait = holdUntil - Date.now();
      if (wait > 0) {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(render, wait);
        return;
      }
      render();
    },
    dispose() {
      disposed = true;
      if (holdTimer) clearTimeout(holdTimer);
      root.remove();
    }
  };
}

registerLiveKind('team_match', { board: teamMatchBoard, phone: teamMatchPhone });

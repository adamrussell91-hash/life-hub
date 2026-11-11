import { el } from '@/quiz/dom';
import type { PublicQuestion, QuizResponse } from '@/quiz/core';
import { mountQuestionPlayer } from '@/quiz/player';
import type { PublicItem } from '../../core/schema';
import type { RoomView, TeamView } from '../../core/room-protocol';
import { animate, calm, countUp, flip, springEasing } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import { avatar, createRing, type Ring } from '../../live/board-parts';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import type { JeopardyView, TeamResult } from './rules';
import { teamColour, teamName } from './shared';
import './jeopardy.css';

/**
 * Jeopardy on the board and the phone (spec §6.3; approved mockup
 * docs/mockups/games/jeopardy.html). The board: categories × values with
 * tiles cascading in, the teams down the side (captain ringed, the picking
 * team glowing), the clue zooming out of its tile, a Double splash, the
 * reveal (options light up with how many chose each, then each team's card
 * counts up) and the tile flipping back dimmed to the team that won most of
 * it. The phone: the captain's tile picker and wager slider, everyone's
 * answer and Lock in, then Right / Missed with the team's breakdown.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const fmt = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-AU')}`;
const kv = (v: RoomView | null): JeopardyView | null => (v?.kind_view as JeopardyView | undefined) ?? null;
const teamsOf = (v: RoomView): TeamView[] => [...(v.teams ?? [])].sort((a, b) => a.team - b.team);
const scoreOf = (v: RoomView, team: number) => v.teams?.find((t) => t.team === team)?.score ?? 0;
const setTeam = (node: HTMLElement, team: number) => node.style.setProperty('--tc', teamColour(team));

type Opt = { id: string; text: string };
function questionOf(item: PublicItem | undefined): PublicQuestion | null {
  return item?.shape === 'question' ? (item.question as unknown as PublicQuestion) : null;
}
function optionsOf(item: PublicItem | undefined): Opt[] | null {
  const q = questionOf(item) as (PublicQuestion & { options?: Opt[] }) | null;
  return q && Array.isArray(q.options) && ['multiple_choice', 'odd_one_out', 'quote_technique', 'multi_select'].includes(q.kind) ? q.options : null;
}
function promptOf(item: PublicItem | undefined): string {
  if (!item) return '';
  if (item.shape === 'term') return item.clues[0]?.text ?? '';
  if (item.shape === 'quote') return item.text;
  return String((item.question as { prompt?: unknown }).prompt ?? '');
}
const catTitle = (k: JeopardyView, id: string) => k.categories.find((c) => c.id === id)?.title ?? '';

/* ── Board ─────────────────────────────────────────────────────────── */

export function jeopardyBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'jp');
  const main = el('div', 'jp-main');
  const grid = el('div', 'jp-grid');
  const turn = el('div', 'jp-turn');
  main.append(grid, turn);
  const side = el('aside', 'jp-side');
  const teamsBox = el('div', 'jp-teams');
  const rule = el('p', 'jp-rule');
  const insightBtn = el('button', 'jp-insight-btn', 'Category × value');
  insightBtn.type = 'button';
  insightBtn.hidden = true;
  side.append(teamsBox, rule, insightBtn);
  const overlay = el('div', 'jp-clue');
  overlay.hidden = true;
  const insight = el('div', 'jp-ins');
  insight.hidden = true;
  root.append(main, side, overlay, insight);
  host.append(root);

  let view: RoomView | null = null;
  let gridSig = '';
  let clueKey = '';
  let cluePhase = '';
  let ring: Ring | null = null;
  let disposed = false;
  let insightOpen = false;
  const shownScores = new Map<number, number>();
  const teamNodes = new Map<number, HTMLElement>();

  grid.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('.jp-tile');
    if (!t || t.disabled || kv(view)?.phase !== 'pick') return;
    api.sfx.click();
    void api.control('pick', { tile: t.dataset.tile }).catch((x: unknown) => api.toast(x instanceof Error ? x.message : 'Try that again.', 'bad'));
  });
  insightBtn.addEventListener('click', () => {
    insightOpen = !insightOpen;
    paintInsight();
  });

  function buildGrid(k: JeopardyView, intro: boolean): void {
    grid.replaceChildren();
    const rows = Math.max(0, ...k.categories.map((c) => c.tiles.length));
    grid.style.setProperty('--cats', String(k.categories.length || 1));
    grid.style.setProperty('--rows', String(rows || 1));
    k.categories.forEach((c) => grid.append(el('div', 'jp-cat', c.title)));
    for (let r = 0; r < rows; r++) {
      k.categories.forEach((c, ci) => {
        const t = c.tiles[r];
        const b = el('button', 'jp-tile');
        b.type = 'button';
        if (t) {
          b.dataset.tile = t.id;
          b.dataset.c = String(ci);
          b.dataset.r = String(r);
        } else b.disabled = true;
        grid.append(b);
      });
    }
    paintTiles(k);
    if (intro) {
      grid.querySelectorAll<HTMLElement>('.jp-cat').forEach((n, c) => void animate(n, [{ opacity: 0, transform: 'translateY(-30px) rotateX(-80deg)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: c * 90, fill: 'backwards' }));
      grid.querySelectorAll<HTMLElement>('.jp-tile').forEach((n) => {
        const d = Number(n.dataset.c ?? 0) + Number(n.dataset.r ?? 0);
        void animate(n, [{ opacity: 0, transform: 'rotateY(-95deg) scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 450 + d * 75, fill: 'backwards' });
      });
      if (!calm()) {
        api.sfx.whoosh();
        setTimeout(() => !disposed && api.sfx.reveal(), 1100);
      }
    }
  }

  function paintTiles(k: JeopardyView): void {
    const tiles = new Map(k.categories.flatMap((c) => c.tiles.map((t) => [t.id, { t, c }] as const)));
    grid.querySelectorAll<HTMLButtonElement>('.jp-tile[data-tile]').forEach((b) => {
      const hit = tiles.get(b.dataset.tile as string);
      if (!hit) return;
      const { t, c } = hit;
      const used = !!t.used;
      const was = b.classList.contains('used');
      b.classList.toggle('used', used);
      b.classList.toggle('none', used && t.used?.team === null);
      b.classList.toggle('aim', !used && k.aim === t.id);
      b.disabled = used || k.phase !== 'pick';
      if (used && t.used && t.used.team !== null) {
        setTeam(b, t.used.team);
        b.replaceChildren(document.createTextNode(teamName(t.used.team)), el('small', '', `+${fmt(t.used.gain)}`));
        b.setAttribute('aria-label', `${c.title} ${t.value}, won by ${teamName(t.used.team)}`);
      } else if (used) {
        b.replaceChildren(el('small', '', 'No points'));
        b.setAttribute('aria-label', `${c.title} ${t.value}, played`);
      } else {
        b.textContent = String(t.value);
        b.setAttribute('aria-label', `${c.title} for ${t.value}`);
      }
      if (used && !was && !calm()) void animate(b, [{ transform: 'rotateY(90deg)' }, { transform: 'none' }], { duration: 500 });
    });
  }

  function paintTeams(v: RoomView, k: JeopardyView): void {
    const teams = teamsOf(v);
    const sorted = [...teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
    const seatOf = (ini: string) => v.seats.find((s) => s.initials === ini);
    const mutate = () => {
      for (const t of sorted) {
        let n = teamNodes.get(t.team);
        if (!n) {
          n = el('div', 'jp-team');
          setTeam(n, t.team);
          n.append(el('div', 'nm'), el('div', 'sc'), el('div', 'mem'), el('em', 'tagp', 'Picking'));
          teamNodes.set(t.team, n);
        }
        teamsBox.append(n);
      }
    };
    if (teamNodes.size && !calm()) void flip(teamsBox, mutate);
    else mutate();
    sorted.forEach((t) => {
      const n = teamNodes.get(t.team) as HTMLElement;
      const nm = n.querySelector('.nm') as HTMLElement;
      nm.replaceChildren(el('span', 'rk', String(t.rank)), document.createTextNode(teamName(t.team)));
      const sc = n.querySelector('.sc') as HTMLElement;
      const before = shownScores.get(t.team);
      if (before === undefined) sc.textContent = fmt(t.score);
      else if (before !== t.score) {
        countUp(sc, before, t.score, 1000);
        if (t.score > before) api.sfx.coin();
      }
      shownScores.set(t.team, t.score);
      const cap = k.captains[t.team];
      const mem = n.querySelector('.mem') as HTMLElement;
      mem.replaceChildren(
        ...t.members.map((ini) => {
          const a = avatar(ini, `${ini === cap ? 'cap' : ''} ${seatOf(ini)?.connected === false ? 'off' : ''}`.trim());
          a.title = `${ini}${ini === cap ? ' (captain)' : ''}${seatOf(ini)?.connected === false ? ' (offline)' : ''}`;
          return a;
        })
      );
      n.classList.toggle('turn', k.phase === 'pick' && k.turn?.team === t.team);
    });
  }

  function paintTurn(k: JeopardyView): void {
    if (!k.turn || k.phase !== 'pick') {
      turn.hidden = true;
      return;
    }
    turn.hidden = false;
    setTeam(turn, k.turn.team);
    turn.replaceChildren(el('i'), el('span'));
    const line = turn.querySelector('span') as HTMLElement;
    line.append(el('b', '', teamName(k.turn.team)), ' to pick');
    if (k.turn.captain) line.append(' · captain ', el('b', '', k.turn.captain), ' chooses on their phone');
    else line.append(' · tap a tile for them');
  }

  /* ── Clue overlay ─────────────────────────────────────────────── */

  function tileRect(tile: string): DOMRect | null {
    const b = grid.querySelector<HTMLElement>(`[data-tile="${CSS.escape ? CSS.escape(tile) : tile}"]`);
    return b ? b.getBoundingClientRect() : null;
  }

  async function openOverlay(tile: string | null): Promise<void> {
    overlay.hidden = false;
    overlay.className = 'jp-clue';
    const r = tile ? tileRect(tile) : null;
    const host = root.getBoundingClientRect();
    api.sfx.whoosh();
    if (r && host.width && !calm()) {
      const sx = r.width / host.width;
      const sy = r.height / host.height;
      await animate(overlay, [{ transform: `translate(${r.left - host.left}px, ${r.top - host.top}px) scale(${sx}, ${sy})`, borderRadius: '18px' }, { transform: 'none', borderRadius: '0px' }], { duration: 650, easing: 'cubic-bezier(.65,0,.25,1)' });
    } else await animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  }

  async function closeOverlay(tile: string | null): Promise<void> {
    ring?.stop();
    ring = null;
    const r = tile ? tileRect(tile) : null;
    const host = root.getBoundingClientRect();
    if (r && host.width && !calm()) {
      overlay.replaceChildren();
      await animate(overlay, [{ transform: 'none', opacity: 1 }, { transform: `translate(${r.left - host.left}px, ${r.top - host.top}px) scale(${r.width / host.width}, ${r.height / host.height})`, opacity: 0.2 }], { duration: 560, easing: 'cubic-bezier(.65,0,.25,1)' });
    }
    overlay.hidden = true;
    overlay.replaceChildren();
  }

  function fadeIn(nodes: Array<Element | null>, step = 90): void {
    nodes.forEach((n, i) => void animate(n, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: i * step, fill: 'backwards' }));
  }

  function splash(word: string, line: Node[], num: string): void {
    const box = el('div', 'jp-dbl');
    const w = el('div', 'jp-dbl-word');
    [...word].forEach((ch) => w.append(el('span', '', ch)));
    const p = el('p');
    p.append(...line);
    box.append(w, p, el('div', 'num', num));
    const shine = el('div', 'jp-shine');
    overlay.replaceChildren(box, shine);
    w.querySelectorAll('span').forEach((s, i) => void animate(s, [{ opacity: 0, transform: 'translateY(80px) scale(.4) rotate(-12deg)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: i * 80, easing: springEasing(), fill: 'backwards' }));
    if (!calm()) void animate(shine, [{ transform: 'translateX(0)' }, { transform: 'translateX(300vw)' }], { duration: 1400, delay: 500, easing: 'cubic-bezier(.5,0,.3,1)', calmFade: false });
    api.sfx.fanfare();
  }

  function progressDots(v: RoomView, answered: Record<number, string[] | number>): HTMLElement {
    const prog = el('div', 'jp-c-prog');
    for (const t of teamsOf(v)) {
      const g = el('div', 'grp');
      setTeam(g, t.team);
      const name = el('span');
      name.append(el('i'), teamName(t.team));
      const dots = el('div', 'dots');
      const did = answered[t.team];
      for (const ini of t.members) {
        const d = el('i');
        d.dataset.ini = ini;
        if (Array.isArray(did) && did.includes(ini)) d.classList.add('on');
        if (v.seats.find((s) => s.initials === ini)?.connected === false) d.classList.add('off');
        dots.append(d);
      }
      g.append(name, dots);
      prog.append(g);
    }
    return prog;
  }

  function buildQuestion(v: RoomView, k: JeopardyView, item: PublicItem | undefined, head: HTMLElement, endsAt: number | undefined, answered: Record<number, string[] | number>): void {
    const opts = optionsOf(item);
    const q = el('p', 'jp-c-q', promptOf(item));
    const ringBox = el('div', 'jp-c-ring');
    ring = createRing('gl-ring--q');
    ringBox.append(ring.root);
    if (endsAt) ring.run(endsAt, Math.max(1000, (Number(endsAt) - api.serverNow()) || 1), api.serverNow);
    let body: HTMLElement;
    if (opts) {
      body = el('div', 'jp-c-opts');
      opts.forEach((o, i) => {
        const card = el('div', 'jp-c-opt');
        card.dataset.opt = o.id;
        card.append(el('span', `key k${(i % 4) + 1}`, LETTERS[i] ?? ''), el('span', 'txt', o.text), el('span', 'n', ''));
        body.append(card);
      });
    } else {
      body = el('div', 'jp-c-term');
      const typed = Object.values(answered).reduce<number>((n, x) => n + (Array.isArray(x) ? x.length : x), 0);
      body.append(el('span', 'big', item?.shape === 'term' ? 'Type your answer on your phone' : 'Answer on your phone'), el('span', 'sub', `${typed} answered`));
    }
    overlay.replaceChildren(head, ringBox, q, body, progressDots(v, answered));
    fadeIn([head, q, ...Array.from(body.children), overlay.querySelector('.jp-c-prog')]);
    api.sfx.reveal();
  }

  function clueHead(cat: string, value: string, team: number | null, tag: string): HTMLElement {
    const head = el('div', 'jp-c-head');
    head.append(`${cat} · ${value}`);
    if (team !== null) {
      const pick = el('span', 'jp-c-pick');
      setTeam(pick, team);
      pick.append(el('i'), `${teamName(team)} picked · ${tag}`);
      head.append(pick);
    }
    return head;
  }

  function paintAnswered(answered: Record<number, string[] | number>): void {
    for (const [, who] of Object.entries(answered)) {
      if (!Array.isArray(who)) continue;
      for (const ini of who) {
        const d = overlay.querySelector<HTMLElement>(`.jp-c-prog i[data-ini="${ini}"]`);
        if (d && !d.classList.contains('on')) {
          d.classList.add('on');
          void animate(d, [{ transform: 'scale(.4)' }, { transform: 'scale(1.15)' }], { duration: 300, calmFade: false });
        }
      }
    }
    const sub = overlay.querySelector('.jp-c-term .sub');
    if (sub && !overlay.classList.contains('revealed')) sub.textContent = `${Object.values(answered).reduce<number>((n, x) => n + (Array.isArray(x) ? x.length : x), 0)} answered`;
  }

  function resultCards(results: TeamResult[], final: boolean, double: boolean, bonus: number): HTMLElement {
    const box = el('div', 'jp-c-res');
    box.style.setProperty('--n', String(Math.max(1, results.length)));
    results.forEach((x, i) => {
      const c = el('div', `jp-rc ${x.gain > 0 ? 'up' : x.gain < 0 ? 'down' : ''}`);
      setTeam(c, x.team);
      const t = el('span', 't', teamName(x.team));
      if (x.pick && !final) t.append(el('em', '', double ? 'wager' : `×${bonus}`));
      if (final) t.append(el('em', '', `wager ${fmt(x.wager ?? 0)}`));
      const g = el('span', 'g');
      g.append(x.gain >= 0 ? '+' : '−');
      const gv = el('span', 'gv', '0');
      g.append(gv);
      c.append(t, el('span', 'f', x.n ? `${x.r} of ${x.n} right` : 'Nobody answered'), g);
      box.append(c);
      void animate(c, [{ opacity: 0, transform: 'translateY(40px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: i * 160, easing: springEasing(), fill: 'backwards' });
      setTimeout(
        () => {
          if (disposed) return;
          countUp(gv, 0, Math.abs(x.gain), 800);
          if (x.gain > 0) api.sfx.coin();
        },
        calm() ? 0 : 200 + i * 160
      );
    });
    return box;
  }

  function revealClue(k: JeopardyView): void {
    const cur = k.cur;
    if (!cur) return;
    ring?.stop();
    overlay.classList.add('closed', 'revealed');
    api.sfx.reveal();
    const opts = overlay.querySelectorAll<HTMLElement>('.jp-c-opt');
    if (opts.length) {
      const rightTexts = new Set((cur.answer ?? '').split(' · '));
      opts.forEach((n) => {
        const text = n.querySelector('.txt')?.textContent ?? '';
        n.classList.add(rightTexts.has(text) ? 'is-right' : 'is-wrong');
        const c = cur.counts?.[n.dataset.opt ?? ''] ?? 0;
        (n.querySelector('.n') as HTMLElement).textContent = `${c} chose`;
      });
    } else {
      const box = overlay.querySelector<HTMLElement>('.jp-c-term');
      if (box) {
        box.classList.add('done');
        box.replaceChildren(el('span', 'sub', 'Accepted'), el('span', 'big', cur.answer ?? ''), el('span', 'sub', `${cur.right ?? 0} of ${cur.total ?? 0} got it${cur.miss ? ` · most common miss: “${cur.miss}”` : ''}`));
        void animate(box, [{ transform: 'scale(.9)' }, { transform: 'scale(1.04)', offset: 0.6 }, { transform: 'none' }], { duration: 600 });
      }
    }
    overlay.querySelector('.jp-c-prog')?.remove();
    if (cur.results) overlay.append(resultCards(cur.results, false, cur.double, k.bonus));
  }

  function paintClue(v: RoomView, k: JeopardyView): void {
    const cur = k.cur;
    const final = k.final;
    const key = cur ? `tile:${cur.tile}` : final ? 'final' : '';
    const phase = k.phase;
    if (key !== clueKey) {
      const was = clueKey;
      clueKey = key;
      cluePhase = '';
      if (!key) {
        void closeOverlay(was.startsWith('tile:') ? was.slice(5) : null);
        return;
      }
      void openOverlay(cur ? cur.tile : null).then(() => !disposed && view && paintClue(view, kv(view) as JeopardyView));
      overlay.replaceChildren();
      return;
    }
    if (!key) return;
    if (cur) {
      if (phase === 'wager') {
        if (cluePhase !== 'wager') {
          const line = [el('b', '', teamName(cur.team)), document.createTextNode(` found the Double. Captain ${k.captains[cur.team] ?? ''} wagers up to ${fmt(cur.max_wager ?? 0)}.`)];
          splash('DOUBLE', line, '…');
        }
      } else if (phase === 'clue' || phase === 'closed' || phase === 'revealed') {
        if (cluePhase === 'wager' || cluePhase === '') {
          const enter = () => {
            if (disposed || !view) return;
            const kk = kv(view);
            if (!kk?.cur) return;
            const tag = kk.cur.double ? `wagered ${fmt(kk.cur.wager ?? 0)}` : `×${kk.bonus}`;
            buildQuestion(view, kk, kk.cur.item, clueHead(catTitle(kk, kk.cur.cat), `${kk.cur.value}${kk.cur.double ? ' · Double' : ''}`, kk.cur.team, tag), kk.cur.ends_at, kk.cur.answered);
            if (kk.phase !== 'clue') overlay.classList.add('closed');
            if (kk.phase === 'revealed') revealClue(kk);
            cluePhase = kk.phase;
          };
          if (cluePhase === 'wager' && cur.wager !== undefined) {
            const num = overlay.querySelector<HTMLElement>('.jp-dbl .num');
            if (num) {
              countUp(num, 0, cur.wager, 900);
              api.sfx.coin();
            }
            cluePhase = 'wagered';
            setTimeout(enter, calm() ? 0 : 1500);
            return;
          }
          enter();
          return;
        }
        if (cluePhase === 'wagered') return;
        paintAnswered(cur.answered);
        if (phase !== 'clue' && !overlay.classList.contains('closed')) {
          overlay.classList.add('closed');
          ring?.stop();
          api.sfx.lock();
          const big = overlay.querySelector('.jp-c-term .big');
          if (big) big.textContent = 'Answers closed';
        }
        if (phase === 'revealed' && cluePhase !== 'revealed') revealClue(k);
      }
      if (cluePhase !== 'wagered') cluePhase = phase;
      return;
    }
    if (final) paintFinal(v, k);
  }

  function paintFinal(v: RoomView, k: JeopardyView): void {
    const f = k.final;
    if (!f) return;
    const phase = k.phase;
    if (phase === 'final_wager') {
      if (cluePhase !== 'final_wager') {
        splash('FINAL', [document.createTextNode('Every team wagers. Captains, set yours on your phone.')], '');
        overlay.querySelector('.num')?.replaceWith(el('div', 'jp-fw'));
      }
      const box = overlay.querySelector<HTMLElement>('.jp-fw');
      if (box) {
        box.replaceChildren(
          ...teamsOf(v).map((t) => {
            const chip = el('span', `jp-fw-chip ${f.wagered.includes(t.team) ? 'in' : ''}`);
            setTeam(chip, t.team);
            chip.append(el('i'), teamName(t.team), el('b', '', f.wagered.includes(t.team) ? 'Wagered' : 'Thinking…'));
            return chip;
          })
        );
      }
      cluePhase = phase;
      return;
    }
    if (cluePhase === 'final_wager' || cluePhase === '') {
      buildQuestion(v, k, f.item, clueHead('Final', 'everyone answers', null, ''), f.ends_at, f.answered);
      cluePhase = 'final_clue';
    }
    paintAnswered(f.answered);
    if (phase !== 'final_clue' && !overlay.classList.contains('closed')) {
      overlay.classList.add('closed');
      ring?.stop();
      api.sfx.lock();
    }
    if ((phase === 'final_reveal' || phase === 'done') && f.answer && !overlay.classList.contains('revealed')) {
      revealClue({ ...k, cur: { tile: 'final', cat: '', value: 0, double: false, team: -1, item: f.item, answered: f.answered, live: {}, answer: f.answer } });
      overlay.querySelector('.jp-c-prog')?.remove();
      overlay.append(el('div', 'jp-c-res'));
    }
    const res = overlay.querySelector<HTMLElement>('.jp-c-res');
    const shown = res?.children.length ?? 0;
    if (res && f.results && f.results.length > shown) {
      const fresh = resultCards(f.results.slice(shown), true, false, k.bonus);
      res.style.setProperty('--n', String(Math.max(1, teamsOf(v).length)));
      res.append(...Array.from(fresh.children));
    }
  }

  /* ── Insight (teacher) ───────────────────────────────────────── */

  function paintInsight(): void {
    const k = kv(view);
    const cells = k?.insight?.cells ?? [];
    insightBtn.hidden = !k?.insight || (k.phase !== 'pick' && k.phase !== 'done');
    insightBtn.setAttribute('aria-pressed', String(insightOpen));
    insight.hidden = !insightOpen || !k;
    if (!insightOpen || !k) return;
    const values = [...new Set(k.categories.flatMap((c) => c.tiles.map((t) => t.value)))].sort((a, b) => a - b);
    const heat = el('div', 'jp-heat');
    heat.style.setProperty('--cats', String(k.categories.length));
    heat.append(el('span'), ...k.categories.map((c) => el('span', 'h', c.title)));
    for (const val of values) {
      heat.append(el('span', 'v', String(val)));
      for (const c of k.categories) {
        const tile = c.tiles.find((t) => t.value === val);
        const cell = cells.find((x) => x.tile === tile?.id);
        const p = cell && cell.answered ? cell.right / cell.answered : null;
        const n = el('span', `c ${p === null ? 'none' : ''}`, p === null ? '–' : `${Math.round(p * 100)}%`);
        if (p !== null) n.style.setProperty('--p', String(p));
        heat.append(n);
      }
    }
    const lede = el('p', 'lede', api.owner === 'teacher' ? 'Where the class tops out. Played tiles only.' : 'Where the class tops out. Played tiles only, no names.');
    const kids: HTMLElement[] = [el('span', 'gl-eyebrow', api.owner === 'teacher' ? 'Teacher view' : 'Class view'), el('h2', '', 'Accuracy by category × value'), lede, heat];
    const ceilings = k.insight?.ceilings;
    if (ceilings?.length) {
      const box = el('div', 'jp-ceil');
      box.append(el('h3', '', 'Each student’s ceiling'), el('p', 'key', 'Highest value right in each category'));
      const head = el('div', 'row hd');
      head.append(el('span'), ...k.categories.map((c) => el('i', '', c.title.slice(0, 1).toUpperCase())));
      box.append(head);
      for (const s of ceilings) {
        const row = el('div', 'row');
        row.append(avatar(s.initials), ...k.categories.map((c) => (s.by_cat[c.id] ? el('i', '', String(s.by_cat[c.id])) : el('i', 'no', '–'))));
        box.append(row);
      }
      kids.push(box);
    }
    insight.replaceChildren(...kids);
  }

  return {
    update(v) {
      const k = kv(v);
      view = v;
      if (!k) return;
      root.dataset.phase = k.phase;
      const sig = k.categories.map((c) => `${c.id}:${c.tiles.length}`).join('|');
      if (sig !== gridSig) {
        buildGrid(k, !gridSig);
        gridSig = sig;
      } else paintTiles(k);
      rule.replaceChildren(el('b', '', 'Scoring'), el('br'), `Tile value × share of the team who got it right. The picking team gets ×${k.bonus}.`);
      paintTeams(v, k);
      paintTurn(k);
      paintClue(v, k);
      paintInsight();
      if (k.phase === 'done' && !root.dataset.cheered) {
        root.dataset.cheered = '1';
        api.sfx.fanfare();
        void confetti(root);
      }
    },
    controls(v) {
      const k = kv(v);
      if (!k) return [];
      switch (k.phase) {
        case 'pick':
          return k.has_final ? [{ label: 'Go to the Final', name: 'final' }] : [];
        case 'wager':
          return [{ label: 'Skip the wager', name: 'close' }];
        case 'clue':
          return [{ label: 'Close answers', name: 'close', primary: true }];
        case 'closed':
          return [{ label: 'Reveal', name: 'reveal', primary: true, key: 'r' }];
        case 'revealed':
          return [{ label: 'Back to the board', name: 'next', primary: true, key: 'n' }];
        case 'final_wager':
          return [{ label: 'Close wagers', name: 'close' }];
        case 'final_clue':
          return [{ label: 'Close answers', name: 'close', primary: true }];
        case 'final_closed':
        case 'final_reveal':
          return [{ label: 'Reveal next team', name: 'reveal', primary: true, key: 'r' }];
        case 'done':
          return [{ label: 'Final scores', name: 'next', primary: true }];
      }
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
      ring?.stop();
      root.remove();
    }
  };
}

/* ── Phone ─────────────────────────────────────────────────────────── */

export function jeopardyPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'jpp');
  const top = el('div', 'jpp-top');
  const bar = el('div', 'jpp-timer');
  bar.append(el('i'));
  const body = el('div', 'jpp-body');
  root.append(top, bar, body);
  host.append(root);

  let view: RoomView | null = null;
  let screen = '';
  let aim: string | null = null;
  let wager = 0;
  let response: QuizResponse | { text: string } | null = null;
  let sent = false;
  let raf = 0;
  let disposed = false;
  let toasted = '';

  const actions = (buttons: HTMLElement[]) => {
    if (api.setActions) api.setActions(buttons);
    else {
      root.querySelector('.jpp-dock')?.remove();
      if (buttons.length) {
        const dock = el('div', 'jpp-dock');
        dock.append(...buttons);
        root.append(dock);
      }
    }
  };
  const cta = (text: string, onClick: () => void, disabled = false) => {
    const b = el('button', 'btn btn--primary jpp-cta', text);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };
  const wait = (bob: string, sub: string, mid: string, more?: string): HTMLElement => {
    const w = el('div', 'jpp-wait');
    const inner = el('div');
    inner.append(el('div', 'jpp-bob', bob), el('p', 'jpp-sub', sub), el('div', 'mid', mid));
    if (more) inner.append(el('p', 'jpp-sub jpp-more', more));
    w.append(inner);
    return w;
  };
  const standings = (v: RoomView, mine: number | undefined): HTMLElement => {
    const box = el('div', 'jpp-mini');
    for (const t of [...(v.teams ?? [])].sort((a, b) => a.rank - b.rank)) {
      const row = el('div', t.team === mine ? 'me' : '');
      setTeam(row, t.team);
      row.append(el('i'), teamName(t.team), el('b', '', fmt(t.score)));
      box.append(row);
    }
    return box;
  };

  function paintTop(v: RoomView, k: JeopardyView): void {
    const team = k.me?.team;
    const me = el('span', 'jpp-me');
    me.append(avatar(v.you?.seat?.initials ?? ''), v.you?.seat?.initials ?? '');
    const tag = el('span', 'jpp-tp');
    if (team !== undefined) {
      setTeam(tag, team);
      tag.append(el('i'), `${teamName(team)} · ${fmt(scoreOf(v, team))}`);
    }
    top.replaceChildren(me, tag);
  }

  function runBar(endsAt: number | undefined): void {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    const fill = bar.querySelector('i') as HTMLElement;
    bar.hidden = !endsAt;
    if (!endsAt) return;
    const total = Math.max(1000, endsAt - api.serverNow());
    const frame = () => {
      if (disposed) return;
      const left = Math.max(0, endsAt - api.serverNow());
      fill.style.transform = `scaleX(${(left / total).toFixed(3)})`;
      if (left > 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    };
    frame();
  }

  function picker(k: JeopardyView): void {
    const team = k.me?.team ?? 0;
    const cap = el('div', 'jpp-cap', `★ You’re the ${teamName(team)}’ captain. Pick a tile for the team.`);
    const cats = k.categories.map((c) => {
      const box = el('div', 'jpp-pcat');
      const vals = el('div', 'jpp-pvals');
      vals.style.setProperty('--n', String(c.tiles.length));
      for (const t of c.tiles) {
        const b = el('button', t.id === aim ? 'sel' : '');
        b.type = 'button';
        if (t.used) {
          b.disabled = true;
          b.setAttribute('aria-label', `${c.title} ${t.value}, played`);
          const dot = el('i');
          if (t.used.team !== null) setTeam(dot, t.used.team);
          b.append(dot);
        } else {
          b.textContent = String(t.value);
          b.setAttribute('aria-label', `${c.title} for ${t.value}`);
          b.addEventListener('click', () => {
            aim = t.id;
            api.sfx.click();
            void api.control('aim', { tile: t.id }).catch(() => undefined);
            picker(kv(view) as JeopardyView);
          });
        }
        vals.append(b);
      }
      box.append(el('b', '', c.title), vals);
      return box;
    });
    body.replaceChildren(cap, ...cats);
    const t = k.categories.flatMap((c) => c.tiles.map((x) => ({ ...x, cat: c.title }))).find((x) => x.id === aim && !x.used);
    actions([
      cta(t ? `Pick ${t.cat} · ${t.value}` : 'Choose a tile', () => {
        if (!t) return;
        void api.control('pick', { tile: t.id }).catch((e: unknown) => api.toast(e instanceof Error ? e.message : 'Try again.', 'bad'));
      }, !t)
    ]);
  }

  function wagerScreen(title: string, line: string, max: number, min: number, send: (n: number) => Promise<void>): void {
    if (!wager || wager > max) wager = Math.max(min, Math.round(max / 2 / 10) * 10);
    const amt = el('span', 'amt', fmt(wager));
    const range = el('input', 'jpp-range');
    range.type = 'range';
    range.min = String(min);
    range.max = String(Math.max(min, max));
    range.step = '10';
    range.value = String(wager);
    range.setAttribute('aria-label', 'Wager');
    const go = cta(`Wager ${fmt(wager)}`, () => {
      go.disabled = true;
      void send(wager).catch((e: unknown) => {
        go.disabled = false;
        api.toast(e instanceof Error ? e.message : 'Try again.', 'bad');
      });
    });
    const paint = () => {
      const p = max > min ? ((wager - min) / (max - min)) * 100 : 100;
      range.style.setProperty('--p', `${p}%`);
      amt.textContent = fmt(wager);
      go.textContent = `Wager ${fmt(wager)}`;
    };
    range.addEventListener('input', () => {
      wager = Number(range.value);
      paint();
    });
    const chips = el('div', 'jpp-chips');
    for (const [label, val] of [['Min', min], ['½', Math.round(max / 2 / 10) * 10], ['All in', max]] as const) {
      const c = el('button', 'jpp-chip', label);
      c.type = 'button';
      c.addEventListener('click', () => {
        wager = Math.max(min, val);
        range.value = String(wager);
        paint();
      });
      chips.append(c);
    }
    const bet = el('div', 'jpp-bet');
    bet.append(el('span', 'jpp-sub', 'How sure is your team?'), amt, range, chips);
    body.replaceChildren(el('div', 'jpp-cap', title), bet, el('p', 'jpp-sub jpp-small', line));
    paint();
    actions([go]);
  }

  function answerScreen(item: PublicItem | undefined, meta: string, double: boolean): void {
    const head = el('span', 'jpp-qmeta', meta);
    if (double) head.append(el('span', 'dbl', 'Double'));
    const kids: HTMLElement[] = [head];
    const lock = cta('Lock in', () => void lockIn(item), true);
    if (item?.shape === 'question') {
      const q = questionOf(item) as PublicQuestion;
      kids.push(
        mountQuestionPlayer({
          question: q,
          response: (response as QuizResponse) ?? null,
          onChange: (r) => {
            response = r;
            lock.disabled = !filled(r);
          }
        })
      );
      lock.disabled = !filled(response);
    } else {
      kids.push(el('p', 'jpp-h', promptOf(item)));
      const input = el('input', 'jpp-input');
      input.type = 'text';
      input.placeholder = item?.shape === 'term' ? 'Type the term' : 'Type your answer';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.enterKeyHint = 'done';
      input.setAttribute('aria-label', 'Your answer');
      input.value = (response as { text?: string } | null)?.text ?? '';
      input.addEventListener('input', () => {
        response = { text: input.value };
        lock.disabled = !input.value.trim();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) void lockIn(item);
      });
      kids.push(input);
      lock.disabled = !input.value.trim();
    }
    body.replaceChildren(...kids);
    actions([lock]);
  }

  function filled(r: unknown): boolean {
    if (!r || typeof r !== 'object') return false;
    const o = r as Record<string, unknown>;
    if (Array.isArray(o.selected)) return o.selected.length > 0;
    if (typeof o.value === 'boolean') return true;
    if (typeof o.text === 'string') return !!o.text.trim();
    return Object.values(o).some((x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : !!x));
  }

  async function lockIn(item: PublicItem | undefined): Promise<void> {
    if (!item || sent || !response) return;
    sent = true;
    api.sfx.lock();
    try {
      await api.move({ item: item.id, move: 'answer', response });
    } catch (e) {
      sent = false;
      api.toast(e instanceof Error ? e.message : 'That didn’t send. Try again.', 'bad');
      return;
    }
    if (view) paint(view, true);
  }

  function lockedScreen(v: RoomView, k: JeopardyView, open: boolean, answered: Record<number, string[] | number> | undefined): void {
    const team = k.me?.team ?? 0;
    const mine = k.me?.answered ? (k.me.text !== undefined ? `“${k.me.text || '…'}”` : 'Your answer is in') : 'No answer';
    const did = answered?.[team];
    const n = Array.isArray(did) ? did.length : (did ?? 0);
    const total = v.teams?.find((t) => t.team === team)?.members.length ?? 0;
    body.replaceChildren(wait('✓', open ? 'Locked in' : 'Answers closed', mine, `${n} of ${total} ${teamName(team)} answered · eyes on the board`));
    actions([]);
  }

  function resultScreen(v: RoomView, k: JeopardyView, res: TeamResult | undefined, answer: string | undefined, final: boolean, double: boolean): void {
    const ok = k.me?.correct === true;
    const team = k.me?.team ?? 0;
    const head = wait(ok ? '✓' : '×', ok ? 'You got it' : k.me?.answered ? 'Not this time' : 'No answer', ok ? 'Right' : 'Missed', ok || !answer ? undefined : `The answer: ${answer}`);
    head.classList.add(ok ? 'is-right' : 'is-wrong');
    const kids: HTMLElement[] = [head];
    if (res) {
      const brk = el('div', 'jpp-break');
      const row = (a: string, b: string, cls = '') => {
        const d = el('div', cls);
        d.append(el('span', '', a), el('b', '', b));
        return d;
      };
      brk.append(row(`${teamName(team)} right`, `${res.r} of ${res.n}`));
      if (final || (res.pick && double)) brk.append(row('Wager', fmt(res.wager ?? 0)));
      else if (res.pick) brk.append(row('Picking bonus', `×${k.bonus}`));
      brk.append(row(`${teamName(team)} ${final ? 'in the Final' : 'this tile'}`, `${res.gain >= 0 ? '+' : '−'}${fmt(Math.abs(res.gain))}`, 'tot'));
      kids.push(brk);
      const sig = `${k.phase}:${k.cur?.tile ?? 'final'}`;
      if (toasted !== sig) {
        toasted = sig;
        api.toast(`${ok ? 'Right' : 'Missed'} · ${teamName(team)} ${res.gain >= 0 ? '+' : '−'}${fmt(Math.abs(res.gain))}`, ok ? 'good' : 'bad');
        if (ok) api.sfx.right();
        else api.sfx.wrong();
      }
    } else if (final) kids.push(el('p', 'jpp-sub', 'Your team’s result is on the board next.'));
    kids.push(standings(v, team));
    body.replaceChildren(...kids);
    actions([]);
  }

  function paint(v: RoomView, force = false): void {
    const k = kv(v);
    if (!k) return;
    paintTop(v, k);
    const cur = k.cur;
    const f = k.final;
    const itemKey = cur ? cur.tile : f ? 'final' : '';
    const myAnswered = k.me ? JSON.stringify((cur?.answered ?? f?.answered ?? {})[k.me.team] ?? 0) : '';
    const sig = `${k.phase}:${itemKey}:${k.me?.captain}:${k.me?.answered}:${k.me?.correct}:${k.final?.shown ?? 0}:${k.turn?.team}:${myAnswered}:${f?.wagered.join(',') ?? ''}`;
    if (sig === screen && !force) return;
    const prevItem = screen.split(':')[1];
    // A new tile: forget the last answer draft.
    if (prevItem !== itemKey) {
      response = null;
      sent = false;
    }
    screen = sig;
    const team = k.me?.team;
    switch (k.phase) {
      case 'pick': {
        runBar(undefined);
        if (k.me?.captain && k.turn?.team === team) picker(k);
        else {
          aim = null;
          const t = k.turn?.team ?? 0;
          body.replaceChildren(wait('?', `${teamName(t)} are picking`, k.turn?.captain ? `Captain ${k.turn.captain} is choosing a tile` : 'The teacher is choosing a tile', 'Everyone answers every tile, so stay ready.'), standings(v, team));
          actions([]);
        }
        return;
      }
      case 'wager': {
        runBar(undefined);
        if (!cur) return;
        if (k.me?.captain && cur.team === team) {
          wagerScreen(`★ Double! You wager for the ${teamName(cur.team)}.`, `Every ${teamName(cur.team).replace(/s$/, '')} answers. Each right answer wins a share of the wager; each wrong one loses a share. Up to ${fmt(cur.max_wager ?? 0)}.`, cur.max_wager ?? 100, Math.min(100, cur.max_wager ?? 100), (n) => api.control('wager', { amount: n }));
        } else {
          body.replaceChildren(wait('×2', 'Double', `${teamName(cur.team)}’ captain is wagering`, 'The clue comes next. Everyone answers it.'));
          actions([]);
        }
        return;
      }
      case 'clue':
      case 'closed': {
        if (!cur) return;
        runBar(k.phase === 'clue' ? cur.ends_at : undefined);
        if (k.phase === 'clue' && !k.me?.answered && !sent) answerScreen(cur.item, `${catTitle(k, cur.cat)} · ${cur.value}`, cur.double);
        else lockedScreen(v, k, k.phase === 'clue', cur.answered);
        return;
      }
      case 'revealed': {
        runBar(undefined);
        resultScreen(v, k, cur?.results?.find((r) => r.team === team), cur?.answer, false, !!cur?.double);
        return;
      }
      case 'final_wager': {
        runBar(undefined);
        if (!f) return;
        if (k.me?.captain && team !== undefined && !f.wagered.includes(team)) {
          const max = k.me.max_wager ?? f.max?.[team] ?? 0;
          wagerScreen(`★ Final! You wager for the ${teamName(team)}.`, `Up to your team’s score (${fmt(max)}). Right shares win their part; wrong shares lose theirs.`, max, 0, (n) => api.control('wager', { amount: n }));
        } else {
          body.replaceChildren(wait('F', 'The Final', team !== undefined && f.wagered.includes(team) ? `${teamName(team)} wagered ${fmt(f.wagers?.[team] ?? 0)}` : 'Captains are wagering', 'Then everyone answers one last clue.'));
          actions([]);
        }
        return;
      }
      case 'final_clue':
      case 'final_closed': {
        if (!f) return;
        runBar(k.phase === 'final_clue' ? f.ends_at : undefined);
        if (k.phase === 'final_clue' && !k.me?.answered && !sent) answerScreen(f.item, 'Final', false);
        else lockedScreen(v, k, k.phase === 'final_clue', f.answered);
        return;
      }
      case 'final_reveal':
      case 'done': {
        runBar(undefined);
        const res = f?.results?.find((r) => r.team === team);
        if (f) resultScreen(v, k, res, f.answer, true, false);
        else body.replaceChildren(wait('★', 'Board cleared', 'Eyes on the board'), standings(v, team));
        if (!f) actions([]);
        return;
      }
    }
  }

  return {
    update(v) {
      view = v;
      paint(v);
    },
    dispose() {
      disposed = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}

registerLiveKind('jeopardy', { board: jeopardyBoard, phone: jeopardyPhone });

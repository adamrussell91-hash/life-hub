import { el } from '@/quiz/dom';
import type { RoomView, TeamView } from '../../core/room-protocol';
import { avatar, createRing, type Ring } from '../../live/board-parts';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { animate, countUp } from '../../motion/motion';
import type { ArticulateBoardView, ArticulatePhoneView, PublicTurnCard } from './rules';
import './articulate.css';

/**
 * Articulate on the board and the phone (approved mockup
 * docs/mockups/games/articulate.html). The board: the team up with its
 * describer and guessers, cards got this turn, the face-down card in play,
 * the ring, the landed cards and the team strip; then the quick check rows.
 * The phone: the describer's card with Got it and Pass, a captain's Buzz,
 * "guess aloud" for the team, and the quick check, one question at a time.
 */

/** Team names as the approved mockups draw them (Jeopardy uses the same). Team numbers are 0-based. */
export const TEAM_NAMES = ['Kestrels', 'Otters', 'Foxes', 'Herons', 'Wrens', 'Magpies'] as const;
export const teamName = (t: number): string => TEAM_NAMES[t % TEAM_NAMES.length] ?? `Team ${t + 1}`;
const teamColour = (t: number) => `var(--game-team-${(t % 4) + 1})`;
const teamSoft = (t: number) => `var(--game-team-${(t % 4) + 1}-soft)`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const LETTERS = ['A', 'B', 'C', 'D'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const resultLabel = (r: PublicTurnCard['result']) => (r === 'got' ? '✓ Got it' : r === 'pass' ? 'Passed' : 'Buzzed');

function teamsFrom(view: RoomView): TeamView[] {
  if (view.teams?.length) return view.teams;
  return view.leaderboard.filter((r) => r.team !== undefined).map((r) => ({ team: r.team as number, score: r.score, members: [], rank: r.rank }));
}

/* ── Board ───────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'ar-board');
  host.append(root);
  const ring: Ring = createRing('ar-ring');
  let last: ArticulateBoardView | null = null;
  let lastScores = new Map<number, number>();
  let mode = '';

  const strip = (view: RoomView, k: ArticulateBoardView) => {
    const s = el('div', 'ar-strip');
    for (const t of teamsFrom(view)) {
      const chip = el('span', `ar-ts${t.team === k.team && ['ready', 'turn', 'end'].includes(k.phase) ? ' is-now' : ''}`);
      chip.style.setProperty('--tc', teamColour(t.team));
      chip.innerHTML = `<i>${esc(teamName(t.team)[0] ?? '')}</i>${esc(teamName(t.team))}<b>${t.score}</b>`;
      const b = chip.querySelector('b') as HTMLElement;
      const was = lastScores.get(t.team);
      if (was !== undefined && was !== t.score) countUp(b, was, t.score, api.calm() ? 1 : 800);
      s.append(chip);
    }
    lastScores = new Map(teamsFrom(view).map((t) => [t.team, t.score]));
    return s;
  };

  const landed = (c: PublicTurnCard) => {
    const card = el('div', `ar-cd ar-land is-${c.result}`);
    card.innerHTML = `<span class="ar-st">${resultLabel(c.result)}</span><span class="ar-term">${esc(c.term)}</span>${c.result === 'buzz' ? '<span class="ar-stamp">BUZZED</span>' : ''}`;
    return card;
  };

  function renderTurn(view: RoomView, k: ArticulateBoardView) {
    const fresh = mode !== `turn:${k.round}:${k.at}`;
    mode = `turn:${k.round}:${k.at}`;
    const prev = fresh ? null : last;
    root.className = 'ar-board ar-board--turn';
    root.style.setProperty('--tc', teamColour(k.team));
    root.replaceChildren();

    const panel = el('div', 'ar-team');
    panel.innerHTML = `<span class="gl-eyebrow">Round ${k.round + 1} · turn ${k.at + 1} of ${k.order.length}</span><h2><i></i>${esc(teamName(k.team))}</h2><span class="ar-lbl">Describing</span>`;
    const desc = el('div', 'ar-desc');
    if (k.describer) desc.append(avatar(k.describer, 'gl-av--xl'), document.createTextNode(k.describer));
    const guess = el('div', 'ar-guess');
    for (const g of k.guessers) {
      const d = el('div');
      d.append(avatar(g), el('span', '', g));
      guess.append(d);
    }
    panel.append(desc, el('span', 'ar-lbl', 'Guessing aloud'), guess);

    const head = el('div', 'ar-head');
    const got = k.cards.filter((c) => c.result === 'got').length;
    if (k.phase === 'ready') {
      head.innerHTML = `<div class="ar-msg"><h3>${esc(teamName(k.team))}, you’re up</h3><p>${esc(k.describer ?? 'Your describer')} describes. No banned words, no “sounds like”, no pointing at the board.</p></div>`;
    } else {
      const g = el('div', 'ar-got');
      const num = el('span', 'ar-num', String(got));
      const why = k.phase === 'end' ? (k.why === 'deck' ? 'cards got · deck empty' : k.why === 'time' ? 'cards got · time!' : 'cards got · turn ended') : 'cards got this turn';
      g.append(num, el('span', 'ar-lbl2', why));
      head.append(g);
      const prevGot = prev ? prev.cards.filter((c) => c.result === 'got').length : got;
      if (prevGot !== got) {
        countUp(num, prevGot, got, api.calm() ? 1 : 300);
        if (!api.calm()) void animate(num, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420 });
      }
      if (k.phase === 'turn') {
        const play = el('div', 'ar-play');
        const back = el('div', 'ar-cd ar-back');
        back.innerHTML = `<b>?</b><small>Card ${k.dealt} · ${esc(k.describer ?? '')}</small>`;
        play.append(back);
        head.append(play);
        if (!prev || prev.dealt !== k.dealt) if (!api.calm()) void animate(back, [{ transform: 'translateY(-2em) rotateX(50deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450 });
        head.append(ring.root);
        if (view.ends_at) ring.run(view.ends_at, k.seconds * 1000, api.serverNow);
      } else {
        ring.stop();
        const sum = el('div', 'ar-msg ar-msg--end');
        const passed = k.cards.filter((c) => c.result === 'pass').length;
        const buzzed = k.cards.filter((c) => c.result === 'buzz').length;
        sum.innerHTML = `<h3>${got ? `${esc(teamName(k.team))} +${got}` : 'No cards this time'}</h3><p>${passed} passed · ${buzzed} buzzed</p>`;
        head.append(sum);
      }
    }

    const field = el('div', 'ar-field');
    const slots = Math.max(8, Math.ceil((k.cards.length + 1) / 4) * 4);
    for (let i = 0; i < slots; i++) {
      const slot = el('div', 'ar-slot');
      const c = k.cards[i];
      if (c) {
        slot.classList.add('has');
        const card = landed(c);
        slot.append(card);
        const isNew = prev && i >= prev.cards.length;
        if (isNew) {
          if (c.result === 'got') api.sfx.right();
          else if (c.result === 'buzz') api.sfx.buzz();
          else api.sfx.whoosh();
          if (!api.calm()) {
            if (c.result === 'got') void animate(card, [{ transform: 'translateY(-12em) rotate(-10deg) scale(1.25)', opacity: 0 }, { transform: 'translateY(0.3em) rotate(1deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 700 });
            else void animate(card, [{ transform: 'scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400 });
            if (c.result === 'buzz') {
              const flash = el('div', 'ar-flash');
              root.append(flash);
              void animate(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 700 }).then(() => flash.remove());
            }
          }
        }
      }
      field.append(slot);
    }
    root.append(panel, head, field, strip(view, k));
    if (fresh && !api.calm()) {
      void animate(panel, [{ opacity: 0, transform: 'translateY(1em)' }, { opacity: 1, transform: 'none' }], { duration: 600 });
    }
    if (k.phase === 'end' && prev?.phase === 'turn') api.sfx.ding();
  }

  function renderCheck(view: RoomView, k: ArticulateBoardView) {
    const c = k.check;
    if (!c) return;
    const fresh = mode !== `check:${k.round}`;
    mode = `check:${k.round}`;
    root.className = 'ar-board ar-board--check';
    root.replaceChildren();
    const head = el('div', 'ar-qh');
    head.innerHTML = `<div><span class="gl-eyebrow">After the round · on every phone</span><h2>Quick check: this round’s terms</h2></div><span class="gl-pill">${c.revealed && c.avg !== undefined ? `Class got <b>${c.avg}%</b>` : 'Everyone answers on their own'}</span>`;
    const rows = el('div', 'ar-qrows');
    c.questions.forEach((q, i) => {
      const row = el('div', `ar-qrow${c.revealed && c.hardest === i ? ' is-hard' : ''}`);
      const share = c.revealed ? (q.pct ?? 0) / 100 : q.answered / Math.max(1, c.seats);
      const tone = !c.revealed ? '' : (q.pct ?? 0) >= 70 ? 'is-good' : (q.pct ?? 0) >= 55 ? 'is-mid' : 'is-low';
      row.innerHTML = `<span class="ar-t"><b>${esc(q.term)}${c.revealed && c.hardest === i ? '<span class="ar-hardtag">Hardest</span>' : ''}</b><span>${q.kind === 'definition' ? 'Pick the right definition' : 'Which example shows it?'}</span></span><span class="ar-bar"><i class="${tone}" style="transform:scaleX(${share.toFixed(3)})"></i></span><span class="ar-n">${c.revealed ? `<b>${q.pct ?? 0}%</b> right` : `<b>${q.answered}</b> / ${c.seats} answered`}</span>`;
      rows.append(row);
      if (fresh && !api.calm()) void animate(row, [{ opacity: 0, transform: 'translateY(1em)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: i * 110 });
    });
    root.append(head, rows, strip(view, k));
    if (last?.check && !last.check.revealed && c.revealed) api.sfx.reveal();
    if (fresh) api.sfx.reveal();
  }

  function renderTeacher(k: ArticulateBoardView) {
    if (!k.describers?.length) return;
    const t = el('details', 'ar-tv');
    t.innerHTML = `<summary>Teacher only: per describer</summary><div class="ar-tbl"><div class="ar-tr ar-tr--hd"><span>Describer</span><span>Got</span><span>Passed</span><span>Buzzed</span><span>Per card</span><span>Terms</span></div>${k.describers
      .map(
        (d) =>
          `<div class="ar-tr"><span class="ar-who">${esc(d.initials)} <small>${esc(teamName(d.team))}</small></span><span>${d.got}</span><span>${d.passed}</span><span>${d.buzzed}</span><span>${d.avg_s} s</span><span class="ar-terms">${d.terms.map((x) => `<span class="is-${x.result}">${esc(x.term)}</span>`).join('')}</span></div>`
      )
      .join('')}</div>`;
    root.append(t);
  }

  return {
    update(view) {
      const k = view.kind_view as ArticulateBoardView | undefined;
      if (!k || k.who !== 'board') return;
      if (k.phase === 'check' || k.phase === 'checked') {
        ring.stop();
        renderCheck(view, k);
        renderTeacher(k);
      } else renderTurn(view, k);
      last = k;
    },
    controls(view) {
      const k = view.kind_view as ArticulateBoardView | undefined;
      if (!k || k.who !== 'board' || view.phase !== 'playing') return [];
      switch (k.phase) {
        case 'ready':
          return [...(k.at > 0 ? [{ label: 'Skip to quick check', name: 'check' }] : []), { label: 'Start turn', name: 'start_turn', primary: true, key: ' ' }];
        case 'turn':
          return [
            { label: 'End turn', name: 'end_turn' },
            { label: 'Buzz', name: 'buzz', key: 'b', primary: true }
          ];
        case 'end':
          return k.last_turn
            ? [{ label: 'Quick check', name: 'next_turn', primary: true, key: ' ' }]
            : [
                { label: 'Skip to quick check', name: 'check' },
                { label: `Next: ${teamName(k.next_team ?? 0)}`, name: 'next_turn', primary: true, key: ' ' }
              ];
        case 'check':
          return [{ label: 'Reveal results', name: 'reveal_check', primary: true, key: ' ' }];
        case 'checked':
          return [
            { label: 'Another round', name: 'next_round' },
            { label: 'Final scores', name: 'final', primary: true }
          ];
      }
    },
    onKey(e) {
      if ((e.key === 'b' || e.key === 'B') && last?.phase === 'turn') {
        void api.control('buzz');
        return true;
      }
      return false;
    },
    dispose() {
      ring.stop();
      root.remove();
    }
  };
}

/* ── Phone ───────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'ar-phone');
  host.append(root);
  let k: ArticulatePhoneView | null = null;
  let shownCard = '';
  let qIndex = 0;
  let busy = false;
  let key = '';

  const btn = (label: string, cls: string, on: () => void, disabled = false) => {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', () => {
      if (!b.disabled) on();
    });
    return b;
  };

  const chip = (team: number, text: string) => `<span class="ar-tc" style="--tc:${teamColour(team)};--tcs:${teamSoft(team)}"><i></i>${esc(text)}</span>`;

  const cardHtml = (card: NonNullable<ArticulatePhoneView['card']>, team: number) => {
    const fs = card.term.length > 16 ? 28 : card.term.length > 12 ? 32 : 36;
    return `<div class="ar-pcard" style="--tc:${teamColour(team)}"><span class="ar-kind">Describe this</span><span class="ar-pterm" style="--fs:${fs}px">${esc(card.term)}</span>${
      card.banned.length ? `<div class="ar-ban"><span>Don’t say</span><ul>${card.banned.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''
    }</div>`;
  };

  async function describe(result: 'got' | 'pass') {
    if (!k?.card || busy) return;
    busy = true;
    const card = root.querySelector('.ar-pcard');
    api.setActions?.([]);
    if (card && !api.calm()) {
      await animate(
        card,
        result === 'got'
          ? [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-140%) rotate(-5deg) scale(.9)', opacity: 0 }]
          : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-120%) rotate(-4deg)', opacity: 0 }],
        { duration: 320, fill: 'forwards' }
      );
    }
    try {
      await api.move({ item: k.card.item, move: result === 'got' ? 'describe' : 'pass', response: { result } });
      if (result === 'got') api.sfx.right();
    } catch (e) {
      api.toast(e instanceof Error ? e.message : 'That didn’t go through.', 'bad');
    } finally {
      busy = false;
      shownCard = '';
      if (k) render(true);
    }
  }

  async function answer(item: string, option: string, started: number) {
    if (busy) return;
    busy = true;
    try {
      const r = await api.move({ item, move: 'answer', response: { option }, time_ms: Math.max(0, Math.round(api.serverNow() - started)) });
      if (r.correct) api.sfx.right();
      else api.sfx.wrong();
    } catch (e) {
      api.toast(e instanceof Error ? e.message : 'That didn’t go through.', 'bad');
    } finally {
      busy = false;
    }
  }

  let qShownAt = 0;

  function render(anim = false) {
    if (!k) return;
    const v = k;
    const myTeam = v.my_team ?? 0;
    let body = '';
    let actions: HTMLElement[] = [];
    if (v.phase === 'ready') {
      body = v.up_next
        ? `<div class="ar-wait"><div>${chip(myTeam, teamName(myTeam))}<div class="ar-big">You’re describing</div><p class="ar-sub">Hold your phone so your team can’t see it. Your first card appears when the teacher starts the turn.</p></div></div>`
        : `<div class="ar-wait"><div>${chip(v.team, `${teamName(v.team)} are up${v.team === myTeam ? ' (your team)' : ''}`)}<p class="ar-sub">${
            v.team === myTeam ? `${esc(v.describer ?? 'Your describer')} describes. Guess out loud.` : 'If you’re your team’s captain, you’ll see their card so you can buzz a banned word.'
          }</p></div></div>`;
      if (v.last) body += lastList(v);
    } else if (v.phase === 'turn') {
      if (v.role === 'describer' && v.card) {
        body = `${cardHtml(v.card, myTeam)}<div class="ar-meta"><span>Got <b>${v.got}</b> this turn</span><span class="ar-passes">Passes <span class="ar-dots">${Array.from({ length: v.passes }, (_, i) => `<i class="${i < v.passes - v.passes_left ? 'used' : ''}"></i>`).join('')}</span></span></div>`;
        actions = [
          btn(v.passes_left ? `Pass (${v.passes_left} left)` : 'No passes left', 'btn--secondary ar-passbtn', () => void describe('pass'), !v.passes_left || busy),
          btn('Got it', 'btn--primary ar-gotbtn', () => void describe('got'), busy)
        ];
      } else if (v.role === 'captain' && v.card) {
        body = `<p class="ar-sub"><b>${esc(teamName(v.team))}</b> are describing · ${esc(v.describer ?? '')} has the card</p>${cardHtml(v.card, v.team)}<p class="ar-sub ar-small">Captain: buzz the moment you hear a banned word.</p>`;
        const item = v.card.item;
        actions = [
          btn('Buzz · banned word said', 'btn--primary ar-pbuzz', () => {
            api.sfx.buzz();
            void api.control('buzz', { item }).catch((e: unknown) => api.toast(e instanceof Error ? e.message : 'Too late.', 'bad'));
          })
        ];
      } else if (v.role === 'team') {
        body = `<div class="ar-wait"><div>${chip(myTeam, teamName(myTeam))}<div class="ar-big">Guess out loud!</div><p class="ar-sub">${esc(v.describer ?? '')} is describing. Got <b>${v.got}</b> so far.</p></div></div>`;
      } else {
        body = `<div class="ar-wait"><div>${chip(v.team, `${teamName(v.team)} are describing`)}<p class="ar-sub">Listen for banned words. Got <b>${v.got}</b> so far.</p></div></div>`;
      }
    } else if (v.phase === 'end') {
      body = lastList(v);
    } else if (v.check) {
      const qs = v.check.questions;
      if (v.phase === 'checked' || qIndex >= qs.length) {
        const right = qs.filter((q) => q.answer?.correct).length;
        body = `<div class="ar-wait ar-wait--top"><div><span class="ar-sub">Quick check done</span><div class="ar-big">${right} of ${qs.length}</div><p class="ar-sub">${v.phase === 'checked' ? 'Eyes on the board for the class results.' : 'Eyes on the board.'}</p></div></div><div class="ar-list">${qs
          .map((q) => `<div><span>${esc(q.term)}</span><span class="${q.answer?.correct ? 'ok' : q.answer ? 'no' : 'mu'}">${q.answer?.correct ? 'Right' : q.answer ? 'Back to box 1' : 'Not answered'}</span></div>`)
          .join('')}</div>`;
        if (v.mine && v.phase === 'checked') body += `<div class="ar-list"><div><span>You described</span><b>${v.mine.described} got</b></div><div><span>Your quick check</span><b>${v.mine.check_right} of ${v.mine.check_of}</b></div></div><p class="ar-sub ar-center">Missed terms go back to box 1 in your organiser.</p>`;
      } else {
        const q = qs[qIndex]!;
        const a = q.answer;
        if (!a && !qShownAt) qShownAt = api.serverNow();
        body = `<div class="ar-qtop"><span class="ar-sub">Quick check ${qIndex + 1} of ${qs.length}</span><span class="ar-sub ar-small">On your own</span></div><p class="ar-sub ar-small ar-strong">${q.kind === 'definition' ? 'Pick the right definition' : 'Which example shows it?'}</p><p class="ar-qterm">${esc(q.term)}</p><div class="ar-opts">${q.options
          .map(
            (o, i) =>
              `<button type="button" class="ar-opt${a ? (o.id === a.right ? ' is-right' : o.id === a.option ? ' is-wrong' : ' is-dim') : ''}" data-opt="${esc(o.id)}"${a ? ' disabled' : ''}><span class="gm-glyph gm-glyph--sm gm-glyph--k${i + 1}">${LETTERS[i]}</span><span>${esc(o.text)}</span></button>`
          )
          .join('')}</div>${a?.why ? `<div class="ar-why">${esc(a.why)}</div>` : ''}`;
        if (a) actions = [btn(qIndex === qs.length - 1 ? 'Finish' : 'Next question', 'btn--primary', () => {
          qIndex += 1;
          qShownAt = 0;
          render(true);
        })];
      }
    }
    const nextKey = `${v.phase}|${body}`;
    if (nextKey !== key) {
      root.innerHTML = body;
      key = nextKey;
      const card = root.querySelector('.ar-pcard');
      const cardId = v.card?.item ?? '';
      if (card && cardId !== shownCard && !api.calm()) void animate(card, [{ transform: 'translateY(60px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
      shownCard = cardId;
      if (anim && !api.calm() && v.check) void animate(root, [{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350 });
      root.querySelectorAll<HTMLButtonElement>('.ar-opt').forEach((b) =>
        b.addEventListener('click', () => {
          const q = v.check?.questions[qIndex];
          if (!q || q.answer) return;
          root.querySelectorAll<HTMLButtonElement>('.ar-opt').forEach((x) => (x.disabled = true));
          void answer(q.item, b.dataset.opt ?? '', qShownAt || api.serverNow());
        })
      );
    }
    api.setActions?.(actions);
  }

  function lastList(v: ArticulatePhoneView): string {
    const l = v.last;
    if (!l) return '';
    const got = l.cards.filter((c) => c.result === 'got').length;
    return `<div class="ar-wait ar-wait--top"><div><span class="ar-sub">${l.mine ? 'Time! You described' : `${esc(teamName(l.team))} got`}</span><div class="ar-big">${got}</div><p class="ar-sub">${l.mine ? `for the ${esc(teamName(l.team))}` : 'cards'}</p></div></div><div class="ar-list">${
      l.cards.map((c) => `<div><span>${esc(c.term)}</span><span class="${c.result === 'got' ? 'ok' : c.result === 'buzz' ? 'no' : 'mu'}">${resultLabel(c.result).replace('✓ ', '')}</span></div>`).join('') || '<div><span>No cards this turn</span></div>'
    }</div><p class="ar-sub ar-center">A quick check on these terms comes after the round.</p>`;
  }

  return {
    update(view) {
      const next = view.kind_view as ArticulatePhoneView | undefined;
      if (!next || next.who !== 'phone') return;
      const was = k;
      k = next;
      if (was && was.phase !== 'check' && next.phase === 'check') {
        qIndex = 0;
        qShownAt = 0;
      }
      // Skip questions already answered (a reload mid-check).
      if (next.phase === 'check' && next.check) while (qIndex < next.check.questions.length && next.check.questions[qIndex]?.answer && !was) qIndex += 1;
      if (was?.role === 'describer' && was.card && next.card && was.card.item !== next.card.item && next.got === was.got && next.passes_left === was.passes_left) {
        api.toast('Buzzed: a banned word. That card is out.', 'bad');
        api.sfx.buzz();
      }
      render();
    },
    dispose() {
      root.remove();
    }
  };
}

registerLiveKind('articulate', { board: mountBoard, phone: mountPhone });

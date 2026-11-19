import { el } from '@/quiz/dom';
import type { RoomView } from '../../core/room-protocol';
import { teamName } from '../../core/room-protocol';
import { avatar, createRing, teamBadge, teamColour, type Ring } from '../../live/board-parts';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { animate } from '../../motion/motion';
import { CHAIN_ITEM, type ChainBoardView, type ChainPhoneView, type Job, type Notice } from './rules';
import './answer-chain.css';

/**
 * Answer chain on the board and the phone (approved mockup
 * docs/mockups/games/answer-chain.html).
 *
 * Board: one thread per team, a bead per link (Q or A, filled once written,
 * text hidden until the reveal), captures taking over the whole board, the
 * reveal chain by chain, the review counter, and a check panel the teacher
 * opens only when they choose (it's on the projector). The board never shows
 * a review fix.
 *
 * Phone: the whole game as a strip of jobs (WRITE / SHADOW / STEAL), the
 * current job huge, and a full-screen CAPTURED!! or STOLEN! when it happens.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const JOB_NAME: Record<Job, string> = { write: 'WRITE', shadow: 'SHADOW', steal: 'STEAL', predict: 'WARM UP' };
const JOB_SHORT: Record<Job, string> = { write: 'WRITE', shadow: 'SHADOW', steal: 'STEAL', predict: 'WARM' };
const errText = (e: unknown) => (e instanceof Error ? e.message : 'That didn’t go through.');

/**
 * How to play, before round 1 (class trial 20 Nov: nobody knew what to do).
 * The board shows the worked example; phones show the same step in short.
 * The example chain is invented and drifts on purpose (Romeo → Hamlet).
 */
const EX = { start: 'Romeo', q: 'Who is the hero of a famous Shakespeare tragedy?', a: 'Hamlet' };
const HOWTO_PHONE: Array<{ title: string; body: string }> = [
  { title: 'Your team builds a chain', body: 'Answer → question → answer → question… one link each, taking turns. You only see the link just before yours.' },
  { title: 'Question rounds', body: 'If this is the answer… what is the question? Write a question that leads to it.' },
  { title: 'Answer rounds', body: 'If this is the question… what is the answer? One word or a short name.' },
  { title: 'One job each round', body: 'WRITE your team’s next link. SHADOW: answer secretly and match your writer. STEAL: guess another team’s answer.' },
  { title: 'Points', body: 'Your link counts +5. Shadow match +3 × your bet. Capture +10. At the end the class checks every link: wrong answers lose their points.' },
  { title: 'Ready?', body: 'Your jobs for every round are along the top of this screen. Your first one shows when the round starts.' }
];
/** What each job means, said in full (phone and board). */
const JOB_HOW: Record<Job, string> = {
  write: 'Add your team’s next link. If time runs out, what you’ve typed goes in.',
  shadow: 'A teammate is answering. Answer the same question secretly. Same word as them scores.',
  steal: 'See another team’s question and how many letters their answer has. Guess the word to capture it.',
  predict: 'Nothing to steal yet. Guess the word your chain will end on.'
};

/* ── Shared: the capture takeover ────────────────────────────────── */

function boom(host: HTMLElement, opts: { kind: 'captured' | 'stolen'; title: string; word: string; line: string; sub?: string; colour: string; calm: boolean; big: boolean }): void {
  host.querySelectorAll('.ac-boom').forEach((n) => n.remove());
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const b = el('div', `ac-boom ac-boom--${opts.kind}${opts.big ? ' ac-boom--board' : ''}`);
  b.style.setProperty('--ac-c', opts.colour);
  b.setAttribute('role', 'alert');
  const confetti = opts.kind === 'captured' && !opts.calm ? Array.from({ length: opts.big ? 80 : 40 }, (_, i) => `<i class="ac-cf" style="left:${(i * 37) % 100}%;animation-delay:${((i * 53) % 50) / 100}s;--r:${(i * 71) % 360}deg"></i>`).join('') : '';
  b.innerHTML = `${confetti}<div class="ac-boom__w1">${esc(opts.title)}</div><div class="ac-boom__w2">${opts.line}</div>${opts.sub ? `<div class="ac-boom__w3">${esc(opts.sub)}</div>` : ''}`;
  host.append(b);
  if (!opts.calm) {
    void animate(host, [{ transform: 'none' }, { transform: 'translate(-0.4em,0.15em) rotate(-0.6deg)' }, { transform: 'translate(0.4em,-0.15em) rotate(0.6deg)' }, { transform: 'none' }], { duration: 450 });
  }
  setTimeout(() => b.remove(), opts.calm ? 2200 : 3200);
}

/* ── Board ───────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'ac-board');
  host.append(root);
  const ring: Ring = createRing('ac-ring');
  let mode = '';
  let seenCapture = -1;
  let seenMatches = -1;

  const lanes = (v: ChainBoardView) =>
    v.chains
      .map((c) => {
        const beads = c.links
          .map((l, i) => {
            const cls = ['ac-bead', l.filled ? 'is-on' : '', l.writing ? 'is-writing' : '', l.status === 'x' ? 'is-x' : '', l.captured !== undefined ? 'is-cap' : ''].join(' ');
            const cap = l.captured !== undefined ? ` style="--ac-cap:${teamColour(l.captured)}"` : '';
            return `<span class="${cls}"${cap} title="${l.type}${i + 1}">${l.type}</span>`;
          })
          .join('');
        return `<div class="ac-lane" style="--ac-c:${teamColour(c.team)}"><span class="ac-lane__name"><span class="ac-badge">${c.team + 1}</span>${esc(teamName(c.team))}</span><div class="ac-thread"><span class="ac-bead ac-bead--start">★</span>${beads}</div>${c.home ? '<span class="ac-home">back home ★</span>' : ''}</div>`;
      })
      .join('');

  const card = (label: string, text: string, answer = false, extra = '') => `<div class="ac-card${extra}"><span class="ac-card__w">${label}</span><span class="ac-card__t${answer ? ' is-a' : ''}">${esc(text)}</span></div>`;
  const ask = (lead: string, thing: string, tail: string, answer: boolean) => `<p class="ac-ask"><span>${lead}</span> <b class="${answer ? 'is-a' : 'is-q'}">${esc(thing)}</b> <span>${tail}</span></p>`;

  function howto(v: ChainBoardView) {
    const h = v.howto!;
    const key = `howto:${h.step}`;
    if (mode === key) return;
    mode = key;
    ring.stop();
    root.className = 'ac-board ac-board--howto';
    root.style.removeProperty('--ac-c');
    const eyebrow = `<span class="gl-eyebrow">How to play · ${h.step + 1} of ${h.of}</span>`;
    const q = '<div class="ac-card ac-card--blank"><span class="ac-card__w">Question</span><span class="ac-card__t">?</span></div>';
    const a = '<div class="ac-card ac-card--blank"><span class="ac-card__w">Answer</span><span class="ac-card__t is-a">?</span></div>';
    const arrow = '<span class="ac-arrow">→</span>';
    let body = '';
    switch (h.step) {
      case 0:
        body = `<h2 class="ac-huge">Your team builds a chain</h2>
          <div class="ac-demo">${card('Start', v.start, true, ' ac-card--start')}${arrow}${q}${arrow}${a}${arrow}${q}${arrow}${a}</div>
          <p class="ac-lead">Answer → question → answer → question… one link each, taking turns. Every team starts from <b>“${esc(v.start)}”</b>. You only ever see the link just before yours.</p>`;
        break;
      case 1:
        body = `<h2 class="ac-huge">Question rounds</h2>
          ${ask('If', EX.start, 'is the answer… what is the question?', true)}
          <div class="ac-demo">${card('Example · the answer', EX.start, true, ' ac-card--start')}${arrow}${card('You write', EX.q, false, ' is-new')}</div>
          <p class="ac-lead">Write a question that leads to that answer. Your teammate sees only your question, never the answer.</p>`;
        break;
      case 2:
        body = `<h2 class="ac-huge">Answer rounds</h2>
          ${ask('If', EX.q, 'is the question… what is the answer?', false)}
          <div class="ac-demo">${card('Example · the question', EX.q)}${arrow}${card('You write', EX.a, true, ' is-new')}</div>
          <p class="ac-lead">One word or a short name. This question fits more than one play, so the chain drifted from Romeo to Hamlet. <b>A clear question keeps your chain on track.</b></p>`;
        break;
      case 3:
        body = `<h2 class="ac-huge">Your phone gives you one job each round</h2>
          <div class="ac-jobcards">${(['write', 'shadow', 'steal'] as Job[]).map((j) => `<div class="ac-jobcard ac-job--${j}"><b>${JOB_NAME[j]}</b><span>${JOB_HOW[j]}</span></div>`).join('')}</div>
          <p class="ac-lead">First two rounds, if you’re not writing: <b>WARM UP</b>. Guess the word your chain will end on.</p>`;
        break;
      case 4:
        body = `<h2 class="ac-huge">Points</h2>
          <div class="ac-points">
            <div><b>+5</b><span>your link goes in the chain</span></div>
            <div><b>+3 × bet</b><span>your shadow matches the writer (no match: lose your bet)</span></div>
            <div><b>+10</b><span>you capture another team’s answer (+5 to whoever wrote their clear question)</span></div>
            <div><b>+5</b><span>each writer, if your chain ends back on the start word</span></div>
          </div>
          <p class="ac-lead">At the end, everyone checks the chains anonymously. <b>Junk or wrong answers get crossed out and lose their points.</b></p>`;
        break;
      default:
        body = `<h2 class="ac-huge">Ready?</h2><p class="ac-lead ac-lead--big">Look at your phone. Your jobs for every round are along the top, and your first job shows when round 1 starts.</p>`;
    }
    root.innerHTML = `${eyebrow}${body}`;
    if (!api.calm()) void animate(root, [{ opacity: 0, transform: 'translateY(0.6em)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
  }

  /** What to do this round, in words, for every job that has someone doing it. */
  function steps(v: ChainBoardView, r: number): string {
    const q = r % 2 === 0;
    const rows: string[] = [];
    if (v.jobs.write) rows.push(`<div class="ac-step ac-job--write"><b>WRITE</b><span>${q ? 'If the word on your phone is the answer… <em>what is the question?</em>' : 'If the question on your phone is the question… <em>what is the answer?</em> One word.'}</span></div>`);
    if (v.jobs.shadow) rows.push(`<div class="ac-step ac-job--shadow"><b>SHADOW</b><span>Answer the same question secretly. Same word as your writer scores.</span></div>`);
    if (v.jobs.steal) rows.push(`<div class="ac-step ac-job--steal"><b>STEAL</b><span>Guess another team’s answer from their question and its letters.</span></div>`);
    if (v.jobs.predict) rows.push(`<div class="ac-step ac-job--predict"><b>WARM UP</b><span>Guess the word your chain will end on.</span></div>`);
    return rows.join('');
  }

  function rounds(view: RoomView, v: ChainBoardView) {
    const gap = v.phase === 'gap';
    const key = `rounds:${v.round}:${gap}`;
    const r = gap ? v.round + 1 : v.round;
    const type = r % 2 === 0 ? 'Question' : 'Answer';
    if (mode !== key) {
      mode = key;
      root.className = 'ac-board ac-board--rounds';
      root.style.removeProperty('--ac-c');
      root.innerHTML = `<div class="ac-head"><div><span class="gl-eyebrow">${gap ? 'Next up' : `Link ${r + 1} of ${v.links}`}${v.theme ? ` · ${esc(v.theme)}` : ''}</span><h2 class="ac-title">${gap ? `${type} round next` : `${type} round · every chain starts at “${esc(v.start)}”`}</h2></div></div>
        <div class="ac-lanes" style="--ac-n:${v.chains.length}"></div>
        <div class="ac-steps"></div>
        <div class="ac-jobs"></div>`;
      if (!gap) {
        root.querySelector('.ac-head')!.append(ring.root);
        if (!api.calm()) api.sfx.whoosh();
      } else ring.stop();
    }
    if (!gap && view.ends_at) ring.run(view.ends_at, (r % 2 === 0 ? v.seconds.question : v.seconds.answer) * 1000, api.serverNow);
    root.querySelector('.ac-lanes')!.innerHTML = lanes(v);
    root.querySelector('.ac-steps')!.innerHTML = gap ? '' : steps(v, r);
    const j = v.jobs;
    root.querySelector('.ac-jobs')!.innerHTML = `<span><b>${j.write}</b> writing</span>${j.shadow ? `<span><b>${j.shadow}</b> shadowing</span>` : ''}${j.steal ? `<span><b>${j.steal}</b> stealing</span>` : ''}${j.predict ? `<span><b>${j.predict}</b> predicting</span>` : ''}`;
  }

  function reveal(v: ChainBoardView) {
    const rv = v.reveal!;
    const chain = v.chains.find((c) => c.team === rv.team);
    if (!chain) return;
    const key = `reveal:${rv.team}`;
    if (mode !== key) {
      mode = key;
      ring.stop();
      root.className = 'ac-board ac-board--reveal';
      root.style.setProperty('--ac-c', teamColour(rv.team));
      // One row per question → answer pair, full width, so whole questions and answers show (20 Nov: the boxes were too small).
      root.innerHTML = `<div class="ac-head"><div><span class="gl-eyebrow">Chain ${v.chains.indexOf(chain) + 1} of ${rv.of}</span><h2 class="ac-title">${esc(teamName(rv.team))}</h2></div></div><div class="ac-ladder"><div class="ac-rung ac-rung--start"><span class="ac-rung__n">Start</span><div class="ac-card ac-card--start"><span class="ac-card__t is-a">${esc(v.start)}</span></div></div></div><div class="ac-revfoot"></div>`;
      api.sfx.reveal();
    }
    const ladder = root.querySelector('.ac-ladder')!;
    const have = ladder.querySelectorAll('.ac-card').length - 1;
    for (let i = have; i <= rv.i; i++) {
      const l = chain.links[i];
      if (!l) continue;
      let rung = ladder.querySelector<HTMLElement>(`[data-pair="${Math.floor(i / 2)}"]`);
      if (!rung) {
        rung = el('div', 'ac-rung');
        rung.dataset.pair = String(Math.floor(i / 2));
        rung.append(el('span', 'ac-rung__n', String(Math.floor(i / 2) + 1)));
        ladder.append(rung);
      } else rung.append(el('span', 'ac-arrow', '→'));
      const c = el('div', `ac-card${l.type === 'A' ? ' ac-card--a' : ' ac-card--q'}${l.captured !== undefined ? ' is-cap' : ''}${l.backup ? ' is-backup' : ''}`);
      const who = el('span', 'ac-card__w');
      if (l.initials) who.append(avatar(l.initials));
      who.append(` ${l.type}${i + 1}`);
      if (l.captured !== undefined) {
        const cap = el('span', 'ac-card__cap', `captured by ${teamName(l.captured)}`);
        cap.style.color = teamColour(l.captured);
        who.append(cap);
      }
      const t = el('span', `ac-card__t${l.type === 'A' ? ' is-a' : ''}`, l.text ?? '');
      c.append(who, t);
      rung.append(c);
      fitLadder(ladder as HTMLElement);
      if (!api.calm()) void animate(c, [{ opacity: 0, transform: 'translateY(0.8em) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
    }
    root.querySelector('.ac-revfoot')!.innerHTML = rv.i === v.links - 1 && chain.home ? '<span class="ac-home ac-home--big">★ Back where it started · +5 to every writer</span>' : '';
  }

  /** Shrinks the chain's text until every link fits on the projector (no scrolling on a board). */
  function fitLadder(ladder: HTMLElement) {
    let size = 1.1;
    ladder.style.fontSize = `${size}em`;
    while (ladder.scrollHeight > ladder.clientHeight + 1 && size > 0.55) {
      size -= 0.05;
      ladder.style.fontSize = `${size.toFixed(2)}em`;
    }
  }

  function review(view: RoomView, v: ChainBoardView) {
    if (mode !== 'review') {
      mode = 'review';
      root.className = 'ac-board ac-board--center';
      root.style.removeProperty('--ac-c');
      root.innerHTML = `<span class="gl-eyebrow">Review round · anonymous · on your phones</span><h2 class="ac-huge">Fix 3 · Flag unclear · Star the best</h2><p class="ac-lead"><b class="ac-in">0</b> of <span class="ac-of">0</span> reviews in</p>`;
      root.append(ring.root);
      api.sfx.whoosh();
    }
    if (view.ends_at) ring.run(view.ends_at, v.seconds.review * 1000, api.serverNow);
    root.querySelector('.ac-in')!.textContent = String(v.review?.in ?? 0);
    root.querySelector('.ac-of')!.textContent = String(v.review?.of ?? 0);
  }

  function check(v: ChainBoardView) {
    const c = v.check!;
    const key = `check:${c.open}:${JSON.stringify(c.rows ?? [])}`;
    if (mode === key) return;
    mode = key;
    ring.stop();
    root.className = 'ac-board ac-board--center';
    if (!c.open) {
      root.innerHTML = `<span class="gl-eyebrow">Checking the fixes</span><h2 class="ac-huge">Your teacher is checking</h2><p class="ac-lead">Your feedback goes to your phone only.</p>`;
      return;
    }
    root.className = 'ac-board';
    root.innerHTML = `<div class="ac-head"><div><span class="gl-eyebrow">Teacher check · this panel is on the board</span><h2 class="ac-title">${c.flagged} over the bar · nothing reaches a writer until you send</h2></div></div><div class="ac-check"></div>`;
    const box = root.querySelector('.ac-check')!;
    if (!c.rows?.length) box.append(el('p', 'ac-lead', 'Nothing over the bar. Send the feedback when you’re ready.'));
    for (const r of c.rows ?? []) {
      const row = el('div', 'ac-crow');
      row.style.setProperty('--ac-c', teamColour(r.team));
      row.innerHTML = `<div class="ac-crow__pair"><span>${esc(r.q)}</span><b>${esc(r.a)}</b></div><div><b>${r.flags}</b> of ${r.seen} flagged${r.fix ? ` · class fix <b>${esc(r.fix)}</b>` : ''}</div><div>${r.unclear} unclear</div>`;
      const acts = el('div', 'ac-crow__acts');
      for (const d of ['agree', 'overrule'] as const) {
        const b = el('button', `btn btn--sm ${r.decision === d || (!r.decision && d === 'agree') ? 'btn--primary' : 'btn--secondary'}`, d === 'agree' ? 'Agree' : 'Overrule');
        b.type = 'button';
        b.addEventListener('click', () => void api.control('decide', { id: r.id, decision: d }).catch((e) => api.toast(errText(e), 'bad')));
        acts.append(b);
      }
      row.append(acts);
      box.append(row);
    }
  }

  function done(v: ChainBoardView) {
    if (mode === 'done') return;
    mode = 'done';
    ring.stop();
    root.className = 'ac-board ac-board--center';
    root.innerHTML = `<span class="gl-eyebrow">Review done · feedback is on your phones</span>${
      v.best ? `<h2 class="ac-huge">★ Most accurate</h2><div class="ac-best"><span>${esc(v.best.q)}</span><b>${esc(v.best.a)}</b><small>${v.best.stars} star${v.best.stars === 1 ? '' : 's'}</small></div>` : '<h2 class="ac-huge">Chains complete</h2>'
    }`;
    api.sfx.fanfare();
  }

  function effects(v: ChainBoardView) {
    const caps = v.captures;
    const newest = caps[caps.length - 1];
    if (seenCapture < 0) seenCapture = newest?.seq ?? 0;
    else if (newest && newest.seq > seenCapture) {
      seenCapture = newest.seq;
      if (v.phase === 'rounds' || v.phase === 'gap') {
        boom(host, {
          kind: 'captured',
          title: 'CAPTURED!!',
          word: newest.word,
          line: `<span class="ac-t" style="color:${teamColour(newest.team)}">${esc(teamName(newest.team))}</span> steals <b>“${esc(newest.word)}”</b>`,
          sub: `from ${teamName(newest.victim)} · +10 · +5 to their question writer`,
          colour: teamColour(newest.team),
          calm: api.calm(),
          big: true
        });
        api.sfx.coin();
      }
    }
    if (seenMatches < 0) seenMatches = v.matches.length;
    else if (v.matches.length > seenMatches) {
      const m = v.matches[v.matches.length - 1]!;
      seenMatches = v.matches.length;
      api.toast(`${teamName(m.a)} and ${teamName(m.b)} landed on the same answer · +5 each`, 'good');
      api.sfx.ding();
    }
  }

  return {
    update(view) {
      const v = view.kind_view as ChainBoardView | undefined;
      if (!v || v.who !== 'board') return;
      if (v.phase === 'howto' && v.howto) howto(v);
      else if (v.phase === 'rounds' || v.phase === 'gap') rounds(view, v);
      else if (v.phase === 'reveal' && v.reveal) reveal(v);
      else if (v.phase === 'review') review(view, v);
      else if (v.phase === 'check' && v.check) check(v);
      else if (v.phase === 'done') done(v);
      effects(v);
    },
    controls(view) {
      const v = view.kind_view as ChainBoardView | undefined;
      if (!v || v.who !== 'board' || view.phase !== 'playing') return [];
      switch (v.phase) {
        case 'howto': {
          const h = v.howto ?? { step: 0, of: 1 };
          const last = h.step >= h.of - 1;
          return [...(h.step > 0 ? [{ label: 'Back', name: 'prev' }] : []), ...(!last ? [{ label: 'Skip to round 1', name: 'skip_howto' }] : []), { label: last ? 'Start round 1' : 'Next', name: 'next', primary: true }];
        }
        case 'rounds':
          return [{ label: 'End round now', name: 'next' }];
        case 'gap':
          return [{ label: 'Start next round', name: 'next', primary: true }];
        case 'reveal':
          return [{ label: 'Next chain', name: 'next_chain' }, { label: 'Next link', name: 'next', primary: true }];
        case 'review':
          return [{ label: 'Close review', name: 'next', primary: true }];
        case 'check':
          return [{ label: v.check?.open ? 'Hide teacher check' : 'Teacher check', name: 'teacher_panel' }, { label: 'Send feedback', name: 'send', primary: true }];
        case 'done':
          return [{ label: 'Final scores', name: 'final', primary: true }];
      }
      return [];
    },
    dispose() {
      ring.stop();
      root.remove();
    }
  };
}

/* ── Phone ───────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'ac-phone');
  host.append(root);
  let mode = '';
  let p: ChainPhoneView | null = null;
  let seen = -1;
  let wager = 1;
  let lockTimer: ReturnType<typeof setTimeout> | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  /** What the student has typed this round, so a repaint never wipes it. */
  const typed: Record<string, string> = {};
  const draft = { fix: {} as Record<string, string>, unclear: new Set<string>(), star: '' };

  const btn = (label: string, cls: string, on: () => void, disabled = false) => {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', on);
    return b;
  };
  const send = (response: Record<string, unknown>, move: 'answer' | 'guess' | 'judge' = 'answer') => api.move({ item: CHAIN_ITEM, move, response });

  function strip(v: ChainPhoneView) {
    const now = v.phase === 'gap' ? v.round + 1 : v.round;
    const after = v.phase === 'reveal' || v.phase === 'review' || v.phase === 'check' || v.phase === 'done';
    return `<div class="ac-plan" aria-label="Your jobs this game">${v.plan
      .map((j, i) => `<span class="ac-job--${j} ${after || i < now ? 'is-done' : i === now ? 'is-now' : ''}"><b>${i + 1}</b>${JOB_SHORT[j]}</span>`)
      .join('')}</div>`;
  }
  const banner = (job: Job, line: string, extra = '') => `<div class="ac-role ac-job--${job}"><div class="ac-role__r">${JOB_NAME[job]}${extra}</div><div class="ac-role__d">${line}</div></div>`;
  function shell(v: ChainPhoneView, body: string) {
    root.className = 'ac-phone';
    if (v.team !== undefined) root.style.setProperty('--ac-team', teamColour(v.team));
    root.innerHTML = `${strip(v)}<div class="ac-pbody">${body}</div>`;
  }
  const field = (id: string, placeholder: string, max: number, area = false) => {
    const f = el(area ? 'textarea' : 'input', `gm-input ac-in${area ? ' ac-ta' : ''}`) as HTMLInputElement;
    f.id = id;
    f.placeholder = placeholder;
    f.maxLength = max;
    f.autocomplete = 'off';
    f.setAttribute('aria-label', placeholder);
    return f;
  };
  const onEnter = (f: HTMLElement, go: () => void) =>
    f.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        go();
      }
    });

  /** Keeps what's typed across repaints, and sends it to the room as they type, so it counts if time runs out. */
  function keep(f: HTMLInputElement, key: string, extra: () => Record<string, unknown> = () => ({})) {
    f.value = typed[key] ?? '';
    const push = () => void send({ act: 'draft', text: f.value, ...extra() }).catch(() => undefined);
    f.addEventListener('input', () => {
      typed[key] = f.value;
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(push, 500);
    });
    return push;
  }

  function writeScreen(v: ChainPhoneView) {
    const q = v.type === 'Q';
    const prompt = esc(v.prompt ?? '');
    shell(
      v,
      `${banner('write', q ? 'Your turn: write a <b>question</b> for your team.' : 'Your turn: write an <b>answer</b> for your team.')}<div class="ac-prompt">${
        q
          ? `<span class="ac-lead-in">If this is the answer…</span><div class="ac-big">${prompt}</div><span class="ac-ask">…what is the question?</span>`
          : `<span class="ac-lead-in">If this is the question…</span><div class="ac-q">${prompt}</div><span class="ac-ask">…what is the answer?</span>`
      }</div><p class="ac-hint">${q ? `Write a question whose answer is “${prompt}”. Your teammate sees only your question and has to answer it.` : 'One word or a short name. If time runs out, what you’ve typed goes in.'}</p>`
    );
    const f = field('ac-write', q ? 'Who…? What…? Which…? Why…?' : 'One word', q ? 140 : 30, q);
    keep(f, `w${v.round}`);
    root.querySelector('.ac-pbody')!.append(f);
    const go = () => {
      if (!f.value.trim()) return;
      api.sfx.lock?.();
      void send({ act: 'write', text: f.value }).catch((e) => api.toast(errText(e), 'bad'));
    };
    onEnter(f, go);
    api.setActions?.([btn(q ? 'Send question' : 'Lock in', 'btn--primary', go)]);
    f.focus({ preventScroll: true });
  }

  function shadowScreen(v: ChainPhoneView) {
    const who = esc(v.writer ?? 'your teammate');
    shell(
      v,
      `${banner('shadow', `<b>${who}</b> is answering this for your team. Answer it too, secretly. Don’t tell them.`)}<div class="ac-prompt"><span class="ac-lead-in">If this is the question…</span><div class="ac-q">${esc(v.prompt ?? '')}</div><span class="ac-ask">…what is the answer?</span></div><p class="ac-hint">Write the word you think ${who} will write. Same word: +3 × your bet. Different word: you lose your bet. How sure are you?</p>`
    );
    const pills = el('div', 'ac-pills');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Wager');
    for (const w of [1, 2, 3]) {
      const b = el('button', 'ac-pill', `${w}× (+${3 * w} / −${w})`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(wager === w));
      b.addEventListener('click', () => {
        wager = w;
        pills.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(i + 1 === w)));
        if (f.value.trim()) pushShadow();
      });
      pills.append(b);
    }
    const f = field('ac-shadow', 'One word', 30);
    const pushShadow = keep(f, `s${v.round}`, () => ({ wager }));
    root.querySelector('.ac-pbody')!.append(pills, f);
    const go = () => {
      if (!f.value.trim()) return;
      api.sfx.lock?.();
      void send({ act: 'shadow', text: f.value, wager }).catch((e) => api.toast(errText(e), 'bad'));
    };
    onEnter(f, go);
    api.setActions?.([btn('Lock in shadow', 'btn--primary', go)]);
  }

  function predictScreen(v: ChainPhoneView) {
    shell(
      v,
      `${banner('predict', 'Your team is writing. While you wait: guess where your chain will end.')}<div class="ac-prompt"><span class="ac-lead-in">Your chain starts at…</span><div class="ac-big">${esc(v.start)}</div><span class="ac-ask">…what word will it end on after ${v.links} links?</span></div><p class="ac-hint">+5 if you’re right.${v.predicted ? ` Locked: <b>${esc(v.predicted)}</b>. You can change it this round.` : ''}</p>`
    );
    const f = field('ac-predict', 'One word', 30);
    root.querySelector('.ac-pbody')!.append(f);
    const go = () => {
      if (!f.value.trim()) return;
      void send({ act: 'predict', text: f.value }).catch((e) => api.toast(errText(e), 'bad'));
    };
    onEnter(f, go);
    api.setActions?.([btn('Lock prediction', 'btn--primary', go)]);
  }

  function stealScreen(v: ChainPhoneView) {
    const s = v.steal;
    const extra = v.steals ? ` <small>${v.steals.now} of ${v.steals.of}</small>` : '';
    if (!s) {
      shell(v, `${banner('steal', 'Guess another team’s answer.', extra)}<div class="ac-wait"><b>Nothing to steal right now</b><p class="ac-hint">A new target appears as soon as another team has a new answer.</p></div>`);
      api.setActions?.([]);
      return;
    }
    const colour = teamColour(s.team);
    if (s.result) {
      const msg =
        s.result === 'captured'
          ? `<b class="ac-res" style="color:${colour}">It’s yours.</b><p>“${esc(s.word ?? '')}” now carries your team’s colour on the board.</p>`
          : s.result === 'gone'
            ? `<b class="ac-res">Cracked it!</b><p>${esc(s.by ?? 'Someone')} captured “${esc(s.word ?? '')}” first, but you got it too. +5</p>`
            : `<b class="ac-res">Safe… this time</b><p>Out of guesses. It was “${esc(s.word ?? '')}”.</p>`;
      shell(v, `${banner('steal', 'Guess another team’s answer.', extra)}<div class="ac-wait">${msg}</div>`);
      api.setActions?.([btn('Steal another', 'btn--primary', () => void api.control('next_target').catch((e) => api.toast(errText(e), 'bad')))]);
      return;
    }
    const blanks = s.letters.map((n) => `<span class="ac-word">${'<i></i>'.repeat(n)}</span>`).join('');
    const left = Math.max(0, s.lock - api.serverNow());
    shell(
      v,
      `${banner('steal', 'Guess another team’s answer. Right word: you capture it, +10.', extra)}<div class="ac-prompt ac-target" style="--ac-c:${colour}"><span class="ac-lead-in" style="color:${colour}">${esc(teamName(s.team))} were asked…</span><div class="ac-q">${esc(s.question)}</div><span class="ac-ask">…what did they answer?</span><div class="ac-blanks" aria-label="${s.letters.join(', ')} letters">${blanks}</div><span class="ac-hint">${s.letters.length > 1 ? `${s.letters.length} words: ` : ''}${s.letters.join(' + ')} letters</span></div><div class="ac-row"><span class="ac-hint">Type a real guess that fits the letters. ${s.tries_max} guesses.</span><span class="ac-tries" aria-label="${s.tries_max - s.tries} guesses left">${Array.from({ length: s.tries_max }, (_, i) => `<i class="${i < s.tries ? 'is-used' : ''}"></i>`).join('')}</span></div>`
    );
    root.style.setProperty('--ac-tint', colour);
    const f = field('ac-steal', 'Their answer', 30);
    const stealKey = `g${v.round}:${s.team}:${s.question}`;
    keep(f, stealKey);
    f.disabled = left > 0;
    root.querySelector('.ac-pbody')!.append(f);
    const go = () => {
      if (!f.value.trim() || f.disabled) return;
      typed[stealKey] = '';
      void send({ text: f.value }, 'guess')
        .then((r) => {
          if (r.correct === false) {
            api.sfx.wrong();
            if (!api.calm()) void animate(root.querySelector('.ac-target'), [{ transform: 'translateX(-0.5em)' }, { transform: 'translateX(0.5em)' }, { transform: 'none' }], { duration: 300 });
          }
        })
        .catch((e) => api.toast(errText(e), 'bad'));
    };
    onEnter(f, go);
    const cta = btn(left > 0 ? `Locked ${Math.ceil(left / 1000)}s` : 'CAPTURE', 'btn--primary ac-cta', go, left > 0);
    cta.style.setProperty('--ac-c', colour);
    api.setActions?.([cta]);
    if (left > 0) {
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        mode = '';
        if (p) render(p);
      }, Math.min(left, 1000) + 30);
    } else f.focus({ preventScroll: true });
  }

  function reviewScreen(v: ChainPhoneView) {
    const r = v.review!;
    if (r.sent) {
      shell(v, `<div class="ac-wait"><b>Review sent ✓</b><p class="ac-hint">Your feedback lands here once your teacher has checked.</p></div>`);
      api.setActions?.([]);
      return;
    }
    const flags = () => Object.keys(draft.fix).length + draft.unclear.size;
    const paint = () => {
      shell(
        v,
        `<div class="ac-role ac-job--review"><div class="ac-role__r">REVIEW</div><div class="ac-role__d">Anonymous. Fix or flag up to ${r.flags_max}, then star the most accurate.</div></div><div class="ac-counts"><span class="${flags() >= r.flags_max ? 'is-full' : ''}">Fix / unclear ${flags()}/${r.flags_max}</span><span class="${draft.star ? 'is-full' : ''}">★ ${draft.star ? 1 : 0}/1</span></div>`
      );
      const body = root.querySelector('.ac-pbody')!;
      for (const pair of r.pairs) {
        const f = pair.id in draft.fix;
        const u = draft.unclear.has(pair.id);
        const st = draft.star === pair.id;
        const card = el('div', `ac-rcard${f ? ' is-fix' : ''}${u ? ' is-unc' : ''}${st ? ' is-star' : ''}`);
        card.innerHTML = `<div class="ac-rcard__q">${esc(pair.q)}</div><div class="ac-rcard__a">${esc(pair.a)}</div>`;
        const acts = el('div', 'ac-ract');
        const mk = (label: string, on: boolean, cls: string, fn: () => void) => {
          const b = el('button', cls, label);
          b.type = 'button';
          b.setAttribute('aria-pressed', String(on));
          b.addEventListener('click', fn);
          acts.append(b);
        };
        mk('✎ Fix', f, 'is-fixb', () => {
          if (f) delete draft.fix[pair.id];
          else {
            if (flags() >= r.flags_max && !u) return api.toast(`${r.flags_max} flags max. Undo one first.`, 'bad');
            draft.unclear.delete(pair.id);
            draft.fix[pair.id] = '';
            if (draft.star === pair.id) draft.star = '';
          }
          paint();
          (root.querySelector(`[data-fix="${CSS.escape(pair.id)}"]`) as HTMLInputElement | null)?.focus();
        });
        mk('? Unclear', u, 'is-uncb', () => {
          if (u) draft.unclear.delete(pair.id);
          else {
            if (flags() >= r.flags_max && !f) return api.toast(`${r.flags_max} flags max. Undo one first.`, 'bad');
            delete draft.fix[pair.id];
            draft.unclear.add(pair.id);
            if (draft.star === pair.id) draft.star = '';
          }
          paint();
        });
        mk('★ Accurate', st, 'is-starb', () => {
          if (st) draft.star = '';
          else if (f || u) return api.toast('You can’t star one you’ve flagged.', 'bad');
          else draft.star = pair.id;
          paint();
        });
        card.append(acts);
        if (f) {
          const inp = field(`ac-fix-${pair.id}`, 'The better answer', 30);
          inp.dataset.fix = pair.id;
          inp.value = draft.fix[pair.id] ?? '';
          inp.addEventListener('input', () => (draft.fix[pair.id] = inp.value));
          card.append(inp);
        }
        body.append(card);
      }
      api.setActions?.([
        btn('Send review', 'btn--primary', () => {
          const empty = Object.entries(draft.fix).find(([, t]) => !t.trim());
          if (empty) {
            api.toast('Type your better answer for each fix.', 'bad');
            (root.querySelector(`[data-fix="${CSS.escape(empty[0])}"]`) as HTMLInputElement | null)?.focus();
            return;
          }
          void send({ fix: draft.fix, unclear: [...draft.unclear], ...(draft.star ? { star: draft.star } : {}) }, 'judge').catch((e) => api.toast(errText(e), 'bad'));
        })
      ]);
    };
    paint();
  }

  function feedbackScreen(v: ChainPhoneView) {
    const fb = v.feedback!;
    const own = fb.own
      .map((o) => {
        const good = o.verdict === 'clear' || o.verdict === 'stood';
        const text =
          o.kind === 'question'
            ? o.verdict === 'unclear'
              ? `${o.n} of ${o.seen} found it unclear. Try making it more specific.`
              : `Clear ✓ · ${o.n} of ${o.seen} found it unclear`
            : o.verdict === 'fixed'
              ? `${o.n} of ${o.seen} flagged “${esc(o.a)}”. Most suggested: <b>${esc(o.fix ?? '?')}</b>`
              : `“${esc(o.a)}” stood ✓`;
        return `<div class="ac-fb ${good ? 'is-good' : 'is-warn'}"><span class="ac-hint">${o.kind === 'question' ? 'Your question' : `Your answer to “${esc(o.q)}”`}</span>${o.kind === 'question' ? `<span>“${esc(o.q)}”</span>` : ''}<b>${text}</b></div>`;
      })
      .join('');
    const rev = fb.review
      .map((r) => {
        const head = r.kind === 'fix' ? `You fixed “${esc(r.a)}” → “${esc(r.mine ?? '')}”` : r.kind === 'unclear' ? `You flagged as unclear: “${esc(r.q)}”` : `You starred “${esc(r.a)}”`;
        return `<div class="ac-fb ${r.good ? 'is-good' : ''}"><span class="ac-hint">${head}</span><b>${esc(r.verdict)}</b></div>`;
      })
      .join('');
    shell(v, `<div class="ac-wait ac-wait--top"><b>Chains complete</b><p class="ac-hint">Your feedback is only on your phone.</p></div>${own ? `<span class="gl-eyebrow">Feedback on your links</span>${own}` : ''}${rev ? `<span class="gl-eyebrow">Your review</span>${rev}` : ''}`);
    api.setActions?.([]);
  }

  function notices(v: ChainPhoneView) {
    const list = v.notices;
    const top = list[list.length - 1]?.seq ?? 0;
    if (seen < 0) {
      seen = top;
      return;
    }
    // A full-screen takeover never covers someone mid-answer (20 Nov: it stopped writers finishing).
    const busy = v.phase === 'rounds' && (v.job === 'write' || v.job === 'shadow') && !v.done;
    for (const n of list as Notice[]) {
      if (n.seq <= seen) continue;
      if (n.kind === 'flash' || busy) api.toast(n.kind === 'flash' ? `${n.title} ${n.body}` : `${n.title} “${n.word ?? ''}” ${n.body}`, n.tone);
      else {
        boom(host, {
          kind: n.kind,
          title: n.title,
          word: n.word ?? '',
          line: `“${esc(n.word ?? '')}”`,
          sub: n.kind === 'captured' ? `${n.body}${n.team !== undefined ? ` · from ${teamName(n.team)}` : ''}` : n.body,
          colour: n.kind === 'captured' && n.team !== undefined ? teamColour(n.team) : 'var(--game-wrong, #d04a4a)',
          calm: api.calm(),
          big: false
        });
        if (n.kind === 'captured') api.sfx.coin();
        else api.sfx.buzz();
      }
    }
    seen = Math.max(seen, top);
  }

  function render(v: ChainPhoneView) {
    const s = v.steal;
    const key = [v.phase, v.howto?.step ?? '', v.round, v.job, v.done, v.predicted, s ? `${s.team}:${s.question}:${s.tries}:${s.result}:${s.lock > api.serverNow()}` : '-', v.review?.sent, v.review?.pairs.length, !!v.feedback].join('|');
    if (key === mode) return;
    mode = key;
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
    root.style.removeProperty('--ac-tint');
    if (v.phase === 'rounds') {
      if (v.done) {
        shell(v, `${banner(v.job ?? 'write', 'Done for this round.')}<div class="ac-wait"><b>Locked in ✓</b><p class="ac-hint">${v.job === 'shadow' ? 'Your shadow answer stays hidden until the round ends.' : 'Your link is in your team’s chain.'}</p></div>`);
        api.setActions?.([]);
      } else if (v.job === 'write') writeScreen(v);
      else if (v.job === 'shadow') shadowScreen(v);
      else if (v.job === 'predict') predictScreen(v);
      else stealScreen(v);
      return;
    }
    if (v.phase === 'howto' && v.howto) {
      const h = HOWTO_PHONE[v.howto.step] ?? HOWTO_PHONE[0]!;
      const last = v.howto.step >= v.howto.of - 1;
      const jobs = last
        ? `<div class="ac-myjobs">${[...new Set(v.plan)].map((j) => `<div class="ac-jobcard ac-job--${j}"><b>${JOB_NAME[j]}</b><span>${JOB_HOW[j]}</span></div>`).join('')}</div>`
        : '';
      shell(v, `<div class="ac-wait ac-wait--top"><span class="gl-eyebrow">How to play · ${v.howto.step + 1} of ${v.howto.of}</span><b>${esc(h.title)}</b><p class="ac-hint ac-hint--big">${esc(h.body)}</p><p class="ac-hint">Watch the board for the example.</p></div>${jobs}`);
      api.setActions?.([]);
      return;
    }
    if (v.phase === 'gap') {
      const next = v.plan[v.round + 1] ?? 'steal';
      shell(v, `<div class="ac-wait ac-job--${next}"><span class="gl-eyebrow">Next round, your job</span><div class="ac-next">${JOB_NAME[next]}</div><p class="ac-hint ac-hint--big">${JOB_HOW[next]}</p></div>`);
      api.setActions?.([]);
      return;
    }
    if (v.phase === 'reveal') {
      shell(v, `<div class="ac-wait"><b>Eyes on the board</b><p class="ac-hint">The chains are being revealed.</p></div>`);
      api.setActions?.([]);
      return;
    }
    if (v.phase === 'review' && v.review) return reviewScreen(v);
    if (v.phase === 'check') {
      shell(v, `<div class="ac-wait"><b>Your teacher is checking</b><p class="ac-hint">Feedback in a moment.</p></div>`);
      api.setActions?.([]);
      return;
    }
    if (v.phase === 'done' && v.feedback) feedbackScreen(v);
  }

  return {
    update(view) {
      const v = view.kind_view as ChainPhoneView | undefined;
      if (!v || v.who !== 'phone') return;
      p = v;
      render(v);
      notices(v);
    },
    dispose() {
      if (lockTimer) clearTimeout(lockTimer);
      if (draftTimer) clearTimeout(draftTimer);
      root.remove();
    }
  };
}

registerLiveKind('answer_chain', { board: mountBoard, phone: mountPhone });

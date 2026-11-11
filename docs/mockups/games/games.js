/* Game lessons mockups: shared runtime (mockup only, not product code).
 * Board scaling, mockup toolbar, sound, confetti, countdown, count-up, FLIP,
 * and a fake class so one person can click through a live game.
 */
(function () {
  const GM = {};
  window.GM = GM;

  // ── Fake class (invented initials) ───────────────────────────
  GM.class = ['AK','BL','CM','DN','EO','FP','GR','HS','IT','JW','KY','LZ','MB','NC','OD','PE','QF','RG','SH','TJ','UK','VL','WM','XN'];
  GM.me = 'JW';
  const AV = [['--pastel-blue','--pastel-blue-ink'],['--pastel-sage','--pastel-sage-ink'],['--pastel-peach','--pastel-peach-ink'],['--pastel-gold','--pastel-gold-ink'],['--pastel-lilac','--pastel-lilac-ink']];
  GM.avatarStyle = (initials) => {
    const i = [...initials].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
    return `background:var(${AV[i][0]});color:var(${AV[i][1]})`;
  };
  GM.teams = [
    { id: 't1', name: 'Kestrels', colour: 'var(--game-team-1)', soft: 'var(--game-team-1-soft)' },
    { id: 't2', name: 'Otters', colour: 'var(--game-team-2)', soft: 'var(--game-team-2-soft)' },
    { id: 't3', name: 'Foxes', colour: 'var(--game-team-3)', soft: 'var(--game-team-3-soft)' },
    { id: 't4', name: 'Herons', colour: 'var(--game-team-4)', soft: 'var(--game-team-4-soft)' }
  ];

  // Seeded random so demos replay the same way
  let seed = 7;
  GM.rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  GM.pick = (arr) => arr[Math.floor(GM.rand() * arr.length)];
  GM.shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(GM.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  GM.sleep = (ms) => new Promise((r) => setTimeout(r, GM.calm() ? Math.min(ms, 120) : ms));
  GM.$ = (sel, root = document) => root.querySelector(sel);
  GM.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  GM.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  GM.calm = () => document.body.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Board scaling ────────────────────────────────────────────
  function fitBoards() {
    GM.$$('.board-frame').forEach((f) => {
      const b = f.querySelector('.board');
      if (b) b.style.transform = `scale(${f.clientWidth / 1920})`;
    });
    GM.$$('.phone-frame').forEach((p) => {
      const room = window.innerHeight - 140;
      const s = Math.min(1, room / 864);
      p.style.transform = s < 1 ? `scale(${s})` : '';
      p.style.transformOrigin = 'top center';
      p.parentElement.style.height = s < 1 ? `${864 * s}px` : '';
    });
  }
  window.addEventListener('resize', fitBoards);
  GM.fit = fitBoards;

  // ── Mockup toolbar ───────────────────────────────────────────
  GM.toolbar = function ({ title, onRestart, note }) {
    const bar = GM.h(`<div class="mk-bar">
      <a href="index.html">← All games</a>
      <h1>${title}</h1>
      <span class="mk-seg" data-seg="view">
        <button data-v="both" aria-pressed="true">Board + phone</button>
        <button data-v="board">Board</button>
        <button data-v="phone">Phone</button>
      </span>
      <span class="gap"></span>
      <button class="mk-btn" data-t="theme" aria-pressed="false">Light board</button>
      <button class="mk-btn" data-t="calm" aria-pressed="false">Calm</button>
      <button class="mk-btn" data-t="sound" aria-pressed="true">Sound on</button>
      <button class="mk-btn" data-t="restart">Restart</button>
    </div>`);
    document.body.prepend(bar);
    if (note) bar.after(GM.h(`<p class="mk-note">${note}</p>`));
    document.body.dataset.view = 'both';
    bar.querySelector('[data-seg="view"]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      GM.$$('[data-seg="view"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      document.body.dataset.view = b.dataset.v; fitBoards();
    });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (b.dataset.t === 'restart') { onRestart ? onRestart() : location.reload(); return; }
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.t === 'theme') GM.$$('.board').forEach((x) => x.dataset.boardTheme = on ? 'light' : 'dark');
      if (b.dataset.t === 'calm') document.body.classList.toggle('calm', on);
      if (b.dataset.t === 'sound') { GM.sound.on = on; b.textContent = on ? 'Sound on' : 'Sound off'; }
    });
    requestAnimationFrame(fitBoards);
    setTimeout(fitBoards, 200);
  };

  // ── Sound: WebAudio synth, board only in product ─────────────
  let ctx;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, { type = 'sine', gain = .14, at = 0, slide } = {}) {
    if (!GM.sound.on) return;
    try {
      const c = ac(), t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
    } catch (_) { /* audio blocked */ }
  }
  GM.sound = {
    on: true,
    tick: () => tone(880, .05, { type: 'square', gain: .04 }),
    lock: () => { tone(520, .08, { type: 'triangle' }); tone(780, .1, { type: 'triangle', at: .06 }); },
    right: () => { tone(660, .12, { type: 'triangle' }); tone(990, .2, { type: 'triangle', at: .1 }); },
    wrong: () => tone(220, .3, { type: 'sawtooth', gain: .06, slide: 140 }),
    reveal: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, .35, { type: 'triangle', at: i * .07, gain: .1 })); },
    fanfare: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .28, { type: 'triangle', at: i * .12, gain: .12 })); },
    whoosh: () => tone(300, .35, { type: 'sine', gain: .08, slide: 1400 }),
    click: () => tone(1500, .02, { type: 'square', gain: .03 }),
    ding: () => { tone(1320, .4, { gain: .1 }); tone(1980, .3, { gain: .05, at: .01 }); },
    buzz: () => tone(110, .45, { type: 'square', gain: .07 }),
    coin: () => { tone(988, .07, { type: 'square', gain: .05 }); tone(1319, .18, { type: 'square', gain: .05, at: .07 }); }
  };

  // ── Confetti (one canvas, ≤150 pieces, 1.8 s) ────────────────
  GM.confetti = function (host) {
    if (GM.calm()) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti';
    cv.width = host.clientWidth || 1920; cv.height = host.clientHeight || 1080; host.appendChild(cv);
    const g = cv.getContext('2d');
    const cols = ['#f2c14e', '#5b8fd6', '#4f9a72', '#e0894a', '#a585cf', '#ffffff'];
    const ps = Array.from({ length: 150 }, () => ({ x: cv.width / 2 + (Math.random() - .5) * 300, y: cv.height * .55, vx: (Math.random() - .5) * 26, vy: -Math.random() * 30 - 12, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4, w: 10 + Math.random() * 12, h: 6 + Math.random() * 8, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 1800; g.clearRect(0, 0, cv.width, cv.height);
      ps.forEach((p) => { p.vy += .9; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.globalAlpha = Math.max(0, 1 - k * k); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  };

  // ── Countdown ring + phone bar ───────────────────────────────
  GM.ring = function (el, seconds, { onEnd, bar } = {}) {
    const C = 2 * Math.PI * 56;
    el.classList.add('ring');
    el.innerHTML = `<svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="56"/><circle class="fill" cx="66" cy="66" r="56" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><span>${seconds}</span>`;
    const fill = el.querySelector('.fill'), num = el.querySelector('span');
    const end = performance.now() + seconds * 1000; let last = seconds, stopped = false, raf;
    (function loop(t) {
      if (stopped) return;
      const left = Math.max(0, end - t), s = Math.ceil(left / 1000);
      fill.style.strokeDashoffset = String(C * (1 - left / (seconds * 1000)));
      const b = typeof bar === 'function' ? bar() : bar; if (b) b.style.transform = `scaleX(${left / (seconds * 1000)})`;
      if (s !== last) { last = s; num.textContent = s; if (s <= 5 && s > 0) GM.sound.tick(); el.classList.toggle('low', s <= 10); }
      if (left <= 0) { onEnd && onEnd(); return; }
      raf = requestAnimationFrame(loop);
    })(performance.now());
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  };

  // ── Count-up ─────────────────────────────────────────────────
  GM.countUp = function (el, from, to, ms = 700) {
    if (GM.calm()) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e).toLocaleString(); if (k < 1) requestAnimationFrame(f); })(t0);
  };

  // ── FLIP reorder ─────────────────────────────────────────────
  GM.flip = function (container, mutate) {
    const kids = [...container.children], first = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
    mutate();
    if (GM.calm()) return;
    [...container.children].forEach((k) => {
      const a = first.get(k); if (!a) return; const b = k.getBoundingClientRect();
      const s = container.closest('.board') ? (b.width / k.offsetWidth || 1) : 1;
      const dy = (a.top - b.top) / s;
      if (dy) k.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
  };

  // ── Fly an element's clone from A to B (board coords) ────────
  GM.flyTo = function (node, from, to, { duration = 800, scale = 1 } = {}) {
    if (GM.calm()) return Promise.resolve();
    const a = node.animate([
      { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 160}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: .55 },
      { transform: `translate(${to.x}px, ${to.y}px) scale(${scale})`, opacity: .2 }
    ], { duration, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    return a.finished;
  };

  GM.toast = function (phone, html, kind = '') {
    let t = phone.querySelector('.ph-toast');
    if (!t) { t = GM.h('<div class="ph-toast"></div>'); phone.appendChild(t); }
    t.className = `ph-toast ${kind}`; t.innerHTML = html;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  };

  // Standard page scaffold: board left, phone right
  GM.scaffold = function ({ title, note, code = '482 913', onRestart }) {
    const stage = GM.h(`<div class="mk-stage">
      <div class="mk-col mk-board-col mk-board-wrap"><span class="mk-label">Board (projector, 1920×1080)</span>
        <div class="board-frame"><div class="board" data-board-theme="dark">
          <div class="board-top"><span class="board-title">${title}</span><span class="board-code">Join at class.adam-russell.com · <b>${code}</b></span></div>
        </div></div>
      </div>
      <div class="mk-col mk-phone-col mk-phone-wrap"><span class="mk-label">Student phone (390)</span>
        <div><div class="phone-frame"><div class="phone"></div></div></div>
      </div>
    </div>`);
    document.body.appendChild(stage);
    GM.toolbar({ title, note, onRestart });
    return { board: GM.$('.board', stage), phone: GM.$('.phone', stage) };
  };
})();

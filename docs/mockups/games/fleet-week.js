/* Fleet week mockup (mockup only, not product code).
 * Nine screens behind a hash: #place #fire #report #damage #recall #signals
 * #control #editor #reveal. Canvas draws the sea, islands, ships, fog, shells,
 * fire and smoke; DOM motion is transform and opacity only. Calm (or the
 * system's reduced-motion setting) draws one still frame and skips motion.
 * Everything here is invented: the novella, its people, the questions, the class.
 */
(function () {
  const { $, $$, h } = GM;
  GM.sound.on = false; // phones are silent in product; the board reveal has no sound in this mockup
  const calm = (el) => GM.calm() || !!(el && el.closest && el.closest('.fw-rm'));
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const anim = (el, kf, o) => (el && !calm(el) ? el.animate(kf, Object.assign({ easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }, o)) : null);

  // ── Content: The Lighthouse Keeper's Daughter (invented) ─────
  const COLS = [['1', 'Ada'], ['2', 'Bram'], ['3', 'Cora'], ['4', 'Dov'], ['5', 'Esme']];
  const ROWS = [['A', 'Fear'], ['B', 'Pride'], ['C', 'Home'], ['D', 'Loss'], ['E', 'Hope']];
  const ID = (r, c) => ROWS[r][0] + COLS[c][0];
  const RC = (id) => ['ABCDE'.indexOf(id[0]), Number(id[1]) - 1];
  const ALL = ROWS.flatMap((_, r) => COLS.map((__, c) => ID(r, c)));
  const about = (id) => { const [r, c] = RC(id); return `${ROWS[r][1]} × ${COLS[c][1]}`; };
  const V = (q, key, tags) => ({ q, key, tags: tags || null });
  // Q[id] = [variant A, variant B]; tags default to the square's theme and character.
  const Q = {
    A1: [V('What does Ada count on the tower stairs to stop herself panicking?', 'the steps'), V('Which sound does Ada say frightens her more than thunder?', 'the foghorn stopping')],
    A2: [V('What does Bram hide in the oil store so that Ada will not read it?', 'the letter from the board'), V('What is Bram afraid the inspector will find in the logbook?', 'a night with no entry')],
    A3: [V('Why will Cora not cross to Gull Rock by boat?', 'her husband drowned on the crossing'), V('What does Cora call the sea in chapter 2?', 'the thief')],
    A4: [V('Where does Dov hide during the first storm?', 'under the upturned boat'), V('Which room does Dov pretend he is not afraid of?', 'the lamp room')],
    A5: [V('What does Esme admit she fears on the night of the wreck?', 'being useless'), V('What does Esme grip when the light fails?', 'her pocket torch')],
    B1: [V('Which job does Ada refuse to hand back once her father lets her do it?', 'winding the clockwork'), V('What does Ada polish every morning to prove she can keep the light?', 'the brass rail')],
    B2: [V('What does Bram refuse to take from the harbour town?', 'Cora’s money'), V('What does Bram say no machine can ever do?', 'keep watch')],
    B3: [V('Which object does Cora refuse to sell, even when the shop is failing?', 'the old brass lens'), V('What does Cora keep in the shop window although nobody will ever buy it?', 'the old lighthouse lens')],
    B4: [V('Where does Dov boast he can row to in under an hour?', 'Gull Rock'), V('Which prize does Dov win at the regatta?', 'the silver oar')],
    B5: [V('What does Esme call the lighthouse in her report?', 'a relic'), V('Which word does Esme use for keepers like Bram?', 'romantics')],
    C1: [V('Which room does Ada call the only home she has known?', 'the lamp room'), V('What does Ada carve into the window frame?', 'the tide times')],
    C2: [V('What does Bram plant on the rock to make it feel like home?', 'rosemary'), V('Which object from the old cottage does Bram keep by the stove?', 'the kettle')],
    C3: [V('What does Cora offer Ada in the harbour town?', 'the room above the shop'), V('Which smell does Cora say means home?', 'tar and bread')],
    C4: [V('Where does Dov sleep after his father turns him out?', 'the boat shed'), V('', '')],
    C5: [V('What does Esme miss most about the mainland?', 'the trains'), V('Where does Esme say a keeper’s real home should be?', 'ashore')],
    D1: [V('What did Ada lose the winter she turned nine?', 'her mother'), V('What is torn from Ada’s hands in the storm?', 'the logbook')],
    D2: [V('What does Bram lose in the final chapter?', 'his post as keeper'), V('Which letter tells Bram the light will be automated?', 'the letter from the board', [])],
    D3: [V('What did Cora lose to the sea?', 'her husband'), V('What does Cora sell to pay for the boat repairs?', 'her ring')],
    D4: [V('Which boat does Dov lose in the storm?', 'the Kittiwake'), V('Who does Dov fail to reach in the wreck?', 'the cook')],
    D5: [V('What does Esme lose overboard on her first crossing?', 'her notebook'), V('What does Esme give up at the end?', 'her report')],
    E1: [V('What does Ada light at the window each night?', 'a candle'), V('What does Ada write on the last page of the logbook?', 'light kept')],
    E2: [V('What does Bram hope Ada will do when the light goes out?', 'go to school ashore'), V('What does Bram promise Ada on the gallery?', 'she will see the new light lit')],
    E3: [V('What does Cora hope to open in the old customs house?', 'a school'), V('Who does Cora write to for help?', 'the harbour master')],
    E4: [V('Which job does Dov hope to win from the harbour master?', 'pilot'), V('What does Dov build from the wreck timber?', 'a new boat')],
    E5: [V('', ''), V('', '')]
  };
  const RECALL = [
    { ship: 'Frigate (3)', line: 'The light is not mine to put out.' },
    { ship: 'Destroyer I (2)', line: 'Every lamp is a promise to a stranger.' },
    { ship: 'Destroyer II (2)', line: '' },
    { ship: 'Cutter (1)', line: 'salt in the ink' }
  ];

  // ── Icons ────────────────────────────────────────────────────
  const ANCHOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.8" r="2.2"/><path d="M12 7v14M7.5 10.5h9M4.6 13.6c.5 4 3.6 7.4 7.4 7.4s6.9-3.4 7.4-7.4"/><path d="M3.2 15.4l1.4-1.8 1.9 1.4M20.8 15.4l-1.4-1.8-1.9 1.4"/></svg>';
  const SHIP_SVG = '<svg viewBox="0 0 64 26" aria-hidden="true"><path d="M2 18h6M0 22h10" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round"/><path d="M12 15h46l-6 8H18z" fill="#f4f6fb"/><path d="M12 15h46l-1.5 2H13z" fill="#e5482f"/><rect x="26" y="8" width="16" height="7" rx="1.5" fill="#cfd8e6"/><rect x="31" y="2" width="5" height="7" rx="1" fill="#17375e"/><circle cx="34" cy="0" r="2.6" fill="rgba(200,206,216,.8)"/><circle cx="29" cy="-3" r="3.4" fill="rgba(200,206,216,.55)"/></svg>';
  const MK = {
    hit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#e5482f" stroke="#fff" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
    miss: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="rgba(10,21,54,.25)" stroke="#fff" stroke-width="2.4"/><circle cx="12" cy="12" r="3.4" fill="#fff"/></svg>',
    dud: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="rgba(10,21,54,.6)" stroke="#c9d1db" stroke-width="2" stroke-dasharray="3.5 2.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.2" fill="#fff"/></svg>',
    pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="rgba(242,193,78,.22)" stroke="#f2c14e" stroke-width="2.4" stroke-dasharray="4 3"/><circle cx="12" cy="12" r="2.6" fill="#f2c14e"/></svg>',
    back: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f2c14e" stroke="#0a1536" stroke-width="1.2"/><path d="M7.6 12.6a4.6 4.6 0 1 0 1.6-4.1" fill="none" stroke="#0a1536" stroke-width="2.2" stroke-linecap="round"/><path d="M8.8 5.4l.6 3.4-3.4.5" fill="none" stroke="#0a1536" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    aim: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="#f2c14e" stroke-width="2.5"/><path d="M20 2v9M20 29v9M2 20h9M29 20h9" stroke="#f2c14e" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="20" r="2.5" fill="#f2c14e"/></svg>',
    sonar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.4" fill="#7fe6dc"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" fill="none" stroke="#7fe6dc" stroke-width="1.8" stroke-linecap="round"/></svg>',
    watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  const MARK_WORD = { hit: 'hit', miss: 'miss', dud: 'dud, still unknown', pending: 'shell on its way', back: 'returning to you today' };

  // ── Seeded random ────────────────────────────────────────────
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── Sea painter: base water, islands on grid corners, grid lines ─
  function paintSea(g, W, H, R, islands, grid) {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#15628a'); gr.addColorStop(1, '#0b3a57');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 28; i++) {
      const x = R() * W, y = R() * H, r = (0.12 + R() * 0.3) * Math.max(W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, R() < 0.5 ? 'rgba(40,130,170,.16)' : 'rgba(4,28,48,.2)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let i = 0; i < 90; i++) { const x = R() * W, y = R() * H, l = 4 + R() * 10; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 1.5, x + l, y); g.stroke(); }
    islands.forEach((is) => {
      const { x, y, r } = is;
      const sh = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3.3);
      sh.addColorStop(0, 'rgba(98,214,200,.62)'); sh.addColorStop(0.45, 'rgba(63,184,176,.28)'); sh.addColorStop(1, 'rgba(63,184,176,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(x, y, r * 3.3, 0, 7); g.fill();
      g.fillStyle = '#e6d5a2'; blob(g, x, y, r * 1.28, is.pts); g.fill();
      g.fillStyle = '#5b8a4a'; blob(g, x, y, r, is.pts); g.fill();
      g.fillStyle = '#719f58'; blob(g, x - r * 0.18, y - r * 0.2, r * 0.55, is.pts); g.fill();
      if (is.tree) { g.fillStyle = '#3f6b37'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.1, r * 0.22, 0, 7); g.fill(); }
    });
    if (grid) {
      const s = W / 5; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(i * s + 0.5, 0); g.lineTo(i * s + 0.5, H); g.stroke(); g.beginPath(); g.moveTo(0, i * s + 0.5); g.lineTo(W, i * s + 0.5); g.stroke(); }
    }
  }
  function blob(g, x, y, r, pts) {
    g.beginPath();
    pts.forEach((p, i) => { const a = (i / pts.length) * Math.PI * 2, rr = r * p; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath();
  }
  function makeIslands(R, W, H, corners) {
    return corners.map(([x, y]) => ({ x, y, r: Math.min(W, H) * 0.026 + R() * Math.min(W, H) * 0.008, pts: Array.from({ length: 9 }, () => 0.78 + R() * 0.3), tree: R() < 0.6 }));
  }

  // ── Ship painter (top-down) ─────────────────────────────────
  const TONES = {
    mine: { hull: '#efe6d2', deck: '#d9c9a6', trim: '#f68620', top: '#8a6b3d' },
    partner: { hull: '#d6dde7', deck: '#b8c4d4', trim: '#5b8fd6', top: '#4b5d78' },
    teamA: { hull: '#d7e3f4', deck: '#b3c6e2', trim: '#5b8fd6', top: '#2f4a72' },
    teamB: { hull: '#dcebe1', deck: '#b7d2c1', trim: '#4f9a72', top: '#2f5a43' },
    sunk: { hull: '#5b5452', deck: '#3d3736', trim: '#1e1a1a', top: '#2a2524' }
  };
  function drawShip(g, cx, cy, n, horiz, s, tone, alpha = 1, tilt = 0) {
    const T = TONES[tone] || TONES.partner, L = n * s - s * 0.24, w = s * (n === 1 ? 0.4 : 0.48);
    g.save(); g.globalAlpha *= alpha; g.translate(cx, cy); if (!horiz) g.rotate(Math.PI / 2); g.rotate(tilt);
    const hull = (k) => { const l = L * k, ww = w * k; g.beginPath(); g.moveTo(-l / 2, -ww * 0.42); g.lineTo(l / 2 - ww * 0.95, -ww / 2); g.quadraticCurveTo(l / 2 - ww * 0.15, -ww * 0.42, l / 2, 0); g.quadraticCurveTo(l / 2 - ww * 0.15, ww * 0.42, l / 2 - ww * 0.95, ww / 2); g.lineTo(-l / 2, ww * 0.42); g.quadraticCurveTo(-l / 2 - ww * 0.14, 0, -l / 2, -ww * 0.42); g.closePath(); };
    g.save(); g.translate(s * 0.05, s * 0.07); hull(1); g.fillStyle = 'rgba(0,10,25,.32)'; g.fill(); g.restore();
    hull(1.08); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    hull(1); g.fillStyle = T.hull; g.fill(); g.strokeStyle = T.trim; g.lineWidth = Math.max(1.2, s * 0.035); g.stroke();
    hull(0.72); g.fillStyle = T.deck; g.fill();
    const sw = Math.min(L * 0.32, s * 0.7);
    g.fillStyle = T.top; g.beginPath(); roundRect(g, -sw / 2 - s * 0.05, -w * 0.2, sw, w * 0.4, w * 0.08); g.fill();
    g.fillStyle = T.hull; g.beginPath(); g.arc(-s * 0.05, 0, w * 0.1, 0, 7); g.fill();
    const tur = (x, dir) => { g.fillStyle = T.top; g.beginPath(); g.arc(x, 0, w * 0.17, 0, 7); g.fill(); g.strokeStyle = T.top; g.lineWidth = w * 0.08; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + dir * w * 0.42, 0); g.stroke(); };
    if (n >= 2) { tur(L / 2 - w * 1.1, 1); tur(-L / 2 + w * 0.55, -1); }
    if (n >= 3) tur(L / 2 - w * 1.65, 1);
    g.restore();
  }
  function roundRect(g, x, y, w, hh, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ── Particles: fire, smoke, droplets ─────────────────────────
  function emitFire(P, x, y, s, dt) {
    const nF = Math.random() < dt * 34 ? 1 : 0, nS = Math.random() < dt * 7 ? 1 : 0;
    for (let i = 0; i < nF + (Math.random() < dt * 20 ? 1 : 0); i++) P.push({ t: 'f', x: x + (Math.random() - 0.5) * s * 0.26, y: y + (Math.random() - 0.5) * s * 0.18, vx: (Math.random() - 0.5) * s * 0.12, vy: -s * (0.35 + Math.random() * 0.45), life: 0, max: 0.45 + Math.random() * 0.35, r: s * (0.05 + Math.random() * 0.05) });
    for (let i = 0; i < nS; i++) P.push({ t: 's', x: x + (Math.random() - 0.5) * s * 0.2, y: y - s * 0.1, vx: s * (0.12 + Math.random() * 0.1), vy: -s * (0.22 + Math.random() * 0.15), life: 0, max: 2 + Math.random() * 1.2, r: s * (0.06 + Math.random() * 0.04) });
  }
  function stepParticles(P, dt) {
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.life += dt; if (p.life > p.max) { P.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.t === 'd') p.vy += p.g * dt; if (p.t === 'b') p.x += Math.sin(p.life * 6 + p.ph) * 0.3; }
    if (P.length > 700) P.splice(0, P.length - 700);
  }
  function drawParticles(g, P) {
    P.forEach((p) => {
      if (p.t !== 's') return; const k = p.life / p.max, r = p.r * (1 + k * 2.6);
      g.fillStyle = `rgba(${70 + k * 60 | 0},${74 + k * 60 | 0},${82 + k * 60 | 0},${0.5 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    P.forEach((p) => {
      if (p.t !== 'f') return; const k = p.life / p.max;
      g.fillStyle = k < 0.3 ? `rgba(255,240,180,${0.9 - k})` : k < 0.65 ? `rgba(255,160,60,${0.85 - k * 0.6})` : `rgba(220,70,40,${0.6 * (1 - k)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7); g.fill();
    });
    g.restore();
    P.forEach((p) => {
      if (p.t === 'd') { const k = p.life / p.max; g.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      if (p.t === 'b') { const k = p.life / p.max; g.strokeStyle = `rgba(220,245,255,${0.8 * (1 - k)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke(); }
    });
  }
  function staticFire(g, x, y, s) {
    [[0.2, -0.32, 0.17], [0.32, -0.55, 0.2], [0.08, -0.2, 0.13]].forEach(([dx, dy, r]) => { g.fillStyle = 'rgba(80,84,92,.42)'; g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); });
    const rg = g.createRadialGradient(x, y, 0, x, y, s * 0.36);
    rg.addColorStop(0, 'rgba(255,230,150,.95)'); rg.addColorStop(0.4, 'rgba(255,140,50,.7)'); rg.addColorStop(1, 'rgba(229,72,47,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, s * 0.36, 0, 7); g.fill();
  }

  // ── Chart: canvas sea + 5×5 DOM buttons ─────────────────────
  const CHARTS = new Set();
  let raf = 0, lastT = 0;
  function tick(now) {
    raf = 0; const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now; let live = false;
    CHARTS.forEach((c) => { if (!c.cv.isConnected) { c.dispose(); return; } if (c.visible()) { c.step(dt); c.draw(now / 1000); live = true; } });
    if (live && !GM.calm()) raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (GM.calm()) { CHARTS.forEach((c) => { if (c.cv.isConnected && c.visible()) c.draw(0); }); return; }
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }

  class Chart {
    constructor(host, o) {
      this.o = Object.assign({ seed: 3, fog: 0, ships: [], marks: {}, tags: {}, fires: [], sonar: null, interactive: false, shipAlpha: 1, label: 'Chart' }, o);
      this.fog = this.o.fog; this.shipAlpha = this.o.shipAlpha; this.P = []; this.shells = []; this.rings = []; this.drops = [];
      host.innerHTML = `<div class="fw-chart ${this.o.interactive ? '' : 'static'}">
        <div class="fw-cols" aria-hidden="true">${COLS.map(([n, c]) => `<span><b>${n}</b><small>${c}</small></span>`).join('')}</div>
        <div class="fw-rows" aria-hidden="true">${ROWS.map(([n, c]) => `<span><b>${n}</b><small>${c}</small></span>`).join('')}</div>
        <div class="fw-sea"><canvas aria-hidden="true"></canvas><div class="fw-cells" role="group" aria-label="${this.o.label}">${ALL.map((id) => `<button class="fw-cell" data-id="${id}" ${this.o.interactive ? '' : 'tabindex="-1"'}></button>`).join('')}</div></div>
      </div>`;
      this.el = $('.fw-chart', host); this.sea = $('.fw-sea', this.el); this.cv = $('canvas', this.sea); this.g = this.cv.getContext('2d');
      this.cellsEl = $('.fw-cells', this.el);
      const R = rng(this.o.seed);
      const corners = []; const pool = [];
      for (let i = 1; i < 5; i++) for (let j = 1; j < 5; j++) pool.push([i, j]);
      for (let k = 0; k < 4; k++) corners.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
      if (R() < 0.7) corners.push([R() < 0.5 ? 0 : 5, 1 + Math.floor(R() * 4)]);
      this.cornerSpec = corners; this.seedR = this.o.seed;
      this.glints = Array.from({ length: 46 }, () => ({ x: R(), y: R(), l: 0.012 + R() * 0.02, ph: R() * 6.28, sp: 0.6 + R() * 1.3 }));
      this.fogBlobs = Array.from({ length: 16 }, () => ({ x: R(), y: R(), r: 0.18 + R() * 0.22, sp: 0.006 + R() * 0.01, d: R() < 0.3 }));
      this.renderMarks();
      if (this.o.interactive) {
        this.cellsEl.addEventListener('click', (e) => { const b = e.target.closest('.fw-cell'); if (b && this.o.onTap) this.o.onTap(b.dataset.id, b); });
        this.cellsEl.addEventListener('pointerover', (e) => { const b = e.target.closest('.fw-cell'); if (b && e.pointerType === 'mouse' && this.o.onHover) this.o.onHover(b.dataset.id); });
        this.cellsEl.addEventListener('pointerleave', () => this.o.onHover && this.o.onHover(null));
      }
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.sea);
      CHARTS.add(this); this.resize();
    }
    dispose() { this.ro.disconnect(); CHARTS.delete(this); }
    visible() { return this.cv.offsetParent !== null && this.W > 0; }
    resize() {
      const W = this.sea.clientWidth; if (!W) return;
      this.W = W; this.s = W / 5; const d = DPR();
      this.cv.width = Math.round(W * d); this.cv.height = Math.round(W * d);
      this.base = document.createElement('canvas'); this.base.width = this.cv.width; this.base.height = this.cv.height;
      const bg = this.base.getContext('2d'); bg.scale(d, d);
      const R = rng(this.seedR * 7 + 1);
      this.islands = makeIslands(R, W, W, this.cornerSpec.map(([i, j]) => [i * this.s, j * this.s]));
      paintSea(bg, W, W, R, this.islands, true);
      this.fogC = document.createElement('canvas'); this.fogC.width = this.cv.width; this.fogC.height = this.cv.height;
      this.draw(GM.calm() ? 0 : performance.now() / 1000); kick();
    }
    center(id) { const [r, c] = RC(id); return { x: (c + 0.5) * this.s, y: (r + 0.5) * this.s }; }
    cell(id) { return $(`.fw-cell[data-id="${id}"]`, this.cellsEl); }
    renderMarks() {
      $$('.fw-cell', this.cellsEl).forEach((b) => {
        const id = b.dataset.id, m = this.o.marks[id], tag = this.o.tags[id];
        const cls = m === 'pending' ? 'fw-pending' : m === 'back' ? 'fw-back-mk' : '';
        b.innerHTML = (m ? `<span class="fw-mk ${cls}">${MK[m]}</span>` : '') + (tag ? `<span class="fw-tag">${tag}</span>` : '') + (this.aimAt === id ? `<span class="fw-reticle">${MK.aim}</span>` : '');
        b.setAttribute('aria-label', `${id}, ${about(id)}${m ? `: ${MARK_WORD[m]}` : ''}`);
      });
      $$('.fw-sonar', this.sea).forEach((n) => n.remove());
      if (this.o.sonar) {
        const isRow = /[A-E]/.test(this.o.sonar), k = isRow ? 'ABCDE'.indexOf(this.o.sonar) : Number(this.o.sonar) - 1;
        const band = h(`<span class="fw-sonar ${isRow ? '' : 'col'}" style="${isRow ? `top:${k * 20}%` : `left:${k * 20}%`}"></span>`);
        this.sea.insertBefore(band, this.cellsEl);
      }
    }
    setMarks(marks, tags) { this.o.marks = marks; if (tags) this.o.tags = tags; this.renderMarks(); kick(); }
    aim(id) { this.aimAt = id; this.renderMarks(); }
    preview(cells, bad) { $$('.fw-cell', this.cellsEl).forEach((b) => b.classList.remove('ghost', 'bad')); (cells || []).forEach((id) => { const b = this.cell(id); if (b) b.classList.add(bad ? 'bad' : 'ghost'); }); }
    setShips(ships) { this.o.ships = ships; kick(); }
    drop(cells) { // a ship settles into place: ring and droplets
      if (calm(this.el)) return; cells.forEach((id) => { const c = this.center(id); this.rings.push({ x: c.x, y: c.y, life: 0, max: 0.6, r0: this.s * 0.1, r1: this.s * 0.55 }); }); kick();
    }
    fire(id, done) { // shell arc from the bottom edge to a square, then a splash
      if (calm(this.el)) { done && done(); return; }
      const to = this.center(id); this.shells.push({ fx: this.W / 2, fy: this.W + this.s * 0.6, tx: to.x, ty: to.y, life: 0, max: 1.05, done }); kick();
    }
    splash(x, y) {
      this.rings.push({ x, y, life: 0, max: 0.8, r0: this.s * 0.08, r1: this.s * 0.5 });
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, v = this.s * (0.6 + Math.random() * 0.9); this.P.push({ t: 'd', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.s * 0.8, g: this.s * 3.2, life: 0, max: 0.55 + Math.random() * 0.3, r: this.s * (0.018 + Math.random() * 0.02) }); }
    }
    step(dt) {
      const fires = this.o.fires.length ? this.o.fires : Object.keys(this.o.marks).filter((k) => this.o.marks[k] === 'hit');
      fires.forEach((id) => { const c = this.center(id); emitFire(this.P, c.x, c.y, this.s, dt); });
      stepParticles(this.P, dt);
      this.shells.forEach((sh) => { sh.life += dt; if (sh.life >= sh.max && !sh.landed) { sh.landed = true; this.splash(sh.tx, sh.ty); sh.done && sh.done(); } });
      this.shells = this.shells.filter((sh) => !sh.landed);
      this.rings.forEach((r) => (r.life += dt)); this.rings = this.rings.filter((r) => r.life < r.max);
    }
    draw(t) {
      const g = this.g, W = this.W, s = this.s, d = DPR(), still = calm(this.el);
      if (!W || !this.base) return;
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.base, 0, 0); g.setTransform(d, 0, 0, d, 0, 0);
      // glints
      this.glints.forEach((p) => {
        const a = still ? 0.18 : Math.pow(Math.max(0, Math.sin(t * p.sp + p.ph)), 3) * 0.5;
        if (a < 0.02) return; const x = ((p.x * W + (still ? 0 : t * 4)) % W), y = p.y * W;
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + p.l * W, y); g.stroke();
      });
      // surf around each island
      this.islands.forEach((is, i) => {
        g.save(); g.setLineDash([s * 0.06, s * 0.045]); g.lineDashOffset = still ? 0 : -t * 12 - i * 5;
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1.2, s * 0.025); g.beginPath(); g.arc(is.x, is.y, is.r * 1.55, 0, 7); g.stroke(); g.restore();
        const br = is.r * (1.95 + (still ? 0 : Math.sin(t * 1.4 + i) * 0.16));
        g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1; g.beginPath(); g.arc(is.x, is.y, br, 0, 7); g.stroke();
      });
      // ships
      if (this.shipAlpha > 0) this.o.ships.forEach((sh) => {
        const a = this.center(sh.cells[0]), b = this.center(sh.cells[sh.cells.length - 1]);
        const horiz = sh.cells.length === 1 ? true : sh.cells[0][0] === sh.cells[1][0];
        drawShip(g, (a.x + b.x) / 2, (a.y + b.y) / 2, sh.cells.length, horiz, s, sh.tone, this.shipAlpha * (sh.alpha ?? 1));
      });
      // fog, with clear holes over squares already known
      if (this.fog > 0.001) {
        const f = this.fogC.getContext('2d'); f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, this.fogC.width, this.fogC.height); f.setTransform(d, 0, 0, d, 0, 0);
        f.fillStyle = 'rgba(206,216,226,.62)'; f.fillRect(0, 0, W, W);
        this.fogBlobs.forEach((b) => {
          const r = b.r * W, span = W + 2 * r, x = ((b.x * span + (still ? 0 : t * b.sp * W)) % span) - r, y = b.y * W;
          const rg = f.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, b.d ? 'rgba(150,164,182,.4)' : 'rgba(244,247,250,.7)'); rg.addColorStop(1, 'rgba(244,247,250,0)');
          f.fillStyle = rg; f.beginPath(); f.arc(x, y, r, 0, 7); f.fill();
        });
        f.globalCompositeOperation = 'destination-out';
        Object.keys(this.o.marks).forEach((id) => {
          if (!/hit|miss/.test(this.o.marks[id])) return; const c = this.center(id);
          const rg = f.createRadialGradient(c.x, c.y, s * 0.15, c.x, c.y, s * 0.68); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
          f.fillStyle = rg; f.beginPath(); f.arc(c.x, c.y, s * 0.68, 0, 7); f.fill();
        });
        f.globalCompositeOperation = 'source-over';
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = this.fog; g.drawImage(this.fogC, 0, 0); g.restore();
      }
      // fire and smoke
      if (still) {
        const fires = this.o.fires.length ? this.o.fires : Object.keys(this.o.marks).filter((k) => this.o.marks[k] === 'hit');
        fires.forEach((id) => { const c = this.center(id); staticFire(g, c.x, c.y, s); });
      } else drawParticles(g, this.P);
      // splash rings
      this.rings.forEach((r) => { const k = r.life / r.max; g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; g.lineWidth = Math.max(1.5, s * 0.04 * (1 - k)); g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)), 0, 7); g.stroke(); });
      // shells in flight: shadow on the water, a trail and the shell
      this.shells.forEach((sh) => {
        const pos = (k) => ({ x: sh.fx + (sh.tx - sh.fx) * k, y: sh.fy + (sh.ty - sh.fy) * k - 4 * k * (1 - k) * W * 0.42 });
        const k = Math.min(1, sh.life / sh.max), ground = { x: sh.fx + (sh.tx - sh.fx) * k, y: sh.fy + (sh.ty - sh.fy) * k };
        g.fillStyle = 'rgba(0,10,25,.35)'; g.beginPath(); g.ellipse(ground.x, ground.y, s * 0.08, s * 0.045, 0, 0, 7); g.fill();
        for (let j = 1; j <= 10; j++) { const kk = Math.max(0, k - j * 0.018), p = pos(kk); g.fillStyle = `rgba(255,236,190,${0.5 * (1 - j / 10)})`; g.beginPath(); g.arc(p.x, p.y, s * 0.045 * (1 - j / 14), 0, 7); g.fill(); }
        const p = pos(k), rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 0.16);
        rg.addColorStop(0, 'rgba(255,240,200,.9)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, s * 0.16, 0, 7); g.fill();
        g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(p.x, p.y, s * 0.05, 0, 7); g.fill();
      });
    }
  }

  // ── Shared phone pieces ──────────────────────────────────────
  const phoneEl = (k) => $(`[data-phone="${k}"]`);
  const top = (day) => `<div class="ph-top fw-top"><span class="fw-av">${ANCHOR}</span><span class="fw-who"><b>Commander Lark</b><small>Your call sign</small></span><span class="fw-day">${day}</span></div>`;
  function noPaste(field, msg) {
    const say = () => { msg.textContent = 'Paste is off here. Type it from memory.'; msg.className = 'fw-msg bad'; };
    field.addEventListener('paste', (e) => { e.preventDefault(); say(); });
    field.addEventListener('drop', (e) => { e.preventDefault(); say(); });
  }
  function ringTimer(host, secs, onEnd) {
    host.classList.add('fw-ring'); host.innerHTML = '<canvas aria-hidden="true"></canvas><span role="timer" aria-live="off"></span>';
    const cv = $('canvas', host), sp = $('span', host), d = DPR(); cv.width = cv.height = 64 * d;
    const g = cv.getContext('2d'); g.scale(d, d);
    const end = performance.now() + secs * 1000; let r = 0, lastS = -1, stopped = false;
    const paint = (k, low) => {
      g.clearRect(0, 0, 64, 64); g.lineWidth = 6; g.lineCap = 'round';
      g.strokeStyle = 'rgba(23,55,94,.12)'; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();
      g.strokeStyle = low ? '#d4544f' : '#f68620'; g.beginPath(); g.arc(32, 32, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    };
    (function loop(now) {
      if (stopped) return;
      const left = Math.max(0, end - now), s = Math.ceil(left / 1000), low = s <= 10;
      if (!GM.calm() || s !== lastS) paint(GM.calm() ? s / secs : left / (secs * 1000), low);
      if (s !== lastS) { lastS = s; sp.textContent = s; host.classList.toggle('low', low); sp.setAttribute('aria-label', `${s} seconds left`); }
      if (left <= 0) { onEnd && onEnd(); return; }
      r = requestAnimationFrame(loop);
    })(performance.now());
    return { stop() { stopped = true; cancelAnimationFrame(r); } };
  }

  // ════════ 1 · Placement ════════════════════════════════════
  const PARTNER_SHIPS = [{ kind: 'destroyer', cells: ['C2', 'C3'], tone: 'partner' }, { kind: 'destroyer', cells: ['A5', 'B5'], tone: 'partner' }];
  const MY_KINDS = { frigate: { n: 3, name: 'Frigate' }, cutter: { n: 1, name: 'Cutter' } };
  const neighbours = (id) => { const [r, c] = RC(id); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < 5 && b >= 0 && b < 5).map(([a, b]) => ID(a, b)); };
  const fitCells = (id, n, horiz) => { let [r, c] = RC(id); if (horiz) c = Math.min(c, 5 - n); else r = Math.min(r, 5 - n); return Array.from({ length: n }, (_, k) => ID(horiz ? r : r + k, horiz ? c + k : c)); };
  const span = (cells) => (cells.length === 1 ? cells[0] : `${cells[0]}–${cells[cells.length - 1]}`);

  function screenPlace() {
    const ph = phoneEl('place');
    const S = { at: { frigate: null, cutter: null }, horiz: { frigate: true, cutter: true }, sel: 'frigate', locked: false };
    ph.innerHTML = `${top('Mon · placement')}
      <div class="ph-body">
        <div><h2 class="ph-h">Hide your two ships</h2><p class="ph-sub">Captain Pike has placed two destroyers. Pick a ship, then tap the square for its bow.</p></div>
        <div data-chart></div>
        <div class="fw-tray" role="group" aria-label="Your ships">${Object.entries(MY_KINDS).map(([k, v]) => `<button class="fw-btn" data-ship="${k}"><span class="hull">${'<i></i>'.repeat(v.n)}</span><b>${v.name}</b><small data-where>${v.n} square${v.n > 1 ? 's' : ''} · not placed</small></button>`).join('')}</div>
        <div class="fw-row2"><button class="fw-btn small" data-rot>⟳ Rotate: across</button><button class="fw-btn small" data-clear>Clear my ships</button></div>
        <p class="fw-msg" aria-live="polite" data-msg></p>
      </div>
      <div class="ph-dock"><button class="pbtn cta orange" data-lock disabled>Lock in placement</button><p class="fw-dock-hint" data-hint>Placement closes Monday 8:00 pm. Unplaced ships are placed for you.</p></div>`;
    const msg = $('[data-msg]', ph);
    const say = (t, k = '') => { msg.textContent = t; msg.className = `fw-msg ${k}`; };
    const mine = () => Object.entries(S.at).filter(([, v]) => v).map(([k, v]) => ({ kind: k, cells: fitCells(v, MY_KINDS[k].n, S.horiz[k]), tone: 'mine' }));
    const check = (kind, cells) => {
      const partner = PARTNER_SHIPS.flatMap((s) => s.cells);
      const other = mine().filter((s) => s.kind !== kind).flatMap((s) => s.cells);
      const clash = cells.find((c) => partner.includes(c) || other.includes(c));
      if (clash) return `${clash} is taken. Ships can’t overlap.`;
      const touch = cells.find((c) => neighbours(c).some((n) => partner.includes(n)));
      if (touch) return `${touch} touches Captain Pike’s destroyer. Leave a square of sea between.`;
      return '';
    };
    const chart = new Chart($('[data-chart]', ph), {
      seed: 11, interactive: true, label: 'Your team’s chart', ships: PARTNER_SHIPS,
      onHover: (id) => { if (!id || S.locked || !S.sel) return chart.preview(null); const cells = fitCells(id, MY_KINDS[S.sel].n, S.horiz[S.sel]); chart.preview(cells, !!check(S.sel, cells)); },
      onTap: (id) => {
        if (S.locked) return say('Your ships are locked in for the week.');
        if (!S.sel) return say('Pick a ship below first.');
        const cells = fitCells(id, MY_KINDS[S.sel].n, S.horiz[S.sel]), why = check(S.sel, cells);
        if (why) { chart.preview(cells, true); anim($('.fw-sea', ph), [{ transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 260 }); return say(why, 'bad'); }
        S.at[S.sel] = cells[0]; const placed = S.sel;
        chart.preview(null); refresh(); chart.drop(cells);
        say(`${MY_KINDS[placed].name} placed at ${span(cells)}.`, 'good');
        S.sel = Object.keys(S.at).find((k) => !S.at[k]) || placed; refresh();
      }
    });
    function refresh() {
      chart.setShips([...PARTNER_SHIPS, ...mine()]);
      $$('[data-ship]', ph).forEach((b) => {
        const k = b.dataset.ship, at = S.at[k];
        b.setAttribute('aria-pressed', String(S.sel === k)); b.classList.toggle('done', !!at);
        $('[data-where]', b).textContent = at ? `Placed at ${span(fitCells(at, MY_KINDS[k].n, S.horiz[k]))}` : `${MY_KINDS[k].n} square${MY_KINDS[k].n > 1 ? 's' : ''} · not placed`;
        b.disabled = S.locked;
      });
      $('[data-rot]', ph).textContent = `⟳ Rotate: ${S.horiz[S.sel] ? 'across' : 'down'}`;
      $('[data-rot]', ph).disabled = S.locked || MY_KINDS[S.sel].n === 1; $('[data-clear]', ph).disabled = S.locked;
      $('[data-lock]', ph).disabled = S.locked || !(S.at.frigate && S.at.cutter);
    }
    ph.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.closest('.fw-cells')) return;
      if (b.dataset.ship) { S.sel = b.dataset.ship; refresh(); say(`${MY_KINDS[S.sel].name} selected. Tap a square.`); }
      if ('rot' in b.dataset) {
        const k = S.sel; S.horiz[k] = !S.horiz[k];
        if (S.at[k]) { const cells = fitCells(S.at[k], MY_KINDS[k].n, S.horiz[k]), why = check(k, cells); if (why) { S.horiz[k] = !S.horiz[k]; say(`Can’t turn it there: ${why}`, 'bad'); } else { say(`${MY_KINDS[k].name} turned: ${span(cells)}.`, 'good'); chart.drop(cells); } }
        refresh();
      }
      if ('clear' in b.dataset) { S.at = { frigate: null, cutter: null }; S.sel = 'frigate'; refresh(); say('Cleared. Captain Pike’s ships stay.'); }
      if ('lock' in b.dataset) {
        S.locked = true; refresh(); say('');
        $('[data-hint]', ph).textContent = 'Locked in. Only Captain Pike can see your ships until Friday.';
        GM.toast(ph, 'Ships hidden<small>Firing opens Tuesday morning.</small>', 'good');
      }
    });
    refresh();
  }

  // ════════ 2 · Firing ═══════════════════════════════════════
  function screenFire() {
    const ph = phoneEl('fire');
    const known = { B3: 'hit', B4: 'hit', D4: 'hit', A2: 'miss', C3: 'miss', E2: 'miss', C5: 'miss', A4: 'miss', E3: 'dud', D1: 'back' };
    const tags = { D1: 'back' };
    const S = { shells: 4, sel: null, sure: null, shots: [], timer: null };
    ph.innerHTML = `${top('Thu · round 3')}
      <div class="ph-body">
        <div class="fw-shells"><span class="n" data-n>4<small>shells</small></span><span class="icons" aria-hidden="true">${'<i></i>'.repeat(4)}</span></div>
        <div data-chart></div>
        <div class="fw-legend" aria-hidden="true"><span><i>${MK.hit}</i>Hit</span><span><i>${MK.miss}</i>Miss</span><span><i>${MK.dud}</i>Dud</span><span><i>${MK.back}</i>Back today</span><span><i>${MK.pending}</i>Shell away</span><span><i style="background:rgba(120,230,220,.35)">${MK.sonar}</i>Sonar: row E</span></div>
        <p class="fw-msg" aria-live="polite" data-msg></p>
      </div>
      <div class="ph-dock" data-dock></div>`;
    const msg = $('[data-msg]', ph), dock = $('[data-dock]', ph);
    const say = (t, k = '') => { msg.textContent = t; msg.className = `fw-msg ${k}`; };
    const marks = () => Object.assign({}, known, Object.fromEntries(S.shots.map((s) => [s.id, 'pending'])));
    const chart = new Chart($('[data-chart]', ph), {
      seed: 29, fog: 1, interactive: true, label: 'Rival waters, under fog', marks: marks(), tags, sonar: 'E',
      onTap: (id) => {
        const m = marks()[id];
        if (S.timer) return;
        if (m === 'hit' || m === 'miss') return say(`${id} is already ${m === 'hit' ? 'hit' : 'a miss'}. Pick another square.`);
        if (m === 'pending') return say(`A shell is already on its way to ${id}.`);
        if (!S.shells) return say('No shells left this round.');
        S.sel = id; chart.aim(id); say(''); paintDock();
      }
    });
    function paintDock() {
      if (!S.shells) {
        dock.innerHTML = `<p class="fw-dock-hint"><b>All four shells away.</b> They land when the round closes at 8:00 pm.</p><button class="pbtn cta" data-go="report">See a dawn report</button>`;
        return;
      }
      if (!S.sel) { dock.innerHTML = '<p class="fw-dock-hint">Tap a square in the fog to aim.</p><button class="pbtn cta" disabled>Choose a square first</button>'; return; }
      const back = known[S.sel] === 'back', dud = known[S.sel] === 'dud';
      dock.innerHTML = `<p class="fw-dock-hint">Aiming at <b>${S.sel}</b> · ${about(S.sel)}${back ? ' · back with a new question' : dud ? ' · a dud, still unknown' : ''}</p>
        <div class="fw-row2"><button class="fw-btn fw-sure sure" data-conf="sure"><b>Sure</b><small>Double damage. Wrong gives them a sonar ping.</small></button><button class="fw-btn fw-sure" data-conf="unsure"><b>Unsure</b><small>Normal damage. No penalty.</small></button></div>`;
    }
    function openQuestion() {
      const id = S.sel, back = known[id] === 'back', v = Q[id][back ? 1 : 0].q || Q[id][0].q;
      const sheet = h(`<div class="fw-sheet" role="dialog" aria-modal="true" aria-label="Question for ${id}">
        <div class="fw-sheet-head"><div><span class="fw-k">Firing at</span><div class="fw-sq">${id} · ${about(id)}</div></div><div data-ring></div></div>
        <div class="fw-sheet-body">
          <span class="fw-conf-chip ${S.sure ? 'sure' : ''}">${S.sure ? 'Sure' : 'Unsure'}${back ? ' · returning square, the other question' : ''}</span>
          <div class="fw-card"><span class="fw-k">Question</span><span class="fw-q">${v}</span></div>
          <label class="fw-field"><span>Your answer</span><textarea class="fw-text" data-ans rows="3" autocomplete="off" spellcheck="false" placeholder="Type it from memory"></textarea></label>
          <p class="fw-watch">${MK.watch}<span>One try. Paste is off and your typing is kept. Leaving the page does not stop the clock.</span></p>
          <p class="fw-msg" aria-live="polite" data-qmsg></p>
        </div>
        <div class="fw-sheet-dock"><button class="pbtn cta orange" data-shoot disabled>Fire</button></div>
      </div>`);
      ph.appendChild(sheet);
      const ta = $('[data-ans]', sheet), btn = $('[data-shoot]', sheet);
      noPaste(ta, $('[data-qmsg]', sheet));
      ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
      setTimeout(() => ta.focus({ preventScroll: true }), calm() ? 0 : 420);
      S.timer = ringTimer($('[data-ring]', sheet), 60, () => shoot(true));
      btn.addEventListener('click', () => shoot(false));
      function shoot(timeUp) {
        S.timer.stop(); S.timer = null;
        const out = anim(sheet, [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 320, fill: 'forwards', easing: 'cubic-bezier(.5,0,.75,0)' });
        const go = () => {
          sheet.remove(); S.shots.push({ id, sure: S.sure, answer: ta.value.trim(), timeUp }); S.shells--; S.sel = null; chart.aim(null);
          const icons = $$('.fw-shells .icons i', ph); icons[3 - S.shells].classList.add('spent');
          $('[data-n]', ph).innerHTML = `${S.shells}<small>shell${S.shells === 1 ? '' : 's'}</small>`;
          paintDock();
          chart.fire(id, () => { chart.setMarks(marks()); });
          if (calm(ph)) chart.setMarks(marks());
          say(timeUp ? `Time ran out at ${id}. It counts as a dud.` : `Shell away to ${id}. It lands when the round closes.`, timeUp ? 'bad' : '');
        };
        out ? out.finished.then(go) : go();
      }
    }
    dock.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.conf) { S.sure = b.dataset.conf === 'sure'; openQuestion(); }
      if (b.dataset.go) location.hash = b.dataset.go;
    });
    paintDock();
  }

  // ════════ 3 · Dawn report ══════════════════════════════════
  function screenReport() {
    const ph = phoneEl('report');
    const ic = (svg, bg) => `<span class="ic" style="${bg ? `background:${bg}` : ''}">${svg}</span>`;
    ph.innerHTML = `<div class="fw-dawn" aria-label="Sunrise">
        <span class="sky"></span><span class="rays"></span><span class="sun"></span><span class="night"></span><span class="sea"></span>
        <div class="txt"><small>Dawn report · Wednesday</small><b>Round 1 is in</b><span>Closed at 8:00 pm. You sail as Commander Lark.</span></div>
      </div>
      <div class="ph-body"><div class="fw-report"><span class="fw-warm" aria-hidden="true"></span>
        <ul class="fw-lines">
          <li class="fw-line">${ic(MK.hit)}<div><b>Captain Pike hit B3.</b><small>Pride × Cora. It counts in full once you confirm it.</small><button class="fw-btn small" data-go="damage">Confirm the hit</button></div></li>
          <li class="fw-line">${ic(MK.dud)}<div><b>Commander Lark: dud at D1, it comes back Thursday.</b><small>That’s you. D1 returns with the other question.</small></div></li>
          <li class="fw-line">${ic(MK.miss)}<div><b>Misses at C3 and A2.</b><small>Both answers were right, so they count in your results.</small></div></li>
          <li class="fw-line">${ic(MK.sonar, '#0b3954')}<div><b>Sonar ping: Ensign Gull was sure and wrong.</b><small>A rival ship sits somewhere in row E.</small></div></li>
          <li class="fw-line hurt"><span class="flash"></span>${ic(MK.hit, '#9b2c2c')}<div><b>You’ve been hit.</b><small>Lieutenant Wren hit Captain Pike’s destroyer at C2. Rivals missed at A3 and D5.</small></div></li>
        </ul></div>
        <div data-chart></div>
        <div class="fw-score"><span>Damage so far</span><span>Us <b>2</b> · Them <b>2</b></span></div>
      </div>
      <div class="ph-dock"><button class="pbtn cta" data-go="fire">Open the chart</button></div>`;
    new Chart($('[data-chart]', ph), {
      seed: 11, label: 'Your team’s chart after the night', interactive: false,
      ships: [...PARTNER_SHIPS, { cells: ['E1', 'E2', 'E3'], tone: 'mine' }, { cells: ['A1'], tone: 'mine' }],
      marks: { C2: 'hit', A3: 'miss', D5: 'miss' }
    });
    ph.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) location.hash = b.dataset.go; });
    if (calm(ph)) { $('.night', ph).style.opacity = 0; return; }
    anim($('.night', ph), [{ opacity: 1 }, { opacity: 0 }], { duration: 2400, fill: 'forwards' });
    anim($('.sun', ph), [{ transform: 'translateY(90px) scale(.8)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 2600 });
    anim($('.rays', ph), [{ transform: 'rotate(-12deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 3000, delay: 600 });
    anim($('.fw-dawn .txt', ph), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 900 });
    anim($('.fw-warm', ph), [{ opacity: 0 }, { opacity: 1 }], { duration: 2800, delay: 800 });
    $$('.fw-line', ph).forEach((li, k) => anim(li, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 1300 + k * 260 }));
    anim($('.fw-line.hurt .flash', ph), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 900, delay: 1300 + 4 * 260 + 300 });
  }

  // ════════ 4 · Damage report owed ═══════════════════════════
  function screenDamage() {
    const ph = phoneEl('damage');
    ph.innerHTML = `${top('Wed · report owed')}
      <div class="ph-body">
        <div><h2 class="ph-h">Your partner hit something. Confirm it.</h2><p class="ph-sub">Captain Pike hit B3 last night. Say why their answer is right and the hit counts in full.</p></div>
        <div class="fw-card"><span class="fw-k">The question Captain Pike was asked · B3, Pride × Cora</span><span class="fw-q">${Q.B3[1].q}</span></div>
        <div class="fw-card"><span class="fw-k">Captain Pike typed</span><span class="fw-typed">the old lens from the lighthouse, she wont sell it even when shes broke</span></div>
        <label class="fw-field"><span>Why is that right? One line.</span><input class="fw-input" data-why type="text" maxlength="140" autocomplete="off" spellcheck="true" placeholder="Because…"><small data-count>0 / 140</small></label>
        <p class="fw-watch">${MK.watch}<span>No model answer here. Paste is off and your typing is saved.</span></p>
        <p class="fw-msg" aria-live="polite" data-msg></p>
      </div>
      <div class="ph-dock"><button class="pbtn cta orange" data-file disabled>File damage report</button><p class="fw-dock-hint" data-hint>File by 8:00 pm tonight for full damage. Late: half.</p></div>`;
    const inp = $('[data-why]', ph), btn = $('[data-file]', ph), msg = $('[data-msg]', ph);
    noPaste(inp, msg);
    inp.addEventListener('input', () => { $('[data-count]', ph).textContent = `${inp.value.length} / 140`; btn.disabled = inp.value.trim().split(/\s+/).length < 3; });
    btn.addEventListener('click', () => {
      inp.disabled = true; btn.disabled = true; btn.textContent = 'Filed';
      $('[data-hint]', ph).textContent = 'The hit counts in full at tonight’s report. Your teacher may send it back once.';
      GM.toast(ph, 'Damage report filed<small>B3 counts in full.</small>', 'good');
    });
  }

  // ════════ 5 · Recall line ══════════════════════════════════
  function screenRecall() {
    const ph = phoneEl('recall');
    ph.innerHTML = `${top('Thu · before you fire')}
      <div class="ph-body">
        <div class="fw-vignette"><canvas aria-hidden="true"></canvas></div>
        <div><h2 class="ph-h">You finished their destroyer.</h2><p class="ph-sub">Your shell landed the last hit on D4–E4. Land the sinking blow: type its recall line from memory.</p></div>
        <div class="fw-card"><span class="fw-k">Recall line</span><span class="fw-cue">Esme to Bram in chapter 6, when she reads the logbook. <b>7 words.</b></span><span class="fw-words" aria-hidden="true">${'<i></i>'.repeat(7)}</span></div>
        <label class="fw-field"><span>The line</span><input class="fw-input" data-line type="text" autocomplete="off" spellcheck="false" placeholder="Type the quote"></label>
        <p class="fw-watch">${MK.watch}<span>One try. Paste is off. Right: +2 sink bonus. Wrong: it still sinks at the next report, with no bonus.</span></p>
        <p class="fw-msg" aria-live="polite" data-msg></p>
      </div>
      <div class="ph-dock"><button class="pbtn cta orange" data-sink disabled>Strike</button></div>`;
    const inp = $('[data-line]', ph), btn = $('[data-sink]', ph), msg = $('[data-msg]', ph);
    noPaste(inp, msg);
    inp.addEventListener('input', () => {
      const n = inp.value.trim() ? inp.value.trim().split(/\s+/).length : 0;
      $$('.fw-words i', ph).forEach((w, k) => w.classList.toggle('on', k < n)); btn.disabled = !n;
    });
    btn.addEventListener('click', () => { inp.disabled = true; btn.disabled = true; btn.textContent = 'Struck'; msg.textContent = 'Logged. The sinking and any bonus show in tomorrow’s dawn report.'; msg.className = 'fw-msg good'; });
    vignette($('.fw-vignette', ph));
  }
  function vignette(host) {
    const cv = $('canvas', host), g = cv.getContext('2d'); const P = []; let W, H, base, t0 = performance.now(), last = t0;
    const size = () => {
      W = host.clientWidth; H = host.clientHeight; if (!W) return; const d = DPR(); cv.width = W * d; cv.height = H * d;
      base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height; const bg = base.getContext('2d'); bg.scale(d, d);
      const R = rng(5); paintSea(bg, W, H, R, makeIslands(R, W, H, [[W * 0.12, H * 0.25], [W * 0.88, H * 0.78]]), false);
    };
    const frame = (now) => {
      if (!host.isConnected) return; if (!W) size(); if (!W) { requestAnimationFrame(frame); return; }
      const d = DPR(), still = calm(host), k = still ? 0.6 : Math.min(1, (now - t0) / 4200), dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0); g.setTransform(d, 0, 0, d, 0, 0);
      const s = Math.min(H * 0.9, W / 3.2), cx = W / 2, cy = H / 2 + k * 6;
      const ease = 1 - Math.pow(1 - k, 2);
      g.save(); g.beginPath(); g.ellipse(cx, cy, s * 1.1, s * 0.45, -0.12 * ease, 0, 7); g.fillStyle = `rgba(8,30,48,${0.25 * ease})`; g.fill(); g.restore();
      drawShip(g, cx, cy, 2, true, s, 'sunk', 1 - ease * 0.55, -0.12 * ease);
      if (still) { staticFire(g, cx + s * 0.2, cy, s * 0.8); [[-0.5, 0.1], [0.4, -0.2], [0.1, 0.3]].forEach(([x, y]) => { g.strokeStyle = 'rgba(220,245,255,.7)'; g.beginPath(); g.arc(cx + x * s, cy + y * s, 3, 0, 7); g.stroke(); }); return; }
      if (k < 0.9) emitFire(P, cx + s * 0.2, cy, s * 0.8, dt);
      if (Math.random() < dt * 14 * ease) P.push({ t: 'b', x: cx + (Math.random() - 0.5) * s * 1.4, y: cy + (Math.random() - 0.5) * s * 0.4, vx: 0, vy: -10, life: 0, max: 1.2, r: 2 + Math.random() * 3, ph: Math.random() * 6 });
      stepParticles(P, dt); drawParticles(g, P);
      requestAnimationFrame(frame);
    };
    new ResizeObserver(() => { size(); if (calm(host)) frame(performance.now()); }).observe(host);
    requestAnimationFrame(frame);
  }

  // ════════ 6 · Signals ══════════════════════════════════════
  const EVENTS = [
    { k: 'turn', label: 'A round opens', line: 'Four shells ready.', go: 'fire', fx: 'ship', now: 'Fleet week: fire your four shells' },
    { k: 'report', label: 'Report ready', line: 'Dawn report is in.', go: 'report', fx: 'glow', now: 'Fleet week: read the dawn report' },
    { k: 'hit', label: 'Your ship is hit', line: 'You’ve been hit.', go: 'report', fx: 'flash', now: 'Fleet week: one of your ships was hit' },
    { k: 'owe', label: 'Report owed', line: 'Your partner hit something. Confirm it.', go: 'damage', fx: 'glow', now: 'Fleet week: confirm your partner’s hit' },
    { k: 'fog', label: 'Reveal opens', line: 'The fog is lifting.', go: 'reveal', fx: 'glow', now: 'Fleet week: the fog is lifting' }
  ];
  function screenSignals() {
    const S = { count: 0, cur: null };
    const pageHTML = () => `<div class="fw-sp" style="flex:1;display:flex;flex-direction:column">
      <div class="fw-sp-head"><span class="fw-av">${ANCHOR}</span><div><b>My progress</b><small>English · invented class</small></div></div>
      <div class="fw-now"><p><small>Do this now</small><span data-now>Finish the chapter 6 quiz</span></p>${anchorBtn()}</div>
      <div class="fw-sp-tabs" aria-hidden="true"><span class="on">To do</span><span>Returned</span><span>Organiser</span></div>
      <div class="fw-sp-list">
        <div class="fw-gcard"><span class="art">${ANCHOR.replace('currentColor', '#fff')}</span><div><b>Fleet week</b><small>Game · Thursday, round 3</small></div>${anchorBtn()}</div>
        <div class="fw-lrow"><span>Chapter 6 quiz<br><small>Quiz · due Friday</small></span><small>Started</small></div>
        <div class="fw-lrow"><span>The storm scene: one paragraph<br><small>Writing · due Monday</small></span><small>New</small></div>
        <div class="fw-lrow"><span>Organiser: Gull Rock key terms<br><small>6 cards today</small></span><small>Practice</small></div>
      </div>
      <button class="fw-stoast" data-toast tabindex="-1"><span class="fw-av">${ANCHOR}</span><span><span class="lbl">Fleet week</span><span class="line" data-line></span></span><span class="go">Open ›</span></button>
      <span class="fw-steam" aria-hidden="true">${SHIP_SVG}</span>
    </div>`;
    const anchorBtn = () => `<button class="fw-anchor" data-anchor aria-label="Fleet week: nothing waiting"><span class="glow"></span>${ANCHOR}<span class="count" data-n="0">0</span><span class="flash"></span><span class="puff"></span><span class="puff"></span><span class="puff"></span></button>`;
    const phones = [phoneEl('sig'), phoneEl('sig-rm')];
    phones.forEach((p) => { p.innerHTML = pageHTML(); p.addEventListener('click', (e) => { if (e.target.closest('[data-toast],[data-anchor]') && S.cur) location.hash = S.cur.go; }); });
    const bar = $('#fwEvents');
    bar.innerHTML = EVENTS.map((ev) => `<button class="fw-btn" data-ev="${ev.k}" aria-pressed="false">${ev.label}</button>`).join('');
    bar.onclick = (e) => { const b = e.target.closest('[data-ev]'); if (b) play(EVENTS.find((x) => x.k === b.dataset.ev)); };
    function play(ev) {
      S.cur = ev; S.count = Math.min(9, S.count + 1);
      $$('[data-ev]', bar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ev === ev.k)));
      phones.forEach((p) => {
        const rm = calm(p);
        $('[data-now]', p).textContent = ev.now;
        $$('[data-anchor]', p).forEach((a) => {
          a.classList.add('on'); const c = $('.count', a); c.textContent = S.count; c.dataset.n = S.count; a.setAttribute('aria-label', `Fleet week: ${S.count} waiting`);
          anim(c, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)' });
          if (ev.fx === 'flash' && !rm) {
            anim($('.flash', a), [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.2 }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 700, fill: 'none' });
            $$('.puff', a).forEach((pf, k) => anim(pf, [{ opacity: 0.9, transform: 'translate(0,0) scale(.6)' }, { opacity: 0, transform: `translate(${(k - 1) * 10 + 6}px,-${30 + k * 8}px) scale(2.2)` }], { duration: 1600, delay: 150 + k * 120, fill: 'none', easing: 'ease-out' }));
          }
        });
        const t = $('[data-toast]', p); $('[data-line]', t).textContent = ev.line;
        t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); t.tabIndex = 0;
        clearTimeout(t._h); t._h = setTimeout(() => { t.classList.remove('show'); t.tabIndex = -1; }, 9000);
        const ship = $('.fw-steam', p);
        if (ev.fx === 'ship' && !rm) {
          const w = p.clientWidth;
          anim(ship, [{ transform: 'translateX(-70px)', opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { transform: `translateX(${w + 10}px)`, opacity: 0 }], { duration: 4200, easing: 'linear', fill: 'none' });
        }
      });
    }
    setTimeout(() => play(EVENTS[0]), 350);
  }

  // ════════ 7 · Control room ═════════════════════════════════
  const MATCHES = [
    { n: 1, teams: [{ dmg: 6, p: [{ nm: 'Nell Ashby', f: 4 }, { nm: 'Rafi Collard', f: 2, owe: 'Owes a report on B3' }] }, { dmg: 4, p: [{ nm: 'Iona Pettit', f: 3 }, { nm: 'Jude Marlow', f: 4, flag: 1 }] }] },
    { n: 2, teams: [{ dmg: 3, p: [{ nm: 'Kit Farrant', f: 1 }, { nm: 'Mae Tolland', f: 0, owe: 'Report filed on D3', ok: 1 }] }, { dmg: 8, p: [{ nm: 'Ollie Brandt', f: 4 }, { nm: 'Suki Venn', f: 3, flag: 1 }] }] },
    { n: 3, teams: [{ dmg: 5, p: [{ nm: 'Hal Dorsey', f: 4 }, { nm: 'Pia Lund', f: 4 }, { nm: 'Wes Corrin', f: 2, note: 'third member' }] }, { dmg: 5, p: [{ nm: 'Remy Quaile', f: 2, flag: 1 }, { nm: 'Tess Arnott', f: 0, owe: 'Owes a report on C1' }] }] }
  ];
  const FLAGS = [
    { who: 'Jude Marlow', sq: 'C4', why: 'Paste blocked', detail: 'Tried to paste 38 characters at 0:14, then typed the answer.', answer: 'the boat shed by the slipway',
      log: [[0, ''], [3200, 'the'], [5200, 'the b'], [14000, 'the b'], [16500, 'the boat'], [19000, 'the boat shed'], [24000, 'the boat shed by the'], [27000, 'the boat shed by the slipway']], paste: [14000], away: [] },
    { who: 'Suki Venn', sq: 'B1', why: 'Away 48 s', detail: 'Left the page for 48 seconds before answering.', answer: 'winding the clockwork',
      log: [[0, ''], [4000, 'wind'], [6000, 'wind'], [54000, 'winding the'], [57000, 'winding the clockwork']], paste: [], away: [[6000, 54000]] },
    { who: 'Remy Quaile', sq: 'E2', why: 'One burst', detail: 'Nothing for 41 seconds, then 24 characters in under a second.', answer: 'go to school on the shore',
      log: [[0, ''], [41000, ''], [41600, 'go to school on the shore']], paste: [], away: [] }
  ];
  const REPORTS = [
    { by: 'Rafi Collard', on: 'Nell Ashby’s hit at A3', q: Q.A3[0].q, ans: 'her husband drowned crossing to the rock', line: 'Because in chapter 2 Cora says the crossing took him and she has not been on a boat since.' },
    { by: 'Mae Tolland', on: 'Kit Farrant’s hit at D3', q: Q.D3[0].q, ans: 'her husband', line: 'because it does' }
  ];
  function screenControl() {
    const root = $('#fwControl');
    const S = { mode: 'lesson', round: 3, left: 192, flags: {}, reps: {} };
    clearInterval(root._t);
    root.innerHTML = `<div class="fw-thead">
        <div class="grow"><h2>Fleet week · control room</h2><small>The Lighthouse Keeper’s Daughter · invented class · 3 matches · real names, teacher only</small></div>
        <span class="fw-seg" role="group" aria-label="Clock"><button data-mode="week">Week mode</button><button data-mode="lesson">Lesson mode</button></span>
        <span class="fw-clock" data-clock></span>
        <button class="fw-tbtn primary" data-next>Next round</button>
      </div>
      <p class="fw-msg" aria-live="polite" data-msg></p>
      <div class="fw-tgrid">
        <div class="fw-col" data-matches></div>
        <div class="fw-col">
          <section class="fw-panel"><div class="fw-panel-h"><h3>Writing watch</h3><small>${FLAGS.length} flags this round</small></div><div data-flags></div></section>
          <section class="fw-panel"><div class="fw-panel-h"><h3>Damage reports</h3><small>Filed this round</small></div><div data-reps></div></section>
        </div>
      </div>`;
    const msg = $('[data-msg]', root);
    const paint = () => {
      $$('[data-mode]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
      $('[data-next]', root).hidden = S.mode !== 'lesson';
      const m = Math.floor(S.left / 60), s = String(S.left % 60).padStart(2, '0');
      $('[data-clock]', root).innerHTML = S.mode === 'lesson' ? `${m}:${s}<small>Round ${S.round} of 5 · cap 4:00</small>` : `8:00 pm<small>Round ${S.round} of 3 closes Thursday</small>`;
      $('[data-matches]', root).innerHTML = MATCHES.map((mt) => {
        const fired = mt.teams.flatMap((t) => t.p).filter((p) => p.f === 4).length, all = mt.teams.flatMap((t) => t.p).length;
        return `<article class="fw-match"><div class="fw-match-h"><b>Match ${mt.n}</b><small>${fired} of ${all} have fired all four</small><span class="dmg">${mt.teams[0].dmg} – ${mt.teams[1].dmg}</span></div>
          <div class="fw-teams">${mt.teams.map((t, k) => `<div class="fw-team"><small>Team ${k ? 'B' : 'A'} · ${t.dmg} damage</small>${t.p.map((p) => `<div class="fw-pl"><span class="nm">${p.nm}${p.note ? ` <small style="color:var(--muted);font-weight:500">· ${p.note}</small>` : ''}</span><span class="fw-pips" aria-label="${p.f} of 4 shells fired">${[0, 1, 2, 3].map((i) => `<i class="${i < p.f ? 'on' : ''}"></i>`).join('')}</span>${p.owe ? `<span class="owe ${p.ok ? 'ok' : ''}">${p.owe}</span>` : ''}${p.flag ? '<span class="owe">Writing-watch flag ↗</span>' : ''}</div>`).join('')}</div>`).join('')}</div></article>`;
      }).join('');
      $('[data-flags]', root).innerHTML = FLAGS.map((f, i) => {
        const v = S.flags[i];
        return `<div class="fw-flag ${v ? 'voided' : ''}"><span class="why">${f.why}</span><span class="t"><b>${f.who}</b> · shot at ${f.sq} · ${f.detail}</span>
          <div class="acts"><button class="fw-tbtn" data-replay="${i}">Typing replay</button>${v ? `<span class="state bad">Voided: a dud that won’t return</span><button class="fw-tbtn" data-unvoid="${i}">Undo</button>` : `<button class="fw-tbtn warn" data-void="${i}">Void shot</button>`}</div></div>`;
      }).join('');
      $('[data-reps]', root).innerHTML = REPORTS.map((r, i) => {
        const x = S.reps[i];
        return `<div class="fw-flag"><span class="t"><b>${r.by}</b> on ${r.on}</span>
          <div class="fw-quote"><small>Question</small>${r.q}</div>
          <div class="fw-quote"><small>Their partner typed</small>${r.ans}</div>
          <div class="fw-quote"><small>${r.by}’s line</small>${r.line}</div>
          <div class="acts">${x ? `<span class="state bad">Sent back to ${r.by.split(' ')[0]} once</span><button class="fw-tbtn" data-unrej="${i}">Undo</button>` : `<button class="fw-tbtn warn" data-rej="${i}">Reject report</button>`}</div></div>`;
      }).join('');
    };
    root.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.mode) { S.mode = d.mode; S.round = 3; msg.textContent = d.mode === 'week' ? 'Week mode: rounds close at the cut-off. Next round is lesson mode only.' : 'Lesson mode: rounds close when everyone has fired, on Next round, or at the cap.'; }
      if ('next' in d) { S.round = Math.min(5, S.round + 1); S.left = 240; MATCHES.forEach((m) => m.teams.forEach((t) => t.p.forEach((p) => (p.f = 0)))); msg.textContent = `Round ${S.round} open. Phones show “Four shells ready.”`; msg.className = 'fw-msg good'; }
      if (d.void) { S.flags[d.void] = 1; msg.textContent = `${FLAGS[d.void].who}’s shot at ${FLAGS[d.void].sq} is void.`; msg.className = 'fw-msg'; }
      if (d.unvoid) delete S.flags[d.unvoid];
      if (d.rej) { S.reps[d.rej] = 1; msg.textContent = `Report returned to ${REPORTS[d.rej].by}. It can come back once.`; msg.className = 'fw-msg'; }
      if (d.unrej) delete S.reps[d.unrej];
      if (d.replay) { replay(FLAGS[d.replay]); return; }
      paint();
    };
    root._t = setInterval(() => { if (!root.isConnected || root.closest('[hidden]')) return; if (S.mode === 'lesson' && S.left > 0) { S.left--; const c = $('[data-clock]', root); const m = Math.floor(S.left / 60), s = String(S.left % 60).padStart(2, '0'); c.innerHTML = `${m}:${s}<small>Round ${S.round} of 5 · cap 4:00</small>`; } }, 1000);
    paint();
  }
  function replay(f) {
    const dlg = $('#fwReplay'); const total = f.log[f.log.length - 1][0] + 2000;
    const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    dlg.innerHTML = `<div class="fw-dialog-in"><div class="fw-dialog-h"><b>Typing replay · ${f.who} · ${f.sq}</b><small>${f.why}. Question: ${Q[f.sq][0].q}</small></div>
      <div class="fw-dialog-b">
        <div class="fw-replay" data-text aria-live="off"></div>
        <div class="fw-tl" aria-hidden="true"><span class="bar" data-bar></span>${f.away.map(([a, b]) => `<span class="away" style="left:${a / total * 100}%;width:${(b - a) / total * 100}%"></span>`).join('')}${f.paste.map((t) => `<span class="ev" style="left:${t / total * 100}%"></span>`).join('')}</div>
        <div class="fw-tl-key"><span><i style="background:var(--danger)"></i>Paste blocked</span><span><i style="background:rgba(246,134,32,.45)"></i>Away from the page</span><span data-time>0:00 / ${fmt(total)}</span></div>
        <ul class="fw-log">${f.paste.map((t) => `<li><b>${fmt(t)}</b> paste blocked</li>`).join('')}${f.away.map(([a, b]) => `<li><b>${fmt(a)}–${fmt(b)}</b> away from the page</li>`).join('')}<li><b>${fmt(f.log[f.log.length - 1][0])}</b> fired: “${f.answer}”</li></ul>
      </div>
      <div class="fw-dialog-a"><button class="fw-tbtn" data-play>Play</button><button class="fw-tbtn navy" data-close>Close</button></div></div>`;
    const txt = $('[data-text]', dlg), bar = $('[data-bar]', dlg), time = $('[data-time]', dlg);
    let r = 0, t0 = 0; const speed = 6;
    const at = (ms) => { let s = ''; f.log.forEach(([t, v]) => { if (t <= ms) s = v; }); return s; };
    const show = (ms) => { txt.innerHTML = `${at(ms).replace(/</g, '&lt;')}<span class="caret"></span>`; bar.style.transform = `scaleX(${Math.min(1, ms / total)})`; time.textContent = `${fmt(Math.min(ms, total))} / ${fmt(total)}`; };
    const stop = () => { cancelAnimationFrame(r); r = 0; $('[data-play]', dlg).textContent = 'Play'; };
    const loop = (now) => { const ms = (now - t0) * speed; show(ms); if (ms < total) r = requestAnimationFrame(loop); else stop(); };
    dlg.onclick = (e) => {
      if (e.target.closest('[data-close]') || e.target === dlg) { stop(); dlg.close(); return; }
      if (e.target.closest('[data-play]')) { if (r) { stop(); return; } t0 = performance.now(); $('[data-play]', dlg).textContent = 'Pause'; r = requestAnimationFrame(loop); }
    };
    dlg.onclose = stop;
    show(total); dlg.showModal();
  }

  // ════════ 8 · Grid editor ══════════════════════════════════
  function screenEditor() {
    const root = $('#fwEditor');
    const D = { cols: COLS.map((c) => c[1]), rows: ROWS.map((r) => r[1]), q: JSON.parse(JSON.stringify(Q)), recall: RECALL.map((r) => ({ ...r })), sel: 'C4' };
    const tagsOf = (id, v) => (v.tags === null ? [D.rows[RC(id)[0]], D.cols[RC(id)[1]]] : v.tags);
    const issues = () => {
      const out = [];
      ALL.forEach((id) => {
        const [a, b] = D.q[id], fa = !!a.q.trim(), fb = !!b.q.trim();
        if (!fa && !fb) out.push({ sev: 'err', id, t: `${id} is empty` });
        else if (!fa || !fb) out.push({ sev: 'wn', id, t: `${id} has one variant` });
        [a, b].forEach((v, k) => { if (v.q.trim() && !v.key.trim()) out.push({ sev: 'err', id, t: `${id} variant ${k ? 'B' : 'A'} has no answer key` }); if (v.q.trim() && !tagsOf(id, v).length) out.push({ sev: 'wn', id, t: `${id} variant ${k ? 'B' : 'A'} is untagged` }); });
      });
      const n = D.recall.filter((r) => r.line.trim()).length;
      if (n < 4) out.push({ sev: 'err', id: 'recall', t: `${n} of 4 recall lines` });
      return out.sort((x, y) => (x.sev === y.sev ? 0 : x.sev === 'err' ? -1 : 1));
    };
    root.innerHTML = `<div class="fw-thead"><div class="grow"><h2>Fleet week · grid editor</h2><small>The Lighthouse Keeper’s Daughter · characters across, themes down · two variants per square</small></div><span data-status class="fw-msg"></span><button class="fw-tbtn primary" data-publish>Publish</button></div>
      <div class="fw-ed">
        <div class="fw-col">
          <div class="fw-ed-grid" data-grid></div>
          <section class="fw-panel"><div class="fw-panel-h"><h3>Publish issues</h3><small data-count></small></div><ul class="fw-issues" data-issues></ul></section>
        </div>
        <div class="fw-col">
          <section class="fw-panel" data-square></section>
          <section class="fw-panel"><div class="fw-panel-h"><h3>Recall lines</h3><small>One per ship, typed for the sinking blow</small></div><div class="fw-recall" data-recall>${D.recall.map((r, i) => `<label>${r.ship}<input data-rl="${i}" value="${r.line.replace(/"/g, '&quot;')}" placeholder="A key quote or term"></label>`).join('')}</div></section>
        </div>
      </div>`;
    const grid = $('[data-grid]', root);
    const paintGrid = () => {
      const iss = issues();
      grid.innerHTML = `<span></span>${D.cols.map((c, k) => `<label class="lab"><b>${k + 1}</b><input data-col="${k}" value="${c}" aria-label="Column ${k + 1} label"></label>`).join('')}` +
        D.rows.map((rw, r) => `<label class="lab row"><b>${'ABCDE'[r]}</b><input data-row="${r}" value="${rw}" aria-label="Row ${'ABCDE'[r]} label"></label>${COLS.map((_, c) => {
          const id = ID(r, c), [a, b] = D.q[id], mine = iss.filter((x) => x.id === id), err = mine.some((x) => x.sev === 'err'), wn = mine.length && !err;
          return `<button class="fw-ed-cell" data-sq="${id}" aria-pressed="${D.sel === id}" aria-label="${id}: ${[a, b].filter((v) => v.q.trim()).length} of 2 variants${mine.length ? ', ' + mine.map((x) => x.t).join(', ') : ''}"><b>${id}</b><span class="dots"><i class="${a.q.trim() ? '' : 'no'}"></i><i class="${b.q.trim() ? '' : 'no'}"></i></span>${err ? '<span class="warn err">!</span>' : wn ? '<span class="warn wn">!</span>' : ''}</button>`;
        }).join('')}`).join('');
    };
    const paintIssues = () => {
      const iss = issues(), errs = iss.filter((x) => x.sev === 'err').length;
      $('[data-issues]', root).innerHTML = iss.length ? iss.map((x) => `<li><button data-goto="${x.id}"><span class="sev ${x.sev}">${x.sev === 'err' ? 'Fix' : 'Check'}</span>${x.t}</button></li>`).join('') : '<li class="ok">No issues. Ready to publish.</li>';
      $('[data-count]', root).textContent = `${errs} stop publishing · ${iss.length - errs} to check`;
      $('[data-publish]', root).disabled = errs > 0;
      const st = $('[data-status]', root); st.textContent = errs ? `${errs} issue${errs > 1 ? 's' : ''} to fix before publishing` : 'Ready'; st.className = `fw-msg ${errs ? 'bad' : 'good'}`;
    };
    const paintSquare = () => {
      const id = D.sel, [r, c] = RC(id);
      $('[data-square]', root).innerHTML = `<div class="fw-panel-h"><h3>${id} · ${D.rows[r]} × ${D.cols[c]}</h3><small>Students get the variant their partner and rivals did not</small></div>
        ${D.q[id].map((v, k) => `<div class="fw-var"><h4>Variant ${k ? 'B' : 'A'}<small>${v.q.trim() ? 'Short answer' : 'Empty'}</small></h4>
          <label>Question<textarea data-vq="${k}" rows="2" placeholder="A short-answer question about ${D.cols[c]} and ${D.rows[r].toLowerCase()}">${v.q}</textarea></label>
          <label>Answer key (held on the server)<input data-vk="${k}" value="${v.key.replace(/"/g, '&quot;')}" placeholder="Accepted answer"></label>
          <div class="fw-tags" role="group" aria-label="Tags">${[D.rows[r], D.cols[c]].map((t) => `<button data-vt="${k}" data-tag="${t}" aria-pressed="${tagsOf(id, v).includes(t)}">${t}</button>`).join('')}</div></div>`).join('')}`;
    };
    root.addEventListener('input', (e) => {
      const t = e.target, d = t.dataset, v = d.vq || d.vk ? D.q[D.sel][Number(d.vq || d.vk)] : null;
      if (d.vq) v.q = t.value; if (d.vk) v.key = t.value;
      if (d.rl) D.recall[d.rl].line = t.value;
      if (d.col) { D.cols[d.col] = t.value; paintSquare(); }
      if (d.row) { D.rows[d.row] = t.value; paintSquare(); }
      if (!d.col && !d.row) paintGridKeepFocus(); paintIssues();
    });
    function paintGridKeepFocus() { const f = document.activeElement; const sel = f && grid.contains(f) ? f.dataset : null; paintGrid(); if (sel) { const q = sel.col ? `[data-col="${sel.col}"]` : sel.row ? `[data-row="${sel.row}"]` : null; if (q) $(q, grid).focus(); } }
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.sq) { D.sel = d.sq; paintGrid(); paintSquare(); }
      if (d.vt) { const v = D.q[D.sel][Number(d.vt)], cur = tagsOf(D.sel, v); v.tags = cur.includes(d.tag) ? cur.filter((x) => x !== d.tag) : [...cur, d.tag]; paintSquare(); paintGrid(); paintIssues(); }
      if (d.goto) { if (d.goto === 'recall') { const empty = $$('[data-rl]', root).find((i) => !i.value.trim()); if (empty) empty.focus(); } else { D.sel = d.goto; paintGrid(); paintSquare(); $('[data-square]', root).scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); } }
      if ('publish' in d) { const st = $('[data-status]', root); st.textContent = 'Published. Open a campaign from the class page.'; st.className = 'fw-msg good'; }
    });
    paintGrid(); paintSquare(); paintIssues();
  }

  // ════════ 9 · Board reveal ═════════════════════════════════
  const REVEALS = [
    { a: [['Commander Lark', 'Nell Ashby'], ['Captain Kestrel', 'Rafi Collard']], b: [['Ensign Heron', 'Iona Pettit'], ['Lieutenant Puffin', 'Jude Marlow']], dmg: [17, 11],
      fa: [{ cells: ['E1', 'E2', 'E3'] }, { cells: ['A1'] }, { cells: ['C2', 'C3'] }, { cells: ['A5', 'B5'] }], ha: ['C2', 'C3', 'E2', 'A1'], ma: ['A3', 'D5', 'B2', 'D3', 'C5'],
      fb: [{ cells: ['B2', 'B3', 'B4'] }, { cells: ['D1', 'E1'] }, { cells: ['D4', 'E4'] }, { cells: ['A5'] }], hb: ['B2', 'B3', 'B4', 'D4', 'E4', 'E1'], mb: ['A2', 'C3', 'E2', 'C5', 'A4'] },
    { a: [['Captain Tern', 'Kit Farrant'], ['Ensign Shrike', 'Mae Tolland']], b: [['Commander Wren', 'Ollie Brandt'], ['Captain Osprey', 'Suki Venn']], dmg: [9, 15],
      fa: [{ cells: ['B1', 'B2', 'B3'] }, { cells: ['D5'] }, { cells: ['D1', 'E1'] }, { cells: ['A5', 'B5'] }], ha: ['B1', 'B2', 'B3', 'D5', 'E1'], ma: ['C2', 'C4', 'A2'],
      fb: [{ cells: ['C1', 'C2', 'C3'] }, { cells: ['A4'] }, { cells: ['E3', 'E4'] }, { cells: ['A1', 'B1'] }], hb: ['C2', 'C3', 'E4'], mb: ['B4', 'D2', 'A3', 'E1', 'C5'] },
    { a: [['Ensign Gannet', 'Hal Dorsey'], ['Lieutenant Curlew', 'Pia Lund']], b: [['Captain Skua', 'Remy Quaile'], ['Commander Dunlin', 'Tess Arnott']], dmg: [13, 13],
      fa: [{ cells: ['A2', 'A3', 'A4'] }, { cells: ['E5'] }, { cells: ['C1', 'D1'] }, { cells: ['C4', 'D4'] }], ha: ['A3', 'C1', 'D1', 'C4'], ma: ['B2', 'E2', 'E4'],
      fb: [{ cells: ['D2', 'D3', 'D4'] }, { cells: ['B5'] }, { cells: ['A1', 'A2'] }, { cells: ['B3', 'C3'] }], hb: ['D2', 'D3', 'A1', 'A2'], mb: ['C5', 'E1', 'B1'], tie: 'Tie on damage: Team B sank more ships' }
  ];
  const HARD = [['D2', 31], ['A5', 38], ['C4', 44]];
  function screenReveal() {
    const board = $('#fwBoard'), ctrls = $('#fwRvCtrls');
    let mi = 0, charts = [], timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, calm() ? 0 : ms));
    function build() {
      timers.forEach(clearTimeout); timers = [];
      const M = REVEALS[mi], win = M.dmg[0] === M.dmg[1] ? 1 : M.dmg[0] > M.dmg[1] ? 0 : 1;
      const winNames = (win ? M.b : M.a).map((x) => x[1]).join(' & ');
      board.innerHTML = `<div class="board-top"><span class="board-title"><b>Fleet week</b> · the reveal · match ${mi + 1} of ${REVEALS.length}</span><span class="board-code">The Lighthouse Keeper’s Daughter</span></div>
        ${['a', 'b'].map((k, i) => `<div class="fw-rv-fleet ${i ? 'r' : 'l'}"><div class="fw-rv-names">${M[k].map(([cs, nm]) => `<span class="fw-rv-name"><span class="cs">${cs}</span><span class="real">${nm}</span></span>`).join('')}</div><div data-c="${k}"></div></div>`).join('')}
        <div class="fw-rv-mid"><span class="dmg" data-d="0">?<small>damage</small></span><span class="vs">vs</span><span class="dmg" data-d="1">?<small>damage</small></span></div>
        <div class="fw-win"><b>${winNames} win</b><small>${M.tie || `Match ${mi + 1} · ${Math.max(...M.dmg)} damage to ${Math.min(...M.dmg)}`}</small></div>
        <div class="fw-hard"><h3>The class’s hardest squares</h3>${HARD.map(([id, pc]) => `<div class="fw-hsq"><span class="id">${id}</span><span class="lb">${about(id)}</span><span class="pc">${pc}% right first time<i><u style="transform:scaleX(${pc / 100})"></u></i></span></div>`).join('')}</div>`;
      const sunk = (fleet, hits) => fleet.map((s) => ({ cells: s.cells, tone: s.cells.every((c) => hits.includes(c)) ? 'sunk' : null }));
      const marks = (hits, misses) => Object.assign(Object.fromEntries(misses.map((x) => [x, 'miss'])), Object.fromEntries(hits.map((x) => [x, 'hit'])));
      charts = [
        new Chart($('[data-c="a"]', board), { seed: 41 + mi, fog: 1, shipAlpha: 0, label: 'Left fleet', ships: sunk(M.fa, M.ha).map((s) => ({ ...s, tone: s.tone || 'teamA' })), marks: marks(M.ha, M.ma) }),
        new Chart($('[data-c="b"]', board), { seed: 77 + mi, fog: 1, shipAlpha: 0, label: 'Right fleet', ships: sunk(M.fb, M.hb).map((s) => ({ ...s, tone: s.tone || 'teamB' })), marks: marks(M.hb, M.mb) })
      ];
      GM.fit();
      paintCtrls(false);
    }
    function lift() {
      const M = REVEALS[mi];
      paintCtrls(true);
      const t0 = performance.now(), dur = 2600;
      const step = (now) => {
        const k = calm() ? 1 : Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        charts.forEach((c) => { c.fog = 1 - e; c.shipAlpha = Math.max(0, Math.min(1, (k - 0.35) / 0.5)); });
        kick(); if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      $$('.fw-rv-name', board).forEach((n, i) => later(2700 + i * 260, () => n.classList.add('named')));
      later(3900, () => {
        $$('[data-d]', board).forEach((d) => { const v = M.dmg[d.dataset.d]; d.innerHTML = '<span>0</span><small>damage</small>'; GM.countUp($('span', d), 0, v, 900); });
      });
      later(4900, () => { $('.fw-win', board).classList.add('show'); GM.confetti(board); });
      later(6000, () => $('.fw-hard', board).classList.add('show'));
    }
    function paintCtrls(lifted) {
      ctrls.innerHTML = `<button class="fw-tbtn primary" data-lift ${lifted ? 'disabled' : ''}>Lift the fog</button><button class="fw-tbtn" data-reset>Fog back</button><button class="fw-tbtn navy" data-next>Next match ›</button>`;
    }
    ctrls.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if ('lift' in b.dataset) lift();
      if ('reset' in b.dataset) build();
      if ('next' in b.dataset) { mi = (mi + 1) % REVEALS.length; build(); }
    };
    build();
  }

  // ── Router, toolbar, calm ────────────────────────────────────
  const SCREENS = { place: screenPlace, fire: screenFire, report: screenReport, damage: screenDamage, recall: screenRecall, signals: screenSignals, control: screenControl, editor: screenEditor, reveal: screenReveal };
  const built = {};
  function show(name, rebuild) {
    if (!SCREENS[name]) name = 'place';
    $$('.fw-screen').forEach((s) => (s.hidden = s.id !== `s-${name}`));
    $$('.fw-tabs [data-s]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.s === name)));
    $('#fwPick').value = name;
    if (!built[name] || rebuild) { built[name] = true; SCREENS[name](); }
    barHeight(); GM.fit(); kick();
  }
  function barHeight() { document.documentElement.style.setProperty('--fw-bar-h', `${$('.fw-bar').offsetHeight}px`); }
  $('.fw-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) location.hash = b.dataset.s; });
  $('#fwPick').addEventListener('change', (e) => { location.hash = e.target.value; });
  $('.fw-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const name = location.hash.slice(1) || 'place';
    if (b.dataset.t === 'calm') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); document.body.classList.toggle('calm', on); }
    show(name, true);
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  window.addEventListener('resize', () => { barHeight(); GM.fit(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => show(location.hash.slice(1) || 'place', true));
  if (new URLSearchParams(location.search).has('calm')) { document.body.classList.add('calm'); $('[data-t="calm"]').setAttribute('aria-pressed', 'true'); }
  show(location.hash.slice(1) || 'place');
})();

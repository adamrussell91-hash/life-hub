/* Shared data, layout and drawing for the mind map / concept map block mockups.
 * Same block content shape as apps/{tasks,teaching}/src/schemas/block.ts:
 *   nodes: { id, label, parent_id?, color?, x?, y? }[]   edges: { id, from, to, label }[]
 * Classic script (not a module) so the mockups open straight from disk.
 */
(function () {
  const MIND = {
    title: 'Themes in An Artist of the Floating World',
    nodes: [
      { id: 'm0', label: 'Ono’s unreliable memory', parent_id: null },
      { id: 'm1', label: 'Guilt and responsibility', parent_id: 'm0' },
      { id: 'm3', label: 'Art and propaganda', parent_id: 'm0' },
      { id: 'm5', label: 'Matsuda’s influence', parent_id: 'm3' },
      { id: 'm2', label: 'Post-war Japan', parent_id: 'm0' },
      { id: 'm6', label: 'The Pleasure District', parent_id: 'm2' },
      { id: 'm4', label: 'Generational conflict', parent_id: 'm0' },
      { id: 'm7', label: 'Noriko’s marriage talks', parent_id: 'm4' },
      { id: 'm8', label: 'Ichiro and Western culture', parent_id: 'm4' }
    ],
    edges: []
  };

  const CONCEPT = {
    title: 'How Ono’s reputation shapes the plot',
    nodes: [
      { id: 'c3', label: 'Imperial propaganda', color: 'peach' },
      { id: 'c6', label: 'Self-deception', color: 'lilac' },
      { id: 'c1', label: 'Ono’s reputation', color: 'blue' },
      { id: 'c4', label: 'Kuroda', color: 'sage' },
      { id: 'c2', label: 'Noriko’s marriage', color: 'gold' },
      { id: 'c5', label: 'Saito family', color: 'sage' }
    ],
    edges: [
      { id: 'e2', from: 'c3', to: 'c1', label: 'built' },
      { id: 'e5', from: 'c6', to: 'c1', label: 'inflates' },
      { id: 'e1', from: 'c1', to: 'c2', label: 'threatens' },
      { id: 'e3', from: 'c1', to: 'c4', label: 'betrayed' },
      { id: 'e4', from: 'c5', to: 'c2', label: 'investigates for' },
      { id: 'e6', from: 'c4', to: 'c3', label: 'resisted' }
    ]
  };

  const BRANCH_COLOURS = ['blue', 'sage', 'peach', 'lilac', 'gold'];
  const LINK_VERBS = ['leads to', 'causes', 'is part of', 'contrasts with', 'is an example of', 'depends on'];

  let measureCtx = null;
  function textWidth(text, font) {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  function wrapLines(text, font, maxWidth) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (!current || textWidth(next, font) <= maxWidth) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines.slice(0, 3);
  }

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* Tree from flat nodes, keeping input order (outline order is meaningful). */
  function buildTree(nodes) {
    const byId = new Map(nodes.map((n) => [n.id, { ...n, kids: [] }]));
    let root = null;
    for (const n of byId.values()) {
      if (n.parent_id == null || !byId.has(n.parent_id)) {
        if (!root) root = n;
        else root.kids.push(n);
      } else byId.get(n.parent_id).kids.push(n);
    }
    if (!root) return null;
    (function walk(n, depth, branch) {
      n.depth = depth;
      n.branch = branch;
      n.kids.forEach((k, i) => walk(k, depth + 1, depth === 0 ? k.color || BRANCH_COLOURS[i % BRANCH_COLOURS.length] : branch));
    })(root, 0, 'navy');
    return root;
  }

  function flatten(root) {
    const out = [];
    (function walk(n) {
      out.push(n);
      n.kids.forEach(walk);
    })(root);
    return out;
  }

  function leafWeight(n) {
    return n.kids.length ? n.kids.reduce((s, k) => s + leafWeight(k), 0) : 1;
  }

  function sizeNodes(list, styleFor) {
    for (const n of list) {
      const st = styleFor(n);
      n.style = st;
      n.lines = wrapLines(n.label || 'Untitled', st.font, st.maxW - st.padX * 2);
      const widest = Math.max(...n.lines.map((l) => textWidth(l, st.font)), st.minW ? st.minW - st.padX * 2 : 0);
      n.w = Math.ceil(widest + st.padX * 2);
      n.h = Math.ceil(n.lines.length * st.lineH + st.padY * 2);
    }
  }

  function boundsOf(rects, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) {
      x0 = Math.min(x0, r.x - r.w / 2);
      y0 = Math.min(y0, r.y - r.h / 2);
      x1 = Math.max(x1, r.x + r.w / 2);
      y1 = Math.max(y1, r.y + r.h / 2);
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  /* ── Concept A: tidy tree (right-hand logic chart, two-sided, or indented for phones) ── */
  function layoutTidyTree(root, opts) {
    const mode = opts.mode;
    const hGap = opts.hGap ?? 44;
    const vGap = opts.vGap ?? 14;
    const list = flatten(root);
    sizeNodes(list, opts.styleFor);

    if (mode === 'indent') {
      let y = 0;
      for (const n of list) {
        n.side = 1;
        n.x = n.depth * (opts.indent ?? 26) + n.w / 2;
        n.y = y + n.h / 2;
        y += n.h + (n.depth === 0 ? 18 : 8);
      }
      return list;
    }

    const subH = (n) => (n._subH ??= Math.max(n.h, n.kids.reduce((s, k) => s + subH(k), 0) + vGap * Math.max(0, n.kids.length - 1)));
    const place = (n, nearX, top, side) => {
      n.side = side;
      n.x = nearX + (side * n.w) / 2;
      n.y = top + subH(n) / 2;
      const far = n.x + (side * n.w) / 2;
      let t = n.y - (n.kids.reduce((s, k) => s + subH(k), 0) + vGap * Math.max(0, n.kids.length - 1)) / 2;
      for (const k of n.kids) {
        place(k, far + side * hGap, t, side);
        t += subH(k) + vGap;
      }
    };

    root.x = 0;
    root.y = 0;
    root.side = 0;
    const right = [];
    const left = [];
    if (mode === 'both') {
      let wr = 0, wl = 0;
      for (const k of root.kids) {
        if (wr <= wl) { right.push(k); wr += leafWeight(k); }
        else { left.push(k); wl += leafWeight(k); }
      }
    } else right.push(...root.kids);

    for (const [group, side] of [[right, 1], [left, -1]]) {
      const total = group.reduce((s, k) => s + subH(k), 0) + vGap * Math.max(0, group.length - 1);
      let t = -total / 2;
      for (const k of group) {
        place(k, (side * root.w) / 2 + side * hGap, t, side);
        t += subH(k) + vGap;
      }
    }
    return list;
  }

  /* ── Concept B: organic radial layout (ellipse rings, sectors weighted by leaves) ── */
  function layoutRadial(root, opts) {
    const list = flatten(root);
    sizeNodes(list, opts.styleFor);
    const rings = opts.rings ?? [[0, 0], [250, 150], [470, 270]];
    const total = leafWeight(root) || 1;
    root.x = 0;
    root.y = 0;
    (function spread(n, a0, a1) {
      let a = a0;
      for (const k of n.kids) {
        const span = ((a1 - a0) * leafWeight(k)) / leafWeight(n);
        const mid = a + span / 2;
        const [rx, ry] = rings[Math.min(k.depth, rings.length - 1)];
        k.angle = mid;
        k.x = Math.round(Math.cos(mid) * rx);
        k.y = Math.round(Math.sin(mid) * ry);
        spread(k, a, a + span);
        a += span;
      }
    })(root, opts.start ?? -Math.PI / 2 - (Math.PI / total), (opts.start ?? -Math.PI / 2 - (Math.PI / total)) + Math.PI * 2);
    return list;
  }

  /* ── Concept A: layered concept map (cycles broken by DFS, barycentre ordering) ── */
  function layoutLayered(content, opts) {
    const nodes = content.nodes.map((n) => ({ ...n, depth: 1 }));
    sizeNodes(nodes, opts.styleFor);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = content.edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);

    const out = new Map(nodes.map((n) => [n.id, []]));
    edges.forEach((e) => out.get(e.from).push(e));
    const state = new Map();
    const reversed = new Set();
    const visit = (id) => {
      state.set(id, 1);
      for (const e of out.get(id)) {
        const s = state.get(e.to);
        if (s === 1) reversed.add(e.id);
        else if (!s) visit(e.to);
      }
      state.set(id, 2);
    };
    nodes.forEach((n) => state.get(n.id) || visit(n.id));
    const dag = edges.map((e) => (reversed.has(e.id) ? { ...e, from: e.to, to: e.from } : e));

    const layer = new Map(nodes.map((n) => [n.id, 0]));
    for (let i = 0; i < nodes.length; i++) {
      for (const e of dag) layer.set(e.to, Math.max(layer.get(e.to), layer.get(e.from) + 1));
    }
    const layers = [];
    nodes.forEach((n) => (layers[layer.get(n.id)] ||= []).push(n));

    const pos = new Map();
    const reindex = () => layers.forEach((l) => l.forEach((n, i) => pos.set(n.id, i)));
    reindex();
    for (let sweep = 0; sweep < 6; sweep++) {
      const down = sweep % 2 === 0;
      const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
      for (const l of order) {
        for (const n of l) {
          const nb = dag.filter((e) => (down ? e.to === n.id : e.from === n.id)).map((e) => pos.get(down ? e.from : e.to));
          n._bc = nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(n.id);
        }
        l.sort((a, b) => a._bc - b._bc);
        reindex();
      }
    }

    const colGap = opts.colGap ?? 36;
    const rowGap = opts.rowGap ?? 92;
    let y = 0;
    for (const l of layers) {
      const rowH = Math.max(...l.map((n) => n.h));
      const width = l.reduce((s, n) => s + n.w, 0) + colGap * (l.length - 1);
      let x = -width / 2;
      for (const n of l) {
        n.x = x + n.w / 2;
        n.y = y + rowH / 2;
        x += n.w + colGap;
      }
      y += rowH + rowGap;
    }
    return { nodes, edges, byId };
  }

  /* Point where the segment from a rect's centre toward (tx, ty) leaves the rect. */
  function rectExit(n, tx, ty, pad = 0) {
    const dx = tx - n.x;
    const dy = ty - n.y;
    if (!dx && !dy) return { x: n.x, y: n.y };
    const hw = n.w / 2 + pad;
    const hh = n.h / 2 + pad;
    const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: n.x + dx * s, y: n.y + dy * s };
  }

  function cubicAt(p, t) {
    const u = 1 - t;
    return {
      x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
      y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y
    };
  }

  function quadAt(p, t) {
    const u = 1 - t;
    return { x: u * u * p[0].x + 2 * u * t * p[1].x + t * t * p[2].x, y: u * u * p[0].y + 2 * u * t * p[1].y + t * t * p[2].y };
  }

  /* Filled tapered ribbon along a cubic — the organic branch in Concept B. */
  function taperedPath(p, w0, w1) {
    const N = 28;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(cubicAt(p, i / N));
    const left = [];
    const right = [];
    pts.forEach((pt, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(N, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * (i / N)) / 2;
      left.push(`${(pt.x - (dy / len) * w).toFixed(1)},${(pt.y + (dx / len) * w).toFixed(1)}`);
      right.push(`${(pt.x + (dy / len) * w).toFixed(1)},${(pt.y - (dx / len) * w).toFixed(1)}`);
    });
    return `M${left.join('L')}L${right.reverse().join('L')}Z`;
  }

  function textLines(n, x, color, anchor = 'middle', weight) {
    const st = n.style;
    const top = n.y - (n.lines.length * st.lineH) / 2 + st.lineH * 0.72;
    const tspans = n.lines
      .map((line, i) => `<tspan x="${x.toFixed(1)}" y="${(top + i * st.lineH).toFixed(1)}">${esc(line)}</tspan>`)
      .join('');
    return `<text font-size="${st.size}" font-weight="${weight ?? st.weight}" fill="${color}" text-anchor="${anchor}">${tspans}</text>`;
  }

  /* Label chips: try positions along the curve until one clears nodes and earlier chips. */
  function placeChips(chips, obstacles) {
    const placed = [];
    const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 6 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 4;
    for (const chip of chips) {
      let best = null;
      for (const t of [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75]) {
        const at = chip.at(t);
        const r = { x: at.x, y: at.y, w: chip.w, h: chip.h };
        if (![...obstacles, ...placed].some((o) => hit(r, o))) { best = r; break; }
        best ||= r;
      }
      chip.x = best.x;
      chip.y = best.y;
      placed.push(best);
    }
  }

  const CHIP_FONT = '500 12px Inter';
  function chipFor(label) {
    return { label, w: Math.ceil(textWidth(label, CHIP_FONT) + 18), h: 22 };
  }

  function chipSvg(c, extra = '') {
    return (
      `<g class="gm-chip" ${extra}><rect x="${(c.x - c.w / 2).toFixed(1)}" y="${(c.y - c.h / 2).toFixed(1)}" width="${c.w}" height="${c.h}" rx="11" fill="var(--paper)" stroke="var(--line)"/>` +
      `<text x="${c.x.toFixed(1)}" y="${(c.y + 4).toFixed(1)}" font-size="12" font-weight="500" fill="var(--orca)" text-anchor="middle">${esc(c.label)}</text></g>`
    );
  }

  function arrowDefs(id) {
    return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 L9 5 L1 8.8 Z" fill="var(--orca)"/></marker></defs>`;
  }

  function svgOpen(b, cls, natural = true) {
    const size = natural ? `width="${Math.ceil(b.w)}" height="${Math.ceil(b.h)}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}" ${size} role="img">`;
  }

  /* Kit .hub-pills with the sliding paper thumb (same custom properties as hub-motion.js). */
  function wirePills(group, onPick) {
    let thumb = group.querySelector(':scope > .hub-pills__thumb');
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'hub-pills__thumb';
      group.prepend(thumb);
    }
    const sync = () => {
      const on = group.querySelector('[aria-pressed="true"]');
      if (!on || !on.offsetWidth) return;
      group.style.setProperty('--hub-pill-w', `${on.offsetWidth}px`);
      group.style.setProperty('--hub-pill-h', `${on.offsetHeight}px`);
      group.style.setProperty('--hub-pill-x', `${on.offsetLeft}px`);
      group.style.setProperty('--hub-pill-y', `${on.offsetTop}px`);
      group.classList.add('is-ready');
      requestAnimationFrame(() => group.classList.add('is-animated'));
    };
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.hub-pills__btn');
      if (!btn) return;
      group.querySelectorAll('.hub-pills__btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      sync();
      onPick?.(btn.dataset.value);
    });
    new ResizeObserver(sync).observe(group);
    sync();
  }

  window.GraphMock = {
    wirePills,
    MIND,
    CONCEPT,
    BRANCH_COLOURS,
    LINK_VERBS,
    esc,
    textWidth,
    buildTree,
    flatten,
    leafWeight,
    sizeNodes,
    boundsOf,
    layoutTidyTree,
    layoutRadial,
    layoutLayered,
    rectExit,
    cubicAt,
    quadAt,
    taperedPath,
    textLines,
    placeChips,
    chipFor,
    chipSvg,
    arrowDefs,
    svgOpen,
    clone: (v) => JSON.parse(JSON.stringify(v))
  };
})();

// Renders <div class="flow" data-flow="NAME"> from window.FLOWS[NAME] = { nodes, edges }.
// Node kinds: person, ghost (role you haven't met), ext (governing body outside), group (team with dots).
// Edge types: reports (child → the person they report to), line (your reporting line),
// governs (dashed, to an outside body), dotted (works with, no arrow).
// A node may report to several others (list one edge per manager); a 4th value of true draws a two-way arrow.
(function () {
  const esc = (s) => s ?? '';
  function nodeHtml(n) {
    if (n.kind === 'person') return `<span class="wring ${n.warm}"><span class="avatar ${n.av}">${n.ini}</span></span><span class="stack"><span class="nm">${n.name}</span><span class="rl">${n.role}</span></span>`;
    if (n.kind === 'ghost') return `<span class="g"></span><span class="stack"><span class="nm">${n.role}</span><span class="rl">${n.note || "you haven't met"}</span></span>`;
    if (n.kind === 'ext') return `<span class="stack"><span class="rl">${n.tag || 'Outside body'}</span><span class="nm">${n.name}</span></span>`;
    return `<div class="gh"><span class="nm">${n.name}</span><i>${esc(n.count)}</i></div>` +
      `<div class="gb ${n.portsLeft ? 'rev' : ''}"><div class="dots" data-mix="${n.mix}" ${n.me ? 'data-me="true"' : ''}></div>${n.ports ? `<div class="ports">${n.ports}</div>` : ''}</div>`;
  }
  const flows = window.FLOWS || {};
  document.querySelectorAll('.flow[data-flow]').forEach((host) => {
    const spec = flows[host.dataset.flow];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'edges');
    svg.innerHTML = `<defs>
      <marker id="ar-${host.dataset.flow}-reports" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#a7abb9"/></marker>
      <marker id="ar-${host.dataset.flow}-line" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0a1536"/></marker>
      <marker id="ar-${host.dataset.flow}-governs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#424860"/></marker>
    </defs>`;
    host.append(svg);
    const els = {};
    spec.nodes.forEach((n) => {
      const el = document.createElement('div');
      el.className = `fn ${n.kind} ${n.cls || ''}`;
      el.id = n.id;
      Object.assign(el.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px` });
      el.innerHTML = nodeHtml(n);
      host.append(el);
      els[n.id] = el;
      if (n.here) {
        const tag = document.createElement('span');
        tag.className = 'here'; tag.textContent = n.here;
        Object.assign(tag.style, { left: `${n.x + 10}px`, top: `${n.y - 9}px` });
        host.append(tag);
      }
    });
    window.addEventListener('load', () => {
      const box = (id) => { const e = els[id]; return { l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight, cx: e.offsetLeft + e.offsetWidth / 2, cy: e.offsetTop + e.offsetHeight / 2 }; };
      spec.edges.forEach(([from, to, type = 'reports', both]) => {
        const a = box(from), b = box(to);
        let d;
        if (both && a.t > b.b) {
          d = `M${a.cx} ${a.t - 1} V${b.b + 1}`;
        } else if (a.t > b.b) {
          const midY = b.b + Math.max(10, (a.t - b.b) / 2);
          d = `M${a.cx} ${a.t} V${midY} H${b.cx} V${b.b + 1}`;
        } else {
          const [x1, x2] = a.cx < b.cx ? [a.r, b.l] : [a.l, b.r];
          d = `M${x1} ${a.cy} H${x2}`;
        }
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        const style = {
          reports: ['#a7abb9', 1.5, '0'], line: ['#0a1536', 2.5, '0'],
          governs: ['#424860', 1.5, '5 4'], dotted: ['#376fb7', 1.5, '2 4']
        }[type];
        p.setAttribute('stroke', style[0]); p.setAttribute('stroke-width', style[1]);
        p.setAttribute('stroke-dasharray', style[2]); p.setAttribute('stroke-linejoin', 'round');
        if (type !== 'dotted') p.setAttribute('marker-end', `url(#ar-${host.dataset.flow}-${type})`);
        // Two-way: shared authority, arrowheads at both ends
        if (both) p.setAttribute('marker-start', `url(#ar-${host.dataset.flow}-${type})`);
        if (type === 'line') svg.append(p); else svg.prepend(p);
      });
      svg.prepend(svg.querySelector('defs'));
    });
  });
})();

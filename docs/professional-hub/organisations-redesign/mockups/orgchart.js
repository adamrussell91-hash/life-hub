// Fills <div class="dots" data-mix="warm,cooling,cold"> with one dot per person,
// and draws ghost links between elements named in [data-link="from|to|kind|strong|num"].
document.querySelectorAll('.dots[data-mix]').forEach((host) => {
  const [w, c, k] = host.dataset.mix.split(',').map(Number);
  const me = host.dataset.me === 'true';
  const add = (cls) => { const d = document.createElement('i'); d.className = `dot ${cls}`; host.append(d); };
  if (me) add('me');
  for (let i = 0; i < w; i++) add('w');
  for (let i = 0; i < c; i++) add('c');
  for (let i = 0; i < k; i++) add('k');
  // data-y9='n' rings n people as part of the highlighted group, starting at data-y9-from
  const hl = Number(host.dataset.y9 || 0), from = Number(host.dataset.y9From || 1);
  [...host.children].slice(from, from + hl).forEach((d) => d.classList.add('y9'));
});

function drawLinks() {
  const svg = document.querySelector('svg.ghosts');
  if (!svg) return;
  const box = svg.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  document.querySelectorAll('[data-link]').forEach((spec) => {
    const [fromId, toId, kind, strong, num] = spec.dataset.link.split('|');
    const a = document.getElementById(fromId).getBoundingClientRect();
    const b = document.getElementById(toId).getBoundingClientRect();
    const x1 = a.right - box.left + 4, y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left - 4, y2 = b.top + b.height / 2 - box.top;
    const mid = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `var(--link-${kind})`);
    path.setAttribute('stroke-width', strong ? '2.5' : '1.6');
    path.setAttribute('stroke-dasharray', strong ? '0' : '5 5');
    path.setAttribute('opacity', strong ? '0.85' : '0.45');
    svg.append(path);
    [[x1, y1], [x2, y2]].forEach(([cx, cy]) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 3);
      c.setAttribute('fill', `var(--link-${kind})`); c.setAttribute('opacity', strong ? '1' : '0.6');
      svg.append(c);
    });
    if (num) {
      // Numbered badge at the curve's midpoint, matching the reason list
      const cy = (y1 + y2) / 2;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = `<circle cx="${mid}" cy="${cy}" r="11" fill="var(--link-${kind})"/>` +
        `<text x="${mid}" y="${cy + 4}" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#fff">${num}</text>`;
      svg.append(g);
    }
  });
}
window.addEventListener('load', drawLinks);

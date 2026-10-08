/**
 * A watch drawn from its Notion record, in millimetres, so every watch shares one scale.
 * The viewBox is 60 × 110 mm. Dial and strap colours are content (from the record), not UI chrome.
 * When a photo exists for the watch (watch-photos.js) the renderer shows that instead.
 */
const NS = 'http://www.w3.org/2000/svg';

export const DIAL_COLOURS = { Black: '#17181c', White: '#f4f2ec', Silver: '#c9ccd1', Cream: '#ece0c4', Blue: '#1f3f78', Green: '#2f5a43', Brown: '#5b3a26', Gold: '#c9a24a', Champagne: '#d9c597', 'Red / Burgundy': '#6d2030', Other: '#8c8f96' };
const STRAP_COLOURS = { Black: '#1b1b1f', Brown: '#5a3522', 'Tan / Cognac': '#9a5b2c', Silver: '#b9bdc3', Gold: '#c9a24a', Blue: '#22355f', Green: '#55603a', White: '#eeeeea', Other: '#7d7f86' };
const METAL = { rose: '#c99178', gold: '#c9a24a', steel: '#c4c8ce' };

const luminous = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150; };
function metalOf(w) {
  if (/rose/i.test(w.caseMaterial ?? '') || w.handsColour === 'Rose gold' || /rose gold/i.test(w.notes)) return METAL.rose;
  if (/gold/i.test(w.caseMaterial ?? '') || w.handsColour === 'Gold') return METAL.gold;
  return METAL.steel;
}

export function watchFace(doc, w, { px = 110, time = { h: 10, m: 9, s: 36 } } = {}) {
  const s = (tag, attrs = {}, ...kids) => {
    const n = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
    n.append(...kids);
    return n;
  };
  const mm = w.mm || 40, r = mm / 2, cx = 30, cy = 55, lw = w.lugWidth || Math.round(mm * 0.5);
  const metal = metalOf(w);
  const dial = DIAL_COLOURS[w.dial] ?? DIAL_COLOURS.Other;
  const bracelet = w.strapMaterial === 'Metal bracelet';
  const strap = STRAP_COLOURS[w.strap] ?? (bracelet ? METAL.steel : STRAP_COLOURS.Brown);
  const ink = luminous(dial) ? '#1d2230' : '#f1ede4';
  const hand = { Lumed: '#e8efe0', 'Rose gold': METAL.rose, Gold: METAL.gold, Blue: '#2d56b3', Black: '#111111' }[w.handsColour] ?? ink;
  const svg = s('svg', { class: 'aes-watch', viewBox: '0 0 60 110', width: px, height: Math.round((px * 110) / 60), role: 'img', 'aria-label': `${w.name}, ${w.mm ? `${w.mm} mm` : 'size not recorded'}` });

  const band = (y, h) => {
    svg.append(s('rect', { x: cx - lw / 2, y, width: lw, height: h, rx: 1.5, fill: strap }));
    if (bracelet) for (let i = y + 3; i < y + h; i += 3.2) svg.append(s('line', { x1: cx - lw / 2, x2: cx + lw / 2, y1: i, y2: i, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 0.35 }));
    else svg.append(s('rect', { x: cx - lw / 2 + 1.2, y, width: lw - 2.4, height: h, fill: 'none', stroke: 'rgba(255,255,255,.18)', 'stroke-width': 0.3, 'stroke-dasharray': '1 1' }));
  };
  band(0, cy - r + 2);
  band(cy + r - 2, 110 - (cy + r - 2));
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) svg.append(s('rect', { x: cx + sx * (lw / 2 + 0.2) - (sx < 0 ? 2.4 : 0), y: cy + sy * r * 0.78 - (sy < 0 ? 6 : 0), width: 2.4, height: 6, rx: 0.8, fill: metal }));
  svg.append(s('rect', { x: cx + r - 0.5, y: cy - 2.2, width: 2.6, height: 4.4, rx: 0.8, fill: metal }));
  svg.append(s('circle', { cx, cy, r, fill: metal, stroke: w.mm ? null : 'currentColor', 'stroke-dasharray': w.mm ? null : '1.5 1.2', 'stroke-width': 0.5 }));
  const dr = r * 0.86;
  svg.append(s('circle', { cx, cy, r: dr, fill: dial }));

  const at = (deg, d) => [cx + Math.sin((deg * Math.PI) / 180) * d, cy - Math.cos((deg * Math.PI) / 180) * d];
  const mk = w.markers, cxs = w.complications;
  const roman = { 0: 'XII', 3: 'III', 6: 'VI', 9: 'IX' }, arabic = { 0: '12', 3: '3', 6: '6', 9: '9' };
  const markInk = mk.includes('Applied') ? hand : ink;
  for (let i = 0; i < 12; i++) {
    const deg = i * 30;
    const numeral = i % 3 === 0 && (mk.includes('Roman') || mk.includes('Arabic'));
    const covered = (cxs.includes('Chronograph') && (i === 3 || i === 9)) || (cxs.includes('Moonphase') && i === 6);
    if (numeral && !covered) {
      const [x, y] = at(deg, dr * 0.74);
      svg.append(s('text', { x, y: y + dr * 0.07, 'text-anchor': 'middle', 'font-size': dr * 0.2, 'font-family': 'Georgia, serif', fill: markInk }, mk.includes('Roman') ? roman[i] : arabic[i]));
    } else if (mk.includes('Dot')) {
      const [x, y] = at(deg, dr * 0.84);
      svg.append(s('circle', { cx: x, cy: y, r: dr * 0.04, fill: ink }));
    } else if (!covered) {
      const [x1, y1] = at(deg, dr * 0.92), [x2, y2] = at(deg, dr * (i % 3 ? 0.82 : 0.72));
      svg.append(s('line', { x1, y1, x2, y2, stroke: markInk, 'stroke-width': i % 3 ? dr * 0.03 : dr * 0.06, 'stroke-linecap': 'round' }));
    }
  }
  if (cxs.includes('Chronograph')) for (const deg of [90, 180, 270]) { const [x, y] = at(deg, dr * 0.45); svg.append(s('circle', { cx: x, cy: y, r: dr * 0.2, fill: 'none', stroke: ink, 'stroke-width': 0.35, opacity: 0.8 })); }
  if (cxs.includes('Moonphase')) {
    const [x, y] = at(180, dr * 0.48);
    svg.append(s('path', { d: `M${x - dr * 0.28} ${y} A${dr * 0.28} ${dr * 0.28} 0 0 1 ${x + dr * 0.28} ${y} Z`, fill: '#13224a' }), s('circle', { cx: x + dr * 0.06, cy: y - dr * 0.12, r: dr * 0.08, fill: '#e9d9a2' }));
  }
  if (cxs.includes('Day Date')) { const [x, y] = at(90, dr * 0.55); svg.append(s('rect', { x: x - dr * 0.2, y: y - dr * 0.07, width: dr * 0.32, height: dr * 0.14, fill: '#f4f2ec', stroke: ink, 'stroke-width': 0.2 })); }
  else if (cxs.includes('Date') && !cxs.includes('Chronograph')) { const [x, y] = at(90, dr * 0.6); svg.append(s('rect', { x: x - dr * 0.08, y: y - dr * 0.07, width: dr * 0.16, height: dr * 0.14, fill: '#f4f2ec' })); }
  if (cxs.includes('GMT / Dual Time') && !cxs.includes('Moonphase')) { const [x, y] = at(60, dr * 0.45); svg.append(s('circle', { cx: x, cy: y, r: dr * 0.2, fill: 'none', stroke: ink, 'stroke-width': 0.35 })); }

  const rot = deg => `rotate(${deg} ${cx} ${cy})`;
  svg.append(
    s('line', { x1: cx, y1: cy, x2: cx, y2: cy - dr * 0.5, stroke: hand, 'stroke-width': dr * 0.07, 'stroke-linecap': 'round', transform: rot(((time.h % 12) + time.m / 60) * 30), class: 'aes-watch__hour' }),
    s('line', { x1: cx, y1: cy, x2: cx, y2: cy - dr * 0.78, stroke: hand, 'stroke-width': dr * 0.045, 'stroke-linecap': 'round', transform: rot(time.m * 6), class: 'aes-watch__minute' }),
    s('line', { x1: cx, y1: cy + dr * 0.15, x2: cx, y2: cy - dr * 0.85, stroke: '#b23a2e', 'stroke-width': dr * 0.015, transform: rot(time.s * 6), class: 'aes-watch__second' }),
    s('circle', { cx, cy, r: dr * 0.04, fill: hand }),
    s('circle', { cx: cx - dr * 0.3, cy: cy - dr * 0.35, r: dr * 0.55, fill: '#ffffff', opacity: 0.06 }));
  return svg;
}

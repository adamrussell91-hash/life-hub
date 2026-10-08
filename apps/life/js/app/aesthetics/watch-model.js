/**
 * Watches: pure logic for Aesthetics › Dress › Watches.
 * Records come from the Notion snapshot (notion-watch-source.js); nothing here invents a spec.
 */
import { SOURCE_WATCHES } from './notion-watch-source.js';

const list = v => (Array.isArray(v) ? v : v ? [v] : []);

export function normaliseWatch(src) {
  const p = src.properties;
  return {
    id: src.id,
    name: p.Watch,
    brand: p.Brand ?? null,
    model: p.Model ?? null,
    status: p.Status ?? p.Ownership ?? 'Wishlist',
    category: p.Category ?? null,
    price: p.Price ?? null,
    url: p['Product URL'] ?? null,
    movement: p['Movement Type'] ?? null,
    dial: p['Dial / Face Colour'] ?? null,
    strap: p['Strap / Bracelet Colour'] ?? null,
    strapMaterial: p['Strap / Bracelet Material'] ?? null,
    mm: p['Case Diameter mm'] ?? null,
    thickness: p['Thickness mm'] ?? null,
    lugWidth: p['Lug Width mm'] ?? null,
    lugToLug: p['Lug to Lug mm'] ?? null,
    caseMaterial: p['Case Material'] ?? null,
    caseBack: p['Case Back'] ?? null,
    origin: p.Origin ?? null,
    markers: list(p.Markers),
    handsStyle: p['Hands Style'] ?? null,
    handsColour: p['Hands Colour'] ?? null,
    complications: list(p.Complications),
    notes: p.Notes ?? '',
    source: src
  };
}

export const WATCHES = SOURCE_WATCHES.map(normaliseWatch);
export const isOwned = w => w.status === 'Owned';
/** Passed watches stay in the record list but leave the wishlist and the radar. */
export const isWanted = w => !isOwned(w) && w.status !== 'Passed';

/** "Fossil Neutra Chronograph – Cream / Brown Leather" → model "Fossil Neutra Chronograph", colourway "Cream / Brown Leather". */
export const modelName = name => name.split(' – ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
export const colourway = name => name.split(' – ')[1] ?? '';

/** Colourways of one model share a card and one radar blip. */
export function groupByModel(watches) {
  const groups = [];
  for (const w of watches) {
    const key = w.name.split(' – ')[0];
    const g = groups.find(x => x.key === key);
    if (g) g.items.push(w);
    else groups.push({ key, name: modelName(w.name), items: [w] });
  }
  return groups;
}

// ---------------- today's watch ----------------
const BROWN_LEATHER = new Set(['chocolate', 'cognac', 'tan', 'camel']);
const BROWN_STRAPS = new Set(['Brown', 'Tan / Cognac']);
const DIAL_ECHO = { Blue: ['navy', 'blue', 'denim', 'powder blue'], Black: ['black', 'charcoal'], White: ['white', 'cream'], Cream: ['cream', 'white'], Green: ['olive', 'pistachio'], Brown: ['chocolate', 'cognac', 'tan'] };
const STRAP_ECHO = { Blue: ['navy', 'blue', 'denim'], Green: ['olive', 'pistachio'], Black: ['black'] };

/** The leather that matters for a strap is the shoes and the belt or other accent. */
export function lookLeather(look) {
  const leathers = [look.shoes, look.accent].filter(p => /belt|loafers|boots|shoes|chelsea/i.test(p[1])).map(p => p[0]);
  if (leathers.some(c => BROWN_LEATHER.has(c))) return 'brown';
  if (leathers.includes('black')) return 'black';
  return null;
}
const lookColours = look => [look.outer, look.top, look.bottom, look.shoes, look.accent].map(p => p[0]);
const leatherPieces = look => [look.shoes, look.accent].filter(p => BROWN_LEATHER.has(p[0]) || p[0] === 'black').map(p => `${p[0]} ${p[1]}`);

export function scoreForLook(w, look) {
  const leather = lookLeather(look);
  const colours = lookColours(look);
  const reasons = [];
  let score = 0;
  const metal = w.strapMaterial === 'Metal bracelet';
  if (!metal && leather === 'brown' && BROWN_STRAPS.has(w.strap)) { score += 3; reasons.push(`the ${w.strap.toLowerCase()} strap goes with the ${leatherPieces(look).join(' and ')}`); }
  else if (!metal && leather === 'black' && w.strap === 'Black') { score += 3; reasons.push(`black strap with the ${leatherPieces(look).join(' and ')}, so the leathers match`); }
  else if (metal) { score += 1; reasons.push('a steel bracelet needs no leather to match'); }
  else if (leather && w.strap) { score -= 1; reasons.push(`the ${w.strap.toLowerCase()} strap clashes with the ${leather} leather, so keep the belt quiet`); }
  const dialHit = (DIAL_ECHO[w.dial] ?? []).find(c => colours.includes(c));
  if (dialHit) { score += 2; reasons.push(`the ${w.dial.toLowerCase()} dial picks up the ${dialHit}`); }
  const strapHit = !metal && (STRAP_ECHO[w.strap] ?? []).find(c => colours.includes(c) && c !== dialHit);
  if (strapHit) { score += 1; reasons.push(`the strap repeats the ${strapHit}`); }
  if (w.category === 'Dress' && /old money|luxury|classic|refined|expensive|elevated|luxurious/i.test(look.vibe)) score += 1;
  return { watch: w, score, reasons };
}

/** Owned watches ranked for a look. Yesterday's watch drops one place so the box rotates. */
export function rankForLook(owned, look, { lastWornId = null } = {}) {
  return owned.map(w => scoreForLook(w, look))
    .map(r => ({ ...r, score: r.score - (r.watch.id === lastWornId ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score || (a.watch.name < b.watch.name ? -1 : 1));
}

export function lookLine(pick, look) {
  const why = pick.reasons.length ? pick.reasons.join(', and ') : 'it is the one you have worn least lately';
  return `With today's ${look.vibe} look: ${why}.`;
}

// ---------------- the box ----------------
export function boxFacts(owned, wanted) {
  const sized = owned.filter(w => w.mm);
  const avg = sized.length ? Math.round(sized.reduce((a, w) => a + w.mm, 0) / sized.length) : null;
  const big = sized.filter(w => w.mm >= 42).length;
  const dress = owned.filter(w => w.category === 'Dress').length;
  const autos = owned.filter(w => /automatic|hand wound/i.test(w.movement ?? ''));
  const chronoOwned = owned.filter(w => w.complications.includes('Chronograph')).length;
  const chronoWanted = wanted.filter(w => w.complications.includes('Chronograph')).length;
  const facts = [
    { value: `${dress}/${owned.length}`, text: 'are dress watches.' },
    avg ? { value: `${avg} mm`, text: `average case. ${big} of the ${sized.length} measured are 42 mm or more.` } : null,
    { value: String(owned.length - autos.length), text: `run on quartz or solar. ${autos.length ? `${autos.length} mechanical: ${autos.map(w => modelName(w.name)).join(', ')}.` : 'None are mechanical.'}` },
    { value: String(chronoOwned), text: `chronograph${chronoOwned === 1 ? '' : 's'} owned. ${chronoWanted} on the wishlist.` },
    { value: String(wanted.length), text: `on the wishlist against ${owned.length} owned.` }
  ];
  return facts.filter(Boolean);
}

/** What a wished-for watch would add that nothing in the box has. */
export function freshTags(w, owned) {
  const has = key => new Set(owned.flatMap(o => list(o[key])));
  const tags = [];
  const cx = has('complications');
  for (const c of w.complications) if (!cx.has(c) && c !== 'Date' && c !== 'Day Date') tags.push(c);
  if (w.movement && !has('movement').has(w.movement)) tags.push(w.movement.replace('Mechanical: ', ''));
  if (w.dial && w.dial !== 'Other' && !has('dial').has(w.dial)) tags.push(`${w.dial} dial`);
  if (w.origin && w.origin !== 'Other' && !has('origin').has(w.origin)) tags.push(w.origin);
  return [...new Set(tags)].slice(0, 3);
}

// ---------------- price radar ----------------
/** A brand homepage or collection page cannot be checked for one watch's price. */
export function isTrackable(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return !(u.pathname === '/' || u.pathname === '' || /\/collections\/[^/]+\/?$/.test(u.pathname));
  } catch { return false; }
}
export function radarCoverage(wanted) {
  const tracked = wanted.filter(w => isTrackable(w.url)).length;
  const homepage = wanted.filter(w => w.url && !isTrackable(w.url)).length;
  return { tracked, homepage, missing: wanted.length - tracked - homepage, total: wanted.length };
}
/** Starting target: 15% under the price recorded in Notion, rounded to $5. */
export const defaultTarget = price => (price ? Math.round((price * 0.85) / 5) * 5 : null);

/** 0 at or under target, 1 within 10%, 2 within 25%, 3 further, null when it can't be placed. */
export function zoneFor(price, target) {
  if (!price || !target) return null;
  const r = price / target;
  return r <= 1 ? 0 : r <= 1.1 ? 1 : r <= 1.25 ? 2 : 3;
}
/** Distance from the radar centre, 0..1, continuous across ring edges. */
export function radiusFor(price, target) {
  const z = zoneFor(price, target);
  if (z == null) return 1;
  const r = price / target;
  if (z === 0) return 0.25 * Math.max(0.15, Math.min(1, r)) * 0.9;
  if (z === 1) return 0.25 + 0.25 * ((r - 1) / 0.1);
  if (z === 2) return 0.5 + 0.25 * ((r - 1.1) / 0.15);
  return Math.min(0.95, 0.75 + 0.2 * ((r - 1.25) / 0.5));
}

/**
 * One radar item per model. The live price is the cheapest checked colourway;
 * before any check it falls back to the Notion price and says so.
 */
export function radarItems(groups, { readings = {}, targets = {} } = {}) {
  return groups.map(g => {
    const checked = g.items.map(w => ({ w, r: readings[w.id] })).filter(x => x.r?.aud);
    checked.sort((a, b) => a.r.aud - b.r.aud);
    const lead = checked[0]?.w ?? g.items.find(w => w.price) ?? g.items[0];
    const reading = checked[0]?.r ?? null;
    const notionPrice = lead.price ?? null;
    const price = reading?.aud ?? notionPrice;
    const target = targets[g.key] ?? defaultTarget(notionPrice ?? reading?.aud);
    const trackable = g.items.some(w => isTrackable(w.url));
    return {
      key: g.key, name: g.name, group: g, watch: lead, reading, notionPrice, price, target, trackable,
      live: Boolean(reading),
      zone: trackable ? zoneFor(price, target) : null
    };
  });
}

/** Weekly drops worth telling Adam about, newest first. */
export function pingsFrom(items) {
  const out = [];
  for (const it of items) {
    const h = it.reading?.history ?? [];
    if (h.length < 2) continue;
    const [prev, last] = [h.at(-2), h.at(-1)];
    if (last.aud < prev.aud) out.push({ item: it, from: prev.aud, to: last.aud, at: last.at, underTarget: it.target != null && last.aud <= it.target });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export const formatAud = n => `A$${Math.round(n).toLocaleString('en-AU')}`;

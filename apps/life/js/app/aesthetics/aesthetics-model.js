/**
 * Pure logic for the Aesthetics section (Today, Scent, Dress).
 * No DOM. Everything here is unit-tested in tests/unit/aesthetics-model.test.js.
 */
import { FRAGRANCES, LONGEVITY, REFERENCE_FRAGRANCES } from './fragrance-library.js';
import { GARMENT_COLOURS, LOOKS } from './dress-looks.js';

export const SEASONS = [
  { code: 'Sp', name: 'spring' },
  { code: 'Su', name: 'summer' },
  { code: 'Au', name: 'autumn' },
  { code: 'Wi', name: 'winter' }
];

/** Sydney seasons by month. `date` is 'YYYY-MM-DD'. */
export function sydneySeason(date) {
  const month = Number(String(date).slice(5, 7));
  if (month >= 9 && month <= 11) return 'Sp';
  if (month === 12 || month <= 2) return 'Su';
  if (month <= 5) return 'Au';
  return 'Wi';
}

export const seasonName = code => SEASONS.find(s => s.code === code)?.name ?? '';

/** 7.5 → "7:30am", 19 → "7pm". */
export function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
}

const hoursFor = f => LONGEVITY[f.longevity ?? 2].hours;
const owned = list => list.filter(f => f.status === 'Owned');

/** Owned bottles ranked for a season, time of day ('D' | 'N') and occasion. */
export function rankScents({ fragrances = FRAGRANCES, season, time, occasion = 'Casual', exclude = [], lastWorn = null } = {}) {
  return owned(fragrances)
    .filter(f => !exclude.includes(f.name))
    .map(f => {
      let score = 0;
      score += f.seasons.includes(season) ? 3 : -4;
      score += f.time.includes(time) ? 2 : -2;
      if (f.occasions.includes(occasion)) score += 3;
      if (f.occasions.includes('Signature Scent') && (occasion === 'Date Night' || occasion === 'Formal')) score += 1;
      score += (f.rating ?? 0) / 10;
      score += (f.longevity ?? 2) / 20;
      if (lastWorn && f.name === lastWorn) score -= 1.5; // gentle rotation
      return { fragrance: f, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(r => r.fragrance);
}

const GYM = /\b(gym|workout|training|run|swim|pilates|yoga|boxing|lift)\b/i;
const FORMAL = /\b(wedding|gala|formal|ceremony|awards?)\b/i;
const DATE = /\b(dinner|date|drinks|corey|anniversary|party|bar|restaurant)\b/i;

function toHour(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

const SKIP_TYPES = new Set(['meal', 'diary', 'skincare', 'weight', 'composition', 'measurements', 'bloods', 'sleep', 'knowledge_page', 'task']);

/**
 * Timed events for the ribbon: { hour, title, kind: 'gym' | 'evening' | 'day' }.
 * Logs (meals, diary, skincare) are skipped, a run of lessons collapses to one
 * "Teaching" marker, and the ribbon keeps at most five markers.
 */
export function dayAnchors(events = []) {
  const timed = events
    .filter(e => !SKIP_TYPES.has(e.type))
    .map(e => ({ hour: toHour(e.time), title: String(e.title ?? '').trim(), type: e.type }))
    .filter(e => e.hour != null && e.hour >= 5 && e.title)
    .sort((a, b) => a.hour - b.hour);
  const firstLesson = timed.find(e => e.type === 'scheduled_lesson');
  const collapsed = timed
    .filter(e => e.type !== 'scheduled_lesson' || e === firstLesson)
    .map(e => (e === firstLesson ? { ...e, title: 'Teaching' } : e));
  const anchors = collapsed.map(e => ({
    hour: e.hour,
    title: e.title,
    kind: e.type === 'workout' || GYM.test(e.title) ? 'gym' : e.hour >= 17 ? 'evening' : 'day'
  }));
  if (anchors.length <= 5) return anchors;
  const keep = new Set([anchors[0], anchors.find(a => a.kind === 'gym'), anchors.find(a => a.kind === 'evening')].filter(Boolean));
  for (const a of anchors) if (keep.size < 5) keep.add(a);
  return anchors.filter(a => keep.has(a));
}

/**
 * Today's scent plan: what to spray, when it fades, and whether to change for the evening.
 * `index` steps through alternatives ("Not feeling it").
 */
export function planScentDay({ date, events = [], fragrances = FRAGRANCES, index = 0, lastWorn = null } = {}) {
  const season = sydneySeason(date);
  const anchors = dayAnchors(events);
  const gym = anchors.find(a => a.kind === 'gym');
  const evening = anchors.find(a => a.kind === 'evening');
  const firstDay = anchors.find(a => a.kind !== 'evening');

  const dayRank = rankScents({ fragrances, season, time: 'D', occasion: 'Casual', lastWorn });
  const eveningOccasion = evening ? (FORMAL.test(evening.title) ? 'Formal' : DATE.test(evening.title) ? 'Date Night' : 'Casual') : 'Date Night';
  const nightRankAll = rankScents({ fragrances, season, time: 'N', occasion: eveningOccasion });
  // Keep the evening scent for the evening: the day list skips whichever bottle the evening would pick.
  const nightDefault = evening ? nightRankAll[0] : null;
  const dayChoices = dayRank.filter(f => f !== nightDefault);
  const day = dayChoices[((index % dayChoices.length) + dayChoices.length) % dayChoices.length];
  const night = evening ? nightRankAll.find(f => f !== day) : null;

  const sprayAt = Math.max(6, Math.min(7.5, firstDay ? firstDay.hour - 0.5 : 7.5));
  const hours = hoursFor(day);
  const fadeAt = sprayAt + hours;
  const swapAt = evening ? evening.hour - 0.5 : null;

  const top = day.notes.slice(0, day.tiers[0] || 2);
  const heartBase = day.notes.slice(day.tiers[0]);
  const notes = [
    {
      title: `${formatHour(sprayAt)} · one spray`,
      body: top.length
        ? `The ${listOf(top.slice(0, 2).map(proseNote))} opening settles in half an hour. Then it's ${listOf(heartBase.slice(0, 2).map(proseNote))} for the rest.`
        : `Built from the base up: ${listOf(day.notes.slice(0, 3).map(proseNote))}.`
    },
    gym
      ? fadeAt <= gym.hour
        ? { title: `Gone by ${formatHour(fadeAt)}`, body: `Nicely timed. Nothing fighting ${proseNote(gym.title)} at ${formatHour(gym.hour)}.` }
        : { title: `Still there at ${formatHour(gym.hour)}`, body: `Faint by ${proseNote(gym.title)}, so skip a top-up until you've showered.` }
      : fadeAt < 15
        ? { title: `Fades around ${formatHour(fadeAt)}`, body: 'One more spray at lunch carries it to the end of the day.' }
        : { title: `Lasts to ${formatHour(Math.min(fadeAt, 22))}`, body: 'One spray covers the whole day.' }
  ];
  if (evening && night) {
    notes.push({ title: `${formatHour(swapAt)} · change for ${evening.title}`, body: `${night.name} tonight.${night.quote ? ` ${night.quote}` : ''}` });
  } else {
    notes.push({ title: 'Free evening', body: 'Nothing on tonight, so nothing to change.' });
  }

  return {
    season,
    day,
    night,
    dayChoiceCount: dayChoices.length,
    sprayAt,
    fadeAt,
    swapAt,
    hours,
    anchors,
    notes,
    line: gym && fadeAt <= gym.hour
      ? `About ${hours} hours on skin, so it's worn off before ${proseNote(gym.title)}.`
      : fadeAt >= 15
      ? `Lasts about ${hours} hours, so one spray at ${formatHour(sprayAt)} carries you through the working day.`
      : hours >= 5
        ? `About ${hours} hours on skin. A top-up at lunch takes it to the end of the day.`
        : `A lighter one: about ${hours} hours. Keep it in your bag for a lunchtime top-up.`
  };
}

/** Notes in running prose: "Tonka Bean" → "tonka bean", but "ISO E Super" keeps its capitals. */
export const proseNote = n => (/\b[A-Z]{2,}\b/.test(n) ? String(n) : String(n).replace(/\b([A-Z])([a-z])/g, (_, a, b) => a.toLowerCase() + b));

function listOf(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
export { listOf };

/** The outfit that goes with a scent: its paired look, else one from the same mood. */
export function lookForScent(name) {
  return LOOKS.find(l => l.scent === name) ?? LOOKS[0];
}

// ---------------- Scent map ----------------
// Each fragrance is placed from its own notes: across = fresh → warm, up = dry → sweet.
const WARMTH = {
  Vanilla: 2, Amber: 2, 'Tonka Bean': 2, Benzoin: 2, Labdanum: 2, Cinnamon: 2, Tobacco: 2, Praline: 2, Cocoa: 2, Coffee: 2, Rum: 2, Oud: 2, Leather: 2, 'Tolu Balsam': 2, Honey: 2,
  Nutmeg: 1, Clove: 1, Saffron: 1, Cardamom: 1, Incense: 1, Olibanum: 1, Myrrh: 1, Styrax: 1, Patchouli: 1, Sandalwood: 1, Plum: 1, Davana: 1, Chestnut: 1, Tuberose: 1, Akigalawood: 1, Cumin: 1,
  Cashmeran: 0.5, 'Dry Wood': 0.5, 'Bay Laurel': 0.5, 'Cashmere wood': 0.5, Vetiver: 0.3, 'Bourbon vetiver': 0.3, 'Haitian vetiver': 0.3,
  Bergamot: -1, Lemon: -2, Citron: -2, Grapefruit: -2, Mandarin: -1, Petitgrain: -1, Mint: -2, Marine: -2, 'Sea Notes': -2, Salt: -2, Aldehydes: -1, Apple: -1, Pear: -1, Lavender: -1,
  Fennel: -1, 'Violet Leaf': -1, Cypress: -1, Tea: -1, 'Clary Sage': -1, Geranium: -1, Neroli: -1, Ambroxan: -1, 'ISO E Super': -1, 'Black Pepper': -0.5, 'Pink Pepper': -0.5,
  'Cedar Leaf': -1, 'Water Hyacinth': -1, Olive: -1, 'Tomato Leaf': -2, Juniper: -1, Mate: -1, Ginger: -1, Tarragon: -1, Musk: -0.3
};
const SWEETNESS = {
  Vanilla: 2, 'Tonka Bean': 2, Praline: 2, Cocoa: 2, Coconut: 2, 'Sour Cherry': 2, Raspberry: 2, Honey: 1, Pandan: 1, 'Bitter Almond': 1, Peach: 1, Plum: 1, 'Black Currant': 1,
  Tuberose: 1, Jasmine: 1, Rose: 1, Magnolia: 1, Fig: 1, Benzoin: 1, Rum: 1, Davana: 1, Apple: 1, Pear: 1, Chestnut: 1, Amber: 0.5, Cinnamon: 0.5, Coffee: 0.5, Mandarin: 0.5,
  Vetiver: -2, 'Bourbon vetiver': -2, 'Haitian vetiver': -2, 'Vetiveryl acetate': -2, Cypress: -2, Incense: -2, Oud: -2, Leather: -2, Oakmoss: -2, 'Dry Wood': -2, Cypriol: -2,
  Cedarwood: -1, 'Black Pepper': -1, Patchouli: -1, 'Cashmere wood': -1, 'Guaiac Wood': -1, 'Teak Wood': -1, Salt: -1, Fennel: -1, 'Orris Root': -1, 'Cedar Leaf': -1, Akigalawood: -1,
  Olibanum: -1, Myrrh: -1, Clove: -1, Cumin: -1, 'Tomato Leaf': -1, Elemi: -1, Mate: -1, Olive: -1,
  Tea: -0.5, Ambroxan: -0.5, Iris: -0.5, 'ISO E Super': -0.5, Tobacco: -0.5, Saffron: -0.5, Cardamom: -0.5
};
const axis = (notes, table) => {
  const v = notes.map(n => table[n]).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / Math.sqrt(v.length) : 0;
};
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** { x: fresh(−) → warm(+), y: dry(−) → sweet(+) }, with a small fixed nudge so near-twins don't stack. */
export function placeOnMap(fragrance) {
  const h = hash(fragrance.name);
  return {
    x: axis(fragrance.notes, WARMTH) + ((h % 100) / 100 - 0.5) * 0.45,
    y: axis(fragrance.notes, SWEETNESS) + (((h >> 8) % 100) / 100 - 0.5) * 0.45
  };
}

/** What the map shows about Adam's taste, as sentences built from the placements. */
export function mapInsight(fragrances = FRAGRANCES) {
  const placed = fragrances.map(f => ({ f, ...placeOnMap(f) }));
  const mine = placed.filter(p => p.f.status === 'Owned');
  const sweet = mine.filter(p => p.y > 0.4);
  const lovedDry = placed.filter(p => p.f.loved && p.f.status !== 'Owned' && p.y < 0).map(p => p.f.name);
  const ownedDry = mine.filter(p => p.y < 0).map(p => p.f.name);
  const lovedWarm = placed.filter(p => p.f.loved && p.f.status !== 'Owned' && p.x > 1 && p.y < 1.5).map(p => p.f.name);
  const parts = [];
  if (sweet.length > mine.length / 2) parts.push(`Your shelf has a sweet tooth: ${sweet.length} of ${mine.length} bottles sit in the top half.`);
  if (lovedDry.length) parts.push(`But ${listOf(lovedDry)}, which you loved, ${lovedDry.length > 1 ? 'are' : 'is'} bone dry, and down there you own only ${ownedDry.length ? listOf(ownedDry) : 'nothing'}.`);
  if (lovedWarm.length) parts.push(`${listOf(lovedWarm)} ${lovedWarm.length > 1 ? 'say' : 'says'} the same on the warm side: spice and resin with less sugar than your gourmands.`);
  parts.push('Your next bottle is in the lower half. Steer clear of the red haze, where oud and hard smoke live.');
  return parts.join(' ');
}

// ---------------- Would I like it? ----------------
export function noteAffinity(fragrances = FRAGRANCES) {
  const aff = {};
  const bump = (f, w) => f.notes.forEach(n => { const k = n.toLowerCase(); aff[k] = (aff[k] ?? 0) + w; });
  fragrances.filter(f => f.loved).forEach(f => bump(f, 2));
  owned(fragrances).forEach(f => bump(f, 1));
  fragrances.filter(f => f.hated).forEach(f => bump(f, -2.5));
  aff.oud = -6; // "Oud is the worst. Do not revisit."
  return aff;
}

export function judgeNotes(notes, affinity = noteAffinity()) {
  const scored = notes.map(n => [n, affinity[n.toLowerCase().trim()] ?? 0]);
  const raw = scored.reduce((a, [, v]) => a + v, 0) / Math.max(3, Math.sqrt(notes.length) * 2.2);
  const score = Math.max(1, Math.min(10, Math.round(5.5 + raw)));
  return {
    score,
    verdict: score >= 8 ? 'Very you' : score >= 6 ? 'Worth a sniff' : score >= 4 ? 'Coin toss' : 'Skip it',
    likes: scored.filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
    flags: scored.filter(([, v]) => v < 0).map(([n]) => n)
  };
}

/** Free text → { name, notes } using the reference list, Adam's own library, or a comma list of notes. */
export function resolveQuery(text, fragrances = FRAGRANCES) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  const ref = Object.keys(REFERENCE_FRAGRANCES).find(k => k.toLowerCase() === t);
  if (ref) return { name: ref, notes: REFERENCE_FRAGRANCES[ref] };
  const mine = fragrances.find(f => f.name.toLowerCase() === t);
  if (mine) return { name: mine.name, notes: mine.notes };
  if (t.includes(',')) {
    const notes = String(text).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    return notes.length ? { name: '', notes } : null;
  }
  return null;
}

// ---------------- Dress ----------------
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function tone(colour) {
  const l = luminance(GARMENT_COLOURS[colour]);
  return l > 0.4 ? 'light' : l > 0.08 ? 'mid' : 'dark';
}

export const lookPieces = look => [look.outer, look.top, look.bottom, look.shoes, look.accent];

/** The three outfit rules from the notes, checked for real. */
export function lookRules(look) {
  const pieces = lookPieces(look);
  const tones = new Set(pieces.map(([c]) => tone(c)));
  return [
    { ok: tones.size === 3, label: tones.size === 3 ? 'light, mid and dark' : `only ${[...tones].join(' and ')}` },
    { ok: Boolean(look.texture), label: `${look.texture} for texture` },
    { ok: pieces.length >= 5, label: `${pieces.length} pieces` }
  ];
}

/** Nearest named garment colour to an [r, g, b] sample (weighted for how eyes see green). */
export function nearestGarmentColour([r, g, b]) {
  let best = null;
  let bestD = Infinity;
  for (const [name, hex] of Object.entries(GARMENT_COLOURS)) {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const d = 2 * (c[0] - r) ** 2 + 4 * (c[1] - g) ** 2 + 3 * (c[2] - b) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

/** Most common colour bucket in RGBA pixel data (Uint8ClampedArray-like). */
export function dominantColour(pixels) {
  const buckets = new Map();
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    const key = ((pixels[i] >> 5) << 6) | ((pixels[i + 1] >> 5) << 3) | (pixels[i + 2] >> 5);
    const b = buckets.get(key) ?? [0, 0, 0, 0];
    b[0] += pixels[i]; b[1] += pixels[i + 1]; b[2] += pixels[i + 2]; b[3] += 1;
    buckets.set(key, b);
  }
  let top = null;
  for (const b of buckets.values()) if (!top || b[3] > top[3]) top = b;
  return top ? [top[0] / top[3], top[1] / top[3], top[2] / top[3]] : null;
}

/** Looks that use a colour; if none do, the three closest by brightness. */
export function looksForColour(colour) {
  const hits = LOOKS.filter(l => lookPieces(l).some(([c]) => c === colour));
  if (hits.length) return { exact: true, looks: hits };
  const target = luminance(GARMENT_COLOURS[colour]);
  const near = [...LOOKS].sort((a, b) => Math.abs(luminance(GARMENT_COLOURS[a.top[0]]) - target) - Math.abs(luminance(GARMENT_COLOURS[b.top[0]]) - target)).slice(0, 3);
  return { exact: false, looks: near };
}

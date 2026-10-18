/**
 * Slot-aware styling for the Dress tab. No DOM.
 *
 * A snapped piece is a colour AND a slot: burgundy trousers style differently
 * from a burgundy knit. Outfits are built from the looks in dress-looks.js and
 * the colour pairings in the style notes, then dressed for the day's weather.
 */
import { LOOKS } from './dress-looks.js';
import { listOf, lookPieces, lookRules } from './aesthetics-model.js';

export const SLOTS = [
  { key: 'top', label: 'Top', garment: 'top' },
  { key: 'bottom', label: 'Pants', garment: 'trousers' },
  { key: 'outer', label: 'Layer', garment: 'jacket' },
  { key: 'shoes', label: 'Shoes', garment: 'shoes' },
  { key: 'accent', label: 'Accessory', garment: 'accessory' }
];
const SLOT_KEYS = SLOTS.map(s => s.key);
export const slotLabel = key => SLOTS.find(s => s.key === key)?.label.toLowerCase() ?? key;

/** Colours that read as normal footwear; anything else is a statement shoe. */
const SHOE_COLOURS = new Set(['white', 'cream', 'black', 'chocolate', 'cognac', 'tan', 'camel', 'burgundy', 'merlot', 'grey', 'charcoal', 'navy']);

/**
 * Colour pairings from Notion › "Men's Style & Color Theory Tips" (summary and transcript).
 * A rule fires when every colour in it is somewhere in the outfit.
 */
export const PAIRINGS = [
  { colours: ['chocolate', 'cream'], vibe: 'luxury' },
  { colours: ['chocolate', 'black'], vibe: 'expensive' },
  { colours: ['burgundy', 'cream'], vibe: 'classic' },
  { colours: ['burgundy', 'black'], vibe: 'powerful' },
  { colours: ['burgundy', 'grey', 'white'], vibe: 'powerful' },
  { colours: ['burgundy', 'cream', 'cognac'], vibe: 'powerful' },
  { colours: ['camel', 'cream'], vibe: 'effortless' },
  { colours: ['camel', 'black'], vibe: 'elevated' },
  { colours: ['camel', 'white'], vibe: 'clean' },
  { colours: ['navy', 'white', 'cream'], vibe: 'old money' },
  { colours: ['navy', 'cream', 'cognac'], vibe: 'expensive' },
  { colours: ['powder blue', 'white', 'navy'], vibe: 'sophisticated' },
  { colours: ['powder blue', 'white', 'merlot'], vibe: 'luxurious' },
  { colours: ['grey', 'white', 'black'], vibe: 'luxurious' },
  { colours: ['black', 'white', 'camel'], vibe: 'luxurious' },
  { colours: ['cream', 'olive', 'chocolate'], vibe: 'chic' },
  { colours: ['olive', 'white'], vibe: 'clean' },
  { colours: ['grey', 'blue', 'red'], vibe: 'intentional' },
  { colours: ['black', 'grey', 'red'], vibe: 'intentional' },
  { colours: ['white', 'cream', 'cognac'], vibe: 'expensive' },
  { colours: ['terracotta', 'Tiffany blue'], vibe: 'artistic' },
  { colours: ['pistachio', 'chocolate'], vibe: 'richer' },
  { colours: ['mustard', 'fuchsia'], vibe: 'striking' }
];

const palette = look => new Set(lookPieces(look).map(([c]) => c));

/** The pairing rule the outfit satisfies that uses `colour` (or any colour): the look's own vibe first, then the most specific. */
export function pairingFor(look, colour = null) {
  const have = palette(look);
  return PAIRINGS
    .filter(p => (!colour || p.colours.includes(colour)) && p.colours.every(c => have.has(c)))
    .sort((a, b) => (b.vibe === look.vibe) - (a.vibe === look.vibe) || b.colours.length - a.colours.length)[0] ?? null;
}

const pairingPhrase = p => `${listOf(p.colours)} reads ${p.vibe}`;

function withSlot(look, slot, colour, garment) {
  return { ...look, [slot]: [colour, garment ?? look[slot][1]] };
}

/**
 * Outfits built around one piece: `{ colour, slot, garment }`.
 * Returns up to `limit` options, best first: { look, kind, reason, pairing }.
 *   exact  — a look from the notes already has this colour in this slot
 *   moved  — a look has the colour elsewhere; the colours swap so the palette holds
 *   built  — the colour drops into a look whose other colours pair with it
 */
export function styleAround({ colour, slot = 'top', garment = null, limit = 3 } = {}) {
  if (!colour || !SLOT_KEYS.includes(slot)) return [];
  const label = slotLabel(slot);
  const candidates = LOOKS.map(base => {
    const other = SLOT_KEYS.find(k => k !== slot && base[k][0] === colour);
    let look;
    let kind;
    if (base[slot][0] === colour) {
      look = withSlot(base, slot, colour, garment);
      kind = 'exact';
    } else if (other && (slot !== 'shoes' || SHOE_COLOURS.has(colour)) && (other !== 'shoes' || SHOE_COLOURS.has(base[slot][0]))) {
      look = withSlot({ ...base, [other]: [base[slot][0], base[other][1]] }, slot, colour, garment);
      kind = 'moved';
    } else {
      look = withSlot(base, slot, colour, garment);
      kind = 'built';
    }
    const pairing = pairingFor(look, colour);
    const rules = lookRules(look);
    let score = { exact: 6, moved: 4, built: 0 }[kind];
    if (pairing) score += 2 + pairing.colours.length * 0.5;
    score += rules.filter(r => r.ok).length * 1.2;
    // Same shade head to toe flattens the body: top and pants want contrast.
    if (look.top[0] === look.bottom[0]) score -= 2.5;
    if (slot === 'shoes' && !SHOE_COLOURS.has(colour)) score -= 1;
    const vibe = kind !== 'exact' && pairing ? pairing.vibe : base.vibe;
    let reason;
    if (kind === 'exact') reason = `Straight from your notes: “${base.source}”.`;
    else if (kind === 'moved') reason = `${titleCase(colour)} moves to the ${label}; ${pairing ? pairingPhrase(pairing) : `the ${base.vibe} palette still holds`}.`;
    else if (pairing) reason = `From your notes: ${pairingPhrase(pairing)}.`;
    else reason = `No rule in your notes names ${colour} here, so this is balanced on tone: ${rules[0].label}.`;
    return { look: { ...look, vibe }, base, kind, pairing, reason, score };
  });
  const seen = new Set();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter(c => {
      const key = SLOT_KEYS.map(k => c.look[k][0]).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);
}

const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- Weather × garments ----------------
const HOT = new Set(['humid-heat', 'dry-heat', 'warm-humid']);
const COLD = new Set(['cool', 'cold', 'wet-cool']);
const HOT_SWAPS = {
  outer: { overcoat: 'linen overshirt', 'leather jacket': 'linen overshirt', 'suede jacket': 'linen overshirt', 'suede overshirt': 'linen overshirt', blazer: 'unlined blazer', 'cable knit': 'linen overshirt', cardigan: 'linen overshirt', 'field jacket': 'linen overshirt', 'chore jacket': 'linen overshirt' },
  top: { knit: 'knit polo', sweater: 'knit polo', 'fine knit': 'knit polo', henley: 'tee', 'oxford shirt': 'linen shirt' },
  bottom: { 'dark jeans': 'chinos', jeans: 'chinos', trousers: 'linen trousers', 'pleated trousers': 'linen trousers' },
  shoes: { boots: 'loafers', 'chelsea boots': 'loafers' },
  accent: { scarf: 'sunglasses' }
};
const COLD_SWAPS = {
  outer: { 'linen shirt': 'wool overshirt', overshirt: 'wool overshirt', 'chore jacket': 'wool chore coat' },
  top: { tee: 'fine knit', 'linen shirt': 'flannel shirt', 'knit polo': 'fine knit' },
  bottom: {},
  shoes: { sneakers: 'leather sneakers' },
  accent: { cap: 'beanie' }
};
const WET_SWAPS = { shoes: { loafers: 'leather boots', sneakers: 'leather boots' } };
const OUTER_TEXTURES = new Set(['suede', 'leather', 'wool', 'cable knit', 'canvas']);

/**
 * The same colours, cut for the weather. Returns { look, note } where `note`
 * is one plain line, or '' on a mild day. Colours never change, only garments.
 */
export function dressForWeather(look, weather) {
  if (!look || !weather?.band) return { look, note: '' };
  const hot = HOT.has(weather.band);
  const cold = COLD.has(weather.band);
  if (!hot && !cold && !weather.rain) return { look, note: '' };
  const tables = [hot ? HOT_SWAPS : cold ? COLD_SWAPS : null, weather.rain ? WET_SWAPS : null].filter(Boolean);
  const out = { ...look };
  for (const key of SLOT_KEYS) {
    for (const table of tables) {
      const swap = table[key]?.[out[key][1]];
      if (swap) out[key] = [out[key][0], swap];
    }
  }
  if (hot && out.outer[1] !== look.outer[1] && OUTER_TEXTURES.has(look.texture)) out.texture = 'linen';
  if (weather.rain && look.texture === 'suede') out.texture = 'leather';
  let note;
  if (hot) note = `${weather.label}: same colours in lighter cloth. Wear the layer open or carry it.`;
  else if (weather.rain) note = `${weather.label}: leather over suede today, and boots over loafers.`;
  else note = `${weather.label}: knit under the layer so the colours still show.`;
  return { look: out, note };
}

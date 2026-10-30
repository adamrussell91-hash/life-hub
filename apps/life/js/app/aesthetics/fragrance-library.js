/** Tracker fields and note tiers for the fragrance map.
 * The records themselves (tracker properties, page bodies and the map metadata: family,
 * loved/hated flags and tryAt) live only in the private data repository and arrive at
 * runtime through /api/aesthetics/source. Until they load, the library is empty.
 */

export const LONGEVITY = [
  {
    "label": "under 2 hours",
    "hours": 1.5
  },
  {
    "label": "2 to 4 hours",
    "hours": 3
  },
  {
    "label": "4 to 6 hours",
    "hours": 5
  },
  {
    "label": "6 to 8 hours",
    "hours": 7
  },
  {
    "label": "8 to 12 hours",
    "hours": 10
  },
  {
    "label": "12+ hours",
    "hours": 13
  }
];
export const FAMILY_LABELS = {
  "fresh": "fresh",
  "floral": "floral",
  "gourmand": "gourmand",
  "amber": "amber and spice",
  "woody": "woody and smoke"
};
const LONGEVITY_VALUES = ['Fleeting (under 2 hrs)', 'Short (2 to 4 hrs)', 'Moderate (4 to 6 hrs)', 'Long (6 to 8 hrs)', 'All Day (8 to 12 hrs)', 'Eternal (12+ hrs)'];
const SILLAGE_VALUES = ['Intimate (skin scent)', "Moderate (arm's length)", 'Strong (room presence)', 'Enormous (fills a room)'];
const SEASON_CODES = { Spring: 'Sp', Summer: 'Su', Autumn: 'Au', Winter: 'Wi' };

function toFragrance(meta, source) {
  const p = source.properties;
  const tiers = ['Top Notes', 'Heart Notes', 'Base Notes'].map(key => p[key] ?? []);
  const longevity = LONGEVITY_VALUES.indexOf(p.Longevity);
  const sillage = SILLAGE_VALUES.indexOf(p.Sillage);
  return {
    ...meta,
    source,
    id: source.id,
    name: p.Fragrance,
    brand: String(p.Brand ?? '').replace(/\\([\[\]])/g, '$1'),
    perfumer: p.Perfumer || null,
    status: p.Status,
    seasons: (p.Season ?? []).map(s => SEASON_CODES[s]).join(''),
    time: (p['Time of Day'] ?? []).map(t => t === 'Day' ? 'D' : 'N').join(''),
    occasions: p.Occasion ?? [],
    longevity: longevity < 0 ? null : longevity,
    sillage: sillage < 0 ? null : sillage,
    rating: p.Rating ?? null,
    notes: tiers.flat(),
    tiers: tiers.map(notes => notes.length),
    review: p.Review ?? '',
    quote: p.Review ? p.Review.split(/(?<=\.)\s|<br>/)[0] : null
  };
}

/** Live views of the private source. Importers read the current value on each access. */
export let SOURCE_FRAGRANCES = [];
export let STYLE_NOTE = null;
export let FRAGRANCES = [];

/**
 * Install the private source: `{ map, fragrances, styleNote }` as served by /api/aesthetics/source.
 * Map rows without a matching tracker record, or records missing required fields, are skipped.
 */
export function setFragranceSource({ map = [], fragrances = [], styleNote = null } = {}) {
  const records = Array.isArray(fragrances)
    ? fragrances.filter(r => r && typeof r.id === 'string' && r.properties && typeof r.properties.Fragrance === 'string')
    : [];
  SOURCE_FRAGRANCES = records;
  STYLE_NOTE = styleNote && typeof styleNote === 'object' ? styleNote : null;
  FRAGRANCES = (Array.isArray(map) ? map : []).flatMap(meta => {
    const source = records.find(record => record.properties.Fragrance === meta?.name);
    return source ? [toFragrance(meta, source)] : [];
  });
  return FRAGRANCES;
}

/** Published reference pyramids for the existing comparison tool; not tracker records. */
export const REFERENCE_FRAGRANCES = {
  "Baccarat Rouge 540": [
    "Saffron",
    "Jasmine",
    "Amberwood",
    "Ambergris",
    "Fir Resin",
    "Cedarwood"
  ],
  "Dior Sauvage": [
    "Bergamot",
    "Pink Pepper",
    "Lavender",
    "Ambroxan",
    "Cedarwood",
    "Labdanum"
  ],
  "Le Labo Santal 33": [
    "Cardamom",
    "Iris",
    "Violet",
    "Sandalwood",
    "Cedarwood",
    "Leather"
  ],
  "Tom Ford Tobacco Vanille": [
    "Tobacco",
    "Ginger",
    "Vanilla",
    "Cocoa",
    "Tonka Bean",
    "Dried Fruit"
  ],
  "Creed Aventus": [
    "Pineapple",
    "Bergamot",
    "Black Currant",
    "Birch",
    "Patchouli",
    "Musk",
    "Oakmoss",
    "Ambergris"
  ],
  "Maison Margiela Jazz Club": [
    "Pink Pepper",
    "Lemon",
    "Rum",
    "Clary Sage",
    "Tobacco",
    "Vanilla",
    "Tonka Bean"
  ],
  "Diptyque Philosykos": [
    "Fig",
    "Green Notes",
    "Coconut",
    "Cedarwood"
  ],
  "Kilian Angels' Share": [
    "Cognac",
    "Cinnamon",
    "Tonka Bean",
    "Oak",
    "Praline",
    "Vanilla",
    "Sandalwood"
  ]
};

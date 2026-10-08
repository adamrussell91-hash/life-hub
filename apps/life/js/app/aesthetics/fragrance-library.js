/** Exact tracker fields and note tiers from the complete Notion snapshot.
 * Family, loved/hated flags and tryAt are Life Hub interpretations for the map.
 * They are separate from each record's unmodified source properties and page body.
 */
import { SOURCE_FRAGRANCES } from './notion-aesthetics-source.js';

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
const MAP_METADATA = [
  {
    "name": "Neon",
    "family": "fresh",
    "loved": true,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Liaisons Dangereuses",
    "family": "floral",
    "loved": true,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Versace Pour Homme",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Aether",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Milk Orchid",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Asad Zanzibar Limited Edition",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Khamrah",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Irish Creme",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Velvet Underground",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Asad Bourbon",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Asad Elixir",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Asad",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Encre Noire",
    "family": "woody",
    "loved": true,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Encre Noire À L'Extrême",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Syzygy",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Silhouette",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": "Locale, Potts Point"
  },
  {
    "name": "Cologne Cedrat",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Macleay on Manning"
  },
  {
    "name": "Rhizome 01",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Rhizome 04",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Encens Suave",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Marque Collection 201",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Elysium",
    "family": "floral",
    "loved": false,
    "hated": true,
    "tryAt": null
  },
  {
    "name": "Lost Wonderer",
    "family": "amber",
    "loved": true,
    "hated": false,
    "tryAt": "PEOSYM sample set"
  },
  {
    "name": "Gullal",
    "family": "fresh",
    "loved": true,
    "hated": false,
    "tryAt": "PEOSYM sample set"
  },
  {
    "name": "Misfit",
    "family": "amber",
    "loved": true,
    "hated": false,
    "tryAt": "Becker Minty, Sydney"
  },
  {
    "name": "A Grove by the Sea",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Becker Minty, Sydney"
  },
  {
    "name": "Sydney Rock Pool",
    "family": "fresh",
    "loved": false,
    "hated": true,
    "tryAt": "Becker Minty, Sydney"
  },
  {
    "name": "Indigo Smoke",
    "family": "woody",
    "loved": false,
    "hated": true,
    "tryAt": "Becker Minty, Sydney"
  },
  {
    "name": "Khamrah Qahwa",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": "Chemist Warehouse or Dune"
  },
  {
    "name": "Got My Mojo Back",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Home Garden",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Fall",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": "Criminal Elements"
  },
  {
    "name": "Verge",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Criminal Elements"
  },
  {
    "name": "Delphes",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Soaring at Dawn",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Scent Journer discovery set"
  },
  {
    "name": "Clouds In Heaven",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": "Scent Journer discovery set"
  },
  {
    "name": "A Starlit Spell",
    "family": "woody",
    "loved": false,
    "hated": false,
    "tryAt": "Scent Journer discovery set"
  },
  {
    "name": "Bara Senja",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Kuala Lumpur, December"
  },
  {
    "name": "Lavish",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Indonesia"
  },
  {
    "name": "Insomnus",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": "Indonesia"
  },
  {
    "name": "Portrait of Kyoto",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Indonesia"
  },
  {
    "name": "Tea Soirée",
    "family": "fresh",
    "loved": false,
    "hated": false,
    "tryAt": "Indonesia"
  },
  {
    "name": "Peach Oolong",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Panache Angel Dust",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Soie Malaquais",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Horn OK Please",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": "PEOSYM sample set"
  },
  {
    "name": "Mithai",
    "family": "gourmand",
    "loved": false,
    "hated": false,
    "tryAt": "PEOSYM sample set"
  },
  {
    "name": "Nirmohee",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": "PEOSYM sample set"
  },
  {
    "name": "Spice D'Arno",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Imperium",
    "family": "floral",
    "loved": false,
    "hated": false,
    "tryAt": null
  },
  {
    "name": "Summer Oud",
    "family": "woody",
    "loved": false,
    "hated": true,
    "tryAt": null
  },
  {
    "name": "Le Mâle",
    "family": "amber",
    "loved": false,
    "hated": false,
    "tryAt": null
  }
];
const LONGEVITY_VALUES = ['Fleeting (under 2 hrs)', 'Short (2 to 4 hrs)', 'Moderate (4 to 6 hrs)', 'Long (6 to 8 hrs)', 'All Day (8 to 12 hrs)', 'Eternal (12+ hrs)'];
const SEASON_CODES = { Spring: 'Sp', Summer: 'Su', Autumn: 'Au', Winter: 'Wi' };

export const FRAGRANCES = MAP_METADATA.map(meta => {
  const source = SOURCE_FRAGRANCES.find(record => record.properties.Fragrance === meta.name);
  const p = source.properties;
  const tiers = ['Top Notes', 'Heart Notes', 'Base Notes'].map(key => p[key] ?? []);
  const longevity = LONGEVITY_VALUES.indexOf(p.Longevity);
  return {
    ...meta,
    source,
    id: source.id,
    name: p.Fragrance,
    brand: p.Brand.replace(/\\([\[\]])/g, '$1'),
    perfumer: p.Perfumer || null,
    status: p.Status,
    seasons: (p.Season ?? []).map(s => SEASON_CODES[s]).join(''),
    time: (p['Time of Day'] ?? []).map(t => t === 'Day' ? 'D' : 'N').join(''),
    occasions: p.Occasion ?? [],
    longevity: longevity < 0 ? null : longevity,
    rating: p.Rating ?? null,
    notes: tiers.flat(),
    tiers: tiers.map(notes => notes.length),
    review: p.Review ?? '',
    quote: p.Review ? p.Review.split(/(?<=\.)\s|<br>/)[0] : null
  };
});

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

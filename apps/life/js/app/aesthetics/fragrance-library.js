/**
 * Fragrance library, copied from Notion › Life Hub 2.0 › Aesthetic Health ›
 * Fragrance Tracker on 8 Oct 2026 (52 rows).
 *
 * Fields
 *   name, brand, perfumer   as in Notion
 *   status                  Owned | Sampling | Wishlist | Retired
 *   family                  fresh | floral | gourmand | amber | woody (Life Hub grouping; Notion has none)
 *   seasons                 Notion Season, as Sp/Su/Au/Wi codes
 *   time                    Notion Time of Day: 'D', 'N', 'DN' or ''
 *   occasions               Notion Occasion
 *   longevity               index into LONGEVITY (Notion Longevity select), null when unset
 *   rating                  Notion Rating (out of 10), null when unset
 *   loved / hated           read from Adam's own Review text
 *   notes                   top + heart + base, in that order; for rows with no notes in Notion,
 *                           the notes named in the Review text
 *   tiers                   [top, heart, base] counts into notes
 *   quote                   a line from Adam's Review, when there is one
 *   tryAt                   where the Review says to smell it
 */

export const LONGEVITY = [
  { label: 'under 2 hours', hours: 1.5 },
  { label: '2 to 4 hours', hours: 3 },
  { label: '4 to 6 hours', hours: 5 },
  { label: '6 to 8 hours', hours: 7 },
  { label: '8 to 12 hours', hours: 10 },
  { label: '12+ hours', hours: 13 }
];

export const FAMILY_LABELS = {
  fresh: 'fresh',
  floral: 'floral',
  gourmand: 'gourmand',
  amber: 'amber and spice',
  woody: 'woody and smoke'
};

const row = (name, brand, status, family, extra) => ({
  name,
  brand,
  status,
  family,
  perfumer: null,
  seasons: '',
  time: '',
  occasions: [],
  longevity: null,
  rating: null,
  loved: false,
  hated: false,
  notes: [],
  tiers: [0, 0, 0],
  quote: null,
  tryAt: null,
  ...extra
});

export const FRAGRANCES = [
  row('Neon', 'Criminal Elements', 'Owned', 'fresh', { perfumer: 'Corey Newcombe', seasons: 'SpSuAu', time: 'DN', occasions: ['Casual', 'Date Night'], longevity: 3, rating: 8, loved: true, notes: ['Bergamot', 'Aldehydes', 'Vanilla', 'ISO E Super'], tiers: [2, 0, 2], quote: 'Love it. Insane longevity.' }),
  row('Liaisons Dangereuses', 'By Kilian', 'Owned', 'floral', { perfumer: 'Calice Becker', seasons: 'SpSuAuWi', time: 'DN', occasions: ['Date Night', 'Formal', 'Signature Scent'], longevity: 3, loved: true, notes: ['Peach', 'Plum', 'Black Currant', 'Coconut', 'Rose', 'Geranium', 'Cinnamon', 'Vanilla', 'Musk', 'Sandalwood', 'Vetiver', 'Amber', 'Oakmoss'], tiers: [4, 3, 6], quote: 'Gifted by Corey on 30 June 2026 to be your wedding scent.' }),
  row('Versace Pour Homme', 'Versace', 'Owned', 'fresh', { perfumer: 'Alberto Morillas', seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office'], longevity: 2, notes: ['Bergamot', 'Lemon', 'Petitgrain', 'Geranium', 'Clary Sage', 'Tonka Bean', 'Musk', 'Amber'], tiers: [3, 2, 3] }),
  row('Aether', 'French Avenue', 'Owned', 'fresh', { seasons: 'SpSu', time: 'D', occasions: ['Casual'], longevity: 1, notes: ['Bergamot', 'Apple', 'Violet', 'Cedarwood', 'Cashmeran', 'Oakmoss', 'Musk', 'Ambroxan'], tiers: [2, 1, 5] }),
  row('Milk Orchid', 'Commodity', 'Owned', 'floral', { perfumer: 'Perfumerism x Commodity', seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office', 'Date Night'], longevity: 3, notes: ['Coconut', 'Magnolia', 'Fig', 'Sandalwood', 'Vanilla'], tiers: [1, 2, 2], quote: 'Creamy, soft and floral. A polished, comforting character.' }),
  row('Asad Zanzibar', 'Lattafa', 'Owned', 'fresh', { perfumer: 'Fanny Bal', seasons: 'SpSu', time: 'D', longevity: 3, notes: ['Black Pepper', 'Marine', 'Iris', 'Vanilla', 'Olibanum'], tiers: [2, 1, 2] }),
  row('Khamrah', 'Lattafa', 'Owned', 'gourmand', { seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 4, notes: ['Cinnamon', 'Tuberose', 'Nutmeg', 'Vanilla', 'Tonka Bean', 'Amber', 'Benzoin', 'Musk'], tiers: [1, 2, 5], quote: 'Warm spiced oriental. Cinnamon, dates, praline, vanilla.' }),
  row('Irish Creme', 'Jalu Fragrances', 'Owned', 'gourmand', { perfumer: 'Ali Jalloul', seasons: 'AuWi', time: 'N', occasions: ['Casual', 'Date Night'], longevity: 5, notes: ['Bergamot', 'Cinnamon', 'Nutmeg', 'Vanilla', 'Tonka Bean', 'Musk'], tiers: [1, 2, 3] }),
  row('Velvet Underground', 'Àerre', 'Owned', 'gourmand', { seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 3, notes: ['Sour Cherry', 'Bitter Almond', 'Rose', 'Jasmine', 'Plum', 'Vanilla', 'Tonka Bean'], tiers: [2, 3, 2] }),
  row('Asad Bourbon', 'Lattafa', 'Owned', 'gourmand', { seasons: 'AuWi', time: 'N', longevity: 3, notes: ['Lavender', 'Plum', 'Pink Pepper', 'Davana', 'Nutmeg', 'Cocoa', 'Vanilla', 'Amber', 'Vetiver'], tiers: [3, 3, 3] }),
  row('Asad Elixir', 'Lattafa', 'Owned', 'amber', { seasons: 'AuWi', time: 'N', longevity: 4, notes: ['Pink Pepper', 'Grapefruit', 'Saffron', 'Olibanum', 'Amber', 'Cashmeran', 'Patchouli', 'Vanilla', 'Tobacco', 'Cedarwood'], tiers: [3, 0, 7] }),
  row('Asad', 'Lattafa', 'Owned', 'amber', { seasons: 'AuWi', time: 'DN', longevity: 3, notes: ['Amber', 'Benzoin', 'Dry Wood', 'Labdanum', 'Vanilla'], tiers: [0, 0, 5] }),

  row('Encre Noire', 'Lalique', 'Sampling', 'woody', { perfumer: 'Nathalie Lorson', seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 3, rating: 8, loved: true, notes: ['Cypress', 'Vetiveryl acetate', 'Bourbon vetiver', 'Haitian vetiver', 'Cashmere wood', 'Musk'], tiers: [2, 2, 2], quote: 'Quite sexy, very dark and not sweet at all.' }),
  row("Encre Noire À L'Extrême", 'Lalique', 'Sampling', 'woody', { perfumer: 'Nathalie Lorson', seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 3, notes: ['Cypress', 'Bergamot', 'Elemi', 'Vetiver', 'Incense', 'Iris', 'Sandalwood', 'Patchouli', 'Benzoin'], tiers: [3, 3, 3], quote: 'Opens like a damp forest after rainstorm.' }),
  row('Syzygy', '[noun] collection', 'Sampling', 'woody', { seasons: 'SpAuWi', time: 'N', occasions: ['Date Night', 'Formal'], notes: ['Bergamot', 'Raspberry', 'Oud', 'Musk', 'Ambroxan'], tiers: [2, 0, 3], quote: 'Really masculine and sexy while still clean and approachable.' }),
  row('Silhouette', 'Mr Hux', 'Sampling', 'floral', { seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office'], notes: ['Rose', 'Patchouli', 'Musk', 'Sandalwood'], tiers: [0, 1, 3], quote: 'Sweet, soapy, cool and rose like.', tryAt: 'Locale, Potts Point' }),
  row('Cologne Cedrat', 'Matière Première', 'Sampling', 'fresh', { perfumer: 'Aurelien Guichard', seasons: 'SpSu', notes: ['Bergamot', 'Citron', 'Pink Pepper', 'Black Pepper', 'Mate'], tiers: [4, 0, 1], quote: 'Could be a good summer or spring fragrance.', tryAt: 'Macleay on Manning' }),
  row('Rhizome 01', 'Rhizome', 'Sampling', 'woody', { notes: ['Nutmeg', 'Cumin', 'Incense', 'Patchouli'], tiers: [0, 2, 2], quote: 'Really clean, not spicy at all.' }),
  row('Rhizome 04', 'Rhizome', 'Sampling', 'woody', { notes: ['Lavender', 'Vetiver', 'Oud', 'Tobacco', 'Cedarwood', 'Sandalwood', 'Amber', 'Musk'], tiers: [1, 1, 6], quote: 'Forgettable. Need to test on skin.' }),
  row('Encens Suave', 'Matière Première', 'Sampling', 'amber', { perfumer: 'Aurelien Guichard', notes: ['Coffee', 'Incense', 'Vanilla', 'Benzoin', 'Labdanum'], tiers: [0, 1, 4], quote: 'Forgettable.' }),
  row('Marque Collection 201', 'Fragrance World', 'Sampling', 'floral', { notes: ['Lemon', 'Pink Pepper', 'Citron', 'Jasmine', 'Iris', 'Water Hyacinth', 'Patchouli', 'Musk', 'Amber', 'Cedarwood', 'Teak Wood'], tiers: [3, 3, 5] }),
  row('Elysium', '[noun] collection', 'Sampling', 'floral', { seasons: 'SpSu', time: 'D', occasions: ['Casual'], hated: true, notes: ['Pear', 'Jasmine', 'Cedarwood', 'Musk', 'Incense'], tiers: [1, 1, 3], quote: 'Like being punched in the face and not in a good way.' }),

  row('Lost Wonderer', 'PEOSYM', 'Wishlist', 'amber', { seasons: 'AuWi', time: 'DN', occasions: ['Casual'], longevity: 1, rating: 8, loved: true, notes: ['Cardamom', 'Cinnamon', 'Saffron', 'Honey', 'Amber', 'Vanilla', 'Tobacco', 'Musk'], tiers: [2, 3, 3], quote: 'Cosy and comforting without being sweet or gourmand.', tryAt: 'PEOSYM sample set' }),
  row('Gullal', 'PEOSYM', 'Wishlist', 'fresh', { perfumer: 'Nicolas Bonneville', seasons: 'Sp', time: 'D', occasions: ['Casual'], longevity: 2, rating: 8, loved: true, notes: ['Grapefruit', 'Pink Pepper', 'Salt', 'Orris Root', 'Fennel', 'Dry Wood', 'Ambergris'], tiers: [3, 2, 2], quote: 'Distinctive, wearable, interesting.', tryAt: 'PEOSYM sample set' }),
  row('Misfit', 'Arquiste', 'Wishlist', 'amber', { perfumer: 'Rodrigo Flores-Roux', loved: true, notes: ['Bergamot', 'Lavender', 'Rose', 'Patchouli', 'Labdanum', 'Tonka Bean', 'Tolu Balsam', 'Akigalawood', 'Styrax', 'Amber'], tiers: [2, 1, 7], quote: 'Warm like a hug. My pick of the three.', tryAt: 'Becker Minty, Sydney' }),
  row('A Grove by the Sea', 'Arquiste', 'Wishlist', 'fresh', { perfumer: 'Rodrigo Flores-Roux', seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Beach'], longevity: 5, notes: ['Salt', 'Citron', 'Olive', 'Fennel', 'Orris Root', 'Cashmeran', 'Cedarwood', 'Dry Wood'], tiers: [3, 2, 3], quote: 'May solve the Mediterranean longevity problem.', tryAt: 'Becker Minty, Sydney' }),
  row('Sydney Rock Pool', 'Arquiste', 'Wishlist', 'fresh', { perfumer: 'Rodrigo Flores-Roux', hated: true, notes: ['Salt', 'Sea Notes', 'Coconut', 'Jasmine', 'Sandalwood', 'Ambergris', 'Musk'], tiers: [3, 1, 3], quote: 'Basically disappeared after five minutes.', tryAt: 'Becker Minty, Sydney' }),
  row('Indigo Smoke', 'Arquiste', 'Wishlist', 'woody', { perfumer: 'Calice Becker', hated: true, notes: ['Bergamot', 'Mandarin', 'Tea', 'Guaiac Wood', 'Incense', 'Cedarwood', 'Vetiver', 'Amber'], tiers: [2, 2, 4], quote: 'Now a definite no. I absolutely hated it this time.', tryAt: 'Becker Minty, Sydney' }),
  row('Khamrah Qahwa', 'Lattafa', 'Wishlist', 'gourmand', { seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 4, notes: ['Cinnamon', 'Cardamom', 'Coffee', 'Nutmeg', 'Vanilla', 'Tonka Bean', 'Amber', 'Benzoin'], tiers: [2, 2, 4], quote: 'Worth trying alongside Khamrah to compare.', tryAt: 'Chemist Warehouse or Dune' }),
  row('Got My Mojo Back', 'Alchemist', 'Wishlist', 'gourmand', { seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 4, notes: ['Black Currant', 'Cocoa', 'Bitter Almond', 'Tuberose', 'Jasmine', 'Praline', 'Sandalwood', 'Amber'], tiers: [3, 2, 3] }),
  row('Home Garden', 'Alchemist', 'Wishlist', 'woody', { seasons: 'SpSuAu', time: 'D', occasions: ['Casual', 'Office'], longevity: 4, notes: ['Grapefruit', 'Clove', 'Vetiver', 'Cedar Leaf'], tiers: [2, 2, 0] }),
  row('Fall', 'Criminal Elements', 'Wishlist', 'amber', { perfumer: 'Corey Newcombe', seasons: 'AuWi', notes: ['Cinnamon', 'Bay Laurel', 'Amber', 'Vanilla', 'Oakmoss'], tiers: [0, 2, 3], tryAt: 'Criminal Elements' }),
  row('Verge', 'Criminal Elements', 'Wishlist', 'fresh', { perfumer: 'Corey Newcombe', seasons: 'SpSu', time: 'D', notes: ['Tomato Leaf', 'Juniper', 'Mint'], tiers: [3, 0, 0], tryAt: 'Criminal Elements' }),
  row('Delphes', "L'Objet", 'Wishlist', 'woody', { perfumer: 'Jean-Claude Ellena', seasons: 'SpSu', time: 'D', occasions: ['Casual'], notes: ['Black Pepper', 'Violet Leaf', 'Olive', 'Guaiac Wood', 'Cedar Leaf', 'Oakmoss', 'Sandalwood', 'Patchouli'], tiers: [3, 2, 3] }),
  row('Soaring at Dawn', 'Scent Journer', 'Wishlist', 'fresh', { seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office'], notes: ['Mandarin', 'Pink Pepper', 'Neroli'], tiers: [2, 1, 0], tryAt: 'Scent Journer discovery set' }),
  row('Clouds In Heaven', 'Scent Journer', 'Wishlist', 'floral', { seasons: 'SpSu', time: 'DN', occasions: ['Casual', 'Date Night'], notes: ['Pandan', 'Tuberose', 'Jasmine', 'Vanilla'], tiers: [1, 2, 1], tryAt: 'Scent Journer discovery set' }),
  row('A Starlit Spell', 'Scent Journer', 'Wishlist', 'woody', { seasons: 'AuWi', time: 'DN', occasions: ['Office', 'Casual', 'Formal'], notes: ['Pear', 'Orris Root', 'Vetiver', 'Clove'], tiers: [1, 1, 2], tryAt: 'Scent Journer discovery set' }),
  row('Bara Senja', 'SugarBomb', 'Wishlist', 'fresh', { seasons: 'SpSu', occasions: ['Casual', 'Date Night'], notes: ['Grapefruit', 'Bergamot', 'Lemon', 'Ginger', 'Rose', 'Guaiac Wood', 'Cedarwood', 'Amber', 'Vetiver', 'Musk'], tiers: [3, 3, 4], tryAt: 'Kuala Lumpur, December' }),
  row('Lavish', 'Altar Scents', 'Wishlist', 'fresh', { seasons: 'SpSu', occasions: ['Casual', 'Date Night'], notes: ['Sea Notes', 'Lemon', 'Salt', 'Iris', 'Davana', 'Ambergris', 'Sandalwood', 'Oakmoss'], tiers: [3, 2, 3], tryAt: 'Indonesia' }),
  row('Insomnus', 'Altar Scents', 'Wishlist', 'floral', { seasons: 'AuWi', occasions: ['Date Night', 'Formal'], notes: ['Pear', 'Saffron', 'Black Currant', 'Rose', 'Lily of the Valley', 'Ambergris'], tiers: [3, 2, 1], tryAt: 'Indonesia' }),
  row('Portrait of Kyoto', 'The Body Tale', 'Wishlist', 'fresh', { seasons: 'SpSuAu', occasions: ['Casual', 'Office'], notes: ['Bergamot', 'Apple', 'Mandarin', 'Tea', 'Jasmine', 'Iris', 'Black Pepper', 'Musk'], tiers: [3, 3, 2], tryAt: 'Indonesia' }),
  row('Tea Soirée', 'Form Of', 'Wishlist', 'fresh', { seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office'], notes: ['Bergamot', 'Iris', 'Tea', 'Jasmine', 'Coconut', 'Musk'], tiers: [1, 3, 2], tryAt: 'Indonesia' }),
  row('Peach Oolong', 'Kiri Scents', 'Wishlist', 'floral', { seasons: 'SpSu', time: 'D', occasions: ['Casual', 'Office'], notes: ['Raspberry', 'Bergamot', 'Peach', 'Tea', 'Rose', 'Musk'], tiers: [2, 3, 1] }),
  row('Panache Angel Dust', 'Khadlaj', 'Wishlist', 'gourmand', { seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Casual'], longevity: 4, notes: ['Mandarin', 'Black Currant', 'Tuberose', 'Rum', 'Sandalwood', 'Vanilla', 'Musk', 'Benzoin'], tiers: [2, 3, 3] }),
  row('Soie Malaquais', 'Dries Van Noten', 'Wishlist', 'gourmand', { perfumer: 'Marie Salamagne', seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Formal'], longevity: 3, notes: ['Bergamot', 'Black Currant', 'Rose', 'Silk', 'Chestnut', 'Cocoa'], tiers: [2, 2, 2] }),
  row('Horn OK Please', 'PEOSYM', 'Wishlist', 'amber', { perfumer: 'Florian Gallo', seasons: 'AuWi', time: 'N', occasions: ['Date Night', 'Office'], longevity: 2, notes: ['Cinnamon', 'Rum', 'Clove', 'Jasmine', 'Tuberose', 'Sandalwood', 'Cedarwood', 'Styrax'], tiers: [3, 3, 2], tryAt: 'PEOSYM sample set' }),
  row('Mithai', 'PEOSYM', 'Wishlist', 'gourmand', { perfumer: 'Alexandre Freile', seasons: 'Sp', time: 'D', occasions: ['Casual'], longevity: 2, notes: ['Bergamot', 'Cardamom', 'Rose', 'Tea', 'Vanilla', 'Patchouli'], tiers: [2, 2, 2], tryAt: 'PEOSYM sample set' }),
  row('Nirmohee', 'PEOSYM', 'Wishlist', 'floral', { perfumer: 'Givaudan', seasons: 'SpSu', time: 'D', occasions: ['Casual'], longevity: 3, notes: ['Mint', 'Magnolia', 'Musk'], tiers: [1, 1, 1], tryAt: 'PEOSYM sample set' }),
  row("Spice D'Arno", 'Electimuss London', 'Wishlist', 'amber', { perfumer: 'Céline Barel', notes: ['Pink Pepper', 'Bergamot', 'Lemon', 'Cardamom', 'Oud', 'Vanilla', 'Myrrh', 'Cashmeran'], tiers: [4, 0, 4] }),
  row('Imperium', 'Electimuss London', 'Wishlist', 'floral', { perfumer: 'Sofia Bardelli', notes: ['Bergamot', 'Rose', 'Jasmine', 'Neroli', 'Saffron', 'Tuberose', 'Vanilla', 'Musk', 'Amber', 'Patchouli', 'Guaiac Wood', 'Oud'], tiers: [1, 5, 6] }),

  row('Summer Oud', 'Ahmed Al Maghribi', 'Retired', 'woody', { rating: 1, hated: true, notes: ['Mandarin', 'Rose', 'Saffron', 'Oud', 'Leather', 'Musk', 'Oakmoss', 'Vetiver', 'Patchouli', 'Amber', 'Incense', 'Cashmeran', 'Cypriol'], tiers: [1, 2, 10], quote: 'Oud is the worst. Do not revisit.' }),
  row('Le Mâle', 'Jean Paul Gaultier', 'Retired', 'amber', { perfumer: 'Francis Kurkdjian', notes: ['Lavender', 'Mint', 'Cardamom', 'Bergamot', 'Tarragon', 'Cinnamon', 'Neroli', 'Orange Blossom', 'Cumin', 'Caraway', 'Tonka Bean', 'Vanilla', 'Amber', 'Sandalwood', 'Cedarwood'], tiers: [5, 5, 5] })
];

/** Well-known fragrances for "Would I like it?". Notes are the commonly published pyramids. */
export const REFERENCE_FRAGRANCES = {
  'Baccarat Rouge 540': ['Saffron', 'Jasmine', 'Amberwood', 'Ambergris', 'Fir Resin', 'Cedarwood'],
  'Dior Sauvage': ['Bergamot', 'Pink Pepper', 'Lavender', 'Ambroxan', 'Cedarwood', 'Labdanum'],
  'Le Labo Santal 33': ['Cardamom', 'Iris', 'Violet', 'Sandalwood', 'Cedarwood', 'Leather'],
  'Tom Ford Tobacco Vanille': ['Tobacco', 'Ginger', 'Vanilla', 'Cocoa', 'Tonka Bean', 'Dried Fruit'],
  'Creed Aventus': ['Pineapple', 'Bergamot', 'Black Currant', 'Birch', 'Patchouli', 'Musk', 'Oakmoss', 'Ambergris'],
  'Maison Margiela Jazz Club': ['Pink Pepper', 'Lemon', 'Rum', 'Clary Sage', 'Tobacco', 'Vanilla', 'Tonka Bean'],
  'Diptyque Philosykos': ['Fig', 'Green Notes', 'Coconut', 'Cedarwood'],
  "Kilian Angels' Share": ['Cognac', 'Cinnamon', 'Tonka Bean', 'Oak', 'Praline', 'Vanilla', 'Sandalwood']
};

/**
 * Colour and dress rules, from Notion › Aesthetic Health ›
 * "Men's Style & Color Theory Tips" (3 Jul 2026).
 *
 * GARMENT_COLOURS are fabric colours (content, not UI chrome), so they live
 * here as data rather than as design tokens.
 *
 * Each look turns one line of the notes into five pieces (outer, top, bottom,
 * shoes, accent), plus the texture that satisfies "add one pattern or texture"
 * and the owned scent whose mood matches it.
 */

export const GARMENT_COLOURS = {
  white: '#f6f4ee',
  cream: '#eadfc6',
  'powder blue': '#b7cfe8',
  grey: '#8b8f95',
  camel: '#c39a68',
  tan: '#b6875a',
  olive: '#6c6d3b',
  cognac: '#985a2b',
  blue: '#3e6fb3',
  denim: '#2f4263',
  navy: '#1f2a44',
  burgundy: '#6d2030',
  merlot: '#5a1a27',
  chocolate: '#4a2c20',
  black: '#18181c',
  terracotta: '#c4623a',
  'Tiffany blue': '#7fd3cb',
  pistachio: '#b5cc92',
  mustard: '#d3a32b',
  fuchsia: '#cc3a86',
  charcoal: '#3a3d44',
  red: '#b23a2e'
};

const look = (vibe, source, outer, top, bottom, shoes, accent, texture, scent) => ({
  vibe, source, outer, top, bottom, shoes, accent, texture, scent
});

export const LOOKS = [
  look('effortless', 'Camel with cream → effortless', ['camel', 'suede overshirt'], ['cream', 'henley'], ['denim', 'dark jeans'], ['white', 'sneakers'], ['tan', 'belt'], 'suede', 'Neon'),
  look('old money', 'Navy + white is good, but add cream → old money', ['cream', 'cable knit'], ['white', 'oxford shirt'], ['navy', 'pleated trousers'], ['chocolate', 'loafers'], ['cognac', 'belt'], 'cable knit', 'Versace Pour Homme'),
  look('luxury', 'Chocolate with cream → luxury', ['chocolate', 'suede jacket'], ['cream', 'knit polo'], ['cream', 'trousers'], ['chocolate', 'loafers'], ['cognac', 'belt'], 'suede', 'Khamrah'),
  look('expensive', 'Chocolate with black → expensive', ['black', 'overcoat'], ['chocolate', 'fine knit'], ['black', 'trousers'], ['cognac', 'chelsea boots'], ['cream', 'scarf'], 'fine knit', 'Asad Bourbon'),
  look('classic', 'Burgundy with cream → classic', ['navy', 'blazer'], ['burgundy', 'knit'], ['cream', 'trousers'], ['cognac', 'loafers'], ['cognac', 'belt'], 'knit', 'Liaisons Dangereuses'),
  look('powerful', 'Burgundy with black → powerful', ['black', 'leather jacket'], ['burgundy', 'knit'], ['grey', 'trousers'], ['black', 'boots'], ['cream', 'pocket square'], 'leather', 'Velvet Underground'),
  look('elevated', 'Gray sweater + black pants → add camel coat + black Chelsea boots', ['camel', 'overcoat'], ['grey', 'sweater'], ['black', 'trousers'], ['black', 'chelsea boots'], ['cream', 'scarf'], 'wool', 'Asad Elixir'),
  look('chic', 'Cream + olive is nice, but add chocolate → chic', ['olive', 'field jacket'], ['cream', 'tee'], ['chocolate', 'chinos'], ['white', 'sneakers'], ['chocolate', 'belt'], 'canvas', 'Milk Orchid'),
  look('luxurious', 'Black + white is timeless, but add camel → luxurious', ['camel', 'suede jacket'], ['white', 'tee'], ['black', 'trousers'], ['black', 'loafers'], ['camel', 'belt'], 'suede', 'Asad'),
  look('intentional', 'Gray + blue + red → intentional', ['grey', 'overshirt'], ['blue', 'oxford shirt'], ['charcoal', 'trousers'], ['white', 'sneakers'], ['red', 'cap'], 'flannel', 'Aether'),
  look('rich', 'White + cream + cognac → expensive', ['cream', 'linen shirt'], ['white', 'tee'], ['cream', 'trousers'], ['cognac', 'loafers'], ['chocolate', 'belt'], 'linen', 'Milk Orchid'),
  look('refined', 'Powder blue + white + merlot → luxurious', ['merlot', 'cardigan'], ['powder blue', 'shirt'], ['white', 'trousers'], ['cognac', 'loafers'], ['merlot', 'belt'], 'knit', 'Liaisons Dangereuses'),
  look('artistic', 'Terracotta orange + Tiffany blue → artistic', ['terracotta', 'chore jacket'], ['Tiffany blue', 'tee'], ['cream', 'trousers'], ['chocolate', 'loafers'], ['navy', 'cap'], 'canvas', 'Asad Zanzibar'),
  look('richer', 'Pistachio green + chocolate brown → richer', ['tan', 'overshirt'], ['pistachio', 'knit polo'], ['chocolate', 'trousers'], ['white', 'sneakers'], ['chocolate', 'belt'], 'knit', 'Asad Bourbon'),
  look('striking', 'Mustard yellow + fuchsia pink → striking', ['mustard', 'overshirt'], ['fuchsia', 'tee'], ['navy', 'jeans'], ['white', 'sneakers'], ['black', 'watch strap'], 'corduroy', 'Velvet Underground')
];

/** Quick picks for "Snap a piece" when there is no photo to hand. */
export const SNAP_SAMPLES = [
  { colour: 'burgundy', label: 'Burgundy knit' },
  { colour: 'olive', label: 'Olive jacket' },
  { colour: 'powder blue', label: 'Blue shirt' },
  { colour: 'mustard', label: 'Mustard overshirt' }
];

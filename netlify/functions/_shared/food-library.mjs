export const FOOD_LIBRARY_PATH = 'data/food-library.json';

const NUMERIC_FIELDS = [
  'calories', 'protein_g', 'fat_g', 'saturated_fat_g', 'unsaturated_fat_g',
  'carbs_g', 'sugar_g', 'fibre_g', 'sodium_mg', 'calcium_mg', 'polyphenol_score'
];
const OMEGA3_LEVELS = ['high', 'medium', 'low', 'none'];
const PROMPT_SUMMARY_FIELDS = ['calories', 'protein_g', 'fat_g', 'carbs_g', 'sodium_mg', 'calcium_mg'];
const MAX_PROMPT_ENTRIES = 200;

export function foodLibraryEntrySchema() {
  return {
    name: 'save_food_library_entry',
    description: 'Cache a food\'s researched AU nutrition figures so it never needs re-searching. Call this right after finding verified figures (from web_search or a well-known AU source) whenever it was not already an exact, recently-verified match in the Food Library. Do not save estimated or guessed macros.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The food or product name, e.g. "Meatlovers Pizza"' },
        brand: { type: 'string', description: 'Brand or restaurant, if applicable, e.g. "Domino\'s"' },
        servingDescription: { type: 'string', description: 'What one serving is, e.g. "1 slice, large hand-tossed"' },
        source: { type: 'string', description: 'Where the figures came from, e.g. a brand nutrition panel or a specific web source' },
        calories: { type: 'number' },
        protein_g: { type: 'number' },
        fat_g: { type: 'number' },
        saturated_fat_g: { type: 'number' },
        unsaturated_fat_g: { type: 'number' },
        carbs_g: { type: 'number' },
        sugar_g: { type: 'number' },
        fibre_g: { type: 'number' },
        sodium_mg: { type: 'number' },
        calcium_mg: { type: 'number' },
        polyphenol_score: { type: 'number' },
        omega3: { type: 'string', enum: OMEGA3_LEVELS }
      },
      required: ['name', 'servingDescription', 'calories', 'protein_g', 'fat_g', 'sodium_mg']
    }
  };
}

export function parseFoodLibrary(content) {
  if (typeof content !== 'string') return [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.name === 'string');
}

export function validateFoodLibraryEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.name !== 'string' || input.name.trim() === '') return null;
  if (typeof input.servingDescription !== 'string' || input.servingDescription.trim() === '') return null;

  const entry = { name: input.name.trim(), servingDescription: input.servingDescription.trim() };
  if (typeof input.brand === 'string' && input.brand.trim()) entry.brand = input.brand.trim();
  if (typeof input.source === 'string' && input.source.trim()) entry.source = input.source.trim();

  for (const field of NUMERIC_FIELDS) {
    const value = input[field];
    if (value == null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    entry[field] = value;
  }
  if (typeof entry.calories !== 'number' || typeof entry.protein_g !== 'number' || typeof entry.fat_g !== 'number') {
    return null;
  }
  if (typeof entry.sodium_mg !== 'number') return null;
  if (input.omega3 != null) {
    if (!OMEGA3_LEVELS.includes(input.omega3)) return null;
    entry.omega3 = input.omega3;
  }
  return entry;
}

export function upsertFoodLibraryEntry(entries, entry, verifiedAt) {
  const list = Array.isArray(entries) ? entries.filter(existing => libraryKey(existing) !== libraryKey(entry)) : [];
  list.push({ ...entry, verifiedAt });
  return list;
}

export function formatFoodLibraryForPrompt(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries.slice(0, MAX_PROMPT_ENTRIES).map(entry => {
    const label = [entry.brand, entry.name].filter(Boolean).join(' ');
    const macros = PROMPT_SUMMARY_FIELDS
      .map(field => (typeof entry[field] === 'number' ? `${field}=${entry[field]}` : null))
      .filter(Boolean)
      .join(', ');
    const serving = entry.servingDescription ? ` (${entry.servingDescription})` : '';
    const verified = entry.verifiedAt ? `, verified ${entry.verifiedAt}` : '';
    return `- ${label}${serving} — ${macros}${verified}`;
  }).join('\n');
}

function libraryKey(entry) {
  return [entry?.brand, entry?.name].filter(Boolean).join(' ').trim().toLowerCase();
}

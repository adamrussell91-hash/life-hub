export const SKINCARE_PRODUCT_LIBRARY_PATH = 'data/skincare/product-library.json';

export const SKINCARE_STATUSES = ['in_use', 'to_try', 'finished', 'discontinued'];

export const SKINCARE_CATEGORY_ORDER = [
  'Cleanser',
  'Toner',
  'Serum',
  'Treatment',
  'Moisturiser',
  'Sunscreen',
  'Makeup',
  'Mask',
  'Mist',
  'Hair',
  'Body Care'
];

export function emptyProductLibrary() {
  return { schema_version: 1, products: [] };
}

export function normalizeProductStatus(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    in_use: 'in_use',
    to_try: 'to_try',
    finished: 'finished',
    discontinued: 'discontinued'
  };
  return aliases[key] ?? null;
}

function normalizeIngredients(value) {
  if (Array.isArray(value)) {
    return value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeProductFields(item, { requireCategory = false } = {}) {
  if (!item || typeof item !== 'object') return null;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) return null;
  const category = typeof item.category === 'string' ? item.category.trim() : '';
  if (requireCategory && !category) return null;
  const statusRaw = hasOwn(item, 'status') ? item.status : 'in_use';
  const status = normalizeProductStatus(statusRaw) ?? (statusRaw == null || statusRaw === '' ? 'in_use' : null);
  if (!status || !SKINCARE_STATUSES.includes(status)) return null;
  return {
    name,
    brand: typeof item.brand === 'string' ? item.brand.trim() : '',
    category: category || '',
    status,
    purpose: typeof item.purpose === 'string' ? item.purpose : '',
    active_ingredients: normalizeIngredients(item.active_ingredients),
    cost: normalizeOptionalString(item.cost),
    purchase_date: normalizeOptionalString(item.purchase_date),
    opened_date: normalizeOptionalString(item.opened_date),
    finished_date: normalizeOptionalString(item.finished_date),
    notes: typeof item.notes === 'string' ? item.notes : '',
    hint: typeof item.hint === 'string' ? item.hint : ''
  };
}

function mergeProductUpdate(prior, input) {
  const next = { ...prior };
  if (hasOwn(input, 'name')) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return null;
    next.name = name;
  }
  if (hasOwn(input, 'category')) {
    if (typeof input.category !== 'string' || !input.category.trim()) return null;
    next.category = input.category.trim();
  }
  if (hasOwn(input, 'brand')) {
    next.brand = typeof input.brand === 'string' ? input.brand.trim() : '';
  }
  if (hasOwn(input, 'status')) {
    const status = normalizeProductStatus(input.status);
    if (!status) return null;
    next.status = status;
  }
  if (hasOwn(input, 'purpose')) {
    next.purpose = typeof input.purpose === 'string' ? input.purpose : '';
  }
  if (hasOwn(input, 'active_ingredients')) {
    next.active_ingredients = normalizeIngredients(input.active_ingredients);
  }
  if (hasOwn(input, 'cost')) {
    next.cost = normalizeOptionalString(input.cost);
  }
  if (hasOwn(input, 'purchase_date')) {
    next.purchase_date = normalizeOptionalString(input.purchase_date);
  }
  if (hasOwn(input, 'opened_date')) {
    next.opened_date = normalizeOptionalString(input.opened_date);
  }
  if (hasOwn(input, 'finished_date')) {
    next.finished_date = normalizeOptionalString(input.finished_date);
  }
  if (hasOwn(input, 'notes')) {
    next.notes = typeof input.notes === 'string' ? input.notes : '';
  }
  if (hasOwn(input, 'hint')) {
    next.hint = typeof input.hint === 'string' ? input.hint : '';
  }
  return next;
}

export function parseProductLibrary(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1 || !Array.isArray(raw.products)) return null;
  const products = [];
  for (const item of raw.products) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.id !== 'string' || !item.id.trim()) return null;
    const fields = normalizeProductFields(item, { requireCategory: false });
    if (!fields) return null;
    products.push({ id: item.id.trim(), ...fields });
  }
  return { schema_version: 1, products };
}

export function slugifyProductId(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'product';
}

function allocateId(products, base) {
  const used = new Set(products.map(p => p.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function findProductByName(library, name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  return (library?.products ?? []).find(p => p.name.toLowerCase() === key) ?? null;
}

function productSearchHaystack(p) {
  const ingredients = Array.isArray(p.active_ingredients) ? p.active_ingredients.join(' ') : '';
  return [
    p.name,
    p.brand,
    p.category,
    p.status,
    p.purpose,
    p.notes,
    p.hint,
    ingredients
  ].filter(Boolean).join(' ').toLowerCase();
}

export function searchProductLibrary(library, query, { limit = 25 } = {}) {
  if (!library?.products || typeof query !== 'string' || !query.trim()) return [];
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  return library.products
    .filter(p => {
      const hay = productSearchHaystack(p);
      return tokens.every(t => hay.includes(t));
    })
    .slice(0, capped);
}

export function saveProductLibraryEntry(library, input) {
  if (!library || typeof input !== 'object' || input == null) return null;
  const products = [...(library.products ?? [])];

  if (typeof input.id === 'string' && input.id.trim()) {
    const id = input.id.trim();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const merged = mergeProductUpdate(products[idx], input);
    if (!merged) return null;
    products[idx] = { ...merged, id };
    return { schema_version: 1, products };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;

  const existing = findProductByName({ products }, name);
  if (existing) {
    const idx = products.findIndex(p => p.id === existing.id);
    const merged = mergeProductUpdate(products[idx], input);
    if (!merged) return null;
    products[idx] = { ...merged, id: existing.id };
    return { schema_version: 1, products };
  }

  const fields = normalizeProductFields(input, { requireCategory: true });
  if (!fields) return null;
  const id = allocateId(products, slugifyProductId(name));
  products.push({ id, ...fields });
  return { schema_version: 1, products };
}

export function groupProductsByCategory(products) {
  const byCat = new Map();
  for (const p of products ?? []) {
    const cat = (p.category && String(p.category).trim()) || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p);
  }
  const ordered = [];
  for (const cat of SKINCARE_CATEGORY_ORDER) {
    if (byCat.has(cat)) {
      ordered.push({ category: cat, products: byCat.get(cat) });
      byCat.delete(cat);
    }
  }
  for (const [cat, list] of byCat) {
    ordered.push({ category: cat, products: list });
  }
  return ordered;
}

/** Exact names from hardcoded AM/PM defaults → category. */
const KNOWN_DEFAULT_CATEGORIES = {
  'Azclear Azelaic Acid 20%': 'Treatment',
  'Korres Greek Yoghurt Probiotic Gel Cream': 'Moisturiser',
  'La Roche Posay Anthelios SPF 50+': 'Sunscreen',
  'Dr Jart+ Cicapair Colour Corrector': 'Makeup',
  'Maybelline Green and Peach Correctors with BareMinerals Concealer': 'Makeup',
  'Kosas Cloud Set Translucent Loose Setting and Blurring Powder': 'Makeup',
  'Dr.G Green Deep Pore Cleansing Balm': 'Cleanser',
  'Korres Greek Yoghurt Foaming Cream Cleanser': 'Cleanser',
  Toner: 'Toner',
  'Retrieve Tretinoin 0.05% (sandwich method)': 'Treatment',
  'La Roche Posay Cicaplast B5+': 'Moisturiser',
  'Avene Cicalfate+': 'Moisturiser'
};

/**
 * Best-effort category for seed/fallback/create when the shelf has no category yet.
 * Prefer exact default-name matches, then light name heuristics; else Other.
 */
export function defaultCategoryForProductName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return 'Other';
  if (KNOWN_DEFAULT_CATEGORIES[trimmed]) return KNOWN_DEFAULT_CATEGORIES[trimmed];
  const lower = trimmed.toLowerCase();
  if (/\bspf\b/.test(lower) || lower.includes('sunscreen') || lower.includes('superscreen')) {
    return 'Sunscreen';
  }
  if (lower.includes('cleanser') || lower.includes('cleansing balm') || lower.includes('foaming cream')) {
    return 'Cleanser';
  }
  if (lower.includes('toner') || lower.includes('essence')) return 'Toner';
  if (lower.includes('serum')) return 'Serum';
  if (lower.includes('tretinoin') || lower.includes('azelaic') || lower.includes('retinol')) {
    return 'Treatment';
  }
  if (
    lower.includes('moisturis')
    || lower.includes('moisturiz')
    || lower.includes('gel cream')
    || lower.includes('cicaplast')
    || lower.includes('cicalfate')
    || lower.includes('baume')
  ) {
    return 'Moisturiser';
  }
  if (
    lower.includes('concealer')
    || lower.includes('corrector')
    || lower.includes('foundation')
    || lower.includes('setting')
    || lower.includes('powder')
  ) {
    return 'Makeup';
  }
  if (lower.includes('mask')) return 'Mask';
  if (lower.includes('mist') || lower.includes('spray')) return 'Mist';
  if (lower.includes('shampoo') || lower.includes('conditioner') || lower.includes('dandruff')) {
    return 'Hair';
  }
  return 'Other';
}

/** Upgrade products stuck on Other/empty when a better category can be inferred. */
export function upgradeOtherProductCategories(library) {
  const products = library?.products;
  if (!Array.isArray(products)) return { library, changed: false };
  let changed = false;
  const nextProducts = products.map(p => {
    const current = typeof p.category === 'string' ? p.category.trim() : '';
    if (current && current !== 'Other') return p;
    const inferred = defaultCategoryForProductName(p.name);
    if (!inferred || inferred === 'Other' || inferred === current) return p;
    changed = true;
    return { ...p, category: inferred };
  });
  if (!changed) return { library, changed: false };
  return { library: { schema_version: 1, products: nextProducts }, changed: true };
}

export function seedProductLibraryFromDefaults(defaults) {
  let lib = emptyProductLibrary();
  const names = [
    ...(defaults?.am?.products ?? []),
    ...(defaults?.pm?.products ?? [])
  ];
  for (const name of names) {
    if (findProductByName(lib, name)) continue;
    lib = saveProductLibraryEntry(lib, {
      name,
      category: defaultCategoryForProductName(name)
    }) ?? lib;
  }
  return lib;
}

export function migrateProductLibraryFromCatalog(catalog) {
  let lib = emptyProductLibrary();
  if (!catalog || typeof catalog !== 'object') return lib;
  const names = [];
  for (const key of ['am', 'pm']) {
    names.push(...(catalog[key]?.products ?? []), ...(catalog[key]?.retired ?? []));
  }
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    if (findProductByName(lib, name)) continue;
    const trimmed = name.trim();
    lib = saveProductLibraryEntry(lib, {
      name: trimmed,
      category: defaultCategoryForProductName(trimmed)
    }) ?? lib;
  }
  return lib;
}

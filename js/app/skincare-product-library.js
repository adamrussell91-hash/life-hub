export const SKINCARE_PRODUCT_LIBRARY_PATH = 'data/skincare/product-library.json';

export function emptyProductLibrary() {
  return { schema_version: 1, products: [] };
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
    if (typeof item.name !== 'string' || !item.name.trim()) return null;
    const entry = { id: item.id.trim(), name: item.name.trim() };
    if (typeof item.notes === 'string') entry.notes = item.notes;
    else entry.notes = '';
    products.push(entry);
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

export function searchProductLibrary(library, query, { limit = 25 } = {}) {
  if (!library?.products || typeof query !== 'string' || !query.trim()) return [];
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  return library.products
    .filter(p => {
      const hay = `${p.name} ${p.notes ?? ''}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    })
    .slice(0, capped);
}

export function saveProductLibraryEntry(library, input) {
  if (!library || typeof input !== 'object' || input == null) return null;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;
  const notes = typeof input.notes === 'string' ? input.notes : '';
  const products = [...(library.products ?? [])];

  if (typeof input.id === 'string' && input.id.trim()) {
    const id = input.id.trim();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    products[idx] = { ...products[idx], name, notes };
    return { schema_version: 1, products };
  }

  const existing = findProductByName({ products }, name);
  if (existing) {
    const idx = products.findIndex(p => p.id === existing.id);
    products[idx] = { ...products[idx], name, notes: notes || products[idx].notes || '' };
    return { schema_version: 1, products };
  }

  const id = allocateId(products, slugifyProductId(name));
  products.push({ id, name, notes });
  return { schema_version: 1, products };
}

export function seedProductLibraryFromDefaults(defaults) {
  let lib = emptyProductLibrary();
  const names = [
    ...(defaults?.am?.products ?? []),
    ...(defaults?.pm?.products ?? [])
  ];
  for (const name of names) {
    if (findProductByName(lib, name)) continue;
    lib = saveProductLibraryEntry(lib, { name }) ?? lib;
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
    lib = saveProductLibraryEntry(lib, { name: name.trim() }) ?? lib;
  }
  return lib;
}

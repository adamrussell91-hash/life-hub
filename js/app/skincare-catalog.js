export const SKINCARE_CATALOG_PATH = 'data/skincare/routine-catalog.json';

export function emptyCatalog(defaults) {
  return {
    schema_version: 1,
    am: {
      products: [...(defaults?.am?.products ?? [])],
      retired: [],
      extras: [...(defaults?.extras ?? [])]
    },
    pm: {
      products: [...(defaults?.pm?.products ?? [])],
      retired: [],
      extras: [...(defaults?.extras ?? [])]
    }
  };
}

export function parseCatalog(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1) return null;
  for (const key of ['am', 'pm']) {
    const block = raw[key];
    if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
    if (!Array.isArray(block.products) || !Array.isArray(block.retired)) return null;
    if (block.extras != null && !Array.isArray(block.extras)) return null;
    if (![...block.products, ...block.retired, ...(block.extras ?? [])].every(n => typeof n === 'string')) {
      return null;
    }
  }
  return {
    schema_version: 1,
    am: {
      products: [...raw.am.products],
      retired: [...raw.am.retired],
      extras: [...(raw.am.extras ?? [])]
    },
    pm: {
      products: [...raw.pm.products],
      retired: [...raw.pm.retired],
      extras: [...(raw.pm.extras ?? [])]
    }
  };
}

export function resolveActiveProducts(routineKey, catalog, defaults) {
  const retired = new Set(catalog?.[routineKey]?.retired ?? []);
  const list = catalog?.[routineKey]?.products ?? defaults?.[routineKey]?.products ?? [];
  return list.filter(name => typeof name === 'string' && name && !retired.has(name));
}

export function appendProduct(catalog, routineKey, name) {
  const parsed = parseCatalog(catalog);
  if (!parsed || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  if (parsed[routineKey].retired.includes(trimmed)) return null;
  if (parsed[routineKey].products.includes(trimmed)) return parsed;
  return {
    ...parsed,
    [routineKey]: {
      ...parsed[routineKey],
      products: [...parsed[routineKey].products, trimmed]
    }
  };
}

export function retireProduct(catalog, routineKey, name) {
  const parsed = parseCatalog(catalog);
  if (!parsed || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  if (!parsed[routineKey].products.includes(trimmed)) return parsed;
  return {
    ...parsed,
    [routineKey]: {
      ...parsed[routineKey],
      products: parsed[routineKey].products.filter(n => n !== trimmed),
      retired: parsed[routineKey].retired.includes(trimmed)
        ? parsed[routineKey].retired
        : [...parsed[routineKey].retired, trimmed]
    }
  };
}

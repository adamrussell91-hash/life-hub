import { findProductByName } from './skincare-product-library.js';

export const SKINCARE_ROUTINE_MEMBERSHIP_PATH = 'data/skincare/routine-membership.json';

export function emptyMembership() {
  return {
    schema_version: 1,
    am: { product_ids: [] },
    pm: { product_ids: [] }
  };
}

export function parseMembership(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1) return null;
  const out = emptyMembership();
  for (const key of ['am', 'pm']) {
    const ids = raw[key]?.product_ids;
    if (!Array.isArray(ids)) return null;
    out[key] = {
      product_ids: ids.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
    };
  }
  return out;
}

export function resolveRoutineProducts(routineKey, membership, library) {
  const ids = membership?.[routineKey]?.product_ids ?? [];
  const byId = new Map((library?.products ?? []).map(p => [p.id, p]));
  const out = [];
  for (const id of ids) {
    const product = byId.get(id);
    if (product) out.push(product);
  }
  return out;
}

export function addToRoutine(membership, routineKey, productId) {
  if (!membership || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  if (typeof productId !== 'string' || !productId.trim()) return null;
  const id = productId.trim();
  const next = {
    schema_version: 1,
    am: { product_ids: [...membership.am.product_ids] },
    pm: { product_ids: [...membership.pm.product_ids] }
  };
  if (!next[routineKey].product_ids.includes(id)) {
    next[routineKey].product_ids.push(id);
  }
  return next;
}

export function removeFromRoutine(membership, routineKey, productId) {
  if (!membership || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  if (typeof productId !== 'string' || !productId.trim()) return null;
  const id = productId.trim();
  return {
    schema_version: 1,
    am: {
      product_ids: routineKey === 'am'
        ? membership.am.product_ids.filter(x => x !== id)
        : [...membership.am.product_ids]
    },
    pm: {
      product_ids: routineKey === 'pm'
        ? membership.pm.product_ids.filter(x => x !== id)
        : [...membership.pm.product_ids]
    }
  };
}

export function seedMembershipFromDefaults(defaults, library) {
  const m = emptyMembership();
  for (const key of ['am', 'pm']) {
    for (const name of defaults?.[key]?.products ?? []) {
      const product = findProductByName(library, name);
      if (product) m[key].product_ids.push(product.id);
    }
  }
  return m;
}

export function migrateMembershipFromCatalog(catalog, library) {
  const m = emptyMembership();
  if (!catalog) return m;
  for (const key of ['am', 'pm']) {
    for (const name of catalog[key]?.products ?? []) {
      const product = findProductByName(library, name);
      if (product && !m[key].product_ids.includes(product.id)) {
        m[key].product_ids.push(product.id);
      }
    }
  }
  return m;
}

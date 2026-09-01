import {
  searchProductLibrary,
  saveProductLibraryEntry,
  findProductByName
} from '../../../apps/life/js/app/skincare-product-library.js';
import {
  addToRoutine,
  removeFromRoutine,
  resolveRoutineProducts
} from '../../../apps/life/js/app/skincare-routine-membership.js';

const DEFAULT_PROMPT_LIMIT = 40;

const RICH_ENTRY_PROPERTIES = {
  name: { type: 'string', description: 'Product display name' },
  id: { type: 'string', description: 'Existing product id when updating' },
  brand: { type: 'string', description: 'Brand name' },
  category: {
    type: 'string',
    description:
      'Required on create. One of: Cleanser, Toner, Serum, Treatment, Moisturiser, Sunscreen, Makeup, Mask, Mist, Hair, Body Care (or Other)'
  },
  status: {
    type: 'string',
    enum: ['in_use', 'to_try', 'finished', 'discontinued'],
    description: 'Shelf inventory status (not the same as AM/PM membership)'
  },
  purpose: { type: 'string', description: 'What the product is for' },
  active_ingredients: {
    type: 'array',
    items: { type: 'string' },
    description: 'Active ingredient names'
  },
  cost: { type: 'string', description: 'Cost text as recorded (e.g. A$33.99)' },
  purchase_date: { type: 'string', description: 'ISO date YYYY-MM-DD when known' },
  opened_date: { type: 'string', description: 'ISO date YYYY-MM-DD when known' },
  finished_date: { type: 'string', description: 'ISO date YYYY-MM-DD when known' },
  notes: { type: 'string', description: 'Free-text notes' },
  hint: { type: 'string', description: 'Short UI tip shown under the pill (e.g. backup only)' }
};

export function searchSkincareLibrarySchema() {
  return {
    name: 'search_skincare_library',
    description:
      "Search Adam's skincare product shelf by name, brand, category, status, purpose, notes, ingredients, or hint. Use before creating a duplicate product.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; tokens are ANDed' },
        limit: { type: 'number', description: 'Max results (default 25, max 50)' }
      },
      required: ['query']
    }
  };
}

export function saveSkincareLibraryEntrySchema() {
  return {
    name: 'save_skincare_library_entry',
    description:
      'Create or update a product on Adam\'s skincare shelf. Pass id to update an existing row; omit id to create (or update by exact name match). Category is required when creating. Status is shelf inventory — use set_skincare_routine_membership to put products on AM/PM.',
    input_schema: {
      type: 'object',
      properties: RICH_ENTRY_PROPERTIES,
      required: ['name']
    }
  };
}

export function setSkincareRoutineMembershipSchema() {
  return {
    name: 'set_skincare_routine_membership',
    description:
      'Add or remove a shelf product from the AM or PM routine. Removing from a routine does not delete the shelf entry.',
    input_schema: {
      type: 'object',
      properties: {
        routine: { type: 'string', enum: ['am', 'pm'] },
        product_id: { type: 'string', description: 'Shelf product id' },
        op: { type: 'string', enum: ['add', 'remove'] }
      },
      required: ['routine', 'product_id', 'op']
    }
  };
}

export function listSkincareRoutinesSchema() {
  return {
    name: 'list_skincare_routines',
    description:
      "Return Adam's current AM and/or PM routine products (Skincare tab source of truth). Use this when he asks what is on a routine — do not infer from shelf status or notes.",
    input_schema: {
      type: 'object',
      properties: {
        routine: {
          type: 'string',
          enum: ['am', 'pm'],
          description: 'Optional. Omit to return both AM and PM.'
        }
      }
    }
  };
}

function formatRoutineProductLine(product) {
  const bits = [product.name, `(${product.id})`];
  if (product.category) bits.push(`[${product.category}]`);
  return `- ${bits.join(' ')}`;
}

function formatRoutineSection(label, products) {
  if (!products.length) return `${label}:\n(empty)`;
  return `${label}:\n${products.map(formatRoutineProductLine).join('\n')}`;
}

export function formatSkincareRoutinesForPrompt(membership, library) {
  if (!membership || !library) return '';
  const am = resolveRoutineProducts('am', membership, library);
  const pm = resolveRoutineProducts('pm', membership, library);
  return [
    'Current AM/PM rotation (Skincare tab source of truth; not the same as shelf status):',
    formatRoutineSection('AM', am),
    formatRoutineSection('PM', pm)
  ].join('\n');
}

export function formatSkincareLibraryForPrompt(library, limit = DEFAULT_PROMPT_LIMIT) {
  const products = library?.products;
  if (!Array.isArray(products) || products.length === 0) return '';
  const capped = Math.min(Math.max(Number(limit) || DEFAULT_PROMPT_LIMIT, 1), 100);
  return products.slice(0, capped).map(p => {
    const bits = [p.name, `(${p.id})`];
    if (p.brand) bits.push(`[${p.brand}]`);
    if (p.category) bits.push(p.category);
    if (p.status && p.status !== 'in_use') bits.push(p.status);
    return `- ${bits.join(' ')}`;
  }).join('\n');
}

function serializeRoutineProducts(products) {
  return products.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category || ''
  }));
}

export function executeSearchSkincareLibrary(library, input = {}) {
  const query = typeof input.query === 'string' ? input.query : '';
  const matches = searchProductLibrary(library, query, {
    limit: input.limit
  });
  return JSON.stringify(matches);
}

export function executeListSkincareRoutines(membership, library, input = {}) {
  const routine = input?.routine;
  const out = {};
  if (routine !== 'pm') {
    out.am = serializeRoutineProducts(resolveRoutineProducts('am', membership, library));
  }
  if (routine !== 'am') {
    out.pm = serializeRoutineProducts(resolveRoutineProducts('pm', membership, library));
  }
  return JSON.stringify(out);
}

export function applySaveSkincareLibraryEntry(library, input) {
  const next = saveProductLibraryEntry(library, input);
  if (!next) return { ok: false, error: 'invalid_entry' };
  const saved = typeof input?.id === 'string' && input.id.trim()
    ? next.products.find(p => p.id === input.id.trim())
    : findProductByName(next, input?.name);
  if (!saved) return { ok: false, error: 'invalid_entry' };
  return { ok: true, library: next, id: saved.id, name: saved.name };
}

export function applySetSkincareRoutineMembership(library, membership, input) {
  const routine = input?.routine;
  const productId = typeof input?.product_id === 'string' ? input.product_id.trim() : '';
  const op = input?.op;
  if ((routine !== 'am' && routine !== 'pm') || (op !== 'add' && op !== 'remove') || !productId) {
    return { ok: false, error: 'invalid_input' };
  }
  const exists = (library?.products ?? []).some(p => p.id === productId);
  if (!exists) return { ok: false, error: 'unknown_product' };

  const next = op === 'add'
    ? addToRoutine(membership, routine, productId)
    : removeFromRoutine(membership, routine, productId);
  if (!next) return { ok: false, error: 'invalid_input' };
  return {
    ok: true,
    membership: next,
    routine,
    product_ids: next[routine].product_ids
  };
}

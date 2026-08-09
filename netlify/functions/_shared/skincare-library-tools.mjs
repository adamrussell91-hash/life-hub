import {
  searchProductLibrary,
  saveProductLibraryEntry,
  findProductByName
} from '../../../js/app/skincare-product-library.js';
import {
  addToRoutine,
  removeFromRoutine
} from '../../../js/app/skincare-routine-membership.js';

const DEFAULT_PROMPT_LIMIT = 40;

export function searchSkincareLibrarySchema() {
  return {
    name: 'search_skincare_library',
    description:
      "Search Adam's skincare product shelf by name or notes. Use before creating a duplicate product.",
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
      'Create or update a product on Adam\'s skincare shelf. Pass id to rename/update an existing row; omit id to create (or update by exact name match).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product display name' },
        notes: { type: 'string', description: 'Optional notes' },
        id: { type: 'string', description: 'Existing product id when updating' }
      },
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

export function formatSkincareLibraryForPrompt(library, limit = DEFAULT_PROMPT_LIMIT) {
  const products = library?.products;
  if (!Array.isArray(products) || products.length === 0) return '';
  const capped = Math.min(Math.max(Number(limit) || DEFAULT_PROMPT_LIMIT, 1), 100);
  return products.slice(0, capped).map(p => `- ${p.name} (${p.id})`).join('\n');
}

export function executeSearchSkincareLibrary(library, input = {}) {
  const query = typeof input.query === 'string' ? input.query : '';
  const matches = searchProductLibrary(library, query, {
    limit: input.limit
  });
  return JSON.stringify(matches);
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

import { decodeBlob } from './decode-blob.mjs';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  migrateProductLibraryFromCatalog,
  parseProductLibrary,
  seedProductLibraryFromDefaults,
  upgradeOtherProductCategories
} from '../../../apps/life/js/app/skincare-product-library.js';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  migrateMembershipFromCatalog,
  parseMembership,
  seedMembershipFromDefaults
} from '../../../apps/life/js/app/skincare-routine-membership.js';
import {
  SKINCARE_CATALOG_PATH,
  parseCatalog
} from '../../../apps/life/js/app/skincare-catalog.js';
import { loadSkincareDefaults } from './skincare-defaults.mjs';

function findBlob(tree, path) {
  return tree.find(item => item.path === path && item.type === 'blob');
}

function corruptError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function writeJson(github, path, value, message, sha) {
  return github.writeFile({
    path,
    content: JSON.stringify(value, null, 2),
    ...(sha ? { sha } : {}),
    message
  });
}

export async function loadOrSeedLibrary(github) {
  const { tree } = await github.resolveTree();
  const entry = findBlob(tree, SKINCARE_PRODUCT_LIBRARY_PATH);
  if (entry) {
    const parsed = parseProductLibrary(decodeBlob(await github.readBlob(entry.sha)));
    if (!parsed) throw corruptError('library_corrupt');
    // Upgrade Other→inferred categories in memory for this request only.
    // Do not auto-PUT on GET — that raced routine writes and broke unknown_product checks.
    const { library } = upgradeOtherProductCategories(parsed);
    return { library, entry, created: false };
  }

  const catalogEntry = findBlob(tree, SKINCARE_CATALOG_PATH);
  const defaults = await loadSkincareDefaults({ tree, readBlob: sha => github.readBlob(sha) });
  let library;
  if (catalogEntry) {
    const catalog = parseCatalog(decodeBlob(await github.readBlob(catalogEntry.sha)));
    library = catalog
      ? migrateProductLibraryFromCatalog(catalog)
      : seedProductLibraryFromDefaults(defaults);
  } else {
    library = seedProductLibraryFromDefaults(defaults);
  }

  const result = await writeJson(
    github,
    SKINCARE_PRODUCT_LIBRARY_PATH,
    library,
    'chore(skincare): seed product library'
  );
  return {
    library,
    entry: { path: SKINCARE_PRODUCT_LIBRARY_PATH, type: 'blob', sha: result.sha },
    created: true
  };
}

export async function loadOrSeedMembership(github, library) {
  const { tree } = await github.resolveTree();
  const entry = findBlob(tree, SKINCARE_ROUTINE_MEMBERSHIP_PATH);
  if (entry) {
    const membership = parseMembership(decodeBlob(await github.readBlob(entry.sha)));
    if (!membership) throw corruptError('membership_corrupt');
    return { membership, entry, created: false };
  }

  const catalogEntry = findBlob(tree, SKINCARE_CATALOG_PATH);
  const defaults = await loadSkincareDefaults({ tree, readBlob: sha => github.readBlob(sha) });
  let membership;
  if (catalogEntry) {
    const catalog = parseCatalog(decodeBlob(await github.readBlob(catalogEntry.sha)));
    membership = catalog
      ? migrateMembershipFromCatalog(catalog, library)
      : seedMembershipFromDefaults(defaults, library);
  } else {
    membership = seedMembershipFromDefaults(defaults, library);
  }

  const result = await writeJson(
    github,
    SKINCARE_ROUTINE_MEMBERSHIP_PATH,
    membership,
    'chore(skincare): seed routine membership'
  );
  return {
    membership,
    entry: { path: SKINCARE_ROUTINE_MEMBERSHIP_PATH, type: 'blob', sha: result.sha },
    created: true
  };
}

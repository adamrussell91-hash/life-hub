import { decodeBlob } from './decode-blob.mjs';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  migrateProductLibraryFromCatalog,
  parseProductLibrary,
  seedProductLibraryFromDefaults
} from '../../../js/app/skincare-product-library.js';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  migrateMembershipFromCatalog,
  parseMembership,
  seedMembershipFromDefaults
} from '../../../js/app/skincare-routine-membership.js';
import {
  SKINCARE_CATALOG_PATH,
  parseCatalog
} from '../../../js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../../js/app/skincare-routines-data.js';

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
    const library = parseProductLibrary(decodeBlob(await github.readBlob(entry.sha)));
    if (!library) throw corruptError('library_corrupt');
    return { library, entry, created: false };
  }

  const catalogEntry = findBlob(tree, SKINCARE_CATALOG_PATH);
  let library;
  if (catalogEntry) {
    const catalog = parseCatalog(decodeBlob(await github.readBlob(catalogEntry.sha)));
    library = migrateProductLibraryFromCatalog(catalog);
  } else {
    library = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  }

  await writeJson(github, SKINCARE_PRODUCT_LIBRARY_PATH, library, 'chore(skincare): seed product library');
  return { library, entry: undefined, created: true };
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
  let membership;
  if (catalogEntry) {
    const catalog = parseCatalog(decodeBlob(await github.readBlob(catalogEntry.sha)));
    membership = migrateMembershipFromCatalog(catalog, library);
  } else {
    membership = seedMembershipFromDefaults(SKINCARE_ROUTINES, library);
  }

  await writeJson(
    github,
    SKINCARE_ROUTINE_MEMBERSHIP_PATH,
    membership,
    'chore(skincare): seed routine membership'
  );
  return { membership, entry: undefined, created: true };
}

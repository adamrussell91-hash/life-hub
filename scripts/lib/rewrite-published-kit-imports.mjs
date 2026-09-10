import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static `import` / `export … from` only — dynamic import() of kit paths is not rewritten.
const KIT_FROM = /from (['"])((?:\.\.\/)+packages\/design-kit\/)([^'"]+)\1/g;

export function rewritePublishedKitSpecifiers(source, fromFile, publishRoot) {
  const fromDir = dirname(fileURLToPath(fromFile));
  return source.replace(KIT_FROM, (_all, quote, _prefix, rest) => {
    const published = relative(
      fromDir,
      fileURLToPath(new URL(`packages/design-kit/${rest}`, publishRoot))
    ).split('\\').join('/');
    return `from ${quote}${published}${quote}`;
  });
}

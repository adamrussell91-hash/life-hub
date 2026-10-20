import path from 'node:path';

/**
 * `@/x` means "the src of the app this file lives in". A hub that borrows
 * another hub's modules (Tasks and Professional run Teaching's block engine)
 * keeps each borrowed file resolving `@/x` inside its own app, so the engine
 * is used as it is, with no copy. `@<name>/x` reaches into a named app.
 *
 * @param {{ self: string, apps: Record<string, string> }} options
 *   `apps` maps an app name to its absolute src directory; `self` is the app
 *   being built, used for files outside every listed src.
 * @returns {import('vite').Plugin}
 */
export function appSrcAlias({ self, apps }) {
  const roots = Object.entries(apps).map(([name, dir]) => [name, path.resolve(dir)]);
  const selfRoot = path.resolve(apps[self]);

  function rootFor(importer) {
    if (!importer) return selfRoot;
    const file = path.normalize(importer);
    const hit = roots.find(([, dir]) => file.startsWith(dir + path.sep));
    return hit ? hit[1] : selfRoot;
  }

  return {
    name: 'life-hub-app-src-alias',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      let target = null;
      if (source.startsWith('@/')) {
        target = path.join(rootFor(importer), source.slice(2));
      } else {
        const named = roots.find(([name]) => source.startsWith(`@${name}/`));
        if (named) target = path.join(named[1], source.slice(named[0].length + 2));
      }
      if (target === null) return null;
      return this.resolve(target, importer, { ...options, skipSelf: true });
    }
  };
}

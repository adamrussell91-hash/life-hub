import { copyFile, cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { rewritePublishedKitSpecifiers } from './lib/rewrite-published-kit-imports.mjs';

const projectRoot = new URL('../', import.meta.url);
const lifeRoot = new URL('../apps/life/', import.meta.url);
const publishRoot = new URL('../dist/', import.meta.url);
const publishedDirectories = ['assets', 'css', 'js'];
const publishedFiles = ['index.html', 'manifest.webmanifest', 'service-worker.js'];

async function copyDesignKitStyles() {
  const kitRoot = new URL('packages/design-kit/', projectRoot);
  const kitPublish = new URL('packages/design-kit/', publishRoot);
  await mkdir(kitPublish, { recursive: true });
  const names = (await readdir(kitRoot)).filter(name => name.endsWith('.css'));
  await Promise.all(names.map(name => copyFile(
    new URL(name, kitRoot),
    new URL(name, kitPublish)
  )));
}

async function copyDesignKitModules() {
  await cp(
    new URL('packages/design-kit/js/', projectRoot),
    new URL('packages/design-kit/js/', publishRoot),
    { recursive: true }
  );
}

async function rewritePublishedKitImports(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async entry => {
    const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) {
      await rewritePublishedKitImports(next);
      return;
    }
    if (!entry.name.endsWith('.js')) return;
    const source = await readFile(next, 'utf8');
    const published = rewritePublishedKitSpecifiers(source, next, publishRoot);
    if (published !== source) await writeFile(next, published);
  }));
}

export async function prepareWeb() {
  await rm(publishRoot, { recursive: true, force: true });
  await mkdir(publishRoot, { recursive: true });

  await Promise.all([
    ...publishedDirectories.map(directory => cp(
      new URL(`${directory}/`, lifeRoot),
      new URL(`${directory}/`, publishRoot),
      { recursive: true }
    )),
    ...publishedFiles.map(file => copyFile(
      new URL(file, lifeRoot),
      new URL(file, publishRoot)
    )),
    copyDesignKitStyles(),
    copyDesignKitModules()
  ]);

  await rewritePublishedKitImports(new URL('js/', publishRoot));

  const vendorDirectory = new URL('vendor/', publishRoot);
  await mkdir(vendorDirectory, { recursive: true });
  await copyFile(
    new URL('node_modules/js-yaml/dist/js-yaml.mjs', projectRoot),
    new URL('js-yaml.mjs', vendorDirectory)
  );
}

await prepareWeb();

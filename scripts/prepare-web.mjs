import { copyFile, cp, mkdir, rm } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const publishRoot = new URL('../dist/', import.meta.url);
const publishedDirectories = ['assets', 'css', 'js'];
const publishedFiles = ['index.html', 'manifest.webmanifest', 'service-worker.js'];

export async function prepareWeb() {
  await rm(publishRoot, { recursive: true, force: true });
  await mkdir(publishRoot, { recursive: true });

  await Promise.all([
    ...publishedDirectories.map(directory => cp(
      new URL(`${directory}/`, projectRoot),
      new URL(`${directory}/`, publishRoot),
      { recursive: true }
    )),
    ...publishedFiles.map(file => copyFile(
      new URL(file, projectRoot),
      new URL(file, publishRoot)
    ))
  ]);

  const vendorDirectory = new URL('vendor/', publishRoot);
  await mkdir(vendorDirectory, { recursive: true });
  await copyFile(
    new URL('node_modules/js-yaml/dist/js-yaml.mjs', projectRoot),
    new URL('js-yaml.mjs', vendorDirectory)
  );
}

await prepareWeb();

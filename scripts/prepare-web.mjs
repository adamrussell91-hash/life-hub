import { copyFile, mkdir } from 'node:fs/promises';

const vendorDirectory = new URL('../vendor/', import.meta.url);
await mkdir(vendorDirectory, { recursive: true });
await copyFile(
  new URL('../node_modules/js-yaml/dist/js-yaml.mjs', import.meta.url),
  new URL('js-yaml.mjs', vendorDirectory)
);

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODEL_TEXTURE_PACK } from '@/views/city/model-url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cityDir = join(root, 'public/city');
const modelsDir = join(cityDir, 'models');
const assetsPath = join(cityDir, 'assets.json');

type AssetEntry = { file: string; licence: string; sourcePack: string; date: string };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(relative(cityDir, path));
  }
  return out;
}

describe('city model catalogue', () => {
  const modelFiles = readdirSync(modelsDir).filter((name) => !name.startsWith('.'));
  const assets = JSON.parse(readFileSync(assetsPath, 'utf8')) as AssetEntry[];

  it('gives every model file an entry', () => {
    const listed = new Set(assets.map((entry) => entry.file));
    const missing = modelFiles.filter((file) => !listed.has(file));
    expect(missing).toEqual([]);
  });

  it('points every entry at a real file and a CC0 line', () => {
    for (const entry of assets) {
      const path = entry.file.includes('/') ? join(cityDir, entry.file) : join(modelsDir, entry.file);
      expect(existsSync(path), entry.file).toBe(true);
      expect(entry.licence).toBe('CC0');
      expect(entry.sourcePack.length).toBeGreaterThan(0);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('credits every texture the models load', () => {
    const listed = new Set(assets.map((entry) => entry.file));
    const textures = walk(join(cityDir, 'textures'));
    expect(textures.filter((file) => !listed.has(file))).toEqual([]);
    for (const file of modelFiles) {
      const pack = MODEL_TEXTURE_PACK[file];
      expect(pack, file).toBeTruthy();
      expect(listed.has(`textures/${pack}/Textures/colormap.png`), file).toBe(true);
    }
  });
});

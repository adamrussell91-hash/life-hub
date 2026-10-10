import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GROVE_PROPS, GROVE_SPECIES, PROP_VARIANTS, TREE_VARIANTS, propModelFile, treeModelFile } from '@/domain/grove/assets';

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../life/assets/grove/manifest.json'), 'utf8')
) as { assets: { file: string; kind: string; slot: string }[] };
const files = new Set(manifest.assets.map((a) => a.file));

describe('Grove model catalogue matches the asset manifest', () => {
  it('every species variant has a mature model', () => {
    for (const species of GROVE_SPECIES) {
      for (let v = 1; v <= TREE_VARIANTS[species]; v += 1) expect(files).toContain(treeModelFile(species, v));
      expect(files).not.toContain(treeModelFile(species, TREE_VARIANTS[species] + 1));
    }
  });

  it('every ground-cover variant exists', () => {
    for (const kind of GROVE_PROPS) {
      for (let v = 1; v <= PROP_VARIANTS[kind]; v += 1) expect(files).toContain(propModelFile(kind, v));
    }
  });
});

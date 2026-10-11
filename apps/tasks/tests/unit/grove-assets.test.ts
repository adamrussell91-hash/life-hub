import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GROVE_PROPS, GROVE_SPECIES, PROP_VARIANTS, TREE_VARIANTS, propModelFile, treeModelFile } from '@/domain/grove/assets';

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../life/assets/grove/manifest.json'), 'utf8')
) as { assets: { file: string; kind: string; slot: string; id: string; bytes: number; source: { original_file: string } }[] };
const files = new Set(manifest.assets.map((a) => a.file));

describe('Grove model catalogue matches the asset manifest', () => {
  it('exposes all 25 authored mature trees without changing the original first 15 sources', () => {
    expect(TREE_VARIANTS).toEqual({life:5, teaching:3, health:5, wedding:5, other:2, late:5});
    const families = {life:'Pine', teaching:'CommonTree', health:'Birch', wedding:'CherryBlossom', other:'CommonTree', late:'TwistedTree'};
    for (const species of GROVE_SPECIES) for (let variant=1;variant<=TREE_VARIANTS[species];variant++) {
      const item=manifest.assets.find(a=>a.file===treeModelFile(species,variant));
      expect(item, species+' variant '+variant).toBeDefined();
      // Cherry3 keeps its authored topology/UVs; bounded 350 KB exception.
      expect(item!.bytes).toBeLessThan(species==='wedding'&&variant===3?350000:300000);
      expect(item?.source.original_file).toBe('glTF/'+families[species]+'_'+(species==='other'?variant+3:variant)+'.gltf');
      expect(existsSync(join(dirname(fileURLToPath(import.meta.url)), '../../../life/assets/grove',item!.file))).toBe(true);
    }
  });
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

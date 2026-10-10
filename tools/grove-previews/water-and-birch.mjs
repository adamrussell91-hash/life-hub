// Grove follow-up after the MegaKit switch (Adam, 10 Oct 2026):
// 1. Reeds and lily pads come back from the preserved Kenney Nature Kit models,
//    recoloured from the city teal to Grove greens.
// 2. Birch leaves ship autumn orange; hue-shift them to a fresh green so Health
//    reads as a living birch, not an autumn tree.
// Idempotent: reeds/lilies are recopied from city-candidates each run, and the
// birch shift is skipped once the leaves are already green.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../apps/life/assets');
const grove = path.join(assets, 'grove');
const kenney = path.join(assets, 'city-candidates/kenney-nature');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});

// Linear-space factors close to the MegaKit grass and bush greens.
const WATER_GREENS = {leafsGreen: [0.13, 0.33, 0.07, 1], leafsDark: [0.07, 0.21, 0.05, 1]};
const WATER_IDS = ['reed-1', 'reed-2', 'lily-1', 'lily-2'];

const manifestPath = path.join(grove, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const kenneyManifest = JSON.parse(await fs.readFile(path.join(kenney, 'manifest.json'), 'utf8'));

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    n += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
  }
  return n;
}

const water = [];
for (const id of WATER_IDS) {
  const source = kenneyManifest.assets.find(a => a.id === id);
  if (!source) throw Error(`Kenney manifest has no ${id}`);
  const doc = await io.read(path.join(kenney, source.file));
  for (const material of doc.getRoot().listMaterials()) {
    const green = WATER_GREENS[material.getName()];
    if (green) material.setBaseColorFactor(green);
  }
  const out = path.join(grove, 'models/ground', `${id}.glb`);
  await io.write(out, doc);
  water.push({
    ...source,
    file: `models/ground/${id}.glb`,
    preview: `previews/${id}.png`,
    bytes: (await fs.stat(out)).size,
    triangles: triangles(doc),
    notes: id.startsWith('reed')
      ? 'Kenney waterside plant kept for Grove water edges; teal city palette recoloured to Grove greens. No cattail seed head.'
      : 'Kenney lily pad kept for Grove lakes; teal city palette recoloured to Grove greens.'
  });
}

const kept = manifest.assets.filter(a => !WATER_IDS.includes(a.id));
const at = kept.findIndex(a => a.slot === 'bridge');
manifest.assets = [...kept.slice(0, at), ...water, ...kept.slice(at)];

for (const asset of manifest.assets.filter(a => a.slot === 'tree-health')) {
  const file = path.join(grove, asset.file);
  const doc = await io.read(file);
  const leaves = doc.getRoot().listMaterials().find(m => /leaves/i.test(m.getName()));
  const texture = leaves?.getBaseColorTexture();
  if (!texture) throw Error(`No leaf texture in ${asset.id}`);
  const image = sharp(texture.getImage());
  const {dominant} = await image.clone().stats();
  if (dominant.g > dominant.r) continue; // already green
  // Orange (~25°) to a light spring green (~85°), brighter than the oak. Alpha mask is untouched.
  texture.setImage(await image.modulate({hue: 62, saturation: 1.05, brightness: 1.35}).webp({quality: 90}).toBuffer());
  await io.write(file, doc);
  asset.bytes = (await fs.stat(file)).size;
  if (!asset.notes.includes('hue-shifted')) asset.notes += ' Autumn-orange leaves hue-shifted to green for Grove.';
}

await fs.copyFile(path.join(kenney, 'licenses/kenney-nature-kit.txt'), path.join(grove, 'licenses/kenney-nature-kit.txt'));
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('water assets:', water.map(a => `${a.id} ${a.bytes}B ${a.triangles}tri`).join(', '));

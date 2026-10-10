import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// Source packs stay outside the repository. See README for the download layout.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const sourceRoot = path.resolve(process.argv[2] || path.join(repo, '..'));
const out = path.join(repo, 'apps/life/assets/grove');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const selection = JSON.parse(await fs.readFile(path.join(here, 'selection.json')));
const only = process.env.GROVE_ONLY_KIND;
const assets = only ? JSON.parse(await fs.readFile(path.join(out,'manifest.json'))).assets.filter(a=>a.kind!==only) : [];
for (const item of selection.filter(a=>!only || a.kind===only)) {
  const [family, ...parts] = item.input.split('/');
  const original = parts.join('/');
  const input = family === 'kenney'
    ? path.join(repo, 'assets/kenney/kenney_nature-kit/Models/GLTF format', original)
    : path.join(sourceRoot, family === 'nature' ? 'nature-sources' : 'animal-sources', original);
  const doc = await io.read(input);
  const root = doc.getRoot();
  for (const camera of root.listCameras()) camera.dispose();
  for (const node of root.listNodes()) for (const ext of node.listExtensions()) {
    if (ext.extensionName === 'KHR_lights_punctual') node.setExtension(ext.extensionName, null);
  }
  const clipMap = {Idle:'idle', Walk:'walk', Gallop:'run', Run:'run', Eating:'eat'};
  const animationSourceNames = {};
  for (const clip of root.listAnimations()) {
    const sourceName = clip.getName(), name = clipMap[sourceName];
    if (!name || animationSourceNames[name]) clip.dispose();
    else { clip.setName(name); animationSourceNames[name] = sourceName; }
  }
  // Preserve alpha-mask foliage. Discarding its texture would turn leaves into cards.
  for (const mat of root.listMaterials()) {
    mat.setMetallicFactor(0).setRoughnessFactor(1);
    if (family==='kenney' && /grass/i.test(mat.getName())) mat.setBaseColorFactor([.12,.34,.055,1]);
    if (family==='kenney' && /wood|bark|brown/i.test(mat.getName())) mat.setBaseColorFactor([.34,.16,.065,1]);
    if (item.flower_colour && /^color/i.test(mat.getName())) mat.setBaseColorFactor([...item.flower_colour,1]);
    if (item.tint === 'birch' && /Bark/.test(mat.getName())) {
      mat.setBaseColorTexture(null).setNormalTexture(null).setBaseColorFactor([.82,.79,.69,1]);
    }
    if (item.tint === 'blossom' && /Leaves/.test(mat.getName())) {
      const texture = mat.getBaseColorTexture();
      if (texture?.getImage()) {
        const clone = texture.clone();
        // Retain the mask, recolour RGB for the wedding stand-in.
        const {data, info} = await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        for(let p=0;p<data.length;p+=4){data[p]=242;data[p+1]=145;data[p+2]=180;}
        clone.setImage(await sharp(data,{raw:info}).png().toBuffer()).setMimeType('image/png');
        mat.setBaseColorTexture(clone);
      }
    }
  }
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const bounds = getBounds(scene);
  const span = bounds.max.map((v,i)=>v-bounds.min[i]);
  const scale = item.target_length ? item.target_length / span[2] : item.target_height / span[1];
  if (!Number.isFinite(scale) || scale <= 0) throw Error(`Invalid bounds: ${item.id}`);
  const wrapper = doc.createNode(`${item.id}-metres`).setScale([scale,scale,scale]);
  for (const child of [...scene.listChildren()]) { scene.removeChild(child); wrapper.addChild(child); }
  wrapper.setTranslation([-(bounds.min[0]+bounds.max[0])*scale/2,-bounds.min[1]*scale,-(bounds.min[2]+bounds.max[2])*scale/2]);
  scene.addChild(wrapper);
  await doc.transform(dedup(), prune(), textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
  const kindFolder = item.kind === 'tree' ? 'trees' : item.kind === 'animal' ? 'animals' : 'ground';
  const file = `models/${kindFolder}/${item.id}.glb`;
  const dest = path.join(out, file);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  const temp = dest+'.input.glb';
  await io.write(temp, doc);
  execFileSync(path.join(here,'node_modules/.bin/gltf-transform'),['optimize',temp,dest,'--compress','meshopt','--texture-compress','webp'],{stdio:'pipe'});
  await fs.unlink(temp);
  const final = await io.read(dest);
  const measured = getBounds(final.getRoot().getDefaultScene());
  let triangles=0;
  for (const mesh of final.getRoot().listMeshes()) for(const p of mesh.listPrimitives()) {
    const n = (p.getIndices() || p.getAttribute('POSITION')).getCount();
    triangles += p.getMode()===4 ? n/3 : p.getMode()===5 || p.getMode()===6 ? Math.max(0,n-2) : 0;
  }
  const pack = family === 'nature' ? 'Stylized Nature MegaKit (Standard)' : family === 'animals' ? 'Ultimate Animated Animal Pack' : 'Nature Kit';
  assets.push({id:item.id,slot:item.slot,kind:item.kind,variant:item.variant,stage:item.stage,file,preview:`previews/${item.id}.png`,bytes:(await fs.stat(dest)).size,triangles,height_m: +(measured.max[1]-measured.min[1]).toFixed(4),animations:final.getRoot().listAnimations().map(a=>a.getName()),animation_source_names:animationSourceNames,source:{pack,author:family==='kenney'?'Kenney':'Quaternius',page_url:family==='nature'?'https://quaternius.com/packs/stylizednaturemegakit.html':family==='animals'?'https://quaternius.com/packs/ultimateanimatedanimals.html':'https://kenney.nl/assets/nature-kit',original_file:original,downloaded_at:'2026-10-10'},license:{id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:null},notes:item.notes});
  console.log(item.id, assets.at(-1).bytes);
}
assets.sort((a,b)=>selection.findIndex(s=>s.id===a.id)-selection.findIndex(s=>s.id===b.id));
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({version:1,generated_at:new Date().toISOString(),budget_bytes:26214400,total_bytes:0,assets},null,2)+'\n');

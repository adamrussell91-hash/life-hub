import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {createHash} from 'node:crypto';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
const here=path.dirname(fileURLToPath(import.meta.url));
const grove=path.resolve(here,'../../apps/life/assets/grove');
async function files(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);result.push(...(entry.isDirectory()?await files(p):[p]));}return result;}
const manifestPath=path.join(grove,'manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath));
const reports=JSON.parse(await fs.readFile(path.join(here,'render-report.json')));
assert.equal(reports.length,manifest.assets.length);
// Include the manifest itself in the budget; settle the decimal-width fixed point.
if(process.argv.includes('--update-total')){
 for(let i=0;i<4;i++){
  manifest.total_bytes=(await Promise.all((await files(grove)).map(async p=>(await fs.stat(p)).size))).reduce((a,b)=>a+b,0);
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 }
}
const all=await files(grove),models=all.filter(p=>p.endsWith('.glb')),previews=all.filter(p=>p.endsWith('.png')&&!p.endsWith('/_sheet.png'));
const total=(await Promise.all(all.map(async p=>(await fs.stat(p)).size))).reduce((a,b)=>a+b,0);
assert.equal(manifest.version,1);assert.equal(manifest.budget_bytes,26214400);assert.equal(manifest.total_bytes,total);assert(total<=manifest.budget_bytes);
assert.equal(models.length,manifest.assets.length);assert.equal(previews.length,manifest.assets.length);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});await MeshoptDecoder.ready;
const seen=new Set(),expectedModels=new Set(),expectedPreviews=new Set();
const licenseFiles={'Stylized Nature MegaKit (Source)':'quaternius-stylized-nature-megakit-source.txt','Ultimate Animated Animal Pack':'quaternius-ultimate-animated-animals.txt'};
const licenseDoc=await fs.readFile(path.join(grove,'LICENSES.md'),'utf8');
for(const a of manifest.assets){
 assert(!seen.has(a.id));seen.add(a.id);assert(/^[a-z0-9-]+$/.test(a.id));
 assert(['tree','ground','animal'].includes(a.kind));assert(['sapling','young','mature',null].includes(a.stage));
 assert.equal(a.source.author,'Quaternius');assert(a.source.page_url.startsWith('https://'));assert(a.source.author&&a.source.original_file&&a.source.downloaded_at);assert(Number.isInteger(a.variant)&&a.variant>0);
 assert.equal(a.license.id,'CC0-1.0');assert.equal(a.license.attribution,null);assert.equal(a.license.url,'https://creativecommons.org/publicdomain/zero/1.0/');
 const license=licenseFiles[a.source.pack];assert(license);assert.match(await fs.readFile(path.join(grove,'licenses',license),'utf8'),/CC0/i);assert(licenseDoc.includes(a.source.page_url));
 const file=path.resolve(grove,a.file),preview=path.resolve(grove,a.preview);assert(file.startsWith(grove+'/models/'));assert(preview.startsWith(grove+'/previews/'));expectedModels.add(file);expectedPreviews.add(preview);
 assert.equal(path.basename(file),a.id+'.glb');assert.equal(path.basename(preview),a.id+'.png');assert.equal((await fs.stat(file)).size,a.bytes);
 assert(a.bytes<(a.kind==='animal'?800000:300000));assert(a.triangles>0&&Number.isInteger(a.triangles));assert(Number.isFinite(a.height_m)&&a.height_m>0);
 const png=await sharp(preview).metadata();assert.equal(png.width,512);assert.equal(png.height,512);
 const doc=await io.read(file),root=doc.getRoot();assert.equal(root.listCameras().length,0);
  const report=reports.find(r=>r.file===a.file);assert(report,`Render report: ${a.id}`);
  assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),report.sha256,`Stale render: ${a.id}`);
  const bounds=report.bounds;
  assert.deepEqual(report.animations.map(c=>c.name),a.animations);
  for(const clip of report.animations)assert(clip.moves&&clip.duration>0,`Animation: ${a.id}/${clip.name}`);
  assert(Math.abs(bounds.min[1])<.02,`Ground pivot: ${a.id}`);
  assert(Math.abs(bounds.min[0]+bounds.max[0])<.04,`X centre: ${a.id}`);
  assert(Math.abs(bounds.min[2]+bounds.max[2])<.1,`Z centre: ${a.id}`);
  assert(Math.abs(bounds.max[1]-bounds.min[1]-a.height_m)<.02,`Height: ${a.id}`);
  if(a.kind==='tree'&&a.stage==='mature')assert(a.height_m>=4&&a.height_m<=7);
 assert(!root.listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression'||e.extensionName==='KHR_lights_punctual'));
 for(const texture of root.listTextures()){const m=await sharp(texture.getImage()).metadata();assert(m.width<=512&&m.height<=512);}
 const clips=root.listAnimations().map(c=>c.getName());assert.deepEqual(clips,a.animations);assert.deepEqual(Object.keys(a.animation_source_names),clips);
 if(a.kind==='animal'){assert(clips.includes('idle'));assert(clips.includes('walk'));}
 execFileSync(path.join(here,'node_modules/.bin/gltf-transform'),['inspect',file],{stdio:'pipe'});
}
assert.deepEqual(new Set(models),expectedModels);assert.deepEqual(new Set(previews),expectedPreviews);
for(const kind of ['tree','animal'])assert.equal(new Set(manifest.assets.filter(a=>a.kind===kind).map(a=>a.source.pack)).size,1);
await sharp(path.join(grove,'previews/_sheet.png')).metadata();
console.log(`PASS: ${models.length} GLBs inspected, ${previews.length} previews, licences and manifest match. ${total} / ${manifest.budget_bytes} bytes.`);

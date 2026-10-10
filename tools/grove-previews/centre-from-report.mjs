import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
const folder=path.resolve(process.argv[2]);
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json')));
const reports=JSON.parse(await fs.readFile(path.join(folder,'render-report.json')));
for(const asset of manifest.assets){
 const file=path.join(folder,asset.file),report=reports.find(r=>r.file===asset.file);
 if(!report)throw Error('Missing browser bounds: '+asset.id);
 if(createHash('sha256').update(await fs.readFile(file)).digest('hex')!==report.sha256)throw Error('Stale report: '+asset.id);
 const delta=[-(report.bounds.min[0]+report.bounds.max[0])/2,-report.bounds.min[1],-(report.bounds.min[2]+report.bounds.max[2])/2];
 if(Math.max(...delta.map(Math.abs))>1e-4){
  const doc=await io.read(file),scene=doc.getRoot().getDefaultScene();
  const wrapper=doc.createNode(asset.id+'-placement-origin').setTranslation(delta);
  for(const child of [...scene.listChildren()]){scene.removeChild(child);wrapper.addChild(child);}scene.addChild(wrapper);
  await io.write(file,doc);
 }
 asset.bytes=(await fs.stat(file)).size;
}
await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Placement origins corrected; render again to refresh hash-linked reports.');

import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
/** Deployment catalogue: public Quaternius plus any installed project-use bundle. */
export function groveAnimalCatalogue(root, includeProject = true) {
  const assets=new Map();
  for(const prefix of includeProject ? ['', 'project-only/'] : ['']) {
    const file=join(root,prefix,'manifest.json');
    if(!existsSync(file)) continue;
    const manifest=JSON.parse(readFileSync(file,'utf8'));
    for(const asset of manifest.assets??[]) {
      if(asset.kind!=='animal') continue;
      const roles=asset.animation_roles ?? {idle:'idle',locomotion:'walk',feed:'eat',fast:'run'};
      assets.set(asset.id,{id:asset.id,file:prefix+asset.file,animations:asset.animations,roles,waterline:asset.waterline_m??.085,credit:asset.license?.attribution??null});
    }
  }
  return {version:1,assets:[...assets.values()]};
}

import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
/** Every file copied by the installer must have a declared hash, including licence/gallery metadata. */
export async function verifyHashInventory(directory){const source=path.resolve(directory),entries=JSON.parse(await fs.readFile(path.join(source,'SHA256SUMS.json'))),declared=new Set();if(!Array.isArray(entries))throw Error('Invalid hash inventory');for(const entry of entries){const file=path.resolve(source,entry.file||'');if(!file.startsWith(source+path.sep)||entry.file!==path.relative(source,file)||declared.has(entry.file)||entry.file==='SHA256SUMS.json')throw Error('Invalid inventory path');declared.add(entry.file);const bytes=await fs.readFile(file);if(bytes.length!==entry.bytes)throw Error('Inventory size mismatch '+entry.file);if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Inventory hash mismatch '+entry.file);}const actual=new Set();async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in bundle');if(item.isDirectory())await walk(full);else if(full!==path.join(source,'SHA256SUMS.json'))actual.add(path.relative(source,full));}}await walk(source);if(actual.size!==declared.size||[...actual].some(f=>!declared.has(f)))throw Error('Incomplete hash inventory');return entries;}
function clipNames(clips,label){
 if(!Array.isArray(clips)||!clips.length||clips.some(c=>typeof c!=='string'||!c)||new Set(clips).size!==clips.length)throw Error('Invalid animation clips '+label);
 return clips;
}
export function verifyDeclaredModelHash(asset,report,bytes){
 const clips=clipNames(asset?.animations,asset?.id),hash=createHash('sha256').update(bytes).digest('hex');
 if(asset.sha256!==hash)throw Error('Manifest model hash mismatch '+asset.id);
 if(!report||report.sha256!==hash)throw Error('Motion model hash mismatch '+asset.id);
 const motionClips=clipNames(Array.isArray(report.animations)?report.animations.map(c=>c?.name):null,asset.id+' motion');
 if(motionClips.length!==clips.length||motionClips.some(name=>!clips.includes(name)))throw Error('Motion clip evidence mismatch '+asset.id);
 if(report.independent_baby_skeleton!==true||report.skin_weights_valid!==true||report.animations.some(c=>c.moves!==true||!Number.isFinite(c.duration)||c.duration<=0||!Number.isFinite(c.relative_deformation_m)||c.relative_deformation_m<1e-5))throw Error('Invalid deformation evidence '+asset.id);
}
export function verifyMotionReports(reports,assets){
 if(!Array.isArray(reports)||reports.length!==assets.length||reports.some(r=>!r||typeof r.file!=='string')||new Set(reports.map(r=>r.file)).size!==reports.length||reports.some(r=>!assets.some(a=>a.file===r.file)))throw Error('Invalid motion report catalogue');
}
export const REQUIRED_ANIMATIONS={'animal-rabbit-hare':['idle','hop','run','eat'],'animal-squirrel':['idle','walk','run','eat'],'animal-bird-robin':['idle','hop','fly','eat'],'animal-duck-mallard':['idle','walk','swim','eat'],'animal-owl':['idle','hop','fly','eat'],'animal-deer-doe':['idle','walk','run','eat'],'animal-deer-stag':['idle','walk','run','eat'],'animal-fox':['idle','walk','run','eat'],...Object.fromEntries(['bear','boar','moose','wolf','deer','stag','fox'].map(n=>['animal-forest-'+n,['idle','walk','run','sleep']])),'animal-forest-rabbit':['idle','walk','sleep'],...Object.fromEntries(['skunk','chipmunk','raccoon'].map(n=>['animal-'+n,['idle','walk','run','eat']])),'animal-river-otter':['idle','walk','run','eat','swim']};
export function verifyRequiredCatalogue(manifest){
 if(!manifest||!Array.isArray(manifest.assets)||manifest.assets.some(a=>!a||typeof a.id!=='string')||new Set(manifest.assets.map(a=>a.id)).size!==manifest.assets.length)throw Error('Invalid animal catalogue assets');
 for(const[id,clips]of Object.entries(REQUIRED_ANIMATIONS)){const a=manifest.assets.find(a=>a.id===id);if(a)clipNames(a.animations,a.id);if(!a||clips.some(c=>!a.animations.includes(c)))throw Error('Not ready: '+id);}
 if(manifest.assets.length!==20)throw Error('Expected exactly 20 ready animal models');
}

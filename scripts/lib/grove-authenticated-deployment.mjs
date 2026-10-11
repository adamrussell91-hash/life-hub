/** Legacy compatibility is reachable only after AES-GCM authentication, never through the public installer. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openBundle} from './grove-private-bundle.mjs';
import {verifyHashInventory,verifyDeclaredModelHash,verifyRequiredCatalogue,verifyMotionReports} from '../../tools/grove-previews/animal-bundle-integrity.mjs';
import {replaceAnimalBundle} from '../../tools/grove-previews/atomic-animal-install.mjs';
const evidence=JSON.parse(await fs.readFile(new URL('./grove-legacy-deployment-evidence.json',import.meta.url)));
function modelPath(source,relative){const file=path.resolve(source,relative);if(!file.startsWith(source+path.sep))throw Error('Invalid deployment model path');return file;}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileInventory(root){const entries=[];async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in deployment inventory');if(item.isDirectory())await walk(file);else{const bytes=await fs.readFile(file);entries.push({file:path.relative(root,file),bytes:bytes.length,sha256:sha(bytes)});}}}await walk(root);return entries;}
async function migrateExactLegacy(source){
 const actual=await fileInventory(source),pinned=new Map(evidence.files.map(e=>[e.file,e]));
 if(actual.length!==pinned.size||actual.some(e=>{const p=pinned.get(e.file);return!p||e.bytes!==p.bytes||e.sha256!==p.sha256;}))throw Error('Legacy deployment inventory/hash differs from verified original eight');
 const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json')));
 if(!manifest||!Array.isArray(manifest.assets)||manifest.assets.some(a=>!a||typeof a.id!=='string')||manifest.assets.length!==8||new Set(manifest.assets.map(a=>a.id)).size!==8||manifest.assets.some(a=>!evidence.asset_ids.includes(a.id)))throw Error('Legacy deployment is not the exact eight-model catalogue');
 for(const asset of manifest.assets){const report=evidence.verified_motion.find(r=>r.file===asset.file);asset.sha256=sha(await fs.readFile(modelPath(source,asset.file)));verifyDeclaredModelHash(asset,report,await fs.readFile(modelPath(source,asset.file)));}
 manifest.delivery='Authenticated legacy eight-model deployment migration; twelve expansion models require a freshly sealed twenty-model bundle.';
 await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(source,'motion-report.json'),JSON.stringify(evidence.verified_motion,null,2)+'\n');
 await fs.writeFile(path.join(source,'SHA256SUMS.json'),JSON.stringify(await fileInventory(source),null,2)+'\n');
 await verifyHashInventory(source);return manifest;
}
export async function installAuthenticatedGroveDeployment(sealed,key,repository){
 // Authentication completes before any archive parsing or extraction.
 const clear=openBundle(sealed,key),temp=await fs.mkdtemp(path.join(os.tmpdir(),'grove-authenticated-assets-'));
 try{
  const archive=path.join(temp,'assets.tgz');await fs.writeFile(archive,clear,{mode:0o600});
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
  if(names.some(raw=>{const n=raw.replace(/^(?:\.\/)+/,'');return!/^bundle(?:\/|$)/.test(n)||n.split('/').includes('..')||n.includes('\\');}))throw Error('Invalid deployment archive path');
  const types=execFileSync('tar',['-tvzf',archive],{encoding:'utf8'}).trim().split('\n');if(types.some(line=>!['-','d'].includes(line[0])))throw Error('Links or special files in deployment archive');
  execFileSync('tar',['-xzf',archive,'-C',temp]);const source=path.join(temp,'bundle');
  let modern=true;try{await fs.access(path.join(source,'SHA256SUMS.json'));}catch(e){if(e.code!=='ENOENT')throw e;modern=false;}
  let manifest;if(modern){await verifyHashInventory(source);manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json')));verifyRequiredCatalogue(manifest);const reports=JSON.parse(await fs.readFile(path.join(source,'motion-report.json')));verifyMotionReports(reports,manifest.assets);for(const a of manifest.assets)verifyDeclaredModelHash(a,reports.find(r=>r.file===a.file),await fs.readFile(modelPath(source,a.file)));}else manifest=await migrateExactLegacy(source);
  const repo=path.resolve(repository);execFileSync('git',['check-ignore','-q','apps/life/assets/grove/project-only/manifest.json'],{cwd:repo});const target=path.join(repo,'apps/life/assets/grove/project-only');await replaceAnimalBundle(source,target);
  return {assets:manifest.assets.length,migrated_legacy:!modern};
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {sealBundle,openBundle} from '../../scripts/lib/grove-private-bundle.mjs';
import {REQUIRED_ANIMATIONS} from '../../tools/grove-previews/animal-bundle-integrity.mjs';
const moduleUrl=new URL('../../scripts/lib/grove-release-transfer.mjs',import.meta.url);
const transfer=async(...args)=>(await import(moduleUrl)).transferGroveRelease(...args);
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(mutate){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'grove-transfer-test-')),repo=path.join(temp,'repo'),bundle=path.join(temp,'bundle');
 await fs.mkdir(repo);execFileSync('git',['init','-q',repo]);await fs.writeFile(path.join(repo,'.gitignore'),'apps/life/assets/grove/project-only/\n');
 await fs.mkdir(path.join(bundle,'models/animals'),{recursive:true});
 const assets=[],reports=[];
 for(const [id,animations] of Object.entries(REQUIRED_ANIMATIONS)){
  const file=`models/animals/${id}.glb`,bytes=Buffer.from(`Synthetic verifier fixture ${id}`),hash=sha(bytes);
  await fs.writeFile(path.join(bundle,file),bytes);
  assets.push({id,file,kind:'animal',animations,animation_roles:{idle:'idle',locomotion:animations[1]},license:{id:'CC0',attribution:null},sha256:hash});
  reports.push({file,sha256:hash,independent_baby_skeleton:true,skin_weights_valid:true,animations:animations.map(name=>({name,moves:true,duration:1,relative_deformation_m:0.01}))});
 }
 await fs.writeFile(path.join(bundle,'manifest.json'),JSON.stringify({assets}));await fs.writeFile(path.join(bundle,'motion-report.json'),JSON.stringify(reports));
 if(mutate)await mutate(bundle,assets);
 const inventory=[];async function walk(dir){for(const ent of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())await walk(f);else if(!ent.isSymbolicLink()){const b=await fs.readFile(f);inventory.push({file:path.relative(bundle,f),bytes:b.length,sha256:sha(b)});}}}await walk(bundle);await fs.writeFile(path.join(bundle,'SHA256SUMS.json'),JSON.stringify(inventory));
 const archive=execFileSync('tar',['-czf','-','-C',temp,'bundle']),key=randomBytes(32).toString('hex'),inputKey=randomBytes(32).toString('hex');
 const deployment=path.join(repo,'apps/life/assets/grove/deployment');await fs.mkdir(deployment,{recursive:true});const original=sealBundle(Buffer.from('authenticated original'),key);await fs.writeFile(path.join(deployment,'animals.enc'),original);await fs.writeFile(path.join(deployment,'release-input.enc'),sealBundle(archive,inputKey));
 const target=path.join(repo,'apps/life/assets/grove/project-only');await fs.mkdir(target);await fs.writeFile(path.join(target,'sentinel'),'untouched');
 return {temp,repo,bundle,archive,key,inputKey,original,deployment,target};
}
async function unchanged(f){assert.deepEqual(await fs.readFile(path.join(f.deployment,'animals.enc')),f.original);assert.equal(await fs.readFile(path.join(f.target,'sentinel'),'utf8'),'untouched');}
async function run(mutate,body){const f=await fixture(mutate);try{await body(f);}finally{await fs.rm(f.temp,{recursive:true,force:true});}}
test('missing input skips without keys',()=>run(null,async f=>{await fs.rm(path.join(f.deployment,'release-input.enc'));assert.deepEqual(await transfer(f.repo,{}),{skipped:true});await unchanged(f);}));
test('strict twenty transfer installs cleanly and retains existing key',()=>run(null,async f=>{assert.deepEqual(await transfer(f.repo,{deploymentKey:f.key,inputKey:f.inputKey}),{assets:20,skipped:false});const encrypted=await fs.readFile(path.join(f.deployment,'animals.enc'));assert.deepEqual(openBundle(encrypted,f.key),f.archive);assert.throws(()=>openBundle(encrypted,f.inputKey));await assert.rejects(fs.access(path.join(f.target,'sentinel')));assert.equal(JSON.parse(await fs.readFile(path.join(f.target,'manifest.json'))).assets.length,20);}));
for(const mode of ['missing deployment key','missing input key','wrong deployment key','wrong input key','tampered input','tampered original'])test(mode+' rejects without mutation',()=>run(null,async f=>{const keys={deploymentKey:f.key,inputKey:f.inputKey};if(mode==='missing deployment key')delete keys.deploymentKey;if(mode==='missing input key')delete keys.inputKey;if(mode==='wrong deployment key')keys.deploymentKey=randomBytes(32).toString('hex');if(mode==='wrong input key')keys.inputKey=randomBytes(32).toString('hex');if(mode.startsWith('tampered')){const file=path.join(f.deployment,mode==='tampered input'?'release-input.enc':'animals.enc'),b=await fs.readFile(file);b[b.length-1]^=1;await fs.writeFile(file,b);if(mode==='tampered original')f.original=b;}await assert.rejects(transfer(f.repo,keys));await unchanged(f);}));
for(const count of [8,19,21])test('rejects '+count+' models before installation',()=>run(async(bundle,assets)=>{const changed=count===21?[...assets,{...assets[0],id:'extra'}]:assets.slice(0,count);await fs.writeFile(path.join(bundle,'manifest.json'),JSON.stringify({assets:changed}));},async f=>{await assert.rejects(transfer(f.repo,{deploymentKey:f.key,inputKey:f.inputKey}),/ready|catalogue|20/i);await unchanged(f);}));
test('rejects archive symlinks before installation',()=>run(bundle=>fs.symlink('/etc/passwd',path.join(bundle,'link')),async f=>{await assert.rejects(transfer(f.repo,{deploymentKey:f.key,inputKey:f.inputKey}),/Links|special/);await unchanged(f);}));
test('rejects archive outside bundle before installation',()=>run(null,async f=>{await fs.writeFile(path.join(f.temp,'outside'),'bad');const archive=execFileSync('tar',['-czf','-','-C',f.temp,'outside']);await fs.writeFile(path.join(f.deployment,'release-input.enc'),sealBundle(archive,f.inputKey));await assert.rejects(transfer(f.repo,{deploymentKey:f.key,inputKey:f.inputKey}),/path/);await unchanged(f);}));
test('rejects legacy input before installation',()=>run(null,async f=>{await fs.rm(path.join(f.bundle,'SHA256SUMS.json'));const archive=execFileSync('tar',['-czf','-','-C',f.temp,'bundle']);await fs.writeFile(path.join(f.deployment,'release-input.enc'),sealBundle(archive,f.inputKey));await assert.rejects(transfer(f.repo,{deploymentKey:f.key,inputKey:f.inputKey}),/modern|inventory/i);await unchanged(f);}));

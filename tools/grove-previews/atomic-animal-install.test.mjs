import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'grove-atomic-test-')),source=path.join(root,'source'),target=path.join(root,'installed');
 await fs.mkdir(source);await fs.mkdir(target);await fs.writeFile(path.join(target,'old.txt'),'previous');
 const bytes=Buffer.from('new delivery');await fs.writeFile(path.join(source,'new.txt'),bytes);
 await fs.writeFile(path.join(source,'SHA256SUMS.json'),JSON.stringify([{file:'new.txt',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]));
 return {root,source,target};
}
test('invalid staged delivery preserves previous installation',async()=>{const f=await fixture();try{const {replaceAnimalBundle}=await import('./atomic-animal-install.mjs');await fs.writeFile(path.join(f.source,'new.txt'),'tampered');await assert.rejects(replaceAnimalBundle(f.source,f.target),/hash|size/i);assert.equal(await fs.readFile(path.join(f.target,'old.txt'),'utf8'),'previous');assert.deepEqual((await fs.readdir(f.root)).sort(),['installed','source']);}finally{await fs.rm(f.root,{recursive:true,force:true});}});
test('failed final rename restores previous installation',async t=>{const f=await fixture();try{const {replaceAnimalBundle}=await import('./atomic-animal-install.mjs'),rename=fs.rename.bind(fs);t.mock.method(fs,'rename',async(from,to)=>{if(to===f.target&&path.basename(from)==='ready')throw Error('simulated filesystem commit failure');return rename(from,to);});await assert.rejects(replaceAnimalBundle(f.source,f.target),/commit failure/);assert.equal(await fs.readFile(path.join(f.target,'old.txt'),'utf8'),'previous');assert.deepEqual((await fs.readdir(f.root)).sort(),['installed','source']);}finally{t.mock.restoreAll();await fs.rm(f.root,{recursive:true,force:true});}});
test('failed restoration retains the previous bundle for recovery',async t=>{const f=await fixture();try{const {replaceAnimalBundle}=await import('./atomic-animal-install.mjs'),rename=fs.rename.bind(fs);t.mock.method(fs,'rename',async(from,to)=>{if(to===f.target)throw Error('simulated filesystem failure');return rename(from,to);});await assert.rejects(replaceAnimalBundle(f.source,f.target),error=>error instanceof AggregateError&&/previous bundle retained/.test(error.message));const staging=(await fs.readdir(f.root)).find(name=>name.startsWith('.grove-install-'));assert(staging);assert.equal(await fs.readFile(path.join(f.root,staging,'previous','old.txt'),'utf8'),'previous');}finally{t.mock.restoreAll();await fs.rm(f.root,{recursive:true,force:true});}});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository=fileURLToPath(new URL('../../',import.meta.url));
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'grove-publication-'));
 const write=async(file,content='')=>{const full=path.join(root,file);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,content);};
 for(const script of ['scripts/prepare-web.mjs','scripts/lib/grove-animal-catalogue.mjs','scripts/lib/rewrite-published-kit-imports.mjs'])await write(script,await fs.readFile(path.join(repository,script)));
 for(const folder of ['apps/life/assets','apps/life/css','apps/life/js','packages/design-kit/js','packages/design-kit/icons'])await fs.mkdir(path.join(root,folder),{recursive:true});
 for(const file of ['index.html','capture-inbox.html','manifest.webmanifest','service-worker.js','robots.txt'])await write('apps/life/'+file);
 await write('scripts/pages-spa-fallback.html');await write('node_modules/js-yaml/dist/js-yaml.mjs');
 await write('apps/life/assets/grove/manifest.json',JSON.stringify({assets:[]}));
 await write('apps/life/assets/grove/project-only/manifest.json',JSON.stringify({assets:[]}));
 await write('apps/life/assets/grove/project-only/current.glb','verified current fixture');
 await write('apps/life/assets/grove/.grove-install-recovery/previous/licensed.glb','recoverable previous fixture');
 await write('apps/life/assets/grove/.grove-install-recovery/ready/replacement.glb','staged replacement fixture');
 return root;
}
test('web preparation excludes installer recovery directories while preserving source recovery and installed assets',async()=>{
 const root=await fixture();try{
  execFileSync(process.execPath,[path.join(root,'scripts/prepare-web.mjs')],{cwd:root});
  assert.equal(await fs.readFile(path.join(root,'dist/assets/grove/project-only/current.glb'),'utf8'),'verified current fixture');
  assert.equal(await fs.readFile(path.join(root,'apps/life/assets/grove/.grove-install-recovery/previous/licensed.glb'),'utf8'),'recoverable previous fixture');
  assert.equal(await fs.readFile(path.join(root,'apps/life/assets/grove/.grove-install-recovery/ready/replacement.glb'),'utf8'),'staged replacement fixture');
  assert.equal((await fs.readdir(path.join(root,'dist/assets/grove'))).some(name=>name.startsWith('.grove-install-')),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Git excludes private installer staging and recovery models at their actual sibling path',async()=>{
 const root=await fixture();try{
  await fs.copyFile(path.join(repository,'.gitignore'),path.join(root,'.gitignore'));execFileSync('git',['init','-q'],{cwd:root});
  for(const file of ['previous/licensed.glb','ready/replacement.glb'])assert.doesNotThrow(()=>execFileSync('git',['check-ignore','-q','apps/life/assets/grove/.grove-install-recovery/'+file],{cwd:root}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

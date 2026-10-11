import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {groveAnimalCatalogue} from '../../scripts/lib/grove-animal-catalogue.mjs';
test('public builds have usable public animals without the project-only pack',()=>{
  const c=groveAnimalCatalogue(new URL('../../apps/life/assets/grove/',import.meta.url).pathname,false);
  assert.deepEqual(c.assets.map(a=>a.id).sort(),['animal-deer-doe','animal-deer-stag','animal-fox']);
  assert.ok(c.assets.every(a=>a.file.startsWith('models/animals/')));
  assert.ok(c.assets.every(a=>a.animations.includes('idle') && a.animations.includes('walk')));
});
test('installed project animals override duplicate IDs and keep their motion roles/credits',()=>{
  const root=mkdtempSync(join(tmpdir(),'grove-catalogue-'));
  try {
    mkdirSync(join(root,'project-only'));
    writeFileSync(join(root,'manifest.json'),JSON.stringify({assets:[{id:'hare',kind:'animal',file:'models/animals/hare.glb'}]}));
    writeFileSync(join(root,'project-only/manifest.json'),JSON.stringify({assets:[{id:'hare',kind:'animal',file:'models/animals/hare.glb',animation_roles:{locomotion:'hop'},license:{attribution:'Creator credit'}}]}));
    const c=groveAnimalCatalogue(root);
    assert.equal(c.assets.length,1);assert.equal(c.assets[0].file,'project-only/models/animals/hare.glb');
    assert.equal(c.assets[0].roles.locomotion,'hop');assert.equal(c.assets[0].credit,'Creator credit');
  } finally {rmSync(root,{recursive:true,force:true});}
});

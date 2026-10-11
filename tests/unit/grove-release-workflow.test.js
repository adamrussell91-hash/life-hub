import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {load} from 'js-yaml';
const workflow=load(await fs.readFile(new URL('../../.github/workflows/pages.yml',import.meta.url),'utf8'));
const steps=workflow.jobs.build.steps;
const transfer=steps.find(step=>step.run==='node scripts/transfer-grove-release.mjs');
const upload=steps.find(step=>step.uses==='actions/upload-artifact@v4'&&step.with?.name?.startsWith('grove-deployment-ciphertext'));
test('ciphertext recovery artifacts remain distinct when a later build failure requires a retry',()=>{
 assert.ok(upload,'release ciphertext upload is configured');
 const attemptName=attempt=>upload.with.name.replace(/\$\{\{\s*github\.run_attempt\s*\}\}/g,String(attempt));
 const retainedArtifacts=new Set([attemptName(1)]);
 assert.ok(!retainedArtifacts.has(attemptName(2)),'retry must not collide with the artifact retained after the first attempt');
 assert.equal(attemptName(2),'grove-deployment-ciphertext-2');
});
test('release transfer is conditional and recovery upload selects only durable ciphertext after success',()=>{
 assert.ok(transfer);assert.ok(upload);
 assert.equal(transfer.if,"${{ hashFiles('apps/life/assets/grove/deployment/release-input.enc') != '' }}");
 assert.equal(upload.if,"${{ success() && hashFiles('apps/life/assets/grove/deployment/release-input.enc') != '' }}");
 assert.equal(upload.with.path,'apps/life/assets/grove/deployment/animals.enc');
 assert.equal(upload.with['if-no-files-found'],'error');
 const install=steps.find(step=>step.run==='node scripts/install-grove-deployment-assets.mjs');
 assert.ok(steps.indexOf(transfer)<steps.indexOf(upload));
 assert.ok(steps.indexOf(upload)<steps.indexOf(install));
});

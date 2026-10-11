import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {verifyHashInventory,verifyDeclaredModelHash,verifyRequiredCatalogue,verifyMotionReports} from './animal-bundle-integrity.mjs';
import {replaceAnimalBundle} from './atomic-animal-install.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(process.argv[2]),repo=path.resolve(process.argv[3]||path.join(here,'../..'));
const target=path.join(repo,'apps/life/assets/grove/project-only');
execFileSync('git',['check-ignore','-q','apps/life/assets/grove/project-only/manifest.json'],{cwd:repo});
await verifyHashInventory(source);
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'))),reports=JSON.parse(await fs.readFile(path.join(source,'motion-report.json')));
verifyRequiredCatalogue(manifest);verifyMotionReports(reports,manifest.assets);
for(const a of manifest.assets){const file=path.resolve(source,a.file);if(!file.startsWith(source+path.sep))throw Error('Invalid asset path');const r=reports.find(r=>r.file===a.file);verifyDeclaredModelHash(a,r,await fs.readFile(file));}
await replaceAnimalBundle(source,target);console.log('Installed '+manifest.assets.length+' verified animals: '+target);

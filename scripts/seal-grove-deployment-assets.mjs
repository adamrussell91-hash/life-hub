/** Seal a verified twenty-model private delivery with the existing deployment secret. Never prints the key. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sealBundle} from './lib/grove-private-bundle.mjs';
import {verifyHashInventory,verifyDeclaredModelHash,verifyRequiredCatalogue} from '../tools/grove-previews/animal-bundle-integrity.mjs';
const source=path.resolve(process.argv[2]||'apps/life/assets/grove/project-only'),output=path.resolve(process.argv[3]||'apps/life/assets/grove/deployment/animals.enc');
if(!/^[a-f0-9]{64}$/i.test(process.env.GROVE_ASSET_KEY??''))throw Error('Set the matching existing GROVE_ASSET_KEY (32-byte hex) before sealing deployment assets.');
function modelPath(relative){const file=path.resolve(source,relative);if(!file.startsWith(source+path.sep))throw Error('Invalid model path');return file;}
await verifyHashInventory(source);const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'))),reports=JSON.parse(await fs.readFile(path.join(source,'motion-report.json')));verifyRequiredCatalogue(manifest);for(const a of manifest.assets)verifyDeclaredModelHash(a,reports.find(r=>r.file===a.file),await fs.readFile(modelPath(a.file)));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'grove-seal-'));try{await fs.cp(source,path.join(temp,'bundle'),{recursive:true});const archive=execFileSync('tar',['-czf','-','-C',temp,'bundle'],{maxBuffer:64*1024*1024});await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,sealBundle(archive,process.env.GROVE_ASSET_KEY),{mode:0o600});console.log('Sealed verified twenty-model Grove deployment bundle: '+output);}finally{await fs.rm(temp,{recursive:true,force:true});}

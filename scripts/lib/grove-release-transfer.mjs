/** Transfer a strictly verified release while retaining the existing deployment key. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {openBundle,sealBundle} from './grove-private-bundle.mjs';
import {installAuthenticatedGroveDeployment} from './grove-authenticated-deployment.mjs';
export async function transferGroveRelease(repository,{deploymentKey,inputKey}={}) {
 const repo=path.resolve(repository),deployment=path.join(repo,'apps/life/assets/grove/deployment');
 let incoming;
 try{incoming=await fs.readFile(path.join(deployment,'release-input.enc'));}catch(error){if(error.code==='ENOENT')return {skipped:true};throw error;}
 if(!/^[a-f0-9]{64}$/i.test(deploymentKey??'')||!/^[a-f0-9]{64}$/i.test(inputKey??''))throw Error('Release transfer requires both 32-byte hex keys');
 const output=path.join(deployment,'animals.enc');
 // Prove key continuity before parsing incoming data or mutating the installation.
 openBundle(await fs.readFile(output),deploymentKey);
 const clear=openBundle(incoming,inputKey);
 // The shared installer checks paths, links, inventory, catalogue and motion before replacement.
 await installAuthenticatedGroveDeployment(incoming,inputKey,repo,{requireModern:true});
 const encrypted=sealBundle(clear,deploymentKey);
 const staging=await fs.mkdtemp(path.join(deployment,'.grove-release-'));
 try{const staged=path.join(staging,'animals.enc');await fs.writeFile(staged,encrypted,{mode:0o600});await fs.rename(staged,output);}finally{await fs.rm(staging,{recursive:true,force:true});}
 return {assets:20,skipped:false};
}

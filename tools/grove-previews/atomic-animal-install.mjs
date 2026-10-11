import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyHashInventory} from './animal-bundle-integrity.mjs';

/** Stage on the destination filesystem, then replace the entire owned directory. */
export async function replaceAnimalBundle(source,target){
 const parent=path.dirname(target);await fs.mkdir(parent,{recursive:true});
 const staging=await fs.mkdtemp(path.join(parent,'.grove-install-'));
 const ready=path.join(staging,'ready'),previous=path.join(staging,'previous');
 let preserveBackup=false;
 try{
  await fs.cp(source,ready,{recursive:true});await verifyHashInventory(ready);
  let hadPrevious=false;
  try{await fs.rename(target,previous);hadPrevious=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.rename(ready,target);}catch(error){
   if(hadPrevious){try{await fs.rename(previous,target);}catch(restoreError){preserveBackup=true;throw new AggregateError([error,restoreError],`Installation failed; previous bundle retained at ${previous}`);}}
   throw error;
  }
 }finally{if(!preserveBackup)await fs.rm(staging,{recursive:true,force:true});}
}

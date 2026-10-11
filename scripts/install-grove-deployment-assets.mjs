import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {installAuthenticatedGroveDeployment} from './lib/grove-authenticated-deployment.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const result=await installAuthenticatedGroveDeployment(readFileSync(join(root,'apps/life/assets/grove/deployment/animals.enc')),process.env.GROVE_ASSET_KEY,root);
console.log(`Installed ${result.assets} authenticated Grove deployment assets${result.migrated_legacy?' (verified legacy migration)':''}.`);

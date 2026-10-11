import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {openBundle} from './lib/grove-private-bundle.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const temp=mkdtempSync(join(tmpdir(),'grove-assets-'));
try {
  const archive=join(temp,'assets.tgz');
  writeFileSync(archive,openBundle(readFileSync(join(root,'apps/life/assets/grove/deployment/animals.enc')),process.env.GROVE_ASSET_KEY),{mode:0o600});
  execFileSync('tar',['-xzf',archive,'-C',temp]);
  execFileSync(process.execPath,[join(root,'tools/grove-previews/install-project-animals.mjs'),join(temp,'bundle'),root],{stdio:'inherit'});
} finally {rmSync(temp,{recursive:true,force:true});}

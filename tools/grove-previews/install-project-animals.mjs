import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(process.argv[2]),repo=path.resolve(process.argv[3]||path.join(here,'../..'));
const target=path.join(repo,'apps/life/assets/grove/project-only');
execFileSync('git',['check-ignore','-q','apps/life/assets/grove/project-only/manifest.json'],{cwd:repo});
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'))),reports=JSON.parse(await fs.readFile(path.join(source,'motion-report.json')));
const required={'animal-rabbit-hare':['idle','hop','run','eat'],'animal-squirrel':['idle','walk','run','eat'],'animal-bird-robin':['idle','hop','fly','eat'],'animal-duck-mallard':['idle','walk','swim','eat'],'animal-owl':['idle','hop','fly','eat']};
for(const [id,clips]of Object.entries(required)){const a=manifest.assets.find(a=>a.id===id);if(!a||clips.some(c=>!a.animations.includes(c)))throw Error('Not ready: '+id);}
for(const a of manifest.assets){const file=path.resolve(source,a.file);if(!file.startsWith(source+path.sep))throw Error('Invalid asset path');const r=reports.find(r=>r.file===a.file);const hash=createHash('sha256').update(await fs.readFile(file)).digest('hex');if(!r||r.sha256!==hash||r.animations.some(c=>!c.moves))throw Error('Missing or stale motion report: '+a.id);}
await fs.mkdir(target,{recursive:true});await fs.cp(source,target,{recursive:true});console.log('Installed '+manifest.assets.length+' verified animals: '+target);

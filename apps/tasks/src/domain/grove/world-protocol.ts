import {buildWorldMeshes,meshBuffers,type WorldMeshes} from './world-meshes';
import {validateRegions} from './regions';
import {hydrologyBuffers,validateHydrology} from './hydrology-validation';
import {generateAnnualWorld,freezeAnnualWorld,type AnnualWorld} from './world';
import {worldIdentity,WORLD_RECIPE_V1,type WorldKey} from './world-key';

export type WorldRequest={type:'generate';id:number;key:WorldKey};
export type WorldResponse=
  | {type:'success';id:number;world:AnnualWorld;meshes:WorldMeshes;generationMs:number}
  | {type:'failure';id:number;error:string};

export function buildWorldResponse(request:WorldRequest):{message:WorldResponse;transfer:ArrayBuffer[]} {
  try {
    if(request.type!=='generate'||!Number.isSafeInteger(request.id)||request.id<1)throw new Error('Invalid world request');
    const start=performance.now(),world=generateAnnualWorld(request.key),meshes=buildWorldMeshes(world);
    return {message:{type:'success',id:request.id,world,meshes,generationMs:performance.now()-start},transfer:[...new Set([...hydrologyBuffers(world),world.regions!.owner.buffer as ArrayBuffer,...meshBuffers(meshes)])]};
  } catch(error) {
    return {message:{type:'failure',id:request?.id??0,error:error instanceof Error?error.message:'Annual generation failed'},transfer:[]};
  }
}

/** Treat structured-cloned output as untrusted; do not mount partial or detached fields. */
export function acceptWorldResponse(value:unknown,key:WorldKey):AnnualWorld {
  const w=value as AnnualWorld;
  const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
  const position=(p:{cx:number;cz:number})=>finite(p?.cx)&&finite(p?.cz)&&Math.abs(p.cx)<448&&Math.abs(p.cz)<448;
  const positive=(n:unknown)=>finite(n)&&n>0;
  const invalid=()=>new Error('Invalid annual world output');
  if(!w||!w.key||w.key.year!==key.year||w.key.generatorVersion!==key.generatorVersion||w.identity!==worldIdentity(key))throw invalid();
  const g=w.grid,r=WORLD_RECIPE_V1;
  if(!g||g.size!==r.size||g.extent!==r.extent||g.x0!==r.x0||g.z0!==r.z0||g.step!==r.extent/(r.size-1))throw invalid();
  if(!(w.bed instanceof Float32Array)||w.bed.length!==g.size*g.size||w.bed.byteLength!==g.size*g.size*4)throw invalid();
  if(!Array.isArray(w.basins)||w.basins.length!==2||!Array.isArray(w.meadows)||w.meadows.length!==3)throw invalid();
  for(const b of w.basins) {
    if(!position(b)||typeof b.id!=='string'||!positive(b.rx)||!positive(b.rz)||!positive(b.depth)||!finite(b.proposedSpillHeight)||!finite(b.notch?.x)||!finite(b.notch?.z))throw invalid();
    if(b.island!==null&&(!position(b.island)||!positive(b.island.rx)||!positive(b.island.rz)||!finite(b.island.height)))throw invalid();
  }
  for(const m of w.meadows)if(!position(m)||typeof m.id!=='string'||!positive(m.radius)||!finite(m.height))throw invalid();
  let min=Infinity,max=-Infinity;
  for(const h of w.bed){if(!finite(h))throw invalid();min=Math.min(min,h);max=Math.max(max,h);}
  if(!w.summary||w.summary.minHeight!==min||w.summary.maxHeight!==max||w.summary.bedBytes!==w.bed.byteLength)throw invalid();
  validateHydrology(w);
  validateRegions(w);
  return freezeAnnualWorld(w);
}

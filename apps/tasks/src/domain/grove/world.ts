import {generateRegions,type AnnualRegions} from './regions';
/** Geography is derived only from WorldKey and versioned recipes. */
import {generateHeightfield,type WorldGrid,type BasinShape,type MeadowReserve} from './heightfield';
import {generateHydrology,hasDryReserves,type Hydrology} from './hydrology';
import {makeWorldKey,worldIdentity,type WorldKey} from './world-key';
export type AnnualWorld=Readonly<{
 regions?:AnnualRegions;key:WorldKey;identity:string;grid:WorldGrid;bed:Float32Array;
 basins:readonly BasinShape[];meadows:readonly MeadowReserve[];hydrology:Hydrology;
 generation:Readonly<{attempt:number;fallback:boolean;hydrologyVersion:number}>;
 summary:Readonly<{minHeight:number;maxHeight:number;bedBytes:number}>;
}>;
function freezeDeepMetadata(value:unknown):void{
 if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return;
 for(const child of Object.values(value))freezeDeepMetadata(child);Object.freeze(value);
}
/** Recipient owns every typed buffer; metadata is immutable. */
export function freezeAnnualWorld(world:AnnualWorld):AnnualWorld{freezeDeepMetadata(world);return world;}
export function validGeography(h:Hydrology):boolean{return h.quality.substantialLakes>=1&&h.quality.channelLength>=50&&h.quality.dryFraction>.7;}
/** Terrain and solved water only; weekly regions derive from this and nothing else. */
export function generateAnnualGeography(requested:WorldKey):AnnualWorld{
 const key=makeWorldKey(requested.year,requested.generatorVersion);
 let field:ReturnType<typeof generateHeightfield>|undefined,hydrology:Hydrology|undefined,attempt=0,fallback=false;
 for(;attempt<3;attempt++){
  try{const candidate=generateHeightfield(key,attempt),water=generateHydrology(candidate);if(validGeography(water)&&hasDryReserves(candidate,water)){field=candidate;hydrology=water;break;}}catch{/* Try the next deterministic namespace, then verified fallback. */}
 }
 if(!field||!hydrology){fallback=true;field=generateHeightfield(makeWorldKey(2026,1));hydrology=generateHydrology(field);if(!validGeography(hydrology)||!hasDryReserves(field,hydrology))throw Error('Annual geography fallback failed validation');}
 let minHeight=Infinity,maxHeight=-Infinity;for(const height of field.bed){minHeight=Math.min(minHeight,height);maxHeight=Math.max(maxHeight,height);}
 return freezeAnnualWorld({key,identity:worldIdentity(key),...field,hydrology,generation:{attempt,fallback,hydrologyVersion:1},summary:{minHeight,maxHeight,bedBytes:field.bed.byteLength}});
}
export function generateAnnualWorld(requested:WorldKey):AnnualWorld{
 const world=generateAnnualGeography(requested);
 return freezeAnnualWorld({...world,regions:generateRegions(world)});
}
export function sampleBedGrid(grid:WorldGrid,bed:Float32Array,x:number,z:number):number{
 const g=grid;if(!Number.isFinite(x)||!Number.isFinite(z)||x<g.x0||z<g.z0||x>g.x0+g.extent||z>g.z0+g.extent)throw Error('Position outside annual world');
 const fx=(x-g.x0)/g.step,fz=(z-g.z0)/g.step,ax=Math.floor(fx),az=Math.floor(fz),bx=Math.min(ax+1,g.size-1),bz=Math.min(az+1,g.size-1),tx=fx-ax,tz=fz-az;
 const a=bed[az*g.size+ax]!*(1-tx)+bed[az*g.size+bx]!*tx,b=bed[bz*g.size+ax]!*(1-tx)+bed[bz*g.size+bx]!*tx;return a*(1-tz)+b*tz;
}
export function sampleWorldBed(world:AnnualWorld,x:number,z:number):number{return sampleBedGrid(world.grid,world.bed,x,z);}

/** Geography accepts only a WorldKey. Activity, terms, views and clocks cannot enter generation. */
import {generateHeightfield,type WorldGrid,type BasinShape,type MeadowReserve} from './heightfield';
import {makeWorldKey,worldIdentity,type WorldKey} from './world-key';

export type AnnualWorld=Readonly<{
  key:WorldKey;identity:string;grid:WorldGrid;bed:Float32Array;
  basins:readonly BasinShape[];meadows:readonly MeadowReserve[];
  summary:Readonly<{minHeight:number;maxHeight:number;bedBytes:number}>;
}>;
/** Typed-array storage is exclusively owned by its recipient and treated as read-only. */
export function freezeAnnualWorld(world:AnnualWorld):AnnualWorld {
  Object.freeze(world.key);Object.freeze(world.grid);Object.freeze(world.summary);
  for(const b of world.basins){Object.freeze(b.notch);if(b.island)Object.freeze(b.island);Object.freeze(b);}
  for(const m of world.meadows)Object.freeze(m);
  Object.freeze(world.basins);Object.freeze(world.meadows);return Object.freeze(world);
}
export function generateAnnualWorld(requested:WorldKey):AnnualWorld {
  const key=makeWorldKey(requested.year,requested.generatorVersion),field=generateHeightfield(key);
  let minHeight=Infinity,maxHeight=-Infinity;
  for(const height of field.bed){minHeight=Math.min(minHeight,height);maxHeight=Math.max(maxHeight,height);}
  return freezeAnnualWorld({key,identity:worldIdentity(key),...field,summary:{minHeight,maxHeight,bedBytes:field.bed.byteLength}});
}
export function sampleWorldBed(world:AnnualWorld,x:number,z:number):number {
  const g=world.grid;
  if(!Number.isFinite(x)||!Number.isFinite(z)||x<g.x0||z<g.z0||x>g.x0+g.extent||z>g.z0+g.extent)throw new Error('Position outside annual world');
  const fx=(x-g.x0)/g.step,fz=(z-g.z0)/g.step,ax=Math.floor(fx),az=Math.floor(fz);
  const bx=Math.min(ax+1,g.size-1),bz=Math.min(az+1,g.size-1),tx=fx-ax,tz=fz-az;
  const a=world.bed[az*g.size+ax]!*(1-tx)+world.bed[az*g.size+bx]!*tx;
  const b=world.bed[bz*g.size+ax]!*(1-tx)+world.bed[bz*g.size+bx]!*tx;
  return a*(1-tz)+b*tz;
}

/** Session-only derived placement cache. No storage or source record mutation. */
import type {AnnualWorld} from './world';
import type {WeeklyRegion,PlantingSite} from './regions';
import {regionForDate} from './regions';
import {growthAt,stageFor,scaleFor,type GroveCompletion,type GroveTree} from './plan';
import {TREE_VARIANTS,type GroveSpecies} from './assets';
import {hashString,seededRandom} from './random';
export type AnnualTree=GroveTree&{height:number;regionId:string;slot:number;worldYear:number};
type Assignment={regionId:string;slot:number};
const preferences=new WeakMap<WeeklyRegion,Map<GroveSpecies,number[]>>();
/** Resolve record identity before year/date filtering, including boundary weeks. */
export function uniqueCompletions(input:readonly GroveCompletion[]):GroveCompletion[]{
 const records=new Map<string,GroveCompletion>();
 for(const c of input){const old=records.get(c.id);if(!old||c.completedMs>old.completedMs||c.completedMs===old.completedMs&&JSON.stringify(c)>JSON.stringify(old))records.set(c.id,c);}
 return [...records.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
function siteOrder(region:WeeklyRegion,species:GroveSpecies):number[]{
 let cache=preferences.get(region);if(!cache){cache=new Map();preferences.set(region,cache);}const saved=cache.get(species);if(saved)return saved;
 const score=(s:PlantingSite)=>species==='life'?-s.height:species==='health'?s.shoreDistance:species==='teaching'||species==='wedding'?s.slope:Math.hypot(s.x-region.anchor.x,s.z-region.anchor.z);
 const sort=(sites:PlantingSite[])=>sites.slice().sort((a,b)=>score(a)-score(b)||a.index-b.index).map(s=>s.index);
 const order=[...sort(region.sites.slice(0,region.primaryCount)),...sort(region.sites.slice(region.primaryCount))];cache.set(species,order);return order;
}
function candidate(order:readonly number[],start:number,used:Set<number>):number|undefined{
 if(!order.length)return;for(let k=0;k<order.length;k++){const slot=order[(start+k)%order.length]!;if(!used.has(slot))return slot;}return;
}
export class AnnualPlantingSession{
 private years=new Map<string,Map<string,Assignment>>();
 allocate(world:AnnualWorld,input:readonly GroveCompletion[],now:number):AnnualTree[]{
  if(!Number.isFinite(now)||!world.regions)throw Error('Invalid annual planting input');
  const values=uniqueCompletions(input).filter(c=>c.completedMs<=now&&Number(c.dayKey.slice(0,4))===world.key.year),regions=new Map(values.map(c=>[c.id,regionForDate(world.regions!,c.dayKey)]));
  // Prepare transactional state: capacity failures never partially rewrite the cache.
  const previous=this.years.get(world.identity)??new Map<string,Assignment>(),next=new Map<string,Assignment>(),used=new Map<string,Set<number>>();
  for(const c of values){const region=regions.get(c.id);if(!region)throw Error('Task date has no annual region');const assigned=previous.get(c.id);
   if(assigned?.regionId===region.id&&region.sites[assigned.slot]){const occupied=used.get(region.id)??new Set<number>();if(occupied.has(assigned.slot))throw Error('Invalid annual planting cache');occupied.add(assigned.slot);used.set(region.id,occupied);next.set(c.id,assigned);}}
  const counts=new Map<string,number>();for(const region of regions.values())if(region)counts.set(region.id,(counts.get(region.id)??0)+1);
  for(const region of regions.values())if(region&&counts.get(region.id)!>region.sites.length)throw Error('Planting capacity exceeded for '+region.id+': '+counts.get(region.id)+' trees / '+region.sites.length+' sites');
  const result:AnnualTree[]=[];
  for(const c of values){const region=regions.get(c.id)!,occupied=used.get(region.id)??new Set<number>();let assigned=next.get(c.id);
   if(!assigned){const order=siteOrder(region,c.species),primary=order.slice(0,region.primaryCount),overflow=order.slice(region.primaryCount),seed=hashString('annual-tree:'+world.identity+':'+c.id),preferred=Math.max(1,Math.ceil(primary.length*.6));
    const slot=candidate(primary.slice(0,preferred),seed%preferred,occupied)??candidate(primary,seed%Math.max(1,primary.length),occupied)??candidate(overflow,seed%Math.max(1,overflow.length),occupied);
    if(slot===undefined)throw Error('Planting capacity exceeded for '+region.id);assigned={regionId:region.id,slot};occupied.add(slot);used.set(region.id,occupied);next.set(c.id,assigned);}
   const site=region.sites[assigned.slot]!,growth=growthAt(c.completedMs,now),random=seededRandom('annual-tree:'+world.identity+':'+c.id);
   result.push({...c,variant:1+hashString('variant:'+c.id)%TREE_VARIANTS[c.species],growth,stage:stageFor(growth),scale:scaleFor(growth),x:site.x,z:site.z,height:site.height,rotation:random()*Math.PI*2,regionId:region.id,slot:site.index,worldYear:world.key.year});
  }
  this.years.set(world.identity,next);return result;
 }
 clear(){this.years.clear();}
}

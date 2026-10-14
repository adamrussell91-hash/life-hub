/** Milestones come only from live dated history. Motion is cosmetic and carries no saved state. */
import type {GroveCompletion} from './plan';
import type {GroveTerm} from './calendar';
import {addDays,mondayOf,isDateKey} from './dates';
import {seededRandom} from './random';
export type GroveBookInput={label?:string;completed_on?:string|null};
export type WildlifeSpecies='hare'|'deer'|'fox'|'squirrel'|'robin'|'mallard'|'owl';
export type WildlifeMilestone={species:WildlifeSpecies;earnedOn:string;reason:string;baby:boolean};
export const WILDLIFE_MODEL:Record<WildlifeSpecies,string>={hare:'animal-rabbit-hare',deer:'animal-deer-doe',fox:'animal-fox',squirrel:'animal-squirrel',robin:'animal-bird-robin',mallard:'animal-duck-mallard',owl:'animal-owl'};
export const WILDLIFE_REASON:Record<WildlifeSpecies,string>={hare:'A day with five finished tasks',deer:'A full week with something finished every day',fox:'A completed school term',squirrel:'Twenty-five finished Teaching tasks',robin:'Ten finished Life or Health tasks',mallard:'A week with twenty finished tasks',owl:'A finished book'};
/** Every qualifying date per species, oldest first: each counts towards that species' next arrival. */
function wildlifeEvents(completions:readonly GroveCompletion[],terms:readonly GroveTerm[],through:string,books:readonly GroveBookInput[]):Record<WildlifeSpecies,string[]> {
  const live=[...completions].filter(c=>c.dayKey<=through).sort((a,b)=>a.completedMs-b.completedMs || a.id.localeCompare(b.id));
  const days=new Map<string,number>(),weeks=new Map<string,Set<string>>(),weekCounts=new Map<string,number>();
  for(const c of live) {days.set(c.dayKey,(days.get(c.dayKey)??0)+1);const week=mondayOf(c.dayKey);const set=weeks.get(week)??new Set();set.add(c.dayKey);weeks.set(week,set);weekCounts.set(week,(weekCounts.get(week)??0)+1);}
  const busy=[...weekCounts].filter(([,n])=>n>=20).map(([week])=>live.filter(c=>mondayOf(c.dayKey)===week)[19]!.dayKey);
  return {
    hare:[...days].filter(([,n])=>n>=5).map(([key])=>key).sort(),
    deer:[...weeks].filter(([,set])=>set.size===7).map(([key])=>addDays(key,6)).sort(),
    fox:[...terms].filter(t=>t.ends_on<=through && live.some(c=>c.dayKey>=t.starts_on && c.dayKey<=t.ends_on)).map(t=>t.ends_on).sort(),
    squirrel:live.filter(c=>c.domain==='teaching').map(c=>c.dayKey),
    robin:live.filter(c=>c.domain==='life' || c.domain==='health').map(c=>c.dayKey),
    mallard:busy.sort(),
    owl:books.filter(b=>isDateKey(b.completed_on) && b.completed_on!<=through).map(b=>b.completed_on!).sort()
  };
}
const ORDER:WildlifeSpecies[]=['hare','deer','fox','squirrel','robin','mallard','owl'];
/** First arrival per species, with a young one for a hare or doe earned more than once. */
export function wildlifeMilestones(completions:readonly GroveCompletion[],terms:readonly GroveTerm[],through:string,books:readonly GroveBookInput[]=[]):WildlifeMilestone[] {
  const events=wildlifeEvents(completions,terms,through,books);
  return ORDER.flatMap(species=>{
    const dates=events[species],first=dates[WILDLIFE_REPEAT[species].first-1];
    return first ? [{species,earnedOn:first,reason:WILDLIFE_REASON[species],baby:(species==='hare' || species==='deer') && dates.length>1}] : [];
  });
}
/**
 * How often an earned animal comes again. The `first` qualifying event brings the first one, then
 * every `every` more brings another, so repeats grow with the work without flooding the forest.
 */
export const WILDLIFE_REPEAT:Record<WildlifeSpecies,{first:number;every:number}>={hare:{first:1,every:10},deer:{first:1,every:8},fox:{first:1,every:1},squirrel:{first:25,every:150},robin:{first:10,every:30},mallard:{first:1,every:3},owl:{first:1,every:3}};
/** Models a species takes turns through as it comes again, so every bought model gets used. */
export const WILDLIFE_MODELS:Record<WildlifeSpecies,string[]>={hare:['animal-rabbit-hare','animal-forest-rabbit'],deer:['animal-deer-doe','animal-forest-deer','animal-forest-stag'],fox:['animal-fox','animal-forest-fox'],squirrel:['animal-squirrel'],robin:['animal-bird-robin'],mallard:['animal-duck-mallard'],owl:['animal-owl']};
export type WildlifeArrival=WildlifeMilestone&{model:string;ordinal:number};
/** Every animal earned so far: one per `WILDLIFE_REPEAT` step, each on the date its step was reached. */
export function wildlifeArrivals(completions:readonly GroveCompletion[],terms:readonly GroveTerm[],through:string,books:readonly GroveBookInput[]=[]):WildlifeArrival[] {
  const events=wildlifeEvents(completions,terms,through,books);
  return ORDER.flatMap(species=>{
    const dates=events[species],{first,every}=WILDLIFE_REPEAT[species],models=WILDLIFE_MODELS[species],out:WildlifeArrival[]=[];
    for(let i=first-1,ordinal=0;i<dates.length;i+=every,ordinal++) out.push({species,earnedOn:dates[i]!,reason:WILDLIFE_REASON[species],baby:ordinal===0 && (species==='hare' || species==='deer') && dates.length>1,model:models[ordinal%models.length]!,ordinal});
    return out;
  });
}
export type PathPoint={x:number;z:number};
type GroundSampler=(x:number,z:number)=>{wet:boolean;height:number};
/** The path is constructed segment-by-segment, never merely checking destinations. */
export function dryPath(seed:string,cx:number,cz:number,sample:GroundSampler,obstacles:readonly PathPoint[]=[]):PathPoint[] {
  const rand=seededRandom(`wildlife-path:${seed}`);
  const clear=(x:number,z:number)=>!sample(x,z).wet && obstacles.every(p=>Math.hypot(x-p.x,z-p.z)>1);
  const first={x:cx,z:cz};
  if(!clear(cx,cz)) {
    let found=false;
    for(let i=0;i<100;i++) {const a=rand()*Math.PI*2,r=1+rand()*6,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if(clear(x,z)){first.x=x;first.z=z;found=true;break;}}
    if(!found) return [];
  }
  const path:PathPoint[]=[first];
  for(let i=0;i<40;i++) {
    const prev=path.at(-1)!,angle=rand()*Math.PI*2,len=1+rand()*2;
    const next={x:prev.x+Math.sin(angle)*len,z:prev.z+Math.cos(angle)*len};
    if(Math.hypot(next.x-cx,next.z-cz)>7) continue;
    let safe=true;
    for(let j=0;j<=12;j++) if(!clear(prev.x+(next.x-prev.x)*j/12,prev.z+(next.z-prev.z)*j/12)) {safe=false;break;}
    if(safe) path.push(next);
    if(path.length>=9) break;
  }
  // Reverse the same legal segments to close the loop without cutting across water.
  return path.length>1 ? [...path,...path.slice(1,-1).reverse(),path[0]!] : path;
}
export function pathPose(path:readonly PathPoint[],seconds:number,speed:number) {
  if(!path.length) return {x:0,z:0,yaw:0};
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i]!.x,p.z-path[i]!.z));
  const total=lengths.reduce((a,b)=>a+b,0);if(total===0) return {...path[0]!,yaw:0};
  let distance=((seconds*speed)%total+total)%total;
  for(let i=0;i<lengths.length;i++) {const length=lengths[i]!;if(distance<=length && length>0){const a=path[i]!,b=path[i+1]!,f=distance/length;return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw:Math.atan2(b.x-a.x,b.z-a.z)};}distance-=length;}
  return {...path[0]!,yaw:0};
}

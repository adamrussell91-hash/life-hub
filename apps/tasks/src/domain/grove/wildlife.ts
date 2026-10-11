/** Milestones come only from live dated history. Motion is cosmetic and carries no saved state. */
import type {GroveCompletion} from './plan';
import type {GroveTerm} from './calendar';
import {addDays,mondayOf,isDateKey} from './dates';
import {seededRandom} from './random';
export type GroveBookInput={label?:string;completed_on?:string|null};
export type WildlifeSpecies='hare'|'deer'|'fox'|'squirrel'|'robin'|'mallard'|'owl';
export type WildlifeMilestone={species:WildlifeSpecies;earnedOn:string;reason:string;baby:boolean};
export const WILDLIFE_MODEL:Record<WildlifeSpecies,string>={hare:'animal-rabbit-hare',deer:'animal-deer-doe',fox:'animal-fox',squirrel:'animal-squirrel',robin:'animal-bird-robin',mallard:'animal-duck-mallard',owl:'animal-owl'};
export function wildlifeMilestones(completions:readonly GroveCompletion[],terms:readonly GroveTerm[],through:string,books:readonly GroveBookInput[]=[]):WildlifeMilestone[] {
  const live=[...completions].filter(c=>c.dayKey<=through).sort((a,b)=>a.completedMs-b.completedMs || a.id.localeCompare(b.id));
  const days=new Map<string,number>(),weeks=new Map<string,Set<string>>(),weekCounts=new Map<string,number>();
  for(const c of live) {days.set(c.dayKey,(days.get(c.dayKey)??0)+1);const week=mondayOf(c.dayKey);const set=weeks.get(week)??new Set();set.add(c.dayKey);weeks.set(week,set);weekCounts.set(week,(weekCounts.get(week)??0)+1);}
  const earned:WildlifeMilestone[]=[];
  const add=(species:WildlifeSpecies,dates:string[],reason:string)=>{if(dates.length) earned.push({species,earnedOn:dates[0]!,reason,baby:(species==='hare' || species==='deer') && dates.length>1});};
  add('hare',[...days].filter(([,n])=>n>=5).map(([key])=>key),'A day with five finished tasks');
  add('deer',[...weeks].filter(([,set])=>set.size===7).map(([key])=>addDays(key,6)),'A full week with something finished every day');
  add('fox',[...terms].filter(t=>t.ends_on<=through && live.some(c=>c.dayKey>=t.starts_on && c.dayKey<=t.ends_on)).sort((a,b)=>a.ends_on.localeCompare(b.ends_on)).map(t=>t.ends_on),'A completed school term');
  const teaching=live.filter(c=>c.domain==='teaching'),life=live.filter(c=>c.domain==='life' || c.domain==='health');
  add('squirrel',teaching[24] ? [teaching[24].dayKey] : [],'Twenty-five finished Teaching tasks');
  add('robin',life[9] ? [life[9].dayKey] : [],'Ten finished Life or Health tasks');
  const busy=[...weekCounts].filter(([,n])=>n>=20).map(([week])=>{
    return live.filter(c=>mondayOf(c.dayKey)===week)[19]!.dayKey;
  });
  add('mallard',busy,'A week with twenty finished tasks');
  const finished=books.filter(b=>isDateKey(b.completed_on) && b.completed_on!<=through).map(b=>b.completed_on!).sort();
  add('owl',finished,'A finished book');
  return earned;
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

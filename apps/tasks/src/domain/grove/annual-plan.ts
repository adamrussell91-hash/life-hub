/** Annual history adapter; selection never controls geographic or tree allocation. */
import type {AnnualWorld} from './world';
import {groveCompletions,type GroveTaskInput,type GroveView} from './plan';
import {AnnualPlantingSession,uniqueCompletions} from './planting';
import {groveCalendar,groveDateKeys,grovePeriod,type GroveTerm} from './calendar';
import {regionForDate} from './regions';
import {drySite} from './geography';
import {isDateKey} from './dates';
import {toHubDateKey} from '@/domain/queries';
import {GROVE_SPECIES,type GroveSpecies,type GrovePropKind} from './assets';
import {wildlifeMilestones,type GroveBookInput} from './wildlife';
export type AnnualProp={id:string;kind:GrovePropKind;x:number;z:number;height:number;worldYear:number;regionId:string;scale:number};
const baseline=new WeakMap<AnnualWorld,AnnualProp[]>();
function baselineProps(world:AnnualWorld):AnnualProp[]{
 const cached=baseline.get(world);if(cached)return cached;const props:AnnualProp[]=[];
 for(const region of world.regions!.weeks){const a=region.anchor;
  for(let k=0;k<5;k++){const angle=k*Math.PI*2/5,x=a.x+Math.cos(angle)*1.5,z=a.z+Math.sin(angle)*1.5,s=drySite(world,x,z);if(!s.dry||s.slope>.5)continue;props.push({id:region.id+':baseline:'+k,kind:k===0?'rock':'grass',x,z,height:s.height,worldYear:world.key.year,regionId:region.id,scale:k===0?.65:1});}}
 baseline.set(world,props);return props;
}
export function buildAnnualGrovePlan(input:{worlds:readonly AnnualWorld[];tasks:readonly GroveTaskInput[];view:GroveView;anchor:string;now:Date;timeZone?:string;terms?:readonly GroveTerm[];books?:readonly GroveBookInput[];session?:AnnualPlantingSession}){
 if(!isDateKey(input.anchor)||!Number.isFinite(input.now.getTime()))throw Error('Invalid annual Grove date');
 const period=grovePeriod(input.view,input.anchor,input.terms),keys=groveDateKeys(input.view,input.anchor,input.terms),worlds=new Map(input.worlds.map(w=>[w.key.year,w]));
 if(worlds.size!==input.worlds.length)throw Error('Duplicate annual world');
 for(const year of new Set(keys.map(k=>Number(k.slice(0,4)))))if(!worlds.has(year))throw Error('Missing annual world for '+year);
 const raw=groveCompletions(input.tasks,input.timeZone),completions=uniqueCompletions(raw.completions),session=input.session??new AnnualPlantingSession(),now=input.now.getTime(),today=toHubDateKey(input.now,input.timeZone);
 const contextTrees=input.worlds.flatMap(w=>session.allocate(w,completions,now)).sort((a,b)=>a.completedMs-b.completedMs||a.id.localeCompare(b.id));
 const trees=contextTrees.filter(t=>t.dayKey>=period.from&&t.dayKey<=period.to),counts=Object.fromEntries(GROVE_SPECIES.map(s=>[s,0])) as Record<GroveSpecies,number>;
 for(const t of trees)counts[t.species]++;
 const days=keys.map(key=>{const world=worlds.get(Number(key.slice(0,4)))!,region=regionForDate(world.regions!,key)!;return {key,regionId:region.id,worldYear:world.key.year,cx:region.anchor.x,cz:region.anchor.z,trees:trees.filter(t=>t.dayKey===key),holiday:!groveCalendar(key,input.terms).terms.some(t=>t.starts_on<=key&&t.ends_on>=key),future:key>today,today:key===today};});
 const activityProps:AnnualProp[]=[];
 for(const world of input.worlds)for(const region of world.regions!.weeks){const active=contextTrees.filter(t=>t.regionId===region.id),used=new Set(active.map(t=>t.slot));if(!active.length)continue;
  const sites=region.sites.filter(s=>!used.has(s.index)).slice(0,Math.min(16,active.length*2));for(const [i,s] of sites.entries())activityProps.push({id:region.id+':activity:'+i,kind:i%2?'flower':'grass',x:s.x,z:s.z,height:s.height,worldYear:world.key.year,regionId:region.id,scale:1});}
 const historicalTerms=new Map<string,GroveTerm>();for(const year of new Set([Number(input.anchor.slice(0,4)),...completions.filter(c=>c.completedMs<=now).map(c=>Number(c.dayKey.slice(0,4)))]))for(const term of groveCalendar(year+'-01-01',input.terms).terms)historicalTerms.set(term.starts_on,term);
 const live=completions.filter(c=>c.completedMs<=now),milestoneCache=new Map<string,ReturnType<typeof wildlifeMilestones>>();
 const wildlifeAt=(key:string)=>{if(!isDateKey(key))throw Error('Invalid wildlife date');const through=key<today?key:today;let found=milestoneCache.get(through);if(!found){found=wildlifeMilestones(live,[...historicalTerms.values()],through,input.books);milestoneCache.set(through,found);}return found;};
 return {view:input.view,anchor:input.anchor,today,from:period.from,to:period.to,years:[...worlds.keys()].sort((a,b)=>a-b),boundary:new Set(keys.map(k=>k.slice(0,4))).size>1,days,trees,contextTrees,counts,undated:raw.undated,periodLabel:period.label,provisionalCalendar:keys.some(key=>groveCalendar(key,input.terms).provisional),baselineProps:input.worlds.flatMap(w=>baselineProps(w)),activityProps,wildlifeAt,wildlife:wildlifeAt(period.to)};
}
export type AnnualGrovePlan=ReturnType<typeof buildAnnualGrovePlan>;

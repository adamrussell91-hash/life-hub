import type {WildlifeMilestone,WildlifeSpecies} from './wildlife';
/** Extra encounters share existing earned milestones; dates never grant achievements. */
const MODELS:Partial<Record<WildlifeSpecies,string[]>>={fox:['animal-forest-bear','animal-forest-boar','animal-forest-wolf'],deer:['animal-forest-moose'],hare:['animal-skunk'],squirrel:['animal-chipmunk'],robin:['animal-raccoon'],mallard:['animal-river-otter']};
export function companionEncounters(earned:readonly WildlifeMilestone[],day:string){
 const candidates=earned.filter(m=>m.earnedOn<=day).flatMap(m=>(MODELS[m.species]??[]).map(id=>({id,swimming:id==='animal-river-otter',earnedOn:m.earnedOn,reason:m.reason})));
 if(!candidates.length)return [];
 const start=Math.floor(Date.parse(day+'T12:00:00Z')/86400000)%candidates.length;
 return [candidates[start]!,...(candidates.length>1?[candidates[(start+1)%candidates.length]!]:[])];
}

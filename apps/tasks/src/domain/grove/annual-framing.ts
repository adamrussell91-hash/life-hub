/** Frame geographic regions even before any tasks have been planted. */
import type {AnnualWorld} from './world';
import type {AnnualGrovePlan} from './annual-plan';
export function annualFramePoints(worlds:readonly AnnualWorld[],plan:AnnualGrovePlan|undefined,clearing:boolean,focusedDay:boolean,heightScale:number,offset:(year:number)=>number){
 if(!plan||(!clearing&&plan.view==='year'))return worlds.flatMap(w=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:offset(w.key.year)+x*w.grid.extent/2,z:z*w.grid.extent/2,y:0}))));
 const days=clearing&&focusedDay?plan.days.filter(d=>d.key===plan.anchor):plan.days;
 const trees=clearing&&focusedDay?plan.trees.filter(t=>t.dayKey===plan.anchor):plan.trees;
 return [...trees.map(t=>({x:t.x+offset(t.worldYear),z:t.z,y:t.height*heightScale})),...days.flatMap(d=>{
  const world=worlds.find(w=>w.key.year===d.worldYear),region=world?.regions?.weeks.find(w=>w.id===d.regionId),y=world&&region?world.hydrology.bed[region.anchor.cell]!*heightScale:0;
  return [-1,1].flatMap(x=>[-1,1].map(z=>({x:offset(d.worldYear)+d.cx+x*12,z:d.cz+z*12,y})));
 })];
}

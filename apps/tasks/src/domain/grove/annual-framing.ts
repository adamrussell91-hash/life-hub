/** Frame geographic regions even before any tasks have been planted. */
import type {AnnualWorld} from './world';
import type {AnnualGrovePlan} from './annual-plan';
/** Focused-day empty clearing: wildlife as subjects, not meadow dots. */
export const FOCUSED_DAY_CLEARING_RADIUS = 2.25;
export function annualFramePoints(worlds:readonly AnnualWorld[],plan:AnnualGrovePlan|undefined,clearing:boolean,focusedDay:boolean,heightScale:number,offset:(year:number)=>number){
 if(!plan||(!clearing&&plan.view==='year'))return worlds.flatMap(w=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:offset(w.key.year)+x*w.grid.extent/2,z:z*w.grid.extent/2,y:0}))));
 const days=clearing&&focusedDay?plan.days.filter(d=>d.key===plan.anchor):plan.days;
 const trees=clearing&&focusedDay?plan.trees.filter(t=>t.dayKey===plan.anchor):plan.trees;
 if(!clearing){
  const points=trees.map(t=>({x:t.x+offset(t.worldYear),z:t.z,y:t.height*heightScale})),seen=new Set<string>();
  for(const day of days){
   const key=day.worldYear+':'+day.regionId;if(seen.has(key))continue;seen.add(key);
   const world=worlds.find(w=>w.key.year===day.worldYear),region=world?.regions?.weeks.find(r=>r.id===day.regionId);if(!world||!region)continue;
   const g=world.grid;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,minY=Infinity,maxY=-Infinity;
   for(const cell of region.cells){const x=g.x0+cell%g.size*g.step,z=g.z0+Math.floor(cell/g.size)*g.step,y=world.hydrology.bed[cell]!*heightScale;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
   // Geographic context is independent of activity; retain a small margin beyond owned cells.
   if(Number.isFinite(minX))for(const x of [minX-12,maxX+12])for(const z of [minZ-12,maxZ+12])for(const y of [minY,maxY])points.push({x:x+offset(day.worldYear),z,y});
  }
  return points;
 }
 const radius=focusedDay?(trees.length?8:FOCUSED_DAY_CLEARING_RADIUS):12;
 return [...trees.map(t=>({x:t.x+offset(t.worldYear),z:t.z,y:t.height*heightScale})),...days.flatMap(d=>{
  const world=worlds.find(w=>w.key.year===d.worldYear),region=world?.regions?.weeks.find(w=>w.id===d.regionId),y=world&&region?world.hydrology.bed[region.anchor.cell]!*heightScale:0;
  return [-1,1].flatMap(x=>[-1,1].map(z=>({x:offset(d.worldYear)+d.cx+x*radius,z:d.cz+z*radius,y})));
 })];
}

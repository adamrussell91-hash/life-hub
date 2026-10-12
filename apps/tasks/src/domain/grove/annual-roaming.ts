import type {AnnualWorld} from './world';
import type {AnnualGrovePlan} from './annual-plan';
import type {WildlifeSpecies,PathPoint} from './wildlife';
import {isDateKey} from './dates';
import {hashString,seededRandom} from './random';
import {NavigationBudget,TreeObstacles,prepareNavigation,navigationEdgeKey,type NavigationGraph} from './annual-navigation';
import {sampleGeography} from './geography';
import {roundRouteCorners} from './roaming-path';
export type RoamingEncounter={id:string;species:WildlifeSpecies;earnedOn:string;swimming:boolean;baby:boolean};
/** Ordered connected circuit; consumers may choose successive destination indices
 * and must travel the intervening points rather than interpolate a shortcut. */
export type RoamingRoute={id:string;points:PathPoint[];regionIds:string[];mode:'land'|'water'|'flight'};
function polishRoute(world:AnnualWorld,route:RoamingRoute,trees:TreeObstacles):RoamingRoute{
 // Water footprints already leave non-grid arcs; bulging them can bridge elevation steps.
 if(route.mode==='water')return route;
 const root=route.points[0]!;
 // Cheap local clearance: chamfers sit near already-legal vertices, so full path
 // rescans would dominate dense-history preparation for little extra safety.
 const accept=(segment:readonly PathPoint[])=>{
  for(let i=0;i<segment.length;i++){
   const p=segment[i]!,g=sampleGeography(world,p.x,p.z,0);
   if(g.waterType!=='dry'||g.slope>.5||!trees.clear(p))return false;
   if(i&&!trees.clear(segment[i-1]!,p))return false;
  }
  return true;
 };
 let points=roundRouteCorners(route.points,{maxCut:Math.min(1.2,world.grid.step*.35),samples:2,allowReverse:false,accept});
 if(points.length<2)return route;
 // Corner polish can drop the circuit root; re-anchor only when that still clears.
 if(Math.hypot(points[0]!.x-root.x,points[0]!.z-root.z)>1e-6){
  const anchored=[{x:root.x,z:root.z},...points];
  const last=anchored.at(-1)!;
  if(Math.hypot(anchored[0]!.x-last.x,anchored[0]!.z-last.z)>1e-6)anchored.push({x:root.x,z:root.z});
  else anchored[anchored.length-1]={x:root.x,z:root.z};
  if(accept(anchored))points=anchored;
 }
 return {...route,points};
}
async function circuit(w:AnnualWorld,graph:NavigationGraph,eligible:Set<number>,encounter:RoamingEncounter,seed:string,trees:TreeObstacles,budget:NavigationBudget):Promise<RoamingRoute|undefined>{
 const accessible=(i:number,j:number)=>eligible.has(graph.nodes[j]!.region)&&(graph.edgeRegions.get(navigationEdgeKey(i,j))??[]).every(r=>eligible.has(r));
 const nodes=graph.nodes,seen=new Uint8Array(nodes.length),components:{cells:number[];coverage:number}[]=[];
 for(let i=0;i<nodes.length;i++)if(!seen[i]&&eligible.has(nodes[i]!.region)){
  const queue=[i],regions=new Set<number>();seen[i]=1;
  for(let k=0;k<queue.length;k++){regions.add(nodes[queue[k]!]!.region);for(const j of nodes[queue[k]!]!.edges)if(!seen[j]&&accessible(queue[k]!,j)){seen[j]=1;queue.push(j);}if(k%32===0)await budget.checkpoint();}
  if(queue.length>1)components.push({cells:queue,coverage:regions.size});await budget.checkpoint();
 }
 if(!components.length)return;
 components.sort((a,b)=>b.coverage-a.coverage||b.cells.length-a.cells.length||a.cells[0]!-b.cells[0]!);
 const random=seededRandom(seed),best=components[0]!.coverage,choices=components.filter(c=>c.coverage===best),component=choices[Math.floor(random()*choices.length)]!.cells;
 let root=component[Math.floor(random()*component.length)]!,score=Infinity;
 if(!encounter.swimming&&(encounter.species==='deer'||encounter.species==='hare'||encounter.species==='squirrel')){
  for(const i of component){const p=nodes[i]!;
   const candidate=encounter.species==='squirrel'?-trees.nearby(p,p,w.grid.step*5).reduce((sum,t)=>sum+1/(1+Math.hypot(p.x-t.x,p.z-t.z)),0):Math.min(...w.meadows.map(m=>Math.hypot(p.x-m.cx,p.z-m.cz)/m.radius));
   if(candidate<score-1e-8||Math.abs(candidate-score)<1e-8&&hashString(seed+':'+i)<hashString(seed+':'+root)){score=candidate;root=i;}
   await budget.checkpoint();
  }
 }
 // A BFS tree connects region-spanning destinations. Its pruned traversal is a
 // circuit with legal reverse edges, supporting repeated destination choices.
 const parent=new Int32Array(nodes.length).fill(-1),queue=[root],destinations=new Map<number,number>();parent[root]=root;
 for(let k=0;k<queue.length;k++){const i=queue[k]!,p=nodes[i]!,prior=destinations.get(p.region);
  if(prior===undefined||Math.hypot(p.x-nodes[root]!.x,p.z-nodes[root]!.z)>Math.hypot(nodes[prior]!.x-nodes[root]!.x,nodes[prior]!.z-nodes[root]!.z))destinations.set(p.region,i);
  for(const j of p.edges)if(parent[j]===-1&&accessible(i,j)){parent[j]=i;queue.push(j);}if(k%32===0)await budget.checkpoint();
 }
 const goals=[...destinations.values()];for(let k=0;k<4;k++)goals.push(component[Math.floor(random()*component.length)]!);
 const children=new Map<number,Set<number>>();
 for(const goal of goals){let i=goal;while(i!==root){const p=parent[i]!;if(p<0)break;const list=children.get(p)??new Set<number>();list.add(i);children.set(p,list);i=p;await budget.checkpoint();}}
 const order=[root],stack:{node:number;remaining:number[]}[]=[{node:root,remaining:[...children.get(root)??[]]}];
 while(stack.length){const frame=stack.at(-1)!,next=frame.remaining.shift();
  if(next!==undefined){order.push(next);stack.push({node:next,remaining:[...children.get(next)??[]]});}else{stack.pop();if(stack.length)order.push(stack.at(-1)!.node);}await budget.checkpoint();
 }
 if(order.length<2)return;
 const visitedRegions=[nodes[root]!.region];let travelDistance=0;
 for(let k=1;k<order.length;k++){const a=order[k-1]!,b=order[k]!,edge=graph.edgeRegions.get(navigationEdgeKey(a,b));
  travelDistance+=Math.hypot(nodes[b]!.x-nodes[a]!.x,nodes[b]!.z-nodes[a]!.z);
  visitedRegions.push(...(edge?(a<b?edge:edge.slice().reverse()):[nodes[b]!.region]));if(k%32===0)await budget.checkpoint();
 }
 if(!Number.isFinite(travelDistance)||travelDistance<=0)return;
 const regionIds=[...new Set(visitedRegions.map(r=>w.regions!.weeks[r]!.id))];
 return {id:encounter.id,points:order.map(i=>({x:nodes[i]!.x,z:nodes[i]!.z})),regionIds,mode:encounter.swimming?'water':encounter.species==='robin'||encounter.species==='owl'?'flight':'land'};
}
/** No live graph, actor, or dynamic obstacle cache survives a preparation request. */
export async function buildAnnualRoamingRoutes(world:AnnualWorld,plan:AnnualGrovePlan,encounters:readonly RoamingEncounter[],signal?:AbortSignal):Promise<RoamingRoute[]>{
 const budget=new NavigationBudget(signal);budget.check();
 if(!world.regions||!isDateKey(plan.from)||!isDateKey(plan.to)||!isDateKey(plan.today))return [];
 const cutoff=plan.to<plan.today?plan.to:plan.today,open=new Set<number>(),obstaclePoints:PathPoint[]=[],byId=new Map(world.regions.weeks.map(r=>[r.id,r]));
 for(const tree of plan.contextTrees){const region=byId.get(tree.regionId);
  if(tree.worldYear===world.key.year&&Number.isFinite(tree.x)&&Number.isFinite(tree.z))obstaclePoints.push({x:tree.x,z:tree.z});
  if(region&&tree.worldYear===world.key.year&&isDateKey(tree.dayKey)&&Number.isFinite(tree.completedMs)&&tree.dayKey>=plan.from&&tree.dayKey<=cutoff&&region.from<=tree.dayKey&&tree.dayKey<=region.to)open.add(region.index);
  await budget.checkpoint();
 }
 if(!open.size)return [];
 const accepted:RoamingEncounter[]=[],ids=new Set<string>();
 for(const e of encounters){if(accepted.length>=11)break;if(!e.id||ids.has(e.id)||!isDateKey(e.earnedOn)||e.earnedOn>cutoff)continue;ids.add(e.id);accepted.push(e);}
 if(!accepted.length)return [];
 const trees=await TreeObstacles.prepare(obstaclePoints,world.grid.step,budget),graphs=new Map<boolean,NavigationGraph>(),routes:RoamingRoute[]=[];
 for(const encounter of accepted){const eligible=new Set([...open].filter(i=>world.regions!.weeks[i]!.to>=encounter.earnedOn));if(!eligible.size)continue;
  let graph=graphs.get(encounter.swimming);if(!graph){graph=await prepareNavigation(world,open,trees,encounter.swimming,budget);graphs.set(encounter.swimming,graph);}
  const seed=world.identity+':'+plan.from+':'+cutoff+':'+[...eligible].join(',')+':'+encounter.id;
  const route=await circuit(world,graph,eligible,encounter,seed,trees,budget);
  if(route)routes.push(polishRoute(world,route,trees));budget.check();
 }
 return routes;
}

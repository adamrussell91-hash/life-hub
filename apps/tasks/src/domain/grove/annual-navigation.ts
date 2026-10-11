/** Scene-free, request-owned navigation. Only immutable water indexing is shared. */
import type {AnnualWorld} from './world';
import type {PathPoint} from './wildlife';
import {distanceToSegment,isLandPathSafe,prepareGeography,sampleGeography,waterFacesAlongSegment} from './geography';
import {isSwimPathSafe} from './annual-wildlife';
export type NavigationNode=PathPoint&{region:number;edges:number[]};
export type NavigationGraph={nodes:NavigationNode[];edgeRegions:Map<string,number[]>};
export const navigationEdgeKey=(a:number,b:number)=>Math.min(a,b)+':'+Math.max(a,b);
export class NavigationBudget {
 private started=performance.now();
 constructor(private signal?:AbortSignal){}
 check(){if(this.signal?.aborted)throw new DOMException('Annual roaming preparation cancelled','AbortError');}
 async checkpoint(){this.check();if(performance.now()-this.started>=5){await new Promise<void>(resolve=>setTimeout(resolve,0));this.started=performance.now();this.check();}}
}
/** Dynamic trunks are indexed per request, never cached with the world. */
export class TreeObstacles {
 private buckets=new Map<string,PathPoint[]>();
 private constructor(private step:number){}
 static async prepare(points:readonly PathPoint[],step:number,budget:NavigationBudget):Promise<TreeObstacles>{
  const obstacles=new TreeObstacles(step);
  for(let i=0;i<points.length;i++){const p=points[i]!,key=obstacles.key(p.x,p.z),list=obstacles.buckets.get(key)??[];list.push(p);obstacles.buckets.set(key,list);if(i%64===0)await budget.checkpoint();}
  return obstacles;
 }
 private key(x:number,z:number){return Math.floor(x/this.step)+':'+Math.floor(z/this.step);}
 nearby(a:PathPoint,b=a,radius=1):PathPoint[]{
  const result:PathPoint[]=[];
  for(let z=Math.floor((Math.min(a.z,b.z)-radius)/this.step);z<=Math.floor((Math.max(a.z,b.z)+radius)/this.step);z++)
   for(let x=Math.floor((Math.min(a.x,b.x)-radius)/this.step);x<=Math.floor((Math.max(a.x,b.x)+radius)/this.step);x++)result.push(...this.buckets.get(x+':'+z)??[]);
  return result;
 }
 clear(a:PathPoint,b=a){return this.nearby(a,b).every(p=>distanceToSegment(p.x,p.z,a,b).distance>1);}
}
const point=(w:AnnualWorld,cell:number):PathPoint=>({x:w.grid.x0+cell%w.grid.size*w.grid.step,z:w.grid.z0+Math.floor(cell/w.grid.size)*w.grid.step});
function neighbors(cell:number,size:number){const x=cell%size,z=Math.floor(cell/size);return [x?cell-1:-1,x<size-1?cell+1:-1,z?cell-size:-1,z<size-1?cell+size:-1];}
/** Water cells have owner -1; flood nearest dry ownership across the grid.
 * Closed owners participate too, so nearby locked shores cannot open by proxy. */
async function shorelineOwners(w:AnnualWorld,budget:NavigationBudget){
 const owner=w.regions!.owner,result=new Int16Array(owner),queue:number[]=[];
 for(let c=0;c<owner.length;c++){if(owner[c]!>=0)queue.push(c);if(c%64===0)await budget.checkpoint();}
 for(let k=0;k<queue.length;k++){const cell=queue[k]!;for(const n of neighbors(cell,w.grid.size))if(n>=0&&result[n]!<0){result[n]=result[cell]!;queue.push(n);}if(k%64===0)await budget.checkpoint();}
 return result;
}
function onFall(w:AnnualWorld,a:PathPoint,b=a){
 for(const fall of w.hydrology.falls??[]){const channel=w.hydrology.channels.find(c=>c.id===fall.channelId),points=channel?.points;if(!points)continue;
  for(let k=fall.from+1;k<=fall.to;k++){
   const from=points[k-1],to=points[k];if(!from||!to)continue;
   const radius=Math.max(from.width,to.width)/2+.05;
   // Conservative capsule around the falling channel excludes its whole wet width.
   const cross=(p:PathPoint,q:PathPoint,r:PathPoint)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
   const intersects=cross(a,b,from)*cross(a,b,to)<=0&&cross(from,to,a)*cross(from,to,b)<=0
    &&Math.max(a.x,b.x)>=Math.min(from.x,to.x)&&Math.max(from.x,to.x)>=Math.min(a.x,b.x)
    &&Math.max(a.z,b.z)>=Math.min(from.z,to.z)&&Math.max(from.z,to.z)>=Math.min(a.z,b.z);
   if(intersects||Math.min(distanceToSegment(a.x,a.z,from,to).distance,distanceToSegment(b.x,b.z,from,to).distance,
    distanceToSegment(from.x,from.z,a,b).distance,distanceToSegment(to.x,to.z,a,b).distance)<=radius)return true;
  }
 }return false;
}
function swimEdge(w:AnnualWorld,a:PathPoint,b:PathPoint){
 if(onFall(w,a,b)||!isSwimPathSafe(w,[a,b]))return false;
 const length=Math.hypot(b.x-a.x,b.z-a.z),intervals:{lo:number;hi:number;height:(t:number)=>number}[]=[];
 for(const face of waterFacesAlongSegment(w,a,b)){const t=face.triangles,i=face.offset;
  const area=(t[i+3]!-t[i]!)*(t[i+8]!-t[i+2]!)-(t[i+5]!-t[i+2]!)*(t[i+6]!-t[i]!);
  if(Math.abs(area)<1e-12)continue;
  const sign=Math.sign(area);let lo=0,hi=1;
  for(let e=0;e<3;e++){const p=i+e*3,q=i+(e+1)%3*3,dx=t[q]!-t[p]!,dz=t[q+2]!-t[p+2]!;
   const start=sign*(dx*(a.z-t[p+2]!)-dz*(a.x-t[p]!)),change=sign*(dx*(b.z-a.z)-dz*(b.x-a.x));
   if(Math.abs(change)<1e-14){if(start<0){hi=-1;break;}}
   else if(change>0)lo=Math.max(lo,-start/change);else hi=Math.min(hi,-start/change);
  }
  lo=Math.max(0,lo);hi=Math.min(1,hi);if(hi-lo<1e-10)continue;
  const height=(v:number)=>{
   const x=a.x+(b.x-a.x)*v,z=a.z+(b.z-a.z)*v,
    u=((t[i+5]!-t[i+8]!)*(x-t[i+6]!)+(t[i+6]!-t[i+3]!)*(z-t[i+8]!))/area,
    q=((t[i+8]!-t[i+2]!)*(x-t[i+6]!)+(t[i]!-t[i+6]!)*(z-t[i+8]!))/area;
   return u*t[i+1]!+q*t[i+4]!+(1-u-q)*t[i+7]!;
  };
  intervals.push({lo,hi,height});
 }
 // Partition at exact triangle crossings. Compare the actual interpolated
 // surface on both sides, including tiny jumps hidden by uniform sampling.
 const cuts=[...new Set([0,1,...intervals.flatMap(f=>[f.lo,f.hi])])].sort((u,v)=>u-v);
 let previous=sampleGeography(w,a.x,a.z,0).waterElevation;
 for(let k=1;k<cuts.length;k++){const lo=cuts[k-1]!,hi=cuts[k]!;if(hi-lo<1e-10)continue;
  const mid=(lo+hi)/2,face=intervals.find(f=>f.lo<=mid&&f.hi>=mid);if(!face)return false;
  const from=face.height(lo),to=face.height(hi);
  if(previous===null||Math.abs(from-previous)>1e-4||Math.abs(to-from)>length*(hi-lo)*.5+1e-5)return false;previous=to;
 }
 const end=sampleGeography(w,b.x,b.z,0).waterElevation;
 return previous!==null&&end!==null&&Math.abs(previous-end)<=1e-4;
}
/** Split exactly at ownership-cell boundaries, including narrow corner visits. */
function segmentRegions(w:AnnualWorld,a:PathPoint,b:PathPoint,owners:Int16Array):number[]{
 const g=w.grid,cuts=[0,1];
 for(const [start,end,origin] of [[a.x,b.x,g.x0],[a.z,b.z,g.z0]]){
  if(start===end)continue;
  const lo=Math.min(start!,end!),hi=Math.max(start!,end!);
  for(let cell=Math.ceil((lo-origin!)/g.step-.5);cell<=Math.floor((hi-origin!)/g.step-.5);cell++){
   const t=(origin!+(cell+.5)*g.step-start!)/(end!-start!);if(t>0&&t<1)cuts.push(t);
  }
 }
 cuts.sort((u,v)=>u-v);const result:number[]=[];
 const ownerAt=(t:number)=>{const x=Math.round((a.x+(b.x-a.x)*t-g.x0)/g.step),z=Math.round((a.z+(b.z-a.z)*t-g.z0)/g.step);return x<0||z<0||x>=g.size||z>=g.size?-1:owners[z*g.size+x]!;};
 const append=(r:number)=>{if(result.at(-1)!==r)result.push(r);};append(ownerAt(0));
 for(let k=1;k<cuts.length;k++)if(cuts[k]!>cuts[k-1]!)append(ownerAt((cuts[k]!+cuts[k-1]!)/2));append(ownerAt(1));
 return result;
}
function allowedSegment(w:AnnualWorld,a:PathPoint,b:PathPoint,owners:Int16Array,open:Set<number>){return segmentRegions(w,a,b,owners).every(r=>open.has(r));}
export async function prepareNavigation(w:AnnualWorld,open:Set<number>,trees:TreeObstacles,water:boolean,budget:NavigationBudget):Promise<NavigationGraph>{
 await prepareGeography(w,()=>budget.checkpoint());budget.check();
 const g=w.grid,owners=water?await shorelineOwners(w,budget):w.regions!.owner,nodes:NavigationNode[]=[],cells=new Int32Array(g.size*g.size).fill(-1),edgeRegions=new Map<string,number[]>();
 const add=(p:PathPoint)=>{
  const x=Math.round((p.x-g.x0)/g.step),z=Math.round((p.z-g.z0)/g.step);if(x<0||z<0||x>=g.size||z>=g.size)return;
  const region=owners[z*g.size+x]!;if(!open.has(region))return;
  const s=sampleGeography(w,p.x,p.z,0);
  if(water?s.waterType==='dry'||onFall(w,p):s.waterType!=='dry'||s.slope>.5||!trees.clear(p))return;
  nodes.push({...p,region,edges:[]});return nodes.length-1;
 };
 if(!water)for(let c=0;c<cells.length;c++){const id=add(point(w,c));if(id!==undefined)cells[c]=id;if(c%32===0)await budget.checkpoint();}
 if(!water){
  for(let c=0;c<cells.length;c++){if(cells[c]!>=0){const a=nodes[cells[c]!]!;
   for(const next of [c%g.size<g.size-1?c+1:-1,c+g.size<cells.length?c+g.size:-1])if(next>=0&&cells[next]!>=0){const b=nodes[cells[next]!]!;
    if(trees.clear(a,b)&&allowedSegment(w,a,b,owners,open)&&isLandPathSafe(w,[a,b],.5)){a.edges.push(cells[next]!);b.edges.push(cells[c]!);}
   }}if(c%16===0)await budget.checkpoint();
  }
 }else{
  // Shared actual triangle edges supply linear-size wet connectivity.
  const edges=new Map<string,{center:number;midpoint:PathPoint}[]>(),buckets=new Map<string,number[]>();
  const vertexKey=(x:number,z:number)=>Math.round(x*1e5)+':'+Math.round(z*1e5);
  const connect=(i:number,j:number)=>{const a=nodes[i]!,b=nodes[j]!;
   const regions=segmentRegions(w,a,b,owners);
   if(regions.every(r=>open.has(r))&&swimEdge(w,a,b)&&swimEdge(w,b,a)){
    a.edges.push(j);b.edges.push(i);edgeRegions.set(navigationEdgeKey(i,j),i<j?regions:regions.slice().reverse());
   }
  };
  for(const descriptor of [...w.hydrology.lakes,...w.hydrology.channels]){const t=descriptor.triangles;
   for(let i=0;i<t.length;i+=9){const cx=(t[i]!+t[i+3]!+t[i+6]!)/3,cz=(t[i+2]!+t[i+5]!+t[i+8]!)/3,center=add({x:cx,z:cz});
    // Coarse external fixtures/descriptors may cover many grid cells per face.
    // Keep interior candidates on both sides when a fall excludes the centroid.
    if(Math.max(...[0,3,6].map(k=>Math.hypot(t[i+k]!-cx,t[i+k+2]!-cz)))>g.step*2){
     const interior:number[]=center===undefined?[]:[center];
     for(const k of [0,3,6]){const tip=add({x:t[i+k]!*.9+cx*.1,z:t[i+k+2]!*.9+cz*.1});if(tip!==undefined)interior.push(tip);}
     for(let a=0;a<interior.length;a++)for(let b=a+1;b<interior.length;b++){connect(interior[a]!,interior[b]!);await budget.checkpoint();}
    }
    if(center!==undefined){
     for(let e=0;e<3;e++){const a=i+e*3,b=i+(e+1)%3*3,ka=vertexKey(t[a]!,t[a+2]!),kb=vertexKey(t[b]!,t[b+2]!),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
      const list=edges.get(key)??[];list.push({center,midpoint:{x:(t[a]!+t[b]!)/2,z:(t[a+2]!+t[b+2]!)/2}});edges.set(key,list);
     }
     const p=nodes[center]!,key=Math.floor(p.x/g.step)+':'+Math.floor(p.z/g.step),list=buckets.get(key)??[];list.push(center);buckets.set(key,list);
    }await budget.checkpoint();
   }
  }
  for(const list of edges.values()){
   if(list.length>1){const midpoint=add(list[0]!.midpoint);
    if(midpoint!==undefined)for(const face of list){connect(midpoint,face.center);await budget.checkpoint();}
   }await budget.checkpoint();
  }
  // Overlapping lake/channel junctions may not have identical triangle edges.
  // Isolated triangle centers get only a bounded local join search.
  for(const centers of buckets.values())for(const i of centers){const a=nodes[i]!;if(a.edges.length>=3)continue;
   const bx=Math.floor(a.x/g.step),bz=Math.floor(a.z/g.step);let tried=0;
   for(let z=bz-1;z<=bz+1&&tried<8;z++)for(let x=bx-1;x<=bx+1&&tried<8;x++)for(const j of buckets.get(x+':'+z)??[]){
    if(j<=i||a.edges.includes(j)||Math.hypot(nodes[j]!.x-a.x,nodes[j]!.z-a.z)>g.step)continue;
    connect(i,j);tried++;await budget.checkpoint();if(tried>=8)break;
   }await budget.checkpoint();
  }

 }
 return {nodes,edgeRegions};
}

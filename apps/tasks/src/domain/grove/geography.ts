/** One water classification for planting, motion and water rendering. */
import {sampleBedGrid,type AnnualWorld} from './world';
import {pointInTriangle,type ShorePoint} from './water';
type Face={type:'lake'|'stream';id:number;offset:number;triangles:Float32Array};
type Index={buckets:Map<number,Face[]>;shores:readonly (readonly ShorePoint[])[]};
const indices=new WeakMap<AnnualWorld,Index>();
function* buildIndex(w:AnnualWorld):Generator<void,Index>{
 const g=w.grid,buckets=new Map<number,Face[]>(),shores:(readonly ShorePoint[])[]=[];
 for(const [type,descriptors] of [['lake',w.hydrology.lakes],['stream',w.hydrology.channels]] as const)for(const d of descriptors){
  shores.push(...d.shoreLoops);const t=d.triangles;
  for(let i=0;i<t.length;i+=9){const xs=[t[i]!,t[i+3]!,t[i+6]!],zs=[t[i+2]!,t[i+5]!,t[i+8]!];
   const loX=Math.max(0,Math.floor((Math.min(...xs)-g.x0)/g.step)),hiX=Math.min(g.size-1,Math.floor((Math.max(...xs)-g.x0)/g.step));
   const loZ=Math.max(0,Math.floor((Math.min(...zs)-g.z0)/g.step)),hiZ=Math.min(g.size-1,Math.floor((Math.max(...zs)-g.z0)/g.step));
   const face={type,id:d.id,offset:i,triangles:t};
   for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){const id=z*g.size+x,list=buckets.get(id)||[];list.push(face);buckets.set(id,list);yield;}
  }
 }
 return {buckets,shores};
}
function indexWorld(w:AnnualWorld):Index{
 const cached=indices.get(w);if(cached)return cached;
 const builder=buildIndex(w);let result=builder.next();while(!result.done)result=builder.next();
 indices.set(w,result.value);return result.value;
}
/** Prepare the same immutable footprint index in bounded, cancellable caller chunks. */
export async function prepareGeography(w:AnnualWorld,checkpoint:()=>Promise<void>):Promise<void>{
 if(indices.has(w))return;
 const builder=buildIndex(w);let result=builder.next(),count=0;
 while(!result.done){if(++count%64===0)await checkpoint();result=builder.next();}
 indices.set(w,result.value);
}
/** Only faces in the segment's grid bounds are needed for exact footprint clipping. */
export function waterFacesAlongSegment(w:AnnualWorld,a:ShorePoint,b:ShorePoint):readonly Face[]{
 const index=indexWorld(w),g=w.grid,faces=new Set<Face>();
 const loX=Math.max(0,Math.floor((Math.min(a.x,b.x)-g.x0)/g.step)),hiX=Math.min(g.size-1,Math.floor((Math.max(a.x,b.x)-g.x0)/g.step));
 const loZ=Math.max(0,Math.floor((Math.min(a.z,b.z)-g.z0)/g.step)),hiZ=Math.min(g.size-1,Math.floor((Math.max(a.z,b.z)-g.z0)/g.step));
 for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++)for(const face of index.buckets.get(z*g.size+x)||[])faces.add(face);
 return [...faces];
}
export function distanceToSegment(x:number,z:number,a:ShorePoint,b:ShorePoint){const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/den)):0;return {distance:Math.hypot(x-a.x-dx*t,z-a.z-dz*t),t};}
export function sampleGeography(w:AnnualWorld,x:number,z:number,clearanceLimit?:number){
 const g=w.grid,bed=w.hydrology.bed,bedElevation=sampleBedGrid(g,bed,x,z),delta=g.step/4;
 const loX=Math.max(g.x0,x-delta),hiX=Math.min(g.x0+g.extent,x+delta),loZ=Math.max(g.z0,z-delta),hiZ=Math.min(g.z0+g.extent,z+delta);
 const sx=(sampleBedGrid(g,bed,hiX,z)-sampleBedGrid(g,bed,loX,z))/(hiX-loX),sz=(sampleBedGrid(g,bed,x,hiZ)-sampleBedGrid(g,bed,x,loZ))/(hiZ-loZ),norm=Math.hypot(sx,1,sz);
 const index=indexWorld(w),cell=Math.floor((z-g.z0)/g.step)*g.size+Math.floor((x-g.x0)/g.step);
 let waterType:'dry'|'lake'|'stream'='dry',waterElevation:number|null=null,lakeId:number|null=null,channelId:number|null=null,flowDirection={x:0,z:0};
 for(const f of index.buckets.get(cell)||[]){const t=f.triangles,i=f.offset,a={x:t[i]!,z:t[i+2]!},b={x:t[i+3]!,z:t[i+5]!},c={x:t[i+6]!,z:t[i+8]!};
  if(!pointInTriangle(x,z,a,b,c))continue;
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z),u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
  waterElevation=u*t[i+1]!+v*t[i+4]!+(1-u-v)*t[i+7]!;waterType=f.type;
  if(f.type==='lake')lakeId=f.id;else channelId=f.id;
  break;
 }
 const flowCell=Math.min(w.hydrology.receiver.length-1,Math.max(0,Math.round((z-g.z0)/g.step)*g.size+Math.round((x-g.x0)/g.step))),to=w.hydrology.receiver[flowCell]!;
 if(channelId!==null&&clearanceLimit===undefined){const c=w.hydrology.channels[channelId]!;let best=Infinity;for(let i=1;i<c.points.length;i++){const a=c.points[i-1]!,b=c.points[i]!,d=distanceToSegment(x,z,a,b);if(d.distance<best){best=d.distance;const len=Math.hypot(b.x-a.x,b.z-a.z);flowDirection={x:(b.x-a.x)/len,z:(b.z-a.z)/len};}}}
 else if(to>=0){const dx=to%g.size-flowCell%g.size,dz=Math.floor(to/g.size)-Math.floor(flowCell/g.size),length=Math.hypot(dx,dz);flowDirection={x:dx/length,z:dz/length};}
 let clearance=clearanceLimit===undefined?Infinity:waterClearance(w,x,z,clearanceLimit);if(clearanceLimit===undefined)for(const loop of index.shores)for(let i=1;i<loop.length;i++)clearance=Math.min(clearance,distanceToSegment(x,z,loop[i-1]!,loop[i]!).distance);
 return {bedElevation,normal:{x:-sx/norm,y:1/norm,z:-sz/norm},slope:Math.hypot(sx,sz),waterType,waterElevation,waterDepth:waterElevation===null?0:Math.max(0,waterElevation-bedElevation),flowDirection,shoreDistance:(waterType==='dry'?1:-1)*clearance,regionId:w.regions?.weeks[w.regions.owner[Math.min(g.size-1,Math.max(0,Math.round((z-g.z0)/g.step)))*g.size+Math.min(g.size-1,Math.max(0,Math.round((x-g.x0)/g.step)))]!]?.id??null,lakeId,channelId};
}

export function segmentTouchesWater(w:AnnualWorld,a:ShorePoint,b:ShorePoint):boolean{
 const index=indexWorld(w),g=w.grid,seen=new Set<string>();
 const loX=Math.max(0,Math.floor((Math.min(a.x,b.x)-g.x0)/g.step)),hiX=Math.min(g.size-1,Math.floor((Math.max(a.x,b.x)-g.x0)/g.step));
 const loZ=Math.max(0,Math.floor((Math.min(a.z,b.z)-g.z0)/g.step)),hiZ=Math.min(g.size-1,Math.floor((Math.max(a.z,b.z)-g.z0)/g.step));
 const cross=(p:ShorePoint,q:ShorePoint,r:ShorePoint)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
 const touches=(p:ShorePoint,q:ShorePoint)=>{
  if(Math.max(a.x,b.x)<Math.min(p.x,q.x)-1e-8||Math.max(p.x,q.x)<Math.min(a.x,b.x)-1e-8||Math.max(a.z,b.z)<Math.min(p.z,q.z)-1e-8||Math.max(p.z,q.z)<Math.min(a.z,b.z)-1e-8)return false;
  const u=cross(a,b,p),v=cross(a,b,q),s=cross(p,q,a),t=cross(p,q,b);return u*v<=1e-12&&s*t<=1e-12;
 };
 for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++)for(const f of index.buckets.get(z*g.size+x)||[]){
  const key=f.type+':'+f.id+':'+f.offset;if(seen.has(key))continue;seen.add(key);
  const t=f.triangles,i=f.offset,p=[0,3,6].map(k=>({x:t[i+k]!,z:t[i+k+2]!}));
  const area=cross(p[0]!,p[1]!,p[2]!);if(Math.abs(area)<1e-8)continue;
  if(pointInTriangle(a.x,a.z,p[0]!,p[1]!,p[2]!)||pointInTriangle(b.x,b.z,p[0]!,p[1]!,p[2]!)||p.some((v,k)=>touches(v,p[(k+1)%3]!)))return true;
 }
 return false;
}
export function isLandPathSafe(w:AnnualWorld,points:readonly ShorePoint[],maxSlope=.5):boolean{
 if(!Number.isFinite(maxSlope)||maxSlope<0||points.length===0)throw Error('Invalid land path constraints');
 for(const p of points)sampleBedGrid(w.grid,w.hydrology.bed,p.x,p.z);
 const safe=(p:ShorePoint)=>{const s=sampleGeography(w,p.x,p.z,0);return s.waterType==='dry'&&s.slope<=maxSlope;};
 if(!safe(points[0]!))return false;
 for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!;if(segmentTouchesWater(w,a,b))return false;const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(w.grid.step/4)));
  for(let k=1;k<=steps;k++)if(!safe({x:a.x+(b.x-a.x)*k/steps,z:a.z+(b.z-a.z)*k/steps}))return false;
 }return true;
}

/** Exact distance to the local water footprint, capped at a caller's search radius. */
export function waterClearance(w:AnnualWorld,x:number,z:number,radius:number):number{
 const g=w.grid,index=indexWorld(w);let best=radius;
 const loX=Math.max(0,Math.floor((x-radius-g.x0)/g.step)),hiX=Math.min(g.size-1,Math.floor((x+radius-g.x0)/g.step));
 const loZ=Math.max(0,Math.floor((z-radius-g.z0)/g.step)),hiZ=Math.min(g.size-1,Math.floor((z+radius-g.z0)/g.step));
 for(let cz=loZ;cz<=hiZ;cz++)for(let cx=loX;cx<=hiX;cx++)for(const f of index.buckets.get(cz*g.size+cx)||[]){
  const t=f.triangles,i=f.offset,a={x:t[i]!,z:t[i+2]!},b={x:t[i+3]!,z:t[i+5]!},c={x:t[i+6]!,z:t[i+8]!};
  if(pointInTriangle(x,z,a,b,c))return 0;
  best=Math.min(best,distanceToSegment(x,z,a,b).distance,distanceToSegment(x,z,b,c).distance,distanceToSegment(x,z,c,a).distance);
 }return best;
}
/** Fast planting sample; clearance is capped at 16m and therefore conservative. */
export function drySite(w:AnnualWorld,x:number,z:number){const s=sampleGeography(w,x,z,16);return {height:s.bedElevation,slope:s.slope,shoreDistance:s.shoreDistance,dry:s.waterType==='dry'};}

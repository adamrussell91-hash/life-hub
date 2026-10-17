/** Shared clipped water geometry. Terrain faces use the existing Grove diagonal. */
import type {WorldGrid} from './heightfield';
export const SHORE_DEPTH=.02;
export type WaterPoint=Readonly<{x:number;z:number;waterElevation:number}>;
export type ChannelPoint=WaterPoint&Readonly<{cell:number;distance:number;width:number}>;
export type ShorePoint=Readonly<{x:number;z:number}>;
export type Lake=Readonly<{id:number;waterElevation:number;cells:readonly number[];outletCell:number;downstreamReceiver:number;shoreLoops:readonly (readonly ShorePoint[])[];triangles:Float32Array}>;
export type ChannelEnd=Readonly<{type:'lake'|'junction'|'outlet';id:number}>;
export type Channel=Readonly<{id:number;points:readonly ChannelPoint[];start:ChannelEnd|null;end:ChannelEnd;length:number;contributingArea:number;triangles:Float32Array;shoreLoops:readonly (readonly ShorePoint[])[]}>;
export type Fall=Readonly<{channelId:number;from:number;to:number;drop:number}>;
type Vertex={x:number;z:number;h:number};
export function gridPoint(g:WorldGrid,id:number,bed:Float32Array):Vertex{return {x:g.x0+id%g.size*g.step,z:g.z0+Math.floor(id/g.size)*g.step,h:bed[id]!};}
export function clipPolygon<T>(polygon:T[],distance:(p:T)=>number,interpolate:(a:T,b:T,t:number)=>T):T[]{
 const out:T[]=[];
 for(let i=0;i<polygon.length;i++){const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,da=distance(a),db=distance(b);
  if(da>=-1e-9)out.push(a);
  if((da>=0)!==(db>=0))out.push(interpolate(a,b,da/(da-db)));
 }return out;
}
const interpolate=(a:Vertex,b:Vertex,t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,h:a.h+(b.h-a.h)*t});
export function addFan(out:number[],polygon:Vertex[],surface:(p:ShorePoint)=>number){
 for(let i=1;i<polygon.length-1;i++)for(const p of [polygon[0]!,polygon[i]!,polygon[i+1]!])out.push(p.x,surface(p),p.z);
}
export function terrainTriangleIds(g:WorldGrid,x:number,z:number){const i=z*g.size+x;return [[i,i+g.size,i+1],[i+1,i+g.size,i+g.size+1]];}
export function lakeGeometry(g:WorldGrid,bed:Float32Array,ids:Int32Array,levels:Float32Array,count:number):Float32Array[]{
 const arrays=Array.from({length:count},()=>[] as number[]);
 for(let z=0;z<g.size-1;z++)for(let x=0;x<g.size-1;x++)for(const tri of terrainTriangleIds(g,x,z)){
  const lake=tri.map(i=>ids[i]!).find(i=>i>=0);if(lake===undefined)continue;
  const wetId=tri.find(i=>ids[i]===lake)!,surface=levels[wetId]!;
  const polygon=clipPolygon(tri.map(i=>gridPoint(g,i,bed)),p=>surface-SHORE_DEPTH-p.h,interpolate);
  addFan(arrays[lake]!,polygon,()=>surface);
 }return arrays.map(a=>new Float32Array(a));
}
/** Cancel shared triangle edges to recover shore rings, including island holes. */
export function shoreLoops(triangles:Float32Array):readonly (readonly ShorePoint[])[]{
 const key=(p:ShorePoint)=>`${Math.round(p.x*10000)},${Math.round(p.z*10000)}`;
 const edges=new Map<string,{a:ShorePoint;b:ShorePoint}>();
 for(let i=0;i<triangles.length;i+=9){const points=[0,3,6].map(k=>({x:triangles[i+k]!,z:triangles[i+k+2]!}));
  for(let j=0;j<3;j++){const a=points[j]!,b=points[(j+1)%3]!;if(key(a)===key(b))continue;const edge=[key(a),key(b)].sort().join(':');if(edges.has(edge))edges.delete(edge);else edges.set(edge,{a,b});}
 }
 const adjacent=new Map<string,{a:ShorePoint;b:ShorePoint;key:string}[]>();
 for(const [id,e] of edges)for(const p of [e.a,e.b]){const k=key(p);const list=adjacent.get(k)||[];list.push({...e,key:id});adjacent.set(k,list);}
 const used=new Set<string>(),loops:ShorePoint[][]=[];
 for(const [id,e] of edges){if(used.has(id))continue;used.add(id);const loop=[e.a,e.b];let current=e.b;
  while(key(current)!==key(loop[0]!)){const next=adjacent.get(key(current))?.find(edge=>!used.has(edge.key));if(!next)throw Error('Open water shoreline');used.add(next.key);current=key(next.a)===key(current)?next.b:next.a;loop.push(current);if(loop.length>edges.size+1)throw Error('Invalid water shoreline');}
  if(loop.length>=4)loops.push(loop);
 }return loops;
}
export function pointInTriangle(x:number,z:number,a:ShorePoint,b:ShorePoint,c:ShorePoint):boolean{
 return pointInTriangleXZ(x,z,a.x,a.z,b.x,b.z,c.x,c.z);
}
/** Allocation-free form for hot geography loops; identical arithmetic and tolerances. */
export function pointInTriangleXZ(x:number,z:number,ax:number,az:number,bx:number,bz:number,cx:number,cz:number):boolean{
 const area=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);if(!(Math.abs(area)>1e-8))return false;
 const u=(bx-ax)*(z-az)-(bz-az)*(x-ax),v=(cx-bx)*(z-bz)-(cz-bz)*(x-bx),w=(ax-cx)*(z-cz)-(az-cz)*(x-cx);
 return u>=-1e-5&&v>=-1e-5&&w>=-1e-5||u<=1e-5&&v<=1e-5&&w<=1e-5;
}
/** Clip a continuous ribbon against the same bed faces as the terrain. */
export function channelGeometry(g:WorldGrid,bed:Float32Array,points:readonly ChannelPoint[]):Float32Array{
 const sides=points.map((p,i)=>{
  const a=points[Math.max(0,i-1)]!,b=points[Math.min(points.length-1,i+1)]!,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1;
  return [{x:p.x-dz/length*p.width/2,z:p.z+dx/length*p.width/2},{x:p.x+dz/length*p.width/2,z:p.z-dx/length*p.width/2}];
 });
 const out:number[]=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
  if(den<1e-8)continue;
  const surface=(p:ShorePoint)=>a.waterElevation+(b.waterElevation-a.waterElevation)*Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den));
  const [l0,r0]=sides[i-1]!,[l1,r1]=sides[i]!;
  for(const ribbon of [[l0!,r0!,l1!],[r0!,r1!,l1!]]){
   const minX=Math.max(0,Math.floor((Math.min(...ribbon.map(p=>p.x))-g.x0)/g.step)),maxX=Math.min(g.size-2,Math.floor((Math.max(...ribbon.map(p=>p.x))-g.x0)/g.step));
   const minZ=Math.max(0,Math.floor((Math.min(...ribbon.map(p=>p.z))-g.z0)/g.step)),maxZ=Math.min(g.size-2,Math.floor((Math.max(...ribbon.map(p=>p.z))-g.z0)/g.step));
   const orientation=(ribbon[1]!.x-ribbon[0]!.x)*(ribbon[2]!.z-ribbon[0]!.z)-(ribbon[1]!.z-ribbon[0]!.z)*(ribbon[2]!.x-ribbon[0]!.x);
   if(Math.abs(orientation)<1e-9)continue;
   for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)for(const ids of terrainTriangleIds(g,x,z)){
    let polygon=ids.map(id=>gridPoint(g,id,bed));
    for(let j=0;j<3;j++){const p=ribbon[j]!,q=ribbon[(j+1)%3]!;polygon=clipPolygon(polygon,v=>Math.sign(orientation)*((q.x-p.x)*(v.z-p.z)-(q.z-p.z)*(v.x-p.x)),interpolate);}
    polygon=clipPolygon(polygon,p=>surface(p)+1e-5-p.h,interpolate);addFan(out,polygon,surface);
   }
  }
 }return new Float32Array(out);
}
export function shoreIntersection(a:ShorePoint,b:ShorePoint,loops:readonly (readonly ShorePoint[])[]):ShorePoint{
 const dx=b.x-a.x,dz=b.z-a.z,hits:{t:number;p:ShorePoint}[]=[];
 for(const loop of loops)for(let i=1;i<loop.length;i++){
  const p=loop[i-1]!,q=loop[i]!,ex=q.x-p.x,ez=q.z-p.z,det=dx*ez-dz*ex;if(Math.abs(det)<1e-10)continue;
  const t=((p.x-a.x)*ez-(p.z-a.z)*ex)/det,u=((p.x-a.x)*dz-(p.z-a.z)*dx)/det;
  if(t>=-1e-5&&t<=1+1e-5&&u>=-1e-5&&u<=1+1e-5)hits.push({t,p:{x:a.x+t*dx,z:a.z+t*dz}});
 }
 if(!hits.length)throw Error('Channel does not intersect lake shore');return hits.sort((p,q)=>p.t-q.t)[0]!.p;
}

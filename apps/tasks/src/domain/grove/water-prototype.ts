/** Explicit synthetic routed-water fixture; never used as an annual fallback. */
import {buildFallMesh,type WorldMeshes,type WaterChunk} from './world-meshes';
import type {Channel,ChannelPoint} from './water';
export function buildWaterPrototype():WorldMeshes{
 const points:ChannelPoint[]=[{x:-2,z:0,waterElevation:10,cell:0,distance:0,width:2},{x:1,z:1,waterElevation:10,cell:1,distance:Math.sqrt(10),width:2},{x:4,z:4,waterElevation:10,cell:2,distance:Math.sqrt(10)+Math.sqrt(18),width:2},{x:4,z:8,waterElevation:4,cell:3,distance:Math.sqrt(10)+Math.sqrt(18)+4,width:2},{x:4,z:10,waterElevation:4,cell:4,distance:Math.sqrt(10)+Math.sqrt(18)+6,width:2}];
 const vertices:number[]=[],coords:number[]=[];
 for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),side=(p:ChannelPoint,d:number)=>({x:p.x-dz/len*d,y:p.waterElevation,z:p.z+dx/len*d,distance:p.distance,across:d}),left=side(a,1),right=side(a,-1),nextLeft=side(b,1),nextRight=side(b,-1);
  for(const p of [left,nextLeft,right,right,nextLeft,nextRight]){vertices.push(p.x,p.y,p.z);coords.push(p.distance,p.across);}
 }
 const channel:Channel={id:0,points,start:{type:'lake',id:0},end:{type:'lake',id:1},length:points.at(-1)!.distance,contributingArea:100,triangles:new Float32Array(vertices),shoreLoops:[]};
 const make=(id:number,kind:'lake'|'stream',p:Float32Array,flow?:Float32Array):WaterChunk=>{const phase=new Float32Array(p.length/3*2);for(let i=0;i<p.length/3;i++){phase[i*2]=p[i*3]!;phase[i*2+1]=p[i*3+2]!;}const xs=[...p].filter((_,i)=>i%3===0),ys=[...p].filter((_,i)=>i%3===1),zs=[...p].filter((_,i)=>i%3===2);return {id:kind+':prototype:'+id,kind,sourceId:id,chunkX:0,chunkZ:0,positions:p,flow:flow??phase.slice(),phase,sourceTriangles:Uint32Array.from({length:p.length/9},(_,i)=>i),bounds:{min:[Math.min(...xs),Math.min(...ys),Math.min(...zs)],max:[Math.max(...xs),Math.max(...ys),Math.max(...zs)]}};};
 const rect=(x0:number,z0:number,x1:number,z1:number,y:number)=>new Float32Array([x0,y,z0,x0,y,z1,x1,y,z0,x1,y,z0,x0,y,z1,x1,y,z1]);
 return {identity:'synthetic-water-prototype',chunkCells:32,terrain:[],water:[make(0,'lake',rect(-14,-6,-2,6,10)),make(1,'lake',rect(-2,10,10,20,4)),make(0,'stream',channel.triangles,new Float32Array(coords))],falls:[buildFallMesh(channel,{channelId:0,from:2,to:3,drop:6})]};
}

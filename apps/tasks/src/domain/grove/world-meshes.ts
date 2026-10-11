/** Worker-owned render geometry. Coordinates remain in geography units, with no cosmetic displacement. */
import type {AnnualWorld} from './world';
import {clipPolygon,terrainTriangleIds,type Channel,type Fall} from './water';
export type MeshBounds=Readonly<{min:readonly [number,number,number];max:readonly [number,number,number]}>;
export type TerrainChunk=Readonly<{id:string;cellX:number;cellZ:number;cellsX:number;cellsZ:number;positions:Float32Array;normals:Float32Array;colors:Float32Array;bounds:MeshBounds}>;
export type WaterChunk=Readonly<{id:string;kind:'lake'|'stream';sourceId:number;chunkX:number;chunkZ:number;sourceTriangles:Uint32Array;positions:Float32Array;flow:Float32Array;phase:Float32Array;bounds:MeshBounds}>;
export type FallMesh=Readonly<{id:string;channelId:number;from:number;to:number;positions:Float32Array;flow:Float32Array;phase:Float32Array;bounds:MeshBounds;foam:Float32Array}>;
export type WorldMeshes=Readonly<{identity:string;chunkCells:32;terrain:readonly TerrainChunk[];water:readonly WaterChunk[];falls:readonly FallMesh[]}>;
type Vertex={x:number;y:number;z:number;along:number;across:number};
const CHUNK=32;
function bounds(p:Float32Array):MeshBounds{const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++) {const k=i%3;min[k]=Math.min(min[k]!,p[i]!);max[k]=Math.max(max[k]!,p[i]!);}return {min,max};}
function attributes(vertices:readonly Vertex[]){const positions=new Float32Array(vertices.length*3),flow=new Float32Array(vertices.length*2),phase=new Float32Array(vertices.length*2);vertices.forEach((v,i)=>{positions.set([v.x,v.y,v.z],i*3);flow.set([v.along,v.across],i*2);phase.set([v.x,v.z],i*2);});return {positions,flow,phase,bounds:bounds(positions)};}
function channelFlow(c:Channel,x:number,z:number):[number,number]{
 let best=Infinity,along=0,across=0;
 for(let i=1;i<c.points.length;i++){const a=c.points[i-1]!,b=c.points[i]!,dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;if(den<1e-10)continue;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/den)),px=a.x+t*dx,pz=a.z+t*dz,d=(x-px)**2+(z-pz)**2;
  if(d<best){best=d;along=a.distance+(b.distance-a.distance)*t;across=((z-pz)*dx-(x-px)*dz)/Math.sqrt(den);}
 }return [along,across];
}
const interpolate=(a:Vertex,b:Vertex,t:number):Vertex=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,along:a.along+(b.along-a.along)*t,across:a.across+(b.across-a.across)*t});
function triangleArea(p:Float32Array):number{let a=0;for(let i=0;i<p.length;i+=9)a+=Math.abs((p[i+3]!-p[i]!)*(p[i+8]!-p[i+2]!)-(p[i+6]!-p[i]!)*(p[i+5]!-p[i+2]!))/2;return a;}
export function buildWorldMeshes(world:AnnualWorld):WorldMeshes{
 const terrain:TerrainChunk[]=[],water:WaterChunk[]=[],g=world.grid,bed=world.hydrology.bed;
 for(let cellZ=0;cellZ<g.size-1;cellZ+=CHUNK)for(let cellX=0;cellX<g.size-1;cellX+=CHUNK){
  const cellsX=Math.min(CHUNK,g.size-1-cellX),cellsZ=Math.min(CHUNK,g.size-1-cellZ),positions=new Float32Array(cellsX*cellsZ*18),normals=new Float32Array(positions.length),colors=new Float32Array(positions.length);let k=0;
  for(let z=cellZ;z<cellZ+cellsZ;z++)for(let x=cellX;x<cellX+cellsX;x++)for(const ids of terrainTriangleIds(g,x,z)){
   const points=ids.map(id=>[g.x0+id%g.size*g.step,bed[id]!,g.z0+Math.floor(id/g.size)*g.step]);
   const a=points[0]!,b=points[1]!,c=points[2]!,ux=b[0]!-a[0]!,uy=b[1]!-a[1]!,uz=b[2]!-a[2]!,vx=c[0]!-a[0]!,vy=c[1]!-a[1]!,vz=c[2]!-a[2]!;
   const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);
   for(const p of points){positions.set(p,k);normals.set([nx/length,ny/length,nz/length],k);const t=Math.max(0,Math.min(1,(p[1]!-5)/20));colors.set([.64-.26*t,.79-.23*t,.42-.14*t],k);k+=3;}
  }
  terrain.push({id:`terrain:${cellX/CHUNK}:${cellZ/CHUNK}`,cellX,cellZ,cellsX,cellsZ,positions,normals,colors,bounds:bounds(positions)});
 }
 const span=CHUNK*g.step,count=Math.ceil((g.size-1)/CHUNK);
 for(const [kind,descriptors] of [['lake',world.hydrology.lakes],['stream',world.hydrology.channels]] as const)for(const d of descriptors){
  const buckets=new Map<string,{chunkX:number;chunkZ:number;vertices:Vertex[];sources:number[]}>();
  for(let i=0;i<d.triangles.length;i+=9){const tri:Vertex[]=[];for(let j=0;j<9;j+=3){const x=d.triangles[i+j]!,y=d.triangles[i+j+1]!,z=d.triangles[i+j+2]!,flow=kind==='stream'?channelFlow(d as Channel,x,z):[x,z];tri.push({x,y,z,along:flow[0]!,across:flow[1]!});}
   const xs=tri.map(p=>p.x),zs=tri.map(p=>p.z),minX=Math.max(0,Math.floor((Math.min(...xs)-g.x0)/span)),maxX=Math.min(count-1,Math.floor((Math.max(...xs)-g.x0)/span)),minZ=Math.max(0,Math.floor((Math.min(...zs)-g.z0)/span)),maxZ=Math.min(count-1,Math.floor((Math.max(...zs)-g.z0)/span));
   for(let chunkZ=minZ;chunkZ<=maxZ;chunkZ++)for(let chunkX=minX;chunkX<=maxX;chunkX++){
    const x0=g.x0+chunkX*span,z0=g.z0+chunkZ*span,x1=Math.min(x0+span,g.x0+g.extent),z1=Math.min(z0+span,g.z0+g.extent);let polygon=tri;
    for(const distance of [(p:Vertex)=>p.x-x0,(p:Vertex)=>x1-p.x,(p:Vertex)=>p.z-z0,(p:Vertex)=>z1-p.z])polygon=clipPolygon(polygon,distance,interpolate);
    const key=`${chunkX}:${chunkZ}`;for(let j=1;j<polygon.length-1;j++){const a=polygon[0]!,b=polygon[j]!,c=polygon[j+1]!;if(Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z))<1e-10)continue;let bucket=buckets.get(key);if(!bucket){bucket={chunkX,chunkZ,vertices:[],sources:[]};buckets.set(key,bucket);}bucket.vertices.push(a,b,c);bucket.sources.push(i/9);}
   }
  }
  for(const {chunkX,chunkZ,vertices,sources} of buckets.values())water.push({id:`${kind}:${d.id}:${chunkX}:${chunkZ}`,kind,sourceId:d.id,chunkX,chunkZ,sourceTriangles:new Uint32Array(sources),...attributes(vertices)});
 }
 return {identity:world.identity,chunkCells:CHUNK,terrain,water,falls:world.hydrology.falls.map(f=>buildFallMesh(world.hydrology.channels[f.channelId]!,f))};
}
/** Positive validated routed drops only; receiving foam is a subset of the existing wet mask. */
export function buildFallMesh(channel:Channel,fall:Fall):FallMesh{
 const a=channel?.points[fall.from],b=channel?.points[fall.to];
 if(!channel||fall.channelId!==channel.id||!Number.isInteger(fall.from)||!Number.isInteger(fall.to)||fall.from<0||fall.to<=fall.from||fall.to>=channel.points.length-1||!a||!b||!Number.isFinite(fall.drop)||fall.drop<=0||Math.abs(a.waterElevation-b.waterElevation-fall.drop)>1e-5)throw Error('Invalid waterfall descriptor');
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(!Number.isFinite(length)||length<1e-8||![a.width,b.width,a.waterElevation,b.waterElevation,a.distance,b.distance].every(Number.isFinite)||a.width<=0||b.width<=0)throw Error('Invalid waterfall endpoints');
 const side=(index:number,s:number):Vertex=>{const p=channel.points[index]!,prev=channel.points[Math.max(0,index-1)]!,next=channel.points[Math.min(channel.points.length-1,index+1)]!,tx=next.x-prev.x,tz=next.z-prev.z,n=Math.hypot(tx,tz)||length;return {x:p.x-tz/n*p.width/2*s,y:p.waterElevation,z:p.z+tx/n*p.width/2*s,along:p.distance,across:p.width/2*s};};
 const al=side(fall.from,1),ar=side(fall.from,-1),bl=side(fall.to,1),br=side(fall.to,-1),foam:number[]=[];
 const radius=b.width*3;
 for(let i=0;i<channel.triangles.length;i+=9){let polygon:Vertex[]=[0,3,6].map(j=>({x:channel.triangles[i+j]!,y:channel.triangles[i+j+1]!,z:channel.triangles[i+j+2]!,along:0,across:0}));
  // Intersections retain the original wet mask; only the receiving level may carry foam.
  for(const distance of [(p:Vertex)=>p.x-(b.x-radius),(p:Vertex)=>b.x+radius-p.x,(p:Vertex)=>p.z-(b.z-radius),(p:Vertex)=>b.z+radius-p.z,(p:Vertex)=>p.y-b.waterElevation+1e-5,(p:Vertex)=>b.waterElevation+1e-5-p.y])polygon=clipPolygon(polygon,distance,interpolate);
  for(let j=1;j<polygon.length-1;j++){const p=polygon[0]!,q=polygon[j]!,r=polygon[j+1]!;if(Math.abs((q.x-p.x)*(r.z-p.z)-(r.x-p.x)*(q.z-p.z))<1e-10)continue;for(const v of [p,q,r])foam.push(v.x,v.y,v.z);}
 }
 return {id:`fall:${channel.id}:${fall.from}:${fall.to}`,channelId:channel.id,from:fall.from,to:fall.to,...attributes([al,bl,ar,ar,bl,br]),foam:new Float32Array(foam)};
}
export function meshBuffers(meshes:WorldMeshes):ArrayBuffer[]{return [...new Set([...meshes.terrain.flatMap(c=>[c.positions,c.normals,c.colors]),...meshes.water.flatMap(c=>[c.positions,c.flow,c.phase,c.sourceTriangles]),...meshes.falls.flatMap(c=>[c.positions,c.flow,c.phase,c.foam])].map(a=>a.buffer as ArrayBuffer))];}
/** Reject incomplete/detached payloads before allocating any scene resources. */
export function validateWorldMeshes(value:unknown,world:AnnualWorld):WorldMeshes{
 const m=value as WorldMeshes,fail=():never=>{throw Error('Invalid annual mesh output');},finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n),ids=new Set<string>(),buffers=new Set<ArrayBufferLike>();
 const array=(a:Float32Array,length?:number)=>{if(!(a instanceof Float32Array)||!(a.buffer instanceof ArrayBuffer)||!a.length||a.byteLength!==a.length*4||(length!==undefined&&a.length!==length)||!a.every(Number.isFinite)||a.byteOffset!==0||a.byteLength!==a.buffer.byteLength||buffers.has(a.buffer))fail();buffers.add(a.buffer);};
 const common=(c:TerrainChunk|WaterChunk|FallMesh)=>{if(!c||typeof c.id!=='string'||ids.has(c.id))fail();ids.add(c.id);array(c.positions);if(c.positions.length%9)fail();const b=bounds(c.positions);if(!c.bounds||!Array.isArray(c.bounds.min)||!Array.isArray(c.bounds.max)||c.bounds.min.length!==3||c.bounds.max.length!==3)fail();for(let i=0;i<3;i++)if(!finite(c.bounds.min[i])||!finite(c.bounds.max[i])||c.bounds.min[i]!==b.min[i]||c.bounds.max[i]!==b.max[i])fail();};
 if(!m||m.identity!==world.identity||m.chunkCells!==CHUNK||!Array.isArray(m.terrain)||!Array.isArray(m.water)||!Array.isArray(m.falls))fail();
 const g=world.grid,count=Math.ceil((g.size-1)/CHUNK),span=g.step*CHUNK;if(m.terrain.length!==count*count)fail();const cells=new Set<string>();
 for(const c of m.terrain){common(c);if(!Number.isInteger(c.cellX)||!Number.isInteger(c.cellZ)||c.cellX<0||c.cellZ<0||c.cellX>=g.size-1||c.cellZ>=g.size-1||c.cellX%CHUNK||c.cellZ%CHUNK||c.cellsX!==Math.min(CHUNK,g.size-1-c.cellX)||c.cellsZ!==Math.min(CHUNK,g.size-1-c.cellZ)||c.positions.length!==c.cellsX*c.cellsZ*18)fail();const key=`${c.cellX}:${c.cellZ}`;if(cells.has(key)||c.id!==`terrain:${c.cellX/CHUNK}:${c.cellZ/CHUNK}`)fail();cells.add(key);array(c.normals,c.positions.length);array(c.colors,c.positions.length);
  let k=0;for(let z=c.cellZ;z<c.cellZ+c.cellsZ;z++)for(let x=c.cellX;x<c.cellX+c.cellsX;x++)for(const tri of terrainTriangleIds(g,x,z))for(const id of tri){if(c.positions[k++]!==Math.fround(g.x0+id%g.size*g.step)||c.positions[k++]!==world.hydrology.bed[id]||c.positions[k++]!==Math.fround(g.z0+Math.floor(id/g.size)*g.step))fail();}
  for(let i=0;i<c.normals.length;i+=3)if(Math.abs(Math.hypot(c.normals[i]!,c.normals[i+1]!,c.normals[i+2]!)-1)>1e-5||c.normals[i+1]!<=0)fail();for(const v of c.colors)if(v<0||v>1)fail();
 }
 const areas=new Map<string,number>(),sourceAreas=new Map<string,Float64Array>();
 for(const c of m.water){common(c);if(c.kind!=='lake'&&c.kind!=='stream')fail();const source=(c.kind==='lake'?world.hydrology.lakes:world.hydrology.channels).find(d=>d.id===c.sourceId);if(!source||!Number.isInteger(c.chunkX)||!Number.isInteger(c.chunkZ)||c.chunkX<0||c.chunkZ<0||c.chunkX>=count||c.chunkZ>=count||c.id!==`${c.kind}:${c.sourceId}:${c.chunkX}:${c.chunkZ}`)fail();array(c.flow,c.positions.length/3*2);array(c.phase,c.flow.length);
  if(!(c.sourceTriangles instanceof Uint32Array)||!(c.sourceTriangles.buffer instanceof ArrayBuffer)||c.sourceTriangles.length!==c.positions.length/9||c.sourceTriangles.byteOffset!==0||c.sourceTriangles.byteLength!==c.sourceTriangles.buffer.byteLength||buffers.has(c.sourceTriangles.buffer))fail();buffers.add(c.sourceTriangles.buffer);
  const sourceKey=`${c.kind}:${c.sourceId}`;let conserved=sourceAreas.get(sourceKey);if(!conserved){conserved=new Float64Array(source!.triangles.length/9);sourceAreas.set(sourceKey,conserved);}
  for(let t=0;t<c.sourceTriangles.length;t++){
   const original=c.sourceTriangles[t]!;if(original>=source!.triangles.length/9)fail();const p=source!.triangles,o=original*9,ax=p[o]!,az=p[o+2]!,bx=p[o+3]!,bz=p[o+5]!,cx=p[o+6]!,cz=p[o+8]!,det=(bx-ax)*(cz-az)-(cx-ax)*(bz-az);if(Math.abs(det)<1e-10)fail();
   const coordinates=[0,3,6].map(j=>c.kind==='stream'?channelFlow(source as Channel,p[o+j]!,p[o+j+2]!):[p[o+j]!,p[o+j+2]!]);
   for(let j=0;j<3;j++){const v=t*3+j,x=c.positions[v*3]!,y=c.positions[v*3+1]!,z=c.positions[v*3+2]!,wb=((x-ax)*(cz-az)-(cx-ax)*(z-az))/det,wc=((bx-ax)*(z-az)-(x-ax)*(bz-az))/det,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)<-1e-3||Math.max(wa,wb,wc)>1.001||Math.abs(y-(wa*p[o+1]!+wb*p[o+4]!+wc*p[o+7]!))>1e-4)fail();
    for(let q=0;q<2;q++)if(Math.abs(c.flow[v*2+q]!-(wa*coordinates[0]![q]!+wb*coordinates[1]![q]!+wc*coordinates[2]![q]!))>1e-3)fail();
   }
   const k=t*9;conserved[original]=conserved[original]!+Math.abs((c.positions[k+3]!-c.positions[k]!)*(c.positions[k+8]!-c.positions[k+2]!)-(c.positions[k+6]!-c.positions[k]!)*(c.positions[k+5]!-c.positions[k+2]!))/2;
  }
  for(let i=0;i<c.positions.length/3;i++){const x=c.positions[i*3]!,y=c.positions[i*3+1]!,z=c.positions[i*3+2]!;if(x<g.x0+c.chunkX*span-1e-4||x>Math.min(g.x0+(c.chunkX+1)*span,g.x0+g.extent)+1e-4||z<g.z0+c.chunkZ*span-1e-4||z>Math.min(g.z0+(c.chunkZ+1)*span,g.z0+g.extent)+1e-4||c.phase[i*2]!==x||c.phase[i*2+1]!==z)fail();if(c.kind==='lake'&&Math.abs(y-(source as {waterElevation:number}).waterElevation)>1e-5)fail();if(c.kind==='stream'&&(c.flow[i*2]!<-.001||c.flow[i*2]!>(source as Channel).length+.001))fail();}
  const key=`${c.kind}:${c.sourceId}`;areas.set(key,(areas.get(key)||0)+triangleArea(c.positions));
 }
 for(const [kind,ds] of [['lake',world.hydrology.lakes],['stream',world.hydrology.channels]] as const)for(const d of ds){const expected=triangleArea(d.triangles);if(Math.abs((areas.get(`${kind}:${d.id}`)||0)-expected)>Math.max(.003,expected*1e-6))fail();}
 for(const [kind,ds] of [['lake',world.hydrology.lakes],['stream',world.hydrology.channels]] as const)for(const d of ds){const conserved=sourceAreas.get(`${kind}:${d.id}`);for(let i=0;i<d.triangles.length;i+=9){const p=d.triangles,expected=Math.abs((p[i+3]!-p[i]!)*(p[i+8]!-p[i+2]!)-(p[i+6]!-p[i]!)*(p[i+5]!-p[i+2]!))/2;if(Math.abs((conserved?.[i/9]||0)-expected)>Math.max(.0001,expected*1e-5))fail();}}
 if(m.falls.length!==world.hydrology.falls.length)fail();for(let i=0;i<m.falls.length;i++){const c=m.falls[i]!;common(c);const f=world.hydrology.falls[i]!,expected=buildFallMesh(world.hydrology.channels[f.channelId]!,f);if(c.id!==expected.id||c.channelId!==f.channelId||c.from!==f.from||c.to!==f.to)fail();array(c.flow,c.positions.length/3*2);array(c.phase,c.flow.length);if(!(c.foam instanceof Float32Array)||c.foam.length!==expected.foam.length)fail();if(c.foam.length)array(c.foam);for(const key of ['positions','flow','phase','foam'] as const)if(c[key].length!==expected[key].length||!c[key].every((v,j)=>v===expected[key][j]))fail();}
 for(const c of [...m.terrain,...m.water,...m.falls]){Object.freeze(c.bounds.min);Object.freeze(c.bounds.max);Object.freeze(c.bounds);Object.freeze(c);}Object.freeze(m.terrain);Object.freeze(m.water);Object.freeze(m.falls);return Object.freeze(m);
}

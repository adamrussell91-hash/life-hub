import {describe,it,expect,beforeAll,vi} from 'vitest';
import {generateAnnualWorld,type AnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {buildWorldMeshes,buildFallMesh,validateWorldMeshes,meshBuffers} from '@/domain/grove/world-meshes';
import {channelGeometry,pointInTriangle,type Channel} from '@/domain/grove/water';
vi.setConfig({testTimeout:30000});
const area=(p:Float32Array)=>{let a=0;for(let i=0;i<p.length;i+=9)a+=Math.abs((p[i+3]!-p[i]!)*(p[i+8]!-p[i+2]!)-(p[i+6]!-p[i]!)*(p[i+5]!-p[i+2]!))/2;return a;};
let world:AnnualWorld;beforeAll(()=>{world=generateAnnualWorld(worldKeyForYear(2026));});
describe('worker spatial meshes',()=>{
 it('partitions the final bed without changing geography, with matching seam samples',()=>{
  const m=buildWorldMeshes(world);expect(m.identity).toBe(world.identity);expect(m.terrain).toHaveLength(64);
  expect(m.terrain.reduce((n,c)=>n+c.positions.length/9,0)).toBe(256*256*2);
  for(const c of m.terrain){expect(c.positions.length).toBe(c.normals.length);expect(c.colors.length).toBe(c.positions.length);for(let i=0;i<c.positions.length;i+=3){const x=Math.round((c.positions[i]!-world.grid.x0)/world.grid.step),z=Math.round((c.positions[i+2]!-world.grid.z0)/world.grid.step);expect(c.positions[i+1]).toBe(world.hydrology.bed[z*world.grid.size+x]);}}
  expect(()=>validateWorldMeshes(m,world)).not.toThrow();expect(new Set(meshBuffers(m)).size).toBe(meshBuffers(m).length);
 });
 it('conserves the exact wet triangles and level lakes across chunk boundaries',()=>{
  const m=buildWorldMeshes(world);for(const [kind,ds] of [['lake',world.hydrology.lakes],['stream',world.hydrology.channels]] as const)for(const d of ds){const chunks=m.water.filter(c=>c.kind===kind&&c.sourceId===d.id);expect(chunks.reduce((a,c)=>a+area(c.positions),0)).toBeCloseTo(area(d.triangles),2);for(const c of chunks){expect(c.flow.length).toBe(c.positions.length/3*2);expect(c.phase.length).toBe(c.flow.length);for(let i=0;i<c.positions.length/3;i++){expect(c.phase[i*2]).toBe(c.positions[i*3]);expect(c.phase[i*2+1]).toBe(c.positions[i*3+2]);if(kind==='lake')expect(c.positions[i*3+1]).toBe(d.waterElevation);}}}
 });
 it('requires intact attributes, unique IDs, finite bounds and ownership',()=>{
  for(const alter of [(m:any)=>delete m.terrain,(m:any)=>m.terrain[0].normals=new Float32Array(3),(m:any)=>m.water[0].flow[0]=NaN,(m:any)=>m.terrain[0].bounds.min[0]=Infinity,(m:any)=>m.terrain[1].id=m.terrain[0].id]){const m=structuredClone(buildWorldMeshes(world));alter(m);expect(()=>validateWorldMeshes(m,world)).toThrow(/mesh/i);}
 });
});
const channel:Channel={id:0,points:[{cell:0,x:0,z:0,distance:0,width:2,waterElevation:5},{cell:1,x:5,z:0,distance:5,width:2,waterElevation:2},{cell:2,x:10,z:0,distance:10,width:2,waterElevation:2}],start:null,end:{type:'outlet',id:2},length:10,contributingArea:1,shoreLoops:[],triangles:new Float32Array([0,5,-1,0,5,1,5,2,-1,5,2,-1,0,5,1,5,2,1,5,2,-1,5,2,1,10,2,-1,10,2,-1,5,2,1,10,2,1])};
describe('routed waterfall fixture',()=>{
 it('joins actual endpoints and uses only existing receiving triangles for foam',()=>{const m=buildFallMesh(channel,{channelId:0,from:0,to:1,drop:3});expect(m.positions.length).toBe(18);expect(Array.from(m.positions).filter((_,i)=>i%3===1)).toEqual([5,2,5,5,2,2]);expect(m.foam.length).toBeGreaterThan(0);for(let i=1;i<m.foam.length;i+=3)expect(Math.abs(m.foam[i]!-2)).toBeLessThan(2e-5);});
 it.each([0,-3,NaN,4])('rejects invalid or inconsistent drop %s',(drop)=>expect(()=>buildFallMesh(channel,{channelId:0,from:0,to:1,drop})).toThrow(/fall/i));
});

describe('small spatial fixtures',()=>{
 const grid={size:65,extent:64,x0:0,z0:0,step:1};
 const ribbon:Channel={...channel,points:[{cell:0,x:0,z:31,distance:0,width:4,waterElevation:5},{cell:1,x:64,z:31,distance:64,width:4,waterElevation:1}],length:64,triangles:new Float32Array([0,5,29,64,1,29,0,5,33,0,5,33,64,1,29,64,1,33])};
 const fixture={identity:'fixture',grid,hydrology:{bed:new Float32Array(65*65),lakes:[],channels:[ribbon],falls:[]}} as unknown as AnnualWorld;
 it('clips a ribbon across both chunk planes with no lost area or flow discontinuity',()=>{
  const m=buildWorldMeshes(fixture);expect(m.water).toHaveLength(4);expect(m.water.reduce((sum,c)=>sum+area(c.positions),0)).toBe(256);
  const seam=new Map<string,string>();for(const c of m.water)for(let i=0;i<c.positions.length/3;i++){const x=c.positions[i*3]!,y=c.positions[i*3+1]!,z=c.positions[i*3+2]!;expect(c.flow[i*2]).toBeCloseTo(x,5);expect(c.flow[i*2+1]).toBeCloseTo(z-31,5);expect(y).toBeCloseTo(5-x/16,5);if(x===32||z===32){const key=`${x}:${z}`,value=`${y}:${c.flow[i*2]}:${c.flow[i*2+1]}`;if(seam.has(key))expect(value).toBe(seam.get(key));else seam.set(key,value);}}
  expect(()=>validateWorldMeshes(m,fixture)).not.toThrow();
 });
 it('rejects finite corruption of mask positions and interpolated coordinates',()=>{
  for(const alter of [(m:any)=>m.water[0].positions[1]+=.1,(m:any)=>m.water[0].flow[0]+=1,(m:any)=>m.water[0].sourceTriangles[0]=999]){const m=buildWorldMeshes(fixture);alter(m);expect(()=>validateWorldMeshes(m,fixture)).toThrow(/mesh/i);}
 });
});


describe('review regressions',()=>{
 it('rejects duplicated half triangles even when source area is conserved',()=>{
  const grid={size:33,extent:32,x0:0,z0:0,step:1},triangles=new Float32Array([0,2,0,10,2,0,0,2,10]);
  const fixture={identity:'overlap',grid,hydrology:{bed:new Float32Array(33*33),lakes:[{id:0,waterElevation:2,triangles}],channels:[],falls:[]}} as unknown as AnnualWorld;
  const m=buildWorldMeshes(fixture),c=m.water[0]!;
  // Two overlapping half-triangles omit the opposite half but sum to the original area.
  const positions=new Float32Array([0,2,0,10,2,0,0,2,5,0,2,0,10,2,0,0,2,5]);
  const flow=new Float32Array([0,0,10,0,0,5,0,0,10,0,0,5]);
  const forged={...m,water:[{...c,positions,flow,phase:flow.slice(),sourceTriangles:new Uint32Array([0,0]),bounds:{min:[0,2,0],max:[10,2,5]}}]};
  expect(area(positions)).toBe(area(triangles));expect(()=>validateWorldMeshes(forged,fixture)).toThrow(/mesh/i);
 });
 it('joins clipped narrow-bank water at both fall endpoints',()=>{
  const grid={size:17,extent:16,x0:0,z0:-8,step:1},bed=new Float32Array(17*17);
  for(let z=0;z<17;z++)for(let x=0;x<17;x++)bed[z*17+x]=Math.abs(z-8)<=1?0:20;
  const triangles=channelGeometry(grid,bed,[{cell:0,x:2,z:0,distance:0,width:8,waterElevation:5},{cell:1,x:8,z:0,distance:6,width:8,waterElevation:2},{cell:2,x:14,z:0,distance:12,width:8,waterElevation:2}]);
  const narrow={...channel,points:[{cell:0,x:2,z:0,distance:0,width:8,waterElevation:5},{cell:1,x:8,z:0,distance:6,width:8,waterElevation:2},{cell:2,x:14,z:0,distance:12,width:8,waterElevation:2}],length:12,triangles};
  const mesh=buildFallMesh(narrow,{channelId:0,from:0,to:1,drop:3});
  for(let i=0;i<mesh.positions.length;i+=3){const x=mesh.positions[i]!,y=mesh.positions[i+1]!,z=mesh.positions[i+2]!;expect(Math.abs(z)).toBeLessThan(2);let wet=false;for(let k=0;k<triangles.length;k+=9){const a={x:triangles[k]!,z:triangles[k+2]!},b={x:triangles[k+3]!,z:triangles[k+5]!},c={x:triangles[k+6]!,z:triangles[k+8]!};const det=(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z),wb=((x-a.x)*(c.z-a.z)-(c.x-a.x)*(z-a.z))/det,wc=((b.x-a.x)*(z-a.z)-(x-a.x)*(b.z-a.z))/det,surface=(1-wb-wc)*triangles[k+1]!+wb*triangles[k+4]!+wc*triangles[k+7]!;if(pointInTriangle(x,z,a,b,c)&&Math.abs(surface-y)<2e-5)wet=true;}expect(wet).toBe(true);}
 });
 it('omits unsupported dry endpoint falls without failing annual mesh delivery',()=>{
  const grid={size:33,extent:32,x0:0,z0:0,step:1},dry={...channel,triangles:new Float32Array([5,2,0,5,2,1,10,2,0])};
  const fixture={identity:'unsupported',grid,hydrology:{bed:new Float32Array(33*33),lakes:[],channels:[dry],falls:[{channelId:0,from:0,to:1,drop:3}]}} as unknown as AnnualWorld;
  expect(()=>buildFallMesh(dry,fixture.hydrology.falls[0]!)).toThrow(/fall/i);const m=buildWorldMeshes(fixture);expect(m.falls).toEqual([]);expect(()=>validateWorldMeshes(m,fixture)).not.toThrow();
 });
});

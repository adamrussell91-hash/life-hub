import {it,expect} from 'vitest';
import {lakeGeometry,shoreLoops,channelGeometry,pointInTriangle} from '@/domain/grove/water';
import {sampleGeography,isLandPathSafe} from '@/domain/grove/geography';
import {sampleBedGrid,type AnnualWorld} from '@/domain/grove/world';
it('owns conservative wet classification at a saddle where bilinear and faceted beds differ',()=>{
 const grid={size:2,extent:1,x0:0,z0:0,step:1},bed=new Float32Array([8,0,0,8]),level=new Float32Array(4).fill(3),lakeId=new Int32Array([-1,0,0,-1]);
 const triangles=lakeGeometry(grid,bed,lakeId,level,1)[0]!;
 const w={key:{year:2026,generatorVersion:1},identity:'fixture',grid,bed,basins:[],meadows:[],generation:{attempt:0,fallback:false,hydrologyVersion:1},summary:{minHeight:0,maxHeight:8,bedBytes:16},hydrology:{recipeVersion:1,bed,gradedBed:bed,gradingPasses:0,level,lakeId,receiver:new Int32Array(4).fill(-1),order:new Int32Array([0,1,2,3]),outlets:new Int32Array([0,1,2,3]),accumulation:new Uint32Array(4).fill(1),lakes:[{id:0,waterElevation:3,cells:[1,2],outletCell:1,downstreamReceiver:0,triangles,shoreLoops:shoreLoops(triangles)}],channels:[],falls:[],quality:{dryFraction:.5,channelLength:0,substantialLakes:0}}} as AnnualWorld;
 const wet=sampleGeography(w,.5,.5);expect(wet.bedElevation).toBe(4);expect(wet.waterType).toBe('lake');expect(wet.waterDepth).toBe(0);expect(sampleGeography(w,0,0).waterType).toBe('dry');
 expect(isLandPathSafe(w,[{x:0,z:0},{x:1,z:1}],100)).toBe(false);
});
it('clips a broad stream ribbon against banks rather than putting water through them',()=>{
 const grid={size:3,extent:2,x0:0,z0:0,step:1},bed=new Float32Array([4,4,4,0,0,0,4,4,4]);
 const triangles=channelGeometry(grid,bed,[{x:.25,z:1,waterElevation:1,cell:3,distance:0,width:1.5},{x:1.75,z:1,waterElevation:1,cell:5,distance:1.5,width:1.5}]);
 expect(triangles.length).toBeGreaterThan(0);
 for(let i=0;i<triangles.length;i+=3){expect(triangles[i+2]).toBeGreaterThanOrEqual(.74999);expect(triangles[i+2]).toBeLessThanOrEqual(1.25001);expect(sampleBedGrid(grid,bed,triangles[i]!,triangles[i+2]!)).toBeLessThanOrEqual(1.0001);}
 let centre=false;for(let i=0;i<triangles.length;i+=9)centre ||=pointInTriangle(1,1,{x:triangles[i]!,z:triangles[i+2]!},{x:triangles[i+3]!,z:triangles[i+5]!},{x:triangles[i+6]!,z:triangles[i+8]!});expect(centre).toBe(true);
});

it('rejects crossing a clipped stream narrower than the land-path sample interval',()=>{
 const grid={size:3,extent:1,x0:0,z0:0,step:.5},bed=new Float32Array([4,0,4,4,0,4,4,0,4]);
 const points=[{x:.5,z:.1,waterElevation:.04,cell:1,distance:0,width:1.4},{x:.5,z:.9,waterElevation:.04,cell:7,distance:.8,width:1.4}],triangles=channelGeometry(grid,bed,points);
 const w={grid,hydrology:{bed,receiver:new Int32Array(9).fill(-1),lakes:[],channels:[{id:0,points,triangles,shoreLoops:shoreLoops(triangles)}]}} as unknown as AnnualWorld;
 const a={x:.45,z:.5},b={x:.55,z:.5};expect(sampleGeography(w,a.x,a.z).waterType).toBe('dry');expect(sampleGeography(w,b.x,b.z).waterType).toBe('dry');expect(sampleGeography(w,.5,.5).waterType).toBe('stream');expect(isLandPathSafe(w,[a,b],100)).toBe(false);
});

import {describe,it,expect,vi} from 'vitest';
import {annualLandPath,isAnnualLandPathSafe,isSwimPathSafe,annualSwimPath,annualAnimalHeight} from '@/domain/grove/annual-wildlife';
import {generateAnnualWorld,type AnnualWorld} from '@/domain/grove/world';
import {worldKeyForYear} from '@/domain/grove/world-key';
import {isLandPathSafe} from '@/domain/grove/geography';
vi.setConfig({testTimeout:30000});
function fixture(rects:number[][],slope=0):AnnualWorld {
 const triangles=rects.flatMap(([x0,z0,x1,z1])=>[x0!,2,z0!,x1!,2,z0!,x1!,2,z1!,x0!,2,z0!,x1!,2,z1!,x0!,2,z1!]);
 return {grid:{size:3,step:5,extent:10,x0:0,z0:0},hydrology:{bed:new Float32Array([0,5*slope,10*slope,0,5*slope,10*slope,0,5*slope,10*slope]),receiver:new Int32Array(9).fill(-1),lakes:[{id:0,triangles:new Float32Array(triangles),shoreLoops:[]}],channels:[]}} as unknown as AnnualWorld;
}
describe('annual wildlife safety',()=>{
 it('constructs a real annual dry route near the meadow and checks every segment',()=>{
  const w=generateAnnualWorld(worldKeyForYear(2026)),m=w.meadows[0]!,path=annualLandPath(w,'hare',m.cx,m.cz);
  expect(path.length).toBeGreaterThan(1);expect(isLandPathSafe(w,path,.5)).toBe(true);
 });
 it('rejects steep land, intervening obstacles and a narrow wet crossing',()=>{
  const path=[{x:1,z:5},{x:9,z:5}];
  expect(isAnnualLandPathSafe(fixture([],.6),path)).toBe(false);
  expect(isAnnualLandPathSafe(fixture([]),path,[{x:5,z:5}])).toBe(false);
  expect(isAnnualLandPathSafe(fixture([[4.999,0,5.001,10]]),path)).toBe(false);
 });
 it('requires continuous water coverage, including gaps too narrow for sampling',()=>{
  const path=[{x:1,z:5},{x:9,z:5}];
  expect(isSwimPathSafe(fixture([[0,0,5,10],[5,0,10,10]]),path)).toBe(true);
  expect(isSwimPathSafe(fixture([[0,0,4.999,10],[5.001,0,10,10]]),path)).toBe(false);
 });
 it('finds only nearby real lake or channel routes',()=>{
  const w=fixture([[3,3,7,7]]),p=annualSwimPath(w,5,5);
  expect(p.length).toBeGreaterThan(1);expect(isSwimPathSafe(w,p)).toBe(true);
  expect(annualSwimPath(fixture([]),5,5)).toEqual([]);
 });
 it('uses actual water elevation, vertical world scale and baby authored waterline scale',()=>{
  const w=fixture([[0,0,10,10]]);
  expect(annualAnimalHeight(w,5,5,true,.3,.5,2)).toBeCloseTo(3.85);
 });
});

import {createAnnualAnimals} from '@/views/grove/annual-animals';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
it('keeps a future selected focus empty without requesting authored assets',async()=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 const world={...fixture([]),key:worldKeyForYear(2026)};
 const plan={days:[{key:'2026-10-12',future:true,worldYear:2026,cx:5,cz:5}],wildlife:[{species:'hare',earnedOn:'2026-10-10',baby:true}]} as unknown as AnnualGrovePlan;
 const animals=await createAnnualAnimals(world,plan,'2026-10-12');
 expect(animals.count).toBe(0);expect(animals.root.children).toHaveLength(0);expect(fetchSpy).not.toHaveBeenCalled();animals.dispose();fetchSpy.mockRestore();
});
it('keeps milestones earned after selected history out of that focus',async()=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 const world={...fixture([]),key:worldKeyForYear(2026)};
 const plan={days:[{key:'2026-10-09',future:false,worldYear:2026,cx:5,cz:5}],wildlife:[{species:'hare',earnedOn:'2026-10-10',baby:true}]} as unknown as AnnualGrovePlan;
 const animals=await createAnnualAnimals(world,plan,'2026-10-09');expect(animals.count).toBe(0);expect(fetchSpy).not.toHaveBeenCalled();animals.dispose();fetchSpy.mockRestore();
});
it('searches authored channel triangles as well as lakes',()=>{
 const lake=fixture([[3,3,7,7]]),world={...lake,hydrology:{...lake.hydrology,lakes:[],channels:lake.hydrology.lakes}} as unknown as AnnualWorld;
 const path=annualSwimPath(world,5,5);expect(path.length).toBeGreaterThan(1);expect(isSwimPathSafe(world,path)).toBe(true);
});

import {AnimationMixer,Group,Mesh,BoxGeometry,MeshStandardMaterial,Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
it('caps babies with adults, freezes mixers at delta zero and releases shared model resources once',async()=>{
 const texture=new Texture(),material=new MeshStandardMaterial({map:texture}),geometry=new BoxGeometry(),source=new Group();source.add(new Mesh(geometry,material));
 const load=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source,animations:[]} as never);
 const fetchSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({assets:[{id:'animal-rabbit-hare',file:'hare.glb',roles:{},waterline:0,credit:'Animal artist'}]})} as Response);
 const mixer=vi.spyOn(AnimationMixer.prototype,'update'),geometryDispose=vi.spyOn(geometry,'dispose'),materialDispose=vi.spyOn(material,'dispose'),textureDispose=vi.spyOn(texture,'dispose');
 const world={...fixture([]),key:worldKeyForYear(2026)},plan={days:[{key:'2026-10-09',future:false,worldYear:2026,cx:5,cz:5}],contextTrees:[],wildlife:Array.from({length:5},()=>({species:'hare',earnedOn:'2026-10-08',baby:true}))} as unknown as AnnualGrovePlan;
 try{
  const animals=await createAnnualAnimals(world,plan,'2026-10-09');expect(animals.count).toBe(9);expect(animals.credits).toEqual(['Animal artist']);
  animals.update(0,0);expect(mixer).not.toHaveBeenCalled();animals.update(1,.016);expect(mixer).toHaveBeenCalledTimes(9);
  animals.dispose();animals.dispose();expect(geometryDispose).toHaveBeenCalledTimes(1);expect(materialDispose).toHaveBeenCalledTimes(1);expect(textureDispose).toHaveBeenCalledTimes(1);expect(animals.root.children).toHaveLength(0);
 }finally{load.mockRestore();fetchSpy.mockRestore();mixer.mockRestore();}
});

it.each([{}, {assets:null}, {assets:{}}, {assets:[null]}])('degrades malformed catalogue %j to unavailable wildlife without rejecting the scene',async catalogue=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>catalogue} as Response);
 const world={...fixture([]),key:worldKeyForYear(2026)},plan={days:[{key:'2026-10-09',future:false,worldYear:2026,cx:5,cz:5}],contextTrees:[],wildlife:[{species:'hare',earnedOn:'2026-10-08',baby:false}]} as unknown as AnnualGrovePlan;
 try{const animals=await createAnnualAnimals(world,plan,'2026-10-09');expect(animals.count).toBe(0);expect(animals.missing).toContain('hare: asset unavailable');animals.dispose();}finally{fetchSpy.mockRestore();}
});

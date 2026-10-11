import {afterEach,describe,it,expect,vi} from 'vitest';
import {BoxGeometry,Group,Matrix4,Mesh,MeshStandardMaterial,Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAnnualTrees,createAnnualTreeLibrary} from '@/views/grove/annual-trees';
import type {AnnualTree} from '@/domain/grove/planting';

afterEach(()=>vi.restoreAllMocks());
function fixture(){
 const texture=new Texture(),material=new MeshStandardMaterial({color:0x427f42,map:texture,roughness:.9}),geometry=new BoxGeometry(1,6,1),source=new Group();source.add(new Mesh(geometry,material));
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source,animations:[]} as never);
 const trees=['selected','context'].map((id,i)=>({id,species:'life',variant:1,x:i*4,z:0,height:2,worldYear:2026,scale:1,rotation:0})) as AnnualTree[];
 return {texture,material,geometry,trees};
}
describe('authored annual tree emphasis and wind',()=>{
 it('keeps selected original colours and makes context quieter without mutating shared source materials',async()=>{
  const f=fixture(),disposeMaterial=vi.spyOn(f.material,'dispose'),disposeTexture=vi.spyOn(f.texture,'dispose'),disposeGeometry=vi.spyOn(f.geometry,'dispose');
  const result=await createAnnualTrees(f.trees,()=>0,1,new Set(['selected']));
  try{
   expect(result.ids).toEqual(new Set(['selected','context']));expect(result.batches).toHaveLength(2);
   const selected=result.batches.find(b=>b.trees[0]?.id==='selected')!,context=result.batches.find(b=>b.trees[0]?.id==='context')!;
   const selectedMaterial=selected.mesh.material as MeshStandardMaterial,contextMaterial=context.mesh.material as MeshStandardMaterial;
   expect(selectedMaterial.color.getHex()).toBe(0x427f42);expect(contextMaterial.color.getHex()).not.toBe(0x427f42);
   const transform=new Matrix4();selected.mesh.getMatrixAt(0,transform);expect(transform.elements[12]).toBe(0);expect(transform.elements[13]).toBeCloseTo(2.01);
   context.mesh.getMatrixAt(0,transform);expect(transform.elements[12]).toBe(4);expect(transform.elements[13]).toBeCloseTo(2.01);
   expect(contextMaterial.color.getHSL({h:0,s:0,l:0}).s).toBeLessThan(selectedMaterial.color.getHSL({h:0,s:0,l:0}).s);
   expect(f.material.color.getHex()).toBe(0x427f42);expect(contextMaterial.map).toBe(f.texture);expect(contextMaterial.roughness).toBe(.9);
   const clonedDispose=vi.spyOn(contextMaterial,'dispose');result.dispose();result.dispose();expect(clonedDispose).toHaveBeenCalledTimes(1);
   expect(disposeMaterial).toHaveBeenCalledTimes(1);expect(disposeTexture).toHaveBeenCalledTimes(1);expect(disposeGeometry).toHaveBeenCalledTimes(1);
  }finally{result.dispose();}
 });
 it('keeps the GPU wind phase bounded and continuous after long elapsed sessions',async()=>{
  const f=fixture(),result=await createAnnualTrees(f.trees,()=>0);
  try{
   const shader={uniforms:{} as Record<string,{value:number}>,vertexShader:'#include <begin_vertex>'};
   (result.batches[0]!.mesh.material as MeshStandardMaterial).onBeforeCompile(shader as never,{} as never);
   result.update(1e12);expect(shader.uniforms.groveWind!.value).toBeGreaterThanOrEqual(0);expect(shader.uniforms.groveWind!.value).toBeLessThan(2*Math.PI/.8);
   const period=2*Math.PI/.8;result.update(period-1e-6);const before=Math.sin(shader.uniforms.groveWind!.value*.8+.37);
   result.update(period+1e-6);expect(Math.sin(shader.uniforms.groveWind!.value*.8+.37)).toBeCloseTo(before,5);
   result.update(2.5);const early=shader.uniforms.groveWind!.value;result.update(2.5+period*1000000);expect(Math.sin(shader.uniforms.groveWind!.value*.8)).toBeCloseTo(Math.sin(early*.8),8);
  }finally{result.dispose();}
 });
});

describe('scene-owned annual tree library',()=>{
 it('bounds the cache to 25 model files and isolates renderer libraries',async()=>{
  const f=fixture(),library=createAnnualTreeLibrary();
  for(let variant=1;variant<=26;variant++){const snapshot=await createAnnualTrees([{...f.trees[0]!,variant}],()=>0,1,undefined,library);expect(snapshot.ids.size).toBe(variant<=25?1:0);snapshot.dispose();}
  expect(GLTFLoader.prototype.loadAsync).toHaveBeenCalledTimes(25);
  library.dispose();const next=createAnnualTreeLibrary(),snapshot=await createAnnualTrees(f.trees,()=>0,1,undefined,next);
  expect(GLTFLoader.prototype.loadAsync).toHaveBeenCalledTimes(26);snapshot.dispose();next.dispose();
 });

 it('reuses decoded geometry and emphasis materials across changed subsets and releases only at library disposal',async()=>{
  const f=fixture(),library=createAnnualTreeLibrary(),gd=vi.spyOn(f.geometry,'dispose'),td=vi.spyOn(f.texture,'dispose');
  const first=await createAnnualTrees(f.trees,()=>0,1,new Set(['selected']),library);
  const materials=first.batches.map(b=>b.mesh.material),md=vi.spyOn(materials[0] as MeshStandardMaterial,'dispose'),instanceDispose=vi.spyOn(first.batches[0]!.mesh,'dispose');
  first.dispose();first.dispose();
  expect(instanceDispose).toHaveBeenCalledTimes(1);expect(gd).not.toHaveBeenCalled();expect(td).not.toHaveBeenCalled();expect(md).not.toHaveBeenCalled();
  const second=await createAnnualTrees(f.trees.map(t=>({...t,id:t.id+'2'})),()=>12,2,new Set(['selected2']),library);
  expect(GLTFLoader.prototype.loadAsync).toHaveBeenCalledTimes(1);
  second.batches.forEach((b,i)=>expect(b.mesh.material).toBe(materials[i]));
  const matrix=new Matrix4();second.batches[0]!.mesh.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(12);expect(matrix.elements[13]).toBeCloseTo(4.01);expect(second.batches[0]!.mesh.geometry).toBe(f.geometry);
  const a={uniforms:{},vertexShader:'#include <begin_vertex>'},b={uniforms:{},vertexShader:'#include <begin_vertex>'};
  (materials[0] as MeshStandardMaterial).onBeforeCompile(a as never,{} as never);(materials[1] as MeshStandardMaterial).onBeforeCompile(b as never,{} as never);
  expect((a.uniforms as any).groveWind).toBe((b.uniforms as any).groveWind);
  second.dispose();library.dispose();library.dispose();expect(gd).toHaveBeenCalledTimes(1);expect(td).toHaveBeenCalledTimes(1);expect(md).toHaveBeenCalledTimes(1);
 });
 it('deduplicates pending loads and releases late sources without attaching stale batches',async()=>{
  const f=fixture(),library=createAnnualTreeLibrary(),gd=vi.spyOn(f.geometry,'dispose'),td=vi.spyOn(f.texture,'dispose');
  let finish!:(value:any)=>void;vi.mocked(GLTFLoader.prototype.loadAsync).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const first=createAnnualTrees(f.trees,()=>0,1,undefined,library),second=createAnnualTrees(f.trees,()=>0,1,undefined,library);
  library.dispose();const source=new Group();source.add(new Mesh(f.geometry,f.material));finish({scene:source});
  for(const result of await Promise.all([first,second])){expect(result.ids.size).toBe(0);expect(result.batches).toHaveLength(0);result.dispose();}
  expect(GLTFLoader.prototype.loadAsync).toHaveBeenCalledTimes(1);expect(gd).toHaveBeenCalledTimes(1);expect(td).toHaveBeenCalledTimes(1);
 });
 it('retains failed silhouettes while other files load, and bounds snapshots to 64 trees',async()=>{
  const f=fixture(),library=createAnnualTreeLibrary();vi.mocked(GLTFLoader.prototype.loadAsync).mockRejectedValueOnce(new Error('missing'));
  const missing=await createAnnualTrees(f.trees,()=>0,1,undefined,library);expect(missing.ids.size).toBe(0);
  const trees=Array.from({length:80},(_,i)=>({...f.trees[0]!,id:String(i),variant:2}));
  const loaded=await createAnnualTrees(trees,()=>0,1,undefined,library);expect(loaded.ids.size).toBe(64);expect(loaded.batches[0]!.mesh.count).toBe(64);
  const retry=await createAnnualTrees(f.trees,()=>0,1,undefined,library);expect(retry.ids.size).toBe(2);expect(GLTFLoader.prototype.loadAsync).toHaveBeenCalledTimes(3);
  missing.dispose();loaded.dispose();retry.dispose();library.dispose();
 });
});

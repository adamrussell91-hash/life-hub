import {afterEach,describe,it,expect,vi} from 'vitest';
import {BoxGeometry,Group,Matrix4,Mesh,MeshStandardMaterial,Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAnnualTrees} from '@/views/grove/annual-trees';
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

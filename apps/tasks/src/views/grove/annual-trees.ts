/** Authored near trees share model parts; distant history remains inexpensive silhouettes. */
import {Color,Group,Object3D,InstancedMesh,Material,Matrix4,BufferGeometry} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {treeModelFile} from '@/domain/grove/assets';
import type {AnnualTree} from '@/domain/grove/planting';
import {groveAssetUrl} from './asset-url';

type TreePart={geometry:InstanceType<typeof BufferGeometry>;matrix:InstanceType<typeof Matrix4>;materials:InstanceType<typeof Material>[][];arrayMaterial:boolean};
/** One bank per renderer. Snapshots borrow its model resources; dispose after all snapshots. */
export function createAnnualTreeLibrary(){
 const wind={value:0},loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 const cache=new Map<string,Promise<TreePart[]>>(),sources:InstanceType<typeof Object3D>[]=[],clones:InstanceType<typeof Material>[]=[];
 const released=new WeakSet<object>();let disposed=false;
 function releaseMaterial(m:InstanceType<typeof Material>){
  if(released.has(m))return;released.add(m);
  for(const v of Object.values(m))if(v&&typeof v==='object'&&(v as {isTexture?:boolean}).isTexture&&!released.has(v)){released.add(v);(v as {dispose():void}).dispose();}
  m.dispose();
 }
 function releaseSource(source:InstanceType<typeof Object3D>){source.traverse((n:InstanceType<typeof Object3D>)=>{
  if(n.geometry&&!released.has(n.geometry)){released.add(n.geometry);n.geometry.dispose();}
  for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[])releaseMaterial(m);
 });}
 return {
  get disposed(){return disposed;},
  load(file:string):Promise<TreePart[]>{
   if(disposed)return Promise.resolve([]);
   const existing=cache.get(file);if(existing)return existing;
   // The mature catalogue contains 25 models. Bound even malformed caller inputs.
   if(cache.size>=25)return Promise.resolve([]);
   const job=(async()=>{let source:InstanceType<typeof Object3D>|undefined;const modelClones:InstanceType<typeof Material>[]=[];try{
    source=(await loader.loadAsync(groveAssetUrl(file))).scene;
    if(disposed){releaseSource(source);return [];}
    source.updateMatrixWorld(true);const parts:TreePart[]=[];
    source.traverse((part:InstanceType<typeof Object3D>)=>{
     if(!part.isMesh)return;part.geometry.computeBoundingBox();
     const height=Math.max(.1,part.geometry.boundingBox.max.y-part.geometry.boundingBox.min.y),base=part.geometry.boundingBox.min.y;
     const originals=Array.isArray(part.material)?part.material:[part.material];
     const materials=[0,1].map(context=>originals.map((original:InstanceType<typeof Material>)=>{
     const material=original.clone();if(context&&material.color)material.color.lerp(new Color('#a2b3a2'),.65);
     material.onBeforeCompile=(shader:{uniforms:Record<string,unknown>;vertexShader:string})=>{shader.uniforms.groveWind=wind;shader.vertexShader='uniform float groveWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat groveTip=clamp((position.y-('+base.toFixed(6)+'))/'+height.toFixed(6)+',0.0,1.0);\ntransformed.x += sin(groveWind*0.8 + instanceMatrix[3].x*0.13)*groveTip*groveTip*'+(height*.025).toFixed(6)+';');};material.customProgramCacheKey=()=> 'grove-wind-'+base+'-'+height;modelClones.push(material);return material;

     }));
     parts.push({geometry:part.geometry,matrix:part.matrixWorld.clone(),materials,arrayMaterial:Array.isArray(part.material)});
    });sources.push(source);clones.push(...modelClones);return parts;
   }catch{for(const m of modelClones)releaseMaterial(m);if(source)releaseSource(source);cache.delete(file);return [];}})();
   cache.set(file,job);return job;
  },
  update(seconds:number){const period=2*Math.PI/.8;wind.value=seconds%period;},
  dispose(){if(disposed)return;disposed=true;for(const m of clones)releaseMaterial(m);for(const s of sources)releaseSource(s);clones.length=0;sources.length=0;cache.clear();}
 };
}
export type AnnualTreeLibrary=ReturnType<typeof createAnnualTreeLibrary>;
export async function createAnnualTrees(trees:readonly AnnualTree[],offset:(year:number)=>number,heightScale=1,selectedIds?:ReadonlySet<string>,library?:AnnualTreeLibrary){
 const bank=library??createAnnualTreeLibrary(),root=new Group(),batches:{mesh:InstanceType<typeof InstancedMesh>;trees:AnnualTree[]}[]=[],ids=new Set<string>(),groups=new Map<string,AnnualTree[]>();
 for(const t of trees.slice(0,64)){const file=treeModelFile(t.species,t.variant),list=groups.get(file)??[];list.push(t);groups.set(file,list);}
 await Promise.all([...groups].map(async([file,list])=>{
  const parts=await bank.load(file);if(bank.disposed||!parts.length)return;
  const emphasis=[list.filter(t=>!selectedIds||selectedIds.has(t.id)),list.filter(t=>selectedIds&&!selectedIds.has(t.id))];
  for(const part of parts)for(const [context,subset] of emphasis.entries()){if(!subset.length)continue;
   const materials=part.materials[context]!;
   const mesh=new InstancedMesh(part.geometry,part.arrayMaterial?materials:materials[0],subset.length),dummy=new Object3D();
   subset.forEach((t,i)=>{dummy.position.set(t.x+offset(t.worldYear),t.height*heightScale+.01,t.z);dummy.rotation.y=t.rotation;dummy.scale.setScalar(t.scale);dummy.updateMatrix();mesh.setMatrixAt(i,new Matrix4().multiplyMatrices(dummy.matrix,part.matrix));});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);batches.push({mesh,trees:subset});
  }
  for(const t of list)ids.add(t.id);
 }));
 // Disposal can happen after one file's batches were created while another file was pending.
 if(bank.disposed){for(const b of batches)b.mesh.dispose();batches.length=0;ids.clear();root.clear();}
 let disposed=false;return {root,batches,ids,update(seconds:number){if(!disposed)bank.update(seconds);},dispose(){if(disposed)return;disposed=true;for(const b of batches)b.mesh.dispose();root.clear();if(!library)bank.dispose();}};
}

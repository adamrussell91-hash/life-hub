/** Authored near trees share model parts; distant history remains inexpensive silhouettes. */
import {Color,Group,Object3D,InstancedMesh,Material,Matrix4} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {treeModelFile} from '@/domain/grove/assets';
import type {AnnualTree} from '@/domain/grove/planting';
import {groveAssetUrl} from './asset-url';
export async function createAnnualTrees(trees:readonly AnnualTree[],offset:(year:number)=>number,heightScale=1,selectedIds?:ReadonlySet<string>){
 const wind={value:0};const root=new Group(),batches:{mesh:InstanceType<typeof InstancedMesh>;trees:AnnualTree[]}[]=[],ids=new Set<string>(),sources:InstanceType<typeof Object3D>[]=[],loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),groups=new Map<string,AnnualTree[]>();
 for(const t of trees.slice(0,64)){const file=treeModelFile(t.species,t.variant),list=groups.get(file)??[];list.push(t);groups.set(file,list);}
 await Promise.all([...groups].map(async([file,list])=>{try{
  const source=(await loader.loadAsync(groveAssetUrl(file))).scene;source.updateMatrixWorld(true);sources.push(source);
  const emphasis=[list.filter(t=>!selectedIds||selectedIds.has(t.id)),list.filter(t=>selectedIds&&!selectedIds.has(t.id))];
  source.traverse((part:InstanceType<typeof Object3D>)=>{if(!part.isMesh)return;part.geometry.computeBoundingBox();const height=Math.max(.1,part.geometry.boundingBox.max.y-part.geometry.boundingBox.min.y),base=part.geometry.boundingBox.min.y;
   for(const [context,subset] of emphasis.entries()){if(!subset.length)continue;
    const originals=Array.isArray(part.material)?part.material:[part.material],materials=originals.map((original:InstanceType<typeof Material>)=>{
     const material=original.clone();if(context&&material.color)material.color.lerp(new Color('#a2b3a2'),.65);
     material.onBeforeCompile=(shader:{uniforms:Record<string,unknown>;vertexShader:string})=>{shader.uniforms.groveWind=wind;shader.vertexShader='uniform float groveWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat groveTip=clamp((position.y-('+base.toFixed(6)+'))/'+height.toFixed(6)+',0.0,1.0);\ntransformed.x += sin(groveWind*0.8 + instanceMatrix[3].x*0.13)*groveTip*groveTip*'+(height*.025).toFixed(6)+';');};material.customProgramCacheKey=()=> 'grove-wind-'+base+'-'+height;return material;
    });
    const mesh=new InstancedMesh(part.geometry,Array.isArray(part.material)?materials:materials[0],subset.length),dummy=new Object3D();subset.forEach((t,i)=>{dummy.position.set(t.x+offset(t.worldYear),t.height*heightScale+.01,t.z);dummy.rotation.y=t.rotation;dummy.scale.setScalar(t.scale);dummy.updateMatrix();mesh.setMatrixAt(i,new Matrix4().multiplyMatrices(dummy.matrix,part.matrixWorld));});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);batches.push({mesh,trees:subset});
   }
  });for(const t of list)ids.add(t.id);
 }catch{/* Silhouette is retained for unavailable assets. */}}));
 let disposed=false;return {root,batches,ids,update(seconds:number){const period=2*Math.PI/.8;wind.value=seconds%period;},dispose(){if(disposed)return;disposed=true;const released=new Set<object>();
  const releaseMaterial=(m:InstanceType<typeof Material>)=>{if(released.has(m))return;released.add(m);for(const v of Object.values(m))if(v&&typeof v==='object'&&(v as {isTexture?:boolean}).isTexture&&!released.has(v)){released.add(v);(v as {dispose():void}).dispose();}m.dispose();};
  for(const b of batches){b.mesh.dispose();for(const m of Array.isArray(b.mesh.material)?b.mesh.material:[b.mesh.material])releaseMaterial(m);}
  for(const s of sources)s.traverse((n:InstanceType<typeof Object3D>)=>{if(n.geometry&&!released.has(n.geometry)){released.add(n.geometry);n.geometry.dispose();}for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[])releaseMaterial(m);});root.clear();}};
}

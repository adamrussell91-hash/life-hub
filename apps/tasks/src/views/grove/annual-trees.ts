/** Authored near trees share model parts; distant history remains inexpensive silhouettes. */
import {Group,Object3D,InstancedMesh,Matrix4} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {treeModelFile} from '@/domain/grove/assets';
import type {AnnualTree} from '@/domain/grove/planting';
import {groveAssetUrl} from './asset-url';
export async function createAnnualTrees(trees:readonly AnnualTree[],offset:(year:number)=>number,heightScale=1){
 const root=new Group(),batches:{mesh:InstanceType<typeof InstancedMesh>;trees:AnnualTree[]}[]=[],ids=new Set<string>(),sources:InstanceType<typeof Object3D>[]=[],loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),groups=new Map<string,AnnualTree[]>();
 for(const t of trees.slice(0,200)){const file=treeModelFile(t.species,t.variant),list=groups.get(file)??[];list.push(t);groups.set(file,list);}
 await Promise.all([...groups].map(async([file,list])=>{try{const source=(await loader.loadAsync(groveAssetUrl(file))).scene;source.updateMatrixWorld(true);sources.push(source);source.traverse((part:InstanceType<typeof Object3D>)=>{if(!part.isMesh)return;const mesh=new InstancedMesh(part.geometry,part.material,list.length),dummy=new Object3D();list.forEach((t,i)=>{dummy.position.set(t.x+offset(t.worldYear),t.height*heightScale+.01,t.z);dummy.rotation.y=t.rotation;dummy.scale.setScalar(t.scale);dummy.updateMatrix();mesh.setMatrixAt(i,new Matrix4().multiplyMatrices(dummy.matrix,part.matrixWorld));});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);batches.push({mesh,trees:list});});for(const t of list)ids.add(t.id);}catch{/* Silhouette is retained for unavailable assets. */}}));
 let disposed=false;return {root,batches,ids,dispose(){if(disposed)return;disposed=true;for(const b of batches)b.mesh.dispose();const released=new Set<object>();for(const s of sources)s.traverse((n:InstanceType<typeof Object3D>)=>{if(n.geometry&&!released.has(n.geometry)){released.add(n.geometry);n.geometry.dispose();}for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[]){if(released.has(m))continue;released.add(m);for(const v of Object.values(m))if(v&&typeof v==='object'&&(v as {isTexture?:boolean}).isTexture&&!released.has(v)){released.add(v);(v as {dispose():void}).dispose();}m.dispose();}});root.clear();}};
}

import {AnimationMixer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

// Use one library per scene; clones keep their own skeleton and mixer.
export async function createAnimalLibrary(baseURL){
 const base=new URL(baseURL,globalThis.location?.href || import.meta.url);
 const response=await fetch(new URL('manifest.json',base));
 if(!response.ok)throw Error('Animal manifest: HTTP '+response.status);
 const manifest=await response.json();
 const assets=new Map(manifest.assets.map(a=>[a.id,a]));
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),cache=new Map();
 return {manifest,async create(id,{baby=false}={}){
  const asset=assets.get(id);if(!asset)throw Error('Unknown animal '+id);
  if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(asset.file,base).href).catch(e=>{cache.delete(id);throw e;}));
  const source=await cache.get(id),object=clone(source.scene);
  if(baby)object.scale.multiplyScalar(.5);
  const mixer=new AnimationMixer(object),clips=new Map(source.animations.map(c=>[c.name,c]));let current=null;
  const animal={id,asset,object,mixer,clips:[...clips.keys()],play(name,fade=.18){
   const resolved=asset.animation_roles?.[name] || name,clip=clips.get(resolved);
   if(!clip)throw Error(id+' has no clip '+name);
   const action=mixer.clipAction(clip);if(action===current)return;
   action.reset().play();if(current && fade>0){action.crossFadeFrom(current,fade,false);}else{current?.stop();}current=action;
  },update(seconds){if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid animation delta');mixer.update(seconds);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(object);object.removeFromParent();}};
  animal.play('idle',0);return animal;
 }};
}

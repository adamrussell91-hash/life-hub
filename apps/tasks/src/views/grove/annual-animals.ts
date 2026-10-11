import {companionEncounters} from '@/domain/grove/companions';
/** Authored, skinned wildlife; annual geography owns every legal route and height. */
import {AnimationMixer,Group,Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {annualLandPath,annualSwimPath,annualAnimalHeight} from '@/domain/grove/annual-wildlife';
import {WILDLIFE_MODEL,type PathPoint} from '@/domain/grove/wildlife';
import type {AnnualWorld} from '@/domain/grove/world';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
import {groveAssetUrl} from './asset-url';
type Obj=InstanceType<typeof Object3D>;
type Asset={id:string;file:string;roles:Record<string,string>;waterline:number;credit:string|null};
type Source={scene:Obj;animations:{name:string}[]};
type Actor={object:Obj;mixer:InstanceType<typeof AnimationMixer>;source:Source;asset:Asset;path:PathPoint[];lengths:number[];total:number;baby:boolean;swimming:boolean;bird:boolean;offset:number;current:unknown;role:string};
export async function createAnnualAnimals(world:AnnualWorld,plan:AnnualGrovePlan,focusKey?:string,heightScale=1){
 const root=new Group(),actors:Actor[]=[],sources:Source[]=[],missing:string[]=[],credits:string[]=[];
 const day=plan.days.find(d=>d.key===focusKey)??plan.days.find(d=>d.today)??plan.days[0];
 let disposed=false;
 function play(actor:Actor,role:string){
  if(role===actor.role)return;
  const name=actor.asset.roles[role]??role,clip=actor.source.animations.find(c=>c.name===name)??actor.source.animations.find(c=>c.name==='idle');
  if(!clip)return;
  const action=actor.mixer.clipAction(clip);action.reset().play();if(actor.current)action.crossFadeFrom(actor.current,.2,false);actor.current=action;actor.role=role;
 }
 function update(seconds:number,delta:number,visible?:(object:Obj)=>boolean){
  if(disposed)return false;let active=false;
  for(const actor of actors){
   const t=Math.max(0,seconds+actor.offset-(actor.baby?1.5:0)),cycle=Math.floor(t/26),phase=t%26,moving=phase<14,travel=cycle*14+Math.min(14,phase),speed=actor.swimming?.24:actor.bird?.35:.38;
   let distance=(travel*speed)%actor.total,x=actor.path[0]!.x,z=actor.path[0]!.z,yaw=0;
   for(let i=0;i<actor.lengths.length;i++){const length=actor.lengths[i]!;if(distance<=length&&length>0){const a=actor.path[i]!,b=actor.path[i+1]!,f=distance/length;x=a.x+(b.x-a.x)*f;z=a.z+(b.z-a.z)*f;yaw=Math.atan2(b.x-a.x,b.z-a.z);break;}distance-=length;}
   let y=annualAnimalHeight(world,x,z,actor.swimming,actor.asset.waterline,actor.object.scale.y,heightScale);
   const flying=actor.bird&&phase>=20;if(flying)y+=Math.sin((phase-20)/6*Math.PI)*2.5;
   actor.object.position.set(x,y+(actor.swimming?0:.02),z);actor.object.rotation.y=yaw;
   // Parent clock freezes both travel and mixer time. A zero-delta render never advances animation.
   if(delta>0){play(actor,flying?'flight':actor.swimming?'water':moving?'locomotion':phase<19?'feed':'idle');if(!visible||visible(actor.object)){actor.mixer.update(delta);active=true;}}
  }return active;
 }
 function dispose(){
  if(disposed)return;disposed=true;
  for(const actor of actors){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.object);}
  const released=new Set<object>();for(const actor of actors)actor.object.traverse((node:Obj)=>{if(node.skeleton&&!released.has(node.skeleton)){released.add(node.skeleton);node.skeleton.dispose();}});
  for(const source of sources)source.scene.traverse((node:Obj)=>{
   if(node.geometry&&!released.has(node.geometry)){released.add(node.geometry);node.geometry.dispose();}
   for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){
    if(released.has(material))continue;released.add(material);
    for(const value of Object.values(material))if(value&&typeof value==='object'&&(value as {isTexture?:boolean}).isTexture&&!released.has(value)){released.add(value);(value as {dispose():void}).dispose();}
    material.dispose();
   }
  });root.clear();actors.length=0;sources.length=0;
 }
 const result=()=>({root,missing,credits,count:actors.length,swimmers:actors.filter(a=>a.swimming).length,swimmerError:()=>actors.filter(a=>a.swimming).reduce((error,a)=>Math.max(error,Math.abs(a.object.position.y-annualAnimalHeight(world,a.object.position.x,a.object.position.z,true,a.asset.waterline,a.object.scale.y,heightScale))),0),update,dispose});
 if(!day||day.future||day.worldYear!==world.key.year||!plan.wildlife.length)return result();
 const eligible=(plan.wildlifeAt?.(day.key)??plan.wildlife).filter(m=>m.earnedOn<=day.key);
 if(!eligible.length)return result();
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 let catalogue:{assets:Asset[]};
 try{const response=await fetch(groveAssetUrl('animal-catalogue.json'));if(!response.ok)throw Error('Catalogue unavailable');catalogue=await response.json() as {assets:Asset[]};}
 catch{missing.push(...eligible.map(m=>m.species+': asset unavailable'));return result();}
 const assets=new Map(catalogue.assets.map(a=>[a.id,a]));
 const obstacles=plan.contextTrees.filter(t=>t.worldYear===world.key.year&&Math.hypot(t.x-day.cx,t.z-day.cz)<42).map(t=>({x:t.x,z:t.z}));
 const encounters=[...eligible.map(m=>({...m,id:WILDLIFE_MODEL[m.species],swimming:m.species==='mallard'})),...companionEncounters(eligible,day.key).map(m=>({...m,species:'companion',baby:false}))];
 for(const [index,milestone] of encounters.entries()){
  const limit=milestone.species==='companion'?11:9;if(actors.length>=limit){if(limit===9)continue;break;}
  const id=milestone.id,asset=assets.get(id);if(!asset){missing.push(milestone.species+': asset unavailable');continue;}
  const swimming=milestone.swimming,path=swimming?annualSwimPath(world,day.cx,day.cz):annualLandPath(world,id+':'+day.key,day.cx-3+index,day.cz+4,obstacles);
  if(path.length<2){missing.push(milestone.species+': no safe '+(swimming?'water':'land')+' path nearby');continue;}
  let source:Source;
  try{source=await loader.loadAsync(groveAssetUrl(asset.file)) as Source;sources.push(source);}
  catch{missing.push(milestone.species+': asset unavailable');continue;}
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i]!.x,p.z-path[i]!.z)),total=lengths.reduce((a,b)=>a+b,0);
  for(const baby of milestone.baby?[false,true]:[false]){
   if(actors.length>=limit)break;
   const object=clone(source.scene),size=(milestone.species==='squirrel'?2.5:milestone.species==='robin'?1.3:1)*(baby?.5:1);
   object.scale.multiplyScalar(size);object.userData.wildlife=id;object.userData.baby=baby;object.userData.swimming=swimming;
   object.traverse((node:Obj)=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
   const actor:Actor={object,mixer:new AnimationMixer(object),source,asset,path,lengths,total,baby,swimming,bird:milestone.species==='robin'||milestone.species==='owl',offset:index*3,current:null,role:''};
   actors.push(actor);root.add(object);play(actor,swimming?'water':'idle');
  }
  if(asset.credit&&!credits.includes(asset.credit))credits.push(asset.credit);
 }
 update(0,0);return result();
}

/** Real skinned animals. Motion stays in place in the GLB; legal paths move the independent clone. */
import {AnimationMixer,Group,Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {dryPath,pathPose,WILDLIFE_MODEL,type PathPoint} from '@/domain/grove/wildlife';
import {sampleTerrain} from '@/domain/grove/terrain';
import type {GrovePlan} from '@/domain/grove/plan';
import {groveAssetUrl} from './asset-url';
type Obj=InstanceType<typeof Object3D>;
type Asset={id:string;file:string;roles:Record<string,string>;waterline:number;credit:string|null};
type Source={scene:Obj;animations:{name:string}[]};
type Actor={object:Obj;mixer:InstanceType<typeof AnimationMixer>;source:Source;asset:Asset;path:PathPoint[];baby:boolean;swimming:boolean;bird:boolean;offset:number;current:unknown;role:string};
function swimPath(cx:number,cz:number):PathPoint[] {
  for(let radius=0;radius<14;radius++) for(let i=0;i<24;i++) {
    const a=i*Math.PI/12,x=cx+Math.sin(a)*radius,z=cz+Math.cos(a)*radius;
    if(!sampleTerrain(x,z).wet) continue;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let safe=true;
      for(let j=0;j<=12;j++) if(!sampleTerrain(x+dx!*j/12,z+dz!*j/12).wet) safe=false;
      if(safe) return [{x,z},{x:x+dx!,z:z+dz!},{x,z}];
    }
  }
  return [];
}
export async function createGroveAnimals(plan:GrovePlan,origin:{x:number;z:number},focusKey?:string) {
  const root=new Group(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),sources:Source[]=[],actors:Actor[]=[],missing:string[]=[];
  const day=plan.days.find(d=>d.key===focusKey)??plan.days.find(d=>d.today)??plan.days[0]!;
  if(day.future || !plan.wildlife.length) return {root,missing,credits:[] as string[],update:()=>false,dispose(){}};
  const response=await fetch(groveAssetUrl('animal-catalogue.json'));
  if(!response.ok) throw new Error('Grove wildlife catalogue could not load');
  const catalogue=await response.json() as {assets:Asset[]};
  const assets=new Map(catalogue.assets.map(a=>[a.id,a]));
  const obstacles=day.trees.map(t=>({x:day.cx+t.x,z:day.cz+t.z}));
  function play(actor:Actor,role:string) {
    if(role===actor.role) return;
    const name=actor.asset.roles[role]??role,clip=actor.source.animations.find(c=>c.name===name)??actor.source.animations.find(c=>c.name==='idle');
    if(!clip) return;
    const action=actor.mixer.clipAction(clip);action.reset().play();
    if(actor.current) action.crossFadeFrom(actor.current,.2,false);
    actor.current=action;actor.role=role;
  }
  await Promise.all(plan.wildlife.map(async (milestone,index)=>{
    const id=WILDLIFE_MODEL[milestone.species],asset=assets.get(id);
    if(!asset) {missing.push(milestone.species);return;}
    try {
      const source=await loader.loadAsync(groveAssetUrl(asset.file)) as Source;sources.push(source);
      const swimming=milestone.species==='mallard';
      let path=swimming ? swimPath(day.cx,day.cz+8) : [];
      const inWater=path.length>1;
      if(!inWater) path=dryPath(`${id}:${day.key}`,day.cx-3+index,day.cz+4,sampleTerrain,obstacles);
      if(!path.length) return;
      for(const baby of milestone.baby ? [false,true] : [false]) {
        const object=clone(source.scene);object.userData.wildlife=id;object.userData.baby=baby;
        const size=(milestone.species==='squirrel' ? 2.5 : milestone.species==='robin' ? 1.3 : 1)*(baby?.5:1);
        object.scale.multiplyScalar(size);
        object.traverse((node:Obj)=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
        const actor:Actor={object,mixer:new AnimationMixer(object),source,asset,path,baby,swimming:inWater,bird:milestone.species==='robin',offset:index*3,current:null,role:''};
        actors.push(actor);root.add(object);play(actor,'idle');
      }
    } catch(error) {missing.push(milestone.species);console.warn('Grove wildlife model unavailable',id,error);}
  }));
  function update(seconds:number,delta:number,visible?:(object:Obj)=>boolean) {
    let active=false;
    for(const actor of actors) {
      const t=Math.max(0,seconds+actor.offset-(actor.baby?1.5:0)),cycle=Math.floor(t/26),phase=t%26;
      const moving=phase<14,travel=cycle*14+Math.min(14,phase);
      const p=pathPose(actor.path,travel,actor.swimming?.24:actor.bird?.35:.38);
      const ground=sampleTerrain(p.x,p.z);
      let y=actor.swimming ? (ground.waterHeight??ground.height)-actor.asset.waterline : ground.height;
      const flying=actor.bird && phase>=20;
      if(flying) y+=Math.sin((phase-20)/6*Math.PI)*2.5;
      actor.object.position.set(p.x-origin.x,y+.02,p.z-origin.z);actor.object.rotation.y=p.yaw;
      const role=flying?'flight':actor.swimming?'water':moving?'locomotion':phase<19?'feed':'idle';
      play(actor,role);
      if(!visible || visible(actor.object)) {actor.mixer.update(delta);active=true;}
    }
    return active;
  }
  update(0,0);
  const usedAssets = new Set(actors.map(actor => actor.asset));
  const credits = catalogue.assets.filter(asset => usedAssets.has(asset)).map(asset => asset.credit).filter((credit): credit is string => !!credit);
  return {root,missing,credits,update,dispose(){
    for(const actor of actors) {actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.object);}
    const disposed=new Set<object>();
    for(const source of sources) source.scene.traverse((node:Obj)=>{
      if(node.geometry && !disposed.has(node.geometry)){node.geometry.dispose();disposed.add(node.geometry);}
      for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]) {
        if(disposed.has(material))continue;disposed.add(material);
        for(const value of Object.values(material))if(value && typeof value==='object' && (value as {isTexture?:boolean}).isTexture && !disposed.has(value)){(value as {dispose():void}).dispose();disposed.add(value);}
        material.dispose();
      }
    });root.clear();
  }};
}

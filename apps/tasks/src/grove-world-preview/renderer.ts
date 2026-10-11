import {nearestProjectedItem} from '@/views/grove/picking';
import {annualFramePoints} from '@/domain/grove/annual-framing';
/** Diagnostic only: inspect solved geography, with vertical exaggeration x3. */
import {Scene,WebGLRenderer,OrthographicCamera,Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,Color,HemisphereLight,DirectionalLight,DoubleSide,LineSegments,LineBasicMaterial,Points,PointsMaterial,InstancedMesh,ConeGeometry,Object3D,Raycaster,Vector2,Vector3,Frustum,Matrix4} from 'three';
import {createAnnualAnimals} from '@/views/grove/annual-animals';
import {createAnnualTrees} from '@/views/grove/annual-trees';
import type {GroveCameraState} from '@/views/grove/scene';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildWaterPrototype} from '@/domain/grove/water-prototype';
import {GroveMotionClock,type WaterQuality} from '@/domain/grove/motion';
import {createAnnualWater} from '@/views/grove/waterRenderer';
import type {WorldMeshes} from '@/domain/grove/world-meshes';
import type {AnnualWorld} from '@/domain/grove/world';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
import type {AnnualTree} from '@/domain/grove/planting';
export type DiagnosticLayer='regions'|'elevation'|'lakes'|'receivers'|'accumulation'|'outlets';
export function createWorldPreview(host:HTMLElement,onPick:(tree:AnnualTree,x:number,y:number)=>void=()=>{},options:{heightScale?:number;interactive?:boolean;focusedDay?:boolean}={}){
 const heightScale=options.heightScale??3;
 const renderer=new WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
 const scene=new Scene(),camera=new OrthographicCamera(-600,600,600,-600,1,5000);camera.position.set(780,950,780);camera.lookAt(0,0,0);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enabled=options.interactive!==false;controls.minZoom=.25;controls.maxZoom=20;
 scene.add(new HemisphereLight(0xf4f7ff,0x7d8f5a,2));const sun=new DirectionalLight(0xfff3dd,2);sun.position.set(-600,1000,300);scene.add(sun);
 let content=new Group();scene.add(content);let owned:{dispose():void}[]=[],disposed=false,current:AnnualWorld|null=null,layer:DiagnosticLayer='elevation';
 let meshPayloads:WorldMeshes[]=[],waterEffects:ReturnType<typeof createAnnualWater>[]=[],quality:WaterQuality='medium';
 let annual:AnnualWorld[]=[],plan:AnnualGrovePlan|undefined,pickMeshes:InstanceType<typeof InstancedMesh>[]=[],pickTrees=new Map<InstanceType<typeof InstancedMesh>,AnnualTree[]>();
 let farVegetation:InstanceType<typeof InstancedMesh>[]=[],spatialVegetation:InstanceType<typeof InstancedMesh>[]=[];
 let sceneRevision=0,animals:ReturnType<typeof createAnnualAnimals> extends Promise<infer T>?T[]:never=[],nearTrees:Awaited<ReturnType<typeof createAnnualTrees>>|null=null;
 const offset=(year:number)=>(annual.findIndex(w=>w.key.year===year)-(annual.length-1)/2)*1100;
 const render=()=>{if(!disposed){const wide=camera.zoom<3;for(const mesh of farVegetation)mesh.visible=wide;for(const mesh of spatialVegetation)mesh.visible=!wide;host.dataset.vegetationMode=wide?'overview':'spatial';renderer.render(scene,camera);host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.renderTriangles=String(renderer.info.render.triangles);host.dataset.gpuGeometries=String(renderer.info.memory.geometries);host.dataset.gpuTextures=String(renderer.info.memory.textures);host.dataset.particles=String(waterEffects.reduce((n,e)=>n+e.stats().particles,0));const t=plan?.trees[0];if(t){const p=new Vector3(t.x+offset(t.worldYear),t.height*heightScale+4*t.scale,t.z).project(camera),r=renderer.domElement.getBoundingClientRect();host.dataset.pickX=String(r.left+(p.x+1)*r.width/2);host.dataset.pickY=String(r.top+(1-p.y)*r.height/2);}}};
 const clock=new GroveMotionClock(),motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
 let paused=false,intersecting=true,raf=0,frameCount=0,cameraRaf=0;
 let refineTrees=()=>{},refineTimer=0;const scheduleRefine=()=>{window.clearTimeout(refineTimer);refineTimer=window.setTimeout(()=>refineTrees(),160);};
 const cancelCamera=()=>{if(cameraRaf)cancelAnimationFrame(cameraRaf);cameraRaf=0;};
 const motionState=()=>motionQuery.matches?'reduced':paused?'paused':document.hidden?'hidden':!intersecting?'offscreen':waterEffects.length?'running':'idle';
 const frustum=new Frustum(),projection=new Matrix4(),visiblePoint=new Vector3();
 function animate(timestamp:number){raf=0;if(disposed)return;const active=motionState()==='running',t=clock.tick(timestamp,active);host.dataset.motionSeconds=String(t.seconds);host.dataset.waterPhase=String(t.phase);host.dataset.motion=motionState();host.dataset.frames=String(++frameCount);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);for(const effect of waterEffects)effect.update(t.phase,p=>frustum.containsPoint(visiblePoint.set(p.x+effect.root.parent.position.x,p.y*heightScale,p.z)));nearTrees?.update(t.seconds);for(const a of animals)a.update(t.seconds,t.delta,obj=>{obj.getWorldPosition(visiblePoint);return frustum.containsPoint(visiblePoint);});render();if(active)raf=requestAnimationFrame(animate);}
 function refreshMotion(){if(disposed)return;if(motionState()!=='running')cancelCamera();if(raf)cancelAnimationFrame(raf);raf=0;clock.tick(performance.now(),false);host.dataset.motion=motionState();if(motionState()==='running')raf=requestAnimationFrame(animate);else render();}
 const visibility=()=>refreshMotion(),reduced=()=>refreshMotion();
 document.addEventListener('visibilitychange',visibility);motionQuery.addEventListener('change',reduced);
 const intersection=new IntersectionObserver(entries=>{intersecting=entries.some(e=>e.isIntersecting);refreshMotion();});intersection.observe(host);
 let down={x:0,y:0};const pointerDown=(e:PointerEvent)=>{cancelCamera();down={x:e.clientX,y:e.clientY};};
 const pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const r=renderer.domElement.getBoundingClientRect(),ray=new Raycaster();ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const hit=ray.intersectObjects(pickMeshes.filter(mesh=>mesh.visible||mesh.userData.hitProxy))[0];let tree=hit?.instanceId!==undefined?pickTrees.get(hit.object as InstanceType<typeof InstancedMesh>)?.[hit.instanceId]:undefined;
  if(!tree&&host.dataset.scene==='annual'){const point=new Vector3();function* projected(){for(const t of plan?.contextTrees??[]){point.set(t.x+offset(t.worldYear),t.height*heightScale+4*t.scale,t.z).project(camera);yield {item:t,x:r.left+(point.x+1)*r.width/2,y:r.top+(1-point.y)*r.height/2,depth:point.z};}}tree=nearestProjectedItem(projected(),e.clientX,e.clientY,r.width<600?22:12);}
  if(tree)onPick(tree,e.clientX,e.clientY);};
 renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
 const resize=()=>{const width=host.clientWidth||1,height=host.clientHeight||1,aspect=width/height,half=aspect<1?610/aspect:610;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(width,height,false);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';render();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);controls.addEventListener('start',cancelCamera);controls.addEventListener('end',scheduleRefine);resize();
 function show(world:AnnualWorld,nextLayer=layer,append=false){
  if(disposed)return;current=world;layer=nextLayer;
  if(!append){farVegetation=[];spatialVegetation=[];for(const effect of waterEffects)effect.dispose();waterEffects=[];for(const resource of owned)resource.dispose();owned=[];scene.remove(content);content=new Group();scene.add(content);pickMeshes=[];pickTrees.clear();} const root=content;content=new Group();content.position.x=offset(world.key.year);root.add(content);
  const g=world.grid,h=world.hydrology,payload=meshPayloads.find(p=>p.identity===world.identity);if(!payload)throw Error('Annual render meshes unavailable');
  const point=(id:number)=>({x:g.x0+id%g.size*g.step,z:g.z0+Math.floor(id/g.size)*g.step,h:h.bed[id]!});
  const terrain=new Group();terrain.scale.y=heightScale;content.add(terrain);
  for(const chunk of payload.terrain){
   const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(chunk.positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(chunk.normals,3));
   const colors=chunk.colors.slice();if(layer==='regions'||layer==='accumulation')for(let i=0;i<chunk.positions.length;i+=3){const id=Math.round((chunk.positions[i+2]!-g.z0)/g.step)*g.size+Math.round((chunk.positions[i]!-g.x0)/g.step),color=new Color();if(layer==='regions'){const owner=world.regions?.owner[id]??-1;color.setHSL(owner<0?.2:(owner*.618)%1,owner<0?.3:.3,.58);}else color.set('#a3c96b').lerp(new Color('#53c4c6'),Math.log2(h.accumulation[id]!)/Math.log2(h.bed.length));colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
   geometry.setAttribute('color',new Float32BufferAttribute(colors,3));const material=new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});terrain.add(new Mesh(geometry,material));owned.push(geometry,material);
  }
  const effect=createAnnualWater(payload,heightScale);effect.setQuality(quality);content.add(effect.root);waterEffects.push(effect);
  const waterTriangles=payload.water.reduce((n,w)=>n+w.positions.length/9,0),terrainTriangles=payload.terrain.reduce((n,c)=>n+c.positions.length/9,0);
  if(layer==='receivers'){
   const lines:number[]=[];for(let i=0;i<h.receiver.length;i+=8){const to=h.receiver[i]!;if(to<0)continue;for(const id of [i,to]){const p=point(id);lines.push(p.x,Math.max(p.h,h.level[id]!)*heightScale+.7,p.z);}}
   const lg=new BufferGeometry();lg.setAttribute('position',new Float32BufferAttribute(lines,3));const lm=new LineBasicMaterial({color:'#608e48'});content.add(new LineSegments(lg,lm));owned.push(lg,lm);
  }
  if(layer==='outlets'){
   const points:number[]=[];for(const id of h.outlets){const p=point(id);points.push(p.x,p.h*heightScale+1,p.z);}
   // Also identify lake spill nodes, not just the coastal boundary roots.
   for(const l of h.lakes){const p=point(l.outletCell);points.push(p.x,l.waterElevation*heightScale+1,p.z);}
   const pg=new BufferGeometry();pg.setAttribute('position',new Float32BufferAttribute(points,3));const pm=new PointsMaterial({color:'#53c4c6',size:4,sizeAttenuation:false});content.add(new Points(pg,pm));owned.push(pg,pm);
  }
  content=root;host.dataset.triangles=String((append?Number(host.dataset.triangles):0)+terrainTriangles+waterTriangles);host.dataset.waterTriangles=String(waterTriangles);host.dataset.layer=layer;render();
 }
 function clearActors(){refineTrees=()=>{};window.clearTimeout(refineTimer);sceneRevision++;for(const a of animals)a.dispose();animals=[];nearTrees?.dispose();nearTrees=null;}
 function showAnnual(worlds:AnnualWorld[],next:DiagnosticLayer,activity?:AnnualGrovePlan,payloads=meshPayloads){clearActors();const revision=sceneRevision;host.dataset.animalsReady='false';host.dataset.wildlifeCount='0';host.dataset.swimmers='0';host.dataset.swimmerHeightError='0';host.dataset.authoredTrees='0';host.dataset.wildlifeCredits='';host.dataset.unavailableWildlife='';meshPayloads=payloads;annual=worlds;host.dataset.scene='annual';host.dataset.terrainChunks=String(payloads.reduce((n,p)=>n+p.terrain.length,0));plan=activity;worlds.forEach((w,i)=>show(w,next,i>0));
  if(plan){const selected=new Set(plan.trees.map(t=>t.id));const treeGroups=new Map<string,AnnualTree[]>(),farTreeGroups=new Map<string,AnnualTree[]>();for(const tree of plan.contextTrees){const key=tree.worldYear+':'+tree.regionId+':'+tree.species+':'+selected.has(tree.id),group=treeGroups.get(key)??[];group.push(tree);treeGroups.set(key,group);const farKey=tree.species+':'+selected.has(tree.id),farGroup=farTreeGroups.get(farKey)??[];farGroup.push(tree);farTreeGroups.set(farKey,farGroup);}for(const [far,groups] of [[false,treeGroups],[true,farTreeGroups]] as const)for(const trees of groups.values()){const species=trees[0]!.species,active=selected.has(trees[0]!.id);
   const geometry=new ConeGeometry(1.2,6,5),material=new MeshStandardMaterial({color:active?['#427f42','#689b55','#66876c','#98ac63','#658d70','#8b7c59'][['life','health','teaching','wedding','other','late'].indexOf(species)]: '#a2b3a2',roughness:1});const mesh=new InstancedMesh(geometry,material,trees.length),dummy=new Object3D();
   trees.forEach((t,i)=>{dummy.position.set(t.x+offset(t.worldYear),t.height*heightScale+3*t.scale,t.z);dummy.scale.setScalar(t.scale);dummy.rotation.y=t.rotation;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();content.add(mesh);owned.push(mesh,geometry,material);mesh.userData.farVegetation=far;(far?farVegetation:spatialVegetation).push(mesh);pickMeshes.push(mesh);pickTrees.set(mesh,trees);
  }
  const propGroups=new Map<string,AnnualGrovePlan['baselineProps']>(),farPropGroups=new Map<string,AnnualGrovePlan['baselineProps']>();for(const prop of [...plan.baselineProps,...plan.activityProps]){const key=prop.worldYear+':'+prop.regionId+':'+prop.kind,group=propGroups.get(key)??[];group.push(prop);propGroups.set(key,group);const farGroup=farPropGroups.get(prop.kind)??[];farGroup.push(prop);farPropGroups.set(prop.kind,farGroup);}for(const [far,groups] of [[false,propGroups],[true,farPropGroups]] as const)for(const props of groups.values()){const kind=props[0]!.kind;const geometry=new ConeGeometry(kind==='rock'?.65:.3,kind==='rock'?1:.7,kind==='rock'?5:3),material=new MeshStandardMaterial({color:kind==='rock'?'#9b9f91':kind==='flower'?'#d7b77c':'#839e62',roughness:1}),mesh=new InstancedMesh(geometry,material,props.length),dummy=new Object3D();props.forEach((p,i)=>{dummy.position.set(p.x+offset(p.worldYear),p.height*heightScale+.35,p.z);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();content.add(mesh);owned.push(mesh,geometry,material);(far?farVegetation:spatialVegetation).push(mesh);}
  }
  const root=content,near=[...(options.focusedDay?(plan?.trees.filter(t=>t.dayKey===plan?.anchor)??[]):(plan?.view==='year'||plan?.view==='term'?[]:plan?.trees??[]))].sort((a,b)=>Number(b.dayKey===plan?.anchor)-Number(a.dayKey===plan?.anchor)||Math.abs(Date.parse(a.dayKey)-Date.parse(plan?.anchor??a.dayKey))-Math.abs(Date.parse(b.dayKey)-Date.parse(plan?.anchor??b.dayKey))||Math.hypot(a.x-(plan?.days.find(d=>d.key===plan?.anchor)?.cx??0),a.z-(plan?.days.find(d=>d.key===plan?.anchor)?.cz??0))-Math.hypot(b.x-(plan?.days.find(d=>d.key===plan?.anchor)?.cx??0),b.z-(plan?.days.find(d=>d.key===plan?.anchor)?.cz??0)));const animalPlan=plan,animalWorld=worlds.find(w=>w.key.year===Number((plan?.anchor??plan?.days.find(d=>d.today)?.key??'').slice(0,4)));
  const animalJob=animalPlan&&animalWorld?createAnnualAnimals(animalWorld,animalPlan,animalPlan.anchor,heightScale):Promise.resolve(null);
  void animalJob.then(a=>{if(disposed||revision!==sceneRevision){a?.dispose();return;}if(a){a.root.position.x=offset(animalWorld!.key.year);root.add(a.root);animals=[a];host.dataset.wildlifeCount=String(a.count);host.dataset.swimmers=String(a.swimmers);host.dataset.swimmerHeightError=String(a.swimmerError());host.dataset.wildlifeCredits=a.credits.join(' · ');host.dataset.unavailableWildlife=a.missing.join(',');}host.dataset.animalsReady='true';render();});
  let nearRevision=0,lastNear='';const originals=new Map<InstanceType<typeof InstancedMesh>,Map<number,InstanceType<typeof Matrix4>>>(),nearProxies:InstanceType<typeof InstancedMesh>[]=[];
  refineTrees=()=>{
   if(disposed||revision!==sceneRevision)return;
   const candidates=(plan?.contextTrees??near).filter(t=>Math.hypot(t.x+offset(t.worldYear)-controls.target.x,t.z-controls.target.z)<90).sort((a,b)=>Math.hypot(a.x+offset(a.worldYear)-controls.target.x,a.z-controls.target.z)-Math.hypot(b.x+offset(b.worldYear)-controls.target.x,b.z-controls.target.z)).slice(0,64);
   const chosen=camera.zoom<3?[]:candidates,signature=chosen.map(t=>t.id).join('|');if(signature===lastNear)return;lastNear=signature;const request=++nearRevision;
   void createAnnualTrees(chosen,offset,heightScale,new Set(plan?.trees.map(t=>t.id)??[])).then(t=>{if(disposed||revision!==sceneRevision||request!==nearRevision){t.dispose();return;}
   if(nearTrees){root.remove(nearTrees.root);for(const b of nearTrees.batches){pickMeshes=pickMeshes.filter(m=>m!==b.mesh);pickTrees.delete(b.mesh);}nearTrees.dispose();nearTrees=null;}
   for(const [mesh,matrices] of originals){for(const [index,matrix] of matrices)mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;}originals.clear();
   for(const proxy of nearProxies){root.remove(proxy);pickMeshes=pickMeshes.filter(m=>m!==proxy);pickTrees.delete(proxy);owned=owned.filter(r=>r!==proxy);proxy.dispose();}nearProxies.length=0;nearTrees=t;root.add(t.root);// Retain the silhouette's generous hit volume when an authored model replaces it.
  // Small branches must not make the same tree harder to tap on a phone.
  const proxies:InstanceType<typeof InstancedMesh>[]=[];
  for(const mesh of pickMeshes){if(mesh.userData.farVegetation)continue;const trees=pickTrees.get(mesh)??[],authored=trees.filter(tree=>t.ids.has(tree.id)),dummy=new Object3D(),matrix=new Matrix4();
   if(authored.length){const proxy=new InstancedMesh(mesh.geometry,mesh.material,authored.length);let index=0;trees.forEach((tree,i)=>{if(t.ids.has(tree.id)){mesh.getMatrixAt(i,matrix);const saved=originals.get(mesh)??new Map<number,InstanceType<typeof Matrix4>>();saved.set(i,matrix.clone());originals.set(mesh,saved);proxy.setMatrixAt(index++,matrix);dummy.scale.setScalar(0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}});proxy.visible=false;proxy.userData.hitProxy=true;proxy.computeBoundingSphere();root.add(proxy);owned.push(proxy);proxies.push(proxy);nearProxies.push(proxy);pickTrees.set(proxy,authored);}
   mesh.instanceMatrix.needsUpdate=true;
  }pickMeshes.push(...proxies);for(const b of t.batches){pickMeshes.push(b.mesh);pickTrees.set(b.mesh,b.trees);}host.dataset.authoredTrees=String(t.ids.size);render();});};
  fit(false);refineTrees();refreshMotion();render();
 }
 function fit(selection:boolean,ease=false){
  cancelCamera();const fromPosition=camera.position.clone(),fromTarget=controls.target.clone(),fromZoom=camera.zoom;
  const points=annualFramePoints(annual,plan,selection,options.focusedDay??false,heightScale,offset);
  if(!points.length)return;const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),x=(minX+maxX)/2,z=(minZ+maxZ)/2,y=points.reduce((n,p)=>n+p.y,0)/points.length;
  controls.target.set(x,y,z);camera.position.set(x+780,y+950,z+780);camera.zoom=1;camera.lookAt(x,y,z);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  let extent=.05;for(const px of [minX-8,maxX+8])for(const pz of [minZ-8,maxZ+8])for(const py of [y-20,y+20]){const p=new Vector3(px,py,pz).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}
  camera.zoom=Math.max(.25,Math.min(20,.85/extent));camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld();host.dataset.visibleSelectedTrees=String((plan?.trees??[]).filter(t=>{const p=new Vector3(t.x+offset(t.worldYear),t.height*heightScale,t.z).project(camera);return Math.abs(p.x)<=1&&Math.abs(p.y)<=1;}).length);render();
  if(ease&&!motionQuery.matches&&!paused&&!document.hidden){const toPosition=camera.position.clone(),toTarget=controls.target.clone(),toZoom=camera.zoom,start=performance.now();const step=(now:number)=>{cameraRaf=0;if(disposed||motionQuery.matches||paused||document.hidden||!intersecting)return;const f=Math.min(1,(now-start)/450),t=f*f*(3-2*f);camera.position.lerpVectors(fromPosition,toPosition,t);controls.target.lerpVectors(fromTarget,toTarget,t);camera.zoom=fromZoom+(toZoom-fromZoom)*t;camera.updateProjectionMatrix();controls.update();render();if(f===1)scheduleRefine();if(f<1)cameraRaf=requestAnimationFrame(step);};step(start);}
 }
 function showPrototype(){
  if(disposed)return;clearActors();farVegetation=[];spatialVegetation=[];for(const effect of waterEffects)effect.dispose();waterEffects=[];for(const r of owned)r.dispose();owned=[];scene.remove(content);content=new Group();scene.add(content);pickMeshes=[];pickTrees.clear();
  const prototype=buildWaterPrototype(),effect=createAnnualWater(prototype,1);effect.setQuality(quality);content.add(effect.root);waterEffects.push(effect);
  const vertices:number[]=[],colors:number[]=[];for(let z=-8;z<22;z+=2)for(let x=-16;x<12;x+=2)for(const [px,pz] of [[x,z],[x,z+2],[x+2,z],[x+2,z],[x,z+2],[x+2,z+2]]){const y=pz!<=4?8.6:pz!>=8?2.6:8.6-(pz!-4)*1.5;vertices.push(px!,y,pz!);colors.push(.64,.75,.46);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();const m=new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});content.add(new Mesh(g,m));owned.push(g,m);
  controls.target.set(-2,7,6);camera.position.set(778,957,786);camera.zoom=18;camera.lookAt(-2,7,6);camera.updateProjectionMatrix();controls.update();host.dataset.scene='prototype';host.dataset.falls='1';host.dataset.animalsReady='true';host.dataset.wildlifeCount='0';refreshMotion();render();
 }
 function focus(){if(host.dataset.scene==='prototype')showPrototype();else{fit(true);refineTrees();}}
 return {show,showAnnual,showPrototype,focus,resize,frame(mode:'overview'|'clearing',ease=true){fit(mode==='clearing',ease);if(!ease||motionQuery.matches||paused||document.hidden)refineTrees();},cameraState():GroveCameraState{return {position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};},restoreCamera(state:GroveCameraState){camera.position.fromArray(state.position);controls.target.fromArray(state.target);camera.zoom=state.zoom;camera.updateProjectionMatrix();controls.update();refineTrees();render();},setMotionPaused(next:boolean){paused=next;refreshMotion();},setQuality(next:WaterQuality){for(const effect of waterEffects)effect.setQuality(next);quality=next;host.dataset.quality=next;render();},setLayer(next:DiagnosticLayer){if(annual.length)showAnnual(annual,next,plan);else if(current)show(current,next);},dispose(){if(disposed)return;disposed=true;cancelCamera();clearActors();current=null;if(raf)cancelAnimationFrame(raf);raf=0;intersection.disconnect();motionQuery.removeEventListener('change',reduced);document.removeEventListener('visibilitychange',visibility);for(const effect of waterEffects)effect.dispose();waterEffects=[];observer.disconnect();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);controls.removeEventListener('change',render);controls.removeEventListener('start',cancelCamera);controls.removeEventListener('end',scheduleRefine);window.clearTimeout(refineTimer);controls.dispose();for(const resource of owned)resource.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}

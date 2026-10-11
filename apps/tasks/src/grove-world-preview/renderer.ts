/** Diagnostic only: inspect solved geography, with vertical exaggeration x3. */
import {Scene,WebGLRenderer,OrthographicCamera,Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,Color,HemisphereLight,DirectionalLight,DoubleSide,LineSegments,LineBasicMaterial,Points,PointsMaterial,InstancedMesh,ConeGeometry,Object3D,Raycaster,Vector2,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {AnnualWorld} from '@/domain/grove/world';
import type {AnnualGrovePlan} from '@/domain/grove/annual-plan';
import type {AnnualTree} from '@/domain/grove/planting';
export type DiagnosticLayer='regions'|'elevation'|'lakes'|'receivers'|'accumulation'|'outlets';
export function createWorldPreview(host:HTMLElement,onPick:(tree:AnnualTree)=>void=()=>{}){
 const renderer=new WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
 const scene=new Scene(),camera=new OrthographicCamera(-600,600,600,-600,1,5000);camera.position.set(780,950,780);camera.lookAt(0,0,0);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.25;controls.maxZoom=20;
 scene.add(new HemisphereLight(0xf4f7ff,0x7d8f5a,2));const sun=new DirectionalLight(0xfff3dd,2);sun.position.set(-600,1000,300);scene.add(sun);
 let content=new Group();scene.add(content);let owned:{dispose():void}[]=[],disposed=false,current:AnnualWorld|null=null,layer:DiagnosticLayer='elevation';
 let annual:AnnualWorld[]=[],plan:AnnualGrovePlan|undefined,pickMeshes:InstanceType<typeof InstancedMesh>[]=[],pickTrees=new Map<InstanceType<typeof InstancedMesh>,AnnualTree[]>();
 const offset=(year:number)=>(annual.findIndex(w=>w.key.year===year)-(annual.length-1)/2)*1100;
 const render=()=>{if(!disposed){renderer.render(scene,camera);const t=plan?.trees[0];if(t){const p=new Vector3(t.x+offset(t.worldYear),t.height*3+4*t.scale,t.z).project(camera),r=renderer.domElement.getBoundingClientRect();host.dataset.pickX=String(r.left+(p.x+1)*r.width/2);host.dataset.pickY=String(r.top+(1-p.y)*r.height/2);}}};
 let down={x:0,y:0};const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
 const pointerUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const r=renderer.domElement.getBoundingClientRect(),ray=new Raycaster();ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const hit=ray.intersectObjects(pickMeshes)[0];if(hit?.instanceId!==undefined){const t=pickTrees.get(hit.object as InstanceType<typeof InstancedMesh>)?.[hit.instanceId];if(t)onPick(t);}};
 renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
 const resize=()=>{const width=host.clientWidth||1,height=host.clientHeight||1,aspect=width/height,half=aspect<1?610/aspect:610;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(width,height,false);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';render();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);resize();
 function show(world:AnnualWorld,nextLayer=layer,append=false){
  if(disposed)return;current=world;layer=nextLayer;
  if(!append){for(const resource of owned)resource.dispose();owned=[];scene.remove(content);content=new Group();scene.add(content);pickMeshes=[];pickTrees.clear();} const root=content;content=new Group();content.position.x=offset(world.key.year);root.add(content);
  const positions:number[]=[],colours:number[]=[],g=world.grid,h=world.hydrology,low=new Color('#a3c96b'),high=new Color('#608e48'),flow=new Color('#53c4c6');
  const point=(id:number)=>({x:g.x0+id%g.size*g.step,z:g.z0+Math.floor(id/g.size)*g.step,h:h.bed[id]!});
  for(let iz=0;iz<g.size-1;iz++)for(let ix=0;ix<g.size-1;ix++){const id=iz*g.size+ix;
   for(const i of [id,id+g.size,id+1,id+1,id+g.size,id+g.size+1]){const p=point(i),colour=layer==='accumulation'?low.clone().lerp(flow,Math.log2(h.accumulation[i]!)/Math.log2(h.bed.length)):low.clone().lerp(high,Math.max(0,Math.min(1,(p.h-5)/20)));
    if(layer==='regions'){const owner=world.regions?.owner[i]??-1;if(owner>=0)colour.setHSL((owner*.618)%1,.3,.58);}
    positions.push(p.x,p.h*3,p.z);colours.push(colour.r,colour.g,colour.b);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colours,3));geometry.computeVertexNormals();
  const material=new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});content.add(new Mesh(geometry,material));owned.push(geometry,material);
  let waterTriangles=0;
  for(const [type,descriptors] of [['lake',h.lakes],['stream',h.channels]] as const)for(const d of descriptors){
   if(!d.triangles.length)continue;const vertices=d.triangles.slice();for(let i=1;i<vertices.length;i+=3)vertices[i]=vertices[i]!*3+.05;
   const wg=new BufferGeometry();wg.setAttribute('position',new Float32BufferAttribute(vertices,3));wg.computeVertexNormals();
   const colour=layer==='lakes'&&type==='lake'?new Color().setHSL((.48+d.id*.137)%1,.5,.58):flow;
   const wm=new MeshStandardMaterial({color:colour,side:DoubleSide,roughness:.5});content.add(new Mesh(wg,wm));owned.push(wg,wm);waterTriangles+=vertices.length/9;
  }
  if(layer==='receivers'){
   const lines:number[]=[];for(let i=0;i<h.receiver.length;i+=8){const to=h.receiver[i]!;if(to<0)continue;for(const id of [i,to]){const p=point(id);lines.push(p.x,Math.max(p.h,h.level[id]!)*3+.7,p.z);}}
   const lg=new BufferGeometry();lg.setAttribute('position',new Float32BufferAttribute(lines,3));const lm=new LineBasicMaterial({color:'#608e48'});content.add(new LineSegments(lg,lm));owned.push(lg,lm);
  }
  if(layer==='outlets'){
   const points:number[]=[];for(const id of h.outlets){const p=point(id);points.push(p.x,p.h*3+1,p.z);}
   // Also identify lake spill nodes, not just the coastal boundary roots.
   for(const l of h.lakes){const p=point(l.outletCell);points.push(p.x,l.waterElevation*3+1,p.z);}
   const pg=new BufferGeometry();pg.setAttribute('position',new Float32BufferAttribute(points,3));const pm=new PointsMaterial({color:'#53c4c6',size:4,sizeAttenuation:false});content.add(new Points(pg,pm));owned.push(pg,pm);
  }
  content=root;host.dataset.triangles=String((append?Number(host.dataset.triangles):0)+positions.length/9+waterTriangles);host.dataset.waterTriangles=String(waterTriangles);host.dataset.layer=layer;render();
 }
 function showAnnual(worlds:AnnualWorld[],next:DiagnosticLayer,activity?:AnnualGrovePlan){annual=worlds;plan=activity;worlds.forEach((w,i)=>show(w,next,i>0));
  if(plan){const selected=new Set(plan.trees.map(t=>t.id));for(const species of ['life','health','teaching','wedding','other','late'])for(const active of [false,true]){const trees=plan.contextTrees.filter(t=>t.species===species&&selected.has(t.id)===active);if(!trees.length)continue;
   const geometry=new ConeGeometry(1.2,6,5),material=new MeshStandardMaterial({color:active?['#427f42','#689b55','#66876c','#98ac63','#658d70','#8b7c59'][['life','health','teaching','wedding','other','late'].indexOf(species)]: '#a2b3a2',roughness:1});const mesh=new InstancedMesh(geometry,material,trees.length),dummy=new Object3D();
   trees.forEach((t,i)=>{dummy.position.set(t.x+offset(t.worldYear),t.height*3+3*t.scale,t.z);dummy.scale.setScalar(t.scale);dummy.rotation.y=t.rotation;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();content.add(mesh);owned.push(geometry,material);pickMeshes.push(mesh);pickTrees.set(mesh,trees);
  }
  for(const kind of ['grass','rock','flower']){const props=[...plan.baselineProps,...plan.activityProps].filter(p=>p.kind===kind);if(!props.length)continue;const geometry=new ConeGeometry(kind==='rock'?.65:.3,kind==='rock'?1:.7,kind==='rock'?5:3),material=new MeshStandardMaterial({color:kind==='rock'?'#9b9f91':kind==='flower'?'#d7b77c':'#839e62',roughness:1}),mesh=new InstancedMesh(geometry,material,props.length),dummy=new Object3D();props.forEach((p,i)=>{dummy.position.set(p.x+offset(p.worldYear),p.height*3+.35,p.z);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();content.add(mesh);owned.push(geometry,material);}
  }fit(false);render();
 }
 function fit(selection:boolean){
  const trees=selection?plan?.trees??[]:[],points=trees.length?trees.map(t=>({x:t.x+offset(t.worldYear),z:t.z,y:t.height*3})):annual.flatMap(w=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:offset(w.key.year)+x*w.grid.extent/2,z:z*w.grid.extent/2,y:0}))));
  if(!points.length)return;const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),x=(minX+maxX)/2,z=(minZ+maxZ)/2,y=trees.length?trees.reduce((n,t)=>n+t.height*3,0)/trees.length:0;
  controls.target.set(x,y,z);camera.position.set(x+780,y+950,z+780);camera.zoom=1;camera.lookAt(x,y,z);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  let extent=.05;for(const px of [minX-8,maxX+8])for(const pz of [minZ-8,maxZ+8])for(const py of [y-20,y+20]){const p=new Vector3(px,py,pz).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}
  camera.zoom=Math.max(.25,Math.min(20,.85/extent));camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld();host.dataset.visibleSelectedTrees=String((plan?.trees??[]).filter(t=>{const p=new Vector3(t.x+offset(t.worldYear),t.height*3,t.z).project(camera);return Math.abs(p.x)<=1&&Math.abs(p.y)<=1;}).length);render();
 }
 function focus(){fit(true);}
 return {show,showAnnual,focus,setLayer(next:DiagnosticLayer){if(annual.length)showAnnual(annual,next,plan);else if(current)show(current,next);},dispose(){if(disposed)return;disposed=true;current=null;observer.disconnect();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);controls.removeEventListener('change',render);controls.dispose();for(const resource of owned)resource.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}

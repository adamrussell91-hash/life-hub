/** Diagnostic only: inspect solved geography, with vertical exaggeration x3. */
import {Scene,WebGLRenderer,OrthographicCamera,Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,Color,HemisphereLight,DirectionalLight,DoubleSide,LineSegments,LineBasicMaterial,Points,PointsMaterial} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {AnnualWorld} from '@/domain/grove/world';
export type DiagnosticLayer='elevation'|'lakes'|'receivers'|'accumulation'|'outlets';
export function createWorldPreview(host:HTMLElement){
 const renderer=new WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
 const scene=new Scene(),camera=new OrthographicCamera(-600,600,600,-600,1,5000);camera.position.set(780,950,780);camera.lookAt(0,0,0);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.5;controls.maxZoom=5;
 scene.add(new HemisphereLight(0xf4f7ff,0x7d8f5a,2));const sun=new DirectionalLight(0xfff3dd,2);sun.position.set(-600,1000,300);scene.add(sun);
 let content=new Group();scene.add(content);let owned:{dispose():void}[]=[],disposed=false,current:AnnualWorld|null=null,layer:DiagnosticLayer='elevation';
 const render=()=>{if(!disposed)renderer.render(scene,camera);};
 const resize=()=>{const width=host.clientWidth||1,height=host.clientHeight||1,aspect=width/height,half=aspect<1?610/aspect:610;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(width,height,false);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';render();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);resize();
 function show(world:AnnualWorld,nextLayer=layer){
  if(disposed)return;current=world;layer=nextLayer;
  for(const resource of owned)resource.dispose();owned=[];scene.remove(content);content=new Group();scene.add(content);
  const positions:number[]=[],colours:number[]=[],g=world.grid,h=world.hydrology,low=new Color('#a3c96b'),high=new Color('#608e48'),flow=new Color('#53c4c6');
  const point=(id:number)=>({x:g.x0+id%g.size*g.step,z:g.z0+Math.floor(id/g.size)*g.step,h:h.bed[id]!});
  for(let iz=0;iz<g.size-1;iz++)for(let ix=0;ix<g.size-1;ix++){const id=iz*g.size+ix;
   for(const i of [id,id+g.size,id+1,id+1,id+g.size,id+g.size+1]){const p=point(i),colour=layer==='accumulation'?low.clone().lerp(flow,Math.log2(h.accumulation[i]!)/Math.log2(h.bed.length)):low.clone().lerp(high,Math.max(0,Math.min(1,(p.h-5)/20)));
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
  host.dataset.triangles=String(positions.length/9+waterTriangles);host.dataset.waterTriangles=String(waterTriangles);host.dataset.layer=layer;render();
 }
 return {show,setLayer(next:DiagnosticLayer){if(current)show(current,next);},dispose(){if(disposed)return;disposed=true;current=null;observer.disconnect();controls.removeEventListener('change',render);controls.dispose();for(const resource of owned)resource.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}

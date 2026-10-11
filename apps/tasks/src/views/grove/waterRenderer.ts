/** Original Grove water shaders: positions remain exactly on the shared wet footprint. */
import {Group,BufferGeometry,Float32BufferAttribute,ShaderMaterial,Mesh,DoubleSide,InstancedMesh,ConeGeometry,MeshBasicMaterial,Object3D} from 'three';
import type {WorldMeshes,FallMesh} from '@/domain/grove/world-meshes';
import {WATER_PERIOD,qualitySettings,type WaterQuality} from '@/domain/grove/motion';
const vertexShader=[
 'attribute vec2 flow; attribute vec2 phase;',
 'varying vec2 vFlow; varying vec2 vPhase;',
 'void main(){vFlow=flow;vPhase=phase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
].join('\n');
const fragmentShader=[
 'uniform float time;uniform float mode;uniform float detail;uniform float offset;',
 'varying vec2 vFlow;varying vec2 vPhase;',
 'const float TAU=6.28318530718;',
 'void main(){',
 'float clock=time/80.0;',
 'float band=0.5+0.5*sin(TAU*(vFlow.x*0.22-clock*24.0+offset));',
 'float cross=0.5+0.5*cos(vFlow.y*3.0);',
 'float ripple=sin(TAU*(vPhase.x*0.055+vPhase.y*0.035-clock*3.0+offset))*cos(TAU*(vPhase.y*0.07+clock*5.0));',
 'vec3 base=vec3(0.325,0.769,0.776);',
 'float light=mode<0.5 ? 0.05*ripple*detail : pow(band,4.0)*0.19*cross;',
 'if(mode>1.5)light=0.15+pow(band,3.0)*0.35;',
 'if(mode>2.5){base=vec3(0.85,0.94,0.89);light=0.025*ripple*min(detail,1.0);}',
 'gl_FragColor=vec4(base+light,1.0);',
 '#include <tonemapping_fragment>',
 '#include <colorspace_fragment>',
 '}'
].join('\n');
type Disposable={dispose():void};
export function createAnnualWater(meshes:WorldMeshes,heightScale=1){
 const root=new Group();root.scale.y=heightScale;
 const owned:Disposable[]=[],materials:InstanceType<typeof ShaderMaterial>[]=[],sprays:{mesh:InstanceType<typeof InstancedMesh>;fall:FallMesh}[]=[];
 let quality:WaterQuality='medium',disposed=false,lastPhase=0,lastVisible:(position:{x:number;y:number;z:number})=>boolean=()=>true;
 function surface(positions:Float32Array,flow:Float32Array,phase:Float32Array,mode:number,seed:number){
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('flow',new Float32BufferAttribute(flow,2));g.setAttribute('phase',new Float32BufferAttribute(phase,2));
  const m=new ShaderMaterial({vertexShader,fragmentShader,side:DoubleSide,uniforms:{time:{value:0},mode:{value:mode},detail:{value:1},offset:{value:((seed*0.61803398875)%1+1)%1}},polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new Mesh(g,m);root.add(mesh);owned.push(g,m);materials.push(m);return mesh;
 }
 for(const water of meshes.water)surface(water.positions,water.flow,water.phase,water.kind==='lake'?0:1,water.sourceId);
 for(const [index,fall] of meshes.falls.entries()){
  surface(fall.positions,fall.flow,fall.phase,2,index);
  if(fall.foam.length){const count=fall.foam.length/3,flow=new Float32Array(count*2),phase=new Float32Array(count*2);for(let i=0;i<count;i++){phase[i*2]=fall.foam[i*3]!;phase[i*2+1]=fall.foam[i*3+2]!;}surface(fall.foam,flow,phase,3,index);}
  if(index<4){const g=new ConeGeometry(.045,.16,3),m=new MeshBasicMaterial({color:'#d9eee4'}),mesh=new InstancedMesh(g,m,24);mesh.frustumCulled=false;root.add(mesh);owned.push(mesh,g,m);sprays.push({mesh,fall});}
 }
 const dummy=new Object3D();
 function setQuality(next:WaterQuality){const settings=qualitySettings(next);quality=next;for(const m of materials)m.uniforms.detail.value=settings.detail;for(const s of sprays)s.mesh.count=settings.particlesPerFall;update(lastPhase,lastVisible);}
 function update(phase:number,visible:(position:{x:number;y:number;z:number})=>boolean=()=>true){
  if(disposed)return;lastPhase=phase;lastVisible=visible;const t=((phase%WATER_PERIOD)+WATER_PERIOD)%WATER_PERIOD;for(const m of materials)m.uniforms.time.value=t;
  for(const {mesh,fall} of sprays){const p=fall.positions,end=p.length>=18?{x:(p[3]!+p[15]!)/2,y:Math.min(...p.filter((_,i)=>i%3===1)),z:(p[5]!+p[17]!)/2}:{x:0,y:0,z:0};mesh.visible=visible(end);
   if(!mesh.visible)continue;for(let i=0;i<mesh.count;i++){const life=((t/WATER_PERIOD*40+i*.61803398875)%1+1)%1,angle=i*2.3999632297;dummy.position.set(end.x+Math.cos(angle)*life*.65,end.y+Math.sin(life*Math.PI)*.6,end.z+Math.sin(angle)*life*.65);dummy.scale.setScalar(.5+(1-life)*.5);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;
  }
 }
 setQuality(quality);update(0);
 return {root,setQuality,update,stats:()=>({waterMeshes:meshes.water.length,falls:meshes.falls.length,particles:sprays.filter(s=>s.mesh.visible).reduce((n,s)=>n+s.mesh.count,0),quality}),dispose(){if(disposed)return;disposed=true;for(const r of owned)r.dispose();root.clear();}};
}

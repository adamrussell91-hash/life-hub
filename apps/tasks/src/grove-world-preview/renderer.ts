/** Diagnostic only: proposed basin surfaces and vertical exaggeration are not runtime geography. */
import {Scene,WebGLRenderer,OrthographicCamera,Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,Color,HemisphereLight,DirectionalLight,DoubleSide} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {AnnualWorld} from '@/domain/grove/world';

export function createWorldPreview(host:HTMLElement) {
  const renderer=new WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
  const scene=new Scene(),camera=new OrthographicCamera(-600,600,600,-600,1,5000);
  camera.position.set(780,950,780);camera.lookAt(0,0,0);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.5;controls.maxZoom=5;
  scene.add(new HemisphereLight(0xf4f7ff,0x7d8f5a,2));const sun=new DirectionalLight(0xfff3dd,2);sun.position.set(-600,1000,300);scene.add(sun);
  let content=new Group();scene.add(content);
  let owned:{dispose():void}[]=[],disposed=false;
  const render=()=>{if(!disposed)renderer.render(scene,camera);};
  const resize=()=>{
    const width=host.clientWidth||1,height=host.clientHeight||1,aspect=width/height;
    const half=aspect<1?610/aspect:610;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';render();
  };
  const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);resize();
  function show(world:AnnualWorld) {
    for(const resource of owned)resource.dispose();owned=[];scene.remove(content);content=new Group();scene.add(content);
    const positions:number[]=[],colours:number[]=[],water:number[]=[],g=world.grid;
    const low=new Color('#a3c96b'),high=new Color('#608e48');
    const point=(id:number)=>({x:g.x0+id%g.size*g.step,z:g.z0+Math.floor(id/g.size)*g.step,h:world.bed[id]!});
    for(let iz=0;iz<g.size-1;iz++)for(let ix=0;ix<g.size-1;ix++){
      const id=iz*g.size+ix,indices=[id,id+g.size,id+1,id+1,id+g.size,id+g.size+1];
      for(const i of indices){const p=point(i),colour=low.clone().lerp(high,Math.max(0,Math.min(1,(p.h-5)/20)));
        positions.push(p.x,p.h*3,p.z);colours.push(colour.r,colour.g,colour.b);}
      for(const basin of world.basins){
        const corners=[point(id),point(id+g.size),point(id+1),point(id+g.size+1)];
        if(!corners.some(p=>Math.hypot((p.x-basin.cx)/basin.rx,(p.z-basin.cz)/basin.rz)<1.1))continue;
        for(const tri of [[0,1,2],[2,1,3]]){
          const polygon:typeof corners=[];
          for(let j=0;j<3;j++){
            const a=corners[tri[j]!]!,b=corners[tri[(j+1)%3]!]!,da=basin.proposedSpillHeight-a.h,db=basin.proposedSpillHeight-b.h;
            if(da>=0)polygon.push(a);
            if((da>=0)!==(db>=0)){const f=da/(da-db);polygon.push({x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,h:basin.proposedSpillHeight});}
          }
          for(let j=1;j<polygon.length-1;j++)for(const p of [polygon[0]!,polygon[j]!,polygon[j+1]!])water.push(p.x,basin.proposedSpillHeight*3+.15,p.z);
        }
      }
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colours,3));geometry.computeVertexNormals();
    const material=new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});content.add(new Mesh(geometry,material));owned.push(geometry,material);
    const waterGeometry=new BufferGeometry();waterGeometry.setAttribute('position',new Float32BufferAttribute(water,3));waterGeometry.computeVertexNormals();
    const waterMaterial=new MeshStandardMaterial({color:'#53c4c6',side:DoubleSide,roughness:.5});content.add(new Mesh(waterGeometry,waterMaterial));owned.push(waterGeometry,waterMaterial);
    host.dataset.triangles=String((positions.length+water.length)/9);render();
  }
  return {show,dispose(){if(disposed)return;disposed=true;observer.disconnect();controls.removeEventListener('change',render);controls.dispose();for(const resource of owned)resource.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}

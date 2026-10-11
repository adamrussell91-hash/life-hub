/** Faceted terrain and inexpensive static water. Geometry uses the same mask as planting/motion. */
import {BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Color, Group, DoubleSide} from 'three';
import {sampleTerrain, terrainTile, TERRAIN_ROW, streamCentre, terrainBed} from '@/domain/grove/terrain';
import type {GroveDay} from '@/domain/grove/plan';
type Bounds={minX:number;maxX:number;minZ:number;maxZ:number};
export function createGroveGround(days:GroveDay[],origin:{x:number;z:number},bounds:Bounds) {
  const root=new Group(),owned:{dispose():void}[]=[],positions:number[]=[],colors:number[]=[],water:number[]=[];
  const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
  const nx=Math.min(220,Math.ceil(width/.5)),nz=Math.min(700,Math.ceil(depth/.5));
  const green=new Color('#86b55b'),meadow=new Color('#bdd27a'),clearing=new Color('#a3c96b');
  const rows=new Map<number,GroveDay[]>();
  for(const day of days) {const row=Math.round(day.cz/TERRAIN_ROW),list=rows.get(row)??[];list.push(day);rows.set(row,list);}
  const inside=(x:number,z:number)=>{
    const r=Math.min(9,width/2,depth/2);
    const dx=Math.max(bounds.minX+r-x,0,x-(bounds.maxX-r)),dz=Math.max(bounds.minZ+r-z,0,z-(bounds.maxZ-r));
    return dx*dx+dz*dz<=r*r;
  };
  const boundary=(x:number,z:number)=> {
    const r=Math.min(9,width/2,depth/2);
    const cx=Math.max(bounds.minX+r,Math.min(bounds.maxX-r,x));
    const cz=Math.max(bounds.minZ+r,Math.min(bounds.maxZ-r,z));
    const dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz);
    return d>r ? {x:cx+dx*r/d,z:cz+dz*r/d} : {x,z};
  };
  const vertex=(x:number,z:number)=> {
    ({x,z}=boundary(x,z));
    const worldX=x+origin.x,worldZ=z+origin.z,t=sampleTerrain(worldX,worldZ);
    const colour=green.clone(),row=Math.round(worldZ/TERRAIN_ROW);
    let nearest:GroveDay|undefined,dist=Infinity;
    for(const d of rows.get(row)??[]) {const next=Math.hypot(d.cx-worldX,d.cz-worldZ);if(next<dist){nearest=d;dist=next;}}
    if(nearest) colour.lerp(nearest.weekend || nearest.holiday ? meadow : clearing,Math.max(0,1-dist/(nearest.radius+4))*.8);
    colour.multiplyScalar(.96+Math.sin(worldX*.6+worldZ*.8)*.025);
    return {x,z,y:t.height,colour};
  };
  for(let iz=0;iz<nz;iz++) for(let ix=0;ix<nx;ix++) {
    const x=bounds.minX+ix*width/nx,z=bounds.minZ+iz*depth/nz,x1=x+width/nx,z1=z+depth/nz;
    if(![[x,z],[x1,z],[x,z1],[x1,z1]].some(([px,pz])=>inside(px!,pz!))) continue;
    const corners=[vertex(x,z),vertex(x1,z),vertex(x,z1),vertex(x1,z1)];
    for(const i of [0,2,1,1,2,3]) {const v=corners[i]!;positions.push(v.x,v.y,v.z);colors.push(v.colour.r,v.colour.g,v.colour.b);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});
  const ground=new Mesh(geometry,material);ground.receiveShadow=true;root.add(ground);owned.push(geometry,material);
  const skirt:number[]=[],r=Math.min(9,width/2,depth/2);
  const corners=[[bounds.maxX-r,bounds.maxZ-r,0],[bounds.minX+r,bounds.maxZ-r,Math.PI/2],[bounds.minX+r,bounds.minZ+r,Math.PI],[bounds.maxX-r,bounds.minZ+r,Math.PI*1.5]];
  const perimeter:{x:number;z:number}[]=[];
  for(const [cx,cz,start] of corners) for(let i=0;i<=18;i++) {
    const a=start!+i/18*Math.PI/2;
    perimeter.push({x:cx!+Math.cos(a)*r,z:cz!+Math.sin(a)*r});
  }
  for(let i=0;i<perimeter.length;i++) {
    const a=perimeter[i]!,b=perimeter[(i+1)%perimeter.length]!,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)));
    for(let j=0;j<n;j++) {
      const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n,x1=a.x+(b.x-a.x)*(j+1)/n,z1=a.z+(b.z-a.z)*(j+1)/n;
      const y=sampleTerrain(x+origin.x,z+origin.z).height,y1=sampleTerrain(x1+origin.x,z1+origin.z).height;
      skirt.push(x,y,z,x,-1.45,z,x1,y1,z1,x1,y1,z1,x,-1.45,z,x1,-1.45,z1);
    }
  }
  const skirtGeometry=new BufferGeometry();skirtGeometry.setAttribute('position',new Float32BufferAttribute(skirt,3));skirtGeometry.computeVertexNormals();
  const skirtMaterial=new MeshStandardMaterial({color:'#9a7350',roughness:1,flatShading:true,side:DoubleSide});
  root.add(new Mesh(skirtGeometry,skirtMaterial));owned.push(skirtGeometry,skirtMaterial);
  const first=Math.floor((bounds.minZ+origin.z+13)/TERRAIN_ROW),last=Math.floor((bounds.maxZ+origin.z+13)/TERRAIN_ROW);
  for(let row=first;row<=last;row++) {
    const tile=terrainTile(row);
    for(let iz=0;iz<tile.height-1;iz++) for(let ix=0;ix<tile.width-1;ix++) {
      const id=iz*tile.width+ix,x=tile.x0+ix-origin.x,z=tile.z0+iz-origin.z;
      if(x<bounds.minX || x+1>bounds.maxX || z<bounds.minZ || z+1>bounds.maxZ || !inside(x+.5,z+.5)) continue;
      // Clip each triangle at the actual shoreline, interpolating depth rather than drawing a square mask.
      const ids=[id,id+tile.width,id+1,id+tile.width+1];
      const points=ids.map(n=>({x:tile.x0+n%tile.width-origin.x,z:tile.z0+Math.floor(n/tile.width)-origin.z,y:tile.level[n]!+.035,depth:tile.level[n]!-tile.bed[n]!-.12}));
      for(const indices of [[0,1,2],[2,1,3]]) {
        const triangle=indices.map(i=>points[i]!),polygon:typeof triangle=[];
        for(let i=0;i<3;i++) {
          const a=triangle[i]!,b=triangle[(i+1)%3]!;
          if(a.depth>=0) polygon.push(a);
          if((a.depth>=0)!==(b.depth>=0)) {
            const f=a.depth/(a.depth-b.depth);
            polygon.push({x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,y:a.y+(b.y-a.y)*f,depth:0});
          }
        }
        for(let i=1;i<polygon.length-1;i++) for(const p of [polygon[0]!,polygon[i]!,polygon[i+1]!]) water.push(p.x,p.y,p.z);
      }

    }
    // The carved low valley supplies one continuous stream, including cells that drain at tile edges.
    for(let wx=tile.x0;wx<tile.x0+tile.width-1;wx+=.5) {
      const wz=streamCentre(wx,row),wz1=streamCentre(wx+.5,row);
      const x=wx-origin.x,z=wz-origin.z,x1=wx+.5-origin.x,z1=wz1-origin.z;
      if(x<bounds.minX || x1>bounds.maxX || z-.5<bounds.minZ || z+.5>bounds.maxZ || !inside(x,z)) continue;
      const y=terrainBed(wx,wz)+.15,y1=terrainBed(wx+.5,wz1)+.15;
      water.push(x,y,z-.5,x,y,z+.5,x1,y1,z1-.5,x1,y1,z1-.5,x,y,z+.5,x1,y1,z1+.5);
    }
  }
  const waterGeometry=new BufferGeometry();waterGeometry.setAttribute('position',new Float32BufferAttribute(water,3));waterGeometry.computeVertexNormals();
  const waterMaterial=new MeshStandardMaterial({color:'#53c4c6',roughness:.32,metalness:.08,side:DoubleSide});
  root.add(new Mesh(waterGeometry,waterMaterial));owned.push(waterGeometry,waterMaterial);
  return {root,dispose(){for(const item of owned)item.dispose();}};
}

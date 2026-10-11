/** Original annual beds. Basin surfaces here are proposals, not solved hydrology. */
import {hashString,seededRandom} from './random';
import {worldIdentity,WORLD_RECIPE_V1,type WorldKey} from './world-key';

export type MeadowReserve=Readonly<{id:string;cx:number;cz:number;radius:number;height:number}>;
export type IslandBed=Readonly<{cx:number;cz:number;rx:number;rz:number;height:number}>;
export type BasinShape=Readonly<{
  id:string;cx:number;cz:number;rx:number;rz:number;depth:number;
  proposedSpillHeight:number;notch:Readonly<{x:number;z:number}>;island:IslandBed|null;
}>;
export type WorldGrid=Readonly<{size:number;extent:number;x0:number;z0:number;step:number}>;

const smooth=(t:number)=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
const blend=(a:number,b:number,t:number)=>a+(b-a)*smooth(t);
function noise(seed:string,x:number,z:number):number {
  const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);
  const value=(a:number,b:number)=>hashString(`${seed}:${a}:${b}`)/4294967295*2-1;
  const a=value(ix,iz)*(1-fx)+value(ix+1,iz)*fx;
  const b=value(ix,iz+1)*(1-fx)+value(ix+1,iz+1)*fx;
  return a*(1-fz)+b*fz;
}
const ellipse=(x:number,z:number,cx:number,cz:number,rx:number,rz:number)=>Math.hypot((x-cx)/rx,(z-cz)/rz);

export function generateHeightfield(key:WorldKey) {
  const identity=worldIdentity(key),rand=seededRandom(`${identity}:basins`);
  const cx=-165+(rand()-.5)*25,cz=-115+(rand()-.5)*25,rx=100+rand()*12,rz=72+rand()*10;
  const island=Object.freeze({cx:cx+10,cz:cz+4,rx:24,rz:18,height:8});
  const basins:readonly BasinShape[]=Object.freeze([
    Object.freeze({id:'large-basin',cx,cz,rx,rz,depth:7,proposedSpillHeight:3,notch:Object.freeze({x:cx+rx*1.08,z:cz}),island}),
    (()=>{const cx=170+(rand()-.5)*22,cz=120+(rand()-.5)*22,rx=53+rand()*8,rz=43+rand()*8;
      return Object.freeze({id:'small-basin',cx,cz,rx,rz,depth:5,proposedSpillHeight:2.5,notch:Object.freeze({x:cx+rx*1.08,z:cz}),island:null});})()
  ]);
  const meadowRandom=seededRandom(`${identity}:meadows`);
  const meadows:readonly MeadowReserve[]=Object.freeze([
    {id:'west-meadow',cx:-220,cz:170,radius:90,height:7},
    {id:'central-meadow',cx:35,cz:-55,radius:88,height:6.5},
    {id:'east-meadow',cx:235,cz:-205,radius:85,height:8}
  ].map(m=>Object.freeze({...m,cx:m.cx+(meadowRandom()-.5)*14,cz:m.cz+(meadowRandom()-.5)*14})));
  const elevationSeed=`${identity}:elevation`;
  const ridgeRandom=seededRandom(`${identity}:ridges`),ridgeShift=(ridgeRandom()-.5)*50;
  const grid:WorldGrid=Object.freeze({...WORLD_RECIPE_V1,step:WORLD_RECIPE_V1.extent/(WORLD_RECIPE_V1.size-1)});
  const bed=new Float32Array(grid.size*grid.size);
  for(let iz=0;iz<grid.size;iz++)for(let ix=0;ix<grid.size;ix++) {
    const x=grid.x0+ix*grid.step,z=grid.z0+iz*grid.step;
    let h=8+noise(elevationSeed,x/210,z/210)*3+noise(`${elevationSeed}:relief`,x/70,z/70)*.8;
    h+=13*Math.exp(-(((x+80-ridgeShift)/155)**2+((z-300)/85)**2));
    h+=10*Math.exp(-(((x-300)/95)**2+((z-20-ridgeShift)/210)**2));
    h-=2*Math.exp(-(((x-z*.25)/90)**2));
    for(const m of meadows){const d=Math.hypot(x-m.cx,z-m.cz)/m.radius;if(d<1.3)h=blend(m.height,h,(d-.65)/.65);}
    for(const b of basins){
      const d=ellipse(x,z,b.cx,b.cz,b.rx,b.rz);
      if(d<1.35){
        const floor=b.proposedSpillHeight-b.depth+b.depth*Math.min(d,1)**2;
        const rim=b.proposedSpillHeight+2.5;
        const shaped=d<=1?floor:blend(b.proposedSpillHeight,rim,(d-1)/.15);
        h=blend(shaped,h,(d-1.15)/.2);
        const notchDistance=Math.hypot((x-b.notch.x)/18,(z-b.notch.z)/12);
        if(notchDistance<1.5)h=blend(b.proposedSpillHeight,h,notchDistance/1.5);
        if(b.island){const i=b.island,q=ellipse(x,z,i.cx,i.cz,i.rx,i.rz);if(q<1.25)h=blend(i.height,h,q/1.25);}
      }
    }
    // Smoothly lift low terrain across the outer 35 m; the perimeter stays
    // at least one metre above either proposed basin surface.
    const edgeDistance=Math.min(x-grid.x0,z-grid.z0,grid.x0+grid.extent-x,grid.z0+grid.extent-z);
    h=blend(Math.max(4,h),h,edgeDistance/35);
    bed[iz*grid.size+ix]=h;
  }
  return {grid,bed,basins,meadows};
}

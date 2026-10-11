/** Annual actors use the same solved footprint as terrain and water rendering. */
import type {AnnualWorld} from './world';
import {distanceToSegment,isLandPathSafe,sampleGeography} from './geography';
import {seededRandom} from './random';
import type {PathPoint} from './wildlife';

export function isAnnualLandPathSafe(world:AnnualWorld,path:readonly PathPoint[],obstacles:readonly PathPoint[]=[]):boolean {
 try {
  if(!isLandPathSafe(world,path,.5))return false;
  for(const obstacle of obstacles){if(path.length===1&&Math.hypot(path[0]!.x-obstacle.x,path[0]!.z-obstacle.z)<=1)return false;
   for(let i=1;i<path.length;i++)if(distanceToSegment(obstacle.x,obstacle.z,path[i-1]!,path[i]!).distance<=1)return false;
  }return true;
 }catch{return false;}
}
/** Clip a segment against each triangle, then require its interval union to cover [0,1].
 * Sampling endpoints or small steps can miss a dry island or a narrow gap. */
export function isSwimPathSafe(world:AnnualWorld,path:readonly PathPoint[]):boolean {
 if(!path.length)return false;
 const g=world.grid;
 if(path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)||p.x<g.x0||p.z<g.z0||p.x>g.x0+g.extent||p.z>g.z0+g.extent))return false;
 if(path.length===1)return sampleGeography(world,path[0]!.x,path[0]!.z,0).waterType!=='dry';
 for(let segment=1;segment<path.length;segment++){
  const a=path[segment-1]!,b=path[segment]!,intervals:[number,number][]=[];
  for(const descriptor of [...world.hydrology.lakes,...world.hydrology.channels]){
   const t=descriptor.triangles;
   for(let i=0;i<t.length;i+=9){
    const area=(t[i+3]!-t[i]!)*(t[i+8]!-t[i+2]!)-(t[i+5]!-t[i+2]!)*(t[i+6]!-t[i]!);
    if(Math.abs(area)<1e-12)continue;
    const sign=Math.sign(area);let lo=0,hi=1;
    for(let edge=0;edge<3;edge++){
     const p=i+edge*3,q=i+((edge+1)%3)*3,dx=t[q]!-t[p]!,dz=t[q+2]!-t[p+2]!;
     const start=sign*(dx*(a.z-t[p+2]!)-dz*(a.x-t[p]!)),change=sign*(dx*(b.z-a.z)-dz*(b.x-a.x));
     if(Math.abs(change)<1e-14){if(start<0){hi=-1;break;}}
     else if(change>0)lo=Math.max(lo,-start/change);else hi=Math.min(hi,-start/change);
    }
    if(lo<=hi&&hi>=0&&lo<=1)intervals.push([Math.max(0,lo),Math.min(1,hi)]);
   }
  }
  intervals.sort((u,v)=>u[0]-v[0]);let covered=0;
  for(const [lo,hi] of intervals){if(lo>covered+1e-10)break;covered=Math.max(covered,hi);}
  if(covered<1-1e-10)return false;
 }return true;
}
export function annualLandPath(world:AnnualWorld,seed:string,cx:number,cz:number,obstacles:readonly PathPoint[]=[]):PathPoint[]{
 const random=seededRandom('annual-wildlife:'+seed);let first:PathPoint|undefined;
 for(let i=0;i<80;i++){const angle=random()*Math.PI*2,r=i===0?0:random()*7,p={x:cx+Math.cos(angle)*r,z:cz+Math.sin(angle)*r};if(isAnnualLandPathSafe(world,[p],obstacles)){first=p;break;}}
 if(!first)return [];
 const path=[first];
 for(let i=0;i<48&&path.length<8;i++){const a=random()*Math.PI*2,r=1+random()*2,prev=path[path.length-1]!,next={x:prev.x+Math.sin(a)*r,z:prev.z+Math.cos(a)*r};if(Math.hypot(next.x-cx,next.z-cz)<=9&&isAnnualLandPathSafe(world,[prev,next],obstacles))path.push(next);}
 return path.length>1?[...path,...path.slice(1,-1).reverse(),first]:[];
}
/** Nearby candidates come from both actual lake and channel triangles; never synthetic water. */
export function annualSwimPath(world:AnnualWorld,cx:number,cz:number):PathPoint[]{
 const candidates:{x:number;z:number;distance:number;tip:PathPoint}[]=[];
 for(const descriptor of [...world.hydrology.lakes,...world.hydrology.channels])for(let i=0;i<descriptor.triangles.length;i+=9){const t=descriptor.triangles,x=(t[i]!+t[i+3]!+t[i+6]!)/3,z=(t[i+2]!+t[i+5]!+t[i+8]!)/3,distance=Math.hypot(x-cx,z-cz);if(distance<=32)candidates.push({x,z,distance,tip:{x:t[i]!*.25+x*.75,z:t[i+2]!*.25+z*.75}});}
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const p of candidates.slice(0,128)){
  for(const tip of [{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},p.tip]){if(Math.hypot(tip.x-p.x,tip.z-p.z)<.05)continue;const path=[{x:p.x,z:p.z},tip,{x:p.x,z:p.z}];if(isSwimPathSafe(world,path))return path;}
 }return [];
}
export function annualAnimalHeight(world:AnnualWorld,x:number,z:number,swimming:boolean,waterline:number,actorScaleY:number,heightScale=1):number {
 const s=sampleGeography(world,x,z,0);
 if(swimming){if(s.waterElevation===null)throw Error('Annual swimmer left its water footprint');return s.waterElevation*heightScale-waterline*actorScaleY;}
 return s.bedElevation*heightScale;
}

/** Full annual grid hydrology; no render chunk or calendar boundary participates. */
import type {generateHeightfield,WorldGrid} from './heightfield';
import {gridPoint,lakeGeometry,shoreLoops,shoreIntersection,channelGeometry,type Lake,type Channel,type ChannelPoint,type ChannelEnd,type Fall} from './water';
export const HYDROLOGY_RECIPE=Object.freeze({version:1,areaThreshold:160,maxCarve:.35,iterations:1});
export type Drainage={level:Float32Array;receiver:Int32Array;accumulation:Uint32Array;order:Int32Array;outlets:Int32Array};
export type Hydrology=Drainage&{recipeVersion:number;bed:Float32Array;lakeId:Int32Array;lakes:readonly Lake[];channels:readonly Channel[];falls:readonly Fall[];quality:Readonly<{dryFraction:number;channelLength:number;substantialLakes:number}>};
type Entry={id:number;height:number};
class Heap{
 private items:Entry[]=[];
 get length(){return this.items.length;}
 private less(a:Entry,b:Entry){return a.height<b.height||a.height===b.height&&a.id<b.id;}
 push(e:Entry){let i=this.items.length;this.items.push(e);while(i){const p=(i-1)>>1;if(!this.less(e,this.items[p]!))break;this.items[i]=this.items[p]!;i=p;}this.items[i]=e;}
 pop(){const root=this.items[0]!,last=this.items.pop()!;if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.less(this.items[c+1]!,this.items[c]!))c++;if(!this.less(this.items[c]!,last))break;this.items[i]=this.items[c]!;i=c;}this.items[i]=last;}return root;}
}
export function neighbours(id:number,size:number,diagonal=false):number[]{const x=id%size,z=Math.floor(id/size),out:number[]=[];if(x>0)out.push(id-1);if(x<size-1)out.push(id+1);if(z>0)out.push(id-size);if(z<size-1)out.push(id+size);if(diagonal){if(x>0&&z<size-1)out.push(id+size-1);if(x<size-1&&z>0)out.push(id-size+1);}return out;}
/** Receiver-first order is the reverse of a Kahn source-to-outlet traversal. */
export function accumulate(receiver:Int32Array):{order:Int32Array;accumulation:Uint32Array}{
 const n=receiver.length,incoming=new Uint32Array(n),area=new Uint32Array(n).fill(1),queue=new Int32Array(n);let count=0;
 for(const to of receiver){if(to>=n||to< -1)throw Error('Invalid drainage receiver');if(to>=0)incoming[to]!++;}
 for(let i=0;i<n;i++)if(!incoming[i])queue[count++]=i;
 for(let k=0;k<count;k++){const i=queue[k]!,to=receiver[i]!;if(to>=0){area[to]!+=area[i]!;if(--incoming[to]===0)queue[count++]=to;}}
 if(count!==n)throw Error('Cyclic drainage graph');return {order:queue.reverse(),accumulation:area};
}
export function analyseDrainage(bed:Float32Array,size:number):Drainage{
 if(!Number.isInteger(size)||size<2||!(bed instanceof Float32Array)||bed.length!==size*size||!bed.every(Number.isFinite))throw Error('Invalid drainage grid');
 const n=bed.length,level=bed.slice(),receiver=new Int32Array(n).fill(-1),visited=new Uint8Array(n),heap=new Heap(),outlets:number[]=[];
 for(let id=0;id<n;id++){const x=id%size,z=Math.floor(id/size);if(x===0||z===0||x===size-1||z===size-1){visited[id]=1;heap.push({id,height:bed[id]!});outlets.push(id);}}
 while(heap.length){const p=heap.pop();for(const id of neighbours(p.id,size)){if(visited[id])continue;visited[id]=1;receiver[id]=p.id;level[id]=Math.max(bed[id]!,p.height);heap.push({id,height:level[id]!});}}
 return {level,receiver,...accumulate(receiver),outlets:new Int32Array(outlets)};
}
function labelLakes(bed:Float32Array,d:Drainage,g:WorldGrid){
 const lakeId=new Int32Array(bed.length).fill(-1),rank=new Int32Array(bed.length);d.order.forEach((id,k)=>rank[id]=k);
 const groups:number[][]=[];
 for(let id=0;id<bed.length;id++)if(lakeId[id]===-1&&d.level[id]!-bed[id]!>.02){
  const index=groups.length,cells=[id],height=d.level[id]!;lakeId[id]=index;
  for(let k=0;k<cells.length;k++)for(const next of neighbours(cells[k]!,g.size,true))if(lakeId[next]===-1&&d.level[next]===height&&height-bed[next]!>.02){lakeId[next]=index;cells.push(next);}
  groups.push(cells);
 }
 const lakes=groups.map((cells,id)=>{
  const exits=cells.filter(i=>d.receiver[i]!>=0&&lakeId[d.receiver[i]!]!==id).sort((a,b)=>rank[a]!-rank[b]!||a-b);
  const outletCell=exits[0];if(outletCell===undefined)throw Error('Lake has no spill outlet');
  const downstreamReceiver=d.receiver[outletCell]!,seen=new Set<number>([outletCell]),queue=[outletCell];
  for(let k=0;k<queue.length;k++)for(const next of neighbours(queue[k]!,g.size,true))if(lakeId[next]===id&&!seen.has(next)){seen.add(next);d.receiver[next]=queue[k]!;queue.push(next);}
  return {id,cells,waterElevation:d.level[outletCell]!,outletCell,downstreamReceiver};
 });
 Object.assign(d,accumulate(d.receiver));
 const geometry=lakeGeometry(g,bed,lakeId,d.level,lakes.length);
 return {lakeId,lakes:lakes.map((l,i)=>({...l,triangles:geometry[i]!,shoreLoops:shoreLoops(geometry[i]!)}))};
}
function extractChannels(bed:Float32Array,d:Drainage,lakeId:Int32Array,lakes:readonly Lake[],g:WorldGrid):Channel[]{
 const n=bed.length,selected=new Uint8Array(n),incoming=new Uint32Array(n);
 for(let id=0;id<n;id++)if(lakeId[id]===-1&&d.receiver[id]!>=0&&d.accumulation[id]!>=HYDROLOGY_RECIPE.areaThreshold)selected[id]=1;
 const sources=new Map<number,number>();
 for(const lake of lakes){let id=lake.downstreamReceiver;sources.set(id,lake.id);let steps=0;while(id>=0&&lakeId[id]===-1&&d.receiver[id]!>=0&&!selected[id]){selected[id]=1;id=d.receiver[id]!;if(++steps>n)throw Error('Invalid lake outlet route');}}
 for(let id=0;id<n;id++)if(selected[id]&&lakeId[d.receiver[id]!]===-1)incoming[d.receiver[id]!]!++;
 const chains:Channel[]=[];
 const height=(id:number)=>lakeId[id]!>=0?lakes[lakeId[id]!]!.waterElevation:d.level[id]!;
 for(let start=0;start<n;start++)if(selected[start]&&(incoming[start]!==1||sources.has(start))){
  const ids=[start];let id=start;
  while(true){const next=d.receiver[id]!;ids.push(next);if(next<0)throw Error('Selected channel without outlet');if(lakeId[next]!>=0||d.receiver[next]===-1||incoming[next]!==1||sources.has(next))break;id=next;if(ids.length>n)throw Error('Cyclic channel');}
  const endId=ids[ids.length-1]!,end:ChannelEnd=lakeId[endId]!>=0?{type:'lake',id:lakeId[endId]!}:d.receiver[endId]===-1?{type:'outlet',id:endId}:{type:'junction',id:endId};
  const sourceLake=sources.get(start),points:ChannelPoint[]=[];
  const point=(cell:number,h:number,p=gridPoint(g,cell,bed)):ChannelPoint=>({cell,x:p.x,z:p.z,waterElevation:h,distance:0,width:Math.min(5,1.4+Math.sqrt(d.accumulation[cell]!)*.018)});
  if(sourceLake!==undefined){const lake=lakes[sourceLake]!,a=gridPoint(g,lake.outletCell,bed),b=gridPoint(g,start,bed),p=shoreIntersection(a,b,lake.shoreLoops);points.push(point(lake.outletCell,lake.waterElevation,{...p,h:lake.waterElevation}));}
  for(let k=0;k<ids.length;k++){
   const cell=ids[k]!;let p=gridPoint(g,cell,bed),h=height(cell);
   if(k===ids.length-1&&end.type==='lake'){const lake=lakes[end.id]!,previous=gridPoint(g,ids[k-1]!,bed);p={...shoreIntersection(previous,p,lake.shoreLoops),h:lake.waterElevation};h=lake.waterElevation;}
   points.push(point(cell,h,p));
  }
  for(let k=1;k<points.length;k++){const a=points[k-1]!,b=points[k]!;points[k]={...b,distance:a.distance+Math.hypot(b.x-a.x,b.z-a.z)};}
  const cleaned=points.filter((p,k)=>k===0||p.distance>points[k-1]!.distance+1e-5);
  if(cleaned.length<2)continue;
  const triangles=channelGeometry(g,bed,cleaned);
  chains.push({id:chains.length,points:cleaned,start:sourceLake===undefined?null:{type:'lake',id:sourceLake},end,length:cleaned[cleaned.length-1]!.distance,contributingArea:d.accumulation[endId]!*g.step*g.step,triangles,shoreLoops:shoreLoops(triangles)});
 }return chains;
}
export function generateHydrology(field:ReturnType<typeof generateHeightfield>):Hydrology{
 const g=field.grid,initial=analyseDrainage(field.bed,g.size),firstLakes=labelLakes(field.bed,initial,g),bed=field.bed.slice();
 for(let id=0;id<bed.length;id++)if(initial.accumulation[id]!>=HYDROLOGY_RECIPE.areaThreshold&&firstLakes.lakeId[id]===-1){
  const p=gridPoint(g,id,bed),x=id%g.size,z=Math.floor(id/g.size);
  if(x===0||z===0||x===g.size-1||z===g.size-1||field.meadows.some(m=>Math.hypot(p.x-m.cx,p.z-m.cz)<m.radius*.65))continue;
  bed[id]=bed[id]!-HYDROLOGY_RECIPE.maxCarve;
 }
 const drainage=analyseDrainage(bed,g.size),{lakeId,lakes}=labelLakes(bed,drainage,g),channels=extractChannels(bed,drainage,lakeId,lakes,g),falls:Fall[]=[];
 for(const channel of channels)for(let i=0;i<channel.points.length-2;i++)for(let j=i+1;j<channel.points.length-1&&channel.points[j]!.distance-channel.points[i]!.distance<=14;j++){
  const drop=channel.points[i]!.waterElevation-channel.points[j]!.waterElevation;if(drop>=2){falls.push({channelId:channel.id,from:i,to:j,drop});i=j;break;}
 }
 const quality={dryFraction:lakeId.reduce((sum,id)=>sum+(id<0?1:0),0)/bed.length,channelLength:channels.reduce((sum,c)=>sum+c.length,0),substantialLakes:lakes.filter(l=>l.cells.length>=64).length};
 return {...drainage,recipeVersion:HYDROLOGY_RECIPE.version,bed,lakeId,lakes,channels,falls,quality};
}

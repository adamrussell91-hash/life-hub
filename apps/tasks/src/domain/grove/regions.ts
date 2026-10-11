/** Calendar ownership and safe planting capacity depend only on annual geography. */
import type {AnnualWorld} from './world';
import {drySite,segmentTouchesWater,sampleGeography} from './geography';
export type PlantingSite={index:number;cell:number;x:number;z:number;height:number;slope:number;shoreDistance:number};
export type WeeklyRegion={id:string;index:number;monday:string;from:string;to:string;anchor:{x:number;z:number;cell:number};cells:number[];sites:PlantingSite[];primaryCount:number};
export type AnnualRegions={year:number;owner:Int16Array;weeks:WeeklyRegion[]};
const DAY=86400000;
const dateKey=(t:number)=>new Date(t).toISOString().slice(0,10);
export function calendarWeeks(year:number):Omit<WeeklyRegion,'anchor'|'cells'|'sites'|'primaryCount'>[]{
 if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Invalid region year');
 const start=Date.UTC(year,0,1),end=Date.UTC(year,11,31),monday=start-((new Date(start).getUTCDay()+6)%7)*DAY,result=[];
 for(let t=monday;t<=end;t+=7*DAY){const m=dateKey(t);result.push({id:`grove-region:${year}:${m}`,index:result.length,monday:m,from:dateKey(Math.max(start,t)),to:dateKey(Math.min(end,t+6*DAY))});}return result;
}
export function regionForDate(regions:AnnualRegions,key:string):WeeklyRegion|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(Date.parse(key))||dateKey(Date.parse(key))!==key)return null;
 return regions.weeks.find(w=>key>=w.from&&key<=w.to)??null;
}
function point(w:AnnualWorld,cell:number){return {x:w.grid.x0+cell%w.grid.size*w.grid.step,z:w.grid.z0+Math.floor(cell/w.grid.size)*w.grid.step,cell};}
function neighbors(cell:number,n:number){const x=cell%n,z=Math.floor(cell/n);return [x?cell-1:-1,x<n-1?cell+1:-1,z?cell-n:-1,z<n-1?cell+n:-1];}
type Graph={edges:Uint8Array;slope:Float32Array;mainland:number[]};
function graph(w:AnnualWorld):Graph{
 const n=w.grid.size,count=n*n,valid=new Uint8Array(count),edges=new Uint8Array(count),slope=new Float32Array(count);
 for(let i=0;i<count;i++){const p=point(w,i),s=sampleGeography(w,p.x,p.z,0);slope[i]=s.slope;valid[i]=s.waterType==='dry'&&s.slope<=.5?1:0;}
 for(let i=0;i<count;i++)if(valid[i]){const a=point(w,i);for(const [k,j] of neighbors(i,n).entries())if((k===1||k===3)&&j>=0&&valid[j]&& !segmentTouchesWater(w,a,point(w,j))&&sampleGeography(w,(a.x+point(w,j).x)/2,(a.z+point(w,j).z)/2,0).slope<=.5) {edges[i]|=1<<k;edges[j]|=1<<(k-1);}}
 const seen=new Uint8Array(count);let mainland:number[]=[];
 for(let i=0;i<count;i++)if(valid[i]&&!seen[i]){const queue=[i];seen[i]=1;for(let k=0;k<queue.length;k++){const c=queue[k]!;for(const [d,j] of neighbors(c,n).entries())if((edges[c]!&(1<<d))&&!seen[j]){seen[j]=1;queue.push(j);}}if(queue.length>mainland.length)mainland=queue;}
 return {edges,slope,mainland};
}
/** Stable binary heap: equal distance is resolved by cell then owner. */
class Heap{
 values:{cell:number;owner:number;distance:number}[]=[];
 less(a:typeof this.values[number],b:typeof this.values[number]){return a.distance<b.distance||a.distance===b.distance&&(a.cell<b.cell||a.cell===b.cell&&a.owner<b.owner);}
 push(v:typeof this.values[number]){const a=this.values;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.less(v,a[p]!))break;a[i]=a[p]!;i=p;}a[i]=v;}
 pop(){const a=this.values,v=a[0]!,last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.less(a[c+1]!,a[c]!))c++;if(!this.less(a[c]!,last))break;a[i]=a[c]!;i=c;}a[i]=last;}return v;}
}
function jitter(year:number,cell:number,axis:number){let v=(year*1664525+cell*1013904223+axis*374761393)|0;v=Math.imul(v^(v>>>16),0x45d9f3b);v^=v>>>16;return ((v>>>0)/4294967295-.5)*.4;}
/** A bounded search routes calendar weeks over actual safe region adjacency. */
function calendarRoute(w:AnnualWorld,r:AnnualRegions,edges:Uint8Array):number[]{
 const count=r.weeks.length,n=w.grid.size,adj=Array.from({length:count},()=>new Set<number>());
 for(let c=0;c<r.owner.length;c++)if(r.owner[c]!>=0)for(const [d,j] of neighbors(c,n).entries())if(j>=0&&(edges[c]!&(1<<d))&&r.owner[j]!>=0&&r.owner[j]!==r.owner[c])adj[r.owner[c]!]!.add(r.owner[j]!);
 const bits=Array.from({length:count},(_,i)=>1n<<BigInt(i));
 type Route={path:number[];mask:bigint;breaks:number;length:number;degree:number};
 const gap=(a:number,b:number)=>Math.hypot(r.weeks[a]!.anchor.x-r.weeks[b]!.anchor.x,r.weeks[a]!.anchor.z-r.weeks[b]!.anchor.z);
 let beam:Route[]=Array.from({length:count},(_,i)=>({path:[i],mask:bits[i]!,breaks:0,length:0,degree:adj[i]!.size}));
 for(let step=1;step<count;step++){
  const unique=new Map<string,Route>();
  for(const route of beam){const last=route.path[route.path.length-1]!,near=[...adj[last]!].filter(i=>!(route.mask&bits[i]!));
   // When a branch traps the route, only the four closest remaining anchors are considered.
   const next=near.length?near:Array.from({length:count},(_,i)=>i).filter(i=>!(route.mask&bits[i]!)).sort((a,b)=>gap(last,a)-gap(last,b)||a-b).slice(0,4);
   for(const i of next){const mask=route.mask|bits[i]!,candidate:Route={path:[...route.path,i],mask,breaks:route.breaks+(adj[last]!.has(i)?0:1),length:route.length+gap(last,i),degree:[...adj[i]!].filter(j=>!(mask&bits[j]!)).length};
    const key=`${mask}:${i}`,prior=unique.get(key);if(!prior||candidate.breaks<prior.breaks||candidate.breaks===prior.breaks&&candidate.length<prior.length)unique.set(key,candidate);
   }
  }
  beam=[...unique.values()].sort((a,b)=>a.breaks-b.breaks||a.degree-b.degree||a.length-b.length||a.path.join(',').localeCompare(b.path.join(','))).slice(0,256);
 }
 beam.sort((a,b)=>a.breaks-b.breaks||a.length-b.length||a.path.join(',').localeCompare(b.path.join(',')));
 const path=beam[0]!.path.slice(),cost=(a:number,b:number)=>(adj[a]!.has(b)?0:1e7)+gap(a,b)**2;
 // Bounded 2-opt reversals retain internal adjacency while repairing branch-to-branch jumps.
 for(let pass=0;pass<100;pass++){let gain=0,from=-1,to=-1;for(let a=0;a<count-1;a++)for(let b=a+1;b<count;b++){
  const before=(a?cost(path[a-1]!,path[a]!):0)+(b<count-1?cost(path[b]!,path[b+1]!):0),after=(a?cost(path[a-1]!,path[b]!):0)+(b<count-1?cost(path[a]!,path[b+1]!):0);
  if(before-after>gain+1e-8){gain=before-after;from=a;to=b;}
 }if(from<0)break;path.splice(from,to-from+1,...path.slice(from,to+1).reverse());}
 const breaks=path.slice(1).filter((v,i)=>!adj[path[i]!]!.has(v)).length;if(breaks>Math.floor((count-1)*.2))throw Error('Annual region calendar route could not establish neighboring weekly ownership');return path;
}
export function generateRegions(w:AnnualWorld):AnnualRegions{
 const {edges,slope,mainland}=graph(w),n=w.grid.size,weeks=calendarWeeks(w.key.year);if(mainland.length<weeks.length*200)throw Error('Annual region mainland capacity is insufficient');
 // DFS discovery supplies deterministic candidate anchors; farthest selection spreads them.
 const active=new Uint8Array(n*n);for(const c of mainland)active[c]=1;
 const traversal:number[]=[],visited=new Uint8Array(n*n),stack=[mainland[0]!];
 while(stack.length){const c=stack.pop()!;if(visited[c])continue;visited[c]=1;traversal.push(c);for(const [d,j] of neighbors(c,n).entries())if((edges[c]!&(1<<d))&&active[j]&&!visited[j])stack.push(j);}
 const candidates=traversal.filter(c=>{const p=point(w,c),s=drySite(w,p.x,p.z);return s.slope<.2&&s.shoreDistance>=16&&p.x>w.grid.x0+35&&p.z>w.grid.z0+35&&p.x<w.grid.x0+w.grid.extent-35&&p.z<w.grid.z0+w.grid.extent-35;});
 if(candidates.length<weeks.length)throw Error('Annual region anchor capacity is insufficient');
 const anchors=[candidates[Math.floor(candidates.length/2)]!],nearest=new Float64Array(n*n).fill(Infinity);
 for(let k=1;k<weeks.length;k++){const last=anchors[k-1]!,p=point(w,last);let best=-1,next=-1;for(const c of candidates){const q=point(w,c),dist=(q.x-p.x)**2+(q.z-p.z)**2;nearest[c]=Math.min(nearest[c]!,dist);if(nearest[c]!>best){best=nearest[c]!;next=c;}}anchors.push(next);}
 // Canonical seed ordering precedes the calendar route over actual region adjacency.
 const order=new Map(traversal.map((c,i)=>[c,i]));anchors.sort((a,b)=>order.get(a)!-order.get(b)!);
 const owner=new Int16Array(n*n).fill(-1),distance=new Float64Array(n*n).fill(Infinity),heap=new Heap();
 anchors.forEach((cell,index)=>{distance[cell]=0;owner[cell]=index;heap.push({cell,owner:index,distance:0});});
 while(heap.values.length){const a=heap.pop();if(a.distance!==distance[a.cell]||owner[a.cell]!==a.owner)continue;for(const [d,j] of neighbors(a.cell,n).entries())if((edges[a.cell]!&(1<<d))&&active[j]){const dist=a.distance+w.grid.step*(1+2*(slope[a.cell]!+slope[j]!));if(dist<distance[j]!){distance[j]=dist;owner[j]=a.owner;heap.push({cell:j,owner:a.owner,distance:dist});}}}
 const result:AnnualRegions={year:w.key.year,owner,weeks:weeks.map((week,i)=>({...week,anchor:point(w,anchors[i]!),cells:[],sites:[],primaryCount:200}))};
 for(const cell of mainland)result.weeks[owner[cell]!]!.cells.push(cell);
 for(const cell of mainland){const region=result.weeks[owner[cell]!]!,p=point(w,cell),x=p.x+jitter(w.key.year,cell,0),z=p.z+jitter(w.key.year,cell,1);
  if(x<=w.grid.x0||z<=w.grid.z0||x>=w.grid.x0+w.grid.extent||z>=w.grid.z0+w.grid.extent||Math.hypot(x-region.anchor.x,z-region.anchor.z)<3)continue;
  // A narrow crossing through each reserved meadow stays quiet under any task history.
  if(w.meadows.some(m=>Math.abs(z-m.cz)<3&&Math.abs(x-m.cx)<m.radius))continue;
  const s=drySite(w,x,z);if(!s.dry||s.slope>.5||s.shoreDistance<2)continue;
  region.sites.push({index:region.sites.length,cell,x,z,height:s.height,slope:s.slope,shoreDistance:s.shoreDistance});
 }
 for(const r of result.weeks){r.cells.sort((a,b)=>a-b);r.sites.sort((a,b)=>Math.hypot(a.x-r.anchor.x,a.z-r.anchor.z)-Math.hypot(b.x-r.anchor.x,b.z-r.anchor.z)||a.cell-b.cell);r.sites.forEach((s,i)=>s.index=i);if(r.sites.length<200)throw Error(`Annual region ${r.id} capacity ${r.sites.length} is below 200`);}
 const route=calendarRoute(w,result,edges),remap=new Int16Array(weeks.length);route.forEach((old,index)=>remap[old]=index);
 result.weeks=route.map((old,index)=>({...result.weeks[old]!,...weeks[index]!}));
 for(let cell=0;cell<owner.length;cell++)if(owner[cell]!>=0)owner[cell]=remap[owner[cell]!]!;
 return result;
}
export function validateRegions(w:AnnualWorld):void{
 const r=w.regions,fail=()=>{throw Error('Invalid annual regions output');};
 if(!r||r.year!==w.key.year||!(r.owner instanceof Int16Array)||r.owner.length!==w.grid.size**2||!Array.isArray(r.weeks))fail();
 const data=r!,expected=calendarWeeks(w.key.year),n=w.grid.size;if(data.weeks.length!==expected.length)fail();
 const listed=new Uint8Array(n*n),spatial=new Map<string,PlantingSite[]>();
 for(let k=0;k<data.weeks.length;k++){const region=data.weeks[k]!,e=expected[k]!;if(!region||region.id!==e.id||region.index!==k||region.monday!==e.monday||region.from!==e.from||region.to!==e.to||!Array.isArray(region.cells)||!Array.isArray(region.sites)||region.sites.length<200||region.primaryCount!==200)fail();
  const a=region.anchor;if(!a||!Number.isInteger(a.cell)||a.cell<0||a.cell>=n*n||data.owner[a.cell]!==k||a.x!==point(w,a.cell).x||a.z!==point(w,a.cell).z)fail();
  for(const c of region.cells){if(!Number.isInteger(c)||c<0||c>=n*n||listed[c]||data.owner[c]!==k)fail();const p=point(w,c),s=sampleGeography(w,p.x,p.z,0);if(s.waterType!=='dry'||s.slope>.5)fail();listed[c]=1;}
  const seen=new Set([a.cell]),queue=[a.cell];for(let i=0;i<queue.length;i++)for(const j of neighbors(queue[i]!,n))if(j>=0&&data.owner[j]===k&&!seen.has(j)){const a=point(w,queue[i]!),b=point(w,j);if(segmentTouchesWater(w,a,b)||sampleGeography(w,(a.x+b.x)/2,(a.z+b.z)/2,0).slope>.5)continue;seen.add(j);queue.push(j);}if(seen.size!==region.cells.length)fail();
  const used=new Set<number>();for(const [i,s] of region.sites.entries()){if(!s||s.index!==i||used.has(s.cell)||data.owner[s.cell]!==k||!Number.isFinite(s.x)||!Number.isFinite(s.z)||Math.hypot(s.x-a.x,s.z-a.z)<3)fail();used.add(s.cell);const p=point(w,s.cell);if(Math.abs(s.x-p.x)>.200001||Math.abs(s.z-p.z)>.200001||w.meadows.some(m=>Math.abs(s.z-m.cz)<3&&Math.abs(s.x-m.cx)<m.radius))fail();
   const actual=drySite(w,s.x,s.z);if(!actual.dry||actual.slope>.5||actual.shoreDistance<2||actual.height!==s.height||actual.slope!==s.slope||actual.shoreDistance!==s.shoreDistance)fail();
   const bx=Math.floor(s.x/2.6),bz=Math.floor(s.z/2.6);for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const other of spatial.get(`${x}:${z}`)||[])if(Math.hypot(s.x-other.x,s.z-other.z)<2.6)fail();const key=`${bx}:${bz}`,bucket=spatial.get(key)||[];bucket.push(s);spatial.set(key,bucket);
  }
 }
 for(let c=0;c<data.owner.length;c++)if(!Number.isInteger(data.owner[c])||data.owner[c]!< -1||data.owner[c]!>=data.weeks.length||(data.owner[c]!>=0)!==!!listed[c])fail();
 const adjacent=new Set<number>();for(let c=0;c<data.owner.length;c++)if(data.owner[c]!>=0)for(const j of [c%n<n-1?c+1:-1,c+n<data.owner.length?c+n:-1])if(j>=0&&data.owner[j]!>=0&&Math.abs(data.owner[c]!-data.owner[j]!)===1){const a=point(w,c),b=point(w,j);if(!segmentTouchesWater(w,a,b)&&sampleGeography(w,(a.x+b.x)/2,(a.z+b.z)/2,0).slope<=.5)adjacent.add(Math.min(data.owner[c]!,data.owner[j]!));}
 if(adjacent.size<Math.ceil((data.weeks.length-1)*.8))fail();
}

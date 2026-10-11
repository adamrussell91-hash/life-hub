/** Validate transferred geography before a renderer or sampler can consume it. */
import type {AnnualWorld} from './world';
import {accumulate,neighbours,hasDryReserves,type Hydrology} from './hydrology';
import {lakeGeometry,channelGeometry,shoreLoops,type ChannelEnd,type ShorePoint} from './water';
export function hydrologyBuffers(w:AnnualWorld):ArrayBuffer[]{const h=w.hydrology;return [...new Set([w.bed,h.bed,h.gradedBed,h.level,h.receiver,h.accumulation,h.order,h.outlets,h.lakeId,...h.lakes.map(l=>l.triangles),...h.channels.map(c=>c.triangles)].map(a=>a.buffer as ArrayBuffer))];}
export function validateHydrology(w:AnnualWorld):void{
 const h=w.hydrology,g=w.grid,n=g.size*g.size,fail=()=>{throw Error('Invalid annual hydrology output');};
 const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
 const cell=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<n;
 const point=(p:ShorePoint)=>p&&finite(p.x)&&finite(p.z)&&p.x>=g.x0-1e-4&&p.x<=g.x0+g.extent+1e-4&&p.z>=g.z0-1e-4&&p.z<=g.z0+g.extent+1e-4;
 const floats=(a:unknown,length:number)=>a instanceof Float32Array&&a.length===length&&a.every(Number.isFinite);
 if(!h||h.recipeVersion!==1||!floats(h.bed,n)||!floats(h.gradedBed,n)||!floats(h.level,n)||!Number.isInteger(h.gradingPasses)||h.gradingPasses<0||h.gradingPasses>3)fail();
 if(!(h.receiver instanceof Int32Array)||h.receiver.length!==n||!(h.order instanceof Int32Array)||h.order.length!==n||!(h.accumulation instanceof Uint32Array)||h.accumulation.length!==n||!(h.lakeId instanceof Int32Array)||h.lakeId.length!==n||!(h.outlets instanceof Int32Array))fail();
 if(!Array.isArray(h.lakes)||!Array.isArray(h.channels)||!Array.isArray(h.falls)||!h.quality)fail();
 const rank=new Int32Array(n).fill(-1);for(let i=0;i<n;i++){const id=h.order[i]!;if(!cell(id)||rank[id]!==-1)fail();rank[id]=i;}
 const listed=new Set<number>();for(const id of h.outlets){if(!cell(id)||listed.has(id)||h.receiver[id]!==-1)fail();listed.add(id);}
 let dry=0;
 for(let id=0;id<n;id++){
  const to=h.receiver[id]!,x=id%g.size,z=Math.floor(id/g.size),edge=x===0||z===0||x===g.size-1||z===g.size-1;
  if(to===-1){if(!edge||!listed.has(id))fail();}else if(edge||!cell(to)||rank[to]!>=rank[id]!||h.level[to]!>h.level[id]!||!neighbours(id,g.size,true).includes(to))fail();
  if(h.level[id]!<h.bed[id]!-1e-5||h.gradedBed[id]!-h.bed[id]!< -1e-5||h.gradedBed[id]!-h.bed[id]!>.35001||h.gradedBed[id]!<w.bed[id]!-1e-5||h.gradedBed[id]!-w.bed[id]!>6.00001)fail();
  const lake=h.lakeId[id]!;if(lake< -1||lake>=h.lakes.length)fail();if(lake===-1)dry++;
 }
 const actual=accumulate(h.receiver);for(let i=0;i<n;i++)if(actual.accumulation[i]!==h.accumulation[i])fail();
 function geometry(d:{triangles:Float32Array;shoreLoops:readonly (readonly ShorePoint[])[]}){
  if(!(d.triangles instanceof Float32Array)||d.triangles.length%9!==0||!d.triangles.every(Number.isFinite)||!Array.isArray(d.shoreLoops))fail();
  for(let i=0;i<d.triangles.length;i+=3)if(!point({x:d.triangles[i]!,z:d.triangles[i+2]!}))fail();
  for(const loop of d.shoreLoops)if(!Array.isArray(loop)||loop.length<4||!loop.every(point)||Math.hypot(loop[0]!.x-loop[loop.length-1]!.x,loop[0]!.z-loop[loop.length-1]!.z)>1e-4)fail();
 }
 const seen=new Uint8Array(n);
 for(let i=0;i<h.lakes.length;i++){const l=h.lakes[i]!;if(l.id!==i||!finite(l.waterElevation)||!Array.isArray(l.cells)||!l.cells.length||!cell(l.outletCell)||!cell(l.downstreamReceiver)||h.receiver[l.outletCell]!==l.downstreamReceiver||h.lakeId[l.downstreamReceiver]===i||!l.cells.includes(l.outletCell))fail();
  for(const id of l.cells){if(!cell(id)||seen[id]||h.lakeId[id]!==i||h.level[id]!==l.waterElevation||h.level[id]!-h.bed[id]!<=.02)fail();seen[id]=1;if(id!==l.outletCell&&h.lakeId[h.receiver[id]!]!==i)fail();}
  geometry(l);for(let k=1;k<l.triangles.length;k+=3)if(Math.abs(l.triangles[k]!-l.waterElevation)>1e-5)fail();
 }
 for(let i=0;i<n;i++)if((h.lakeId[i]!>=0)!==Boolean(seen[i]))fail();
 const sameGeometry=(d:{triangles:Float32Array;shoreLoops:readonly (readonly ShorePoint[])[]},expected:Float32Array)=>{
  if(d.triangles.length!==expected.length||!expected.every((v,i)=>v===d.triangles[i]))fail();
  const loops=shoreLoops(expected);if(loops.length!==d.shoreLoops.length)fail();
  for(let i=0;i<loops.length;i++){const a=loops[i]!,b=d.shoreLoops[i]!;if(a.length!==b.length||a.some((p,k)=>Math.hypot(p.x-b[k]!.x,p.z-b[k]!.z)>1e-5))fail();}
 };
 const lakeTriangles=lakeGeometry(g,h.bed,h.lakeId,h.level,h.lakes.length);
 h.lakes.forEach((lake,i)=>sameGeometry(lake,lakeTriangles[i]!));
 const endpoint=(e:ChannelEnd)=>e&&(e.type==='lake'?Number.isInteger(e.id)&&e.id>=0&&e.id<h.lakes.length:e.type==='junction'?cell(e.id):e.type==='outlet'?listed.has(e.id):false);
 for(let i=0;i<h.channels.length;i++){const c=h.channels[i]!;if(c.id!==i||!Array.isArray(c.points)||c.points.length<2||!endpoint(c.end)||c.start!==null&&!endpoint(c.start)||!finite(c.length)||c.length<=0||!finite(c.contributingArea)||c.contributingArea<=0)fail();
  let distance=0;for(let k=0;k<c.points.length;k++){const p=c.points[k]!;if(!point(p)||!cell(p.cell)||!finite(p.waterElevation)||!finite(p.distance)||!finite(p.width)||p.width<1.4||p.width>5)fail();if(k){const a=c.points[k-1]!;distance+=Math.hypot(p.x-a.x,p.z-a.z);if(p.waterElevation>a.waterElevation+1e-5||p.distance<=a.distance||Math.abs(p.distance-distance)>1e-4)fail();}else if(p.distance!==0)fail();}
  if(Math.abs(c.length-distance)>1e-4)fail();geometry(c);sameGeometry(c,channelGeometry(g,h.bed,c.points));
  const lakeEnd=(p:typeof c.points[number],id:number)=>{const lake=h.lakes[id]!;if(Math.abs(p.waterElevation-lake.waterElevation)>1e-5)fail();let nearest=Infinity;
   for(const loop of lake.shoreLoops)for(let k=1;k<loop.length;k++){const a=loop[k-1]!,b=loop[k]!,dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)):0;nearest=Math.min(nearest,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));}if(nearest>1e-4)fail();};
  const first=c.points[0]!,last=c.points[c.points.length-1]!;
  if(c.start?.type==='lake')lakeEnd(first,c.start.id);
  if(c.end.type==='lake')lakeEnd(last,c.end.id);else{
   if(last.cell!==c.end.id||Math.abs(last.x-(g.x0+c.end.id%g.size*g.step))>1e-4||Math.abs(last.z-(g.z0+Math.floor(c.end.id/g.size)*g.step))>1e-4)fail();
   if(c.end.type==='junction'&&!h.channels.some(other=>other.id!==c.id&&other.points.some(p=>p.cell===last.cell&&Math.hypot(p.x-last.x,p.z-last.z)<1e-4&&Math.abs(p.waterElevation-last.waterElevation)<1e-4)))fail();
  }
 }
 const length=h.channels.reduce((sum,c)=>sum+c.length,0),large=h.lakes.filter(l=>l.cells.length>=64).length;
 if(h.quality.dryFraction!==dry/n||h.quality.channelLength!==length||h.quality.substantialLakes!==large||large<1||length<50||dry/n<=.7||!hasDryReserves(w,h))fail();
 for(const f of h.falls)if(!Number.isInteger(f.channelId)||!h.channels[f.channelId]||!Number.isInteger(f.from)||!Number.isInteger(f.to)||f.from<0||f.to<=f.from||f.to>=h.channels[f.channelId]!.points.length-1||!finite(f.drop)||f.drop<2)fail();
 if(!w.generation||w.generation.hydrologyVersion!==1||!Number.isInteger(w.generation.attempt)||w.generation.attempt<0||w.generation.attempt>3||typeof w.generation.fallback!=='boolean'||w.generation.fallback!==(w.generation.attempt===3))fail();
}

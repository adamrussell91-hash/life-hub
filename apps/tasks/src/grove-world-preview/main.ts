import '../../design-kit/tokens.css';
import '../../design-kit/actions.css';
import './preview.css';
import {AnnualWorldClient} from '@/domain/grove/world-client';
import type {WorldMeshes} from '@/domain/grove/world-meshes';
import type {AnnualWorld} from '@/domain/grove/world';
import {buildAnnualGrovePlan} from '@/domain/grove/annual-plan';
import {AnnualPlantingSession} from '@/domain/grove/planting';
import {grovePeriod} from '@/domain/grove/calendar';
import type {GroveView,GroveTaskInput} from '@/domain/grove/plan';
import {formatDisplayDateRange} from '../../design-kit/js/format-display-date.js';
import {createWorldPreview,type DiagnosticLayer} from './renderer';
const year=document.querySelector<HTMLInputElement>('#year')!,anchor=document.querySelector<HTMLInputElement>('#anchor')!,view=document.querySelector<HTMLSelectElement>('#view')!,fixture=document.querySelector<HTMLSelectElement>('#fixture')!,stage=document.querySelector<HTMLElement>('#landscape')!,status=document.querySelector<HTMLElement>('#status')!,metrics=document.querySelector<HTMLElement>('#metrics')!,layer=document.querySelector<HTMLSelectElement>('#layer')!,boundary=document.querySelector<HTMLElement>('#boundary')!;
const meshes=new Map<number,WorldMeshes>(),worlds=new Map<number,AnnualWorld>(),clients=new Map<number,AnnualWorldClient>(),session=new AnnualPlantingSession();
let preview:ReturnType<typeof createWorldPreview>|null=null,revision=0;
function initialise(){try{preview=createWorldPreview(stage,tree=>{stage.dataset.pickedId=tree.id;document.querySelector('#picked')!.textContent=tree.title+' · '+tree.dayKey+' · '+tree.species;});}catch(error){status.textContent=String(error);stage.dataset.state='error';}}
initialise();
function records(world:AnnualWorld):GroveTaskInput[]{
 const count=Number(fixture.value),period=grovePeriod(view.value as GroveView,anchor.value),first=period.from.startsWith(String(world.key.year))?period.from:world.key.year+'-01-01',start=Date.UTC(world.key.year,0,1),days=(Date.UTC(world.key.year+1,0,1)-start)/86400000;
 return Array.from({length:count},(_,i)=>({id:'synthetic-'+world.key.year+'-'+i,title:'Synthetic task '+(i+1),status:'done',domain:['life','health','teaching','wedding','other'][i%5],completed_at:count===200?first+'T12:00:00+11:00':new Date(start+Math.floor(i*days/count)*86400000+3600000).toISOString()}));
}
async function load(){
 const current=++revision;if(!preview)return;stage.dataset.state='loading';status.textContent='Preparing annual activity…';const start=performance.now();
 try{
  const selected=Number(year.value);if(!Number.isInteger(selected)||selected<1900||selected>9999)throw Error('Year must be between 1900 and 9999');
  const period=grovePeriod(view.value as GroveView,anchor.value),years=[...new Set([Number(period.from.slice(0,4)),Number(period.to.slice(0,4))])];
  for(const [y,c] of clients)if(!years.includes(y)){c.dispose();clients.delete(y);}
  for(const y of worlds.keys())if(worlds.size>4&&!years.includes(y)){worlds.delete(y);meshes.delete(y);}
  const deliveries=await Promise.all(years.map(async y=>{if(worlds.has(y))return {world:worlds.get(y)!,meshes:meshes.get(y)!,generationMs:0,validationMs:0,receiptMs:0,transferMs:0,freezeMs:0};let client=clients.get(y);if(!client){client=new AnnualWorldClient();clients.set(y,client);}const result=await client.generate(y);worlds.set(y,result.world);meshes.set(y,result.meshes);return result;}));
  if(current!==revision)return;const loaded=deliveries.map(d=>d.world),world=loaded[0]!,now=new Date(Date.UTC(Math.max(...years),11,31,12,59,59,999)),plan=buildAnnualGrovePlan({worlds:loaded,tasks:loaded.flatMap(records),view:view.value as GroveView,anchor:anchor.value,now,timeZone:'Australia/Sydney',session});
  preview.showAnnual(loaded,layer.value as DiagnosticLayer,plan,deliveries.map(d=>d.meshes));preview.setMotionPaused(motionPaused);preview.setQuality(document.querySelector<HTMLSelectElement>('#quality')!.value as 'low'|'medium'|'high');
  Object.assign(stage.dataset,{year:String(world.key.year),years:years.join(','),identity:world.identity,state:'ready',species:JSON.stringify(plan.counts),weeks:String(loaded.reduce((n,w)=>n+w.regions!.weeks.length,0)),contextTrees:String(plan.contextTrees.length),selectedTrees:String(plan.trees.length),samples:String(world.bed.length),bytes:String(world.bed.byteLength),generationMs:String(deliveries.reduce((n,d)=>n+d.generationMs,0)),validationMs:String(deliveries.reduce((n,d)=>n+d.validationMs,0)),receiptMs:String(deliveries.reduce((n,d)=>n+d.receiptMs,0)),transferMs:String(deliveries.reduce((n,d)=>n+d.transferMs,0)),freezeMs:String(deliveries.reduce((n,d)=>n+d.freezeMs,0)),attempt:String(world.generation.attempt),fallback:String(world.generation.fallback),lakes:String(world.hydrology.lakes.length),channels:String(world.hydrology.channels.length),outlets:String(world.hydrology.outlets.length),falls:String(world.hydrology.falls.length),gradingPasses:String(world.hydrology.gradingPasses),totalMs:String(performance.now()-start)});
  boundary.hidden=!plan.boundary;boundary.textContent='Year boundary: '+years.join(' and ')+' have separate landscapes and task ownership.';
  if(document.querySelector<HTMLSelectElement>('#scene-mode')!.value==='prototype'){preview.showPrototype();status.textContent='Synthetic water prototype · level lake, winding flow and a routed six-metre fall';return;}
  status.textContent=formatDisplayDateRange(plan.from,plan.to)+' · '+plan.trees.length+' selected / '+plan.contextTrees.length+' annual trees · synthetic clock '+now.toISOString().slice(0,10);
  metrics.textContent=world.grid.extent+' m across each world · '+stage.dataset.weeks+' weekly regions · '+world.hydrology.lakes.length+' lakes · '+world.hydrology.channels.length+' channel links · '+(plan.provisionalCalendar?'provisional term calendar':'configured term calendar');
 }catch(error){if(current!==revision||error instanceof DOMException&&error.name==='AbortError')return;stage.dataset.state='error';status.textContent=error instanceof Error?error.message:String(error);}
}
layer.addEventListener('change',()=>preview?.setLayer(layer.value as DiagnosticLayer));
year.addEventListener('change',()=>{anchor.value=year.value+'-06-10';void load();});
for(const selector of ['#previous','#next'])document.querySelector(selector)!.addEventListener('click',()=>{year.value=String(Number(year.value)+(selector==='#next'?1:-1));anchor.value=year.value+'-06-10';void load();});
anchor.addEventListener('change',()=>{year.value=anchor.value.slice(0,4);void load();});view.addEventListener('change',()=>void load());fixture.addEventListener('change',()=>void load());document.querySelector('#frame')!.addEventListener('click',()=>{stage.scrollIntoView({block:'center'});preview?.focus();});
window.addEventListener('pagehide',()=>{revision++;for(const c of clients.values())c.dispose();clients.clear();preview?.dispose();preview=null;stage.dataset.state='suspended';});
window.addEventListener('pageshow',event=>{if(event.persisted){initialise();void load();}});
let motionPaused=false;void load();

document.querySelector('#motion')!.addEventListener('click',()=>{motionPaused=!motionPaused;preview?.setMotionPaused(motionPaused);document.querySelector('#motion')!.textContent=motionPaused?'Resume motion':'Pause motion';});
document.querySelector('#quality')!.addEventListener('change',()=>preview?.setQuality(document.querySelector<HTMLSelectElement>('#quality')!.value as 'low'|'medium'|'high'));

document.querySelector('#scene-mode')!.addEventListener('change',()=>void load());

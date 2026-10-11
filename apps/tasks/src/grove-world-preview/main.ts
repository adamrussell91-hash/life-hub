import '../../design-kit/tokens.css';
import '../../design-kit/actions.css';
import './preview.css';
import {AnnualWorldClient} from '@/domain/grove/world-client';
import {createWorldPreview,type DiagnosticLayer} from './renderer';

const year=document.querySelector<HTMLInputElement>('#year')!;
const stage=document.querySelector<HTMLElement>('#landscape')!;
const status=document.querySelector<HTMLElement>('#status')!;
const metrics=document.querySelector<HTMLElement>('#metrics')!;
const layer=document.querySelector<HTMLSelectElement>('#layer')!;
let client=new AnnualWorldClient();
let preview:ReturnType<typeof createWorldPreview>|null=null,revision=0;
function initialisePreview(){
  try{preview=createWorldPreview(stage);}catch(error){status.textContent=error instanceof Error?`The preview could not draw: ${error.message}`:'The preview could not draw on this device';stage.dataset.state='error';}
}
initialisePreview();

async function load() {
  const current=++revision,selected=Number(year.value);
  if(!preview)return;
  stage.dataset.state='loading';status.textContent=`Generating ${year.value}…`;metrics.textContent='';
  const start=performance.now();
  try{
    const delivery=await client.generate(selected);
    if(current!==revision)return;
    const world=delivery.world;preview.show(world,layer.value as DiagnosticLayer);
    stage.dataset.year=String(world.key.year);stage.dataset.identity=world.identity;stage.dataset.state='ready';
    stage.dataset.samples=String(world.bed.length);stage.dataset.bytes=String(world.bed.byteLength);stage.dataset.generationMs=String(delivery.generationMs);
    stage.dataset.attempt=String(world.generation.attempt);stage.dataset.fallback=String(world.generation.fallback);
    stage.dataset.lakes=String(world.hydrology.lakes.length);stage.dataset.channels=String(world.hydrology.channels.length);stage.dataset.outlets=String(world.hydrology.outlets.length);stage.dataset.falls=String(world.hydrology.falls.length);
    stage.dataset.gradingPasses=String(world.hydrology.gradingPasses);
    stage.dataset.transferBytes=String([world.bed,world.hydrology.bed,world.hydrology.gradedBed,world.hydrology.level,world.hydrology.receiver,world.hydrology.order,world.hydrology.accumulation,world.hydrology.outlets,world.hydrology.lakeId,...world.hydrology.lakes.map(l=>l.triangles),...world.hydrology.channels.map(c=>c.triangles)].reduce((sum,a)=>sum+a.byteLength,0));
    stage.dataset.totalMs=String(performance.now()-start);
    status.textContent=`${world.key.year} landscape ready · generator ${world.key.generatorVersion}${world.generation.fallback?' · fallback landscape':''}`;
    metrics.textContent=`${world.grid.extent} m across · ${world.grid.size} × ${world.grid.size} samples · elevation ${world.summary.minHeight.toFixed(1)}–${world.summary.maxHeight.toFixed(1)} m · ${world.hydrology.lakes.length} lakes/ponds · ${world.hydrology.channels.length} channel links · generated in ${Math.round(delivery.generationMs)} ms`;
  }catch(error){
    if(current!==revision||error instanceof DOMException&&error.name==='AbortError')return;
    stage.dataset.state='error';status.textContent=error instanceof Error?error.message:'Annual landscape could not generate';
  }
}
layer.addEventListener('change',()=>preview?.setLayer(layer.value as DiagnosticLayer));
year.addEventListener('change',()=>void load());
document.querySelector('#previous')!.addEventListener('click',()=>{year.value=String(Number(year.value)-1);void load();});
document.querySelector('#next')!.addEventListener('click',()=>{year.value=String(Number(year.value)+1);void load();});
window.addEventListener('pagehide',()=>{revision++;client.dispose();preview?.dispose();preview=null;stage.dataset.state='suspended';});
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  client=new AnnualWorldClient();initialisePreview();void load();
});
void load();

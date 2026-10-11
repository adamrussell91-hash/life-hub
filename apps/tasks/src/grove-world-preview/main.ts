import '../../design-kit/tokens.css';
import '../../design-kit/actions.css';
import './preview.css';
import {AnnualWorldClient} from '@/domain/grove/world-client';
import {createWorldPreview} from './renderer';

const year=document.querySelector<HTMLInputElement>('#year')!;
const stage=document.querySelector<HTMLElement>('#landscape')!;
const status=document.querySelector<HTMLElement>('#status')!;
const metrics=document.querySelector<HTMLElement>('#metrics')!;
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
    const world=delivery.world;preview.show(world);
    stage.dataset.year=String(world.key.year);stage.dataset.identity=world.identity;stage.dataset.state='ready';
    stage.dataset.samples=String(world.bed.length);stage.dataset.bytes=String(world.bed.byteLength);stage.dataset.generationMs=String(delivery.generationMs);
    stage.dataset.totalMs=String(performance.now()-start);
    status.textContent=`${world.key.year} landscape ready · generator ${world.key.generatorVersion}`;
    metrics.textContent=`${world.grid.extent} m across · ${world.grid.size} × ${world.grid.size} samples · elevation ${world.summary.minHeight.toFixed(1)}–${world.summary.maxHeight.toFixed(1)} m · generated in ${Math.round(delivery.generationMs)} ms`;
  }catch(error){
    if(current!==revision||error instanceof DOMException&&error.name==='AbortError')return;
    stage.dataset.state='error';status.textContent=error instanceof Error?error.message:'Annual landscape could not generate';
  }
}
year.addEventListener('change',()=>void load());
document.querySelector('#previous')!.addEventListener('click',()=>{year.value=String(Number(year.value)-1);void load();});
document.querySelector('#next')!.addEventListener('click',()=>{year.value=String(Number(year.value)+1);void load();});
window.addEventListener('pagehide',()=>{revision++;client.dispose();preview?.dispose();preview=null;stage.dataset.state='suspended';});
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  client=new AnnualWorldClient();initialisePreview();void load();
});
void load();

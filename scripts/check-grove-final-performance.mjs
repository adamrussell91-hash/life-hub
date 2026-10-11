/** Dense synthetic history; headless timings are evidence, never physical-device FPS. */
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GROVE_WORLD_URL||'http://127.0.0.1:5187',out=process.env.GROVE_WORLD_REPORT_DIR||'/tmp/grove-final-performance';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local preview required');
await mkdir(out,{recursive:true});const evidence=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.GROVE_PERFORMANCE_ENGINE||process.env.GROVE_PERFORMANCE_ENGINE===name)){
 const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.GROVE_HARDWARE_GPU==='1'?{channel:'chrome',args:['--use-angle=metal']}:{})});try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{globalThis.groveLongTasks=[];try{new PerformanceObserver(list=>groveLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch{}});
  await page.goto(base+'/grove-world-preview.html');await page.waitForSelector('#landscape[data-state="ready"]',{timeout:60000});evidence.push({engine:name,width,startup:await page.locator('#landscape').evaluate(e=>({...e.dataset})),longTaskObserverSupported:await page.evaluate(()=>PerformanceObserver.supportedEntryTypes?.includes('longtask')??false)});
  for(const count of [1500,5000,10000,200]){
   await page.locator('#fixture').selectOption(String(count));await page.waitForSelector('#landscape[data-context-trees="'+count+'"][data-animals-ready="true"]',{timeout:60000});
   await page.locator('#view').selectOption(count===200?'week':'year');await page.waitForTimeout(700);
   if(count===200){await page.locator('#frame').click();await page.waitForSelector('#landscape[data-authored-trees="64"]',{timeout:60000});await page.waitForTimeout(700);}await page.waitForSelector('#landscape[data-animals-ready="true"]',{timeout:60000});
   await page.locator('#landscape').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#landscape')?.dataset.motion==='running',null,{timeout:60000});
   const samplePromise=page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now();function step(now){times.push(now-previous);previous=now;if(times.length===60){times.sort((a,b)=>a-b);resolve({medianMs:times[30],p95Ms:times[57],maxMs:times[59],dataset:{...document.querySelector('#landscape').dataset},userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,gpu:(()=>{const gl=document.querySelector('#landscape canvas').getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?{vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}:null;})(),longTasks:globalThis.groveLongTasks.splice(0)});}else requestAnimationFrame(step);}requestAnimationFrame(step);}));
   if(process.env.GROVE_PERFORMANCE_INTERACTION==='1'){
    const bounds=await page.locator('#landscape canvas').boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down({button:'right'});
    for(let i=0;i<12;i++){await page.mouse.move(bounds.x+bounds.width/2+Math.sin(i)*24,bounds.y+bounds.height/2+Math.cos(i)*12,{steps:2});await page.waitForTimeout(35);}
    await page.mouse.up({button:'right'});await page.mouse.wheel(0,-100);await page.mouse.wheel(0,100);
   }
   const sample=await samplePromise;
   sample.interaction=process.env.GROVE_PERFORMANCE_INTERACTION==='1'?'native pointer pan and wheel zoom during frame sampling':'idle camera with motion';
   if(Number(sample.dataset.authoredTrees)>64||Number(sample.dataset.wildlifeCount)>11||errors.length)throw Error(JSON.stringify({sample,errors}));
   evidence.push({engine:name,width,count,environment:'headless local browser; physical device acceptance pending',...sample});
   await writeFile(out+'/final-performance-evidence.json',JSON.stringify(evidence,null,2));
   console.log('PASS dense '+name+' '+width+' '+count+' median='+sample.medianMs.toFixed(1)+'ms p95='+sample.p95Ms.toFixed(1)+'ms calls='+sample.dataset.drawCalls+' gpu='+JSON.stringify(sample.gpu));
  }
  // Repeated lifecycle cycles must leave one canvas and comparable live geometry allocation.
  const allocations=[],textures=[];for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));if(await page.locator('#landscape canvas').count())throw Error('Disposed canvas retained');
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForSelector('#landscape[data-state="ready"][data-animals-ready="true"] canvas',{timeout:60000});await page.locator('#frame').click();await page.waitForSelector('#landscape[data-authored-trees="64"]',{timeout:60000});await page.waitForTimeout(500);
   textures.push(Number(await page.locator('#landscape').getAttribute('data-gpu-textures')));allocations.push(Number(await page.locator('#landscape').getAttribute('data-gpu-geometries')));
  }
  if(Math.max(...textures)-Math.min(...textures)>4)throw Error('Repeated mounts retain textures: '+textures);
  if(Math.max(...allocations)-Math.min(...allocations)>8)throw Error('Repeated mounts retain geometry: '+allocations);
  evidence.push({engine:name,width,lifecycleGeometryAllocations:allocations,lifecycleTextureAllocations:textures,errors});await page.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/final-performance-evidence.json',JSON.stringify(evidence,null,2));

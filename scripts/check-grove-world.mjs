/** Fresh, local-only annual hydrology worker and diagnostic acceptance. */
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.GROVE_WORLD_URL||'http://127.0.0.1:5186';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Only local diagnostic servers are supported');
const out=process.env.GROVE_WORLD_REPORT_DIR||'/tmp/grove-world-report';await mkdir(out,{recursive:true});
const results=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[],workers=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('worker',w=>workers.push(w.url()));
   await page.goto(`${base}/grove-world-preview.html`);
   await page.waitForSelector('#landscape[data-state="ready"][data-year="2026"]',{timeout:30000});
   const data=await page.evaluate(()=>{
    const stage=document.querySelector('#landscape');
    const targets=[...document.querySelectorAll('button,input,select')].map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
    return {...stage.dataset,canvases:stage.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,targets};
   });
   if(data.samples!=='66049'||data.bytes!=='264196'||data.canvases!==1||data.overflow||Number(data.triangles)<131072)throw Error(JSON.stringify(data));
   if(data.targets.some(t=>t.height<44||t.width<44))throw Error('Controls below 44 px');
   if(!data.lakes||Number(data.lakes)<1||Number(data.channels)<1)throw Error('Missing solved drainage');
   for(const layer of ['lakes','receivers','accumulation','outlets','elevation']){await page.locator('#layer').selectOption(layer);await page.waitForSelector('#landscape[data-layer="'+layer+'"]');}
   await page.screenshot({path:path.join(out,`phase2-${name}-${width}.png`),fullPage:true});
   await page.evaluate(()=>{
    const year=document.querySelector('#year');
    for(const value of ['2027','2028','2029']){year.value=value;year.dispatchEvent(new Event('change',{bubbles:true}));}
   });
   await page.waitForSelector('#landscape[data-state="ready"][data-year="2029"]',{timeout:30000});
   await page.waitForTimeout(150);
   if(await page.locator('#landscape').getAttribute('data-year')!=='2029')throw Error('Stale year replaced current selection');
   await page.locator('#year').fill('1899');await page.locator('#year').dispatchEvent('change');
   await page.waitForSelector('#landscape[data-state="error"]');
   if(!(await page.locator('#status').textContent()).includes('1900'))throw Error('Invalid year did not explain valid range');
   await page.locator('#year').fill('2026');await page.locator('#year').dispatchEvent('change');
   await page.waitForSelector('#landscape[data-state="ready"][data-year="2026"]');
   if(workers.length<3||!workers.some(url=>url.includes('world-worker')))throw Error('Real worker did not execute');
   const recovery=await page.locator('#landscape').evaluate(e=>({...e.dataset}));
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   if(await page.locator('#landscape canvas').count())throw Error('Preview canvas not disposed');
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await page.waitForSelector('#landscape[data-state="ready"][data-year="2026"] canvas',{timeout:30000});
   if(await page.locator('#landscape canvas').count()!==1)throw Error('History restoration did not recreate one canvas');
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   if(await page.locator('#landscape canvas').count())throw Error('Restored preview not disposed');
   if(errors.length)throw Error(errors.join('\n'));
   results.push({engine:name,width,...data,recovery,workerRequests:workers.length,pageErrors:errors});
   console.log(`PASS ${name} ${width}: worker, landforms, cancellation, invalid-year recovery, controls and disposal`);
   await page.close();
  }
 }finally{await browser.close();}
}
await writeFile(path.join(out,'phase2-browser-evidence.json'),JSON.stringify(results,null,2));

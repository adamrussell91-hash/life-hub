/** Real browser acceptance for annual water, shared motion and authored wildlife. */
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.GROVE_WORLD_URL||'http://127.0.0.1:5187',out=process.env.GROVE_WORLD_REPORT_DIR||'/tmp/grove-phase4-report';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local preview required');
await mkdir(out,{recursive:true});const evidence=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/shader|webgl/i.test(e.text()))errors.push(e.text());});
  await page.goto(base+'/grove-world-preview.html');await page.waitForSelector('#landscape[data-state="ready"]',{timeout:60000});
  const stage=page.locator('#landscape');await stage.scrollIntoViewIfNeeded();await page.waitForSelector('#landscape[data-motion="running"]');
  const time=()=>stage.evaluate(e=>Number(e.dataset.motionSeconds));let a=await time();await page.waitForTimeout(250);if(await time()<=a)throw Error('Water clock did not advance');
  await page.locator('#motion').click();await page.waitForSelector('#landscape[data-motion="paused"]');a=await time();await page.waitForTimeout(200);if(await time()!==a)throw Error('Pause did not freeze shared clock');
  await page.locator('#motion').click();await page.waitForSelector('#landscape[data-motion="running"]');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('#landscape[data-motion="reduced"]');a=await time();await page.waitForTimeout(200);if(await time()!==a)throw Error('Reduced motion did not freeze');
  await page.emulateMedia({reducedMotion:'no-preference'});await stage.scrollIntoViewIfNeeded();await page.waitForSelector('#landscape[data-motion="running"]');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForSelector('#landscape[data-motion="hidden"]');a=await time();await page.waitForTimeout(200);if(await time()!==a)throw Error('Hidden clock advanced');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForSelector('#landscape[data-motion="running"]');
  for(const quality of ['low','medium','high']){await page.locator('#quality').selectOption(quality);await page.waitForSelector('#landscape[data-quality="'+quality+'"]');}
  await page.locator('#scene-mode').selectOption('prototype');await stage.scrollIntoViewIfNeeded();await page.waitForSelector('#landscape[data-scene="prototype"]');await page.waitForTimeout(300);
  const high=Number(await stage.getAttribute('data-particles'));if(high<=0||high>96)throw Error('Unbounded/missing fall spray: '+high);
  await page.screenshot({path:path.join(out,'phase4-'+name+'-'+width+'-water.png'),fullPage:true});
  await page.locator('#quality').selectOption('low');if(Number(await stage.getAttribute('data-particles'))!==0)throw Error('Low tier emits particles');
  await page.locator('#motion').click();await page.waitForSelector('#landscape[data-motion="paused"]');await page.locator('#scene-mode').selectOption('annual');await page.locator('#fixture').selectOption('200');await page.locator('#view').selectOption('week');await stage.scrollIntoViewIfNeeded();await page.waitForSelector('#landscape[data-selected-trees="200"]');await page.locator('#frame').click();await page.waitForSelector('#landscape[data-animals-ready="true"]',{timeout:60000});
  if(Number(await stage.getAttribute('data-authored-trees'))!==64)await page.waitForSelector('#landscape[data-authored-trees="64"]');await page.locator('#fixture').selectOption('10000');await page.waitForSelector('#landscape[data-context-trees="10000"][data-animals-ready="true"]',{timeout:60000});
  await page.locator('#anchor').fill('2026-02-23');await page.locator('#anchor').dispatchEvent('change');await page.waitForSelector('#landscape[data-swimmers="1"][data-animals-ready="true"]',{timeout:60000});
  const state=await stage.evaluate(e=>({...e.dataset,overflow:document.documentElement.scrollWidth>innerWidth}));if(Number(state.wildlifeCount)<1||Number(state.swimmers)!==1||Number(state.swimmerHeightError)>1e-5||state.overflow||errors.length)throw Error(JSON.stringify({state,errors}));
  await page.screenshot({path:path.join(out,'phase4-'+name+'-'+width+'-annual.png'),fullPage:true});
  await page.locator('#fixture').selectOption('0');await page.waitForSelector('#landscape[data-context-trees="0"]');await page.locator('#motion').click();await page.waitForSelector('#landscape[data-motion="running"]');await stage.evaluate(e=>{e.style.transform='translateX(200vw)';});await page.waitForSelector('#landscape[data-motion="offscreen"]');a=await time();await page.waitForTimeout(200);if(await time()!==a)throw Error('Offscreen clock advanced');await stage.evaluate(e=>{e.style.transform='';});await page.waitForSelector('#landscape[data-motion="running"]');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));if(await stage.locator('canvas').count())throw Error('Canvas survives disposal');await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForSelector('#landscape[data-state="ready"] canvas',{timeout:60000});
  const frameTimes=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now();function step(now){times.push(now-previous);previous=now;if(times.length===30){times.sort((a,b)=>a-b);resolve({scenario:'empty annual world, water active, headless software rendering',medianMs:times[15],p95Ms:times[28],environment:navigator.userAgent});}else requestAnimationFrame(step);}requestAnimationFrame(step);}));
  evidence.push({frameTimes,engine:name,width,...state,errors});await page.close();console.log('PASS '+name+' '+width+': motion suspension,quality,falls,spray,annual actors,cleanup');
 }}finally{await browser.close();}
}
await writeFile(path.join(out,'phase4-browser-evidence.json'),JSON.stringify(evidence,null,2));

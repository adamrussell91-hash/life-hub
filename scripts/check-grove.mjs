import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../tools/grove-previews/package.json',import.meta.url))('sharp');
import {chromium} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const output=new URL((process.env.GROVE_REPORT_DIR || '/tmp/grove-browser-report') + '/','file:///');await mkdir(output,{recursive:true});
const base=process.env.GROVE_BASE_URL || 'http://127.0.0.1:5175';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Grove checks use a local mock app only');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let tasks=Array.from({length:283*5},(_,i)=>({id:`grove-${i}`,title:`Finished task ${i+1}`,domain:['life','teaching','health','wedding','other'][i%5],status:'done',bucket:'done',completed_at:new Date(Date.UTC(2026,0,1+Math.floor(i/5),0,i%5)).toISOString(),due_date:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-10-10T00:00:00Z'}));
await page.addInitScript(()=>{const Original=Date;globalThis.Date=class extends Original{constructor(...args){super(...(args.length?args:['2026-10-10T09:00:00Z']));}static now(){return new Original('2026-10-10T09:00:00Z').getTime();}};});
await page.route('**/api/tasks',route=>route.fulfill({json:{ok:true,data:{tasks}}}));
await page.goto(`${base}/#/grove`);
if(await page.locator('#sign-in-passphrase').isVisible()){await page.locator('#sign-in-passphrase').fill('tasks-hub-local');await page.getByRole('button',{name:'Sign in',exact:true}).click();}
const results=[];
for(const width of [1440,390]) {
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const view of ['day','week','term','year']) {
    const date=view==='term'?'2026-09-20':'2026-10-10';
    await page.goto(`${base}/#/grove?view=${view}&date=${date}`);
    await page.waitForSelector(`.grove-page[data-view="${view}"] .grove-stage[data-state="ready"]`,{timeout:60000});await page.waitForTimeout(800);
    const data=await page.evaluate(()=>({caption:document.querySelector('.grove-caption')?.textContent,canvases:document.querySelectorAll('.grove-stage canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,animals:document.querySelector('.grove-page')?.dataset.wildlifeCount,missing:document.querySelector('.grove-page')?.dataset.unavailableWildlife,active:document.querySelector('[aria-selected="true"]')?.textContent}));
    const stage = await page.screenshot({fullPage:true});
    const {data: pixels, info} = await sharp(stage).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let green = 0;
    for (let i=0;i<pixels.length;i+=info.channels) if(pixels[i+1]>pixels[i]*1.1 && pixels[i+1]>pixels[i+2]*1.1) green++;
    data.terrainPixels = green;
    if(green < info.width*info.height*.01) {await writeFile(new URL(`failed-${view}-${width}.png`,output),stage);throw Error(`Blank terrain in ${view} at ${width}: ${green} green pixels`);}
    if(Number(data.animals)!==8 || data.missing)throw Error('Expected all eight milestone actors: '+JSON.stringify(data));
    if(data.overflow || data.canvases!==1 || data.active?.toLowerCase()!==view)throw Error(JSON.stringify({view,width,data}));
    await writeFile(new URL(`${view}-${width}.png`,output),stage);results.push({view,width,...data});console.log(`Checked ${view} ${width}`);
    const pause=page.getByRole('button',{name:'Pause wildlife',exact:true});if(await pause.isVisible()){await pause.click();await page.getByRole('button',{name:'Resume wildlife',exact:true}).waitFor();await page.getByRole('button',{name:'Resume wildlife',exact:true}).click();}
  }
}
await page.goto(`${base}/#/grove?date=2026-10-10`);await page.reload();await page.waitForSelector('.grove-page[data-view="day"] .grove-stage[data-state="ready"]',{timeout:60000});
await page.waitForTimeout(1800);
const canvasBox = await page.locator('.grove-stage').boundingBox();
let picked=false;
for(let y=0.25;y<.9 && !picked;y+=.06) for(let x=.15;x<.9 && !picked;x+=.045) {
  await page.mouse.click(canvasBox.x+canvasBox.width*x,canvasBox.y+canvasBox.height*y);
  picked=await page.locator('.grove-card:not([hidden])').count()>0;
}
if(!picked)throw Error('No tree could be picked');
if(!await page.getByRole('link',{name:'Open task',exact:true}).isVisible())throw Error('Picked task link missing');
await page.keyboard.press('Escape');if(await page.locator('.grove-card').isVisible())throw Error('Escape did not close the tree card');
await page.emulateMedia({reducedMotion:'reduce'});
await page.goto(`${base}/#/grove?date=2026-10-10`);await page.reload();await page.waitForSelector('.grove-page[data-view="day"] .grove-stage[data-state="ready"]',{timeout:60000});
if(await page.getByRole('button',{name:'Pause wildlife',exact:true}).isVisible())throw Error('Reduced motion still offers moving wildlife');
await page.route('**/assets/grove/animal-catalogue.json',async route=>{
  const response=await route.fetch();const catalogue=await response.json();
  const publicFiles={ 'animal-deer-doe':'models/animals/animal-deer-doe.glb','animal-deer-stag':'models/animals/animal-deer-stag.glb','animal-fox':'models/animals/animal-fox.glb'};
  catalogue.assets=catalogue.assets.filter(a=>publicFiles[a.id]).map(a=>({...a,file:publicFiles[a.id]}));
  await route.fulfill({json:catalogue});
});
await page.goto(`${base}/#/grove?date=2026-10-10`);await page.reload();await page.waitForSelector('.grove-page[data-view="day"] .grove-stage[data-state="ready"]',{timeout:60000});
const fallback=await page.locator('.grove-page').evaluate(node=>({count:node.dataset.wildlifeCount,missing:node.dataset.unavailableWildlife}));
if(Number(fallback.count)!==3 || !fallback.missing.includes('hare'))throw Error('Public-only wildlife fallback failed: '+JSON.stringify(fallback));
await page.goto(`${base}/#/board`);await page.waitForTimeout(600);
if(await page.locator('.grove-stage canvas').count())throw Error('Grove canvas not released');
await page.goto(`${base}/grove.html`);await page.waitForSelector('#grove[data-state="ready"] .grove-embed__stage[data-state="ready"]',{timeout:60000});
await page.screenshot({path:new URL('home-embed.png',output).pathname});
await context.close();await browser.close();
await writeFile(new URL('browser-report.json',output),JSON.stringify({results,errors,picking:'task card and Escape',reducedMotion:'frozen',publicOnly:'3 actors; missing species skipped',embed:'ready',unmount:'released'},null,2));
console.log(JSON.stringify({results,errors,picking:'task card and Escape',reducedMotion:'frozen',publicOnly:'3 actors; missing species skipped',embed:'ready',unmount:'released'},null,2));
if(errors.length)process.exitCode=1;

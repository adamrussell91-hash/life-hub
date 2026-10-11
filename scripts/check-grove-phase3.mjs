/** Local-only synthetic annual activity acceptance; never reads live task records. */
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.GROVE_WORLD_URL||'http://127.0.0.1:5187',out=process.env.GROVE_WORLD_REPORT_DIR||'/tmp/grove-phase3-report';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local preview required');
await mkdir(out,{recursive:true});const evidence=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/grove-world-preview.html');await page.waitForSelector('#landscape[data-state="ready"]',{timeout:60000});
  const weeks=Number(await page.locator('#landscape').getAttribute('data-weeks'));if(weeks!==53)throw Error('Missing calendar ownership: '+weeks);
  await page.locator('#layer').selectOption('regions');await page.waitForSelector('#landscape[data-layer="regions"]');
  await page.locator('#fixture').selectOption('10000');await page.waitForSelector('#landscape[data-context-trees="10000"]',{timeout:60000});
  await page.locator('#view').selectOption('year');await page.waitForSelector('#landscape[data-selected-trees="10000"]');
  const species=JSON.parse(await page.locator('#landscape').getAttribute('data-species'));if(['life','health','teaching','wedding','other'].some(s=>!species[s]))throw Error('Synthetic species missing');
  await page.locator('#landscape').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  if(await page.locator('#landscape').getAttribute('data-vegetation-mode')!=='overview')throw Error('Year overview must use aggregate vegetation');
  const overviewPick=await page.locator('#landscape').evaluate(e=>({x:Number(e.dataset.pickX),y:Number(e.dataset.pickY)}));
  await page.mouse.click(overviewPick.x,overviewPick.y);await page.waitForSelector('#landscape[data-picked-id^="synthetic-"]');
  await page.screenshot({path:path.join(out,'phase3-'+name+'-'+width+'-year.png'),fullPage:true});
  await page.locator('#fixture').selectOption('200');await page.waitForSelector('#landscape[data-context-trees="200"]');
  await page.locator('#view').selectOption('week');await page.waitForSelector('#landscape[data-selected-trees="200"]');
  await page.locator('#frame').click();await page.waitForTimeout(150);
  const pick=await page.locator('#landscape').evaluate(e=>({x:Number(e.dataset.pickX),y:Number(e.dataset.pickY)}));if(!Number.isFinite(pick.x)||!Number.isFinite(pick.y))throw Error('Missing tree picking target');
  await page.mouse.click(pick.x,pick.y);await page.waitForSelector('#landscape[data-picked-id^="synthetic-"]');
  await page.screenshot({path:path.join(out,'phase3-'+name+'-'+width+'-week.png'),fullPage:true});
  await page.locator('#anchor').fill('2026-12-31');await page.locator('#anchor').dispatchEvent('change');
  await page.waitForSelector('#landscape[data-years="2026,2027"][data-state="ready"]',{timeout:60000});
  if(await page.locator('#boundary').isHidden())throw Error('Missing explicit year boundary');
  await page.locator('#frame').click();const visibility=await page.locator('#landscape').evaluate(e=>[e.dataset.visibleSelectedTrees,e.dataset.selectedTrees]);if(visibility[0]!==visibility[1])throw Error('Boundary trees outside focused camera');
  await page.locator('#anchor').fill('2026-06-10');await page.locator('#anchor').dispatchEvent('change');await page.waitForSelector('#landscape[data-years="2026"][data-state="ready"]',{timeout:60000});
  const data=await page.locator('#landscape').evaluate(e=>({...e.dataset,overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('button,input,select')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}));
  if(data.overflow||data.controls.some(c=>c.width<44||c.height<44)||errors.length)throw Error(JSON.stringify({data,errors}));
  evidence.push({engine:name,width,...data,errors});await page.close();console.log('PASS '+name+' '+width+': regions,10k trees,weekly focus,picking,NewYear ownership,controls');
 }}finally{await browser.close();}
}
await writeFile(path.join(out,'phase3-browser-evidence.json'),JSON.stringify(evidence,null,2));

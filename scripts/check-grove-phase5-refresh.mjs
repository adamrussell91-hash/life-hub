/** Native, read-only refresh regressions using controlled task and book responses. */
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GROVE_WORLD_URL||'http://127.0.0.1:5187',out=process.env.GROVE_WORLD_REPORT_DIR||'/tmp/grove-phase5-refresh';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local synthetic acceptance only');
await mkdir(out,{recursive:true});const evidence=[];
const task=(id,day)=>({id,title:'Task '+id,domain:'life',status:'done',bucket:'done',completed_at:day+'T01:00:00Z',due_date:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-10-10T00:00:00Z'});
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]].filter(([n])=>!process.env.GROVE_TEST_ENGINE||n===process.env.GROVE_TEST_ENGINE)){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome',args:['--use-angle=metal']}:{})});
 try{for(const width of (process.env.GROVE_TEST_WIDTH?[Number(process.env.GROVE_TEST_WIDTH)]:[1440,390])){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{globalThis.groveTestNow='2026-10-10T12:59:50Z';const Original=Date;globalThis.Date=class extends Original{constructor(...args){super(...(args.length?args:[globalThis.groveTestNow]));}static now(){return new Original(globalThis.groveTestNow).getTime();}};globalThis.groveWorldRequests=[];const Native=Worker;globalThis.Worker=class extends Native{postMessage(message,...rest){if(message.type==='generate')groveWorldRequests.push(message.key.year);super.postMessage(message,...rest);}};});
 let tasks=[task('old','2026-10-10'),{...task('new','2026-10-11'),completed_at:'2026-10-10T13:00:00Z'}],holdTasks=false,heldTasks=null,holdBooks=false,heldBooks=null,failTasks=false,books=[],failBooks=false,failedBookResponses=0;
 await page.route('**/api/tasks',async route=>{if(route.request().method()!=='GET')throw Error('Unexpected source write');if(holdTasks){holdTasks=false;heldTasks={route,tasks:[...tasks]};return;}if(failTasks)return route.fulfill({status:503,json:{ok:false,error:'Temporary test failure'}});await route.fulfill({json:{ok:true,data:{tasks}}});});
 await page.route('**/api/knowledge/shelf',async route=>{if(holdBooks){holdBooks=false;heldBooks=route;return;}if(failBooks){failedBookResponses++;return route.fulfill({status:503,json:{ok:false,error:'Temporary book failure'}});}await route.fulfill({json:{ok:true,data:{books,placements:[]}}});});
 const rememberCanvas=()=>page.evaluate(()=>{globalThis.grovePreviousCanvas=document.querySelector('.grove-stage canvas');});
 const ready=(view='day',caption='')=>page.waitForFunction(({view,caption})=>{const stage=document.querySelector('.grove-stage'),canvas=stage?.querySelector('canvas');return document.querySelector('.grove-page')?.dataset.view===view&&stage?.dataset.state==='ready'&&stage?.dataset.animalsReady==='true'&&canvas&&canvas!==globalThis.grovePreviousCanvas&&document.querySelector('.grove-caption')?.textContent?.includes(caption);},{view,caption},{timeout:60000});
 const navigate=async(hash,view,caption)=>{await rememberCanvas();await page.evaluate(hash=>{location.hash=hash;},hash);await ready(view,caption);};
 const refresh=async(view,caption)=>{await rememberCanvas();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await ready(view,caption);};
 await page.goto(base+'/#/grove');if(await page.locator('#sign-in-passphrase').isVisible()){await page.locator('#sign-in-passphrase').fill('tasks-hub-local');await page.getByRole('button',{name:'Sign in',exact:true}).click();}await ready();
 if(await page.locator('.grove-caption').textContent()!=='Today 10/10/26 · 1 tree')throw Error('Initial clock fixture incorrect');
 console.log('STEP ready '+name+' '+width);
 // A default Today route follows Sydney midnight; explicit history remains pinned.
 await rememberCanvas();await page.evaluate(()=>{groveTestNow='2026-10-10T13:00:01Z';document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForFunction(()=>document.querySelector('.grove-caption')?.textContent==='Today 11/10/26 · 1 tree',null,{timeout:15000});
 await ready('day','Today 11/10/26');await navigate('#/grove?date=2026-10-10','day','10/10/26');await refresh('day','10/10/26');
 if(!(await page.locator('.grove-caption').textContent()).includes('10/10/26'))throw Error('Explicit history moved at midnight');
 console.log('STEP midnight and pinned');
 // A late same-view snapshot must not resurrect a reopened/deleted task.
 holdTasks=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));for(let i=0;i<60&&!heldTasks;i++)await page.waitForTimeout(50);if(!heldTasks)throw Error('No delayed task request');tasks=tasks.map(t=>({...t,status:"todo",bucket:"todo",completed_at:null,updated_at:"2026-10-11T02:00:00Z"}));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>document.querySelector('.grove-caption')?.textContent?.includes('quiet meadow'),null,{timeout:15000});
 await heldTasks.route.fulfill({json:{ok:true,data:{tasks:heldTasks.tasks}}});heldTasks=null;await page.waitForTimeout(1500);
 if(!(await page.locator('.grove-caption').textContent()).includes('quiet meadow'))throw Error('Old task snapshot resurrected a tree');
 // The most recent successful bookshelf survives a later unavailable response.
 books=[{id:'finished-book',completed_on:'2026-10-09'}];await refresh('day','quiet meadow');await page.waitForFunction(()=>Number(document.querySelector('.grove-page')?.dataset.wildlifeCount)>0,null,{timeout:15000});
 failBooks=true;const failuresBefore=failedBookResponses;await refresh('day','quiet meadow');if(failedBookResponses<=failuresBefore)throw Error('Failed book request not exercised');if(Number(await page.locator('.grove-page').getAttribute('data-wildlife-count'))===0)throw Error('Accepted books lost on unavailable refresh');failBooks=false;
 console.log('STEP latest snapshot and accepted books');
 // An old book response must not cancel a new route's active worker.
 holdBooks=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));for(let i=0;i<60&&!heldBooks;i++)await page.waitForTimeout(50);if(!heldBooks)throw Error('No delayed book request');
 await rememberCanvas();await page.evaluate(()=>location.hash='#/grove?view=year&date=2027-01-01');await page.waitForFunction(()=>groveWorldRequests.includes(2027),null,{timeout:15000});await heldBooks.fulfill({json:{ok:true,data:{books:[],placements:[]}}});heldBooks=null;await ready('year','2027');if((await page.locator('.grove-page').textContent()).includes('Could not prepare annual Grove'))throw Error('Obsolete books cancelled new route');
 console.log('STEP obsolete books');
 // Production—not only diagnostic—makes separate New Year geography explicit.
 await navigate('#/grove?view=week&date=2026-12-31','week','28/12/26');await page.waitForSelector('.grove-boundary:not([hidden])');if(!(await page.locator('.grove-boundary').textContent()).includes('2026')||!(await page.locator('.grove-boundary').textContent()).includes('2027'))throw Error('Missing annual ownership boundary');
 // Today must move the camera to the new annual clearing, as well as its caption.
 tasks=[{...task('year-end','2026-12-31'),updated_at:'2027-01-01T00:00:00Z'},{...task('new-year','2027-01-01'),completed_at:'2026-12-31T13:00:00Z',updated_at:'2027-01-01T00:00:00Z'}];
 await rememberCanvas();await page.evaluate(()=>{groveTestNow='2026-12-31T12:59:50Z';location.hash='#/grove';});await ready('day','Today 31/12/26');
 await rememberCanvas();await page.evaluate(()=>{groveTestNow='2026-12-31T13:00:01Z';document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('.grove-caption')?.textContent==='Today 01/01/27 · 1 tree',null,{timeout:15000});await ready('day','Today 01/01/27');
 if(!await page.locator('.grove-stage').evaluate(e=>{const r=e.getBoundingClientRect(),x=Number(e.dataset.pickX),y=Number(e.dataset.pickY);return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}))throw Error('Midnight camera stayed in prior annual landscape');
 console.log('STEP boundary and midnight camera');
 // The newest annual selection must win when a prior year's worker is interrupted.
 await rememberCanvas();await page.evaluate(()=>location.hash='#/grove?view=year&date=2028-01-01');await page.waitForFunction(()=>groveWorldRequests.includes(2028),null,{timeout:15000});
 await page.evaluate(()=>location.hash='#/grove?view=year&date=2029-01-01');await ready('year','2029');if(!(await page.locator('.grove-caption').textContent()).includes('2029'))throw Error('Interrupted annual selection replaced latest year');
 console.log('STEP rapid annual selection');
 // Home retains its healthy scene during a slow/failed automatic refresh.
 await page.goto(base+'/grove.html');await page.waitForSelector('#grove[data-state="ready"] canvas',{timeout:60000});await page.evaluate(()=>{globalThis.groveOriginalCanvas=document.querySelector('#grove canvas');});holdTasks=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));for(let i=0;i<60&&!heldTasks;i++)await page.waitForTimeout(50);if(!heldTasks)throw Error('No delayed Home task request');
 if(!await page.evaluate(()=>document.querySelector('#grove canvas')===groveOriginalCanvas))throw Error('Home removed healthy scene during slow refresh');await heldTasks.route.fulfill({status:503,json:{ok:false,error:'Temporary test failure'}});heldTasks=null;await page.waitForTimeout(800);if(!await page.evaluate(()=>document.querySelector('#grove canvas')===groveOriginalCanvas))throw Error('Home removed healthy scene on failed refresh');
 // No-WebGL devices receive a readable fallback without an unhandled rejection.
 await page.addInitScript(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:getContext.call(this,type,...args);};});
 await page.goto(base+'/grove.html');await page.waitForSelector('#grove[data-state="error"]',{timeout:60000});if(!(await page.locator('#grove').textContent()).includes('could not draw on this device')||await page.locator('#grove canvas').count())throw Error('Missing no-WebGL fallback');
 if(errors.length)throw Error(errors.join('\n'));await page.screenshot({path:out+'/phase5-'+name+'-'+width+'-home.png'});evidence.push({engine:name,width,midnight:true,pinnedHistory:true,latestTaskSnapshot:true,obsoleteBookResponse:true,newYearNotice:true,acceptedBooksPreserved:true,midnightCamera:true,rapidYearLatest:true,homePreserved:true,noWebGLFallback:true,errors});await page.close();console.log('PASS refresh '+name+' '+width);
 }}finally{await browser.close();}
}
await writeFile(out+'/phase5-refresh-evidence.json',JSON.stringify(evidence,null,2));

/** Local-only Bookshelf acceptance: real UI Save, rereading and R4 at 390px. */
import {chromium,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GROVE_BOOKS_BASE_URL || 'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use a local preview only');
const output=process.env.GROVE_REPORT_DIR || '/tmp/grove-books-report';await mkdir(output,{recursive:true});
const results=[];
for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const browser=await engine.launch({headless:true});
 try {for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('knowledge-hub:shelf-preview-v1',JSON.stringify({books:[{label:'Grove acceptance book',pages:300,reading:{page:120}}],placements:[]})));
  await page.goto(`${base}/#bookshelf/grove%20acceptance%20book`);
  const open=()=>page.getByRole('button',{name:'Book facts',exact:true}).click();await open();
  await page.locator('#facts-completed').fill('2026-10-01');await page.locator('#facts-paste').fill('');
  await page.locator('.shelf-sheet__fields').evaluate(s=>s.scrollTop=s.scrollHeight);
  const measure=await page.locator('.shelf-sheet--facts').evaluate(s=>({actions:[...s.querySelectorAll('.shelf-sheet__actions .btn')].map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,height:r.height,bottom:r.bottom,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}),fonts:[...s.querySelectorAll('input,select,textarea')].map(i=>parseFloat(getComputedStyle(i).fontSize)),overflow:document.documentElement.scrollWidth>innerWidth,height:innerHeight}));
  if(width===390 && (measure.actions.some(a=>a.height<44 || a.bottom>measure.height || !a.hit) || measure.fonts.some(f=>f<16) || measure.overflow))throw Error('R4 failed: '+JSON.stringify(measure));
  await page.screenshot({path:`${output}/books-finished-${name}-${width}.png`});
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.shelf-sheet--facts').waitFor({state:'hidden'});
  const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('knowledge-hub:shelf-preview-v1')).books[0]);
  if(finished.completed_on!=='2026-10-01' || finished.reading)throw Error('Finished book not saved correctly');
  await open();if(await page.locator('#facts-completed').inputValue()!=='2026-10-01')throw Error('Saved finish date disappeared');
  await page.locator('#facts-reading').check();await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.shelf-sheet--facts').waitFor({state:'hidden'});
  const reread=await page.evaluate(()=>JSON.parse(localStorage.getItem('knowledge-hub:shelf-preview-v1')).books[0]);
  if(reread.completed_on || !reread.reading)throw Error('Rereading did not clear finish date');
  if(errors.length)throw Error(errors.join('\n'));results.push({engine:name,width,r4:measure,finish:'saved and reloadable',rereading:'clears completion',errors});await page.close();console.log(`Checked book completion ${name} ${width}`);
 }}finally{await browser.close();}
}
await writeFile(`${output}/book-report.json`,JSON.stringify(results,null,2));

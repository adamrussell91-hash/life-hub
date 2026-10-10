import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server, browser, base;
before(async () => {
  browser = await chromium.launch({headless:true, ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
  server = createServer(async(req,res) => {
    try {
      const name = path.resolve(repo, '.' + new URL(req.url,'http://localhost').pathname);
      if (!name.startsWith(repo + '/')) {res.writeHead(403).end();return;}
      res.setHeader('content-type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(await readFile(name));
    } catch {res.writeHead(404).end();}
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening'); base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await browser?.close();server?.close();});
for (const width of [1280,390]) test(`compact Term scroll, alignment, routing and live refresh at ${width}px`, async()=>{
  const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page = await context.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  try {
    await page.goto(base+'/package.json');
    await page.setContent(`<link rel="stylesheet" href="${base}/packages/design-kit/tokens.css"><link rel="stylesheet" href="${base}/packages/design-kit/calendar-term-river.css"><link rel="stylesheet" href="${base}/packages/design-kit/calendar-tideline.css"><style>body{margin:12px;background:var(--paper)}button{font-family:var(--font-ui)}#calendar{width:100%;min-width:0}</style><main id="calendar"></main>`);
    await page.evaluate(async base=>{
      const {renderTermRiver}=await import(base+'/packages/design-kit/js/calendar/render-term-river.js');
      window.render=renderTermRiver;
      window.data={hub:'life',zoom:'term',today:'2026-10-14',terms:[{term:4,starts_on:'2026-10-12',ends_on:'2026-12-18'}],events:[
        ...Array.from({length:8},(_,i)=>({path:'task/'+i,record:{id:'task-'+i,type:'task',title:'A detailed task title that extends beyond a compact weekly row '+i,due_date:'2026-10-14',status:'open'}})),
        {record:{id:'project-1',type:'project',title:'Two week project',start_date:'2026-10-12',due_date:'2026-10-25'}},
        {record:{id:'appointment',type:'medical',title:'GP appointment',date:'2026-10-14'}},
        {record:{id:'sleep',type:'sleep',date:'2026-10-14',duration_h:8}}
      ],routeFor:item=>'/tasks/#/task/'+item.record.id,apiFetch:async()=>({ok:true,json:async()=>({})})};
      renderTermRiver(document,document.querySelector('#calendar'),window.data);
      window.__termRiver.finish();
    },base);
    const rows=page.locator('.tr-rows [data-lane="teacher"] .tr-rows__week').first().locator('button');
    assert.equal(await rows.count(),8);
    assert.equal(await rows.first().evaluate(n=>n.getBoundingClientRect().height),width===390?44:28);
    assert.ok(await page.locator('.tr-rows__scroll').evaluate(n=>n.scrollWidth>n.clientWidth));
    const alignment=await rows.first().evaluate(n=>[...n.children].map(c=>{const a=n.getBoundingClientRect(),b=c.getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)}));
    assert.ok(alignment.every(delta=>delta<1.1),JSON.stringify(alignment));
    if (process.env.TERM_CALENDAR_ARTIFACTS) {
      await mkdir(process.env.TERM_CALENDAR_ARTIFACTS, {recursive:true});
      await page.locator('#calendar').screenshot({path:path.join(process.env.TERM_CALENDAR_ARTIFACTS, `compact-term-${width}.png`)});
    }
    await rows.first().click();
    assert.match(await page.locator('[data-part="open-in-hub"]').getAttribute('href'),/task-0/);
    await page.locator('[data-card-close]').click();
    await page.locator('.tr-rows__scroll').hover();
    await page.mouse.wheel(500, 0);
    await page.waitForTimeout(250);
    assert.ok(await page.locator('.tr-rows__scroll').evaluate(n=>n.scrollLeft>0));
    await page.locator('.tr-rows__scroll').evaluate(n=>{n.scrollLeft=700});
    const before=await page.locator('.tr-rows__scroll').evaluate(n=>n.scrollLeft);
    const labelBefore=await page.locator('.tr-rows [data-lane="teacher"] .tr-rows__label').boundingBox();
    const oldCapacity=await page.evaluate(()=>window.__termRiver.capacity('2026-10-14'));
    await page.waitForTimeout(850);
    await page.evaluate(()=>{window.data.events.at(-1).record.duration_h=3;window.render(document,document.querySelector('#calendar'),window.data);window.__termRiver.finish()});
    assert.equal(await page.locator('.tr-rows__scroll').evaluate(n=>n.scrollLeft),before);
    const newCapacity=await page.evaluate(()=>window.__termRiver.capacity('2026-10-14'));
    assert.notEqual(newCapacity,oldCapacity);
    assert.ok((await page.locator('[data-part="capacity-value"]').textContent()).includes(newCapacity+'%'));
    const labelAfter=await page.locator('.tr-rows [data-lane="teacher"] .tr-rows__label').boundingBox();
    assert.equal(labelBefore.x,labelAfter.x);
    await page.locator('[data-today]').click();
    assert.equal(await page.locator('.tr-rows__scroll').evaluate(n=>n.scrollLeft),0);
    assert.ok(await page.locator('.tr-rows__capacity-line.is-forecast').count());
    assert.ok(await page.locator('.tr-rows__capacity-line.is-logged').count());
    assert.ok(await page.locator('.tr-legend').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});


test('title reading animates once and zoom settles without replaying entrance', async () => {
  const context = await browser.newContext({viewport:{width:1280,height:1000}});
  const page = await context.newPage();
  try {
    await page.goto(base+'/package.json');
    await page.setContent(`<link rel="stylesheet" href="${base}/packages/design-kit/tokens.css"><link rel="stylesheet" href="${base}/packages/design-kit/calendar-term-river.css"><main id="calendar"></main>`);
    await page.evaluate(async base=>{
      const {renderTermRiver}=await import(base+'/packages/design-kit/js/calendar/render-term-river.js');
      renderTermRiver(document,document.querySelector('#calendar'),{hub:'life',zoom:'term',today:'2026-10-14',terms:[{term:4,starts_on:'2026-10-12',ends_on:'2026-12-18'}],events:[{record:{id:'long',type:'task',title:'A title with enough words to extend beyond the available weekly row and need scrolling',due_date:'2026-10-14'}}]});
      window.__termRiver.finish();
    },base);
    const row=page.locator('.tr-rows [data-id="long"]');
    await row.focus();
    assert.equal(await row.locator('.tr-rows__title-text').evaluate(n=>getComputedStyle(n).animationIterationCount),'1');
    await page.waitForTimeout(900);
    const before=await row.locator('.tr-rows__title-text').evaluate(n=>getComputedStyle(n).transform);
    await page.waitForTimeout(1200);
    const after=await row.locator('.tr-rows__title-text').evaluate(n=>getComputedStyle(n).transform);
    assert.notEqual(after,before);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.tr-rows-tooltip').isVisible(),false);
    await page.evaluate(()=>window.__termRiver.setZoom('year'));
    await page.waitForTimeout(650);
    assert.ok(Math.abs(await page.evaluate(()=>window.__termRiver.blend())-1)<.001);
    const chart=await page.locator('[data-part="chart"]').evaluate(n=>{n.dataset.identity='same';return n.dataset.identity});
    await page.evaluate(()=>window.__termRiver.setZoom('term'));
    await page.waitForTimeout(650);
    assert.equal(await page.locator('[data-part="chart"]').getAttribute('data-identity'),chart);
    assert.equal(await page.locator('.tr-rows').isVisible(),true);
  } finally {await context.close();}
});

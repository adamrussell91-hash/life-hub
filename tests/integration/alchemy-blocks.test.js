import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
const {createAlchemyBlocksHandler}=await import('../../netlify/functions/alchemy-blocks.mjs').catch(()=>({}));
function setup(extra={}) {
 assert.equal(typeof createAlchemyBlocksHandler,'function'); const store=memoryAlchemyStore();
 const block={id:'b',type:'block',schema_version:1,block_type:'heading',visibility:'student_teacher',variant:'section',order:0,created_at:'2026-10-13T00:00:00Z',updated_at:'2026-10-13T00:00:00Z',content:{text:'Find the main idea'}};
 store.rows.set('lessons/l',{data:{id:'l',title:'Reading',unit_id:'u',blocks:[block]},etag:'0'});
 store.rows.set('units/u',{data:{id:'u',title:'Reading and interpretation',blocks:[]},etag:'0'});
 let calls=0;const deps={env:{LIFE_HUB_PASSPHRASE_HASH:'configured',SESSION_SECRET:'s'.repeat(32),ANTHROPIC_API_KEY:'test',ALCHEMY_PASSIVE_MODEL:'cheap'},getContentStore:async()=>store,verifySessionToken:t=>({valid:t==='ok'}),retrieve:async()=>[{id:'p',title:'Scaffolding',excerpt:'Model the process first.'}],getSource:async()=>({id:'p',title:'Scaffolding',body:'Model first'}),complete:async()=>{calls++;return {proposals:[{blockId:'b',rationale:'Model before independent work.',content:{text:'Watch a model, then find the main idea'},sourceIds:['p']}]};},...extra};
 const handler=createAlchemyBlocksHandler(deps);
 const req=(patch={},auth=true)=>new Request('https://api.example/api/alchemy-blocks',{method:'POST',headers:{'content-type':'application/json',...(auth?{cookie:'life_hub_session=ok'}:{})},body:JSON.stringify({kind:'lesson',id:'l',blocks:['b'],mode:'passive',...patch})});
 return {handler,req,store,calls:()=>calls};
}
test('authenticated analysis cites actual sources and caches same revision without another call',async()=>{
 const {handler,req,calls}=setup();assert.equal((await handler(req({},false))).status,401);
 const first=await handler(req());assert.equal(first.status,200);const d=(await first.json()).data;assert.equal(d.proposals[0].replacement.id,'b');assert.equal(d.proposals[0].sources[0].id,'p');
 assert.equal((await handler(req())).status,200);assert.equal(calls(),1);
});
test('deleted parent cannot reach retrieval or model',async()=>{
 const {handler,req,store,calls}=setup();store.rows.get('units/u').data.status='trashed';assert.equal((await handler(req())).status,404);assert.equal(calls(),0);
});
test('too many blocks and excessive instruction reject before inference',async()=>{
 const {handler,req,calls}=setup();assert.equal((await handler(req({blocks:['1','2','3','4','5']}))).status,400);assert.equal((await handler(req({instruction:'x'.repeat(9000)}))).status,400);assert.equal(calls(),0);
});
test('empty evidence caches successful no-suggestion result without synthesis',async()=>{
 const {handler,req,calls}=setup({retrieve:async()=>[]});const r=await handler(req());assert.equal(r.status,200);assert.deepEqual((await r.json()).data.proposals,[]);assert.equal(calls(),0);
});
test('invalid citations cannot become editable proposals',async()=>{
 const {handler,req}=setup({complete:async()=>({proposals:[{blockId:'b',rationale:'Invented',content:{text:'Changed',variant:'h2'},sourceIds:['missing']}]})});assert.equal((await handler(req())).status,502);
});
test('hanging upstream terminates and later attempts respect cooldown',async()=>{
 const {handler,req}=setup({deadlineMs:35,complete:async()=>new Promise(()=>{})});const r=await handler(req());assert.equal(r.status,504);assert.equal((await handler(req())).status,429);
});
test('rate-limit response preserves retry-after and does not retry provider',async()=>{
 let count=0;const {handler,req}=setup({complete:async()=>{count++;throw Object.assign(new Error('Limited'),{status:429,retryAfterMs:600000});}});const r=await handler(req());assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>=600);assert.equal((await handler(req())).status,429);assert.equal(count,1);
});
test('cached proposal cannot expose a deleted Knowledge source',async()=>{
 let live=true;const {handler,req}=setup({getSource:async()=>live?{id:'p',title:'Scaffolding',body:'Model first'}:{id:'p',status:'trashed'}});assert.equal((await handler(req())).status,200);live=false;const r=await handler(req());assert.equal(r.status,200);assert.deepEqual((await r.json()).data.proposals,[]);
});
test('acceptance validation rejects changed context without inference',async()=>{
 const {handler,req,store,calls}=setup();const r=await handler(req());const data=(await r.json()).data;store.rows.get('units/u').data.title='Changed';const check=await handler(req({validateOnly:true,contextRevision:data.contextRevision,sourceIds:['p']}));assert.equal(check.status,200);assert.equal((await check.json()).data.valid,false);assert.equal(calls(),1);
});
test('a hanging budget-finalisation store cannot extend the total deadline indefinitely',async()=>{
 const {handler,req,store}=setup({deadlineMs:60,complete:async()=>new Promise(()=>{})});const original=store.setJSON;store.setJSON=async(key,data,condition)=>{if(key.includes('operator-budget')&&!data.lease)return new Promise(()=>{});return original(key,data,condition);};const before=Date.now();assert.equal((await handler(req())).status,504);assert.ok(Date.now()-before<500);
});
test('malformed replacement cannot be cached as a successful assessment',async()=>{
 const {handler,req}=setup({complete:async()=>({proposals:[{blockId:'b',rationale:'Fix it',content:{},sourceIds:['p']}]})});
 assert.equal((await handler(req())).status,502);
});
test('a delayed duplicate cache miss cannot dispatch after the first result completes',async()=>{
 let releaseFirst,startedResolve;const started=new Promise(r=>startedResolve=r);let calls=0;
 const payload={proposals:[]};const {handler,req,store}=setup({complete:async()=>{calls++;if(calls===1){startedResolve();await new Promise(r=>releaseFirst=r);}return payload;}});
 const first=handler(req({mode:'manual'}));await started;
 const get=store.get;let reads=0,resume,pausedResolve;const paused=new Promise(r=>pausedResolve=r);
 store.get=async(key,options)=>{const value=await get(key,options);if(key.includes('/results/')&&++reads===2){pausedResolve();await new Promise(r=>resume=r);}return value;};
 const second=handler(req({mode:'manual'}));await paused;releaseFirst();assert.equal((await first).status,200);resume();assert.equal((await second).status,200);assert.equal(calls,1);
});
test('hanging Knowledge retrieval terminates without any provider call',async()=>{
 const {handler,req,calls}=setup({deadlineMs:35,retrieve:async()=>new Promise(()=>{})});assert.equal((await handler(req())).status,504);assert.equal(calls(),0);
});
test('a teacher click with no Knowledge match still asks Ann and accepts an uncited suggestion',async()=>{
 let prompt;const {handler,req,calls}=setup({retrieve:async()=>[],complete:async(args)=>{prompt=args.prompt;return {proposals:[{blockId:'b',rationale:'Name the skill.',content:{text:'Find the main idea, then justify it'},sourceIds:[]}]};}});
 const r=await handler(req({mode:'manual'}));assert.equal(r.status,200);const d=(await r.json()).data;assert.equal(d.proposals.length,1);assert.deepEqual(d.proposals[0].sources,[]);assert.match(prompt.system,/own teaching expertise/);assert.equal(calls(),0);
});
test('a background no-match result is not replayed to a teacher click',async()=>{
 let asked=0;const {handler,req}=setup({retrieve:async()=>[],complete:async()=>{asked++;return {proposals:[]};}});
 assert.equal((await handler(req())).status,200);assert.equal(asked,0);
 assert.equal((await handler(req({mode:'manual'}))).status,200);assert.equal(asked,1);
});
test('a slow Knowledge search does not stop a teacher click reaching Ann',async()=>{
 let asked=0;const {handler,req}=setup({retrievalMs:20,retrieve:async()=>new Promise(()=>{}),complete:async()=>{asked++;return {proposals:[]};}});
 assert.equal((await handler(req({mode:'manual'}))).status,200);assert.equal(asked,1);
});
test('a timeout pauses Ann for a minute, not the escalating lockout',async()=>{
 const {handler,req,store}=setup({deadlineMs:35,complete:async()=>new Promise(()=>{})});assert.equal((await handler(req())).status,504);
 const state=store.rows.get('alchemy/v1/operator-budget').data;assert.ok(state.cooldown-Date.now()<=60000);assert.equal(state.failures||0,0);
});

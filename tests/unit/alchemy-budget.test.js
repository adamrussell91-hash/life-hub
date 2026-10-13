import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
const { createAlchemyBudget } = await import('../../netlify/functions/_shared/alchemy-budget.mjs').catch(() => ({}));
function setup() { let clock = Date.parse('2026-10-13T00:00:00Z'); const store = memoryAlchemyStore(); assert.equal(typeof createAlchemyBudget, 'function'); return {store, budget:createAlchemyBudget(store, {now:()=>clock}), now:()=>clock, advance:ms=>clock+=ms}; }
test('simultaneous instances reserve only one operation and cache its result',async()=>{
 const {store,budget,now}=setup(); const other=createAlchemyBudget(store,{now});
 const replies=await Promise.allSettled([budget.reserve({key:'a',mode:'passive'}),other.reserve({key:'a',mode:'passive'})]);
 assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
 const ticket=replies.find(r=>r.status==='fulfilled').value;
 await budget.finish(ticket,{result:{proposals:[]},usage:{input:20,output:2}});
 assert.deepEqual(await budget.cached('a'),{proposals:[]});
});
test('six passive dispatches exhaust rolling hour; failed attempts count',async()=>{
 const {budget,advance}=setup();
 for(let i=0;i<6;i++){const t=await budget.reserve({key:String(i),mode:'passive'});await budget.finish(t,{result:{proposals:[]}});advance(180000);}
 await assert.rejects(budget.reserve({key:'seventh',mode:'passive'}),e=>e.code==='alchemy_budget');
 const manual=await budget.reserve({key:'manual',mode:'manual'}); await budget.finish(manual,{error:{status:504}});
 advance(3600000); assert.ok(await budget.reserve({key:'later',mode:'passive'}));
});
test('24 daily passive attempts stop work across rolling-hour resets',async()=>{
 const {budget,advance}=setup();
 for(let i=0;i<24;i++){const t=await budget.reserve({key:String(i),mode:'passive'}); await budget.finish(t,{result:{}});advance(i%6===5?3600000:180000);}
 await assert.rejects(budget.reserve({key:'25',mode:'passive'}),e=>e.code==='alchemy_budget');
});
test('provider retry-after and failures enforce cooldown, preserving reservations',async()=>{
 const {budget,advance}=setup();const t=await budget.reserve({key:'a',mode:'passive'}); await budget.finish(t,{error:{status:429,retryAfterMs:600000}});
 await assert.rejects(budget.reserve({key:'b',mode:'passive'}),e=>e.code==='alchemy_cooldown');
 advance(600001);assert.ok(await budget.reserve({key:'b',mode:'passive'}));
});
test('expired lease allows a later key; late completion cannot release its lease',async()=>{
 const {budget,advance}=setup(); const first=await budget.reserve({key:'a',mode:'manual'}); advance(30001); const second=await budget.reserve({key:'b',mode:'manual'});
 await budget.finish(first,{result:{old:true}});
 await assert.rejects(budget.reserve({key:'c',mode:'manual'}),e=>e.code==='alchemy_busy'); await budget.finish(second,{result:{new:true}});
});
test('store lacking conditional writes fails closed',async()=>{
 assert.equal(typeof createAlchemyBudget,'function'); const b=createAlchemyBudget({get:async()=>null,setJSON:async()=>undefined}); await assert.rejects(b.reserve({key:'a',mode:'passive'}));
});
